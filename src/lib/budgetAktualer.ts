/**
 * budgetAktualer — de realiserede måneder bag budgettets forecast og
 * cashflow, som rene funktioner uden React.
 *
 * SKELLET (recon-manglende-maaneder.md, 7/9): en måned uden rapport har
 * ingen fact-række; i en fact er en UMÅLT metric en manglende nøgle, mens
 * en målt nul er tallet 0. parseMetrics og factsToDanishMetrics bevarer
 * skellet — og HbBudgetSimulator/HbBudgetCashflow smed det væk i ét
 * `?? 0` hver. Målt i prod 7/9: 314 facts, 277 med et tal, 12 med
 * revenue = 0, 25 UDEN nøglen. Begge tilstande er reelle.
 *
 * REGLEN: undefined er ukendt, 0 er nul. Her læses facts gennem
 * factsToDanishMetricsNullable, og ukendt bæres som null hele vejen:
 *
 *   - Forecastet (forecastSerie): en ukendt måned er IKKE 0 — den holdes
 *     ude af vækstfaktoren og udfyldes med budget × faktor, som de måneder
 *     der endnu ikke er kommet. En målt nul er en nul og trækker faktoren
 *     ned, som den skal. `realiseret[i]` siger hvilke måneder der bærer et
 *     rigtigt tal, så fladen kan vise hullet i stedet for at skjule det.
 *
 *   - Nettoflowet (nettoFlow): kendt kun når BÅDE omsætning og mindst én
 *     omkostningspost er målt; ellers null. Saldokurven (saldoKurve)
 *     behandler en måned med ukendt nettoflow som en måned uden rapport:
 *     budgettets nettoflow, tegnet som forecast. En advarsel om negativ
 *     saldo bygges dermed på budgettet, aldrig på et hul.
 *
 * Omkostningssummen er en GRÆNSE, ikke rettet her: kendes én af posterne,
 * summeres de kendte (samme form som calcTotalExpenses). Ukendt er den kun
 * når ingen post er målt.
 *
 * ESTIMATER (10/9, data_basis-kontrakten: «Beregninger udelukker estimater.
 * Visninger må vise dem, men skal sige det»): en årsrapport-række er årets
 * tal delt med tolv — tolv identiske måneder, ingen af dem målt. Før talte
 * de som realiserede: fyldt prik «Realiseret måned», med i vækstfaktoren,
 * saldoen løb med dem. Nu holdes de ude af aktualerne som BVA'en gør det
 * (HbBudgetBva, 26/8), og `estimeredeMaaneder` siger hvilke måneder det
 * gælder, så fladen kan mærke dem. En fact uden data_basis regnes som målt
 * (ældre kaldere og tests).
 */
import { factsToDanishMetricsNullable } from "@/lib/factsAdapter";
import { deriveGrowthFactor } from "@/lib/budgetEngine";

/** Det budgettet behøver fra en fact. Ingen nøgle = null, aldrig 0. */
export interface FactTilAktual {
  period_key: string;
  metrics: Record<string, number | null> | null | undefined;
  /** 'estimated' = årsrapport /12 — tælles ikke som realiseret. Udeladt = målt. */
  data_basis?: "measured" | "estimated";
}

