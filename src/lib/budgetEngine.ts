/**
 * budgetEngine — budgettets maskinlag, udskilt som REN FLYTNING fra
 * Budget.tsx + budget/-tabs + BudgetImport/BudgetFromAccounts (design-blok
 * hb-budget-design.md, godkendt 2026-08-05). Ejer AL afkodning af
 * budget_targets og ALLE klient-skriveveje (W1-W7, recon §2.2) — gammel
 * flade (/budget) og Hb-fladen (/budgettering) deler motoren; skriveveje
 * duplikeres aldrig.
 *
 * Motoren ejer INGEN toasts og INGEN React-state: funktionerne returnerer
 * værdier og thrower på fejl (hvor originalen tjekkede fejl — steder hvor
 * originalen bevidst ignorerede insert-fejl, gør motoren det samme).
 * Gamle komponenter beholder deres toasts 1:1 på call-sites; Hb-fladen
 * kvitterer stille (savedNote-mønstret).
 *
 * De eneste afvigelser fra ordret flytning er bogført i design-blokkens
 * §a4: U1 (W6-company-filter) og U2 (webshop-markeren udgår) — begge
 * kommenteret ved koden i confirmBudgetFromAccounts.
 *
 * PERIOD-FELTETS OVERLOADS (de facto-kontrakt, recon §2.1 — ingen
 * DB-constraint):
 *   værdirække:   period = "YYYY-{base|optimistisk|pessimistisk}-{0..11}"
 *   __template__: period = skabelon-key ("service_b2b" …)
 *   __label__{YYYY}_{catKey}:  period = brugerens label-tekst
 *   __group__{YYYY}_{catKey}:  period = gruppe-key ("variable" …)
 *   __sim_event__{YYYY}_{idx}: period = JSON.stringify(SimEvent)
 * Alle læsere af værdirækker filtrerer `!category.startsWith("__")`.
 *
 * __sim_event__-KONTRAKTEN (arvet de facto-format; motoren er eneste
 * læser/skriver):
 *   category      = `__sim_event__${year}_${idx}`  (idx = listeposition 0..n-1)
 *   budget_amount = event.monthlyCost              (redundant kopi af JSON-feltet)
 *   period        = JSON.stringify(SimEvent)
 *   SimEvent = { id: string (uuid), type: "hire"|"marketing"|"rent"|"software"|"custom",
 *                label: string, monthlyCost: number, startMonth: 0..11, isRevenue: boolean }
 * Persistering: debounced (i komponenten) fuld delete+insert pr. (company, år).
 * Ulæselig JSON ved load ignoreres (try/catch → filter(Boolean)).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  BUDGET_TEMPLATES,
  type BudgetTemplate,
  type BudgetCategory,
} from "@/lib/budgetTemplates";
import { byggSkriveplanInserts, type Skriveplan } from "@/lib/importSkrivning";
import { catToRow, MONTHS, type BudgetRow, type ScenarioKey } from "@/components/budget/types";

export interface BudgetTargetRow {
  category: string;
  budget_amount: number;
  period: string;
}

export interface SimEvent {
  id: string;
  type: "hire" | "marketing" | "rent" | "software" | "custom";
  label: string;
  monthlyCost: number;
  startMonth: number;
  isRevenue: boolean;
}

// ───────────────────────────── RENE DOMME ─────────────────────────────

export interface ParsedBudgetPeriod {
  year: string;
  scenario: string;
  monthIdx: number;
}

/** Værdirækkens period-parser (Budget.tsx:186-192 ordret): "YYYY-scenario-idx"
    → dele; strukturelt ugyldige perioder (for få dele, monthIdx uden for
    0-11) → null. Scenario returneres som streng — gyldighed dømmes af
    kalderen som hidtil (newData[sc]-guarden). */
export function parseBudgetPeriod(period: string): ParsedBudgetPeriod | null {
  const parts = period.split("-");
  if (parts.length < 3) return null;
  const [year, scenario, monthIdxStr] = parts;
  const monthIdx = parseInt(monthIdxStr, 10);
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return null;
  return { year, scenario, monthIdx };
}

export type BudgetMarker =
  | { kind: "template" }
  | { kind: "label"; year: string; key: string }
  | { kind: "group"; year: string; key: string }
  | { kind: "simEvent"; year: string; idx: number };

/** Marker-genkendelsen samlet som én dom (spredt i dag: Budget.tsx:112,
    :138-145, :162-169; BudgetForecastTab:124). Prefix-semantikken arves:
    key må selv indeholde underscores. */
export function parseBudgetMarker(category: string): BudgetMarker | null {
  if (category === "__template__") return { kind: "template" };
  for (const [prefix, kind] of [
    ["__label__", "label"],
    ["__group__", "group"],
  ] as const) {
    if (category.startsWith(prefix)) {
      const m = category.slice(prefix.length).match(/^(\d{4})_(.+)$/);
      if (!m) return null;
      return { kind, year: m[1], key: m[2] };
    }
  }
  if (category.startsWith("__sim_event__")) {
    const m = category.slice("__sim_event__".length).match(/^(\d{4})_(\d+)$/);
    if (!m) return null;
    return { kind: "simEvent", year: m[1], idx: parseInt(m[2], 10) };
  }
  return null;
}

