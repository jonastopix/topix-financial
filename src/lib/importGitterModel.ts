/**
 * importGitterModel — gitterets maskinlag (docs/import-model-design.md §2, P1-P3).
 *
 * Oversætter import-motorens resultat til det redigerbare gitter der er
 * rygraden i alle importer (P2), og ejer alle ændringer af det. Ren logik,
 * ingen React, ingen I/O — komponenten (HbImportGitter) præsenterer kun.
 *
 * Besluttet form (2026-08-23):
 *   - Kun POSTER bliver rækker. Subtotaler og sektioner er struktur, ikke
 *     data — de vises som ramme og må ALDRIG importeres (dobbelttælling).
 *   - Alt er valgt til som udgangspunkt; motoren markerer det den tvivler
 *     på med en forklaring, og medlemmet fravælger (P1).
 *   - Ingen kategorikolonne — etiket og tal (P3; kategorier er spor 3).
 */

import {
  detekterTalKonvention,
  erMaanedsnavn,
  laesTal,
  type ImportResultat,
  type Matrix,
  type Raekke,
  type Tabel,
} from "@/lib/importEngine";

export type GitterRaekke = {
  raekkeIndex: number;
  etiket: string;
  vaerdier: (number | null)[];
  medtag: boolean;
  /** Motorens tvivl — ulæselige værdier, tomme linjer, dobbelttælling. */
  bemaerkning: string | null;
  /** Medlemmets egen fritekst fra en tekstkolonne — bevares altid (P3). */
  kommentar: string | null;
  /** Nærmeste sektionsoverskrift over rækken i samme tabel. */
  sektion: string | null;
  tabelIndex: number;
};

export type StrukturNote = {
  raekkeIndex: number;
  etiket: string;
  slags: "sektion" | "subtotal";
  daekker?: number[];
  tabelIndex: number;
};

/** Platformens seks gruppenøgler — samme union som BudgetCategory["group"]
    (budgetTemplates.ts:11). __group__-markører må ALDRIG bære andet. */
export type Gruppenoegle =
  | "indtaegter"
  | "variable"
  | "personale"
  | "faste"
  | "salg_marketing"
  | "drift";

export const GYLDIGE_GRUPPER: readonly Gruppenoegle[] = [
  "indtaegter",
  "variable",
  "personale",
  "faste",
  "salg_marketing",
  "drift",
];

/** Nøgle i sektionsGrupper: rækker uden sektion samles under "". */
export const sektionsNoegle = (sektion: string | null): string => sektion ?? "";

/** Forslag: frit sektionsnavn → gruppenøgle. Medlemmet kan altid ændre
    valget i gitteret — det her er kun forvalget. ("variable" matcher også
    det danske flertals-"Variable omkostninger", ikke kun "variabel".) */
export function gruppeForslag(sektion: string | null): Gruppenoegle {
  const navn = sektion ?? "";
  if (/omsætning|salg|indtægt|revenue|income|sales/i.test(navn)) return "indtaegter";
  if (/løn|medarbejder|personale|staff|payroll/i.test(navn)) return "personale";
  if (/marketing|reklame|kundepleje/i.test(navn)) return "salg_marketing";
  if (/lokale|husleje|kontor|facility|rent|bygning/i.test(navn)) return "faste";
  if (/variabel|variable|vareforbrug|direkte|cogs|fragt/i.test(navn)) return "variable";
  return "drift";
}

