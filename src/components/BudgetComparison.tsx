import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
  LineChart, Line, Area, AreaChart, ComposedChart, ReferenceLine,
} from "recharts";
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, Pencil, Save, X, CalendarDays, Loader2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface BudgetLine {
  category: string;
  budget: number;
  actual: number;
}

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

// Map report extracted_data keys to our budget categories
function mapReportToActuals(kf: Record<string, number>): Record<string, number> {
  return {
    "Omsætning": Math.abs(kf.omsaetning || 0),
    "Direkte omk.": Math.abs(kf.direkte_omkostninger || 0),
    "Lønninger": Math.abs(kf.loenninger || 0),
    "Marketing": Math.abs(kf.salgsomkostninger || 0),
    "Lokaler": Math.abs(kf.lokaleomkostninger || 0),
    "Administration": Math.abs(kf.administrationsomkostninger || 0),
    "Afskrivninger": Math.abs(kf.afskrivninger || 0),
  };
}

// Map internal budget keys → display category names
const INTERNAL_TO_DISPLAY: Record<string, string> = {
  omsaetning: "Omsætning",
  direkte_omkostninger: "Direkte omk.",
  loenninger: "Lønninger",
  salgsomkostninger: "Marketing",
  lokaleomkostninger: "Lokaler",
  administrationsomkostninger: "Administration",
  afskrivninger: "Afskrivninger",
};

import { DANISH_MONTHS_INDEX } from "@/lib/financialUtils";

// Convert Danish period "Januar 2026" → "2026-base-0"
function danishPeriodToBudgetKey(period: string): string | null {
  const parts = period.toLowerCase().split(" ");
  const monthIdx = DANISH_MONTHS_INDEX[parts[0]];
  const year = parts[1];
  if (monthIdx == null || !year) return null;
  return `${year}-base-${monthIdx}`;
}

const formatDKK = (v: number) => `${(v / 1000).toFixed(0)}k`;

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--popover-foreground))",
  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
};

const tooltipLabelStyle = { color: "hsl(var(--popover-foreground))", fontWeight: 600 };
const tooltipItemStyle = { color: "hsl(var(--muted-foreground))" };

function variance(budget: number, actual: number, isRevenue: boolean) {
  const diff = isRevenue ? actual - budget : budget - actual;
  const pct = budget !== 0 ? (diff / budget) * 100 : 0;
  return { diff, pct, favorable: diff >= 0 };
}