/** EBITDA pr. måned. De fire hidtidige inline-beregninger er to varianter
    af samme formel: BudgetOverviewTab.tsx:20-24 og BudgetScenariosTab.tsx:
    53-57 regner revenue − |Σ costs|, mens BudgetVsActualTab.tsx:96-100 og
    BudgetForecastTab.tsx:63-69 regner revenue − Σ |cost|. Varianterne er
    identiske når alle omkostningsværdier har samme fortegn (det praktiske
    tilfælde — skrivevejene gemmer beløb som indtastet). Motoren bruger
    Σ|cost|-formen (robust ved blandede fortegn); de gamle komponenter er
    urørte og beholder deres inline-formler. */
export function computeEbitda(rows: BudgetRow[]): number[] {
  const revenueRows = rows.filter((r) => r.group === "indtaegter");
  const costRows = rows.filter((r) => r.group !== "indtaegter");
  return MONTHS.map((_, i) => {
    const revenue = revenueRows.reduce((sum, row) => sum + row.values[i], 0);
    const costs = costRows.reduce((sum, row) => sum + Math.abs(row.values[i]), 0);
    return revenue - costs;
  });
}

export type BudgetFillState = "empty" | "partial" | "complete";

/** Udfyldnings-dommen: filledMonths = måneder med mindst ét beløb
    forskelligt fra nul i NOGEN gruppe — en måned med omkostninger og nul
    omsætning er en gyldig budgetmåned (rettet 2026-08-24; den arvede dom
    fra BudgetOverviewTab.tsx:42-47 talte kun indtægtsmåneder og udelod
    fx januar/februar med Contentproduktion 90.000 men uden salg).
    empty = samlet omsætning 0 (uændret); complete = mindst 10 udfyldte
    måneder. Domsorden: empty > complete > partial. */
export function deriveBudgetFill(rows: BudgetRow[]): {
  state: BudgetFillState;
  filledMonths: number;
} {
  const revenueRows = rows.filter((r) => r.group === "indtaegter");
  const filledMonths = MONTHS.filter((_, i) => rows.some((r) => r.values[i] !== 0)).length;
  const totalOmsaetning = revenueRows.reduce(
    (sum, row) => sum + row.values.reduce((s, v) => s + v, 0),
    0,
  );
  if (totalOmsaetning === 0) return { state: "empty", filledMonths };
  if (filledMonths >= 10) return { state: "complete", filledMonths };
  return { state: "partial", filledMonths };
}

/** Forecast-vækstfaktoren (BudgetForecastTab.tsx:79-109 ordret): gns.
    aktual ÷ gns. budget over aktual-månederne, capped [0.1, 3]; uden
    aktuals eller uden budgetgrundlag = 1 (forecast = budget). */
export function deriveGrowthFactor(actuals: number[], budgets: number[]): number {
  if (actuals.length === 0) return 1;
  const avgActual = actuals.reduce((s, v) => s + v, 0) / actuals.length;
  const avgBudget = budgets.slice(0, actuals.length).reduce((s, v) => s + v, 0) / actuals.length;
  const growthFactor = avgBudget > 0 ? avgActual / avgBudget : 1;
  return Math.min(3, Math.max(0.1, growthFactor));
}

/** Fordel jævnt (÷12) m. December-rest (BudgetScenariosTab.tsx:566-570 +
    :576-582 ordret — samme fordeling for årsbeløb og omfordeling). */
export function distributeEvenly(total: number): number[] {
  const monthly = Math.round(total / 12);
  const values = Array(12).fill(monthly);
  values[11] += total - monthly * 12;
  return values;
}

/** Sæsonprofilen 6,5 %…11 % dec m. December-rest (BudgetScenariosTab.tsx:
    590-599 ordret). */
export function distributeSeasonally(total: number): number[] {
  const t = total;
  const seasonal = [
    Math.round(t * 0.065),
    Math.round(t * 0.065),
    Math.round(t * 0.07),
    Math.round(t * 0.085),
    Math.round(t * 0.09),
    Math.round(t * 0.09),
    Math.round(t * 0.09),
    Math.round(t * 0.085),
    Math.round(t * 0.085),
    Math.round(t * 0.085),
    Math.round(t * 0.08),
    Math.round(t * 0.11),
  ];
  seasonal[11] += t - seasonal.reduce((s, v) => s + v, 0);
  return seasonal;
}

/** Quickstart-fordelingen (BudgetScenariosTab.tsx:317-347 ordret, minus
    state): 3 årstal fordeles ÷12 — indtægter, løn (loenninger/personale)
    og resten af (øvrige − løn) ligeligt over redigerbare omkostningsrækker. */
