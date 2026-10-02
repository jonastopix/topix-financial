/**
 * src/lib/hjemmebane/maalRetning.ts — «Jeres retning» øverst i Dine mål
 * (Jonas 1/10-2026 kl. 22:37, ja): handoutet «Målsætning 12 mdr.»
 * (handoutConfig.ts, modul 'overordnet') flytter ind i toppen af Dine mål som
 * TRE spørgsmål. Svarene BOR stadig i handouts-rækken (handouts.responses) —
 * ingen ny tabel, ingen migration; handoutet og Dine mål læser og skriver de
 * SAMME nøgler, så et svar givet ét sted står det andet.
 *
 *   lykkedes_12mdr               «Om 12 måneder er vi lykkedes, hvis…»
 *   anderledes_hverdag           «Hvad skal være anderledes i hverdagen?» (inkl. arbejdstiden)
 *   konsekvenser_ingen_aendring  «Hvad koster det, hvis intet ændrer sig?»
 *
 * Nøglerne står ORDRET i handoutConfigs.overordnet (testen holder dem i takt);
 * ordlyden her er Dine måls korte form af handoutets spørgsmål.
 *
 * REN: ingen React, ingen Supabase. Hentning og skrivning: hooks/dineMaalGrundlag.ts.
 */

export const RETNING_MODUL = "overordnet" as const;

export const RETNING_NOEGLER = ["lykkedes_12mdr", "anderledes_hverdag", "konsekvenser_ingen_aendring"] as const;
export type RetningNoegle = (typeof RETNING_NOEGLER)[number];

export const RETNING_ORD = {
  overskrift: "Jeres retning",
  spoergsmaal: {
    lykkedes_12mdr: "Om 12 måneder er vi lykkedes, hvis…",
    anderledes_hverdag: "Hvad skal være anderledes i hverdagen?",
    konsekvenser_ingen_aendring: "Hvad koster det, hvis intet ændrer sig?",
  } satisfies Record<RetningNoegle, string>,
  hjaelp: {
    lykkedes_12mdr: null,
    anderledes_hverdag: "Også arbejdstiden — hvor meget vil I arbejde?",
    konsekvenser_ingen_aendring: null,
  } satisfies Record<RetningNoegle, string | null>,
} as const;

/** Det af handouts-rækken retningen læser. */
export interface RetningsRaekke {
  id: string;
  user_id: string;
  module: string;
  responses: unknown;
  updated_at: string | null;
  status?: string | null;
}

export interface Retning {
  /** Rækken svarene står i; null = ingen række (endnu). */
  handoutId: string | null;
  /** Hvis række (handouts er pr. bruger — UNIQUE (user_id, module)). */
  userId: string | null;
  /** De tre svar; et manglende eller ikke-tekst-svar er "". */
  svar: Record<RetningNoegle, string>;
  /** Antal af de tre med indhold (efter trim). */
  besvaret: number;
  opdateret: string | null;
}

