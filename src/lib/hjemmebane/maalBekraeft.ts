/**
 * src/lib/hjemmebane/maalBekraeft.ts — «Dine mål», skive 3: BEKRÆFTELSEN og
 * KVARTALSTJEKKET (Jonas' svar på aftenlisten 1/10-2026 kl. 22:04–22:09;
 * docs/dine-maal-design.md «Skive 3»). Migration 20261002100000.
 *
 * REN: ingen React, ingen Supabase, ingen Date.now — tiden gives ind som `nu`.
 * Datoer er danske (hverdage.ts: kbhDato, laegMaanederTilDato).
 *
 * 1. BEKRÆFTELSEN («Ja, ét klik»): et mål tæller først som medlemmets, når
 *    `bekraeftet_at` er sat. Indtil da er det et FORSLAG — det tæller ikke i
 *    pladserne (højst tre), ikke i Score og ikke i forsidens fokus.
 *    FAIL-SOFT: er feltet `undefined` (kolonnen ikke læst — migrationen ikke
 *    kørt, hentningen faldt tilbage på de gamle kolonner), er modellen slået
 *    fra, og målet tæller SOM I DAG (erBekraeftet → true). `null` = ubekræftet.
 *
 * 2. DE GAMLE MÅL («Bekræft eller slip ved næste login»): et ubekræftet mål
 *    oprettet FØR skillelinjen (GAMLE_MAAL_FOER) står i ét samlet kort «Er det
 *    stadig jeres mål?» med «Behold» (= bekræft) / «Slip» (= parkér). Et
 *    ubekræftet mål oprettet EFTER står som et nyt forslag («Din rådgiver
 *    foreslår et mål» · «Det er vores mål» · «Ikke nu» = parkér). Samme to
 *    skrivninger — kun ordene er forskellige. SLET aldrig.
 *
 *    HVEM SKREV MÅLET: `milestones.source` (text, ingen CHECK — en observation,
 *    dømt mod ordforrådet maalKilde). Målt i koden og git-historikken 2/10:
 *    'manual' = medlemmets klient · 'advisor' = maal-skriv · 'handout' =
 *    handoutEngine · 'legat' = create-legat-enrollment · 'agent' =
 *    run-company-agent (til #939) · 'ai' = FileUploadZone/AIProgressWidget
 *    (slettet marts). Ukendt → null → «Et mål blev foreslået».
 *
 * 4. KVARTALSTJEKKET («Medlemmet selv»; rådgiverne får en linje på forsiden):
 *    pr. mål i måned 3, 6 og 9 efter bekræftelsen. REGNESTYKKET:
 *      anker  = bekraeftet_at som DANSK dato
 *      dato_k = laegMaanederTilDato(anker, 3·k), k = 1, 2, 3
 *      slut   = laegMaanederTilDato(anker, 12)  — måned 12 er årsbrevets, ikke et tjek
 *      tjek k VENTER, når dato_k ≤ i dag < slut, målet er aktivt og bekræftet,
 *      og ingen registreret række har kvartal ≥ k. Er flere forfaldne
 *      (k=1 og k=2 uden svar), venter kun det SENESTE — ét kort, og svaret
 *      dækker de tidligere (databasen: UNIQUE (milestone_id, kvartal)).
 *    Eksempel (prøvet i maalBekraeft.test.ts): bekræftet 15/1-2026 12:00Z →
 *    anker 2026-01-15; dato_1 = 2026-04-15, dato_2 = 2026-07-15, dato_3 =
 *    2026-10-15, slut = 2027-01-15. I dag 2/10-2026 uden rækker → kvartal 2
 *    venter (måned 6). Bekræftet 31/8 → dato_1 = 30/11 (dagen klippes til
 *    månedens længde, laegMaanederTilDato).
 *    Fire valg: behold · justeret (åbner redigering; registreres EFTER gemt) ·
 *    parkeret (status 'parked') · naaet (status 'completed' — KUN ved klik,
 *    som altid). Handlingen skrives FØR rækken: fejler rækken, står kortet
 *    igen næste gang (harmløst); fejler handlingen, skrives ingen række.
 *
 * SCORE (punkt 3, «flyt Score-pointet til Dine mål»): disciplinens 25
 * «mål»-point gives, når virksomheden har mindst ét mål, der
 * taellerSomScoreMaal: aktivt · bekræftet · med art (tal eller begivenhed —
 * et mål fra før designet uden art tæller ikke: «tal/frist» er designets) ·
 * med frist · og for et tal-mål både måltal og udgangspunkt. Et
 * begivenhedsmål har måltal 1/udgangspunkt 0 pr. konstruktion (doemNytMaal).
 */