export type Gitter = {
  /** Kolonnenavne uden etiketkolonnen. */
  kolonner: string[];
  raekker: GitterRaekke[];
  /** Subtotaler og sektioner — rammen der beviser at filen blev forstået. */
  struktur: StrukturNote[];
  /** Gruppevalg pr. sektion (nøgle = sektionsNoegle; "" = uden sektion),
      initialiseret med gruppeForslag og ændret via saetSektionsgruppe. */
  sektionsGrupper: Record<string, Gruppenoegle>;
  /** "Ikke et budgetbeløb" pr. sektion (nøgle = sektionsNoegle) — en SEPARAT
      tilstand ved siden af gruppevalget, ALDRIG en gruppenøgle: den må
      hverken nå __group__-markørerne eller skriveplanen. Sektionens rækker
      fravælges (medtag false) men bliver stående i gitteret, så medlemmet
      kan se hvad der udelades og fortryde (P1). Forvalgt for
      nøgletals-sektioner; ændres via saetSektionUdeladt. */
  udeladteSektioner: Record<string, boolean>;
  advarsler: string[];
};

/** Er sektionen sat til "Ikke et budgetbeløb"? (Tåler gamle kladder uden
    feltet — de læses fra localStorage.) */
export function erSektionUdeladt(gitter: Gitter, sektion: string | null): boolean {
  return gitter.udeladteSektioner?.[sektionsNoegle(sektion)] === true;
}

/** Sektioner der forvælges som "Ikke et budgetbeløb": nøgletal er tal OM
    forretningen (MRR, ARR, abonnenter), ikke budgetbeløb — importeret som
    omkostninger flerdobler de månederne. */
const NOEGLETALS_SEKTION_RE = /nøgletal|noegletal|kpi|key figures|nøgletals/i;

/** Rækker hvis EGET værn allerede har talt: forholdstals-bemærkningen og
    dobbelttællings-bemærkningerne. De påvirkes ikke af sektionsvalget —
    deres egen tilstand står ved magt. */
const harEgetVaern = (raekke: GitterRaekke): boolean =>
  raekke.bemaerkning !== null &&
  (raekke.bemaerkning.includes("forholdstal") ||
    raekke.bemaerkning.includes("tælles beløbet to gange"));

/** Rækkens opløste gruppenøgle: medlemmets valg i gitteret, ellers forslaget. */
export function raekkeGruppe(gitter: Gitter, raekke: GitterRaekke): Gruppenoegle {
  return gitter.sektionsGrupper?.[sektionsNoegle(raekke.sektion)] ?? gruppeForslag(raekke.sektion);
}

/** DEN værdi medlemmet ser og der skrives — må IKKE rulles tilbage:
    gitteret gemmer filens rå fortegn (motoren læser trofast, og skifter
    medlemmet gruppen til Indtægter skal originalfortegnet kunne komme
    igen), men alle flader medlemmet ser (celler, summer) OG skriveplanen
    deler denne ENE regel: absolutværdi for alle grupper undtagen
    indtaegter. Platformens konvention er positive omkostninger (målt mod
    prod 2026-08-24: 2.221 positive beløb hos 12 virksomheder mod 228
    negative hos 1 — en import før normaliseringen), og medlemmet skal
    godkende præcis det der gemmes — aldrig se -200.000 og få 200.000. */
export function normaliseretVaerdi(
  gitter: Gitter,
  raekke: GitterRaekke,
  kolonne: number,
): number | null {
  const vaerdi = raekke.vaerdier[kolonne];
  if (vaerdi === null || vaerdi === undefined) return null;
  return raekkeGruppe(gitter, raekke) === "indtaegter" ? vaerdi : Math.abs(vaerdi);
}

export type GitterOpsummering = {
  medtaget: number;
  fravalgt: number;
  medBemaerkning: number;
  /** Kolonnesummer over medtagne rækker; null når ingen medtaget værdi findes. */
  sum: (number | null)[];
};

// ───────────────────────── Byg ─────────────────────────

/** En tabels talfelter for en række: felter minus tekstkolonner (kommentarer
    er ikke tal), i bevaret rækkefølge. */
function talFelter(raekke: Raekke, tabel: Tabel) {
  return raekke.felter.filter((_, idx) => !tabel.tekstKolonner.includes(idx));
}

