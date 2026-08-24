/**
 * importEngine — import-motorens maskinlag (docs/import-model-design.md §4).
 *
 * Motoren arbejder på en matrix (Celle[][]), aldrig på en fil — filindlæsning
 * er I/O og bor i kaldelaget (SheetJS/CSV leverer begge en matrix). Rene
 * funktioner uden side-effekter, samme mønster som opgaveEngine/budgetEngine.
 *
 * Principperne fra designdokumentet §2 som motoren bærer:
 *   P1 — ingen afvisning: laesMatrix returnerer ALTID et resultat; ulæselige
 *        celler kommer med som felter med kilde "ulaeselig", aldrig som fejl.
 *   P3 — linje-først: hver række bevarer medlemmets egen etiket ordret.
 *   P4 — tal-konventionen detekteres pr. FIL, aldrig antaget pr. celle, og
 *        rapporteres så den kan vises og overstyres.
 *   P5 — vokabularie-uafhængig: motoren kender ingen kategorier; klassificering
 *        af rækker sker på STRUKTUR (summer, ikke ordvalg).
 *
 * Ingen eksporteret funktion kaster.
 */

export type Celle = string | number | null;
export type Matrix = Celle[][];

export type TalKonvention = {
  tusind: "." | "," | " " | "ingen";
  decimal: "." | ",";
  sikkerhed: "hoej" | "lav";
};

export type Feltkilde = "tal" | "parentes" | "bindestreg" | "tom" | "procent" | "ulaeselig";

export type Felt = { vaerdi: number | null; kilde: Feltkilde; raa: string };

export type RaekkeType = "post" | "subtotal" | "sektion" | "stoej";

export type Raekke = {
  raekkeIndex: number;
  etiket: string;
  type: RaekkeType;
  felter: Felt[];
  daekker?: number[];
};

export type Tabel = {
  headerRaekke: number | null;
  kolonneOverskrifter: string[];
  foersteDataRaekke: number;
  sidsteDataRaekke: number;
  raekker: Raekke[];
  /** Fritekstkolonner (fx "Kommentar") — indeks relative til felter-arrayet,
      altså efter at etiketkolonnen (kolonne 0) er skåret fra. */
  tekstKolonner: number[];
};

export type ImportResultat = {
  konvention: TalKonvention;
  tabeller: Tabel[];
  advarsler: string[];
};

export type TabelGraense = {
  headerRaekke: number | null;
  foersteDataRaekke: number;
  sidsteDataRaekke: number;
  /** Sat når headeren er LÅNT fra en tidligere blok (en header-række uden
      egne datarækker). En lånt header viger for blokkens egen promoverede
      header i laesMatrix — et KPI-resumé med egen overskriftsrække må ikke
      arve månedskolonner det ikke har. */
  headerLaant?: boolean;
};

// ───────────────────────── Talkonvention (P4) ─────────────────────────

/** Hårdt mellemrum og smalle varianter normaliseres til alm. mellemrum. */
const normaliserMellemrum = (s: string): string => s.replace(/[\u00A0\u202F\u2009]/g, " ");

/** Valutategn og -koder der strippes før tal-læsning. */
const VALUTA_RE = /(kr\.?|dkk|eur|usd|[$€£])/gi;

/** Kandidat til konventions-afstemning: en streng der kun består af cifre og
    separatorer (efter strip af valuta, fortegn, parenteser og procent). */
function talKerne(raa: string): string | null {
  let s = normaliserMellemrum(raa).trim();
  if (!s) return null;
  s = s.replace(/^\(|\)$/g, "");
  s = s.replace(VALUTA_RE, "");
  s = s.replace(/%$/, "");
  s = s.replace(/^[+-]|[+-]$/g, "");
  s = s.trim();
  if (!/\d/.test(s)) return null;
  if (!/^[\d.,\s]+$/.test(s)) return null;
  return s;
}

