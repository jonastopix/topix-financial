import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { MONTHS, formatK, type BudgetRow } from "./types";

interface Props {
  rows: BudgetRow[];
  year: string;
  companyId: string | undefined;
}

const BudgetForecastTab = ({ rows, year, companyId }: Props) => {
  const { data: facts = [] } = useCompanyFacts(companyId);

  const actualsMap = useMemo(() => {
    const map: Record<number, { omsaetning: number; totalCosts: number }> = {};
    for (const fact of facts) {
      const [factYear, monthStr] = fact.period_key.split("-");
      if (factYear !== year) continue;
      const monthIdx = parseInt(monthStr, 10) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;
      const kf = factsToDanishMetrics(fact.metrics);
      const omsaetning = kf.omsaetning ?? 0;
      const totalCosts = Math.abs(kf.loenninger ?? 0)
        + Math.abs(kf.salgsomkostninger ?? 0)
        + Math.abs(kf.lokaleomkostninger ?? 0)
        + Math.abs(kf.administrationsomkostninger ?? 0)
        + Math.abs(kf.direkte_omkostninger ?? 0);
      map[monthIdx] = { omsaetning, totalCosts };
    }
    return map;
  }, [facts, year]);

  const revenueRows = rows.filter(r => r.group === "indtaegter");
  const costRows = rows.filter(r => r.group !== "indtaegter");

  const budgetRevenue = MONTHS.map((_, i) =>
    revenueRows.reduce((s, r) => s + r.values[i], 0)
  );
  const budgetCosts = MONTHS.map((_, i) =>
    costRows.reduce((s, r) => s + Math.abs(r.values[i]), 0)
  );
  const budgetEbitda = MONTHS.map((_, i) => budgetRevenue[i] - budgetCosts[i]);

  const lastActualIdx = useMemo(() => {
    let last = -1;
    for (let i = 0; i < 12; i++) {
      if (actualsMap[i] !== undefined) last = i;
    }
    return last;
  }, [actualsMap]);

  const forecastRevenue = useMemo(() => {
    if (lastActualIdx < 0) return budgetRevenue;
    const actuals = Array.from({ length: lastActualIdx + 1 }, (_, i) =>
      actualsMap[i]?.omsaetning ?? 0
    );
    const avgActual = actuals.reduce((s, v) => s + v, 0) / actuals.length;
    const avgBudget = budgetRevenue.slice(0, lastActualIdx + 1).reduce((s, v) => s + v, 0) / (lastActualIdx + 1);
    const growthFactor = avgBudget > 0 ? avgActual / avgBudget : 1;

    return MONTHS.map((_, i) => {
      if (i <= lastActualIdx) return actualsMap[i]?.omsaetning ?? 0;
      return Math.round(budgetRevenue[i] * growthFactor);
    });
  }, [actualsMap, lastActualIdx, budgetRevenue]);

  const forecastCosts = useMemo(() => {
    if (lastActualIdx < 0) return budgetCosts;
    const actuals = Array.from({ length: lastActualIdx + 1 }, (_, i) =>
      actualsMap[i]?.totalCosts ?? 0
    );
    const avgActual = actuals.reduce((s, v) => s + v, 0) / actuals.length;
    const avgBudget = budgetCosts.slice(0, lastActualIdx + 1).reduce((s, v) => s + v, 0) / (lastActualIdx + 1);
    const growthFactor = avgBudget > 0 ? avgActual / avgBudget : 1;

    return MONTHS.map((_, i) => {
      if (i <= lastActualIdx) return actualsMap[i]?.totalCosts ?? 0;
      return Math.round(budgetCosts[i] * growthFactor);
    });
  }, [actualsMap, lastActualIdx, budgetCosts]);

  const forecastEbitda = MONTHS.map((_, i) => forecastRevenue[i] - forecastCosts[i]);

  // Simulator sliders
  const [simRevPct, setSimRevPct] = useState(0);
  const [simWagePct, setSimWagePct] = useState(0);
  const [simMktPct, setSimMktPct] = useState(0);
  const [simOtherPct, setSimOtherPct] = useState(0);

  const simulated = useMemo(() => {
    const revFactor = 1 + simRevPct / 100;

    const totalForecastRev = forecastRevenue.reduce((s, v) => s + v, 0);
    const totalForecastCosts = forecastCosts.reduce((s, v) => s + v, 0);

    const simRev = totalForecastRev * revFactor;

    const wageFraction = 0.4;
    const mktFraction = 0.15;
    const otherFraction = 0.45;

    const simWages = totalForecastCosts * wageFraction * (1 + simWagePct / 100);
    const simMkt = totalForecastCosts * mktFraction * (1 + simMktPct / 100);
    const simOther = totalForecastCosts * otherFraction * (1 + simOtherPct / 100);
    const simCosts = simWages + simMkt + simOther;

    const simEbitda = simRev - simCosts;
    const baseEbitda = totalForecastRev - totalForecastCosts;
    const ebitdaDelta = simEbitda - baseEbitda;
    const simMargin = simRev > 0 ? (simEbitda / simRev) * 100 : 0;

    return {
      revenue: Math.round(simRev),
      costs: Math.round(simCosts),
      ebitda: Math.round(simEbitda),
      ebitdaDelta: Math.round(ebitdaDelta),
      margin: simMargin,
      baseEbitda: Math.round(baseEbitda),
    };
  }, [forecastRevenue, forecastCosts, budgetCosts, costRows, simRevPct, simWagePct, simMktPct, simOtherPct]);

  return (
    <div className="space-y-6">

      {/* ── SECTION 1: Forecast chart ── */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-semibold text-foreground">
            Forecast {year}
          </h2>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {lastActualIdx >= 0
              ? `Aktuals jan–${MONTHS[lastActualIdx].toLowerCase()} · Forecast ${MONTHS[lastActualIdx + 1]?.toLowerCase() ?? ""}–dec`
              : "Ingen aktuals — viser budget som forecast"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Grå linje = realiseret · Grøn linje = forecast baseret på din vækstrate · Stiplet = budget
        </p>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            {
              label: "Forecast omsætning",
              value: formatK(forecastRevenue.reduce((s, v) => s + v, 0)),
              budget: formatK(budgetRevenue.reduce((s, v) => s + v, 0)),
            },
            {
              label: "Forecast EBITDA",
              value: formatK(forecastEbitda.reduce((s, v) => s + v, 0)),
              budget: formatK(budgetEbitda.reduce((s, v) => s + v, 0)),
              isEbitda: true,
            },
            {
              label: "Forecast margin",
              value: (() => {
                const rev = forecastRevenue.reduce((s, v) => s + v, 0);
                const ebitda = forecastEbitda.reduce((s, v) => s + v, 0);
                return rev > 0 ? `${((ebitda / rev) * 100).toFixed(1)}%` : "—";
              })(),
              budget: (() => {
                const rev = budgetRevenue.reduce((s, v) => s + v, 0);
                const ebitda = budgetEbitda.reduce((s, v) => s + v, 0);
                return rev > 0 ? `${((ebitda / rev) * 100).toFixed(1)}%` : "—";
              })(),
            },
          ].map(kpi => (
            <div key={kpi.label} className="p-4 rounded-xl bg-secondary/50 border border-border/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{kpi.label}</p>
              <p className={`text-lg font-display font-bold ${kpi.isEbitda && forecastEbitda.reduce((s,v)=>s+v,0) < 0 ? "text-destructive" : "text-foreground"}`}>
                {kpi.value}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Budget: {kpi.budget}</p>
            </div>
          ))}
        </div>

        {/* Month-by-month table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider py-2 pr-3 w-24">Måned</th>
                {MONTHS.map((m, i) => (
                  <th key={m} className={`text-center text-[10px] font-medium py-2 px-1 min-w-[52px] ${i <= lastActualIdx ? "text-foreground" : "text-muted-foreground"}`}>
                    {m}
                    {i <= lastActualIdx && <span className="block text-[8px] text-primary">●</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {[
                { label: "Budget", data: budgetEbitda, muted: true },
                { label: "Forecast EBITDA", data: forecastEbitda, muted: false },
              ].map(row => (
                <tr key={row.label} className={row.muted ? "opacity-50" : ""}>
                  <td className="py-2.5 pr-3 text-[10px] font-medium text-muted-foreground whitespace-nowrap">{row.label}</td>
                  {row.data.map((val, i) => (
                    <td key={i} className={`text-center py-2.5 px-1 text-[11px] font-medium ${val >= 0 ? "text-primary" : "text-destructive"}`}>
                      {formatK(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTION 2: What-if simulator ── */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-semibold text-foreground">
            What-if simulator
          </h2>
          <button
            onClick={() => { setSimRevPct(0); setSimWagePct(0); setSimMktPct(0); setSimOtherPct(0); }}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Nulstil
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Skru på tallene og se hvad der sker med dit helårsresultat.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {[
            { label: "Omsætning", value: simRevPct, set: setSimRevPct, isRevenue: true },
            { label: "Lønninger", value: simWagePct, set: setSimWagePct, isRevenue: false },
            { label: "Marketing", value: simMktPct, set: setSimMktPct, isRevenue: false },
            { label: "Andre omkostninger", value: simOtherPct, set: setSimOtherPct, isRevenue: false },
          ].map(slider => (
            <div key={slider.label}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground">{slider.label}</label>
                <span className={`text-sm font-bold min-w-[48px] text-right ${
                  slider.value === 0 ? "text-muted-foreground" :
                  (slider.isRevenue ? slider.value > 0 : slider.value < 0) ? "text-primary" : "text-destructive"
                }`}>
                  {slider.value > 0 ? "+" : ""}{slider.value}%
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="100"
                step="1"
                value={slider.value}
                onChange={e => slider.set(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>-50%</span>
                <span>0</span>
                <span>+100%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Impact display */}
        <div className="rounded-xl border border-border bg-secondary/30 p-5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Effekt på helårsresultat
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Omsætning</p>
              <p className="text-base font-display font-bold text-foreground">{formatK(simulated.revenue)} kr.</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Omkostninger</p>
              <p className="text-base font-display font-bold text-foreground">{formatK(simulated.costs)} kr.</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">EBITDA</p>
              <p className={`text-base font-display font-bold ${simulated.ebitda >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatK(simulated.ebitda)} kr.
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Ændring vs. forecast</p>
              <div className="flex items-center gap-1.5">
                {simulated.ebitdaDelta > 0 ? (
                  <TrendingUp className="h-4 w-4 text-primary" />
                ) : simulated.ebitdaDelta < 0 ? (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                ) : (
                  <Minus className="h-4 w-4 text-muted-foreground" />
                )}
                <p className={`text-base font-display font-bold ${
                  simulated.ebitdaDelta > 0 ? "text-primary" :
                  simulated.ebitdaDelta < 0 ? "text-destructive" :
                  "text-muted-foreground"
                }`}>
                  {simulated.ebitdaDelta > 0 ? "+" : ""}{formatK(simulated.ebitdaDelta)} kr.
                </p>
              </div>
            </div>
          </div>

          {/* Margin bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-muted-foreground">EBITDA-margin</span>
              <span className={`text-xs font-bold ${simulated.margin >= 0 ? "text-primary" : "text-destructive"}`}>
                {simulated.margin.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${simulated.margin >= 0 ? "bg-primary" : "bg-destructive"}`}
                style={{ width: `${Math.min(100, Math.max(0, Math.abs(simulated.margin)))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default BudgetForecastTab;