/** Rækkens bevarede fritekst fra tabellens tekstkolonner. */
function tekstIndhold(raekke: Raekke, tabel: Tabel): string | null {
  const tekster = tabel.tekstKolonner
    .map((idx) => raekke.felter[idx])
    .filter((f) => f != null && f.kilde !== "tom" && f.raa.trim() !== "")
    .map((f) => f.raa.trim());
  return tekster.length > 0 ? tekster.join(" · ") : null;
}

/** Tvivls-bemærkningen for en post (P1: rækken er ALTID med — bemærkningen
    forklarer, den fravælger ikke). */
function tvivl(felter: { vaerdi: number | null; kilde: string; raa: string }[]): string | null {
  const ulaeselige = felter.filter((f) => f.kilde === "ulaeselig");
  if (ulaeselige.length > 0) {
    const raa = [...new Set(ulaeselige.map((f) => f.raa.trim()).filter(Boolean))];
    return `Kunne ikke læses: ${raa.join(", ")}`;
  }
  if (felter.every((f) => f.vaerdi === null)) return "Ingen tal i denne linje";
  if (felter.length > 0 && felter.every((f) => f.vaerdi === 0)) return "Alle måneder er nul";
  return null;
}

/** En tabels egne talkolonne-navne (uden etiketkolonnen, uden tekstkolonner). */
function tabelKolonneNavne(tabel: Tabel): string[] {
  return tabel.kolonneOverskrifter
    .slice(1)
    .filter((_, idx) => !tabel.tekstKolonner.includes(idx))
    .map((k) => k.trim());
}

/**
 * Kolonneplacering pr. tabel: har tabellen overskrifter, matches hver af
 * dens talkolonner på NAVN mod det fælles kolonnesæt (trimmet,
 * versalufølsomt) — en tabel med kun "Årstotal" må aldrig lande sine tal i
 * "Januar"-pladsen. Umatchede kolonner lægges i første ledige plads efter
 * de matchede. Tabeller uden overskrifter placeres positionelt.
 */
function kolonnePlads(tabel: Tabel, antal: number, faelles: string[]): number[] {
  if (tabel.kolonneOverskrifter.length <= 1) {
    return Array.from({ length: antal }, (_, i) => i);
  }
  const navne = tabelKolonneNavne(tabel).map((n) => n.toLowerCase());
  const faellesSmaa = faelles.map((n) => n.trim().toLowerCase());
  const brugt = new Set<number>();
  const plads: number[] = new Array(antal).fill(-1);

  for (let i = 0; i < antal; i++) {
    const navn = navne[i] ?? "";
    if (navn === "") continue;
    const j = faellesSmaa.findIndex((k, idx) => !brugt.has(idx) && k === navn);
    if (j >= 0) {
      plads[i] = j;
      brugt.add(j);
    }
  }
  for (let i = 0; i < antal; i++) {
    if (plads[i] !== -1) continue;
    let j = 0;
    while (j < faelles.length && brugt.has(j)) j++;
    if (j < faelles.length) {
      plads[i] = j;
      brugt.add(j);
    }
  }
  return plads;
}

/**
 * Bygger gitteret af motorens resultat. Kun poster bliver rækker; sektioner
 * og subtotaler lander i struktur. Flere tabeller flades til én liste med
 * tabelIndex bevaret; den bredeste tabel bestemmer kolonnetallet, tabeller
 * med overskrifter matches på kolonnenavn, og tomme pladser er null.
 */
