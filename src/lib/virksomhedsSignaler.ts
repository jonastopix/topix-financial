/**
 * src/lib/virksomhedsSignaler.ts
 *
 * ÉN ren dom over «hvad skal rådgiveren vide om denne virksomhed nu».
 * Samler de to inline-domme der fandtes 3/9 2026 — forsidens fem buckets
 * i AdvisorDashboard.tsx (l. 803–851, inde i en queryFn) og «Hvad stikker
 * ud» i MemberDetail.tsx (l. 726–832, en IIFE) — til én funktion med
 * tests, som docs/raadgiverfladen-design.md §4 blok 1 kræver: motor før
 * flade. Forsiden bruger den pr. virksomhed til køerne (§3.5); blok 1 på
 * virksomhedssiden bruger den for én virksomhed.
 *
 * Fem af forsidens syv køer afgøres her: ikke_hoert_fra_laenge,
 * venter_paa_svar, stikker_ud, agentforslag_venter, friske_tal.
 * FORNYELSER og INDGANGE hører IKKE til her — de kommer fra egne motorer
 * (afgoerFornyelsestilstand i src/lib/fornyelse.ts og betalingsfristen i
 * src/lib/betalingsfrist.ts) og lægges i køerne af kalderen.
 *
 * Ingen imports. Ingen Date-afhængighed ud over `now`-parameteren (valgfri,
 * `new Date()` som default), så filen kan læses af både Vite/Vitest og
 * Deno uden ændring — samme mønster som membershipTier.ts. Skal den
 * spejles til _shared/, er filhovedet den eneste tilladte forskel.
 *
 * VALG hvor de to gamle domme var uenige (alle låst af testen i
 * src/lib/__tests__/virksomhedsSignaler.test.ts):
 *
 * 1. FRISKHEDSGATE på tal-signaler. AdvisorDashboard gatede bankovertræk
 *    og omsætningsfald på isFiguresFresh (periode inden for tre
 *    kalendermåneder); MemberDetail gatede ikke. VALGT: gate. Gamle tal
 *    der «stikker ud» er ikke et signal om NU, og AdvisorDashboards egen
 *    kommentar siger hvorfor: «fejler til at SKJULE gamle/ukendte
 *    afvigelser frem for at vise dem». Gælder bankovertræk, omsætnings-
 *    fald, resultatfald og budgetafvigelse — alt der læses af facts.
 *
 * 2. MoM-RETNING. AdvisorDashboard tog kun fald (revenueTrendPct <= -15);
 *    MemberDetail tog begge retninger (|pct| >= 15). VALGT: kun fald.
 *    Køen hedder «stikker ud i tallene» og samler det der er galt; en
 *    stigning er ikke galt. (AdvisorDashboards bucket «positive», som
 *    tog stigning >= 10 %, er ikke i designets §3.5 og ligger ikke her.)
 *
 * 3. MoM-NÆVNER. AdvisorDashboard delte med prevRev (uden abs);
 *    MemberDetail brugte pctChange, som deler med Math.abs(prev). VALGT:
 *    Math.abs(prev). Uden abs vender fortegnet når forrige periode var
 *    negativ (resultat −100 → −150 ville blive «+50 %»). Tærsklen er 15
 *    begge steder, og «præcis 15» tæller med begge steder (<= -15 hhv.
 *    !(|pct| < 15)) — det bevares.
 *
 * 4. ALERTS ER UDE — besluttet 3/9 2026 sen aften (Jonas). Begge gamle
 *    domme læste notifications af typerne alert_result_negative,
 *    alert_revenue_drop og alert_negative_cash (skrevet af edge-funktionen
 *    detect-financial-alerts). Den funktion bygger vi ikke videre på: den
 *    udløses kun fra klienten ved commit af en rapport — ingen upload,
 *    ingen alerts, uanset hvor skæve tallene bliver — og den skriver én
 *    kopi pr. rådgiver, så read_at er pr. modtager: markerer den ene
 *    rådgiver en alert som læst, står den stadig ulæst hos den anden.
 *    VALGT: alerts tages helt ud af dommen, ikke båret videre ind i den nye
 *    flade fordi de tilfældigvis lå der. Motoren regner selv bankovertræk,
 *    omsætningsfald og budgetafvigelse ud af financial_report_facts — den
 *    rigtige kilde, altid opdateret. To af de tre alert-signaler var
 *    alligevel kun fallback når friske facts ikke sagde det samme.
 *    detect-financial-alerts rører vi ikke; den kører videre, vi dømmer
 *    bare ikke på den.
 *
 *    KONSEKVENS: uden friske facts giver «stikker ud» nu INTET. En
 *    virksomhed uden committede tal, eller med tal ældre end tre
 *    kalendermåneder, får ingen tal-signaler. Det er bevidst — vi opfinder
 *    ikke et signal ud af data der ikke findes. Målt 1/9: fjorten af
 *    treogtredive virksomheder havde ikke ét målt tal. For dem bærer
 *    «Ikke hørt fra længe» hele signalet.
 *
 * 5. ALVOR. AdvisorDashboards skala bevares for det der er tilbage:
 *    bankovertræk 90, omsætningsfald 80. (Alert-graderne 75 og 60 er
 *    udgået med valg 4.) De nye placeres i samme skala:
 *      - resultatfald MoM 70: penge tabt på bundlinjen, mindre alvorligt
 *        end omsætningsfald (som varsler det).
 *      - budget under 50 / over 40: afvigelse fra en PLAN, ikke fra
 *        virkeligheden — under alle facts-signaler. Over budget er stadig
 *        en afvigelse rådgiveren skal kende, men mindre presserende.
 *      - agentforslag venter 55: en afgørelse der venter på rådgiveren
 *        selv — over budget, under resultatfald.
 *      - venter på svar 70 + min(antal, 20): ulæste beskeder er altid
 *        handling; flere er mere.
 *      - friske tal 30: godt nyt, skal ses, haster ikke.
 *      - ikke hørt fra længe: 60 → 95 som en kurve der nærmer sig 95 uden
 *        at nå det (regnestykket ved funktionen). Aldrig skrevet er 95 —
 *        den stærkeste grund til at stå på listen (designets §3.5, Jonas
 *        3/9: «vi må ikke glemme folk i det her»). Rettet 3/9 kl. 23:36:
 *        den første udgave loftede ved 90 fra dag 51, så alle med mere end
 *        51 dages tavshed fik SAMME alvor og indlæsningsrækkefølgen afgjorde
 *        (set i drift: 57, 126, 66, 85 … dage, ikke faldende). Nu er
 *        kurven strengt stigende: flere dage er altid højere alvor.
 *
 * 6. MILESTONES OG LØFTESTÆNGER. MemberDetail lagde forfaldne milestones
 *    og handout-løftestænger ind som én dæmpet række. VALGT: ude. De er
 *    ikke signaler om at noget er galt — de er aktivitet, og designets §8
 *    henfører dem til blok 6 (Aktivitet). Inputtet bærer tallene, så
 *    kalderen ikke skal ændres den dag blok 6 vil have dem; motoren
 *    laver ingen signaler af dem nu.
 *
 * 7. LOFT. MemberDetail cappede til fire signal-rækker. VALGT: intet loft
 *    her. Motoren giver alt, sorteret; fladen skærer. Et loft er en
 *    visningsbeslutning, ikke en dom.
 */

