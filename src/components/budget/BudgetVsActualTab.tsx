import { useMemo } from "react";
import { BarChart3, CheckCircle2, AlertTriangle } from "lucide-react";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/budgetTemplates";
import { BvaSummaryCard, varianceColor, varianceIcon } from "./BudgetHelpers";
import {
  MONTHS, REVENUE_GROUPS, formatK,
  type BudgetRow, type ScenarioKey,
} from "./types";

const REPORT_FIELD_TO_BUDGET_KEYS: Record<string, string[]> = {
  omsaetning: ["omsaetning"],
  direkte_omkostninger: ["vareforbrug", "direkte_omk", "fragt_levering",
    "betalingsgebyrer", "produktions_omk", "lager_logistik"],
  loenninger: ["loenninger", "personale", "konsulenter_freelance",
    "rekruttering", "personale_udvikling"],
  salgsomkostninger: ["marketing", "digital_marketing", "seo_content",
    "email_marketing", "salg_kundepleje", "reklame"],
  lokaleomkostninger: ["lokaler", "leje_lokaler", "forsikring_abonnementer",
    "el_vand_varme"],
  administrationsomkostninger: ["admin", "admin_regnskab", "tech_software",
    "platform_tech", "it_udstyr", "forsikring", "revision_jura",
    "kontorhold", "andet"],
};

function getBudgetRowReportField(key: string): string | null {
  for (const [field, keys] of Object.entries(REPORT_FIELD_TO_BUDGET_KEYS)) {
    if (keys.includes(key)) return field;
  }
  return null;
}

interface Props {
  scenarioData: Record<ScenarioKey, BudgetRow[]>;
  year: string;
  companyId: string | undefined;
}