export function byggGitter(resultat: ImportResultat): Gitter {
  const raekker: GitterRaekke[] = [];
  const struktur: StrukturNote[] = [];

  // Bredeste tabel (talkolonner efter fradrag af tekstkolonner) sætter bredden.
  const tabelBredde = (t: Tabel): number =>
    t.raekker.reduce((m, r) => Math.max(m, talFelter(r, t).length), 0);
  const bredde = resultat.tabeller.reduce((m, t) => Math.max(m, tabelBredde(t)), 0);

  // Kolonnenavne: den bredeste tabel MED overskrifter vinder (uden
  // etiketkolonnen); manglende navne efterfyldes som "Kolonne N".
  let kolonner: string[] = [];
  let bedsteBredde = -1;
  for (const t of resultat.tabeller) {
    const b = tabelBredde(t);
    if (t.kolonneOverskrifter.length > 1 && b > bedsteBredde) {
      bedsteBredde = b;
      kolonner = tabelKolonneNavne(t);
    }
  }
  const harNavn = Array.from({ length: bredde }, (_, i) => Boolean(kolonner[i] && kolonner[i] !== ""));
  kolonner = Array.from({ length: bredde }, (_, i) =>
    harNavn[i] ? kolonner[i] : `Kolonne ${i + 1}`,
  );

  resultat.tabeller.forEach((tabel, tabelIndex) => {
    const plads = kolonnePlads(tabel, tabelBredde(tabel), kolonner);
    let aktuelSektion: string | null = null;
    for (const raekke of tabel.raekker) {
      if (raekke.type === "sektion") {
        aktuelSektion = raekke.etiket;
        struktur.push({
          raekkeIndex: raekke.raekkeIndex,
          etiket: raekke.etiket,
          slags: "sektion",
          tabelIndex,
        });
        continue;
      }
      if (raekke.type === "subtotal") {
        struktur.push({
          raekkeIndex: raekke.raekkeIndex,
          etiket: raekke.etiket,
          slags: "subtotal",
          daekker: raekke.daekker,
          tabelIndex,
        });
        continue;
      }
      if (raekke.type !== "post") continue; // stoej: hverken data eller ramme

      const felter = talFelter(raekke, tabel);
      const vaerdier: (number | null)[] = new Array(bredde).fill(null);
      felter.forEach((f, i) => {
        const p = plads[i];
        if (p !== undefined && p >= 0 && p < bredde) vaerdier[p] = f.vaerdi;
      });

      raekker.push({
        raekkeIndex: raekke.raekkeIndex,
        etiket: raekke.etiket,
        vaerdier,
        medtag: true,
        bemaerkning: tvivl(felter),
        kommentar: tekstIndhold(raekke, tabel),
        sektion: aktuelSektion,
        tabelIndex,
      });
    }
  });

  // Tomme, unavngivne halekolonner: en kolonne uden navn fra en
  // overskriftsrække og uden en eneste værdi er filens tomme fyld — den
  // udelades helt. Navngivne kolonner bevares selv når de er tomme.
  const beholdes = kolonner.map(
    (_, i) => harNavn[i] || raekker.some((r) => r.vaerdier[i] !== null),
  );
  if (beholdes.some((b) => !b)) {
    kolonner = kolonner.filter((_, i) => beholdes[i]);
    for (const raekke of raekker) {
      raekke.vaerdier = raekke.vaerdier.filter((_, i) => beholdes[i]);
    }
  }

  const advarsler = [...resultat.advarsler];

  const tilfoejNote = (raekke: GitterRaekke, note: string) => {
    raekke.bemaerkning = raekke.bemaerkning ? `${raekke.bemaerkning} · ${note}` : note;
  };
  const indenForTolerance = (sum: number, vaerdi: number): boolean =>
    Math.abs(sum - vaerdi) <= Math.max(2, Math.abs(vaerdi) * 0.005);

  // Dobbelttællings-værn: en post hvis etiket matcher en sektion eller
  // subtotal i en ANDEN tabel er med stor sandsynlighed samme størrelse
  // opgjort igen (nøgletals-resuméer, videreførte totaler). Besluttet
  // 2026-08-24 efter første rigtige gennemløb (EBITDA −28 kr. fordi en
  // videreført total blev importeret trods rød advarsel): "alt er valgt
  // til" gælder TVIVL — for rækker vi er ret sikre på dobbelttæller, er
  // standardudfaldet forkert. De FRAVÆLGES; bemærkningen bliver stående
  // og forklarer hvorfor, og medlemmet kan vælge dem til igen.
  for (const raekke of raekker) {
    const etiket = raekke.etiket.trim().toLowerCase();
    if (etiket === "") continue;
    const match = struktur.find(
      (s) => s.tabelIndex !== raekke.tabelIndex && s.etiket.trim().toLowerCase() === etiket,
    );
    if (match) {
      raekke.medtag = false;
      tilfoejNote(
        raekke,
        `Fravalgt: ligner totalen '${raekke.etiket.trim()}' i en anden del af filen — tages den med, tælles beløbet to gange`,
      );
    }
  }

  // Total-af-alle-øvrige: en resultatlinje der spænder over flere tabeller
  // kan motorens sum-løkke ikke se — men i det flade gitter er den summen
  // af alt andet. Mindst to matchende kolonner og mindst én værdi over
  // tolerancen (|v| > 2), så nulrækker aldrig rammes.
  for (const raekke of raekker) {
    if (!raekke.vaerdier.some((v) => v !== null && Math.abs(v) > 2)) continue;
    let matchendeKolonner = 0;
    for (let k = 0; k < kolonner.length; k++) {
      const vaerdi = raekke.vaerdier[k];
      if (vaerdi === null) continue;
      let sum = 0;
      let harAndre = false;
      for (const anden of raekker) {
        if (anden === raekke) continue;
        const av = anden.vaerdier[k];
        if (av !== null) {
          sum += av;
          harAndre = true;
        }
      }
      if (harAndre && indenForTolerance(sum, vaerdi)) matchendeKolonner++;
    }
    if (matchendeKolonner >= 2) {
      // Samme beslutning som cross-table-værnet: sikker dobbelttælling
      // fravælges som standard.
      raekke.medtag = false;
      tilfoejNote(
        raekke,
        "Fravalgt: ser ud til at være en total af de øvrige linjer — tages den med, tælles beløbet to gange",
      );
    }
  }

  // Forholdstals-værn: alle værdier numerisk ≤ 1 mens naborækkerne i samme
  // tabel taler i hundreder/tusinder — så er det en margin/brøk, ikke et
  // beløb. Kræver mindst én værdi FORSKELLIG fra nul (skærpelse ift.
  // bestillingen: rene nulrækker er tomme budgetlinjer, ikke forholdstal —
  // de har allerede deres egen bemærkning). Et forholdstal er pr.
  // definition "ikke et budgetbeløb" og FRAVÆLGES som dobbelttællings-
  // rækkerne (besluttet 2026-08-24: før blev det holdt ude af gitterets
  // sum men alligevel skrevet — to steder afgjorde forskelligt om samme
  // række var et beløb). Rækken bliver stående og kan vælges til (P1);
  // medtag er derefter det ENE sted der afgør både sum og skrivning.
  for (const raekke of raekker) {
    const ikkeNull = raekke.vaerdier.filter((v): v is number => v !== null);
    if (ikkeNull.length === 0) continue;
    if (!ikkeNull.every((v) => Math.abs(v) <= 1)) continue;
    if (!ikkeNull.some((v) => v !== 0)) continue;
    const harStoreNaboer = raekker.some(
      (anden) =>
        anden !== raekke &&
        anden.tabelIndex === raekke.tabelIndex &&
        anden.vaerdier.some((v) => v !== null && Math.abs(v) > 100),
    );
    if (harStoreNaboer) {
      raekke.medtag = false;
      tilfoejNote(raekke, "Fravalgt: ser ud til at være et forholdstal, ikke et beløb");
    }
  }

  // Fortegns-advarsel: motoren kan ikke afgøre om positive omkostninger er
  // meningen — men den kan opdage mønstret. Én advarsel, uanset antal grupper.
  const OMKOSTNINGS_RE = /omkostning|udgift|forbrug|cost|expense/i;
  const positivOmkostningsgruppe = struktur.some((note) => {
    if (!OMKOSTNINGS_RE.test(note.etiket)) return false;
    const daekkede =
      note.slags === "subtotal"
        ? raekker.filter((r) => note.daekker?.includes(r.raekkeIndex))
        : raekker.filter((r) => r.tabelIndex === note.tabelIndex && r.sektion === note.etiket);
    if (daekkede.length === 0) return false;
    const sum = daekkede.reduce(
      (s, r) => s + r.vaerdier.reduce((a: number, v) => a + (v ?? 0), 0),
      0,
    );
    return sum > 0;
  });
  if (positivOmkostningsgruppe) {
    advarsler.push(
      "Omkostningerne står som positive tal i din fil. Tjek at fortegnene er som du vil have dem.",
    );
  }

  // Transponerings-advarsel: månedsnavne som ETIKETTER betyder næsten altid
  // at tabellen vender på tværs — måneder som rækker, kategorier som kolonner.
  const maanedsEtiketter = raekker.filter((r) => erMaanedsnavn(r.etiket)).length;
  if (maanedsEtiketter >= 8) {
    advarsler.push(
      "Det ser ud til at dine måneder står som rækker og kategorierne som kolonner. Tjek at tabellen vender rigtigt.",
    );
  }

  // Gruppevalg pr. sektion: forvalgt med gruppeForslag; medlemmet ændrer
  // via saetSektionsgruppe. Rækker uden sektion samles under "".
  const sektionsGrupper: Record<string, Gruppenoegle> = {};
  for (const raekke of raekker) {
    const noegle = sektionsNoegle(raekke.sektion);
    if (!(noegle in sektionsGrupper)) sektionsGrupper[noegle] = gruppeForslag(raekke.sektion);
  }

  // "Ikke et budgetbeløb" pr. sektion: nøgletals-sektioner forvælges som
  // udeladt — deres rækker fravælges, men bliver stående i gitteret så
  // medlemmet kan se hvad der udelades og fortryde (P1). Rækker med eget
  // værn (forholdstal, dobbelttælling) røres ikke.
  const udeladteSektioner: Record<string, boolean> = {};
  for (const raekke of raekker) {
    const noegle = sektionsNoegle(raekke.sektion);
    if (!(noegle in udeladteSektioner)) {
      udeladteSektioner[noegle] =
        raekke.sektion !== null && NOEGLETALS_SEKTION_RE.test(raekke.sektion);
    }
  }
  for (const raekke of raekker) {
    if (udeladteSektioner[sektionsNoegle(raekke.sektion)] && !harEgetVaern(raekke)) {
      raekke.medtag = false;
    }
  }

  return { kolonner, raekker, struktur, sektionsGrupper, udeladteSektioner, advarsler };
}