/** Ét fact-punkt: de fire tal dommen læser, plus periode. */
export interface FactPunkt {
  /** "YYYY-MM" — bruges til friskhedsgaten. */
  period_key: string | null;
  /** Menneskelæsbar periode, fx "Aug 2026" — bruges i tekster. */
  period_label: string | null;
  omsaetning: number | null;
  resultat_foer_skat: number | null;
  bank_balance: number | null;
}

/** Alt dommen har brug for om én virksomhed. Kalderen samler; motoren dømmer. */
export interface VirksomhedsInput {
  /** Seneste committede fact; null når virksomheden ingen tal har. */
  senesteFact: FactPunkt | null;
  /** Fact'et før det seneste; null når der kun er ét. */
  forrigeFact: FactPunkt | null;
  /** committed_at på senesteFact (ISO); null uden tal. */
  senesteCommittedAt: string | null;
  /** Budgetteret omsætning for senesteFacts periode; null når intet budget. */
  budgetOmsaetning: number | null;
  /** Antal forfaldne, ikke-afsluttede milestones. Modtages, bruges ikke (valg 6). */
  forfaldneMilestones: number;
  /** Antal valgte løftestænger fra handouts. Modtages, bruges ikke (valg 6). */
  loeftestaenger: number;
  /** Beskeder der venter på rådgiverens svar. */
  ulaesteBeskeder: number;
  /** Seneste besked i samtalen (ISO). null = der er ALDRIG skrevet. */
  senesteBeskedAt: string | null;
  /** Om virksomheden har mindst én committet fact. Modtages; stale-reglen bruger den ikke længere (designets §3.5). */
  harCommittedeTal: boolean;
  /** Agentforslag uden afgørelse (agent_proposals uden decided_at). */
  agentforslagVenter: number;
}

