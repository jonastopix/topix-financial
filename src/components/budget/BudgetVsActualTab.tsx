import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseReportPeriodToKey } from "@/lib/financialUtils";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/budgetTemplates";
import { BvaSummaryCard, varianceColor, varianceIcon } from "./BudgetHelpers";
import {
  MONTHS, BUDGET_TO_REPORT_KEY, REVENUE_GROUPS, formatK,
  type BudgetRow, type ScenarioKey,
} from "./types";

interface Props {
  scenarioData: Record<ScenarioKey, BudgetRow[]>;
  year: string;
  userId: string | undefined;
}

export default function BudgetVsActualTab({ scenarioData, year, userId }: Props) {
  const { data: reports } = useQuery({
    queryKey: ["financial-reports-actuals", userId, year],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_reports")
        .select("report_period, extracted_data")
        .eq("user_id", userId!)
        .eq("status", "processed");
      return data || [];
    },
  });

  const actualsMap = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    if (!reports) return map;

    for (const report of reports) {
      const periodKey = parseReportPeriodToKey(report.report_period);
      if (!periodKey) continue;
      const [reportYear, monthStr] = periodKey.split("-");
      if (reportYear !== year) continue;
      const monthIdx = parseInt(monthStr, 10) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;

      const ed = report.extracted_data as Record<string, any> | null;
      const kf = ed?.key_figures as Record<string, number> | null;
      if (!kf) continue;

      if (!map[monthIdx]) map[monthIdx] = {};
      for (const [budgetKey, reportKey] of Object.entries(BUDGET_TO_REPORT_KEY)) {
        if (kf[reportKey] != null) {
          map[monthIdx][budgetKey] = Math.abs(kf[reportKey]);
        }
      }
    }
    return map;
  }, [reports, year]);

  const baseRows = scenarioData.base;
  const hasAnyActuals = Object.keys(actualsMap).length > 0;

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
    const rev = revenueRows.reduce((s, r) => s + (actualsMap[i]?.[r.key] ?? 0), 0);
    const cost = costRows.reduce((s, r) => s + (actualsMap[i]?.[r.key] ?? 0), 0);
    return rev - cost;
  });

  const totalBudgetRevenue = revenueRows.reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0);
  const totalBudgetCosts = costRows.reduce((s, r) => s + Math.abs(r.values.reduce((a, b) => a + b, 0)), 0);
  const totalBudgetEbitda = totalBudgetRevenue - totalBudgetCosts;

  const totalActualRevenue = MONTHS.reduce((s, _, i) => s + revenueRows.reduce((rs, r) => rs + (actualsMap[i]?.[r.key] ?? 0), 0), 0);
  const totalActualCosts = MONTHS.reduce((s, _, i) => s + costRows.reduce((rs, r) => rs + (actualsMap[i]?.[r.key] ?? 0), 0), 0);
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
                    return (
                      <tr key={row.key} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                        <td className="py-2 px-3 text-foreground font-medium text-xs sticky left-0 bg-card z-10">
                          <div className="flex items-center gap-1.5">
                            {RowIcon && <RowIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                            <span>{row.label}</span>
                          </div>
                        </td>
                        {row.values.map((budgetVal, i) => {
                          const actualVal = actualsMap[i]?.[row.key] ?? null;
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