// ───────────────────────── Mutationer (immutable) ─────────────────────────

const kopiGitter = (g: Gitter): Gitter => ({
  kolonner: [...g.kolonner],
  raekker: g.raekker.map((r) => ({ ...r, vaerdier: [...r.vaerdier] })),
  struktur: g.struktur.map((s) => ({ ...s, daekker: s.daekker ? [...s.daekker] : undefined })),
  sektionsGrupper: { ...g.sektionsGrupper },
  // ?? {}: gamle localStorage-kladder er gemt uden feltet.
  udeladteSektioner: { ...(g.udeladteSektioner ?? {}) },
  advarsler: [...g.advarsler],
});

const opdaterRaekke = (
  gitter: Gitter,
  raekkeIndex: number,
  aendring: (r: GitterRaekke) => void,
): Gitter => {
  const ny = kopiGitter(gitter);
  const raekke = ny.raekker.find((r) => r.raekkeIndex === raekkeIndex);
  if (raekke) aendring(raekke);
  return ny;
};

export function saetMedtag(gitter: Gitter, raekkeIndex: number, medtag: boolean): Gitter {
  return opdaterRaekke(gitter, raekkeIndex, (r) => {
    r.medtag = medtag;
  });
}

export function saetVaerdi(
  gitter: Gitter,
  raekkeIndex: number,
  kolonne: number,
  vaerdi: number | null,
): Gitter {
  return opdaterRaekke(gitter, raekkeIndex, (r) => {
    if (kolonne >= 0 && kolonne < gitter.kolonner.length) r.vaerdier[kolonne] = vaerdi;
  });
}