export function applyQuickstartRows(
  rows: BudgetRow[],
  values: { revenue: number; costs: number; payroll: number },
): BudgetRow[] {
  const rev = values.revenue || 0;
  const costs = values.costs || 0;
  const pay = values.payroll || 0;
  if (rev === 0) return rows;

  const monthlyRev = rev / 12;
  const monthlyCosts = costs / 12;
  const monthlyPay = pay / 12;

  return rows.map((row) => {
    if (row.group === "indtaegter") return { ...row, values: Array(12).fill(Math.round(monthlyRev)) };
    if (row.key === "loenninger" || row.key === "personale")
      return { ...row, values: Array(12).fill(Math.round(monthlyPay)) };
    if (monthlyCosts > 0 && row.group !== "indtaegter" && row.key !== "loenninger" && row.key !== "personale") {
      const nonPayrollCostRows = rows.filter(
        (r) => r.group !== "indtaegter" && r.key !== "loenninger" && r.key !== "personale" && r.isEditable,
      );
      const perRow = nonPayrollCostRows.length > 0 ? (monthlyCosts - monthlyPay) / nonPayrollCostRows.length : 0;
      if (nonPayrollCostRows.some((r) => r.key === row.key)) {
        return { ...row, values: Array(12).fill(Math.round(Math.max(0, perRow))) };
      }
    }
    return row;
  });
}

/** Normaliserings-hjælperen bag det robuste AI-merge-match (U3,
    hb-ai-merge-recon §b3): lowercase, æ/ø/å → ae/oe/aa, alt der ikke er
    [a-z0-9] → "_", sammenfald af gentagne "_" og trim af kant-"_".
    Dækker miss-kataloget 1-4 (dansk normalisering, casing, specialtegn/
    whitespace, snake_case-gæt); ordret match er et specialtilfælde. */
export function normalizeBudgetKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Import-callbackens række-afkodning (Budget.tsx:238-250 ordret inkl.
    kategori→gruppe-switchen). Webshop-skabelon-antagelsen (Budget.tsx:235)
    er IKKE motorens sag — den forbliver som state-kosmetik i gamle side
    (design-blok §e(i)). */
export function decodeImportedRows(result: {
  categories?: { key: string; label: string; monthly?: number[] }[];
}): BudgetRow[] {
  return (result.categories || []).map((cat) => ({
    key: cat.key,
    label: cat.label,
    values: cat.monthly || Array(12).fill(0),
    isEditable: true,
    group:
      cat.key === "omsaetning" ? "indtaegter" :
      cat.key === "loenninger" ? "personale" :
      cat.key === "marketing" ? "salg_marketing" :
      cat.key === "lokaler" ? "faste" :
      cat.key === "tech_software" ? "drift" :
      cat.key === "admin" ? "faste" :
      "variable",
  }));
}

/** Gruppe → rapportfelt (spor3-design §2): de seks visningsgrupper og de
    seks rapportfelter er samme opdeling under to navne. Erstatter den
    håndkuraterede REPORT_FIELD_TO_BUDGET_KEYS (key-baseret; 27 af 44
    skabelon-keys manglede og alle importerede linjer stod ukoblede) —
    slettet 2026-08-24. B1: gruppen vinder — medlemmets gruppevalg afgør
    både hvor linjen står og hvad den sammenlignes med. */
export const GROUP_TO_REPORT_FIELD: Record<string, string> = {
  indtaegter: "omsaetning",
  variable: "direkte_omkostninger",
  personale: "loenninger",
  salg_marketing: "salgsomkostninger",
  faste: "lokaleomkostninger",
  drift: "administrationsomkostninger",
};

/** Rækkens rapportfelt — opslag på GRUPPEN, ikke nøglen. Enhver række med
    en gyldig gruppe er koblet; null kun ved ukendt gruppe. */
export function getBudgetRowReportField(row: Pick<BudgetRow, "group">): string | null {
  return GROUP_TO_REPORT_FIELD[row.group] ?? null;
}

// ───────────────────────────── AFKODNING ─────────────────────────────

export interface DecodedBudget {
  availableYears: string[];
  template: BudgetTemplate;
  /** true når skabelonen kommer fra en gyldig __template__-marker; false =
      best-match-gæt (Hb-fladen viser da "Importeret budget", §e(i)). */
  templateFromMarker: boolean;
  scenarioData: Record<ScenarioKey, BudgetRow[]>;
  labelOverrides: Record<string, string>;
}

/** Hele loadBudget-afkodningen (Budget.tsx:84-199 ordret, minus setState):
    år-liste, template-detektion (marker ELLER best-match), ekstra-
    kategorier m. __group__-opslag, __label__-overrides, værdi-anvendelse. */