/** Månedsindeks (0–11) for måneden i period_key, eller null. */
function maanedsIndeks(fact: FactTilAktual, year: string): number | null {
  const [factYear, monthStr] = fact.period_key.split("-");
  if (factYear !== year) return null;
  const monthIdx = parseInt(monthStr, 10) - 1;
  if (Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return null;
  return monthIdx;
}

/** Årets måneder (0–11) der KUN bæres af en estimatrække — til mærkning, sorteret. */
export function estimeredeMaaneder(facts: readonly FactTilAktual[], year: string): number[] {
  const estimerede = new Set<number>();
  const maalte = new Set<number>();
  for (const fact of facts) {
    const i = maanedsIndeks(fact, year);
    if (i == null) continue;
    (fact.data_basis === "estimated" ? estimerede : maalte).add(i);
  }
  return [...estimerede].filter((i) => !maalte.has(i)).sort((a, b) => a - b);
}

export interface MaanedsAktual {
  /** Målt omsætning; null når rapporten ingen omsætningslinje bar. */
  omsaetning: number | null;
  /** Sum af de MÅLTE omkostningsposter (|beløb|); null når ingen post er målt. */
  omkostninger: number | null;
  /** Banksaldo ultimo; null når umålt. */
  bank: number | null;
}

const OMKOSTNINGSPOSTER = [
  "loenninger",
  "salgsomkostninger",
  "lokaleomkostninger",
  "administrationsomkostninger",
  "direkte_omkostninger",
] as const;

/** Summen af de målte poster; null når ingen af dem er målt. */
export function sumMaalteOmkostninger(
  kf: Record<string, number | null>,
  medAfskrivninger: boolean,
): number | null {
  const poster: readonly string[] = medAfskrivninger ? [...OMKOSTNINGSPOSTER, "afskrivninger"] : OMKOSTNINGSPOSTER;
  let sum = 0;
  let maalte = 0;
  for (const post of poster) {
    const v = kf[post];
    if (v == null) continue;
    sum += Math.abs(v);
    maalte++;
  }
  return maalte === 0 ? null : sum;
}

/**
 * Årets facts → aktual pr. måned (0–11). Måneder uden fact er ikke i
 * mappet; måneder MED fact bærer null for det der ikke blev målt.
 * Simulatoren regner afskrivninger med i omkostningerne, cashflowet ikke
 * (arvet fra de to gamle faner — uændret her).
 */
export function aktualerFraFacts(
  facts: readonly FactTilAktual[],
  year: string,
  opts: { medAfskrivninger: boolean },
): Record<number, MaanedsAktual> {
  const map: Record<number, MaanedsAktual> = {};
  for (const fact of facts) {
    // Et estimat er ikke realiseret (data_basis-kontrakten) — springes over.
    if (fact.data_basis === "estimated") continue;
    const monthIdx = maanedsIndeks(fact, year);
    if (monthIdx == null) continue;
    const kf = factsToDanishMetricsNullable(fact.metrics);
    map[monthIdx] = {
      omsaetning: kf.omsaetning ?? null,
      omkostninger: sumMaalteOmkostninger(kf, opts.medAfskrivninger),
      bank: kf.bank_balance ?? null,
    };
  }
  return map;
}

export interface ForecastSerie {
  /** 12 tal: det målte hvor det findes, ellers budget × faktor. */
  vaerdier: number[];
  /** 12 flag: bærer måneden et MÅLT tal? En ukendt måned er false, også før sidste målte. */
  realiseret: boolean[];
  /** Vækstfaktoren regnet KUN på de målte måneder (deriveGrowthFactor, capped [0.1, 3]). */
  faktor: number;
  /** Indeks for sidste målte måned; −1 uden målinger. */
  sidsteRealiseret: number;
}

/**
 * Forecast for én serie (omsætning eller omkostninger): aktualer med null
 * for ukendt, budget pr. måned. Ukendte måneder — huller uden fact OG
 * facts uden tallet — udfyldes med budget × faktor og holdes ude af
 * faktoren. En målt 0 er en måling: den står som 0 og trækker faktoren ned.
 */
export function forecastSerie(aktualer: readonly (number | null)[], budget: readonly number[]): ForecastSerie {
  const kendteAktualer: number[] = [];
  const kendteBudgetter: number[] = [];
  let sidsteRealiseret = -1;
  aktualer.forEach((a, i) => {
    if (a == null) return;
    kendteAktualer.push(a);
    kendteBudgetter.push(budget[i] ?? 0);
    sidsteRealiseret = i;
  });
  const faktor = deriveGrowthFactor(kendteAktualer, kendteBudgetter);
  const vaerdier = budget.map((b, i) => {
    const a = aktualer[i];
    return a == null ? Math.round(b * faktor) : a;
  });
  return { vaerdier, realiseret: aktualer.map((a) => a != null), faktor, sidsteRealiseret };
}

/** Nettoflowet for en måned: kendt kun når både omsætning og omkostninger er målt. */
export function nettoFlow(a: MaanedsAktual | undefined): number | null {
  if (!a || a.omsaetning == null || a.omkostninger == null) return null;
  return a.omsaetning - a.omkostninger;
}

export interface SaldoPunkt {
  /** Realiseret saldo (banksaldo, eller forrige saldo + målt nettoflow); null når måneden er forecast. */
  actual: number | null;
  /** Forecast-saldo (forrige saldo + budgettets nettoflow); null når måneden er realiseret. */
  forecast: number | null;
  budget: number;
  /** Bærer måneden et realiseret tal (banksaldo eller kendt nettoflow)? */
  isActual: boolean;
  /** Måneden HAR en rapport, men hverken banksaldo eller kendt nettoflow — vist som forecast. */
  rapportUdenTal: boolean;
  /** Det flow der løb ind i saldoen: målt nettoflow, ellers budgettets. */
  nettoFlow: number;
}

/**
 * Akkumuleret saldo, måned for måned. Tre grene i prioritet: banksaldo målt
 * → saldoen SÆTTES; nettoflow kendt → saldoen løber med det; ellers (ingen
 * rapport, eller rapport uden tal) → saldoen løber med budgettets nettoflow
 * og måneden er forecast. Grenen «rapport uden tal» var før et nettoflow på
 * (0 − omkostninger), tegnet som realiseret.
 */
export function saldoKurve(
  startsaldo: number,
  aktualer: Record<number, MaanedsAktual>,
  budgetNetto: readonly number[],
): SaldoPunkt[] {
  let runningActual = startsaldo;
  let runningBudget = startsaldo;
  return budgetNetto.map((budgetFlow, i) => {
    const a = aktualer[i];
    const net = nettoFlow(a);
    let isActual: boolean;
    let flow: number;
    if (a?.bank != null) {
      // Banksaldoen er målt: flowet i tabellen er den kendte del, ellers budgettets.
      runningActual = a.bank;
      isActual = true;
      flow = net ?? budgetFlow;
    } else if (net != null) {
      runningActual += net;
      isActual = true;
      flow = net;
    } else {
      runningActual += budgetFlow;
      isActual = false;
      flow = budgetFlow;
    }
    runningBudget += budgetFlow;
    return {
      actual: isActual ? Math.round(runningActual) : null,
      forecast: !isActual ? Math.round(runningActual) : null,
      budget: Math.round(runningBudget),
      isActual,
      rapportUdenTal: a !== undefined && !isActual,
      nettoFlow: flow,
    };
  });
}