const BudgetComparison = () => {
  const { companyId } = useAuth();
  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [budgetData, setBudgetData] = useState<BudgetLine[]>([]);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportActuals, setReportActuals] = useState<Record<string, Record<string, number>>>({});
  const [allBudgetTargets, setAllBudgetTargets] = useState<{ category: string; budget_amount: number; period: string }[]>([]);

  // Load user + available report periods
  useEffect(() => {
    if (!companyId) return;
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      // Fetch all processed reports to get available periods and actual data
      const { data: reports } = await supabase
        .from("financial_reports")
        .select("report_period, extracted_data")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("status", "processed")
        .order("uploaded_at", { ascending: false });

      if (reports && reports.length > 0) {
        const actuals: Record<string, Record<string, number>> = {};
        const uniquePeriods: string[] = [];

        reports.forEach((r) => {
          if (!r.report_period || !r.extracted_data) return;
          const kf = (r.extracted_data as any)?.key_figures;
          if (!kf) return;

          if (!actuals[r.report_period]) {
            actuals[r.report_period] = mapReportToActuals(kf);
            uniquePeriods.push(r.report_period);
          }
        });

        setReportActuals(actuals);
        setPeriods(uniquePeriods);
        if (uniquePeriods.length > 0) {
          setSelectedPeriod(uniquePeriods[0]);
        }
      }

      // Fetch all budget targets for trending
      const { data: targets } = await supabase
        .from("budget_targets")
        .select("category, budget_amount, period")
        .eq("company_id", companyId);
      if (targets) setAllBudgetTargets(targets);

      setLoading(false);
    };
    init();
  }, [companyId]);

  // Load budget data when period or user changes
  useEffect(() => {
    if (!selectedPeriod || !companyId) return;

    const load = async () => {
      // Try both Danish period format and internal budget key format
      const budgetKey = danishPeriodToBudgetKey(selectedPeriod);
      const periodsToQuery = [selectedPeriod];
      if (budgetKey) periodsToQuery.push(budgetKey);

      const { data } = await supabase
        .from("budget_targets")
        .select("category, budget_amount, period")
        .eq("company_id", companyId)
        .in("period", periodsToQuery);

      let savedMap: Map<string, number> | undefined;
      if (data && data.length > 0) {
        savedMap = new Map();
        data.forEach((d) => {
          // Handle display name categories (legacy)
          if (CATEGORIES.includes(d.category)) {
            savedMap!.set(d.category, Number(d.budget_amount));
          }
          // Handle internal key categories (new format)
          const displayName = INTERNAL_TO_DISPLAY[d.category];
          if (displayName && !savedMap!.has(displayName)) {
            savedMap!.set(displayName, Number(d.budget_amount));
          }
        });
        if (savedMap.size === 0) savedMap = undefined;
      }

      const actuals = reportActuals[selectedPeriod] || {};

      setBudgetData(CATEGORIES.map((cat) => ({
        category: cat,
        budget: savedMap?.get(cat) ?? defaultBudgets[cat],
        actual: actuals[cat] ?? 0,
      })));
    };
    load();
  }, [selectedPeriod, companyId, reportActuals]);

  const handlePeriodChange = (period: string) => {
    if (editing) { setEditing(false); setEditValues({}); }
    setSelectedPeriod(period);
  };

  const startEditing = useCallback(() => {
    const values: Record<string, string> = {};
    budgetData.forEach((line) => { values[line.category] = String(line.budget); });
    setEditValues(values);
    setEditing(true);
  }, [budgetData]);

  const cancelEditing = () => { setEditing(false); setEditValues({}); };

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
        company_id: companyId,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="glass-card rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Ingen rapporter uploadet endnu. Upload en rapport for at se Budget vs. Actual.
        </p>
      </div>
    );
  }

  const totalBudgetCost = budgetData.filter((d) => d.category !== "Omsætning").reduce((s, d) => s + d.budget, 0);
  const totalActualCost = budgetData.filter((d) => d.category !== "Omsætning").reduce((s, d) => s + d.actual, 0);
  const revLine = budgetData.find((d) => d.category === "Omsætning") || { budget: 0, actual: 0 };
  const revVar = variance(revLine.budget, revLine.actual, true);
  const costVar = variance(totalBudgetCost, totalActualCost, false);
  const budgetedResult = revLine.budget - totalBudgetCost;
  const actualResult = revLine.actual - totalActualCost;

  // Only show categories that have actual data or budget set
  const visibleData = budgetData.filter((d) => d.actual !== 0 || d.budget !== 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with period selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-1">
            Budget vs. Actual
          </h2>
          <p className="text-xs text-muted-foreground">
            Baseret på uploadede rapporter
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[180px] h-9 text-xs bg-secondary border-border">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              {periods.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!editing ? (
            <button onClick={startEditing} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors">
              <Pencil className="h-3.5 w-3.5" />Rediger
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={cancelEditing} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
              <button onClick={saveBudgets} disabled={saving} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                <Save className="h-3.5 w-3.5" />{saving ? "..." : "Gem"}
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
            <BarChart data={visibleData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={formatDKK} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(value: number) => [`${value.toLocaleString("da-DK")} DKK`, ""]} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="budget" name="Budget" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" radius={[4, 4, 0, 0]}>
                {visibleData.map((entry) => {
                  const isRev = entry.category === "Omsætning";
                  const fav = isRev ? entry.actual >= entry.budget : entry.actual <= entry.budget;
                  return <Cell key={entry.category} fill={fav ? "hsl(var(--chart-positive))" : "hsl(var(--chart-negative))"} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trending chart — Budget vs. Actual over tid */}
      {periods.length >= 2 && (
        <TrendingChart periods={periods} reportActuals={reportActuals} allBudgetTargets={allBudgetTargets} />
      )}

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
                const hasActual = row.actual !== 0;
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
                    <td className="py-3 px-2 text-right text-foreground font-display font-medium">
                      {hasActual ? row.actual.toLocaleString("da-DK") : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={`py-3 px-2 text-right font-display font-medium ${hasActual ? (v.favorable ? "text-primary" : "text-destructive") : "text-muted-foreground"}`}>
                      {hasActual ? `${v.diff > 0 ? "+" : ""}${v.diff.toLocaleString("da-DK")}` : "—"}
                    </td>
                    <td className={`py-3 px-2 text-right font-display text-xs ${hasActual ? (v.favorable ? "text-primary" : "text-destructive") : "text-muted-foreground"}`}>
                      {hasActual ? `${v.pct > 0 ? "+" : ""}${v.pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-3 px-2 text-center">
                      {!hasActual ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : v.favorable ? (
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

function periodSortKey(period: string): string {
  const parts = period.toLowerCase().split(" ");
  const monthIdx = DANISH_MONTHS_INDEX[parts[0]] ?? 0;
  const year = parts[1] || "2025";
  return `${year}-${String(monthIdx).padStart(2, "0")}`;
}

function shortMonth(period: string): string {
  const SHORT = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
  const parts = period.toLowerCase().split(" ");
  const idx = DANISH_MONTHS_INDEX[parts[0]] ?? 0;
  return SHORT[idx];
}

function TrendingChart({ periods, reportActuals, allBudgetTargets }: {
  periods: string[];
  reportActuals: Record<string, Record<string, number>>;
  allBudgetTargets: { category: string; budget_amount: number; period: string }[];
}) {
  const sorted = [...periods].sort((a, b) => periodSortKey(a).localeCompare(periodSortKey(b)));

  const COST_CATEGORIES = CATEGORIES.filter(c => c !== "Omsætning");

  const COST_COLORS: Record<string, string> = {
    "Lønninger": "hsl(var(--chart-1))",
    "Marketing": "hsl(var(--chart-2))",
    "Lokaler": "hsl(var(--chart-3))",
    "Administration": "hsl(var(--chart-4))",
    "Direkte omk.": "hsl(var(--chart-5))",
    "Afskrivninger": "hsl(var(--chart-warning))",
  };

  const data = sorted.map((period) => {
    const actuals = reportActuals[period] || {};
    const actualRevenue = actuals["Omsætning"] || 0;
    const actualCosts = Object.entries(actuals)
      .filter(([k]) => k !== "Omsætning")
      .reduce((s, [, v]) => s + v, 0);
    const actualResult = actualRevenue - actualCosts;

    // Get budget for this period — try both Danish and internal format
    const budgetKey = danishPeriodToBudgetKey(period);
    const periodBudgets = allBudgetTargets.filter(t => 
      t.period === period || (budgetKey && t.period === budgetKey)
    );
    
    // Resolve budget values checking both display names and internal keys
    const findBudget = (displayCat: string): number => {
      // Check display name match
      const byDisplay = periodBudgets.find(t => t.category === displayCat);
      if (byDisplay) return Number(byDisplay.budget_amount);
      // Check internal key match
      const internalKey = Object.entries(INTERNAL_TO_DISPLAY).find(([, v]) => v === displayCat)?.[0];
      if (internalKey) {
        const byKey = periodBudgets.find(t => t.category === internalKey);
        if (byKey) return Number(byKey.budget_amount);
      }
      return defaultBudgets[displayCat];
    };
    
    const budgetRevenue = findBudget("Omsætning");
    const budgetCosts = CATEGORIES
      .filter(c => c !== "Omsætning")
      .reduce((s, cat) => s + findBudget(cat), 0);
    const budgetResult = budgetRevenue - budgetCosts;

    // Per-category cost actuals
    const costBreakdown: Record<string, number> = {};
    COST_CATEGORIES.forEach(cat => {
      costBreakdown[cat] = actuals[cat] || 0;
    });

    return {
      period: shortMonth(period),
      fullPeriod: period,
      budgetRevenue,
      actualRevenue,
      budgetResult,
      actualResult,
      ...costBreakdown,
    };
  });

  return (
    <div className="glass-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Budget vs. Actual over tid
        </h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{sorted.length} måneder</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue trending */}
        <div>
          <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">Omsætning</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={formatDKK} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(value: number) => [`${value.toLocaleString("da-DK")} DKK`, ""]} labelFormatter={(label) => data.find(d => d.period === label)?.fullPeriod || label} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Area type="monotone" dataKey="budgetRevenue" name="Budget" fill="hsl(var(--muted))" stroke="hsl(var(--muted-foreground))" fillOpacity={0.3} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="actualRevenue" name="Actual" stroke="hsl(var(--chart-positive))" strokeWidth={2.5} dot={{ fill: "hsl(var(--chart-positive))", r: 4 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Result trending */}
        <div>
          <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">Resultat</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={formatDKK} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(value: number) => [`${value.toLocaleString("da-DK")} DKK`, ""]} labelFormatter={(label) => data.find(d => d.period === label)?.fullPeriod || label} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="budgetResult" name="Budget" fill="hsl(var(--muted))" stroke="hsl(var(--muted-foreground))" fillOpacity={0.3} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="actualResult" name="Actual" stroke="hsl(var(--chart-positive))" strokeWidth={2.5} dot={(props: any) => {
                  const { cx, cy, value } = props;
                  const color = value >= 0 ? "hsl(var(--chart-positive))" : "hsl(var(--chart-negative))";
                  return <circle cx={cx} cy={cy} r={4} fill={color} stroke={color} />;
                }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Cost breakdown stacked area */}
      <div className="mt-6">
        <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">Omkostningsfordeling over tid</p>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={formatDKK} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value.toLocaleString("da-DK")} DKK`, name]} labelFormatter={(label) => data.find(d => d.period === label)?.fullPeriod || label} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {COST_CATEGORIES.map((cat) => (
                <Area
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  name={cat}
                  stackId="costs"
                  stroke={COST_COLORS[cat] || "hsl(var(--muted-foreground))"}
                  fill={COST_COLORS[cat] || "hsl(var(--muted))"}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}


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
          style={{ width: `${budget !== 0 ? Math.min(Math.abs(actual / budget) * 100, 100) : 0}%` }}
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