export function decodeBudgetRows(data: BudgetTargetRow[], year: string): DecodedBudget {
  // Derive which years actually have budget data (value rows only)
  const availableYears = Array.from(
    new Set(
      data
        .filter((d) => !d.category.startsWith("__"))
        .map((d) => d.period.split("-")[0])
        .filter((y) => /^\d{4}$/.test(y)),
    ),
  ).sort();

  // Value rows for the selected year only
  const yearValueRows = data.filter(
    (d) => !d.category.startsWith("__") && d.period.split("-")[0] === year,
  );

  // Detect template
  const templateMarker = data.find((d) => d.category === "__template__");
  let template: BudgetTemplate | undefined;

  if (templateMarker) {
    template = BUDGET_TEMPLATES.find((t) => t.key === templateMarker.period);
  }
  const templateFromMarker = !!template;

  if (!template) {
    const storedKeys = new Set(
      data.map((d) => d.category).filter((c) => c !== "__template__" && !c.startsWith("__label__")),
    );
    let bestMatch = BUDGET_TEMPLATES[0];
    let bestScore = 0;
    for (const tmpl of BUDGET_TEMPLATES) {
      const score = tmpl.categories.filter((c) => storedKeys.has(c.key)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = tmpl;
      }
    }
    template = bestMatch;
  }

  // Collect all unique category keys (selected year's value rows only)
  const allCatKeys = new Set(yearValueRows.map((d) => d.category));

  const templateKeys = new Set(template.categories.map((c) => c.key));
  const extraKeys = [...allCatKeys].filter((k) => !templateKeys.has(k));

  const groupMarkers = data.filter((d) => d.category.startsWith("__group__"));
  const extraGroupMap: Record<string, string> = {};
  groupMarkers
    .filter((g) => g.category.startsWith(`__group__${year}_`))
    .forEach((g) => {
      const key = g.category.replace(`__group__${year}_`, "");
      extraGroupMap[key] = g.period;
    });

  // __group__-markørens værdi VALIDERES mod de seks gyldige gruppenøgler —
  // castet var en type-løgn: en ugyldig værdi (fx et frit sektionsnavn fra
  // en tidlig import) gled igennem, faldt uden for GROUP_ORDER og gjorde
  // rækker usynlige i fladen. Ugyldigt → "variable", stille.
  const GYLDIGE_GRUPPER = new Set<BudgetCategory["group"]>([
    "indtaegter",
    "variable",
    "personale",
    "faste",
    "salg_marketing",
    "drift",
  ]);
  const extraCategories: BudgetCategory[] = extraKeys.map((key) => {
    const gemt = extraGroupMap[key];
    return {
      key,
      label: key.replace(/_/g, " "),
      group: GYLDIGE_GRUPPER.has(gemt as BudgetCategory["group"])
        ? (gemt as BudgetCategory["group"])
        : "variable",
    };
  });

  const allCategories = [...template.categories, ...extraCategories];

  const newData: Record<ScenarioKey, BudgetRow[]> = {
    base: allCategories.map(catToRow),
    optimistisk: allCategories.map(catToRow),
    pessimistisk: allCategories.map(catToRow),
  };

  // Load label overrides
  const labelMarkers = data.filter((d) => d.category.startsWith("__label__"));
  const loadedLabels: Record<string, string> = {};
  labelMarkers
    .filter((m) => m.category.startsWith(`__label__${year}_`))
    .forEach((m) => {
      const key = m.category.replace(`__label__${year}_`, "");
      loadedLabels[key] = m.period;
    });

  // Apply labels
  Object.entries(loadedLabels).forEach(([key, label]) => {
    for (const sc of Object.values(newData)) {
      const row = sc.find((r) => r.key === key);
      if (row) row.label = label;
    }
  });
  extraCategories.forEach((ec) => {
    if (loadedLabels[ec.key]) ec.label = loadedLabels[ec.key];
  });

  // Apply values
  data.forEach((item) => {
    if (
      item.category === "__template__" ||
      item.category.startsWith("__label__") ||
      item.category.startsWith("__group__")
    )
      return;
    const parsed = parseBudgetPeriod(item.period);
    if (!parsed || parsed.year !== year) return;
    const sc = parsed.scenario as ScenarioKey;
    if (!newData[sc]) return;

    const row = newData[sc].find((r) => r.key === item.category);
    if (row) {
      row.values[parsed.monthIdx] = Number(item.budget_amount);
    }
  });

  return {
    availableYears,
    template,
    templateFromMarker,
    scenarioData: newData,
    labelOverrides: loadedLabels,
  };
}

/** År-fallback-dommen (Budget.tsx:95-103, dommen alene): hop til nyeste år
    m. data når det valgte år intet har. Én-gangs-guarden pr. company
    (autoYearAdjustedFor-ref'en) forbliver i siderne. */
export function resolveAutoYear(availableYears: string[], year: string): string | null {
  if (availableYears.length > 0 && !availableYears.includes(year)) {
    return availableYears[availableYears.length - 1];
  }
  return null;
}

export interface LoadBudgetResult {
  /** true når company slet ingen budget_targets-rækker har (tom-tilstanden). */
  empty: boolean;
  availableYears: string[];
  decoded: DecodedBudget | null;
}