import { kbhDato, laegMaanederTilDato } from "@/lib/hverdage";
import { erMarkeretNaaet } from "@/lib/milepaelDom";
import { KVARTAL_MAANEDER, TIDSLINJE_MAANEDER, laesArt } from "./maalTal";

// ── Bekræftelsen ───────────────────────────────────────────────────────────

/** Det af milestones-rækken bekræftelsesdommen læser. `bekraeftet_at` undefined = kolonnen ikke læst. */
export interface MaalTilBekraeftelse {
  id: string;
  title: string;
  status: string;
  created_at: string;
  source?: string | null;
  bekraeftet_at?: string | null;
}

/**
 * Skillelinjen mellem «gamle mål» (punkt 2: «Er det stadig jeres mål?») og
 * nye forslag (punkt 1: «Din rådgiver foreslår et mål»). Dagen, skive 3 blev
 * bygget. Et ubekræftet mål fra før møder «Behold / Slip», et fra efter «Det er
 * vores mål / Ikke nu» — samme to skrivninger.
 */
export const GAMLE_MAAL_FOER = "2026-10-02T00:00:00.000Z";

/**
 * Tæller målet som medlemmets? `undefined` = bekræftelsesmodellen er ikke i
 * drift (kolonnen ikke læst) → som i dag: ja. `null` = ubekræftet → nej.
 */
export function erBekraeftet(m: Pick<MaalTilBekraeftelse, "bekraeftet_at">): boolean {
  if (m.bekraeftet_at === undefined) return true;
  return typeof m.bekraeftet_at === "string" && m.bekraeftet_at.trim() !== "";
}

/** Et AKTIVT mål, der venter på medlemmets bekræftelse. Modellen slået fra → aldrig. */
export function erUbekraeftetAktivt(m: Pick<MaalTilBekraeftelse, "status" | "bekraeftet_at">): boolean {
  return m.status === "active" && !erBekraeftet(m);
}

export type MaalKilde = "medlem" | "raadgiver" | "ai" | "handout" | "legat";

/** milestones.source → kilde, dømt mod ordforrådet (filhovedet). Ukendt → null. */
export function maalKilde(source: unknown): MaalKilde | null {
  if (typeof source !== "string") return null;
  if (source === "manual") return "medlem";
  if (source === "advisor") return "raadgiver";
  if (source === "agent" || source === "ai") return "ai";
  if (source === "handout") return "handout";
  if (source === "legat") return "legat";
  return null;
}

/** Ordene ét sted. */
export const BEKRAEFT_ORD = {
  /** Overskriften på et NYT forslag, efter kilden. Et navn kræver et profilopslag og er bevidst ikke bygget (som «foreslået af»). */
  forslagOverskrift: {
    raadgiver: "Din rådgiver foreslår et mål",
    ai: "AI foreslog et mål",
    handout: "Et mål fra jeres handout",
    legat: "Et mål fra forløbet",
    medlem: "Et mål venter på jeres ja",
    ukendt: "Et mål blev foreslået",
  } satisfies Record<MaalKilde | "ukendt", string>,
  forslagTekst: "Tæller først som jeres mål, når I siger ja. Indtil da tæller det hverken i pladserne eller i jeres score.",
  detErVoresMaal: "Det er vores mål",
  ikkeNu: "Ikke nu",
  gamleOverskrift: "Er det stadig jeres mål?",
  gamleTekst: (antal: number) =>
    antal === 1
      ? "Et af jeres mål blev skrevet af en rådgiver, et handout eller AI. Behold det, hvis det stadig er jeres — ellers slip det. Det tæller først, når I har svaret."
      : `${antal} af jeres mål blev skrevet af en rådgiver, et handout eller AI. Behold dem, der stadig er jeres — slip resten. De tæller først, når I har svaret.`,
  behold: "Behold",
  slip: "Slip",
  /** Ordet efter titlen på et gammelt mål: hvem skrev det. */
  skrevetAf: {
    raadgiver: "skrevet af din rådgiver",
    ai: "skrevet af AI",
    handout: "fra et handout",
    legat: "fra forløbet",
    medlem: "skrevet af jer",
    ukendt: "",
  } satisfies Record<MaalKilde | "ukendt", string>,
  /** Den stiplede plads, når de ubekræftede fylder databasens tre (dineMaal.pladsOptagetAfUbekraeftede). */
  pladsOptaget: "Plads til et mål mere, når I har taget stilling til forslagene ovenfor.",
  /** Rådgiveren læser — bekræftelsen er medlemmets (RLS: rådgiveren har kun SELECT). */
  kunMedlemmet: "Kun virksomheden kan sige ja til et mål.",
  slippet: "Målet er parkeret — I kan aktivere det igen under «Parkeret».",
  bekraeftet: "Målet er jeres",
} as const;

