import { TrendingUp, TrendingDown, DollarSign, Calculator } from "lucide-react";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/budgetTemplates";
import { SummaryKPI, CostGroupCard } from "./BudgetHelpers";
import type { BudgetRow } from "./types";
import { MONTHS } from "./types";

interface Props {
  rows: BudgetRow[];
  year: string;
}

export default function BudgetOverviewTab({ rows, year }: Props) {
  const revenueRows = rows.filter(r => r.group === "indtaegter");
  const costRows = rows.filter(r => r.group !== "indtaegter");

  const ebitda = MONTHS.map((_, i) => {
    const revenue = revenueRows.reduce((sum, row) => sum + row.values[i], 0);
    const costs = costRows.reduce((sum, row) => sum + row.values[i], 0);
    return revenue - Math.abs(costs);
  });

  const totalOmsaetning = revenueRows.reduce((sum, row) => sum + row.values.reduce((s, v) => s + v, 0), 0);
  const totalCosts = costRows.reduce((sum, row) => sum + Math.abs(row.values.reduce((s, v) => s + v, 0)), 0);
  const totalEbitda = ebitda.reduce((s, v) => s + v, 0);

  const costByGroup = GROUP_ORDER.filter(g => g !== "indtaegter").map(g => {
    const groupRows = rows.filter(r => r.group === g);
    const total = groupRows.reduce((sum, row) => sum + Math.abs(row.values.reduce((s, v) => s + v, 0)), 0);
    return { group: g, label: GROUP_LABELS[g], total, count: groupRows.length };
  }).filter(g => g.total > 0 || g.count > 0);

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-foreground">Budget {year}</h2>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Konsolideret overblik</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryKPI icon={TrendingUp} label="Total omsætning" value={`${(totalOmsaetning / 1000).toFixed(0)}k kr.`} />
          <SummaryKPI icon={TrendingDown} label="Samlede omkostninger" value={`${(totalCosts / 1000).toFixed(0)}k kr.`} />
          <SummaryKPI icon={DollarSign} label="EBITDA" value={`${(totalEbitda / 1000).toFixed(0)}k kr.`} valueColor={totalEbitda >= 0 ? "text-primary" : "text-destructive"} />
          <SummaryKPI icon={Calculator} label="EBITDA-margin" value={totalOmsaetning > 0 ? `${((totalEbitda / totalOmsaetning) * 100).toFixed(1)}%` : "—"} valueColor={totalEbitda >= 0 ? "text-primary" : "text-destructive"} />
        </div>
      </div>

      <div className="glass-card rounded-xl p-6">
        <h3 className="font-display font-semibold text-foreground mb-4">Omkostninger fordelt på grupper</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {costByGroup.map(g => (
            <CostGroupCard key={g.group} label={g.label} amount={g.total} count={g.count} />
          ))}
        </div>
      </div>
    </div>
  );
}