/** Pagineret hentning hen over Supabase-loftet på 1.000 rækker pr.
    forespørgsel (prod-bevis 2026-08-24: remm. har 1.378 rækker i
    budget_targets — loadBudget så kun de første 1.000, og medlemmets
    gemte rettelser "forsvandt" ved genindlæsning). Kalderen bygger
    forespørgslen og SKAL selv sætte .order(...) for stabil paginering;
    range lægges på her. En fejl KASTER — en slugt fejl blev til en tom
    liste, som ligner et tomt budget (og i delete-før-insert-flowene til
    dobbeltrækker). Samme mønster som confirmImportFraSkriveplan (PR #404). */
export async function hentAlleSider<T>(
  byg: (fra: number, til: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const SIDE = 1000;
  const alle: T[] = [];
  for (let fra = 0; ; fra += SIDE) {
    const res = await byg(fra, fra + SIDE - 1);
    if (res.error) throw res.error;
    const side = res.data || [];
    alle.push(...side);
    if (side.length < SIDE) break;
  }
  return alle;
}

/** Sletning på id i bidder á 200 — 1.000+ id'er i én .in() sprænger
    URL-længden (mønstret fra PR #404). Kaster på fejl: en fejlet delete
    efterfulgt af insert er netop dobbeltskrivningen. */
async function sletPaaId(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const del = await supabase.from("budget_targets").delete().in("id", ids.slice(i, i + 200));
    if (del.error) throw del.error;
  }
}

/** Den bærende load (Budget.tsx:73-78 query + decodeBudgetRows). Kaster på
    query-fejl som originalens try/catch-flow (kalderen logger). Pagineret:
    fladen skal bruge ALLE år og ALLE scenarier, så serverside-filtrering
    er ikke nok her. */
export async function loadBudget(companyId: string, year: string): Promise<LoadBudgetResult> {
  const data = await hentAlleSider<BudgetTargetRow>((fra, til) =>
    (supabase
      .from("budget_targets")
      .select("category, budget_amount, period") as any)
      .eq("company_id", companyId)
      .order("id")
      .range(fra, til),
  );

  if (!data || data.length === 0) {
    return { empty: true, availableYears: [], decoded: null };
  }

  const decoded = decodeBudgetRows(data, year);
  return { empty: false, availableYears: decoded.availableYears, decoded };
}

// ───────────────────────────── SKRIVEVEJE ─────────────────────────────

/** Delt læse-hjælper for delete-før-insert-flowene (mønstret fra
    BudgetScenariosTab.tsx:101-105/:172/:225). Pagineret og kastende:
    med 1.378 rækker så den gamle udgave kun de første 1.000 og kunne
    efterlade gamle rækker, der overskriver nye ved næste indlæsning —
    og en slugt fejl (`|| []`) blev til "slet ingenting" + insert. */
async function fetchExistingRows(
  companyId: string,
): Promise<{ id: string; period: string; category: string }[]> {
  return hentAlleSider((fra, til) =>
    (supabase
      .from("budget_targets")
      .select("id, period, category") as any)
      .eq("company_id", companyId)
      .order("id")
      .range(fra, til),
  );
}

/** Fælles delete(prefix)+insert for et scenaries værdirækker (identisk blok
    i copyBase :171-188 og AI-flowet :224-241). Returnerer insert-fejlen i
    stedet for at throwe, fordi de to originaler behandlede den forskelligt
    (copyBase toastede fejl; AI-flowet ignorerede den). */
async function replaceScenarioValues(args: {
  userId: string;
  companyId: string;
  year: string;
  target: ScenarioKey;
  rows: BudgetRow[];
}): Promise<{ error: unknown | null }> {
  const { userId, companyId, year, target, rows } = args;
  const periodPrefix = `${year}-${target}-`;
  const existing = await fetchExistingRows(companyId);
  const toDelete = existing.filter((e) => e.period.startsWith(periodPrefix));
  await sletPaaId(toDelete.map((e) => e.id));

  const inserts = rows.flatMap((row) =>
    row.values.map((val, monthIdx) => ({
      user_id: userId,
      company_id: companyId,
      category: row.key,
      budget_amount: val,
      period: `${year}-${target}-${monthIdx}`,
    })),
  );
  const { error } = await supabase.from("budget_targets").insert(inserts as any);
  return { error };
}

/** W1 — skabelonvalg (Budget.tsx:221-229 ordret; originalen tjekker ikke
    insert-fejl, det gør motoren heller ikke). */
export async function writeTemplateMarker(
  userId: string,
  companyId: string,
  templateKey: string,
): Promise<void> {
  await supabase.from("budget_targets").insert({
    user_id: userId,
    company_id: companyId,
    category: "__template__",
    budget_amount: 0,
    period: templateKey,
  } as any);
}

/** W2 — gem scenarie (BudgetScenariosTab.tsx:99-146 ordret): fuld delete
    (år+scenarie-værdier + årets __label__/__group__-markers) → insert af
    værdier + markers. Thrower på insert-fejl (kalderen toaster/kvitterer). */
