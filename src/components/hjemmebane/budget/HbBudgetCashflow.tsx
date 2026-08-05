import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { formatCompact, formatDKK } from "@/lib/financialUtils";
import { MONTHS, type BudgetRow } from "@/components/budget/types";
import { HbCard } from "../HbCard";
import { deriveRunwayTone } from "./budgetTone";
import { TalStat, fmtNumber, hbBudgetTooltipStyle } from "./hbBudgetShared";

/** Cashflow-sektionen (design-blok §c8): afledningerne spejler
    BudgetCashflowTab 1:1 (startsaldo-opslag, actuals-net, akkumuleret
    projektion); runway-trappen går gennem deriveRunwayTone
    (quiet/attention — hb-rust ved kritisk, aldrig trafiklys/ikoner).
    Grafen taler hb-tokens: realiseret solid evergreen, forecast stiplet,
    budget tynd stiplet ink-soft. */

interface Props {
  rows: BudgetRow[];
  year: string;
  companyId: string | undefined;
}

const RUNWAY_LABEL: Record<string, string> = {
  solid: "Solidt afsæt",
  stram: "Stram — hold øje",
  kritisk: "Kritisk kort",
};

export const HbBudgetCashflow = ({ rows, year, companyId }: Props) => {
  const { data: facts = [] } = useCompanyFacts(companyId);

  // Startsaldo — spejler BudgetCashflowTab.tsx:20-47.
  const startingCash = useMemo(() => {
    const yearFacts = facts
      .filter((f) => f.period_key.startsWith(year))
      .sort((a, b) => b.period_key.localeCompare(a.period_key));

    for (const fact of yearFacts) {
      const kf = factsToDanishMetrics(fact.metrics);
      if (kf.bank_balance != null)
        return { amount: kf.bank_balance, month: parseInt(fact.period_key.split("-")[1], 10) - 1 };
    }

    const prevYear = String(parseInt(year) - 1);
    const prevFacts = facts
      .filter((f) => f.period_key.startsWith(prevYear))
      .sort((a, b) => b.period_key.localeCompare(a.period_key));

    for (const fact of prevFacts) {
      const kf = factsToDanishMetrics(fact.metrics);
      if (kf.bank_balance != null) return { amount: kf.bank_balance, month: -1 };
    }

    return null;
  }, [facts, year]);

  // Netto-flow + banksaldo pr. måned — spejler BudgetCashflowTab.tsx:49-69.
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
      map[monthIdx] = { net: rev - costs, bank: kf.bank_balance ?? null };
    }
    return map;
  }, [facts, year]);

  const revenueRows = rows.filter((r) => r.group === "indtaegter");
  const costRows = rows.filter((r) => r.group !== "indtaegter");

  const budgetNetMonthly = MONTHS.map((_, i) => {
    const rev = revenueRows.reduce((s, r) => s + r.values[i], 0);
    const costs = costRows.reduce((s, r) => s + Math.abs(r.values[i]), 0);
    return rev - costs;
  });

  // Akkumuleret saldo — spejler BudgetCashflowTab.tsx:80-108.
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

  // Indsigter — spejler BudgetCashflowTab.tsx:110-135.
  const cashInsights = useMemo(() => {
    if (!chartData) return null;

    const allValues = chartData.flatMap((d) =>
      [d.actual, d.forecast, d.budget].filter((v) => v !== null) as number[],
    );
    const minCash = Math.min(...allValues);
    const goesNegative = minCash < 0;
    const criticalMonth = chartData.find(
      (d) => (d.actual !== null && d.actual < 0) || (d.forecast !== null && d.forecast < 0),
    );

    const avgMonthlyCosts =
      costRows.reduce((s, r) => s + r.values.reduce((a, b) => a + Math.abs(b), 0), 0) / 12;

    const currentCash = startingCash?.amount ?? 0;
    const runwayMonths = avgMonthlyCosts > 0 ? Math.floor(currentCash / avgMonthlyCosts) : null;

    return { minCash, goesNegative, criticalMonth, runwayMonths };
  }, [chartData, costRows, startingCash]);

  const isBudgetEmpty = rows.every((r) => r.values.every((v) => v === 0));

  if (isBudgetEmpty && !startingCash) {
    return (
      <HbCard className="p-5">
        <p className="text-sm text-hb-ink-soft">
          Cashflow kræver budget og rapporter — udfyld dit budget og upload månedlige rapporter, så
          tegner vi saldo-kurven her.
        </p>
      </HbCard>
    );
  }

  const runwayTone = deriveRunwayTone(cashInsights?.runwayMonths ?? null);

  return (
    <div className="space-y-5">
      {/* KPI-række */}
      <div className="grid gap-4 sm:grid-cols-3">
        <HbCard className="p-5">
          <TalStat
            label="Udgangspunkt (banksaldo)"
            value={startingCash ? formatDKK(startingCash.amount) : "—"}
            attention={startingCash != null && startingCash.amount < 0}
            sub={
              startingCash
                ? startingCash.month >= 0
                  ? `Fra ${MONTHS[startingCash.month]}-rapporten`
                  : `Fra ${parseInt(year) - 1}-rapport`
                : "Ingen banksaldo i rapporterne"
            }
          />
        </HbCard>
        <HbCard className="p-5">
          <TalStat
            label="Cash runway"
            value={
              cashInsights?.runwayMonths != null
                ? `${cashInsights.runwayMonths} ${cashInsights.runwayMonths === 1 ? "måned" : "måneder"}`
                : "—"
            }
            attention={runwayTone.tone === "attention"}
            sub={
              cashInsights?.runwayMonths != null
                ? `${RUNWAY_LABEL[runwayTone.state] ?? ""} · ved nuværende udgiftsniveau`
                : "Kræver banksaldo i rapporterne"
            }
          />
        </HbCard>
        <HbCard className="p-5">
          <TalStat
            label="Cashflow-status"
            value={
              cashInsights
                ? cashInsights.goesNegative
                  ? "Risiko for negativ saldo"
                  : "Positiv hele året"
                : "—"
            }
            attention={cashInsights?.goesNegative === true}
            sub={
              cashInsights?.criticalMonth
                ? `Kritisk i ${cashInsights.criticalMonth.month}`
                : cashInsights
                  ? undefined
                  : "Upload rapporter for analyse"
            }
          />
        </HbCard>
      </div>

      {/* Akkumuleret saldo */}
      {chartData && (
        <HbCard className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              Akkumuleret banksaldo {year}
            </p>
            <p className="text-xs text-hb-ink-soft">Solid = realiseret · stiplet = forecast · tynd = budget</p>
          </div>
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="hbCashActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--hb-evergreen))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--hb-evergreen))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="hbCashForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--hb-evergreen))" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="hsl(var(--hb-evergreen))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--hb-line))" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "hsl(var(--hb-ink-soft))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--hb-ink-soft))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCompact(v)}
                  width={52}
                />
                <Tooltip
                  formatter={(value: number | null, name: string) => {
                    if (value === null) return ["—", ""];
                    const labels: Record<string, string> = {
                      actual: "Realiseret saldo",
                      forecast: "Forecast saldo",
                      budget: "Budget saldo",
                    };
                    return [formatDKK(value), labels[name] || name];
                  }}
                  {...hbBudgetTooltipStyle}
                />
                <ReferenceLine y={0} stroke="hsl(var(--hb-line))" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="hsl(var(--hb-evergreen))"
                  fill="url(#hbCashActual)"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="forecast"
                  stroke="hsl(var(--hb-evergreen))"
                  fill="url(#hbCashForecast)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  connectNulls={false}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="budget"
                  stroke="hsl(var(--hb-ink-soft))"
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  connectNulls
                  dot={false}
                  opacity={0.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </HbCard>
      )}

      {/* Månedstabel */}
      {chartData && (
        <HbCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hb-line">
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                    Måned
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                    Ind/ud (netto)
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                    Saldo (proj.)
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                    Budget saldo
                  </th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, i) => {
                  const projSaldo = row.actual ?? row.forecast;
                  const netFlow = actualsMap[i]?.net ?? budgetNetMonthly[i];
                  const status =
                    projSaldo != null && projSaldo < 0
                      ? { label: "Kritisk", className: "text-hb-rust" }
                      : projSaldo != null &&
                          projSaldo < (cashInsights?.runwayMonths ?? 999) * 10000
                        ? { label: "Lav", className: "text-hb-rust/80" }
                        : { label: "OK", className: "text-hb-ink-soft" };
                  return (
                    <tr key={row.month} className="border-b border-hb-line/60">
                      <td className="px-4 py-2.5 text-xs font-medium text-hb-ink">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2.5 w-2.5 rounded-full border",
                              row.isActual ? "border-hb-evergreen bg-hb-evergreen" : "border-hb-line",
                            )}
                            title={row.isActual ? "Realiseret måned" : "Projektion"}
                          />
                          {row.month}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right text-xs tabular-nums",
                          netFlow < 0 ? "text-hb-rust" : "text-hb-ink",
                        )}
                      >
                        {netFlow >= 0 ? "+" : ""}
                        {fmtNumber(netFlow)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums text-hb-ink">
                        {projSaldo != null ? fmtNumber(projSaldo) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums text-hb-ink-soft">
                        {fmtNumber(row.budget)}
                      </td>
                      <td className={cn("px-4 py-2.5 text-center text-[11px] font-medium", status.className)}>
                        {status.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-hb-line px-4 py-2 text-[11px] text-hb-ink-soft">
            Alle beløb i kr. · fyldt prik = måned med rapport-tal.
          </p>
        </HbCard>
      )}

      {!startingCash && !isBudgetEmpty && (
        <HbCard className="p-5">
          <p className="text-sm text-hb-ink-soft">
            Ingen banksaldo fundet i dine rapporter — upload en rapport med banksaldo, så tegner vi den
            akkumulerede kurve.
          </p>
        </HbCard>
      )}
    </div>
  );
};