const TOMME_SVAR = (): Record<RetningNoegle, string> => ({ lykkedes_12mdr: "", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" });

const erObjekt = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Den række, retningen læses af: KUN modul 'overordnet', den NYESTE
 * (updated_at; lige/manglende: den først i listen). Handouts er pr. bruger;
 * en rådgiver ser alle virksomhedens rækker (RLS «Advisors can view all
 * handouts»), et medlem kun sin egen («Users can view own handouts») — derfor
 * «nyeste» frem for «den ene».
 */
export function vaelgRetningsRaekke(raekker: readonly RetningsRaekke[]): RetningsRaekke | null {
  let valgt: RetningsRaekke | null = null;
  for (const r of raekker) {
    if (r.module !== RETNING_MODUL) continue;
    if (valgt === null || (r.updated_at ?? "") > (valgt.updated_at ?? "")) valgt = r;
  }
  return valgt;
}

/** De tre svar af én handouts-række (null → tomme svar). Et felt er en observation: kun tekst læses. */
export function retningFraHandout(raekke: RetningsRaekke | null): Retning {
  const svar = TOMME_SVAR();
  const resp = raekke && erObjekt(raekke.responses) ? raekke.responses : {};
  for (const n of RETNING_NOEGLER) {
    const v = resp[n];
    svar[n] = typeof v === "string" ? v : "";
  }
  return {
    handoutId: raekke?.id ?? null,
    userId: raekke?.user_id ?? null,
    svar,
    besvaret: RETNING_NOEGLER.filter((n) => svar[n].trim() !== "").length,
    opdateret: raekke?.updated_at ?? null,
  };
}

export type RetningSkrivDom = { ok: true; responses: Record<string, unknown>; harIndhold: boolean } | { ok: false; grund: string };

/**
 * De nye responses, når de tre svar skrives (fail-closed):
 *   - kun de tre nøgler må ændres — en anden nøgle afvises (handoutets øvrige
 *     svar røres aldrig herfra);
 *   - hvert givet svar skal være tekst; et udeladt svar står uændret;
 *   - alle ANDRE nøgler i de eksisterende responses bevares ordret (også
 *     ikke-tekst-værdier — de er handoutets, ikke vores);
 *   - harIndhold: om rækken efter skrivningen har noget indhold i responses
 *     (samme afledning som handoutEngine.saveHandout: en ikke-tom tekst).
 */
export function retningTilResponses(eksisterende: unknown, nye: Partial<Record<string, unknown>>): RetningSkrivDom {
  const ud: Record<string, unknown> = erObjekt(eksisterende) ? { ...eksisterende } : {};
  for (const [k, v] of Object.entries(nye)) {
    if (!(RETNING_NOEGLER as readonly string[]).includes(k)) return { ok: false, grund: "Kun de tre spørgsmål om retningen kan gemmes her" };
    if (v === undefined) continue;
    if (typeof v !== "string") return { ok: false, grund: "Svaret skal være tekst" };
    ud[k] = v;
  }
  const harIndhold = Object.values(ud).some((v) => typeof v === "string" && v.trim() !== "");
  return { ok: true, responses: ud, harIndhold };
}

/**
 * Handout-status efter en retningsskrivning: en række, der stod 'not_started',
 * og nu har indhold, bliver 'in_progress' (handoutEngine.saveHandout's
 * afledning); 'in_progress' og 'completed' røres ALDRIG — et udfyldt handout
 * genåbnes ikke af, at retningen rettes på Dine mål. Ny række: 'in_progress'
 * med indhold, ellers 'not_started'.
 */
export function retningStatus(gammel: string | null | undefined, harIndhold: boolean): "not_started" | "in_progress" | "completed" {
  if (gammel === "completed") return "completed";
  if (gammel === "in_progress") return "in_progress";
  return harIndhold ? "in_progress" : "not_started";
}

// ── Fladens afledninger (2/10-2026, Jonas: «gør det øverste afsnit med Jeres retning … lidt mere lækkert visuelt») ──
//
// Feltet tegner svar 1 («Om 12 måneder er vi lykkedes, hvis …») som en LISTE og
// de to andre som to kort. Alt, der afgør HVAD der står, ligger her — rent og
// prøvet (maalRetning.test.ts); JeresRetning.tsx tegner kun.

/** Ordene på feltet — ét sted. Kortenes overskrifter er husets omskrivning af spørgsmålene (mockup 2/10). */
export const RETNING_FELT_ORD = {
  /** Kortet for `anderledes_hverdag`. */
  hverdagen: "Hverdagen, vi bygger",
  /** Kortet for `konsekvenser_ingen_aendring` — eyebrow i amber: prisen er advarslen. */
  prisen: "Prisen, hvis intet ændrer sig",
  laesAlt: "Læs alt",
  visMindre: "Vis mindre",
  fod: "Jeres mål herunder er vejen derhen.",
  ikkeSvaret: "Ikke svaret endnu",
  skrevet: "Skrevet",
  skrevetAf: "Skrevet af",
  /** Fund 14: rækken tilhører en anden bruger end den, der ser siden (en medejer). */
  skrevetAfAnden: "Skrevet af en anden i virksomheden",
} as const;

/** Flere linjer end dette, eller flere tegn i alt, klippes med «Læs alt» (listen). */
export const RETNING_MAKS_LINJER = 5;
export const RETNING_MAKS_TEGN = 420;
/** Et korts svar klippes ved dette antal tegn. */
export const RETNING_KORT_MAKS_TEGN = 280;

/**
 * Et svar som linjer: split på linjeskift, hver linje trimmet, tomme linjer væk,
 * og et indledende punkttegn («- », «• », «– », «* », «1. ») fjernet — folk
 * skriver lister i et tekstfelt på alle måder. Ét afsnit uden linjeskift er én
 * linje. Tomt svar → [].
 */
export function retningLinjer(svar: string): string[] {
  return svar
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^(?:[-–—•*·]|\d{1,2}[.)])\s+/, "").trim())
    .filter((l) => l !== "");
}

export interface RetningKlip {
  /** De viste linjer (den sidste kan ende på «…»). */
  linjer: string[];
  /** Noget er skjult — fladen viser «Læs alt». */
  klippet: boolean;
}