export async function saveScenarioEdits(args: {
  userId: string;
  companyId: string;
  year: string;
  scenario: ScenarioKey;
  rows: BudgetRow[];
  labelOverrides: Record<string, string>;
  templateKeys: Set<string>;
}): Promise<void> {
  const { userId, companyId, year, scenario, rows, labelOverrides, templateKeys } = args;
  const periodPrefix = `${year}-${scenario}-`;

  const existing = await fetchExistingRows(companyId);
  const toDelete = existing.filter(
    (e) =>
      e.period.startsWith(periodPrefix) ||
      e.category.startsWith(`__label__${year}_`) ||
      e.category.startsWith(`__group__${year}_`),
  );
  await sletPaaId(toDelete.map((e) => e.id));

  const inserts = rows.flatMap((row) =>
    row.values.map((val, monthIdx) => ({
      user_id: userId,
      company_id: companyId,
      category: row.key,
      budget_amount: val,
      period: `${year}-${scenario}-${monthIdx}`,
    })),
  );

  const labelInserts = Object.entries(labelOverrides).map(([key, label]) => ({
    user_id: userId,
    company_id: companyId,
    category: `__label__${year}_${key}`,
    budget_amount: 0,
    period: label,
  }));

  const groupInserts = rows
    .filter((r) => !templateKeys.has(r.key))
    .map((r) => ({
      user_id: userId,
      company_id: companyId,
      category: `__group__${year}_${r.key}`,
      budget_amount: 0,
      period: r.group,
    }));

  const allInserts = [...inserts, ...labelInserts, ...groupInserts];
  const { error } = await supabase.from("budget_targets").insert(allInserts as any);
  if (error) throw error;
}

/** W3 — kopiér base→scenarie (BudgetScenariosTab.tsx:166-188 ordret).
    Returnerer de kopierede rækker; thrower på insert-fejl. */
export async function copyBaseToScenario(args: {
  userId: string;
  companyId: string;
  year: string;
  target: ScenarioKey;
  baseRows: BudgetRow[];
}): Promise<BudgetRow[]> {
  const copiedRows = args.baseRows.map((r) => ({ ...r, values: [...r.values] }));
  const { error } = await replaceScenarioValues({ ...args, rows: copiedRows });
  if (error) throw error;
  return copiedRows;
}

/** W4 — AI-generér scenarie (BudgetScenariosTab.tsx:206-241; edge-kald
    generate-budget-scenarios → merge → delete+insert; originalen
    ignorerede insert-fejlen — det gør motoren også her). Kalderen ejer
    state-skiftet og kvitteringen; matchedCount/totalRowCount bæres retur
    til den ("x af y linjer justeret"). */
export async function generateAIScenario(args: {
  userId: string;
  companyId: string;
  year: string;
  target: ScenarioKey;
  baseRows: BudgetRow[];
}): Promise<{
  updatedRows: BudgetRow[];
  reasoning?: string;
  matchedCount: number;
  totalRowCount: number;
}> {
  const { userId, companyId, year, target, baseRows } = args;
  const payloadRows = baseRows.map((r) => ({
    key: r.key,
    label: r.label,
    group: r.group,
    values: r.values,
  }));

  const { data, error } = await supabase.functions.invoke("generate-budget-scenarios", {
    body: { baseRows: payloadRows, scenario: target },
  });

  if (error) throw error;
  if (!data?.categories) throw new Error("Ingen data returneret fra AI");

  // U3 (fix/budget-ai-merge, hb-ai-merge-recon — fejlrettelse for BEGGE
  // flader): det gamle ordrette match (`c.key === r.key || c.key === r.label`)
  // missede stille når modellens keys afveg i casing/specialtegn/dansk
  // normalisering — modellen ser kun labels (recon §a1) — og gemte så en
  // base-kopi som succes m. reasoning. Nu matches på normaliseret key OG
  // label; en linje tæller kun som matchet m. gyldig 12-tals monthly
  // (falsy-værnet); nul-match afviser FØR skrivning.
  const aiByNormKey = new Map<string, number[]>();
  for (const cat of (data.categories as { key?: unknown; monthly?: unknown }[])) {
    if (typeof cat?.key !== "string") continue;
    const monthly = cat.monthly;
    if (
      !Array.isArray(monthly) ||
      monthly.length !== 12 ||
      !monthly.every((v) => typeof v === "number" && Number.isFinite(v))
    )
      continue;
    const norm = normalizeBudgetKey(cat.key);
    if (norm && !aiByNormKey.has(norm)) aiByNormKey.set(norm, monthly as number[]);
  }

  let matchedCount = 0;
  const updatedRows = baseRows.map((r) => {
    const monthly =
      aiByNormKey.get(normalizeBudgetKey(r.key)) ?? aiByNormKey.get(normalizeBudgetKey(r.label));
    if (!monthly) return { ...r, values: [...r.values] };
    matchedCount++;
    return { ...r, values: monthly };
  });

  if (matchedCount === 0) {
    throw new Error("AI-forslaget matchede ikke budgetlinjerne — prøv igen");
  }

  await replaceScenarioValues({ userId, companyId, year, target, rows: updatedRows });

  return {
    updatedRows,
    reasoning: data.reasoning || undefined,
    matchedCount,
    totalRowCount: baseRows.length,
  };
}

