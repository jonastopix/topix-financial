import { useState, useEffect, useCallback } from "react";
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
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, Pencil, Save, X, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BudgetLine {
  category: string;
  budget: number;
  actual: number;
}

const PERIODS = [
  "Februar 2026",
  "Januar 2026",
  "December 2025",
  "November 2025",
  "Oktober 2025",
  "September 2025",
  "August 2025",
];

// Mock actual data per period
const actualDataByPeriod: Record<string, Record<string, number>> = {
  "Februar 2026": { "Omsætning": 82400, "Direkte omk.": 2100, "Lønninger": 34500, "Marketing": 28200, "Lokaler": 4100, "Administration": 22100, "Afskrivninger": 2950 },
  "Januar 2026": { "Omsætning": 79800, "Direkte omk.": 2050, "Lønninger": 33800, "Marketing": 26500, "Lokaler": 4050, "Administration": 21800, "Afskrivninger": 2930 },
  "December 2025": { "Omsætning": 77200, "Direkte omk.": 1950, "Lønninger": 33200, "Marketing": 25800, "Lokaler": 4000, "Administration": 23100, "Afskrivninger": 2920 },
  "November 2025": { "Omsætning": 76100, "Direkte omk.": 1900, "Lønninger": 32500, "Marketing": 25200, "Lokaler": 3980, "Administration": 24000, "Afskrivninger": 2915 },
  "Oktober 2025": { "Omsætning": 74731, "Direkte omk.": 1862, "Lønninger": 31966, "Marketing": 24661, "Lokaler": 3950, "Administration": 24530, "Afskrivninger": 2911 },
  "September 2025": { "Omsætning": 71500, "Direkte omk.": 1800, "Lønninger": 31200, "Marketing": 23500, "Lokaler": 3900, "Administration": 23800, "Afskrivninger": 2900 },
  "August 2025": { "Omsætning": 68900, "Direkte omk.": 1750, "Lønninger": 30500, "Marketing": 22800, "Lokaler": 3850, "Administration": 23200, "Afskrivninger": 2890 },
};

const defaultBudgets: Record<string, number> = {
  "Omsætning": 70000,
  "Direkte omk.": 2500,
  "Lønninger": 35000,
  "Marketing": 30000,
  "Lokaler": 4000,
  "Administration": 20000,
  "Afskrivninger": 3000,
};

const CATEGORIES = Object.keys(defaultBudgets);

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

function buildBudgetData(period: string, savedBudgets?: Map<string, number>): BudgetLine[] {
  const actuals = actualDataByPeriod[period] || actualDataByPeriod["Oktober 2025"];
  return CATEGORIES.map((cat) => ({
    category: cat,
    budget: savedBudgets?.get(cat) ?? defaultBudgets[cat],
    actual: actuals[cat] ?? 0,
  }));
}