/** De fem køer denne motor afgør. Fornyelser og indgange kommer fra egne motorer. */
export type SignalKoe =
  | "ikke_hoert_fra_laenge"
  | "venter_paa_svar"
  | "stikker_ud"
  | "agentforslag_venter"
  | "friske_tal";

export type SignalNoegle =
  | "aldrig_skrevet"
  | "ingen_dialog"
  | "ulaeste_beskeder"
  | "bankovertraek"
  | "omsaetningsfald_mom"
  | "resultatfald_mom"
  | "budget_under"
  | "budget_over"
  | "agentforslag_venter"
  | "friske_tal";

export interface Signal {
  /** Stabil nøgle — samme betydning uanset tekst. */
  noegle: SignalNoegle;
  /** Hvilken af forsidens køer signalet hører til. */
  koe: SignalKoe;
  /** Kort dansk tekst, kan skimmes på to sekunder. */
  tekst: string;
  /** Alvor 0–100; højere først. Skalaen står i filhovedet (valg 5). */
  alvor: number;
  /** Valgfri detalje, fx tallene bag. */
  detalje?: string;
}

const MS_PER_DOEGN = 86400000;
const STALE_DAGE = 21;
const FRISKE_TAL_DAGE = 14;
const MOM_TAERSKEL_PCT = 15;
const BUDGET_TAERSKEL_PCT = 10;

/**
 * FLYTTET ORDRET fra src/components/AdvisorDashboard.tsx l. 50–60 (3/9 2026).
 * Null-safe: manglende/uparsbar periode behandles som IKKE frisk, så vi fejler til
 * at SKJULE gamle/ukendte afvigelser frem for at vise dem.
 */
export function isFiguresFresh(periodKey: string | null | undefined, now: Date = new Date()): boolean {
  if (!periodKey) return false;
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!m) return false;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10); // 1-12
  if (!year || month < 1 || month > 12) return false;
  const periodStart = new Date(year, month - 1, 1);
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  return periodStart >= cutoff;
}

/** Procentvis ændring med Math.abs(prev) som nævner (valg 3). null når det ikke kan regnes. */
function pctAendring(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function kr(n: number): string {
  return `${Math.round(n).toLocaleString("da-DK")} kr.`;
}

function heleDageSiden(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / MS_PER_DOEGN);
}

/**
 * Afgør signalerne for én virksomhed. Returnerer alle signaler sorteret
 * efter alvor faldende; ved lige alvor bevares rækkefølgen de blev
 * fundet i (stabil sortering).
 */