export function saetEtiket(gitter: Gitter, raekkeIndex: number, etiket: string): Gitter {
  return opdaterRaekke(gitter, raekkeIndex, (r) => {
    r.etiket = etiket;
  });
}

/** Medlemmets gruppevalg for en sektion (null = rækkerne uden sektion). */
export function saetSektionsgruppe(
  gitter: Gitter,
  sektion: string | null,
  gruppe: Gruppenoegle,
): Gitter {
  const ny = kopiGitter(gitter);
  ny.sektionsGrupper[sektionsNoegle(sektion)] = gruppe;
  return ny;
}

/** "Ikke et budgetbeløb" for en sektion: alle sektionens rækker fravælges
    (og vælges til igen når valget fortrydes) — undtagen rækker med eget
    værn (forholdstal, dobbelttælling), hvis egen tilstand står ved magt.
    Rækkerne bliver stående i gitteret, så medlemmet kan se hvad der
    udelades og fortryde (P1). Tilstanden er IKKE en gruppenøgle og når
    aldrig __group__-markørerne eller skriveplanen. */
export function saetSektionUdeladt(
  gitter: Gitter,
  sektion: string | null,
  udeladt: boolean,
): Gitter {
  const ny = kopiGitter(gitter);
  const noegle = sektionsNoegle(sektion);
  ny.udeladteSektioner[noegle] = udeladt;
  for (const raekke of ny.raekker) {
    if (sektionsNoegle(raekke.sektion) !== noegle) continue;
    if (harEgetVaern(raekke)) continue;
    raekke.medtag = !udeladt;
  }
  return ny;
}

