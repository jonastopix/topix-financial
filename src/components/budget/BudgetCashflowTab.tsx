import { useMemo } from "react";
import { TrendingDown, AlertTriangle, CheckCircle2, Droplets } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { MONTHS, formatK, type BudgetRow } from "./types";

interface Props {
  rows: BudgetRow[];
  year: string;
  companyId: string | undefined;
}

const BudgetCashflowTab = ({ rows, year, companyId }: Props) => {
  const { data: facts = [] } = useCompanyFacts(companyId);

  const startingCash = useMemo(() => {
    const yearFacts = facts
      .filter(f => f.period_key.startsWith(year))
      .sort((a, b) => b.period_key.localeCompare(a.period_key));

    for (const fact of yearFacts) {
      const kf = factsToDanishMetrics(fact.metrics);
      if (kf.bank_balance != null) return {
        amount: kf.bank_balance,
        month: parseInt(fact.period_key.split("-")[1], 10) - 1,
      };
    }

    const prevYear = String(parseInt(year) - 1);
    const prevFacts = facts
      .filter(f => f.period_key.startsWith(prevYear))
      .sort((a, b) => b.period_key.localeCompare(a.period_key));

    for (const fact of prevFacts) {
      const kf = factsToDanishMetrics(fact.metrics);
      if (kf.bank_balance != null) return {
        amount: kf.bank_balance,
        month: -1,
      };
    }

    return null;
  }, [facts, year]);

  const actualsMap = useMemo(() => {
    const map: Record<number, { net: number; bank: number | null }> = {};
    for (const fact of facts) {
      const [factYear, monthStr] = fact.period_key.split("-");
      if (factYear !== year) continue;
      const monthIdx = parseInt(monthStr, 10) - 1;
      const kf = factsToDanishMetrics(fact.metrics);
      const rev = kf.omsaetning ?? 0;
      const costs =
        Math.abs(kf.loenninger ?? 0) +
        Math.abs(kf.salgsomkostninger ?? 0) +
        Math.abs(kf.lokaleomkostninger ?? 0) +
        Math.abs(kf.administrationsomkostninger ?? 0) +
        Math.abs(kf.direkte_omkostninger ?? 0);
      map[monthIdx] = {
        net: rev - costs,
        bank: kf.bank_balance ?? null,
      };
    }
    return map;
  }, [facts, year]);

  const revenueRows = rows.filter(r => r.group === "indtaegter");
  const costRows = rows.filter(r => r.group !== "indtaegter");

  const budgetNetMonthly = MONTHS.map((_, i) => {
    const rev = revenueRows.reduce((s, r) => s + r.values[i], 0);
    const costs = costRows.reduce((s, r) => s + Math.abs(r.values[i]), 0);
    return rev - costs;
  });

  const chartData = useMemo(() => {
    if (!startingCash) return null;

    let runningActual = startingCash.amount;
    let runningBudget = startingCash.amount;

    return MONTHS.map((month, i) => {
      const hasActual = actualsMap[i] !== undefined;
      const actualBank = actualsMap[i]?.bank ?? null;

      if (hasActual && actualBank !== null) {
        runningActual = actualBank;
      } else if (hasActual) {
        runningActual += actualsMap[i].net;
      } else {
        runningActual += budgetNetMonthly[i];
      }

      runningBudget += budgetNetMonthly[i];

      return {
        month,
        actual: hasActual ? Math.round(runningActual) : null,
        forecast: !hasActual ? Math.round(runningActual) : null,
        budget: Math.round(runningBudget),
        isActual: hasActual,
      };
    });
  }, [startingCash, actualsMap, budgetNetMonthly]);

  const cashInsights = useMemo(() => {
    if (!chartData) return null;

    const allValues = chartData.flatMap(d =>
      [d.actual, d.forecast, d.budget].filter(v => v !== null) as number[]
    );
    const minCash = Math.min(...allValues);
    const goesNegative = minCash < 0;
    const criticalMonth = chartData.find(
      d =>
        (d.actual !== null && d.actual < 0) ||
        (d.forecast !== null && d.forecast < 0)
    );

    const avgMonthlyCosts =
      costRows.reduce(
        (s, r) => s + r.values.reduce((a, b) => a + Math.abs(b), 0),
        0
      ) / 12;

    const currentCash = startingCash?.amount ?? 0;
    const runwayMonths =
      avgMonthlyCosts > 0 ? Math.floor(currentCash / avgMonthlyCosts) : null;

    return { minCash, goesNegative, criticalMonth, runwayMonths };
  }, [chartData, costRows, startingCash]);

  const isBudgetEmpty = rows.every(r => r.values.every(v => v === 0));

  if (isBudgetEmpty && !startingCash) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Droplets className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-display font-semibold text-foreground mb-1">
          Cashflow kræver budget og rapporter
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Udfyld dit budget og upload månedlige rapporter for at se din
          cashflow-projektion.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Starting cash */}
        <div className="glass-card rounded-xl p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Udgangspunkt (banksaldo)
          </p>
          {startingCash ? (
            <>
              <p
                className={`text-xl font-display font-bold ${
                  startingCash.amount >= 0
                    ? "text-foreground"
                    : "text-destructive"
                }`}
              >
                {formatK(startingCash.amount)} kr.
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {startingCash.month >= 0
                  ? `Fra ${MONTHS[startingCash.month]}-rapport`
                  : `Fra ${parseInt(year) - 1}-rapport`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ingen banksaldo i rapporter
            </p>
          )}
        </div>

        {/* Cash runway */}
        <div className="glass-card rounded-xl p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Cash runway
          </p>
          {cashInsights?.runwayMonths != null ? (
            <>
              <p
                className={`text-xl font-display font-bold ${
                  cashInsights.runwayMonths >= 6
                    ? "text-primary"
                    : cashInsights.runwayMonths >= 3
                    ? "text-chart-warning"
                    : "text-destructive"
                }`}
              >
                {cashInsights.runwayMonths} måneder
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Ved nuværende udgiftniveau
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>

        {/* Risk indicator */}
        <div className="glass-card rounded-xl p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Cashflow-status
          </p>
          {cashInsights ? (
            <div className="flex items-center gap-2">
              {cashInsights.goesNegative ? (
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              )}
              <div>
                <p
                  className={`text-sm font-semibold ${
                    cashInsights.goesNegative
                      ? "text-destructive"
                      : "text-primary"
                  }`}
                >
                  {cashInsights.goesNegative
                    ? "Risiko for negativ saldo"
                    : "Positiv hele året"}
                </p>
                {cashInsights.criticalMonth && (
                  <p className="text-[10px] text-muted-foreground">
                    Kritisk i {cashInsights.criticalMonth.month}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Upload rapporter for analyse
            </p>
          )}
        </div>
      </div>

      {/* Chart */}
      {chartData && (
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display font-semibold text-foreground">
              Cashflow {year}
            </h3>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-primary" />
                Realiseret
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-primary/40" />
                Forecast
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: "rgba(128,128,128,0.3)" }}
                />
                Budget
              </span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mb-4">
            Akkumuleret banksaldo baseret på faktiske rapporter og
            budgetprojektering
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="cashActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cashForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={48} />
              <Tooltip
                formatter={(value: number | null, name: string) => {
                  if (value === null) return ["—", ""];
                  const labels: Record<string, string> = {
                    actual: "Realiseret saldo",
                    forecast: "Forecast saldo",
                    budget: "Budget saldo",
                  };
                  return [`${Math.round(value / 1000)}k kr.`, labels[name] || name];
                }}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <ReferenceLine y={0} stroke="rgba(128,128,128,0.3)" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="actual" stroke="hsl(var(--primary))" fill="url(#cashActual)" strokeWidth={2} connectNulls={false} dot={false} />
              <Area type="monotone" dataKey="forecast" stroke="hsl(var(--primary))" fill="url(#cashForecast)" strokeWidth={2} strokeDasharray="6 3" connectNulls={false} dot={false} />
              <Area type="monotone" dataKey="budget" stroke="rgba(128,128,128,0.4)" fill="none" strokeWidth={1.5} strokeDasharray="3 3" connectNulls dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly breakdown table */}
      {chartData && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Måned</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ind/ud (netto)</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Saldo (proj.)</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Budget saldo</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, i) => {
                  const projSaldo = row.actual ?? row.forecast;
                  const netFlow = actualsMap[i]?.net ?? budgetNetMonthly[i];
                  return (
                    <tr key={row.month} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {row.month}
                        {row.isActual && (
                          <span className="ml-1.5 text-[9px] text-primary font-semibold">● Actual</span>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${netFlow >= 0 ? "text-primary" : "text-destructive"}`}>
                        {netFlow >= 0 ? "+" : ""}{formatK(netFlow)} kr.
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {projSaldo != null ? `${formatK(projSaldo)} kr.` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatK(row.budget)} kr.
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {projSaldo != null && projSaldo < 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive">
                            <TrendingDown className="h-3 w-3" />
                            Kritisk
                          </span>
                        ) : projSaldo != null && projSaldo < ((cashInsights?.runwayMonths ?? 999) * 10000) ? (
                          <span className="text-[10px] font-medium text-chart-warning">
                            Lav
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-primary">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!startingCash && !isBudgetEmpty && (
        <div className="rounded-xl border border-border bg-secondary/20 p-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-chart-warning shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Ingen banksaldo fundet i dine rapporter. Upload en rapport der
            indeholder en banksaldo for at se akkumuleret cashflow.
          </p>
        </div>
      )}
    </div>
  );
};

export default BudgetCashflowTab;
