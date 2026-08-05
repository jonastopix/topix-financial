import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { formatDKK } from "@/lib/financialUtils";
import {
  deriveGrowthFactor,
  loadSimEvents,
  saveSimEvents,
  type SimEvent,
} from "@/lib/budgetEngine";
import { MONTHS, type BudgetRow } from "@/components/budget/types";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbField, HbInput, HbSelect } from "../admin/HbField";
import { TalStat, fmtNumber } from "./hbBudgetShared";

/** Hvad-hvis-sektionen (design-blok §c7): forecast-kort + måned-for-måned
    m. prik-markerede aktual-måneder (leveringsbåndets formsprog) og
    simulatoren m. presets. Afledningerne spejler BudgetForecastTab 1:1
    (actualsMap, forecast via deriveGrowthFactor, impact-panelets regnestykke);
    sim-events persisteres gennem budgetEngine (W7) m. debounce her.
    Procentbarernes primary/destructive-teater arves ikke — effekten taler
    tone-farvede tal. */

// Presets — ordret fra BudgetForecastTab.tsx:17-28.
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

export const HbBudgetSimulator = ({ rows, year, companyId, userId }: Props) => {
  const { data: facts = [] } = useCompanyFacts(companyId);

  const [events, setEvents] = useState<SimEvent[]>([]);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newEventType, setNewEventType] = useState<SimEvent["type"]>("hire");
  const [newEventCost, setNewEventCost] = useState(40000);
  const [newEventLabel, setNewEventLabel] = useState("");
  const [newEventMonth, setNewEventMonth] = useState(0);
  const [newEventIsRevenue, setNewEventIsRevenue] = useState(false);

  // Aktuals pr. måned — spejler BudgetForecastTab.tsx:40-58.
  const actualsMap = useMemo(() => {
    const map: Record<number, { omsaetning: number; totalCosts: number }> = {};
    for (const fact of facts) {
      const [factYear, monthStr] = fact.period_key.split("-");
      if (factYear !== year) continue;
      const monthIdx = parseInt(monthStr, 10) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;
      const kf = factsToDanishMetrics(fact.metrics);
      const omsaetning = kf.omsaetning ?? 0;
      const totalCosts =
        Math.abs(kf.loenninger ?? 0) +
        Math.abs(kf.salgsomkostninger ?? 0) +
        Math.abs(kf.lokaleomkostninger ?? 0) +
        Math.abs(kf.administrationsomkostninger ?? 0) +
        Math.abs(kf.direkte_omkostninger ?? 0) +
        Math.abs(kf.afskrivninger ?? 0);
      map[monthIdx] = { omsaetning, totalCosts };
    }
    return map;
  }, [facts, year]);

  const revenueRows = rows.filter((r) => r.group === "indtaegter");
  const costRows = rows.filter((r) => r.group !== "indtaegter");

  const budgetRevenue = MONTHS.map((_, i) => revenueRows.reduce((s, r) => s + r.values[i], 0));
  const budgetCosts = MONTHS.map((_, i) => costRows.reduce((s, r) => s + Math.abs(r.values[i]), 0));
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
    const actuals = Array.from({ length: lastActualIdx + 1 }, (_, i) => actualsMap[i]?.omsaetning ?? 0);
    const factor = deriveGrowthFactor(actuals, budgetRevenue);
    return MONTHS.map((_, i) => {
      if (i <= lastActualIdx) return actualsMap[i]?.omsaetning ?? 0;
      return Math.round(budgetRevenue[i] * factor);
    });
  }, [actualsMap, lastActualIdx, budgetRevenue]);

  const forecastCosts = useMemo(() => {
    if (lastActualIdx < 0) return budgetCosts;
    const actuals = Array.from({ length: lastActualIdx + 1 }, (_, i) => actualsMap[i]?.totalCosts ?? 0);
    const factor = deriveGrowthFactor(actuals, budgetCosts);
    return MONTHS.map((_, i) => {
      if (i <= lastActualIdx) return actualsMap[i]?.totalCosts ?? 0;
      return Math.round(budgetCosts[i] * factor);
    });
  }, [actualsMap, lastActualIdx, budgetCosts]);

  const forecastEbitda = MONTHS.map((_, i) => forecastRevenue[i] - forecastCosts[i]);

  // Sim-events: load + debounced persistering via motoren (W7).
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const loaded = await loadSimEvents(companyId, year);
      if (loaded.length > 0) setEvents(loaded);
    })();
  }, [companyId, year]);

  useEffect(() => {
    if (!companyId || !userId) return;
    const timer = setTimeout(() => {
      saveSimEvents({ userId, companyId, year, events });
    }, 1000);
    return () => clearTimeout(timer);
  }, [events, companyId, userId, year]);

  // Samlet effekt — spejler BudgetForecastTab.tsx:176-214.
  const simulated = useMemo(() => {
    const totalForecastRev = forecastRevenue.reduce((s, v) => s + v, 0);
    const totalForecastCosts = forecastCosts.reduce((s, v) => s + v, 0);
    const baseEbitda = totalForecastRev - totalForecastCosts;

    let extraRevenue = 0;
    let extraCosts = 0;
    for (const event of events) {
      const monthsActive = 12 - event.startMonth;
      const annualImpact = event.monthlyCost * monthsActive;
      if (event.isRevenue) extraRevenue += annualImpact;
      else extraCosts += annualImpact;
    }

    const simRev = totalForecastRev + extraRevenue;
    const simCosts = totalForecastCosts + extraCosts;
    const simEbitda = simRev - simCosts;
    const ebitdaDelta = simEbitda - baseEbitda;
    const simMargin = simRev > 0 ? (simEbitda / simRev) * 100 : 0;

    const monthlyImpact = events.reduce((s, e) => s + (e.isRevenue ? e.monthlyCost : -e.monthlyCost), 0);

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

  const isBudgetEmpty = rows.every((r) => r.values.every((v) => v === 0));

  if (isBudgetEmpty) {
    return (
      <HbCard className="p-5">
        <p className="text-sm text-hb-ink-soft">
          Hvad-hvis kræver et budget med tal — udfyld det under Scenarier eller importér et, så kan du
          simulere ansættelser, marketing og lokaler her.
        </p>
      </HbCard>
    );
  }

  const forecastRevTotal = forecastRevenue.reduce((s, v) => s + v, 0);
  const forecastEbitdaTotal = forecastEbitda.reduce((s, v) => s + v, 0);
  const budgetRevTotal = budgetRevenue.reduce((s, v) => s + v, 0);
  const budgetEbitdaTotal = budgetEbitda.reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-5">
      {/* Forecast-kort */}
      <HbCard className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
            Forecast {year}
          </p>
          <p className="text-xs text-hb-ink-soft">
            {lastActualIdx >= 0
              ? `Realiseret jan–${MONTHS[lastActualIdx].toLowerCase()} · forecast ${MONTHS[lastActualIdx + 1]?.toLowerCase() ?? ""}–dec`
              : "Ingen rapporter endnu — budgettet vises som forecast"}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <TalStat
            label="Forecast omsætning"
            value={formatDKK(forecastRevTotal)}
            sub={`Budget: ${formatDKK(budgetRevTotal)}`}
          />
          <TalStat
            label="Forecast EBITDA"
            value={formatDKK(forecastEbitdaTotal)}
            attention={forecastEbitdaTotal < 0}
            sub={`Budget: ${formatDKK(budgetEbitdaTotal)}`}
          />
          <TalStat
            label="Forecast margin"
            value={forecastRevTotal > 0 ? `${((forecastEbitdaTotal / forecastRevTotal) * 100).toFixed(1)} %` : "—"}
            attention={forecastEbitdaTotal < 0}
            sub={
              budgetRevTotal > 0
                ? `Budget: ${((budgetEbitdaTotal / budgetRevTotal) * 100).toFixed(1)} %`
                : undefined
            }
          />
        </div>
        {lastActualIdx >= 0 && lastActualIdx < 2 && (
          <p className="mt-3 text-xs text-hb-ink-soft">
            Forecastet bygger på {lastActualIdx + 1} måneds data — præcisionen stiger med flere rapporter.
          </p>
        )}

        {/* Måned-for-måned m. prik-markerede aktual-måneder */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-hb-line">
                <th className="w-32 py-2 pr-3 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                  Måned
                </th>
                {MONTHS.map((m, i) => (
                  <th key={m} className="min-w-[56px] px-1 py-2 text-center">
                    <span className="flex flex-col items-center gap-1">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full border",
                          i <= lastActualIdx ? "border-hb-evergreen bg-hb-evergreen" : "border-hb-line",
                        )}
                        title={i <= lastActualIdx ? "Realiseret måned" : "Forecast"}
                      />
                      <span className="text-[10px] font-medium text-hb-ink-soft">{m}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-hb-line/60">
                <td className="py-2 pr-3 text-[11px] text-hb-ink-soft">Budget EBITDA</td>
                {budgetEbitda.map((val, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-1 py-2 text-center text-[11px] tabular-nums",
                      val < 0 ? "text-hb-rust/70" : "text-hb-ink-soft",
                    )}
                  >
                    {fmtNumber(val)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 text-[11px] font-medium text-hb-ink">Forecast EBITDA</td>
                {forecastEbitda.map((val, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-1 py-2 text-center text-[11px] font-medium tabular-nums",
                      val < 0 ? "text-hb-rust" : "text-hb-ink",
                    )}
                  >
                    {fmtNumber(val)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-hb-ink-soft">
          Alle beløb i kr. · fyldt prik = måned med rapport-tal.
        </p>
      </HbCard>

      {/* Simulatoren */}
      <HbCard className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-editorial text-lg font-medium text-hb-ink">Hvad sker der hvis…</p>
          <div className="flex items-center gap-3 text-xs text-hb-ink-soft">
            {events.length > 0 && <span>Gemt automatisk</span>}
            {events.length > 0 && (
              <button
                type="button"
                onClick={() => setEvents([])}
                className="underline-offset-4 hover:text-hb-ink hover:underline"
              >
                Nulstil alle
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-hb-ink-soft">
          Tilføj en hændelse — ansæt en medarbejder, fordobl marketing, flyt lokaler — og se effekten på
          helårsresultatet med det samme.
        </p>

        {events.length > 0 && (
          <div className="mt-4 space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-hb-line/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-hb-ink">{event.label}</p>
                  <p className="text-xs text-hb-ink-soft">
                    {event.isRevenue ? "+" : "−"}{fmtNumber(event.monthlyCost)} kr./md · fra {MONTHS[event.startMonth]} ·{" "}
                    <span className={event.isRevenue ? "text-hb-ink" : "text-hb-rust"}>
                      {event.isRevenue ? "+" : "−"}
                      {fmtNumber(event.monthlyCost * (12 - event.startMonth))} kr. i år
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEvents((prev) => prev.filter((e) => e.id !== event.id))}
                  className="shrink-0 text-xs text-hb-ink-soft underline-offset-4 hover:text-hb-rust hover:underline"
                >
                  Fjern
                </button>
              </div>
            ))}
          </div>
        )}

        {!addingEvent ? (
          <div className="mt-4">
            <HbButton variant="secondary" className="h-9 px-5 text-sm" onClick={() => setAddingEvent(true)}>
              Tilføj hændelse
            </HbButton>
          </div>
        ) : (
          <div className="mt-4 rounded-hb border border-hb-line bg-hb-sand/30 p-4">
            <p className="text-sm font-medium text-hb-ink">Ny hændelse</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EVENT_PRESETS.map((preset) => (
                <button
                  key={preset.type}
                  type="button"
                  title={preset.hint}
                  onClick={() => {
                    setNewEventType(preset.type as SimEvent["type"]);
                    setNewEventLabel(preset.label);
                    if (preset.type === "marketing") {
                      const mktRows = costRows.filter((r) => r.group === "salg_marketing");
                      const avgMonthly =
                        mktRows.reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0) / 12;
                      setNewEventCost(Math.round(avgMonthly));
                    } else {
                      setNewEventCost(preset.defaultCost);
                    }
                    setNewEventIsRevenue(preset.isRevenue);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    newEventType === preset.type
                      ? "border-hb-evergreen bg-hb-evergreen text-white"
                      : "border-hb-line text-hb-ink-soft hover:border-hb-evergreen/50 hover:text-hb-ink",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <HbField label="Navn">
                <HbInput
                  value={newEventLabel}
                  onChange={(e) => setNewEventLabel(e.target.value)}
                  placeholder="Beskriv hændelsen"
                />
              </HbField>
              <HbField label="Månedligt beløb (kr.)">
                <HbInput
                  type="number"
                  value={newEventCost}
                  onChange={(e) => setNewEventCost(Number(e.target.value))}
                />
              </HbField>
              <HbField label="Fra hvilken måned?">
                <HbSelect value={newEventMonth} onChange={(e) => setNewEventMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </HbSelect>
              </HbField>
              <HbField label="Type">
                <div className="flex gap-2">
                  {[
                    { key: false, label: "Omkostning" },
                    { key: true, label: "Indtægt" },
                  ].map((opt) => (
                    <button
                      key={String(opt.key)}
                      type="button"
                      onClick={() => setNewEventIsRevenue(opt.key)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm transition-colors",
                        newEventIsRevenue === opt.key
                          ? "border-hb-evergreen bg-hb-evergreen text-white"
                          : "border-hb-line text-hb-ink-soft hover:border-hb-evergreen/50 hover:text-hb-ink",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </HbField>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <HbButton
                className="h-9 px-5 text-sm"
                disabled={!newEventLabel.trim() || newEventCost <= 0}
                onClick={() => {
                  if (!newEventLabel.trim() || newEventCost <= 0) return;
                  setEvents((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      type: newEventType,
                      label: newEventLabel.trim(),
                      monthlyCost: newEventCost,
                      startMonth: newEventMonth,
                      isRevenue: newEventIsRevenue,
                    },
                  ]);
                  setAddingEvent(false);
                  setNewEventLabel("");
                  setNewEventCost(40000);
                  setNewEventMonth(0);
                  setNewEventIsRevenue(false);
                }}
              >
                Tilføj
              </HbButton>
              <button
                type="button"
                onClick={() => setAddingEvent(false)}
                className="text-sm text-hb-ink-soft underline-offset-4 hover:underline"
              >
                Annullér
              </button>
            </div>
          </div>
        )}

        {/* Samlet effekt */}
        {events.length > 0 && (
          <div className="mt-5 border-t border-hb-line pt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              Samlet effekt på helåret
            </p>
            <div className="mt-3 grid grid-cols-2 gap-5 md:grid-cols-4">
              <TalStat
                label="Ekstra omkostninger"
                value={simulated.extraCosts > 0 ? `−${fmtNumber(simulated.extraCosts)} kr.` : "—"}
                attention={simulated.extraCosts > 0}
              />
              <TalStat
                label="Ekstra omsætning"
                value={simulated.extraRevenue > 0 ? `+${fmtNumber(simulated.extraRevenue)} kr.` : "—"}
              />
              <TalStat
                label="EBITDA"
                value={formatDKK(simulated.ebitda)}
                attention={simulated.ebitda < 0}
              />
              <TalStat
                label="Ændring vs. forecast"
                value={`${simulated.ebitdaDelta > 0 ? "+" : ""}${fmtNumber(simulated.ebitdaDelta)} kr.`}
                attention={simulated.ebitdaDelta < 0}
                sub={`${simulated.monthlyImpact >= 0 ? "+" : ""}${fmtNumber(simulated.monthlyImpact)} kr./md · margin ${simulated.margin.toFixed(1)} %`}
              />
            </div>
          </div>
        )}
      </HbCard>
    </div>
  );
};