/** Fjerner rækken helt. Enhver række kan slettes — også importerede
    (designdokumentet §5: slette-værnet på manual_-rækker er en død ende). */
export function slet(gitter: Gitter, raekkeIndex: number): Gitter {
  const ny = kopiGitter(gitter);
  ny.raekker = ny.raekker.filter((r) => r.raekkeIndex !== raekkeIndex);
  return ny;
}

/** Indsætter en tom række efter den angivne (eller sidst). Nye rækker får
    negative raekkeIndex så de aldrig kolliderer med matrix-indeks. */
export function tilfoejRaekke(gitter: Gitter, efterRaekkeIndex: number): Gitter {
  const ny = kopiGitter(gitter);
  const mindste = ny.raekker.reduce((m, r) => Math.min(m, r.raekkeIndex), 0);
  const pos = ny.raekker.findIndex((r) => r.raekkeIndex === efterRaekkeIndex);
  const nabo = pos >= 0 ? ny.raekker[pos] : ny.raekker[ny.raekker.length - 1];
  const raekke: GitterRaekke = {
    raekkeIndex: Math.min(-1, mindste - 1),
    etiket: "",
    vaerdier: Array.from({ length: ny.kolonner.length }, () => null),
    medtag: true,
    bemaerkning: null,
    kommentar: null,
    sektion: nabo?.sektion ?? null,
    tabelIndex: nabo?.tabelIndex ?? 0,
  };
  ny.raekker.splice(pos >= 0 ? pos + 1 : ny.raekker.length, 0, raekke);
  return ny;
}

/**
 * Indsæt fra regneark (P2 — gitteret er rygraden netop fordi indsætning så
 * følger med). Teksten deles i rækker på \n og kolonner på \t (semikolon som
 * fallback uden tabs); tallene læses med motorens egen konventions-detektion
 * og laesTal, så indsatte tal følger PRÆCIS samme regler som importerede.
 * Indsættes der i kolonne 0 og kan blokkens første kolonne ikke læses som
 * tal, er den etiketter. Gitteret udvides med nye rækker (negative
 * raekkeIndex, sektion/tabelIndex arvet fra ankerrækken) når blokken er
 * højere end pladsen; værdier ud over kolonnetallet ignoreres. Muterer ikke
 * input.
 */
