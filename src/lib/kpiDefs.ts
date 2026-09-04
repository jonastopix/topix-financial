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
import { momErGyldig, type DataBasis } from "@/lib/dataGrundlag";
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
  /** "—" når changePct er null — aldrig et opdigtet "+0.0%".
      Beløb: "+10.0%" (relativ). Procent-KPI'er: "+15.6 pp" (procentpoint). */
  change: string;
  /** M/M-tallet bag `change`. For beløb (unit "DKK") den relative ændring i
      procent; for procent-KPI'er (unit "%") ændringen i PROCENTPOINT — se
      `changeArt`. null når M/M-grundlaget er ugyldigt (momErGyldig falsk:
      under to perioder, eller en af de to seneste er et estimat), når prev
      mangler, eller — kun for beløb — når prev er 0 (division). Kalderen kan
      skelne "ingen dom" fra tallet 0. */
  changePct: number | null;
  /** Hvad changePct ER: relativ ændring (beløb) eller procentpoint (marginer). */
  changeArt: "relativ" | "procentpoint";
  trend: "up" | "down" | "neutral";
  unit: string;
  icon: LucideIcon;
  description: string;
  lowerIsBetter: boolean;
  history: { month: string; periodKey: string; value: number; data_basis: DataBasis }[];
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
 * data_basis-kontrakten (docs/data-basis-kontrakt.md): beregninger udelukker
 * estimater — M/M-ændringen (change/changePct/trend) beregnes KUN når de to
 * seneste perioder begge er målinger (momErGyldig); ellers er changePct null,
 * change "—" og trend "neutral". Et tal udledt af et estimat og præsenteret
 * som en måling er en påstand systemet ikke kan indfri. history-punkterne
 * bærer data_basis videre, så visningslaget kan sige det (visnings-PR).
 *
 * M/M I TO FORMER (rettet 4/9-2026, målt samme dag på virksomhedssiden):
 * indtil da brugte alle seks nøgler den relative formel
 *   relativ  = (nu − før) / |før| × 100
 * — også marginerne, hvor nu og før SELV er procenttal. Det gav «RESULTAT
 * MARGIN 35,4 % · +7996,4 % M/M» (forrige ≈ 0,44 %) og «DB MARGIN 45,7 % ·
 * +51,8 % M/M» (forrige ≈ 30,1 %). Nu:
 *   unit "DKK" (beløb)   → relativ, som før:      100.000 → 110.000 = +10.0%
 *   unit "%"   (margin)  → procentpoint = nu − før: 30,1 % → 45,7 %  = +15.6 pp
 * Samme eksempel i begge former: 30,1 → 45,7 er +51,8 % relativt, men
 * +15,6 procentpoint. Marginer vises i procentpoint. Selve margin-FORMLEN
 * (gross_profit/revenue, ebt/revenue) er rigtig og urørt. pctChange
 * (financialUtils) og motorens pctAendring regner på BELØB og er også urørt.
 * trendIsGood dømmer på fortegnet af changePct i begge former, så en
 * stigende margin er stadig god (og en faldende lønandel ville være god
 * med lowerIsBetter) — fortegnet er det samme uanset form.
 *
 * ÅBENT PUNKT (4/9, ikke rettet her): «mål 60 %» for db_margin er
 * KPI_FALLBACK_TARGETS (appConfig.ts), ikke et mål nogen har sat. Ét fælles
 * fallback-mål dømmer en engrosvirksomhed med 45,7 % som «under» og lader en
 * konsulentvirksomhed med 96,9 % «ramme» — ingen af dommene siger noget om
 * branchen. Et branchespecifikt eller fraværende fallback-mål er en
 * beslutning, ikke en rettelse.
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
    return { sortKey: f.period_key, month: monthLabel, kf, data_basis: f.data_basis };
  });

  if (monthlyData.length === 0) return [];
  const latest = monthlyData[monthlyData.length - 1].kf;
  const prev = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].kf : null;
  // M/M-gaten: begge de to seneste perioder skal være målinger.
  const momGyldig = momErGyldig(facts);

  return KPI_DEFS.map((def) => {
    const extract = VALUE_EXTRACTORS[def.key];
    const currentVal = extract(latest);
    if (currentVal == null) return null;
    const prevVal = prev ? extract(prev) : null;
    // Procent-KPI'er (marginer) i procentpoint: nu − før. Ingen division, så
    // før = 0 er et gyldigt grundlag (0 % → 12 % er +12 pp). Beløb relativt
    // med |før| som nævner; før = 0 kan ikke dømmes.
    const erProcent = def.unit === "%";
    const changeArt: KpiMetric["changeArt"] = erProcent ? "procentpoint" : "relativ";
    const changePct = !momGyldig || prevVal == null
      ? null
      : erProcent
        ? currentVal - prevVal
        : prevVal !== 0
          ? ((currentVal - prevVal) / Math.abs(prevVal)) * 100
          : null;
    const trendIsGood = changePct != null && (def.lowerIsBetter ? changePct <= 0 : changePct >= 0);
    const target = targets[def.key] ?? { value: 0, label: "—" };

    const history = monthlyData.map((d) => ({
      month: d.month,
      periodKey: d.sortKey,
      value: Math.round(extract(d.kf) ?? 0),
      data_basis: d.data_basis,
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
      change: changePct == null
        ? "—"
        : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}${erProcent ? " pp" : "%"}`,
      changePct,
      changeArt,
      trend: changePct == null ? "neutral" : trendIsGood ? "up" : "down",
      unit: def.unit,
      icon: def.icon,
      description: def.description,
      lowerIsBetter: def.lowerIsBetter,
      history,
      benchmark,
    };
  }).filter(Boolean) as KpiMetric[];
}
