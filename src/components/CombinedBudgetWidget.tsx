import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { formatCompact, DANISH_MONTHS, calcTotalExpenses, parseReportPeriodToKey } from "@/lib/financialUtils";

interface ComparisonRow {
  label: string;
  budget: number;
  actual: number;
  isRevenue: boolean;
}

function budgetPeriodToKey(period: string): string | null {
  const idxMatch = period.match(/^(\d{4})-\w+-(\d+)$/);
  if (idxMatch) return `${idxMatch[1]}-${String(Number(idxMatch[2]) + 1).padStart(2, "0")}`;
  return parseReportPeriodToKey(period);
}

export default function CombinedBudgetWidget() {
  const { user, companyId } = useAuth();
  const { data: facts = [] } = useCompanyFacts();

  // Budget targets
  const { data: budgetTargets = [] } = useQuery({
    queryKey: ["combined-budget-targets", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("budget_targets")
        .select("category, period, budget_amount")
        .eq("company_id", companyId!);
      return (data || []) as { category: string; period: string; budget_amount: number }[];
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60_000,
  });

  // Budget vs Actual data
  const budgetData = (() => {
    if (facts.length === 0) return null;
    const sorted = facts.map(f => ({ key: f.period_key, kf: factsToDanishMetrics(f.metrics) }));
    const latestFact = sorted[sorted.length - 1];
    const [yearStr, monthStr] = latestFact.key.split("-");
    const monthIdx = parseInt(monthStr, 10) - 1;
    const monthLabel = `${DANISH_MONTHS[monthIdx]} ${yearStr}`;

    const budgets = budgetTargets.filter(b =>
      b.period === `${yearStr}-base-${monthIdx}` && b.category !== "__template__" && !b.category.startsWith("__")
    );
    if (budgets.length === 0) return { rows: [] as ComparisonRow[], margin: null, periodLabel: monthLabel, state: "no-budget" as const };

    const kf = latestFact.kf;
    const budgetRevenue = budgets.filter(b => b.category === "omsaetning").reduce((s, b) => s + b.budget_amount, 0);
    const budgetExpenses = budgets.filter(b => b.category !== "omsaetning").reduce((s, b) => s + b.budget_amount, 0);
    const budgetEbitda = budgetRevenue - budgetExpenses;
    const budgetMargin = budgetRevenue > 0 ? (budgetEbitda / budgetRevenue) * 100 : 0;

    const actualRevenue = kf.omsaetning ?? 0;
    const actualExpenses = Math.abs(kf.loenninger ?? 0) + Math.abs(kf.direkte_omkostninger ?? 0) +
      Math.abs(kf.salgsomkostninger ?? 0) + Math.abs(kf.lokaleomkostninger ?? 0) +
      Math.abs(kf.administrationsomkostninger ?? 0) + Math.abs(kf.afskrivninger ?? 0);
    const actualEbitda = actualRevenue - actualExpenses;
    const actualMargin = actualRevenue > 0 ? (actualEbitda / actualRevenue) * 100 : 0;

    return {
      rows: [
        { label: "Omsætning", budget: budgetRevenue, actual: actualRevenue, isRevenue: true },
        { label: "EBITDA", budget: budgetEbitda, actual: actualEbitda, isRevenue: true },
      ],
      margin: { budget: budgetMargin, actual: actualMargin },
      periodLabel: monthLabel,
      state: "ready" as const,
    };
  })();

  // Rolling forecast
  const rollingForecast = (() => {
    if (facts.length < 2) return null;
    const sorted = facts.map(f => ({ key: f.period_key, kf: factsToDanishMetrics(f.metrics) }));
    const [latestYear] = sorted[sorted.length - 1].key.split("-");
    const currentYearFacts = sorted.filter(r => r.key.startsWith(latestYear));
    const actualsMonthCount = currentYearFacts.length;
    if (actualsMonthCount < 2) return null;

    const ytdRevenue = currentYearFacts.reduce((s, r) => s + (r.kf.omsaetning ?? 0), 0);
    const ytdCosts = currentYearFacts.reduce((s, r) => s + calcTotalExpenses(r.kf), 0);
    const avgMonthlyRevenue = ytdRevenue / actualsMonthCount;
    const avgMonthlyCosts = ytdCosts / actualsMonthCount;

    const latestMonthIdx = parseInt(sorted[sorted.length - 1].key.split("-")[1], 10) - 1;
    const remainingMonths = 11 - latestMonthIdx;

    const forecastRevenue = Math.round(ytdRevenue + avgMonthlyRevenue * remainingMonths);
    const forecastCosts = Math.round(ytdCosts + avgMonthlyCosts * remainingMonths);
    const forecastResult = forecastRevenue - forecastCosts;

    // Budget comparison
    const budgetByMonthCat = new Map<string, Map<string, number>>();
    for (const b of budgetTargets) {
      if (b.category === "__template__" || b.category.startsWith("__")) continue;
      const mk = budgetPeriodToKey(b.period);
      if (!mk) continue;
      if (!budgetByMonthCat.has(mk)) budgetByMonthCat.set(mk, new Map());
      budgetByMonthCat.get(mk)!.set(b.category, (budgetByMonthCat.get(mk)!.get(b.category) ?? 0) + b.budget_amount);
    }

    const allYearBudgetKeys = [...budgetByMonthCat.keys()].filter(k => k.startsWith(latestYear));
    let fullYearBudgetRevenue = 0, fullYearBudgetCosts = 0, hasBudget = false;
    for (const k of allYearBudgetKeys) {
      const cats = budgetByMonthCat.get(k);
      if (!cats) continue;
      const rev = cats.get("omsaetning") ?? 0;
      if (rev) { fullYearBudgetRevenue += rev; hasBudget = true; }
      let exp = 0;
      cats.forEach((v, key) => { if (key !== "omsaetning") exp += v; });
      if (exp) { fullYearBudgetCosts += exp; hasBudget = true; }
    }

    return {
      forecastResult,
      budgetResult: hasBudget ? Math.round(fullYearBudgetRevenue - fullYearBudgetCosts) : null,
      year: latestYear,
    };
  })();

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground text-sm">
          {budgetData?.periodLabel ? `Budget vs. Actual — ${budgetData.periodLabel}` : "Budget vs. Actual"}
        </h3>
      </div>

      {budgetData?.state === "ready" && budgetData.rows.length > 0 ? (
        <div className="flex-1 space-y-4">
          {budgetData.rows.map(row => {
            const diff = row.actual - row.budget;
            const isGood = row.isRevenue ? diff >= 0 : diff <= 0;
            const pct = row.budget > 0 ? Math.min(Math.abs(row.actual / row.budget) * 100, 150) : 0;
            const overBudget = row.isRevenue ? row.actual < row.budget : row.actual > row.budget;
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground font-medium">{row.label}</span>
                  <div className="flex items-center gap-1">
                    {diff !== 0 && (
                      isGood
                        ? <TrendingUp className="h-3 w-3 text-primary" />
                        : <TrendingDown className="h-3 w-3 text-destructive" />
                    )}
                    <span className={`text-[10px] font-semibold ${isGood ? "text-primary" : "text-destructive"}`}>
                      {diff >= 0 ? "+" : ""}{formatCompact(diff)}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                {row.budget > 0 && (
                  <div className="relative h-1.5 bg-secondary rounded-full overflow-hidden mb-1.5">
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                        overBudget ? "bg-destructive" : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                    {/* Budget marker at 100% */}
                    <div className="absolute top-0 right-0 h-full w-px bg-foreground/20" />
                  </div>
                )}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{formatCompact(row.actual)} faktisk</span>
                  <span>{formatCompact(row.budget)} budget</span>
                </div>
              </div>
            );
          })}
          {budgetData.margin && (
            <div className="pt-2 border-t border-border/30 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">EBITDA-margin</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Budget: {budgetData.margin.budget.toFixed(1)}%</span>
                  <span className={`text-[10px] font-semibold ${budgetData.margin.actual >= budgetData.margin.budget ? "text-primary" : "text-destructive"}`}>
                    Actual: {budgetData.margin.actual.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : budgetData?.state === "no-budget" ? (
        <p className="text-sm text-muted-foreground text-center py-4 flex-1 flex items-center justify-center">
          Intet budget for {budgetData.periodLabel}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4 flex-1 flex items-center justify-center">
          Upload rapport for sammenligning
        </p>
      )}

      {/* Rolling Forecast */}
      {rollingForecast && (
        <div className="pt-3 mt-3 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Forventet årsresultat {rollingForecast.year}
          </p>
          <div className="flex items-center gap-2">
            {rollingForecast.forecastResult >= 0
              ? <TrendingUp className="h-4 w-4 text-primary" />
              : <TrendingDown className="h-4 w-4 text-destructive" />
            }
            <span className={`text-sm font-bold ${rollingForecast.forecastResult >= 0 ? "text-primary" : "text-destructive"}`}>
              {formatCompact(rollingForecast.forecastResult)} kr.
            </span>
            {rollingForecast.budgetResult != null && (
              <span className="text-[10px] text-muted-foreground">
                {rollingForecast.forecastResult >= rollingForecast.budgetResult ? "+" : ""}
                {formatCompact(rollingForecast.forecastResult - rollingForecast.budgetResult)} vs. plan
              </span>
            )}
          </div>
        </div>
      )}

      <Link
        to="/budget"
        className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors pt-3 mt-auto"
      >
        Se budget <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