export function indsaetFraTekst(
  gitter: Gitter,
  fraRaekkeIndex: number,
  fraKolonne: number,
  tekst: string,
): Gitter {
  const ny = kopiGitter(gitter);

  const linjer = tekst.replace(/\r/g, "").split("\n");
  while (linjer.length > 0 && linjer[linjer.length - 1] === "") linjer.pop();
  if (linjer.length === 0) return ny;
  const skille = tekst.includes("\t") ? "\t" : ";";
  const blok = linjer.map((l) => l.split(skille));

  const startPos = ny.raekker.findIndex((r) => r.raekkeIndex === fraRaekkeIndex);
  if (startPos < 0) return ny;
  const anker = ny.raekker[startPos];

  const konvention = detekterTalKonvention(blok as Matrix);

  // Etiket-kolonne: kun ved indsætning i kolonne 0, og kun når INGEN ikke-tom
  // celle i blokkens første kolonne kan læses som tal.
  const foersteKolonne = blok.map((r) => (r[0] ?? "").trim());
  const erEtiketKolonne =
    fraKolonne === 0 &&
    foersteKolonne.some((c) => c !== "") &&
    foersteKolonne.every((c) => c === "" || laesTal(c, konvention).kilde === "ulaeselig");

  const vaerdiStart = erEtiketKolonne ? 0 : fraKolonne;
  let mindste = ny.raekker.reduce((m, r) => Math.min(m, r.raekkeIndex), 0);

  for (let i = 0; i < blok.length; i++) {
    let raekke = ny.raekker[startPos + i];
    if (!raekke) {
      // Blokken er højere end pladsen: udvid med tomme rækker under ankeret.
      mindste = Math.min(-1, mindste - 1);
      raekke = {
        raekkeIndex: mindste,
        etiket: "",
        vaerdier: Array.from({ length: ny.kolonner.length }, () => null),
        medtag: true,
        bemaerkning: null,
        kommentar: null,
        sektion: anker.sektion,
        tabelIndex: anker.tabelIndex,
      };
      ny.raekker.push(raekke);
    }

    const celler = erEtiketKolonne ? blok[i].slice(1) : blok[i];
    if (erEtiketKolonne) raekke.etiket = (blok[i][0] ?? "").trim();

    celler.forEach((celle, j) => {
      const kolonne = vaerdiStart + j;
      if (kolonne < 0 || kolonne >= ny.kolonner.length) return; // ud over kolonnetallet
      raekke.vaerdier[kolonne] = laesTal(String(celle), konvention).vaerdi;
    });
  }

  return ny;
}

// ───────────────────────── Opsummering ─────────────────────────

export function opsummer(gitter: Gitter): GitterOpsummering {
  // medtag er det ENE sted der afgør om en række tæller: forholdstal er
  // fravalgt fra byggGitter, og vælger medlemmet et til igen, tælles det
  // med her OG skrives — summen medlemmet ser er altid det der gemmes.
  const medtagne = gitter.raekker.filter((r) => r.medtag);
  const sum: (number | null)[] = gitter.kolonner.map((_, kolonne) => {
    let harVaerdi = false;
    let total = 0;
    for (const r of medtagne) {
      // Summen viser de NORMALISEREDE værdier — samme tal som skrives.
      const v = normaliseretVaerdi(gitter, r, kolonne);
      if (v !== null) {
        harVaerdi = true;
        total += v;
      }
    }
    return harVaerdi ? total : null;
  });

  return {
    medtaget: medtagne.length,
    fravalgt: gitter.raekker.length - medtagne.length,
    medBemaerkning: gitter.raekker.filter((r) => r.bemaerkning !== null).length,
    sum,
  };
}
