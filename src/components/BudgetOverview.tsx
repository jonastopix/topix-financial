import { useQuery } from "@tanstack/react-query";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveKeyFigures, formatCompact, type ReportData } from "@/lib/financialUtils";

interface ComparisonRow {
  label: string;
  budget: number;
  actual: number;
}

const BudgetOverview = () => {
  const { user, companyId } = useAuth();

  const { data } = useQuery({
    queryKey: ["budget-overview-v2", companyId],
    queryFn: async () => {
      const currentYear = new Date().getFullYear();
      const [budgetRes, reportRes] = await Promise.all([
        (supabase
          .from("budget_targets")
          .select("category, budget_amount, period") as any)
          .eq("company_id", companyId!)
          .like("period", `${currentYear}-base-%`),
        (supabase
          .from("financial_reports")
          .select("id, report_period, extracted_data, normalized_data, status, manual_report_period_key, manual_normalized_data, manual_override_status") as any)
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .eq("status", "processed")
          .order("uploaded_at", { ascending: false })
          .limit(1),
      ]);

      const budgets = budgetRes.data || [];
      const report = (reportRes.data?.[0] || null) as ReportData | null;
      const kf = report ? getEffectiveKeyFigures(report) : null;

      // Sum budget by revenue vs expenses categories
      let budgetRevenue = 0;
      let budgetExpenses = 0;
      budgets.forEach(b => {
        const cat = b.category.toLowerCase();
        if (cat.includes("omsaetning") || cat.includes("omsætning") || cat.includes("revenue") || cat.includes("salg")) {
          budgetRevenue += Number(b.budget_amount);
        } else {
          budgetExpenses += Math.abs(Number(b.budget_amount));
        }
      });

      // Actuals from latest report
      const actualRevenue = kf?.omsaetning ?? 0;
      const actualExpenses = Math.abs(kf?.loenninger ?? 0) +
        Math.abs(kf?.direkte_omkostninger ?? 0) +
        Math.abs(kf?.marketing ?? 0) +
        Math.abs(kf?.lokaler ?? 0) +
        Math.abs(kf?.admin ?? 0) +
        Math.abs(kf?.tech_software ?? 0) +
        Math.abs(kf?.afskrivninger ?? 0);

      const rows: ComparisonRow[] = [];
      if (budgetRevenue > 0 || actualRevenue > 0) {
        rows.push({ label: "Omsætning", budget: budgetRevenue, actual: actualRevenue });
      }
      if (budgetExpenses > 0 || actualExpenses > 0) {
        rows.push({ label: "Omkostninger", budget: budgetExpenses, actual: actualExpenses });
      }

      return { rows, period: report?.report_period, hasBudget: budgets.length > 0 };
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const { rows = [], period, hasBudget } = data || {};

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground text-sm">Budget vs. Actual</h3>
      </div>

      {rows.length > 0 ? (
        <div className="flex-1 space-y-4">
          {rows.map(row => {
            const diff = row.actual - row.budget;
            const isRevenue = row.label === "Omsætning";
            // For revenue: positive diff is good. For expenses: negative diff is good.
            const isGood = isRevenue ? diff >= 0 : diff <= 0;
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground font-medium">{row.label}</span>
                  <div className="flex items-center gap-1">
                    {diff !== 0 && (
                      isGood
                        ? <TrendingUp className="h-3 w-3 text-primary" />
                        : <TrendingDown className="h-3 w-3 text-destructive" />
                    )}
                    <span className={`text-[10px] font-semibold ${isGood ? "text-primary" : "text-destructive"}`}>
                      {diff >= 0 ? "+" : ""}{formatCompact(diff)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>Budget: {formatCompact(row.budget)}</span>
                  <span>·</span>
                  <span>Actual: {formatCompact(row.actual)}</span>
                </div>
              </div>
            );
          })}
          {period && (
            <p className="text-[10px] text-muted-foreground">Baseret på {period}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4 flex-1 flex items-center justify-center">
          {hasBudget ? "Upload rapport for sammenligning" : "Opret budget for at se afvigelser"}
        </p>
      )}

      <Link
        to="/budget"
        className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors pt-3 mt-auto"
      >
        Se budget <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
};

export default BudgetOverview;
