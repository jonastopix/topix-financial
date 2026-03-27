import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus, X, Plus } from "lucide-react";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { MONTHS, formatK, type BudgetRow } from "./types";

interface SimEvent {
  id: string;
  type: "hire" | "marketing" | "rent" | "software" | "custom";
  label: string;
  monthlyCost: number;
  startMonth: number;
  isRevenue: boolean;
}

const EVENT_PRESETS = [
  { type: "hire", label: "Ansæt én medarbejder", defaultCost: 40000, isRevenue: false,
    hint: "Løn + 8% arbejdsgiverbidrag inkl." },
  { type: "marketing", label: "Fordobl marketing", defaultCost: 0, isRevenue: false,
    hint: "Beregnes automatisk fra dit marketingbudget" },
  { type: "rent", label: "Flyt til større lokaler", defaultCost: 15000, isRevenue: false,
    hint: "Ekstra månedlig husleje" },
  { type: "software", label: "Nyt softwareabonnement", defaultCost: 2500, isRevenue: false,
    hint: "Månedlig licens" },
  { type: "custom", label: "Brugerdefineret", defaultCost: 10000, isRevenue: false,
    hint: "Indtast selv beløb og navn" },
] as const;

interface Props {
  rows: BudgetRow[];
  year: string;
  companyId: string | undefined;
  userId: string | undefined;
}