/**
 * Konventionen er en egenskab ved FILEN, ikke ved cellen (P4).
 * Afgørende signaler pr. streng:
 *   - to eller flere af samme separatortegn → tegnet er tusindtalsseparator
 *     ("2,700,000" afgør sagen)
 *   - både punktum og komma → det højreste er decimaltegnet
 *   - ét separatortegn efterfulgt af 1-2 cifre → decimaltegn
 * Ét separatortegn efterfulgt af præcis tre cifre er TVETYDIGT og må aldrig
 * alene afgøre noget — hviler afgørelsen kun på dem, bliver sikkerhed "lav".
 * Flertalsafgørelse over hele matrixen.
 */
export function detekterTalKonvention(matrix: Matrix): TalKonvention {
  const tusindStemmer: Record<string, number> = {};
  const decimalStemmer: Record<string, number> = {};
  const tvetydige: Record<string, number> = {};
  const stem = (b: Record<string, number>, k: string) => {
    b[k] = (b[k] || 0) + 1;
  };

  if (Array.isArray(matrix)) {
    for (const raekke of matrix) {
      if (!Array.isArray(raekke)) continue;
      for (const celle of raekke) {
        if (typeof celle !== "string") continue;
        const kerne = talKerne(celle);
        if (kerne === null) continue;

        const punktummer = (kerne.match(/\./g) || []).length;
        const kommaer = (kerne.match(/,/g) || []).length;
        // Mellemrum mellem ciffergrupper tæller som separator-forekomster.
        const mellemrum = (kerne.match(/(?<=\d) (?=\d)/g) || []).length;

        // Mellemrum kan aldrig være decimaltegn.
        if (mellemrum >= 1) stem(tusindStemmer, " ");

        if (punktummer >= 1 && kommaer >= 1) {
          // Begge til stede: højreste er decimaltegnet.
          const sidstePunktum = kerne.lastIndexOf(".");
          const sidsteKomma = kerne.lastIndexOf(",");
          const dec = sidstePunktum > sidsteKomma ? "." : ",";
          const tus = dec === "." ? "," : ".";
          stem(decimalStemmer, dec);
          stem(tusindStemmer, tus);
          continue;
        }

        for (const tegn of [".", ","] as const) {
          const antal = tegn === "." ? punktummer : kommaer;
          if (antal === 0) continue;
          if (antal >= 2) {
            // Gentaget separator kan ikke være decimaltegn.
            stem(tusindStemmer, tegn);
          } else {
            const efter = kerne.slice(kerne.lastIndexOf(tegn) + 1).replace(/ /g, "");
            if (/^\d{3}$/.test(efter)) {
              stem(tvetydige, tegn); // "2,700" — kan være begge dele
            } else if (/^\d{1,2}$/.test(efter) || /^\d{4,}$/.test(efter)) {
              stem(decimalStemmer, tegn);
            }
          }
        }
      }
    }
  }

  const flertal = (b: Record<string, number>): string | null => {
    let bedste: string | null = null;
    let max = 0;
    for (const [k, v] of Object.entries(b)) {
      if (v > max) {
        max = v;
        bedste = k;
      }
    }
    return bedste;
  };

  const harAfgoerende =
    Object.keys(tusindStemmer).length > 0 || Object.keys(decimalStemmer).length > 0;

  let tusind: TalKonvention["tusind"];
  let decimal: TalKonvention["decimal"];
  let sikkerhed: TalKonvention["sikkerhed"];

  if (harAfgoerende) {
    const t = flertal(tusindStemmer);
    const d = flertal(decimalStemmer);
    if (t !== null && d !== null) {
      tusind = t as TalKonvention["tusind"];
      decimal = d as TalKonvention["decimal"];
      // Modstrid (samme tegn i begge roller) kan ikke læses entydigt.
      sikkerhed = tusind === (decimal as string) ? "lav" : "hoej";
      if (tusind === (decimal as string)) decimal = tusind === "." ? "," : ".";
    } else if (t !== null) {
      tusind = t as TalKonvention["tusind"];
      decimal = tusind === "." ? "," : ".";
      sikkerhed = "hoej";
    } else {
      decimal = d as TalKonvention["decimal"];
      tusind = decimal === "." ? "," : ".";
      sikkerhed = "hoej";
    }
  } else if (Object.keys(tvetydige).length > 0) {
    // Kun tvetydige forekomster: grupperingsmønstret (tre cifre) peger på
    // tusindtalsseparator, men det må ikke alene bære en sikker afgørelse.
    const t = flertal(tvetydige) as "." | ",";
    tusind = t;
    decimal = t === "." ? "," : ".";
    sikkerhed = "lav";
  } else {
    // Ingen separatorer overhovedet: intet at mislæse.
    tusind = "ingen";
    decimal = ",";
    sikkerhed = "hoej";
  }

  return { tusind, decimal, sikkerhed };
}