/** W5 — Excel-import-confirm (BudgetImport.tsx:197-242 ordret): delete
    (år × 3 scenarier, på user+company) → inserts ×3 scenarier → dedup pr.
    company:user:category:period (summerede dubletter) → upsert. */
export async function confirmBudgetImport(args: {
  userId: string;
  companyId: string;
  preview: { year: string; categories: { key: string; monthly: number[] }[] };
}): Promise<void> {
  const { userId, companyId, preview } = args;

  // Pagineret + kastende (samme loft-fejlklasse som loadBudget): tre
  // scenarier × 12 måneder × 28+ kategorier kan overstige 1.000 rækker.
  const existing = await hentAlleSider<{ id: string; period: string }>((fra, til) =>
    (supabase
      .from("budget_targets")
      .select("id, period") as any)
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .or(
        `period.like.${preview.year}-base-%,` +
          `period.like.${preview.year}-optimistisk-%,` +
          `period.like.${preview.year}-pessimistisk-%`,
      )
      .order("id")
      .range(fra, til),
  );
  await sletPaaId(existing.map((e) => e.id));

  const inserts = preview.categories.flatMap((cat) =>
    (["base", "optimistisk", "pessimistisk"] as const).flatMap((scenario) =>
      cat.monthly.map((amount, monthIdx) => ({
        user_id: userId,
        company_id: companyId,
        category: cat.key,
        budget_amount: amount,
        period: `${preview.year}-${scenario}-${monthIdx}`,
      })),
    ),
  );

  // Deduplicate inserts: if same company_id+user_id+category+period appears multiple times,
  // keep only the last occurrence (sum amounts for duplicate keys)
  const insertMap = new Map<string, (typeof inserts)[0]>();
  for (const row of inserts) {
    const key = `${row.company_id}:${row.user_id}:${row.category}:${row.period}`;
    if (insertMap.has(key)) {
      const existingRow = insertMap.get(key)!;
      insertMap.set(key, { ...existingRow, budget_amount: existingRow.budget_amount + row.budget_amount });
    } else {
      insertMap.set(key, row);
    }
  }
  const dedupedInserts = Array.from(insertMap.values());

  const { error } = await supabase.from("budget_targets").upsert(dedupedInserts, {
    onConflict: "company_id,user_id,category,period",
    ignoreDuplicates: false,
  });
  if (error) throw error;
}

/** W8 — importgitterets skrivevej (feat/import-skrivevej, besluttet
    2026-08-23). Skriver KUN base-scenariet — et importeret budget er ét
    budget; optimistisk/pessimistisk laver medlemmet bagefter, bevidst.
    Etiketten bevares via __label__-markører (samme form som
    saveScenarioEdits :558-564); nøglerne er unikke pr. RÆKKE fra
    byggSkriveplan — kollision er en fejl der kastes, ALDRIG stille
    summering (modsat W5's dedup). Delete følger husreglen: select-først,
    slet på id — kun årets base-værdier + __label__-markører for netop de
    nøgler planen skriver. Den gamle confirmBudgetImport (W5) består urørt
    til den nuværende flade er koblet om. */