const BudgetForecastTab = ({ rows, year, companyId, userId }: Props) => {
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
    const cappedGrowthFactor = Math.min(3, Math.max(0.1, growthFactor));

    return MONTHS.map((_, i) => {
      if (i <= lastActualIdx) return actualsMap[i]?.omsaetning ?? 0;
      return Math.round(budgetRevenue[i] * cappedGrowthFactor);
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
    const cappedGrowthFactor = Math.min(3, Math.max(0.1, growthFactor));

    return MONTHS.map((_, i) => {
      if (i <= lastActualIdx) return actualsMap[i]?.totalCosts ?? 0;
      return Math.round(budgetCosts[i] * cappedGrowthFactor);
    });
  }, [actualsMap, lastActualIdx, budgetCosts]);

  const forecastEbitda = MONTHS.map((_, i) => forecastRevenue[i] - forecastCosts[i]);

  // Business event simulator
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newEventType, setNewEventType] = useState<SimEvent["type"]>("hire");
  const [newEventCost, setNewEventCost] = useState(40000);
  const [newEventLabel, setNewEventLabel] = useState("");
  const [newEventMonth, setNewEventMonth] = useState(0);
  const [newEventIsRevenue, setNewEventIsRevenue] = useState(false);

  const simulated = useMemo(() => {
    const totalForecastRev = forecastRevenue.reduce((s, v) => s + v, 0);
    const totalForecastCosts = forecastCosts.reduce((s, v) => s + v, 0);
    const baseEbitda = totalForecastRev - totalForecastCosts;

    let extraRevenue = 0;
    let extraCosts = 0;
    for (const event of events) {
      const monthsActive = 12 - event.startMonth;
      const annualImpact = event.monthlyCost * monthsActive;
      if (event.isRevenue) {
        extraRevenue += annualImpact;
      } else {
        extraCosts += annualImpact;
      }
    }

    const simRev = totalForecastRev + extraRevenue;
    const simCosts = totalForecastCosts + extraCosts;
    const simEbitda = simRev - simCosts;
    const ebitdaDelta = simEbitda - baseEbitda;
    const simMargin = simRev > 0 ? (simEbitda / simRev) * 100 : 0;

    const monthlyImpact = events.reduce((s, e) => {
      const monthly = e.isRevenue ? e.monthlyCost : -e.monthlyCost;
      return s + monthly;
    }, 0);

    return {
      revenue: Math.round(simRev),
      costs: Math.round(simCosts),
      ebitda: Math.round(simEbitda),
      ebitdaDelta: Math.round(ebitdaDelta),
      margin: simMargin,
      monthlyImpact: Math.round(monthlyImpact),
      extraCosts: Math.round(extraCosts),
      extraRevenue: Math.round(extraRevenue),
    };
  }, [forecastRevenue, forecastCosts, events]);

  const isBudgetEmpty = rows.every(r => r.values.every(v => v === 0));

  if (isBudgetEmpty) {
    return (
      <div className="flex flex-col items-center text-center py-16 glass-card rounded-xl">
        <div className="p-4 rounded-2xl bg-primary/10 mb-4">
          <TrendingUp className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-base font-display font-semibold text-foreground mb-2">
          Udfyld dit budget først
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Forecast og simulator kræver at du har et budget med tal. Gå til Oversigt eller Importér for at komme i gang.
        </p>
      </div>
    );
  }

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

        {lastActualIdx >= 0 && lastActualIdx < 2 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
            <span className="text-[11px] text-amber-700 dark:text-amber-400">
              Forecast er baseret på {lastActualIdx + 1} måneds data — præcisionen stiger når flere rapporter er uploaded.
            </span>
          </div>
        )}

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

      {/* ── SECTION 2: Business event simulator ── */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-semibold text-foreground">
            Scenariesimulator
          </h2>
          {events.length > 0 && (
            <button
              onClick={() => setEvents([])}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Nulstil alle
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Tilføj konkrete business-hændelser og se effekten på dit helårsresultat.
        </p>

        {/* Event list */}
        {events.length > 0 && (
          <div className="space-y-2 mb-4">
            {events.map(event => (
              <div key={event.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{event.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.isRevenue ? "+" : "-"}{(event.monthlyCost / 1000).toFixed(0)}k kr./md
                    {" · "}fra {MONTHS[event.startMonth]}
                    {" · "}
                    <span className={event.isRevenue ? "text-primary" : "text-destructive"}>
                      {event.isRevenue ? "+" : "-"}
                      {((event.monthlyCost * (12 - event.startMonth)) / 1000).toFixed(0)}k kr. i år
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setEvents(prev => prev.filter(e => e.id !== event.id))}
                  className="ml-3 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add event */}
        {!addingEvent ? (
          <button
            onClick={() => setAddingEvent(true)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-border/50 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all"
          >
            <Plus className="h-4 w-4" />
            Tilføj hændelse
          </button>
        ) : (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Ny hændelse</p>
            {/* Preset buttons */}
            <div className="flex flex-wrap gap-2">
              {EVENT_PRESETS.map(preset => (
                <button
                  key={preset.type}
                  onClick={() => {
                    setNewEventType(preset.type as SimEvent["type"]);
                    setNewEventLabel(preset.label);
                    if (preset.type === "marketing") {
                      const mktRows = costRows.filter(r => r.group === "salg_marketing");
                      const avgMonthly = mktRows.reduce(
                        (s, r) => s + r.values.reduce((a, b) => a + b, 0), 0
                      ) / 12;
                      setNewEventCost(Math.round(avgMonthly));
                    } else {
                      setNewEventCost(preset.defaultCost);
                    }
                    setNewEventIsRevenue(preset.isRevenue);
                  }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                    newEventType === preset.type
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Event details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Navn</label>
                <input
                  value={newEventLabel}
                  onChange={e => setNewEventLabel(e.target.value)}
                  placeholder="Beskriv hændelsen"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Månedlig beløb (kr.)</label>
                <input
                  type="number"
                  value={newEventCost}
                  onChange={e => setNewEventCost(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Fra hvilken måned?</label>
                <select
                  value={newEventMonth}
                  onChange={e => setNewEventMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Type</label>
                <div className="flex gap-2 h-[38px] items-center">
                  {[
                    { key: false, label: "Omkostning" },
                    { key: true, label: "Indtægt" },
                  ].map(opt => (
                    <button
                      key={String(opt.key)}
                      onClick={() => setNewEventIsRevenue(opt.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        newEventIsRevenue === opt.key
                          ? opt.key
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-destructive/10 text-destructive border-destructive/30"
                          : "bg-background text-muted-foreground border-border"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  if (!newEventLabel.trim() || newEventCost <= 0) return;
                  setEvents(prev => [...prev, {
                    id: crypto.randomUUID(),
                    type: newEventType,
                    label: newEventLabel.trim(),
                    monthlyCost: newEventCost,
                    startMonth: newEventMonth,
                    isRevenue: newEventIsRevenue,
                  }]);
                  setAddingEvent(false);
                  setNewEventLabel("");
                  setNewEventCost(40000);
                  setNewEventMonth(0);
                  setNewEventIsRevenue(false);
                }}
                disabled={!newEventLabel.trim() || newEventCost <= 0}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Tilføj
              </button>
              <button
                onClick={() => setAddingEvent(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Annuller
              </button>
            </div>
          </div>
        )}

        {/* Impact summary */}
        {events.length > 0 && (
          <div className="rounded-xl border border-border bg-secondary/30 p-5 mt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Samlet effekt på helåret
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Ekstra omkostninger</p>
                <p className="text-base font-display font-bold text-destructive">
                  -{formatK(simulated.extraCosts)} kr.
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Ekstra omsætning</p>
                <p className="text-base font-display font-bold text-primary">
                  +{formatK(simulated.extraRevenue)} kr.
                </p>
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

            {/* Monthly impact bar */}
            <div className="mt-4 pt-4 border-t border-border/30">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-muted-foreground">Månedlig nettoeffekt</span>
                <span className={`text-xs font-bold ${simulated.monthlyImpact >= 0 ? "text-primary" : "text-destructive"}`}>
                  {simulated.monthlyImpact >= 0 ? "+" : ""}{formatK(simulated.monthlyImpact)} kr./md
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${simulated.ebitdaDelta >= 0 ? "bg-primary" : "bg-destructive"}`}
                  style={{
                    width: `${Math.min(100, Math.max(5,
                      Math.abs(simulated.ebitdaDelta) /
                      Math.max(1, Math.abs(simulated.ebitda - simulated.ebitdaDelta)) * 100
                    ))}%`
                  }}
                />
              </div>
            </div>

            {/* EBITDA margin */}
            <div className="mt-3">
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
        )}
      </div>

    </div>
  );
};

export default BudgetForecastTab;
