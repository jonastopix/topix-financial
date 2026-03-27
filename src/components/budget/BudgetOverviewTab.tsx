import { TrendingUp, TrendingDown, DollarSign, Calculator } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
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

  const filledMonths = MONTHS.filter((_, i) =>
    revenueRows.some(r => r.values[i] > 0)
  ).length;
  const isEmpty = totalOmsaetning === 0;
  const isComplete = filledMonths >= 10;
  const isPartial = !isEmpty && !isComplete;

  return (
    <div className="space-y-6">
      {isEmpty && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Budget er ikke udfyldt
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
              Gå til Scenarier-fanen for at indtaste dine månedlige tal, eller importér et Excel-budget under Importér.
            </p>
          </div>
        </div>
      )}
      {isPartial && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Budget er delvist udfyldt — {filledMonths}/12 måneder
            </p>
            <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mt-0.5">
              Udfyld de resterende måneder for at få præcise sammenligninger med dine rapporter.
            </p>
          </div>
        </div>
      )}

      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-foreground">Budget {year}</h2>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              isComplete
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : isPartial
                ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            }`}>
              {isComplete ? "Komplet" : isPartial ? `${filledMonths}/12 måneder` : "Ikke udfyldt"}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryKPI icon={TrendingUp} label="Total omsætning" value={`${(totalOmsaetning / 1000).toFixed(0)}k kr.`} />
          <SummaryKPI icon={TrendingDown} label="Samlede omkostninger" value={`${(totalCosts / 1000).toFixed(0)}k kr.`} />
          <SummaryKPI icon={DollarSign} label="EBITDA" value={`${(totalEbitda / 1000).toFixed(0)}k kr.`} valueColor={totalEbitda >= 0 ? "text-primary" : "text-destructive"} />
          <SummaryKPI icon={Calculator} label="EBITDA-margin" value={totalOmsaetning > 0 ? `${((totalEbitda / totalOmsaetning) * 100).toFixed(1)}%` : "—"} valueColor={totalEbitda >= 0 ? "text-primary" : "text-destructive"} />
        </div>
      </div>

      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-foreground">
            Månedlig overblik
          </h3>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-primary/60" />
              Omsætning
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
              EBITDA positiv
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-destructive" />
              EBITDA negativ
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barGap={4} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#888" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#888" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
              width={45}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${Math.round(value / 1000)}k kr.`,
                name === "omsaetning" ? "Omsætning" : "EBITDA",
              ]}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <ReferenceLine y={0} stroke="rgba(128,128,128,0.3)" />
            <Bar dataKey="omsaetning" fill="hsl(var(--primary))" opacity={0.4} radius={[3, 3, 0, 0]} />
            <Bar dataKey="ebitda" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.ebitda >= 0 ? "#22c55e" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
