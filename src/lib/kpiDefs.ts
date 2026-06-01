/**
 * kpiDefs — pure, React-free KPI definitions and derivation.
 *
 * Extracted verbatim from src/pages/KPIs.tsx (Bid 3a) so the KPI page and the
 * advisor-mobile "Se tal"-drawer share one source of truth. No hooks, no state,
 * no side effects. deriveKpiMetrics() is pure: same input → same output.
 *
 * Targets and benchmarks are passed in already-resolved (fallback applied by the
 * caller — useKpiTargets for targets, getBenchmark for benchmarks).
 */
import { DollarSign, TrendingUp, Users, Target, Flame, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { calcDbMargin, calcResultMargin, calcTotalExpenses, SHORT_MONTHS } from "@/lib/financialUtils";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import type { CompanyFact } from "@/hooks/useCompanyFacts";

export interface KpiDef {
  key: string;
  label: string;
  unit: string;
  icon: LucideIcon;
  description?: string;
  lowerIsBetter: boolean;
}

export interface KpiMetric {
  key: string;
  label: string;
  value: string;
  numValue: number;
  target: string;
  targetNum: number;
  change: string;
  changePct: number;
  trend: "up" | "down";
  unit: string;
  icon: LucideIcon;
  description: string;
  lowerIsBetter: boolean;
  history: { month: string; periodKey: string; value: number }[];
  benchmark: { value: number; label: string; source: string };
}

export const KPI_DEFS: KpiDef[] = [
  { key: "omsaetning", label: "Omsætning", unit: "DKK", icon: DollarSign, description: "Månedlig omsætning", lowerIsBetter: false },
  { key: "db_margin", label: "DB Margin", unit: "%", icon: TrendingUp, description: "Dækningsgrad (Omsætning − direkte omk.)", lowerIsBetter: false },
  { key: "loenninger", label: "Lønninger", unit: "DKK", icon: Users, description: "Månedlige lønomkostninger", lowerIsBetter: true },
  { key: "resultat", label: "Resultat", unit: "DKK", icon: Target, description: "Resultat før skat", lowerIsBetter: false },
  { key: "omkostninger", label: "Omk. total", unit: "DKK", icon: Flame, description: "Samlede omkostninger", lowerIsBetter: true },
  { key: "ebitda_margin", label: "Resultat Margin", unit: "%", icon: BarChart3, description: "Resultat før skat i % af omsætning", lowerIsBetter: false },
];

export const VALUE_EXTRACTORS: Record<string, (kf: Record<string, number>) => number | null> = {
  omsaetning: (kf) => kf.omsaetning ?? null,
  db_margin: (kf) => calcDbMargin(kf) ?? null,
  loenninger: (kf) => kf.loenninger != null ? Math.abs(kf.loenninger) : null,
  resultat: (kf) => kf.resultat_foer_skat ?? null,
  omkostninger: (kf) => { const v = calcTotalExpenses(kf); return v > 0 ? v : null; },
  ebitda_margin: (kf) => calcResultMargin(kf) ?? null,
};

/** Whether a metric meets its target, and progress toward it (0–100). Pure. */
export function getTargetStatus(metric: KpiMetric): { hit: boolean; pct: number } {
  if (!metric.targetNum) return { hit: false, pct: 0 };
  const hit = metric.lowerIsBetter
    ? metric.numValue <= metric.targetNum
    : metric.numValue >= metric.targetNum;
  const pct = metric.lowerIsBetter
    ? Math.min((metric.targetNum / Math.max(metric.numValue, 1)) * 100, 100)
    : Math.min((metric.numValue / metric.targetNum) * 100, 100);
  return { hit, pct };
}

/**
 * Derive the KPI metric array from committed facts. Pure — mirrors the
 * monthlyData + kpiMetrics useMemos previously inlined in KPIs.tsx.
 *
 * @param facts      committed facts, pre-sorted ascending by period_key
 * @param targets    per-key resolved target (DB value or fallback already applied)
 * @param benchmarks per-key resolved benchmark (DB value or fallback already applied)
 */
export function deriveKpiMetrics(
  facts: CompanyFact[],
  targets: Record<string, { value: number; label: string }>,
  benchmarks: Record<string, { value: number; label: string; source: string }>,
): KpiMetric[] {
  const monthlyData = facts.map((f) => {
    const kf = factsToDanishMetrics(f.metrics);
    const [, monthStr] = f.period_key.split("-");
    const monthIdx = parseInt(monthStr, 10) - 1;
    const monthLabel = SHORT_MONTHS[monthIdx] || monthStr;
    return { sortKey: f.period_key, month: monthLabel, kf };
  });

  if (monthlyData.length === 0) return [];
  const latest = monthlyData[monthlyData.length - 1].kf;
  const prev = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].kf : null;

  return KPI_DEFS.map((def) => {
    const extract = VALUE_EXTRACTORS[def.key];
    const currentVal = extract(latest);
    if (currentVal == null) return null;
    const prevVal = prev ? extract(prev) : null;
    const changePct = prevVal != null && currentVal != null && prevVal !== 0
      ? ((currentVal - prevVal) / Math.abs(prevVal)) * 100 : 0;
    const trendIsGood = def.lowerIsBetter ? changePct <= 0 : changePct >= 0;
    const target = targets[def.key] ?? { value: 0, label: "—" };

    const history = monthlyData.map((d) => ({
      month: d.month,
      periodKey: d.sortKey,
      value: Math.round(extract(d.kf) ?? 0),
    }));

    const formatted = Math.abs(currentVal) >= 1000
      ? currentVal.toLocaleString("da-DK", { maximumFractionDigits: 0 })
      : currentVal.toFixed(1);

    const benchmark = benchmarks[def.key] ?? { value: 0, label: "—", source: "" };

    return {
      key: def.key,
      label: def.label,
      value: formatted,
      numValue: currentVal,
      target: target.label,
      targetNum: target.value,
      change: `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`,
      changePct,
      trend: trendIsGood ? "up" : "down",
      unit: def.unit,
      icon: def.icon,
      description: def.description,
      lowerIsBetter: def.lowerIsBetter,
      history,
      benchmark,
    };
  }).filter(Boolean) as KpiMetric[];
}