export function afgoerVirksomhedsSignaler(input: VirksomhedsInput, now: Date = new Date()): Signal[] {
  const signaler: Signal[] = [];

  // ── Kø 1: Ikke hørt fra længe — VENDT (designets §3.5, besluttet 3/9) ──
  //
  // Før: `has_verified_metrics && lastContact && daysSinceContact > 21`
  // (AdvisorDashboard.tsx:817). To virksomheder kunne aldrig blive stale:
  // den uden samtale (ingen lastContact) og den uden committede tal.
  // Målt 1/9: 14 af 33 uden ét tal, 13 havde aldrig uploadet — halvdelen
  // af porteføljen, og netop den tavse halvdel.
  //
  // Nu: kravet om committede tal er væk. Aldrig skrevet → MED, som det
  // stærkeste signal. Skrevet → med når hele dage siden > 21.
  //
  // Regnestykket for alvor (rettet 3/9 kl. 23:36 efter fejl set i drift):
  //   aldrig skrevet                     → 95 (fast; over alle tavse —
  //                                        ingen må glemmes)
  //   skrevet, N hele dage siden, N > 21 → 95 − 35 / (1 + (N − 21) / 30)
  //     En kurve der starter ved 60 (N = 21, som ikke udløser) og nærmer
  //     sig 95 uden nogensinde at nå det. Strengt stigende i N: flere
  //     dage er ALTID højere alvor, ingen to dagtal får samme alvor.
  //     dag 22  → 95 − 35 / 1,033 = 61,13
  //     dag 30  → 95 − 35 / 1,300 = 68,08
  //     dag 60  → 95 − 35 / 2,300 = 79,78
  //     dag 86  → 95 − 35 / 3,167 = 83,95
  //     dag 126 → 95 − 35 / 4,500 = 87,22
  //     dag 365 → 95 − 35 / 12,47 = 92,19
  //     aldrig skrevet → 95, over alle ovenstående uanset N.
  //   skrevet, N <= 21                    → intet signal.
  // Den første udgave var 60 + min(N − 21, 30): lineær med loft 90 fra dag
  // 51, så alle over 51 dage fik samme alvor og indlæsningsrækkefølgen
  // afgjorde (set i drift: 57, 126, 66, 85, 86, 78, 59, 86, 77, 45 dage).
  // Loftet var sat for at holde 95 øverst; kurven gør det samme uden at
  // klumpe. Skalaen er bevaret: omsætningsfald (80) overhales ved N = 61
  // (35 / (1 + 40/30) = 15 → 80,0), bankovertræk (90) ved N = 201
  // (35 / (1 + 180/30) = 5 → 90,0) — altså efter to hhv. knap syv
  // måneders tavshed.
  // Hele dage: Math.floor((now − seneste) / 86400000), som før.
  //
  // NOTE: «aldrig skrevet» behøver ikke være et fast tal — den kunne
  // rangordnes efter hvor længe virksomheden har eksisteret uden at
  // skrive, hvis inputtet bar et tidspunkt at måle fra (fx
  // companies.created_at eller kontraktstart). Det gør det ikke i dag, og
  // det ville kræve en ny kilde; derfor fast 95 nu.
  if (input.senesteBeskedAt === null) {
    signaler.push({
      noegle: "aldrig_skrevet",
      koe: "ikke_hoert_fra_laenge",
      tekst: "Har aldrig skrevet",
      alvor: 95,
    });
  } else {
    const dage = heleDageSiden(input.senesteBeskedAt, now);
    if (dage > STALE_DAGE) {
      signaler.push({
        noegle: "ingen_dialog",
        koe: "ikke_hoert_fra_laenge",
        tekst: `Ingen dialog i ${dage} dage`,
        alvor: 95 - 35 / (1 + (dage - STALE_DAGE) / 30),
      });
    }
  }

  // ── Kø 2: Venter på dit svar (AdvisorDashboard.tsx:803–806, uændret) ──
  if (input.ulaesteBeskeder > 0) {
    const n = input.ulaesteBeskeder;
    signaler.push({
      noegle: "ulaeste_beskeder",
      koe: "venter_paa_svar",
      tekst: `${n} ulæst${n > 1 ? "e" : ""} besked${n > 1 ? "er" : ""}`,
      alvor: 70 + Math.min(n, 20),
    });
  }

  // ── Kø 3: Stikker ud i tallene — kun friske facts (valg 1–5). Uden
  //    friske facts giver denne kø INTET (valg 4, konsekvensen). ──
  const seneste = input.senesteFact;
  const forrige = input.forrigeFact;
  const frisk = seneste ? isFiguresFresh(seneste.period_key, now) : false;

  // Bankovertræk fra friske facts (AdvisorDashboard: cash < 0, gated).
  if (frisk && seneste && seneste.bank_balance != null && seneste.bank_balance < 0) {
    signaler.push({
      noegle: "bankovertraek",
      koe: "stikker_ud",
      tekst: "Bankovertræk",
      alvor: 90,
      detalje: `Bank ${kr(seneste.bank_balance)}${seneste.period_label ? ` (${seneste.period_label})` : ""}`,
    });
  }

  // Omsætningsfald MoM fra friske facts (kun fald, valg 2; abs-nævner, valg 3).
  if (frisk && seneste && forrige) {
    const pct = pctAendring(seneste.omsaetning, forrige.omsaetning);
    if (pct != null && pct <= -MOM_TAERSKEL_PCT) {
      signaler.push({
        noegle: "omsaetningsfald_mom",
        koe: "stikker_ud",
        tekst: `Omsætning faldt ${Math.abs(Math.round(pct))}% MoM`,
        alvor: 80,
        detalje: `${kr(forrige.omsaetning as number)} → ${kr(seneste.omsaetning as number)}`,
      });
    }
    // Resultatfald MoM (MemberDetail havde den; kun fald, valg 2).
    const pctRes = pctAendring(seneste.resultat_foer_skat, forrige.resultat_foer_skat);
    if (pctRes != null && pctRes <= -MOM_TAERSKEL_PCT) {
      signaler.push({
        noegle: "resultatfald_mom",
        koe: "stikker_ud",
        tekst: `Resultat f. skat faldt ${Math.abs(Math.round(pctRes))}% MoM`,
        alvor: 70,
        detalje: `${kr(forrige.resultat_foer_skat as number)} → ${kr(seneste.resultat_foer_skat as number)}`,
      });
    }
  }

  // Budgetafvigelse over 10 % (MemberDetail.tsx:779–794; gated på friskhed, valg 1).
  if (frisk && seneste && seneste.omsaetning != null && input.budgetOmsaetning != null && input.budgetOmsaetning !== 0) {
    const pct = ((seneste.omsaetning - input.budgetOmsaetning) / Math.abs(input.budgetOmsaetning)) * 100;
    if (Math.abs(pct) > BUDGET_TAERSKEL_PCT) {
      const under = pct < 0;
      signaler.push({
        noegle: under ? "budget_under" : "budget_over",
        koe: "stikker_ud",
        tekst: `Omsætning ${Math.abs(Math.round(pct))}% ${under ? "under" : "over"} budgetteret`,
        alvor: under ? 50 : 40,
        detalje: `Faktisk ${kr(seneste.omsaetning)} mod budget ${kr(input.budgetOmsaetning)}`,
      });
    }
  }

  // ── Kø 6: Agentforslag der venter på afgørelse (nyt, designets §3.5) ──
  if (input.agentforslagVenter > 0) {
    const n = input.agentforslagVenter;
    signaler.push({
      noegle: "agentforslag_venter",
      koe: "agentforslag_venter",
      tekst: `${n} agentforslag venter på din afgørelse`,
      alvor: 55,
    });
  }

  // ── Kø 7: Friske tal (AdvisorDashboard.tsx:808–812: committed inden for 14 dage) ──
  if (input.senesteCommittedAt !== null) {
    const graense = now.getTime() - FRISKE_TAL_DAGE * MS_PER_DOEGN;
    if (new Date(input.senesteCommittedAt).getTime() >= graense) {
      signaler.push({
        noegle: "friske_tal",
        koe: "friske_tal",
        tekst: `Ny rapport for ${seneste?.period_label || "seneste periode"}`,
        alvor: 30,
      });
    }
  }

  // Sortering: alvor faldende; ved lige alvor den rækkefølge de blev fundet i.
  return signaler
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.alvor - a.s.alvor || a.i - b.i)
    .map(({ s }) => s);
}