/** Klip én tekst ved sidste mellemrum før `maksTegn` (mindst halvvejs) + «…». */
const klipVedMellemrum = (t: string, maksTegn: number): string => {
  const snit = t.lastIndexOf(" ", maksTegn);
  return `${t.slice(0, snit > maksTegn / 2 ? snit : maksTegn).trimEnd()}…`;
};

/**
 * Klipper en liste til højst `maksLinjer` linjer og ca. `maksTegn` tegn i alt —
 * ved LINJEGRÆNSEN, aldrig midt i en sætning, undtagen når den FØRSTE linje
 * alene er for lang (så klippes den ved sidste mellemrum før grænsen + «…»).
 * Mindst én linje vises altid. Regnestykket: linjer tages ind, så længe
 * antal < maksLinjer og summen af tegn (med linjen) ≤ maksTegn.
 */
export function klipRetning(linjer: readonly string[], maksLinjer = RETNING_MAKS_LINJER, maksTegn = RETNING_MAKS_TEGN): RetningKlip {
  if (linjer.length === 0) return { linjer: [], klippet: false };
  const ud: string[] = [];
  let tegn = 0;
  for (const l of linjer) {
    if (ud.length >= maksLinjer || tegn + l.length > maksTegn) break;
    ud.push(l);
    tegn += l.length;
  }
  if (ud.length === 0) return { linjer: [klipVedMellemrum(linjer[0], maksTegn)], klippet: true };
  return { linjer: ud, klippet: ud.length < linjer.length };
}

/** Ét korts tekst klippet ved `maksTegn` (ved sidste mellemrum før grænsen + «…»). Tomt → tomt, ikke klippet. */
export function klipKortTekst(tekst: string, maksTegn = RETNING_KORT_MAKS_TEGN): { tekst: string; klippet: boolean } {
  const t = tekst.trim();
  if (t.length <= maksTegn) return { tekst: t, klippet: false };
  return { tekst: klipVedMellemrum(t, maksTegn), klippet: true };
}

/**
 * Meta-linjen i feltets top: «Skrevet af Mette · 12. sep. 2026» — fornavnet KUN
 * når fladen har det uden et nyt opslag (den indloggedes egen profil, når rækken
 * er dennes; ingen ny RLS); ellers «Skrevet 12. sep. 2026». Uden dato: «Skrevet
 * af Mette» / null. `opdateret` er handouts.updated_at (ISO); `formatterDato`
 * gives ind (fladen giver retningDato: dansk kalenderdag → skridtForslag.danskDato).
 *
 * `skrevetAfAnden` (fund 14, en medejers række): «Skrevet af en anden i
 * virksomheden · 12. sep. 2026» — ÉN gang «Skrevet» (rådets fund 2/10: før stod
 * «Skrevet 12. sep. 2026 · Skrevet af en anden i virksomheden»). Fornavnet
 * gives aldrig for en andens række (kalderen har det kun for egen), men
 * vinder ikke over flaget, hvis det skulle komme.
 */
export function retningMeta(fornavn: string | null, opdateret: string | null, formatterDato: (iso: string) => string, skrevetAfAnden = false): string | null {
  const dato = opdateret ? formatterDato(opdateret) : null;
  const navn = fornavn?.trim() || null;
  const af = skrevetAfAnden ? RETNING_FELT_ORD.skrevetAfAnden : navn ? `${RETNING_FELT_ORD.skrevetAf} ${navn}` : null;
  if (af && dato) return `${af} · ${dato}`;
  if (af) return af;
  if (dato) return `${RETNING_FELT_ORD.skrevet} ${dato}`;
  return null;
}

/**
 * Kalenderdagen for et tidsstempel i DANSK tid som «YYYY-MM-DD» (rådets fund
 * 2/10): handouts.updated_at er UTC; de første 10 tegn af ISO-strengen er
 * UTC-datoen, som er GÅRSDAGEN for alt skrevet mellem 00:00 og 02:00 dansk
 * sommertid (01:00 vintertid). Regnestykket: 2026-09-11T22:30Z + 2 t (CEST) =
 * 12/9 00:30 → «2026-09-12»; 2026-12-31T23:30Z + 1 t (CET) = 1/1 2027 00:30 →
 * «2027-01-01». Intl med Europe/Copenhagen (en-CA giver netop formen) — ikke
 * browserens zone. Ulæseligt tidsstempel → strengen uændret (danskDato viser
 * den så som den er).
 */
export function danskKalenderdag(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: RETNING_TIDSZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}

/** Tidszonen for retningens dato — samme som fristernes (skridtForslag.FRIST_TIDSZONE). */
export const RETNING_TIDSZONE = "Europe/Copenhagen";
