import { useQuery } from "@tanstack/react-query";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  getEffectiveKeyFigures,
  getEffectiveReportPeriodKey,
  getEffectiveReportPeriod,
  formatCompact,
  DANISH_MONTHS,
  REPORT_OVERRIDE_SELECT,
  type ReportData,
} from "@/lib/financialUtils";

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
      // Step 1: Fetch latest processed report (source of truth for period)
      const reportRes = await (supabase
        .from("financial_reports")
        .select(`id, report_period, extracted_data, normalized_data, status, manual_report_period_key, manual_normalized_data, manual_override_status, ${REPORT_OVERRIDE_SELECT}`) as any)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("status", "processed")
        .order("uploaded_at", { ascending: false })
        .limit(1);

      const report = (reportRes.data?.[0] || null) as ReportData | null;
      if (!report) return { rows: [], periodLabel: null, hasBudget: false, state: "no-report" as const };

      // Step 2: Resolve effective period key (YYYY-MM)
      const periodKey = getEffectiveReportPeriodKey(report);
      if (!periodKey) return { rows: [], periodLabel: null, hasBudget: false, state: "no-period" as const };

      const [yearStr, monthStr] = periodKey.split("-");
      const monthIdx = parseInt(monthStr, 10) - 1; // 0-indexed for budget period format
      const monthLabel = `${DANISH_MONTHS[monthIdx]} ${yearStr}`;

      // Step 3: Fetch budget for the SAME month only (base scenario)
      // Budget period format: "{year}-base-{monthIdx}" where monthIdx is 0-indexed
      const budgetRes = await (supabase
        .from("budget_targets")
        .select("category, budget_amount, period") as any)
        .eq("company_id", companyId!)
        .eq("period", `${yearStr}-base-${monthIdx}`);

      const budgets = budgetRes.data || [];
      if (budgets.length === 0) return { rows: [], periodLabel: monthLabel, hasBudget: false, state: "no-budget" as const };

      // Step 4: Build like-for-like comparison
      const kf = getEffectiveKeyFigures(report);

      let budgetRevenue = 0;
      let budgetExpenses = 0;
      budgets.forEach((b: any) => {
        const cat = b.category.toLowerCase();
        if (cat.includes("omsaetning") || cat.includes("omsætning") || cat.includes("revenue") || cat.includes("salg")) {
          budgetRevenue += Number(b.budget_amount);
        } else {
          budgetExpenses += Math.abs(Number(b.budget_amount));
        }
      });

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

      return { rows, periodLabel: monthLabel, hasBudget: true, state: "ready" as const };
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const { rows = [], periodLabel, state } = data || {};

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground text-sm">
          {periodLabel ? `Budget vs. Actual — ${periodLabel}` : "Budget vs. Actual"}
        </h3>
      </div>

      {state === "ready" && rows.length > 0 ? (
        <div className="flex-1 space-y-4">
          {rows.map(row => {
            const diff = row.actual - row.budget;
            const isRevenue = row.label === "Omsætning";
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
        </div>
      ) : state === "no-budget" ? (
        <p className="text-sm text-muted-foreground text-center py-4 flex-1 flex items-center justify-center">
          Intet budget for {periodLabel}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4 flex-1 flex items-center justify-center">
          Upload rapport for sammenligning
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
