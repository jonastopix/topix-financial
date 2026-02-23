import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";

interface BudgetLine {
  category: string;
  budget: number;
  actual: number;
}

// Mock budget targets + "actual" from the October saldobalance extraction
const budgetData: BudgetLine[] = [
  { category: "Omsætning", budget: 70000, actual: 74731 },
  { category: "Direkte omk.", budget: 2500, actual: 1862 },
  { category: "Lønninger", budget: 35000, actual: 31966 },
  { category: "Marketing", budget: 30000, actual: 24661 },
  { category: "Lokaler", budget: 4000, actual: 3950 },
  { category: "Administration", budget: 20000, actual: 24530 },
  { category: "Afskrivninger", budget: 3000, actual: 2911 },
];

const formatDKK = (v: number) => `${(v / 1000).toFixed(0)}k`;

const tooltipStyle = {
  background: "hsl(220, 25%, 9%)",
  border: "1px solid hsl(220, 20%, 14%)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(220, 10%, 90%)",
};

function variance(budget: number, actual: number, isRevenue: boolean) {
  const diff = isRevenue ? actual - budget : budget - actual;
  const pct = budget !== 0 ? (diff / budget) * 100 : 0;
  return { diff, pct, favorable: diff >= 0 };
}

const BudgetComparison = () => {
  const totalBudgetCost = budgetData
    .filter((d) => d.category !== "Omsætning")
    .reduce((s, d) => s + d.budget, 0);
  const totalActualCost = budgetData
    .filter((d) => d.category !== "Omsætning")
    .reduce((s, d) => s + d.actual, 0);

  const revLine = budgetData.find((d) => d.category === "Omsætning")!;
  const revVar = variance(revLine.budget, revLine.actual, true);
  const costVar = variance(totalBudgetCost, totalActualCost, false);

  const budgetedResult = revLine.budget - totalBudgetCost;
  const actualResult = revLine.actual - totalActualCost;
  const resultVar = variance(
    Math.abs(budgetedResult),
    Math.abs(actualResult),
    actualResult > budgetedResult
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-1">
          Budget vs. Actual
        </h2>
        <p className="text-xs text-muted-foreground">
          Automatisk sammenligning baseret på udtrukne tal · Oktober 2025
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Omsætning"
          budget={revLine.budget}
          actual={revLine.actual}
          favorable={revVar.favorable}
          pct={revVar.pct}
        />
        <SummaryCard
          label="Samlede omkostninger"
          budget={totalBudgetCost}
          actual={totalActualCost}
          favorable={costVar.favorable}
          pct={costVar.pct}
          invertColor
        />
        <SummaryCard
          label="Resultat"
          budget={budgetedResult}
          actual={actualResult}
          favorable={actualResult >= budgetedResult}
          pct={
            budgetedResult !== 0
              ? ((actualResult - budgetedResult) / Math.abs(budgetedResult)) * 100
              : 0
          }
        />
      </div>

      {/* Bar chart comparison */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="font-display font-semibold text-foreground mb-4">
          Budget vs. Actual pr. kategori
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={budgetData}
              margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
              barGap={4}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(220, 20%, 14%)"
                vertical={false}
              />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatDKK}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [
                  `${value.toLocaleString("da-DK")} DKK`,
                  "",
                ]}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar
                dataKey="budget"
                name="Budget"
                fill="hsl(220, 10%, 30%)"
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="actual" name="Actual" radius={[4, 4, 0, 0]}>
                {budgetData.map((entry) => {
                  const isRev = entry.category === "Omsætning";
                  const fav = isRev
                    ? entry.actual >= entry.budget
                    : entry.actual <= entry.budget;
                  return (
                    <Cell
                      key={entry.category}
                      fill={
                        fav
                          ? "hsl(160, 84%, 39%)"
                          : "hsl(0, 72%, 51%)"
                      }
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed table */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="font-display font-semibold text-foreground mb-4">
          Detaljeret budgetafvigelse
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                  Kategori
                </th>
                <th className="text-right py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                  Budget
                </th>
                <th className="text-right py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                  Actual
                </th>
                <th className="text-right py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                  Afvigelse
                </th>
                <th className="text-right py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                  %
                </th>
                <th className="text-center py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {budgetData.map((row) => {
                const isRev = row.category === "Omsætning";
                const v = variance(row.budget, row.actual, isRev);
                return (
                  <tr
                    key={row.category}
                    className="hover:bg-secondary/50 transition-colors"
                  >
                    <td className="py-3 px-2 text-foreground font-medium">
                      {row.category}
                    </td>
                    <td className="py-3 px-2 text-right text-muted-foreground font-display">
                      {row.budget.toLocaleString("da-DK")}
                    </td>
                    <td className="py-3 px-2 text-right text-foreground font-display font-medium">
                      {row.actual.toLocaleString("da-DK")}
                    </td>
                    <td
                      className={`py-3 px-2 text-right font-display font-medium ${
                        v.favorable ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {v.diff > 0 ? "+" : ""}
                      {v.diff.toLocaleString("da-DK")}
                    </td>
                    <td
                      className={`py-3 px-2 text-right font-display text-xs ${
                        v.favorable ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {v.pct > 0 ? "+" : ""}
                      {v.pct.toFixed(1)}%
                    </td>
                    <td className="py-3 px-2 text-center">
                      {v.favorable ? (
                        <CheckCircle2 className="h-4 w-4 text-primary inline-block" />
                      ) : Math.abs(v.pct) > 15 ? (
                        <AlertTriangle className="h-4 w-4 text-destructive inline-block" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-chart-warning inline-block" />
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* Totals */}
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-3 px-2 text-foreground">Resultat</td>
                <td className="py-3 px-2 text-right text-muted-foreground font-display">
                  {budgetedResult.toLocaleString("da-DK")}
                </td>
                <td className="py-3 px-2 text-right text-foreground font-display">
                  {actualResult.toLocaleString("da-DK")}
                </td>
                <td
                  className={`py-3 px-2 text-right font-display ${
                    actualResult >= budgetedResult
                      ? "text-primary"
                      : "text-destructive"
                  }`}
                >
                  {actualResult - budgetedResult > 0 ? "+" : ""}
                  {(actualResult - budgetedResult).toLocaleString("da-DK")}
                </td>
                <td className="py-3 px-2 text-right font-display text-xs text-muted-foreground">
                  —
                </td>
                <td className="py-3 px-2 text-center">
                  {actualResult >= budgetedResult ? (
                    <CheckCircle2 className="h-4 w-4 text-primary inline-block" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive inline-block" />
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function SummaryCard({
  label,
  budget,
  actual,
  favorable,
  pct,
  invertColor,
}: {
  label: string;
  budget: number;
  actual: number;
  favorable: boolean;
  pct: number;
  invertColor?: boolean;
}) {
  const isGood = invertColor ? !favorable : favorable;

  return (
    <div className="glass-card rounded-xl p-5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Budget</p>
          <p className="text-sm font-display font-medium text-muted-foreground">
            {budget.toLocaleString("da-DK")} DKK
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-0.5">Actual</p>
          <p className="text-lg font-display font-bold text-foreground">
            {actual.toLocaleString("da-DK")}
          </p>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            favorable ? "bg-primary" : "bg-destructive"
          }`}
          style={{
            width: `${Math.min((actual / budget) * 100, 100)}%`,
          }}
        />
      </div>
      <div className="flex items-center gap-1">
        {favorable ? (
          <TrendingUp className="h-3 w-3 text-primary" />
        ) : (
          <TrendingDown className="h-3 w-3 text-destructive" />
        )}
        <span
          className={`text-xs font-medium ${
            favorable ? "text-primary" : "text-destructive"
          }`}
        >
          {pct > 0 ? "+" : ""}
          {pct.toFixed(1)}% afvigelse
        </span>
      </div>
    </div>
  );
}

export default BudgetComparison;