export async function confirmImportFraSkriveplan(args: {
  userId: string;
  companyId: string;
  plan: Skriveplan;
}): Promise<void> {
  const { userId, companyId, plan } = args;

  const noegler = plan.raekker.map((r) => r.noegle);
  if (new Set(noegler).size !== noegler.length) {
    throw new Error("Skriveplanen har kolliderende nøgler — der skrives intet");
  }
  if (!/^\d{4}$/.test(plan.aar)) {
    throw new Error(`Ugyldigt budgetår i skriveplanen: "${plan.aar}"`);
  }

  const periodPrefix = `${plan.aar}-base-`;
  const labelPrefix = `__label__${plan.aar}_`;
  const groupPrefix = `__group__${plan.aar}_`;
  const noegleSet = new Set(noegler);

  // Serverside-filtreret OG pagineret hentning (fix/import-slet-over-tusind,
  // prod-bevis 2026-08-24): Supabase returnerer højst 1.000 rækker pr.
  // forespørgsel, og den gamle ufiltrerede fetchExistingRows missede alt
  // derover — seks importerede linjer hos 3ffccc0f overlevede sletningen og
  // dobbelttalte. Filteret afgrænser til årets base-rækker + årets markører
  // (nøgle-matchet sker fortsat klientside nedenfor); pagineringen værner
  // mod at selv den delmængde overstiger loftet. En fejl KASTER — at
  // fortsætte til insert uden det fulde billede er netop dobbeltskrivningen.
  const SIDE = 1000;
  const existing: { id: string; period: string; category: string }[] = [];
  for (let fra = 0; ; fra += SIDE) {
    const res = await (supabase
      .from("budget_targets")
      .select("id, period, category") as any)
      .eq("company_id", companyId)
      .or(
        `period.like.${periodPrefix}%,` +
          `category.like.${labelPrefix}%,` +
          `category.like.${groupPrefix}%`,
      )
      .order("id")
      .range(fra, fra + SIDE - 1);
    if (res.error) throw res.error;
    const side = (res.data || []) as typeof existing;
    existing.push(...side);
    if (side.length < SIDE) break;
  }

  const toDelete = existing.filter(
    (e) =>
      e.period.startsWith(periodPrefix) ||
      (e.category.startsWith(labelPrefix) && noegleSet.has(e.category.slice(labelPrefix.length))) ||
      (e.category.startsWith(groupPrefix) && noegleSet.has(e.category.slice(groupPrefix.length))),
  );
  // Slet fortsat på id (select-før-delete, så toDelete.length kan logges) —
  // men i bidder: 1.000+ id'er i én .in() sprænger URL-længden.
  for (let i = 0; i < toDelete.length; i += 200) {
    const bid = toDelete.slice(i, i + 200);
    const del = await supabase.from("budget_targets").delete().in("id", bid.map((e) => e.id));
    if (del.error) throw del.error;
  }

  const { error } = await supabase
    .from("budget_targets")
    .insert(byggSkriveplanInserts({ userId, companyId, plan }));
  if (error) throw error;
}

/** W6 — budget fra regnskab-confirm (BudgetFromAccounts.tsx:198-242):
    delete base for target-år + delete __template__ → insert base-scenariet.
    Target-år = kildeår + 1. Returnerer target-året. */
export async function confirmBudgetFromAccounts(args: {
  userId: string;
  companyId: string;
  sourceYear: string;
  categories: { key: string; monthly: number[] }[];
}): Promise<{ targetYear: string }> {
  const { userId, companyId, sourceYear, categories } = args;
  const targetYear = String(Number(sourceYear) + 1);
  const periodPrefix = `${targetYear}-base-`;

  // W6-rettelsen (recon §7.3, design-blok §a4-U1): company_id-filter i
  // begge deletes — den gamle kode slettede på user_id alene og kunne
  // ramme en anden virksomheds rækker skrevet af samme bruger (advisor).
  const { data: existing } = await supabase
    .from("budget_targets")
    .select("id, period")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .like("period", `${periodPrefix}%`);

  if (existing && existing.length > 0) {
    await supabase.from("budget_targets").delete().in("id", existing.map((e) => e.id));
  }

  await supabase
    .from("budget_targets")
    .delete()
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("category", "__template__");

  // U2 (design-blok §a4/§e(i), klik-valg A): den hardcodede
  // "webshop_b2c"-__template__-marker (gl. BudgetFromAccounts.tsx:219-226)
  // skrives ikke længere — genererede budgetter står ærligt uden skabelon;
  // loadBudget best-matcher fortsat til gruppering.

  const inserts = categories.flatMap((cat) =>
    cat.monthly.map((amount, monthIdx) => ({
      user_id: userId,
      company_id: companyId,
      category: cat.key,
      budget_amount: amount,
      period: `${targetYear}-base-${monthIdx}`,
    })),
  );

  const { error } = await supabase.from("budget_targets").insert(inserts);
  if (error) throw error;

  return { targetYear };
}

/** W7 — sim-events load (BudgetForecastTab.tsx:119-137 ordret). */
export async function loadSimEvents(companyId: string, year: string): Promise<SimEvent[]> {
  const { data } = await (supabase
    .from("budget_targets")
    .select("category, period, budget_amount") as any)
    .eq("company_id", companyId)
    .like("category", `__sim_event__${year}_%`);

  if (!data?.length) return [];

  return (data as { period: string }[])
    .map((row) => {
      try {
        return JSON.parse(row.period) as SimEvent;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as SimEvent[];
}

/** W7 — sim-events persistering (BudgetForecastTab.tsx:144-163 ordret):
    fuld delete+insert; debounce forbliver i komponenten. */
export async function saveSimEvents(args: {
  userId: string;
  companyId: string;
  year: string;
  events: SimEvent[];
}): Promise<void> {
  const { userId, companyId, year, events } = args;

  await (supabase.from("budget_targets").delete() as any)
    .eq("company_id", companyId)
    .like("category", `__sim_event__${year}_%`);

  if (events.length === 0) return;

  const inserts = events.map((event, idx) => ({
    user_id: userId,
    company_id: companyId,
    category: `__sim_event__${year}_${idx}`,
    budget_amount: event.monthlyCost,
    period: JSON.stringify(event),
  }));

  await (supabase.from("budget_targets").insert(inserts) as any);
}