export default function BudgetVsActualTab({ scenarioData, year, companyId }: Props) {
  const { data: facts = [] } = useCompanyFacts(companyId);

  const actualsMap = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};

    for (const fact of facts) {
      const [factYear, monthStr] = fact.period_key.split("-");
      if (factYear !== year) continue;
      const monthIdx = parseInt(monthStr, 10) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;

      const kf = factsToDanishMetrics(fact.metrics);
      if (!map[monthIdx]) map[monthIdx] = {};

      if (kf.omsaetning != null) map[monthIdx]["omsaetning"] = Math.abs(kf.omsaetning);
      if (kf.direkte_omkostninger != null) map[monthIdx]["direkte_omkostninger"] = Math.abs(kf.direkte_omkostninger);
      if (kf.loenninger != null) map[monthIdx]["loenninger"] = Math.abs(kf.loenninger);
      if (kf.salgsomkostninger != null) map[monthIdx]["salgsomkostninger"] = Math.abs(kf.salgsomkostninger);
      if (kf.lokaleomkostninger != null) map[monthIdx]["lokaleomkostninger"] = Math.abs(kf.lokaleomkostninger);
      if (kf.administrationsomkostninger != null) map[monthIdx]["administrationsomkostninger"] = Math.abs(kf.administrationsomkostninger);
    }
    return map;
  }, [facts, year]);

  const baseRows = scenarioData.base;
  const hasAnyActuals = Object.keys(actualsMap).length > 0;

  const sharedFieldRows = useMemo(() => {
    const fieldCount: Record<string, number> = {};
    for (const row of baseRows) {
      const field = getBudgetRowReportField(row.key);
      if (field) fieldCount[field] = (fieldCount[field] || 0) + 1;
    }
    return new Set(
      baseRows
        .filter(r => {
          const f = getBudgetRowReportField(r.key);
          return f && fieldCount[f]! > 1;
        })
        .map(r => r.key)
    );
  }, [baseRows]);

  const groupedRows = GROUP_ORDER
    .map(g => ({ group: g, label: GROUP_LABELS[g], rows: baseRows.filter(r => r.group === g) }))
    .filter(g => g.rows.length > 0);

  const revenueRows = baseRows.filter(r => r.group === "indtaegter");
  const costRows = baseRows.filter(r => r.group !== "indtaegter");

  const budgetEbitda = MONTHS.map((_, i) => {
    const rev = revenueRows.reduce((s, r) => s + r.values[i], 0);
    const cost = costRows.reduce((s, r) => s + Math.abs(r.values[i]), 0);
    return rev - cost;
  });

  const actualEbitda = MONTHS.map((_, i) => {
    if (!actualsMap[i]) return null;
    const rev = actualsMap[i]["omsaetning"] ?? 0;
    const costs = (actualsMap[i]["direkte_omkostninger"] ?? 0)
      + (actualsMap[i]["loenninger"] ?? 0)
      + (actualsMap[i]["salgsomkostninger"] ?? 0)
      + (actualsMap[i]["lokaleomkostninger"] ?? 0)
      + (actualsMap[i]["administrationsomkostninger"] ?? 0);
    return rev - costs;
  });

  const totalBudgetRevenue = revenueRows.reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0);
  const totalBudgetCosts = costRows.reduce((s, r) => s + Math.abs(r.values.reduce((a, b) => a + b, 0)), 0);
  const totalBudgetEbitda = totalBudgetRevenue - totalBudgetCosts;

  const totalActualRevenue = MONTHS.reduce((s, _, i) =>
    s + (actualsMap[i]?.["omsaetning"] ?? 0), 0
  );
  const totalActualCosts = MONTHS.reduce((s, _, i) =>
    s + (actualsMap[i]?.["direkte_omkostninger"] ?? 0)
    + (actualsMap[i]?.["loenninger"] ?? 0)
    + (actualsMap[i]?.["salgsomkostninger"] ?? 0)
    + (actualsMap[i]?.["lokaleomkostninger"] ?? 0)
    + (actualsMap[i]?.["administrationsomkostninger"] ?? 0), 0
  );
  const totalActualEbitda = totalActualRevenue - totalActualCosts;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Budget vs. Realiseret · {year}
        </h2>
        {!hasAnyActuals && (
          <span className="text-xs text-muted-foreground">Ingen rapporter for {year} endnu</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BvaSummaryCard label="Omsætning" budget={totalBudgetRevenue} actual={hasAnyActuals ? totalActualRevenue : null} isRevenue />
        <BvaSummaryCard label="Omkostninger" budget={totalBudgetCosts} actual={hasAnyActuals ? totalActualCosts : null} isRevenue={false} />
        <BvaSummaryCard label="EBITDA" budget={totalBudgetEbitda} actual={hasAnyActuals ? totalActualEbitda : null} isRevenue />
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider sticky left-0 bg-secondary/30 min-w-[180px] z-10">Kategori</th>
                {MONTHS.map(m => (
                  <th key={m} className="text-right py-2.5 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider min-w-[75px]">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map(group => (
                <>
                  <tr key={`bva-group-${group.group}`} className="bg-muted/30">
                    <td colSpan={13} className="py-2 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider sticky left-0 bg-muted/30 z-10">
                      {group.label}
                    </td>
                  </tr>
                  {group.rows.map(row => {
                    const isRevenue = REVENUE_GROUPS.has(row.group);
                    const RowIcon = row.icon;
                    const reportField = getBudgetRowReportField(row.key);
                    return (
                      <tr key={row.key} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                        <td className="py-2 px-3 text-foreground font-medium text-xs sticky left-0 bg-card z-10">
                          <div className="flex items-center gap-1.5">
                            {RowIcon && <RowIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                            <span>{row.label}</span>
                            {sharedFieldRows.has(row.key) && (
                              <span className="ml-1 text-[9px] text-muted-foreground/60">
                                (delt felt)
                              </span>
                            )}
                          </div>
                        </td>
                        {row.values.map((budgetVal, i) => {
                          const actualVal = reportField && actualsMap[i]
                            ? (actualsMap[i][reportField] ?? null)
                            : null;
                          const color = varianceColor(budgetVal, actualVal, isRevenue);
                          return (
                            <td key={i} className="py-1.5 px-2 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-xs font-display text-muted-foreground">{budgetVal === 0 ? "—" : formatK(budgetVal)}</span>
                                <span className={`text-xs font-display font-semibold ${actualVal != null ? color : "text-muted-foreground/50"}`}>
                                  {actualVal != null ? formatK(actualVal) : "--"}
                                </span>
                                {actualVal != null && budgetVal !== 0 && (
                                  <span className={`text-[10px] ${color} flex items-center gap-0.5`}>
                                    {varianceIcon(budgetVal, actualVal, isRevenue)}
                                    {(() => {
                                      const diff = isRevenue ? actualVal - budgetVal : budgetVal - actualVal;
                                      const pct = (diff / Math.abs(budgetVal)) * 100;
                                      return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
                                    })()}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </>
              ))}
              <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                <td className="py-2.5 px-3 text-foreground font-bold text-xs sticky left-0 bg-secondary/20 z-10">EBITDA</td>
                {budgetEbitda.map((bVal, i) => {
                  const aVal = actualEbitda[i];
                  const color = varianceColor(bVal, aVal, true);
                  return (
                    <td key={i} className="py-1.5 px-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-xs font-display font-bold ${bVal >= 0 ? "text-primary" : "text-destructive"}`}>{formatK(bVal)}</span>
                        <span className={`text-xs font-display font-bold ${aVal != null ? color : "text-muted-foreground/50"}`}>
                          {aVal != null ? formatK(aVal) : "--"}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border/30 flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" /> Budget</span>
          <span className="flex items-center gap-1"><span className="font-bold text-foreground">Fed</span> Realiseret</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /> Favorable</span>
          <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-chart-warning" /> {'<10% afvigelse'}</span>
          <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-destructive" /> {'>10% afvigelse'}</span>
        </div>
      </div>
    </div>
  );
}