const BudgetComparison = () => {
  const [selectedPeriod, setSelectedPeriod] = useState(PERIODS[0]);
  const [budgetData, setBudgetData] = useState<BudgetLine[]>(() => buildBudgetData(PERIODS[0]));
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Load user on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Load saved budgets when period or user changes
  useEffect(() => {
    const load = async () => {
      if (!userId) {
        setBudgetData(buildBudgetData(selectedPeriod));
        return;
      }

      const { data } = await supabase
        .from("budget_targets")
        .select("category, budget_amount")
        .eq("user_id", userId)
        .eq("period", selectedPeriod);

      const savedMap = data && data.length > 0
        ? new Map(data.map((d) => [d.category, Number(d.budget_amount)]))
        : undefined;

      setBudgetData(buildBudgetData(selectedPeriod, savedMap));
    };
    load();
  }, [selectedPeriod, userId]);

  const handlePeriodChange = (period: string) => {
    if (editing) {
      setEditing(false);
      setEditValues({});
    }
    setSelectedPeriod(period);
  };

  const startEditing = useCallback(() => {
    const values: Record<string, string> = {};
    budgetData.forEach((line) => {
      values[line.category] = String(line.budget);
    });
    setEditValues(values);
    setEditing(true);
  }, [budgetData]);

  const cancelEditing = () => {
    setEditing(false);
    setEditValues({});
  };

  const saveBudgets = async () => {
    const updated = budgetData.map((line) => ({
      ...line,
      budget: Number(editValues[line.category]) || line.budget,
    }));
    setBudgetData(updated);
    setEditing(false);

    if (!userId) {
      toast.info("Log ind for at gemme budgetmål permanent");
      return;
    }

    setSaving(true);
    try {
      const rows = updated.map((line) => ({
        user_id: userId,
        category: line.category,
        budget_amount: line.budget,
        period: selectedPeriod,
      }));

      const { error } = await supabase
        .from("budget_targets")
        .upsert(rows, { onConflict: "user_id,category,period" });

      if (error) throw error;
      toast.success(`Budgetmål for ${selectedPeriod} gemt`);
    } catch (e: any) {
      toast.error("Kunne ikke gemme: " + e.message);
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with period selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-lg font-display font-semibold text-foreground mb-1">
              Budget vs. Actual
            </h2>
            <p className="text-xs text-muted-foreground">
              Sammenligning baseret på udtrukne tal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[180px] h-9 text-xs bg-secondary border-border">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              {PERIODS.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!editing ? (
            <button
              onClick={startEditing}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Rediger
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEditing}
                className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={saveBudgets}
                disabled={saving}
                className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "..." : "Gem"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Omsætning" budget={revLine.budget} actual={revLine.actual} favorable={revVar.favorable} pct={revVar.pct} />
        <SummaryCard label="Samlede omkostninger" budget={totalBudgetCost} actual={totalActualCost} favorable={costVar.favorable} pct={costVar.pct} invertColor />
        <SummaryCard
          label="Resultat"
          budget={budgetedResult}
          actual={actualResult}
          favorable={actualResult >= budgetedResult}
          pct={budgetedResult !== 0 ? ((actualResult - budgetedResult) / Math.abs(budgetedResult)) * 100 : 0}
        />
      </div>

      {/* Bar chart */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="font-display font-semibold text-foreground mb-4">
          Budget vs. Actual pr. kategori · {selectedPeriod}
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={budgetData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 14%)" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} tickFormatter={formatDKK} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value.toLocaleString("da-DK")} DKK`, ""]} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="budget" name="Budget" fill="hsl(220, 10%, 30%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" radius={[4, 4, 0, 0]}>
                {budgetData.map((entry) => {
                  const isRev = entry.category === "Omsætning";
                  const fav = isRev ? entry.actual >= entry.budget : entry.actual <= entry.budget;
                  return <Cell key={entry.category} fill={fav ? "hsl(160, 84%, 39%)" : "hsl(0, 72%, 51%)"} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed table */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="font-display font-semibold text-foreground mb-4">
          Detaljeret budgetafvigelse · {selectedPeriod}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Kategori</th>
                <th className="text-right py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Budget</th>
                <th className="text-right py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Actual</th>
                <th className="text-right py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Afvigelse</th>
                <th className="text-right py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">%</th>
                <th className="text-center py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {budgetData.map((row) => {
                const isRev = row.category === "Omsætning";
                const v = variance(row.budget, row.actual, isRev);
                return (
                  <tr key={row.category} className="hover:bg-secondary/50 transition-colors">
                    <td className="py-3 px-2 text-foreground font-medium">{row.category}</td>
                    <td className="py-3 px-2 text-right text-muted-foreground font-display">
                      {editing ? (
                        <input
                          type="number"
                          value={editValues[row.category] || ""}
                          onChange={(e) => setEditValues((prev) => ({ ...prev, [row.category]: e.target.value }))}
                          className="w-24 ml-auto text-right bg-secondary border border-border rounded px-2 py-1 text-foreground text-sm font-display focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      ) : (
                        row.budget.toLocaleString("da-DK")
                      )}
                    </td>
                    <td className="py-3 px-2 text-right text-foreground font-display font-medium">{row.actual.toLocaleString("da-DK")}</td>
                    <td className={`py-3 px-2 text-right font-display font-medium ${v.favorable ? "text-primary" : "text-destructive"}`}>
                      {v.diff > 0 ? "+" : ""}{v.diff.toLocaleString("da-DK")}
                    </td>
                    <td className={`py-3 px-2 text-right font-display text-xs ${v.favorable ? "text-primary" : "text-destructive"}`}>
                      {v.pct > 0 ? "+" : ""}{v.pct.toFixed(1)}%
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
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-3 px-2 text-foreground">Resultat</td>
                <td className="py-3 px-2 text-right text-muted-foreground font-display">{budgetedResult.toLocaleString("da-DK")}</td>
                <td className="py-3 px-2 text-right text-foreground font-display">{actualResult.toLocaleString("da-DK")}</td>
                <td className={`py-3 px-2 text-right font-display ${actualResult >= budgetedResult ? "text-primary" : "text-destructive"}`}>
                  {actualResult - budgetedResult > 0 ? "+" : ""}{(actualResult - budgetedResult).toLocaleString("da-DK")}
                </td>
                <td className="py-3 px-2 text-right font-display text-xs text-muted-foreground">—</td>
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

function SummaryCard({ label, budget, actual, favorable, pct, invertColor }: {
  label: string; budget: number; actual: number; favorable: boolean; pct: number; invertColor?: boolean;
}) {
  return (
    <div className="glass-card rounded-xl p-5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Budget</p>
          <p className="text-sm font-display font-medium text-muted-foreground">{budget.toLocaleString("da-DK")} DKK</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-0.5">Actual</p>
          <p className="text-lg font-display font-bold text-foreground">{actual.toLocaleString("da-DK")}</p>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-700 ${favorable ? "bg-primary" : "bg-destructive"}`}
          style={{ width: `${Math.min(Math.abs(actual / budget) * 100, 100)}%` }}
        />
      </div>
      <div className="flex items-center gap-1">
        {favorable ? <TrendingUp className="h-3 w-3 text-primary" /> : <TrendingDown className="h-3 w-3 text-destructive" />}
        <span className={`text-xs font-medium ${favorable ? "text-primary" : "text-destructive"}`}>
          {pct > 0 ? "+" : ""}{pct.toFixed(1)}% afvigelse
        </span>
      </div>
    </div>
  );
}

export default BudgetComparison;
