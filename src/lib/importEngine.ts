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

const MAANEDER_RE =
  /^(jan(uar)?|feb(ruar)?|mar(ts|ch)?|apr(il)?|maj|may|jun[ie]?|jul[iy]?|aug(ust)?|sep(tember)?|okt(ober)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?$/i;
const KVARTAL_RE = /^q[1-4]$/i;
const AARSTAL_RE = /^(19|20)\d{2}$/;
const TOTAL_RE = /^(i\s*alt|total|sum|ytd|år\s*til\s*dato)$/i;

/** Ligner cellen en periode-overskrift (månedsnavn, kvartal, årstal, total)? */
function erPeriodeOverskrift(celle: Celle): boolean {
  if (celle == null) return false;
  const s = String(celle).trim();
  if (!s) return false;
  const kerne = s.replace(/\s+(19|20)\d{2}$/, ""); // "Jan 2026" → "Jan"
  return (
    MAANEDER_RE.test(kerne) || KVARTAL_RE.test(s) || AARSTAL_RE.test(s) || TOTAL_RE.test(s)
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

  for (const blok of blokke) {
    const headere: number[] = [];
    for (let r = blok.start; r <= blok.slut; r++) {
      if (erHeaderRaekke(matrix[r])) headere.push(r);
    }

    if (headere.length === 0) {
      // Blok uden header: en tabel hvis der er tal at vise, ellers støj
      // (titel-/tekstblokke bliver ikke til tabeller).
      let harTal = false;
      for (let r = blok.start; r <= blok.slut; r++) {
        if (harTalCelle(matrix[r])) harTal = true;
      }
      if (harTal) {
        graenser.push({
          headerRaekke: null,
          foersteDataRaekke: blok.start,
          sidsteDataRaekke: blok.slut,
        });
      }
      continue;
    }

    // Blok med headere: én tabel pr. header; rækker over blokkens første
    // header hører ikke til nogen tabel.
    for (let h = 0; h < headere.length; h++) {
      const header = headere[h];
      const sidste = h + 1 < headere.length ? headere[h + 1] - 1 : blok.slut;
      if (header + 1 > sidste) continue; // header uden datarækker
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

/**
 * Klassificerer rækker på STRUKTUR, ikke ordvalg (design §4.4):
 *   subtotal — værdierne svarer til summen af en sammenhængende blok rækker
 *              over den, i ALLE rækkens talkolonner (ét tilfældigt sammenfald
 *              i én kolonne holder ikke over tolv). Tidligere fundne
 *              subtotaler springes over i summen (de gentager posterne) og
 *              registreres ikke i daekker. Ord som "subtotal"/"i alt" i
 *              etiketten afgør bevidst ALDRIG noget alene — de indgår ikke i
 *              dommen, fordi strukturen bærer den fuldt ud.
 *   sektion  — etiket uden tal, efterfulgt af rækker med tal.
 *   stoej    — hverken etiket eller tal (eller etiket uden efterfølgende tal).
 *   post     — alt andet.
 * Muterer ikke input; returnerer nye række-objekter.
 */
export function klassificerRaekker(raekker: Raekke[]): Raekke[] {
  const resultat: Raekke[] = raekker.map((r) => ({ ...r, felter: r.felter.map((f) => ({ ...f })) }));

  for (let i = 0; i < resultat.length; i++) {
    const raekke = resultat[i];

    if (!harTal(raekke)) {
      if (!harEtiket(raekke)) {
        raekke.type = "stoej";
        continue;
      }
      // Etiket uden tal: sektion hvis den efterfølges af rækker med tal.
      const naeste = resultat.slice(i + 1).find((r) => harTal(r) || harEtiket(r));
      raekke.type = naeste && harTal(naeste) ? "sektion" : "stoej";
      continue;
    }

    // Række med tal: subtotal-kandidat mod sammenhængende post-blok ovenfor.
    const talKolonner = raekke.felter
      .map((f, idx) => ({ f, idx }))
      .filter(({ f }) => f.vaerdi !== null);

    let daekker: number[] | null = null;
    const sum = new Array<number>(raekke.felter.length).fill(0);
    const blok: number[] = [];

    for (let j = i - 1; j >= 0; j--) {
      const over = resultat[j];
      if (over.type === "subtotal") continue; // gentager posterne — spring over
      if (!harTal(over)) break; // sektion/støj bryder den sammenhængende blok
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
      const raekker: Raekke[] = [];
      for (let r = g.foersteDataRaekke; r <= g.sidsteDataRaekke; r++) {
        const raaRaekke = Array.isArray(matrix[r]) ? matrix[r] : [];
        const felter = raaRaekke.slice(1).map((c) => celleTilFelt(c, konvention));
        ulaeselige += felter.filter((f) => f.kilde === "ulaeselig").length;
        raekker.push({
          raekkeIndex: r,
          etiket: raaRaekke[0] == null ? "" : String(raaRaekke[0]),
          type: "post",
          felter,
        });
      }
      const headerCeller =
        g.headerRaekke !== null && Array.isArray(matrix[g.headerRaekke])
          ? matrix[g.headerRaekke].map((c) => (c == null ? "" : String(c)))
          : [];
      return {
        headerRaekke: g.headerRaekke,
        kolonneOverskrifter: headerCeller,
        foersteDataRaekke: g.foersteDataRaekke,
        sidsteDataRaekke: g.sidsteDataRaekke,
        raekker: klassificerRaekker(raekker),
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
