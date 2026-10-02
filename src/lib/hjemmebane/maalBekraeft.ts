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
 *      anker  = max(bekraeftet_at som DANSK dato, KVARTALSTJEK_FRA)
 *               — KVARTALSTJEK_FRA = 2026-10-02 (dagen, modellen gik i luften):
 *               migrationen backfiller bekraeftet_at = created_at for medlemmets
 *               egne mål, og MÅLT i prod 2/10 ~03:45 er 6 aktive manual-mål
 *               ældre end 3 måneder — uden ankeret ville de få et kvartalstjek
 *               på DAG 1, før nogen har set modellen. Med ankeret er deres
 *               første tjek 2/1-2027 (2/10 + 3 måneder). Et mål bekræftet efter
 *               2/10 ankrer som før på sin egen dato. Rådets fund 9; samme
 *               udtryk i migrationens INSERT-policy (greatest(bekraeftet_at,
 *               '2026-10-02')) — dineMaalSkive3.guard dom 7 holder dem ens.
 *      dato_k = laegMaanederTilDato(anker, 3·k), k = 1, 2, 3
 *      slut   = laegMaanederTilDato(anker, 12)  — måned 12 er årsbrevets, ikke et tjek
 *      tjek k VENTER, når dato_k ≤ i dag < slut, målet er aktivt og bekræftet,
 *      og ingen registreret række har kvartal ≥ k. Er flere forfaldne
 *      (k=1 og k=2 uden svar), venter kun det SENESTE — ét kort, og svaret
 *      dækker de tidligere (databasen: UNIQUE (milestone_id, kvartal)).
 *    Eksempel (prøvet i maalBekraeft.test.ts): bekræftet 15/10-2026 12:00Z →
 *    anker 2026-10-15; dato_1 = 2027-01-15, dato_2 = 2027-04-15, dato_3 =
 *    2027-07-15, slut = 2027-10-15. I dag 20/4-2027 uden rækker → kvartal 2
 *    venter (måned 6). Backfillet 15/1-2026 → anker 2026-10-02 → dato_1 =
 *    2027-01-02. Bekræftet 31/8-2027 → dato_1 = 30/11 (dagen klippes til
 *    månedens længde, laegMaanederTilDato — som Postgres' date + interval).
 *    Fire valg: behold · justeret (åbner redigering; registreres EFTER gemt) ·
 *    parkeret (status 'parked') · naaet (status 'completed' — KUN ved klik,
 *    som altid). Handlingen skrives FØR rækken: fejler rækken, står kortet
 *    igen næste gang (harmløst); fejler handlingen, skrives ingen række.
 *    DATABASENS DOM (migrationens INSERT-policy, rådets fund 11) er den samme
 *    som klientens — maaRegistrereKvartalstjek: målet er bekræftet, kvartalet
 *    er forfaldent (dato_k ≤ i dag < slut, samme anker), ingen række med
 *    kvartal ≥ k, og målets status passer til valget: behold/justeret kræver
 *    'active'; parkeret tillader 'active' eller 'parked', naaet 'active' eller
 *    'completed' — fordi handlingen skrives FØR rækken, og rækken må aldrig
 *    sige noget, målet ikke er.
 *
 * SCORE (punkt 3, «flyt Score-pointet til Dine mål»): disciplinens 25
 * «mål»-point gives, når virksomheden har mindst ét mål, der
 * taellerSomScoreMaal. REGNESTYKKET (beslutning 2/10, rådets fund 4):
 *   tæller = status 'active' ∧ bekræftet ∧ frist («YYYY-MM-DD»)
 *            ∧ (art ≠ 'tal' ∨ måltal er et tal)
 *   `art` kræves IKKE: målt i prod 2/10 ~03:45 har 0 af de aktive manual-mål
 *   en art (kolonnen kom 1/10) — et krav om art ville tage pointet fra alle
 *   gamle mål med frist, og «Sæt et mål med en frist» ville lyve. Et tal-mål
 *   (art 'tal') skal desuden have et måltal; udgangspunktet kræves ikke
 *   (sporet regner uden — maalTal). Et begivenhedsmål har måltal 1 pr.
 *   konstruktion. Før migrationen (kolonnen bekraeftet_at ulæst): hooken
 *   falder tilbage på kpi_targets som før — dommen her kaldes ikke.
 */
import { kbhDato, kbhTilUtc, laegMaanederTilDato } from "@/lib/hverdage";
import { erMarkeretNaaet } from "@/lib/milepaelDom";
import { KVARTAL_MAANEDER, TIDSLINJE_MAANEDER, laesArt } from "./maalTal";

/**
 * Dagen, skive 3 gik i luften (DANSK dato) — ÉN kilde for to skillelinjer
 * (rådets runde 2, fund 8): kvartalstjekkets anker er aldrig før den
 * (regnestykket i filhovedet, rådets fund 9: 2/10 + 3 måneder = 2/1-2027 er
 * det første tjek for de backfillede), og GAMLE_MAAL_FOER (skillelinjen mellem
 * «gamle mål» og nye forslag) udledes af den. Migrationens INSERT-policy bærer
 * den samme dato ordret (dineMaalSkive3.guard dom 7).
 */
export const KVARTALSTJEK_FRA = "2026-10-02";

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
 * nye forslag (punkt 1: «Din rådgiver foreslår et mål»): DANSK midnat den dag,
 * skive 3 gik i luften — udledt af KVARTALSTJEK_FRA (én kilde, runde 2 fund 8),
 * som ISO-stempel i UTC (2026-10-02 dansk = 2026-10-01T22:00:00.000Z), så den
 * kan sammenlignes direkte med `created_at`. Et ubekræftet mål fra før møder
 * «Behold / Slip», et fra efter «Det er vores mål / Ikke nu» — samme to
 * skrivninger.
 */
export const GAMLE_MAAL_FOER = kbhTilUtc(KVARTALSTJEK_FRA, 0, 0).toISOString();

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
  /** Rådets fund 2: pladserne tælles af databasen (triggeren tæller også forslag) — så ordene lover kun det, der er sandt. */
  forslagTekst: "Tæller først som jeres mål, når I siger ja. Indtil da tæller det ikke i jeres score.",
  detErVoresMaal: "Det er vores mål",
  ikkeNu: "Ikke nu",
  gamleOverskrift: "Er det stadig jeres mål?",
  /** Rådets fund 8: et gammelt 'manual'-mål er ubekræftet, netop fordi den, der skrev det, ikke længere er medlem
      (backfillen kræver medlemskab) — derfor «eller af en, der ikke længere er medlem». */
  gamleTekst: (antal: number) =>
    antal === 1
      ? "Et af jeres mål blev skrevet af en rådgiver, et handout, AI — eller af en, der ikke længere er medlem. Behold det, hvis det stadig er jeres — ellers slip det. Det tæller først, når I har svaret."
      : `${antal} af jeres mål blev skrevet af en rådgiver, et handout, AI — eller af en, der ikke længere er medlem. Behold dem, der stadig er jeres — slip resten. De tæller først, når I har svaret.`,
  behold: "Behold",
  slip: "Slip",
  /** Ordet efter titlen på et gammelt mål: hvem skrev det. */
  skrevetAf: {
    raadgiver: "skrevet af din rådgiver",
    ai: "skrevet af AI",
    handout: "fra et handout",
    legat: "fra forløbet",
    /** Et ubekræftet 'manual'-mål fra før skillelinjen: backfillen sprang det over, fordi user_id ikke (længere) er medlem (fund 8). */
    medlem: "skrevet gennem jeres konto af en, der ikke længere er medlem",
    ukendt: "",
  } satisfies Record<MaalKilde | "ukendt", string>,
  /** Den stiplede plads, når de ubekræftede fylder databasens tre (dineMaal.pladsOptagetAfUbekraeftede).
      ÉT ord for et ubekræftet mål overalt (runde 2, fund 4): «venter på jeres ja» — aldrig «forslagene»,
      for det gamle kort hedder «Er det stadig jeres mål?». */
  pladsOptaget: "Plads til et mål mere, når I har svaret på de mål, der venter på jeres ja.",
  /** Forsidens fokuspunkt (runde 2, fund 5): «N mål venter på jeres ja» → Dine mål. */
  fokusTitel: (antal: number) => (antal === 1 ? "1 mål venter på jeres ja" : `${antal} mål venter på jeres ja`),
  fokusTekst: "Sig ja til dem, der er jeres — og slip resten. De tæller først, når I har svaret.",
  fokusCta: "Svar på Dine mål",
  fokusSti: "/milestones",
  /** Rådgiveren læser — bekræftelsen er medlemmets (RLS: rådgiveren har kun SELECT). */
  kunMedlemmet: "Kun virksomheden kan sige ja til et mål.",
  /** Fund 13: «Aktivér» under Parkeret er også et klik — målet bekræftes i samme skrivning (aktiverFelter). */
  slippet: "Målet er parkeret — aktiverer I det igen under «Parkeret», tæller det som jeres.",
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

/**
 * Felterne, «Aktivér» (et parkeret mål → 'active') skriver (rådets fund 13):
 * er målet UBEKRÆFTET (null — kolonnen læst), er klikket også bekræftelsen:
 * bekraeftet_at = nu, bekraeftet_af = medlemmet. Kolonnen ulæst (undefined)
 * eller allerede bekræftet → kun status. `userId` null (rådgiveren eller
 * ingen bruger) → kun status: bekræftelsen er medlemmets.
 */
export function aktiverFelter(m: Pick<MaalTilBekraeftelse, "bekraeftet_at">, userId: string | null, nu: Date): Record<string, unknown> {
  if (m.bekraeftet_at === null && userId) return { status: "active", bekraeftet_at: nu.toISOString(), bekraeftet_af: userId };
  return { status: "active" };
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
 * Tæller målet i Score's disciplin («mål», 25 point)? Regnestykket i
 * filhovedet (beslutning 2/10, rådets fund 4):
 *   aktivt ∧ bekræftet ∧ frist ∧ (art ≠ 'tal' ∨ måltal)
 * `art` kræves ikke (0 af prods aktive manual-mål har en, målt 2/10); et
 * tal-mål skal have et måltal. «Sæt et mål med en frist.» er løfteren.
 */
export function taellerSomScoreMaal(m: MaalTilScore): boolean {
  if (m.status !== "active" || !erBekraeftet(m)) return false;
  if (typeof m.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(m.deadline)) return false;
  if (laesArt(m.art) === "tal") return tal(m.target_value);
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

/** Ankeret: max(bekraeftet_at som dansk dato, KVARTALSTJEK_FRA — defineret øverst, én kilde); null uden (læseligt) stempel. */
export function kvartalAnker(bekraeftetAt: string | null | undefined): string | null {
  if (typeof bekraeftetAt !== "string" || !bekraeftetAt.trim()) return null;
  const t = new Date(bekraeftetAt);
  if (Number.isNaN(t.getTime())) return null;
  const dato = kbhDato(t);
  return dato < KVARTALSTJEK_FRA ? KVARTALSTJEK_FRA : dato;
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

/** Grundene, dommen svarer med, når et kvartalstjek IKKE må registreres (runde 2, fund 9) — vises i stedet for en generisk fejl. */
export const KVARTALSTJEK_GRUND = {
  status: "Målets status passer ikke til valget — genindlæs siden.",
  ubekraeftet: "Kun et bekræftet mål har et kvartalstjek — sig ja til målet først.",
  ikkeForfaldent: "Kvartalstjekket er ikke forfaldent endnu — kortet vises, når det er.",
  aaretGaaet: "Målets år er gået — der er ikke flere kvartalstjek på det.",
  alleredeSvaret: "Kvartalstjekket er allerede besvaret — genindlæs siden.",
} as const;

export type KvartalstjekDom = { ok: true } | { ok: false; grund: string };

/**
 * Klientens spejl af databasens INSERT-policy på maal_kvartalstjek (rådets
 * fund 11; filhovedet «DATABASENS DOM») — MED GRUND (runde 2, fund 9): kaldes
 * FØR INSERT'en, så medlemmet får at vide, HVORFOR rækken ikke skrives (ikke
 * forfaldent · allerede svaret · ikke bekræftet · status passer ikke · året
 * gået) i stedet for policyens 42501. Ren; prøvet mod policyens udtryk i
 * dineMaalSkive3.guard dom 7. Målet gives som det STÅR, når rækken skrives —
 * efter handlingen (parkeret → 'parked', naaet → 'completed').
 */
export function doemKvartalstjek(
  maal: Pick<MaalTilKvartalstjek, "id" | "status" | "bekraeftet_at">,
  tjek: readonly KvartalstjekRaekke[],
  kvartal: Kvartal,
  valg: KvartalValg,
  nu: Date,
): KvartalstjekDom {
  const statusOk =
    valg === "parkeret" ? maal.status === "active" || maal.status === "parked"
    : valg === "naaet" ? maal.status === "active" || maal.status === "completed"
    : maal.status === "active";
  if (!statusOk) return { ok: false, grund: KVARTALSTJEK_GRUND.status };
  if (maal.bekraeftet_at === undefined || !erBekraeftet(maal)) return { ok: false, grund: KVARTALSTJEK_GRUND.ubekraeftet };
  const anker = kvartalAnker(maal.bekraeftet_at);
  if (!anker) return { ok: false, grund: KVARTALSTJEK_GRUND.ubekraeftet };
  const idag = kbhDato(nu);
  const dato = laegMaanederTilDato(anker, KVARTAL_MAANEDER * kvartal);
  const slut = laegMaanederTilDato(anker, TIDSLINJE_MAANEDER);
  if (idag >= slut) return { ok: false, grund: KVARTALSTJEK_GRUND.aaretGaaet };
  if (!(dato <= idag && idag < slut)) return { ok: false, grund: KVARTALSTJEK_GRUND.ikkeForfaldent };
  if (tjek.some((t) => t.milestone_id === maal.id && (laesKvartal(t.kvartal) ?? 0) >= kvartal)) return { ok: false, grund: KVARTALSTJEK_GRUND.alleredeSvaret };
  return { ok: true };
}

/** Ja/nej-formen af doemKvartalstjek — samme dom, uden grunden. */
export function maaRegistrereKvartalstjek(
  maal: Pick<MaalTilKvartalstjek, "id" | "status" | "bekraeftet_at">,
  tjek: readonly KvartalstjekRaekke[],
  kvartal: Kvartal,
  valg: KvartalValg,
  nu: Date,
): boolean {
  return doemKvartalstjek(maal, tjek, kvartal, valg, nu).ok;
}

/** Målets status, som rækken ser den EFTER handlingen (handlingen skrives FØR rækken): parkeret → 'parked', naaet → 'completed', ellers uændret. */
export function statusEfterKvartalValg(status: string, valg: KvartalValg): string {
  if (valg === "parkeret") return "parked";
  if (valg === "naaet") return "completed";
  return status;
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