// ───────────────────────── Cellelæsning ─────────────────────────

/**
 * Læser én rå streng til et Felt under filens konvention. Kaster ALDRIG.
 * Parenteser og ledende/efterstillet minus giver negativt fortegn; valutategn
 * og (hårde) mellemrum strippes; bindestreg alene er nul; tom er null;
 * procent-endelse markeres som kilde "procent" med tallet som værdi.
 */
export function laesTal(raa: string, konvention: TalKonvention): Felt {
  try {
    const original = raa;
    let s = normaliserMellemrum(String(raa)).trim();

    if (s === "") return { vaerdi: null, kilde: "tom", raa: original };
    if (/^[-–—]$/.test(s)) return { vaerdi: 0, kilde: "bindestreg", raa: original };

    let negativ = false;
    if (/^\(.*\)$/.test(s)) {
      negativ = true;
      s = s.slice(1, -1).trim();
    }

    let procent = false;
    if (/%$/.test(s)) {
      procent = true;
      s = s.replace(/%$/, "").trim();
    }

    s = s.replace(VALUTA_RE, "").trim();

    if (/^-/.test(s)) {
      negativ = true;
      s = s.slice(1).trim();
    }
    if (/-$/.test(s)) {
      negativ = true;
      s = s.slice(0, -1).trim();
    }

    // Mellemrum optræder kun som tusindtalsseparator — strip altid.
    s = s.replace(/ /g, "");

    if (s === "" || !/^[\d.,]+$/.test(s)) {
      return { vaerdi: null, kilde: "ulaeselig", raa: original };
    }

    if (konvention.tusind === "." || konvention.tusind === ",") {
      s = s.split(konvention.tusind).join("");
    }
    if (konvention.decimal === ",") s = s.replace(",", ".");

    if (!/^\d+(\.\d+)?$/.test(s)) {
      return { vaerdi: null, kilde: "ulaeselig", raa: original };
    }

    const tal = parseFloat(s);
    if (!Number.isFinite(tal)) return { vaerdi: null, kilde: "ulaeselig", raa: original };

    const vaerdi = negativ ? -tal : tal;
    const kilde: Feltkilde = procent ? "procent" : negativ && original.trim().startsWith("(") ? "parentes" : "tal";
    return { vaerdi, kilde, raa: original };
  } catch {
    return { vaerdi: null, kilde: "ulaeselig", raa: String(raa) };
  }
}

// ───────────────────────── Tabelgrænser ─────────────────────────

const MAANED_DEL =
  "jan(?:uar)?|feb(?:ruar)?|mar(?:ts|ch)?|apr(?:il)?|maj|may|jun[ie]?|jul[iy]?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MAANEDER_RE = new RegExp(`^(${MAANED_DEL})\\.?$`, "i");
/** Måneds-interval: to månedsnavne adskilt af bindestreg eller skråstreg. */
const MAANED_INTERVAL_RE = new RegExp(
  `^(?:${MAANED_DEL})\\.?\\s*[-/]\\s*(?:${MAANED_DEL})\\.?$`,
  "i",
);
const HALVAAR_RE = /^([12]\.?\s*halvår|h[12])$/i;
const KVARTAL_RE = /^q[1-4]$/i;
const AARSTAL_RE = /^(19|20)\d{2}$/;
const TOTAL_RE = /^(i\s*alt|total|sum|ytd|år\s*til\s*dato)$/i;

/** Er teksten et månedsnavn (evt. med periodesuffiks som "Januar-26")?
    Eksporteret så gitteret kan genkende transponerede tabeller. */
export function erMaanedsnavn(tekst: string): boolean {
  const s = tekst.trim().replace(/[\s\-/.]+(\d{4}|\d{2})$/, "");
  return MAANEDER_RE.test(s);
}