export interface BekraeftelsesDeling {
  /** Ubekræftede AKTIVE mål oprettet på eller efter skillelinjen — nye forslag. Ældste først. */
  forslag: MaalTilBekraeftelse[];
  /** Ubekræftede AKTIVE mål fra før skillelinjen — «Er det stadig jeres mål?». Ældste først. */
  gamle: MaalTilBekraeftelse[];
}

/** Deler de ubekræftede aktive mål i nye forslag og gamle mål (filhovedet). Modellen slået fra → begge tomme. */
export function delBekraeftelser(maal: readonly MaalTilBekraeftelse[]): BekraeftelsesDeling {
  const ubekraeftede = maal.filter(erUbekraeftetAktivt).sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  return {
    forslag: ubekraeftede.filter((m) => m.created_at >= GAMLE_MAAL_FOER),
    gamle: ubekraeftede.filter((m) => m.created_at < GAMLE_MAAL_FOER),
  };
}

/** Overskriften for ét forslag (BEKRAEFT_ORD.forslagOverskrift efter kilden). */
export function forslagOverskrift(source: unknown): string {
  return BEKRAEFT_ORD.forslagOverskrift[maalKilde(source) ?? "ukendt"];
}

/** «skrevet af din rådgiver» for et gammelt mål; tom streng uden kendt kilde. */
export function skrevetAfTekst(source: unknown): string {
  return BEKRAEFT_ORD.skrevetAf[maalKilde(source) ?? "ukendt"];
}

// ── Score ──────────────────────────────────────────────────────────────────

/** Det af milestones-rækken Score læser (useBoardroomScore). */
export interface MaalTilScore {
  status: string;
  bekraeftet_at?: string | null;
  art?: string | null;
  deadline?: string | null;
  target_value?: number | null;
  udgangspunkt?: number | null;
}

const tal = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Tæller målet i Score's disciplin («mål», 25 point)? Aktivt · bekræftet ·
 * med art · med frist · og for et tal-mål både måltal og udgangspunkt
 * (regnestykket i filhovedet). Et gammelt mål uden art tæller IKKE — «Gør
 * målet skarpt» er vejen til pointet.
 */
export function taellerSomScoreMaal(m: MaalTilScore): boolean {
  if (m.status !== "active" || !erBekraeftet(m)) return false;
  const art = laesArt(m.art);
  if (art === null) return false;
  if (typeof m.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(m.deadline)) return false;
  if (art === "tal") return tal(m.target_value) && tal(m.udgangspunkt);
  return true;
}

// ── Kvartalstjekket ────────────────────────────────────────────────────────

/** Ordforrådet — står ORDRET i migrationens CHECK'e (kildeværn dineMaalSkive3.guard). */
export const KVARTALER = [1, 2, 3] as const;
export type Kvartal = (typeof KVARTALER)[number];
export const KVARTAL_VALG = ["behold", "justeret", "parkeret", "naaet"] as const;
export type KvartalValg = (typeof KVARTAL_VALG)[number];

export function laesKvartal(v: unknown): Kvartal | null {
  return typeof v === "number" && (KVARTALER as readonly number[]).includes(v) ? (v as Kvartal) : null;
}
export function laesKvartalValg(v: unknown): KvartalValg | null {
  return typeof v === "string" && (KVARTAL_VALG as readonly string[]).includes(v) ? (v as KvartalValg) : null;
}

/** Det af maal_kvartalstjek-rækken dommen læser. */
export interface KvartalstjekRaekke {
  milestone_id: string;
  kvartal: number;
  valg?: string | null;
  valgt_at?: string | null;
}

/** Det af milestones-rækken kvartalstjekket læser. */
export interface MaalTilKvartalstjek {
  id: string;
  title: string;
  status: string;
  bekraeftet_at?: string | null;
  company_id?: string | null;
}

export interface VentendeKvartalstjek {
  maalId: string;
  maalTitel: string;
  companyId: string | null;
  kvartal: Kvartal;
  /** Måned 3, 6 eller 9. */
  maaned: number;
  /** Dagen tjekket forfaldt («YYYY-MM-DD», dansk). */
  dato: string;
}

/** Ankeret: bekraeftet_at som dansk dato; null uden (læseligt) stempel. */
export function kvartalAnker(bekraeftetAt: string | null | undefined): string | null {
  if (typeof bekraeftetAt !== "string" || !bekraeftetAt.trim()) return null;
  const t = new Date(bekraeftetAt);
  return Number.isNaN(t.getTime()) ? null : kbhDato(t);
}

