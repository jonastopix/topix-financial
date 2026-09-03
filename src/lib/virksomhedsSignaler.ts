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
 * 4. ALERTS. AdvisorDashboard læste kun ULÆSTE (read_at null) inden for
 *    30 dage og kun typerne alert_result_negative og alert_revenue_drop;
 *    MemberDetail læste alle tre typer inden for 60 dage uanset read_at.
 *    VALGT: ulæste inden for 30 dage (kalderen leverer kun ulæste; vinduet
 *    måles her mod created_at), alle tre typer. alert_negative_cash og
 *    alert_revenue_drop tæller KUN som fallback når det samme signal ikke
 *    allerede kommer fra friske facts — MemberDetails dedup-regel
 *    («alerten og MoM'en måler SAMME signal … og må ikke stå som to
 *    rækker») og AdvisorDashboards «reasons.length === 0» siger det samme.
 *
 * 5. ALVOR. AdvisorDashboards skala bevares: bankovertræk 90,
 *    omsætningsfald 80, omsætningsfald detekteret (alert) 75, negativt
 *    resultat (alert) 60. De nye placeres i samme skala:
 *      - alert_negative_cash 85: siger det samme som bankovertræk, men
 *        uden garantien for friske tal — derfor under 90, over 80.
 *      - resultatfald MoM 70: penge tabt på bundlinjen, mindre alvorligt
 *        end omsætningsfald (som varsler det) — under 75, over 60.
 *      - budget under 50 / over 40: afvigelse fra en PLAN, ikke fra
 *        virkeligheden — under alle alerts. Over budget er stadig en
 *        afvigelse rådgiveren skal kende, men mindre presserende.
 *      - agentforslag venter 55: en afgørelse der venter på rådgiveren
 *        selv — over budget, under negativt resultat.
 *      - venter på svar 70 + min(antal, 20): ulæste beskeder er altid
 *        handling; flere er mere.
 *      - friske tal 30: godt nyt, skal ses, haster ikke.
 *      - ikke hørt fra længe: se regnestykket ved funktionen. Aldrig
 *        skrevet er 95 — den stærkeste grund til at stå på listen
 *        (designets §3.5, Jonas 3/9: «vi må ikke glemme folk i det her»).
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

/** En ulæst finansiel alert (notifications med read_at IS NULL). */
export interface UlaestAlert {
  type: string;
  created_at: string;
}

/** Alt dommen har brug for om én virksomhed. Kalderen samler; motoren dømmer. */
export interface VirksomhedsInput {
  /** Seneste committede fact; null når virksomheden ingen tal har. */
  senesteFact: FactPunkt | null;
  /** Fact'et før det seneste; null når der kun er ét. */
  forrigeFact: FactPunkt | null;
  /** committed_at på senesteFact (ISO); null uden tal. */
  senesteCommittedAt: string | null;
  /** Ulæste alerts; motoren måler selv 30-dages vinduet mod created_at. */
  ulaesteAlerts: UlaestAlert[];
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
  | "alert_negative_cash"
  | "omsaetningsfald_mom"
  | "alert_revenue_drop"
  | "resultatfald_mom"
  | "alert_result_negative"
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
const ALERT_VINDUE_DAGE = 30;
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
  // Regnestykket for alvor:
  //   aldrig skrevet                     → 95 (fast; over alle tal-signaler
  //                                        på nær intet — ingen må glemmes)
  //   skrevet, N hele dage siden, N > 21 → 60 + min(N − 21, 30)
  //     dag 22 → 61, dag 30 → 69, dag 51 og derover → 90.
  //     Starter under bankovertræk (90) og når det først efter en måneds
  //     ekstra tavshed; 30 er loftet så 90 aldrig overskrides og aldrig
  //     skrevet (95) altid ligger over.
  //   skrevet, N <= 21                    → intet signal.
  // Hele dage: Math.floor((now − seneste) / 86400000), som før.
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
        alvor: 60 + Math.min(dage - STALE_DAGE, 30),
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

  // ── Kø 3: Stikker ud i tallene — de to domme samlet (valg 1–5) ──
  const seneste = input.senesteFact;
  const forrige = input.forrigeFact;
  const frisk = seneste ? isFiguresFresh(seneste.period_key, now) : false;

  // Bankovertræk fra friske facts (AdvisorDashboard: cash < 0, gated).
  let bankDaekket = false;
  if (frisk && seneste && seneste.bank_balance != null && seneste.bank_balance < 0) {
    bankDaekket = true;
    signaler.push({
      noegle: "bankovertraek",
      koe: "stikker_ud",
      tekst: "Bankovertræk",
      alvor: 90,
      detalje: `Bank ${kr(seneste.bank_balance)}${seneste.period_label ? ` (${seneste.period_label})` : ""}`,
    });
  }

  // Omsætningsfald MoM fra friske facts (kun fald, valg 2; abs-nævner, valg 3).
  let omsaetningsfaldDaekket = false;
  if (frisk && seneste && forrige) {
    const pct = pctAendring(seneste.omsaetning, forrige.omsaetning);
    if (pct != null && pct <= -MOM_TAERSKEL_PCT) {
      omsaetningsfaldDaekket = true;
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

  // Ulæste alerts inden for 30 dage (valg 4). Typer uden for de tre ignoreres.
  const alertGraense = now.getTime() - ALERT_VINDUE_DAGE * MS_PER_DOEGN;
  const friskeAlerts = input.ulaesteAlerts.filter((a) => new Date(a.created_at).getTime() >= alertGraense);
  const harAlert = (type: string) => friskeAlerts.some((a) => a.type === type);

  if (harAlert("alert_result_negative")) {
    signaler.push({
      noegle: "alert_result_negative",
      koe: "stikker_ud",
      tekst: "Negativt resultat",
      alvor: 60,
    });
  }
  if (!omsaetningsfaldDaekket && harAlert("alert_revenue_drop")) {
    signaler.push({
      noegle: "alert_revenue_drop",
      koe: "stikker_ud",
      tekst: "Omsætningsfald detekteret",
      alvor: 75,
    });
  }
  if (!bankDaekket && harAlert("alert_negative_cash")) {
    signaler.push({
      noegle: "alert_negative_cash",
      koe: "stikker_ud",
      tekst: "Negativ bankbeholdning detekteret",
      alvor: 85,
    });
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