const MAANED_NAVNE: string[][] = [
  ["jan", "januar"],
  ["feb", "februar"],
  ["mar", "marts", "march"],
  ["apr", "april"],
  ["maj", "may"],
  ["jun", "juni", "june"],
  ["jul", "juli", "july"],
  ["aug", "august"],
  ["sep", "september"],
  ["okt", "oktober", "oct", "october"],
  ["nov", "november"],
  ["dec", "december"],
];

/** Månedsnavn → 0-baseret månedsindeks ("Januar-26" → 0, "may" → 4); null
    når teksten ikke er et månedsnavn. Eksporteret til skrivevejens
    kolonnetolkning — samme navnesæt som MAANEDER_RE. */
export function maanedsIndeks(tekst: string): number | null {
  const s = tekst
    .trim()
    .replace(/[\s\-/.]+(\d{4}|\d{2})$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  const idx = MAANED_NAVNE.findIndex((navne) => navne.includes(s));
  return idx >= 0 ? idx : null;
}

/** Ligner cellen en periode-overskrift (månedsnavn, kvartal, årstal, total)?
    Månedsnavne må bære et valgfrit suffiks: separator (bindestreg, skråstreg,
    punktum eller mellemrum) + 2 eller 4 cifre — "Januar-26", "jan/2026",
    "Marts.26", "Maj 2026". Versalufølsomt som hidtil. */
function erPeriodeOverskrift(celle: Celle): boolean {
  if (celle == null) return false;
  const s = String(celle).trim();
  if (!s) return false;
  const kerne = s.replace(/[\s\-/.]+(\d{4}|\d{2})$/, ""); // "Januar-26" → "Januar"
  return (
    MAANEDER_RE.test(kerne) ||
    MAANED_INTERVAL_RE.test(s) || // "Jan-feb", "maj/jun"
    HALVAAR_RE.test(s) || // "1. halvår", "H2"
    KVARTAL_RE.test(s) ||
    AARSTAL_RE.test(s) ||
    TOTAL_RE.test(s)
  );
}

/** En header-række har flere (≥2) tekstceller der ligner perioder. */
function erHeaderRaekke(raekke: Celle[] | undefined): boolean {
  if (!Array.isArray(raekke)) return false;
  return raekke.filter(erPeriodeOverskrift).length >= 2;
}

const erTomRaekke = (raekke: Celle[] | undefined): boolean =>
  !Array.isArray(raekke) ||
  raekke.every((c) => c == null || String(c).trim() === "");

/** Har rækken mindst én celle med cifre (tal eller tal-agtig streng)? */
function harTalCelle(raekke: Celle[] | undefined): boolean {
  if (!Array.isArray(raekke)) return false;
  return raekke.some(
    (c) => typeof c === "number" || (typeof c === "string" && /\d/.test(c)),
  );
}

/**
 * Finder tabelgrænser i matrixen. En fil kan indeholde flere tabeller:
 * matrixen deles i blokke ved tomme rækker; i hver blok starter en tabel ved
 * en header-række (og slutter ved blokkens udløb eller ved næste header).
 * Rækker over blokkens første header hører ikke til nogen tabel. En blok
 * UDEN header men MED talrækker er også en tabel (headerRaekke null) — fx et
 * nøgletals-resumé uden periodekolonner.
 *
 * Ender en blok med en header-række UDEN datarækker under sig, kasseres
 * headeren ikke: den knyttes til de FØLGENDE blokke med tal — også hen over
 * en eller flere tomme rækker, og til dem alle indtil en ny header-række
 * findes. Det er virkeligheden i mange budgetark: én månedsoverskrift
 * øverst, en tom række, og derefter flere sektionsblokke.
 */
export function findTabeller(matrix: Matrix): TabelGraense[] {
  const graenser: TabelGraense[] = [];
  if (!Array.isArray(matrix) || matrix.length === 0) return graenser;

  // Del i blokke af sammenhængende ikke-tomme rækker.
  const blokke: Array<{ start: number; slut: number }> = [];
  let start: number | null = null;
  for (let r = 0; r < matrix.length; r++) {
    if (erTomRaekke(matrix[r])) {
      if (start !== null) blokke.push({ start, slut: r - 1 });
      start = null;
    } else if (start === null) {
      start = r;
    }
  }
  if (start !== null) blokke.push({ start, slut: matrix.length - 1 });

  // En header uden datarækker under sig venter på de næste blokke med tal.
  let ventendeHeader: number | null = null;

  for (const blok of blokke) {
    const headere: number[] = [];
    for (let r = blok.start; r <= blok.slut; r++) {
      if (erHeaderRaekke(matrix[r])) headere.push(r);
    }

    if (headere.length === 0) {
      // Blok uden egen header: en tabel hvis der er tal at vise, ellers støj
      // (titel-/tekstblokke bliver ikke til tabeller). En ventende header
      // gælder blokken — og forbruges ikke: den gælder alle følgende blokke
      // indtil en ny header-række findes.
      let harTal = false;
      for (let r = blok.start; r <= blok.slut; r++) {
        if (harTalCelle(matrix[r])) harTal = true;
      }
      if (harTal) {
        graenser.push({
          headerRaekke: ventendeHeader,
          foersteDataRaekke: blok.start,
          sidsteDataRaekke: blok.slut,
          ...(ventendeHeader !== null ? { headerLaant: true } : {}),
        });
      }
      continue;
    }

    // Blok med headere: én tabel pr. header; rækker over blokkens første
    // header hører ikke til nogen tabel. En ny header afløser altid den
    // ventende — headere med datarækker nulstiller, en afsluttende header
    // uden datarækker bliver den nye ventende.
    for (let h = 0; h < headere.length; h++) {
      const header = headere[h];
      const sidste = h + 1 < headere.length ? headere[h + 1] - 1 : blok.slut;
      if (header + 1 > sidste) {
        ventendeHeader = header; // header uden datarækker: vent på næste blok
        continue;
      }
      ventendeHeader = null;
      graenser.push({
        headerRaekke: header,
        foersteDataRaekke: header + 1,
        sidsteDataRaekke: sidste,
      });
    }
  }

  return graenser;
}

// ───────────────────────── Rækkeklassificering ─────────────────────────

/** Sum-tolerance pr. kolonne: 2 absolut eller 0,5 % relativt, størst vinder. */
const indenForTolerance = (sum: number, vaerdi: number): boolean =>
  Math.abs(sum - vaerdi) <= Math.max(2, Math.abs(vaerdi) * 0.005);

const harTal = (r: Raekke): boolean => r.felter.some((f) => f.vaerdi !== null);
const harEtiket = (r: Raekke): boolean => r.etiket.trim() !== "";

/** Etiket-ord der STØTTER en subtotal-dom — aldrig afgør den alene. */
const STOETTE_ETIKET_RE = /(^|\s)(subtotal|i alt|ialt|total|sum)(\s|$)/i;

/**
 * Klassificerer rækker på STRUKTUR, ikke ordvalg (design §4.4):
 *   subtotal — værdierne svarer til summen af en sammenhængende blok rækker
 *              over den, i ALLE rækkens talkolonner (ét tilfældigt sammenfald
 *              i én kolonne holder ikke over tolv). Tidligere fundne
 *              subtotaler springes over i summen (de gentager posterne) og
 *              registreres ikke i daekker. Har rækken KUN ÉN talkolonne, er
 *              strukturen ét muligt tilfældigt sammenfald og bærer ikke
 *              dommen alene — dér kræves i TILLÆG at etiketten støtter
 *              (STOETTE_ETIKET_RE). Ordet afgør stadig aldrig alene: der
 *              skal to signaler til, ikke ét.
 *   sektion  — etiket uden indhold i felterne, med MINDST ÉN senere række
 *              med tal i tabellen (overskrifter kan ligge i lag — "Fixed
 *              Expenses" over seks under-sektioner).
 *   stoej    — hverken etiket eller indhold; eller en afsluttende
 *              etiketrække uden tal efter sig (en note).
 *   post     — alt andet. En række med etiket og indhold der ikke kunne
 *              læses som tal ("3.6x") er en POST med ulæselige værdier,
 *              aldrig støj — medlemmets linje må ikke forsvinde (P1/P3).
 * Muterer ikke input; returnerer nye række-objekter.
 */
export function klassificerRaekker(raekker: Raekke[]): Raekke[] {
  const resultat: Raekke[] = raekker.map((r) => ({ ...r, felter: r.felter.map((f) => ({ ...f })) }));

  for (let i = 0; i < resultat.length; i++) {
    const raekke = resultat[i];

    if (!harTal(raekke)) {
      // P1: indhold der ikke kunne læses som tal er stadig indhold — rækken
      // er en post med ulæselige værdier, aldrig støj.
      const harIndhold = raekke.felter.some((f) => f.kilde !== "tom");
      if (harIndhold) {
        raekke.type = "post";
        continue;
      }
      if (!harEtiket(raekke)) {
        raekke.type = "stoej";
        continue;
      }
      // Etiket uden indhold: sektion hvis NOGEN senere række i tabellen har
      // tal — ikke kun den umiddelbart næste (indlejrede overskrifter).
      raekke.type = resultat.slice(i + 1).some((r) => harTal(r)) ? "sektion" : "stoej";
      continue;
    }

    // Række med tal: subtotal-kandidat mod sammenhængende post-blok ovenfor.
    const talKolonner = raekke.felter
      .map((f, idx) => ({ f, idx }))
      .filter(({ f }) => f.vaerdi !== null);

    // Et strukturelt match er kun bevis når det er INFORMATIVT: mindst én af
    // kandidatens talkolonner skal ligge numerisk over tolerancen (|v| > 2).
    // Ellers er |0 − 0| ≤ 2 altid sandt, og rigtige nulrækker ville
    // forsvinde som subtotaler — tavst datatab. Uden informativ kolonne,
    // eller med kun én talkolonne, kræves etiket-støtte i tillæg.
    const informativ = talKolonner.some(({ f }) => Math.abs(f.vaerdi as number) > 2);
    const kraevEtiketStoette = talKolonner.length === 1 || !informativ;
    const etiketStoetter = STOETTE_ETIKET_RE.test(raekke.etiket);

    let daekker: number[] | null = null;
    const sum = new Array<number>(raekke.felter.length).fill(0);
    const blok: number[] = [];

    for (let j = i - 1; j >= 0 && !(kraevEtiketStoette && !etiketStoetter); j--) {
      const over = resultat[j];
      if (over.type === "subtotal") continue; // gentager posterne — spring over
      // Sektioner/støj/ulæselige poster bidrager nul og bryder IKKE blokken —
      // kun toppen af tabellen stopper løkken. Det er kravet om match i ALLE
      // kandidatens talkolonner (og etiket-støtten ved én kolonne) der værner
      // mod tilfældige sammenfald i de lange blokke.
      if (!harTal(over)) continue;
      blok.push(j);
      for (const { idx } of talKolonner) {
        sum[idx] += over.felter[idx]?.vaerdi ?? 0;
      }
      if (blok.length >= 2) {
        const match = talKolonner.every(({ f, idx }) => indenForTolerance(sum[idx], f.vaerdi as number));
        if (match) {
          daekker = [...blok].reverse();
          break; // mindste matchende blok vinder
        }
      }
    }

    if (daekker) {
      raekke.type = "subtotal";
      raekke.daekker = daekker.map((j) => resultat[j].raekkeIndex);
    } else {
      raekke.type = "post";
    }
  }

  // Pass 2 — totaler der står OVER deres detaljer (total-øverst-layouts):
  // rækker der stadig er poster prøves NEDAD. Samme krav som opad — alle
  // talkolonner skal stemme, mindst to rækker, informativitets-kravet og
  // etiket-støtten — men med GRUPPE-semantik: en total-over dækker HELE
  // blokken under sig, indtil næste subtotal, næste sektion eller
  // tabellens slutning. Præfiks-match er bevidst fravalgt: i Remm-filen
  // summer "Shopify App, Contribe" (-200) tilfældigt Hideapp (-75) +
  // JudgeMe (-125) i alle tolv måneder — en ægte medlemslinje ville
  // forsvinde som subtotal, hvis et delvist match talte som bevis.
  for (let i = 0; i < resultat.length; i++) {
    const raekke = resultat[i];
    if (raekke.type !== "post" || !harTal(raekke)) continue;

    const talKolonner = raekke.felter
      .map((f, idx) => ({ f, idx }))
      .filter(({ f }) => f.vaerdi !== null);
    const informativ = talKolonner.some(({ f }) => Math.abs(f.vaerdi as number) > 2);
    const kraevEtiketStoette = talKolonner.length === 1 || !informativ;
    if (kraevEtiketStoette && !STOETTE_ETIKET_RE.test(raekke.etiket)) continue;

    const sum = new Array<number>(raekke.felter.length).fill(0);
    const blok: number[] = [];

    for (let j = i + 1; j < resultat.length; j++) {
      const under = resultat[j];
      if (under.type === "subtotal" || under.type === "sektion") break; // gruppens ende
      if (!harTal(under)) continue; // støj/ulæselig-post bidrager nul
      blok.push(j);
      for (const { idx } of talKolonner) {
        sum[idx] += under.felter[idx]?.vaerdi ?? 0;
      }
    }

    const match =
      blok.length >= 2 &&
      talKolonner.every(({ f, idx }) => indenForTolerance(sum[idx], f.vaerdi as number));
    if (match) {
      raekke.type = "subtotal";
      raekke.daekker = blok.map((j) => resultat[j].raekkeIndex);
    }
  }

  return resultat;
}

// ───────────────────────── Topfunktion (P1) ─────────────────────────

/** Celle → Felt. Talceller er allerede tal; strenge går gennem laesTal. */
function celleTilFelt(celle: Celle, konvention: TalKonvention): Felt {
  if (celle == null) return { vaerdi: null, kilde: "tom", raa: "" };
  if (typeof celle === "number") {
    return Number.isFinite(celle)
      ? { vaerdi: celle, kilde: "tal", raa: String(celle) }
      : { vaerdi: null, kilde: "ulaeselig", raa: String(celle) };
  }
  return laesTal(celle, konvention);
}

/**
 * Topfunktionen: matrix → resultat. Returnerer ALTID et resultat, aldrig en
 * fejl (P1). Kolonne 0 er etiketkolonnen (bevares ordret, P3); resten er
 * felter. Findes ingen tabelgrænser i en ikke-tom matrix, lander alle
 * ikke-tomme rækker i én headerløs tabel så intet går tabt.
 */
export function laesMatrix(matrix: Matrix): ImportResultat {
  try {
    if (!Array.isArray(matrix) || matrix.length === 0) {
      return {
        konvention: { tusind: "ingen", decimal: ",", sikkerhed: "hoej" },
        tabeller: [],
        advarsler: [],
      };
    }

    const konvention = detekterTalKonvention(matrix);
    const advarsler: string[] = [];

    let graenser = findTabeller(matrix);
    if (graenser.length === 0 && matrix.some((r) => !erTomRaekke(r))) {
      const ikkeTomme = matrix
        .map((_, r) => r)
        .filter((r) => !erTomRaekke(matrix[r]));
      graenser = [
        {
          headerRaekke: null,
          foersteDataRaekke: ikkeTomme[0],
          sidsteDataRaekke: ikkeTomme[ikkeTomme.length - 1],
        },
      ];
      advarsler.push("Ingen tabelstruktur genkendt — alle rækker vises som de er");
    }

    let ulaeselige = 0;
    const tabeller: Tabel[] = graenser.map((g) => {
      let raekker: Raekke[] = [];
      for (let r = g.foersteDataRaekke; r <= g.sidsteDataRaekke; r++) {
        const raaRaekke = Array.isArray(matrix[r]) ? matrix[r] : [];
        const felter = raaRaekke.slice(1).map((c) => celleTilFelt(c, konvention));
        raekker.push({
          raekkeIndex: r,
          etiket: raaRaekke[0] == null ? "" : String(raaRaekke[0]),
          type: "post",
          felter,
        });
      }

      // Header-promovering i headerløse tabeller: blandt de FØRSTE TRE
      // datarækker bliver den første række med ikke-tom tekst i kolonne 0
      // OG tekst (ikke tal — kilde "ulaeselig") i mindst én anden kolonne,
      // og tal i rækkerne under, til overskriftsrække; rækkerne over den
      // droppes som titelrækker. En sektionsoverskrift har kun tekst i
      // kolonne 0 og rammes ikke. Kravet om tekst i kolonne 0 er lempet for
      // kandidater med mindst TO periode-overskrifter i de øvrige kolonner
      // (en månedsrække med tom etiketcelle er stadig en overskrift); for
      // kandidater uden periode-kolonner ("KPI, Årstotal, Kommentar")
      // gælder kravet fortsat. En LÅNT header (fra en tidligere bloks
      // header-række uden datarækker) viger for blokkens egen promoverede
      // header — findes ingen kandidat, beholdes den lånte.
      let headerRaekke = g.headerRaekke;
      let foersteDataRaekke = g.foersteDataRaekke;
      if ((headerRaekke === null || g.headerLaant) && raekker.length >= 2) {
        for (let k = 0; k < Math.min(3, raekker.length - 1); k++) {
          const kandidat = raekker[k];
          const tekstIAndenKolonne = kandidat.felter.some((f) => f.kilde === "ulaeselig");
          const periodeKolonner = kandidat.felter.filter((f) =>
            erPeriodeOverskrift(f.raa),
          ).length;
          const talNedenunder = raekker
            .slice(k + 1)
            .some((r) => r.felter.some((f) => f.vaerdi !== null));
          const kandidatOk =
            periodeKolonner >= 2 || (kandidat.etiket.trim() !== "" && tekstIAndenKolonne);
          if (kandidatOk && talNedenunder) {
            headerRaekke = kandidat.raekkeIndex;
            raekker = raekker.slice(k + 1);
            foersteDataRaekke = raekker[0].raekkeIndex;
            break;
          }
        }
      }

      // Tekstkolonner (P1/P3): en kolonne hvor mindst 60 % af datarækkerne
      // har en ikke-tom celle og INGEN af de ikke-tomme kan læses som tal,
      // er fritekst (fx "Kommentar"). Felterne bevares urørt så gitteret kan
      // vise indholdet — men de tæller ikke som ulæselige tal og udløser
      // ingen advarsel.
      const antalKolonner = raekker.reduce((m, r) => Math.max(m, r.felter.length), 0);
      const tekstKolonner: number[] = [];
      for (let c = 0; c < antalKolonner; c++) {
        const ikkeTomme = raekker
          .map((r) => r.felter[c])
          .filter((f): f is Felt => f != null && f.kilde !== "tom");
        if (
          raekker.length > 0 &&
          ikkeTomme.length > 0 &&
          ikkeTomme.length >= raekker.length * 0.6 &&
          ikkeTomme.every((f) => f.vaerdi === null)
        ) {
          tekstKolonner.push(c);
        }
      }

      for (const raekke of raekker) {
        raekke.felter.forEach((f, c) => {
          if (f.kilde === "ulaeselig" && !tekstKolonner.includes(c)) ulaeselige++;
        });
      }

      const headerKilde = headerRaekke !== null ? matrix[headerRaekke] : null;
      const headerCeller = Array.isArray(headerKilde)
        ? headerKilde.map((c) => (c == null ? "" : String(c)))
        : [];
      return {
        headerRaekke,
        kolonneOverskrifter: headerCeller,
        foersteDataRaekke,
        sidsteDataRaekke: g.sidsteDataRaekke,
        raekker: klassificerRaekker(raekker),
        tekstKolonner,
      };
    });

    if (konvention.sikkerhed === "lav") {
      advarsler.push("Talkonventionen er usikker — kontrollér tusind- og decimaltegn");
    }
    if (ulaeselige > 0) {
      advarsler.push(`${ulaeselige} celle${ulaeselige === 1 ? "" : "r"} kunne ikke læses som tal og skal efterses`);
    }

    return { konvention, tabeller, advarsler };
  } catch {
    // P1: selv en uventet fejl må aldrig blive til en kastet exception.
    return {
      konvention: { tusind: "ingen", decimal: ",", sikkerhed: "lav" },
      tabeller: [],
      advarsler: ["Uventet fejl under læsning — filen vises uden fortolkning"],
    };
  }
}