/** De tre tjekdatoer og slutdatoen for et anker (regnestykket i filhovedet). */
export function kvartalDatoer(anker: string): { kvartal: Kvartal; maaned: number; dato: string }[] {
  return KVARTALER.map((k) => ({ kvartal: k, maaned: KVARTAL_MAANEDER * k, dato: laegMaanederTilDato(anker, KVARTAL_MAANEDER * k) }));
}

/**
 * Det ventende kvartalstjek for ÉT mål — eller null. Kun det SENESTE forfaldne
 * (ét kort); en registreret række med kvartal ≥ k dækker. Efter måned 12: intet.
 */
export function ventendeKvartalstjek(maal: MaalTilKvartalstjek, tjek: readonly KvartalstjekRaekke[], nu: Date): VentendeKvartalstjek | null {
  if (maal.status !== "active" || erMarkeretNaaet(maal.status)) return null;
  if (maal.bekraeftet_at === undefined || !erBekraeftet(maal)) return null;
  const anker = kvartalAnker(maal.bekraeftet_at);
  if (!anker) return null;
  const idag = kbhDato(nu);
  const slut = laegMaanederTilDato(anker, TIDSLINJE_MAANEDER);
  if (idag >= slut) return null;
  const hoejesteSvar = tjek
    .filter((t) => t.milestone_id === maal.id)
    .map((t) => laesKvartal(t.kvartal) ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);
  const forfaldne = kvartalDatoer(anker).filter((d) => d.dato <= idag && d.kvartal > hoejesteSvar);
  const seneste = forfaldne[forfaldne.length - 1];
  if (!seneste) return null;
  return { maalId: maal.id, maalTitel: maal.title, companyId: maal.company_id ?? null, kvartal: seneste.kvartal, maaned: seneste.maaned, dato: seneste.dato };
}

/** Alle ventende kvartalstjek — ældste forfaldsdato først, så målets titel. */
export function ventendeKvartalstjekAlle(maal: readonly MaalTilKvartalstjek[], tjek: readonly KvartalstjekRaekke[], nu: Date): VentendeKvartalstjek[] {
  return maal
    .map((m) => ventendeKvartalstjek(m, tjek, nu))
    .filter((v): v is VentendeKvartalstjek => v !== null)
    .sort((a, b) => (a.dato !== b.dato ? (a.dato < b.dato ? -1 : 1) : a.maalTitel.localeCompare(b.maalTitel, "da")));
}

/** Rådgiverens linje: pr. virksomhed, hvor mange tjek venter. */
export interface KvartalstjekPrVirksomhed {
  companyId: string;
  antal: number;
  maal: VentendeKvartalstjek[];
}

export function kvartalstjekPrVirksomhed(ventende: readonly VentendeKvartalstjek[]): KvartalstjekPrVirksomhed[] {
  const pr = new Map<string, VentendeKvartalstjek[]>();
  for (const v of ventende) {
    if (!v.companyId) continue;
    const liste = pr.get(v.companyId) ?? [];
    liste.push(v);
    pr.set(v.companyId, liste);
  }
  return [...pr.entries()]
    .map(([companyId, maal]) => ({ companyId, antal: maal.length, maal }))
    .sort((a, b) => b.antal - a.antal || a.companyId.localeCompare(b.companyId));
}

export const KVARTAL_ORD = {
  eyebrow: "Kvartalstjek",
  overskrift: (maaned: number) => `Måned ${maaned}: Er målet stadig det rigtige?`,
  tekst: "Tag stilling, så planen passer til virkeligheden. Nået er stadig kun jeres klik.",
  behold: "Behold",
  juster: "Justér tal og dato",
  parker: "Parkér",
  naaet: "Nået",
  registreret: "Kvartalstjekket er registreret",
  /** Rådgiverens forside. */
  raadgiverLinje: (antal: number) => (antal === 1 ? "1 kvartalstjek venter hos medlemmerne" : `${antal} kvartalstjek venter hos medlemmerne`),
  raadgiverIngen: "Ingen kvartalstjek venter.",
  raadgiverMikro: "Kvartalstjek",
  /** Forsidens fokuspunkt. */
  fokusTitel: (maalTitel: string, maaned: number) => `Kvartalstjek, måned ${maaned}: ${maalTitel}`,
  fokusTekst: "Er målet stadig det rigtige? Behold, justér, parkér — eller markér det som nået.",
  fokusCta: "Tag kvartalstjekket",
  fokusSti: "/milestones#kvartalstjek",
} as const;
