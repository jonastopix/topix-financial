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

import type { ImportResultat, Raekke, Tabel } from "@/lib/importEngine";

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

export type Gitter = {
  /** Kolonnenavne uden etiketkolonnen. */
  kolonner: string[];
  raekker: GitterRaekke[];
  /** Subtotaler og sektioner — rammen der beviser at filen blev forstået. */
  struktur: StrukturNote[];
  advarsler: string[];
};

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
  kolonner = Array.from({ length: bredde }, (_, i) => {
    const navn = kolonner[i];
    return navn && navn !== "" ? navn : `Kolonne ${i + 1}`;
  });

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

  const tilfoejNote = (raekke: GitterRaekke, note: string) => {
    raekke.bemaerkning = raekke.bemaerkning ? `${raekke.bemaerkning} · ${note}` : note;
  };
  const indenForTolerance = (sum: number, vaerdi: number): boolean =>
    Math.abs(sum - vaerdi) <= Math.max(2, Math.abs(vaerdi) * 0.005);

  // Dobbelttællings-værn: en post hvis etiket matcher en sektion eller
  // subtotal i en ANDEN tabel er med stor sandsynlighed samme størrelse
  // opgjort igen (nøgletals-resuméer, videreførte totaler). Motoren
  // foreslår, medlemmet retter — rækken forbliver medtaget (P1), aldrig
  // fravalgt i stilhed.
  for (const raekke of raekker) {
    const etiket = raekke.etiket.trim().toLowerCase();
    if (etiket === "") continue;
    const match = struktur.find(
      (s) => s.tabelIndex !== raekke.tabelIndex && s.etiket.trim().toLowerCase() === etiket,
    );
    if (match) {
      tilfoejNote(
        raekke,
        `Ligner totalen '${raekke.etiket.trim()}' i en anden del af filen — tages den med, tælles beløbet to gange`,
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
      tilfoejNote(
        raekke,
        "Ser ud til at være en total af de øvrige linjer — tages den med, tælles beløbet to gange",
      );
    }
  }

  // Forholdstals-værn: alle værdier numerisk ≤ 1 mens naborækkerne i samme
  // tabel taler i hundreder/tusinder — så er det en margin/brøk, ikke et
  // beløb. Kræver mindst én værdi FORSKELLIG fra nul (skærpelse ift.
  // bestillingen: rene nulrækker er tomme budgetlinjer, ikke forholdstal —
  // de har allerede deres egen bemærkning).
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
      tilfoejNote(raekke, "Ser ud til at være et forholdstal, ikke et beløb");
    }
  }

  return { kolonner, raekker, struktur, advarsler: [...resultat.advarsler] };
}

// ───────────────────────── Mutationer (immutable) ─────────────────────────

const kopiGitter = (g: Gitter): Gitter => ({
  kolonner: [...g.kolonner],
  raekker: g.raekker.map((r) => ({ ...r, vaerdier: [...r.vaerdier] })),
  struktur: g.struktur.map((s) => ({ ...s, daekker: s.daekker ? [...s.daekker] : undefined })),
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

// ───────────────────────── Opsummering ─────────────────────────

export function opsummer(gitter: Gitter): GitterOpsummering {
  const medtagne = gitter.raekker.filter((r) => r.medtag);
  const sum: (number | null)[] = gitter.kolonner.map((_, kolonne) => {
    let harVaerdi = false;
    let total = 0;
    for (const r of medtagne) {
      const v = r.vaerdier[kolonne];
      if (v !== null && v !== undefined) {
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
