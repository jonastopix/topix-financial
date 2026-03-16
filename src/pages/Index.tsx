import { useState } from "react";
import { Link } from "react-router-dom";
import { DollarSign, TrendingUp, Flame, Wallet, FileText, Clock, Upload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import KPICard from "@/components/KPICard";
import RevenueChart from "@/components/RevenueChart";
import BudgetOverview from "@/components/BudgetOverview";
import PerformanceScore from "@/components/PerformanceScore";
import AttentionNeeded from "@/components/AttentionNeeded";
import DashboardMilestones from "@/components/DashboardMilestones";
import DashboardHandouts from "@/components/DashboardHandouts";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import AdvisorDashboard from "@/components/AdvisorDashboard";
import AdvisorCompanyOverview from "@/components/AdvisorCompanyOverview";
import GuidedTour from "@/components/GuidedTour";
import { getEffectiveKeyFigures, getEffectiveReportPeriodKey, parseReportPeriodToKey, formatDKK, formatCompact, pctChange, calcTotalExpenses, DANISH_MONTHS, type ReportData } from "@/lib/financialUtils";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
}

/** Parse budget period to "YYYY-MM" key. Handles "2026-base-3" and "April 2026" formats */
function budgetPeriodToKey(period: string): string | null {
  // Format: "2026-base-3" → year-scenario-monthIdx
  const idxMatch = period.match(/^(\d{4})-\w+-(\d+)$/);
  if (idxMatch) return `${idxMatch[1]}-${String(Number(idxMatch[2]) + 1).padStart(2, "0")}`;
  // Format: "Januar 2026"
  return parseReportPeriodToKey(period);
}

const Dashboard = () => {
  const { user, profile, companyId, isAdvisor: rawAdvisor, refreshProfile } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [showTour, setShowTour] = useState(false);

  // Show tour for non-advisor users who haven't completed it
  const shouldShowTour = !isAdvisor && profile && !profile.tour_completed_at;

  // Trigger tour after dashboard data loads
  const [tourTriggered, setTourTriggered] = useState(false);

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["dashboard-kpis", companyId, user?.id],
    queryFn: async () => {
      const [reportsRes, convRes, budgetRes] = await Promise.all([
        (supabase
          .from("financial_reports")
          .select("id, report_period, extracted_data, normalized_data, status, manual_report_period_key, manual_normalized_data, manual_override_status") as any)
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .eq("status", "processed")
          .order("uploaded_at", { ascending: false })
          .limit(24),
        supabase.from("conversations").select("id").eq("company_id", companyId!).limit(1),
        supabase.from("budget_targets").select("category, period, budget_amount").eq("company_id", companyId!),
      ]);

      const conversationId = convRes.data?.[0]?.id || null;
      const reports = (reportsRes.data || []) as ReportData[];
      const sorted = reports
        .map(r => ({ key: getEffectiveReportPeriodKey(r), kf: getEffectiveKeyFigures(r), period: r.report_period }))
        .filter((d): d is { key: string; kf: Record<string, number>; period: string } => !!d.key && !!d.kf)
        .sort((a, b) => a.key.localeCompare(b.key));

      let kpiData = {
        revenue: null as number | null, revenuePrev: null as number | null,
        expenses: null as number | null, result: null as number | null,
        bank: null as number | null, bankPeriod: null as string | null,
        period: null as string | null,
        // Y/Y
        revenueYoY: null as number | null, resultYoY: null as number | null,
        expensesYoY: null as number | null,
        // YTD
        ytdRevenue: null as number | null, ytdResult: null as number | null,
        ytdExpenses: null as number | null,
      };

      if (sorted.length > 0) {
        const latest = sorted[sorted.length - 1];
        const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

        // Find same month last year for Y/Y
        const [latestYear, latestMonth] = latest.key.split("-");
        const yoyKey = `${Number(latestYear) - 1}-${latestMonth}`;
        const yoyReport = sorted.find(r => r.key === yoyKey);

        // Find the most recent report that has bank_balance
        const bankReport = [...sorted].reverse().find(r => r.kf.bank_balance != null);

        // YTD: Always sum individual month values (don't trust _aar fields from AI — they often read the wrong column)
        const currentYearReports = sorted.filter(r => r.key.startsWith(latestYear));
        const ytdRevenue = currentYearReports.reduce((s, r) => s + (r.kf.omsaetning ?? 0), 0);
        const ytdExpenses = currentYearReports.reduce((s, r) => s + calcTotalExpenses(r.kf), 0);
        const ytdResult = currentYearReports.reduce((s, r) => s + (r.kf.resultat_foer_skat ?? 0), 0);

        kpiData = {
          revenue: latest.kf.omsaetning ?? null,
          revenuePrev: prev?.kf.omsaetning ?? null,
          expenses: calcTotalExpenses(latest.kf),
          result: latest.kf.resultat_foer_skat ?? null,
          bank: bankReport?.kf.bank_balance ?? null,
          bankPeriod: bankReport?.period ?? null,
          period: latest.period,
          // Y/Y comparisons
          revenueYoY: pctChange(latest.kf.omsaetning, yoyReport?.kf.omsaetning),
          resultYoY: pctChange(latest.kf.resultat_foer_skat, yoyReport?.kf.resultat_foer_skat),
          expensesYoY: pctChange(calcTotalExpenses(latest.kf), yoyReport ? calcTotalExpenses(yoyReport.kf) : undefined),
          // YTD — always summed from individual months for reliability
          ytdRevenue: currentYearReports.length > 0 ? ytdRevenue : null,
          ytdResult: currentYearReports.length > 0 ? ytdResult : null,
          ytdExpenses: currentYearReports.length > 0 ? ytdExpenses : null,
        };
      }

      // ── Sparkline data (last 6 months) ──
      const last6 = sorted.slice(-6);
      const sparklines = {
        revenue: last6.map(r => r.kf.omsaetning ?? 0),
        expenses: last6.map(r => calcTotalExpenses(r.kf)),
        result: last6.map(r => r.kf.resultat_foer_skat ?? 0),
        bank: last6.filter(r => r.kf.bank_balance != null).map(r => r.kf.bank_balance),
      };

      // ── Budget vs Actual ──
      const budgets = (budgetRes.data || []) as { category: string; period: string; budget_amount: number }[];
      const budgetByMonthCat = new Map<string, Map<string, number>>();
      for (const b of budgets) {
        if (b.category === "__template__") continue;
        const mk = budgetPeriodToKey(b.period);
        if (!mk) continue;
        if (!budgetByMonthCat.has(mk)) budgetByMonthCat.set(mk, new Map());
        budgetByMonthCat.get(mk)!.set(b.category, (budgetByMonthCat.get(mk)!.get(b.category) ?? 0) + b.budget_amount);
      }

      const sumBudgetForMonth = (mk: string) => {
        const cats = budgetByMonthCat.get(mk);
        if (!cats) return { revenue: null as number | null, expenses: null as number | null };
        const rev = cats.get("omsaetning") ?? null;
        let exp = 0;
        let hasExp = false;
        cats.forEach((v, k) => { if (k !== "omsaetning") { exp += v; hasExp = true; } });
        return { revenue: rev, expenses: hasExp ? exp : null };
      };

      let budgetData = {
        monthRevenue: null as number | null, monthExpenses: null as number | null,
        ytdRevenue: null as number | null, ytdExpenses: null as number | null,
      };

      if (sorted.length > 0) {
        const [latestYear] = sorted[sorted.length - 1].key.split("-");
        const latestKey = sorted[sorted.length - 1].key;
        const mb = sumBudgetForMonth(latestKey);
        budgetData.monthRevenue = mb.revenue;
        budgetData.monthExpenses = mb.expenses;

        const currentYearKeys = sorted.filter(r => r.key.startsWith(latestYear)).map(r => r.key);
        const allBudgetKeysInYear = [...budgetByMonthCat.keys()].filter(k => k.startsWith(latestYear) && k <= latestKey);
        const ytdKeys = [...new Set([...currentYearKeys, ...allBudgetKeysInYear])].sort();
        let ytdBudgetRev = 0, ytdBudgetExp = 0, hasYtd = false;
        for (const k of ytdKeys) {
          const b = sumBudgetForMonth(k);
          if (b.revenue != null) { ytdBudgetRev += b.revenue; hasYtd = true; }
          if (b.expenses != null) { ytdBudgetExp += b.expenses; hasYtd = true; }
        }
        if (hasYtd) {
          budgetData.ytdRevenue = ytdBudgetRev;
          budgetData.ytdExpenses = ytdBudgetExp;
        }
      }

      const hasReports = sorted.length > 0;
      return { kpiData, budgetData, sparklines, conversationId, hasReports };
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60_000,
  });

  const kpiData = dashboardData?.kpiData ?? {
    revenue: null, revenuePrev: null, expenses: null, result: null,
    bank: null, bankPeriod: null, period: null,
    revenueYoY: null, resultYoY: null, expensesYoY: null,
    ytdRevenue: null, ytdResult: null, ytdExpenses: null,
  };
  const budgetData = dashboardData?.budgetData ?? {
    monthRevenue: null, monthExpenses: null, ytdRevenue: null, ytdExpenses: null,
  };
  const spark = dashboardData?.sparklines ?? { revenue: [], expenses: [], result: [], bank: [] };
  const hasReports = dashboardData?.hasReports ?? false;

  const firstName = profile?.full_name?.split(" ")[0] || "dig";
  const now = new Date();
  const currentMonthName = DANISH_MONTHS[now.getMonth()].toLowerCase();
  const currentYear = now.getFullYear();

  const revenueChange = pctChange(kpiData.revenue ?? undefined, kpiData.revenuePrev ?? undefined);
  const fmtPct = (v: number | null) => v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : undefined;

  /** Build budget badge: returns { label, favorable } or null */
  const budgetBadge = (actual: number | null, budget: number | null, revenueType: boolean) => {
    if (actual == null || budget == null || budget === 0) return null;
    const diff = actual - budget;
    const pct = ((diff / Math.abs(budget)) * 100).toFixed(0);
    // For revenue: over budget = good. For expenses: under budget = good.
    const favorable = revenueType ? diff >= 0 : diff <= 0;
    const sign = diff >= 0 ? "+" : "";
    return { label: `${sign}${pct}% vs budget`, favorable };
  };

  const monthRevBudget = budgetBadge(kpiData.revenue, budgetData.monthRevenue, true);
  const monthExpBudget = budgetBadge(kpiData.expenses, budgetData.monthExpenses, false);
  const monthResultBudget = budgetData.monthRevenue != null && budgetData.monthExpenses != null
    ? budgetBadge(kpiData.result, budgetData.monthRevenue - budgetData.monthExpenses, true)
    : null;
  const ytdRevBudget = budgetBadge(kpiData.ytdRevenue, budgetData.ytdRevenue, true);
  const ytdExpBudget = budgetBadge(kpiData.ytdExpenses, budgetData.ytdExpenses, false);
  const ytdResultBudget = budgetData.ytdRevenue != null && budgetData.ytdExpenses != null
    ? budgetBadge(kpiData.ytdResult, budgetData.ytdRevenue - budgetData.ytdExpenses, true)
    : null;

  if (isAdvisor && !companyId) {
    return (
      <AppLayout>
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
        </div>
        <AdvisorDashboard />
      </AppLayout>
    );
  }

  if (isAdvisor && companyId) {
    return (
      <AppLayout>
        <AdvisorCompanyOverview />
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  // Trigger tour after render
  if (shouldShowTour && !tourTriggered && !isLoading) {
    setTimeout(() => setShowTour(true), 800);
    setTourTriggered(true);
  }

  return (
    <AppLayout>
      {showTour && (
        <GuidedTour onComplete={() => setShowTour(false)} />
      )}
      {/* Greeting */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground tracking-tight">
          {getGreeting()}, {firstName}
        </h1>
      </div>

      {/* Empty state: no reports at all */}
      {!hasReports && !isAdvisor && (
        <div className="mb-8">
          <div className="bg-card border border-border shadow-sm rounded-xl p-8 text-center max-w-lg mx-auto">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-display font-semibold text-foreground mb-2">
              Upload din første rapport for at komme i gang
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Når du uploader en resultatopgørelse eller saldobalance, udfylder vi automatisk dit dashboard med nøgletal, trends og AI-analyse.
            </p>
            <Link
              to="/reports"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <FileText className="h-4 w-4" />
              Gå til rapportering
            </Link>
          </div>
        </div>
      )}

      {/* Transitional state: reports exist but no processed KPI data yet */}
      {hasReports && !kpiData.period && !isAdvisor && (
        <div className="mb-8">
          <div className="bg-card border border-border shadow-sm rounded-xl p-6 text-center max-w-lg mx-auto">
            <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              Dine rapporter er ved at blive behandlet…
            </p>
            <p className="text-xs text-muted-foreground">
              Nøgletal og trends vises her, så snart dataen er klar.
            </p>
          </div>
        </div>
      )}

      {/* Attention needed — action-first, before KPI data */}
      <div className="mb-6">
        <AttentionNeeded />
      </div>

      {/* KPI cards – only shown when we have processed data */}
      {kpiData.period && (
        <>
        {/* KPI cards – Seneste måned */}
        <div className="mb-6" data-tour="kpi-cards">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Seneste måned · {kpiData.period}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 overflow-hidden">
            <KPICard
              title="Omsætning"
              value={kpiData.revenue != null ? formatDKK(kpiData.revenue) : "—"}
              change={revenueChange != null ? `${fmtPct(revenueChange)} M/M` : undefined}
              trend={revenueChange != null ? (revenueChange >= 0 ? "up" : "down") : "neutral"}
              secondaryChange={kpiData.revenueYoY != null ? `${fmtPct(kpiData.revenueYoY)} Y/Y` : undefined}
              secondaryTrend={kpiData.revenueYoY != null ? (kpiData.revenueYoY >= 0 ? "up" : "down") : "neutral"}
              budgetLabel={monthRevBudget?.label}
              budgetFavorable={monthRevBudget?.favorable}
              sparkline={spark.revenue.length >= 2 ? spark.revenue : undefined}
              ytdLine={kpiData.ytdRevenue != null ? `YTD: ${formatCompact(kpiData.ytdRevenue)}${ytdRevBudget ? ` · ${ytdRevBudget.label}` : ""}` : undefined}
              subtitle={!revenueChange && kpiData.period ? `fra ${kpiData.period}` : undefined}
              icon={<DollarSign className="h-4 w-4" />}
              accentColor="emerald"
            />
            <KPICard
              title="Udgifter"
              value={kpiData.expenses != null ? formatDKK(kpiData.expenses) : "—"}
              secondaryChange={kpiData.expensesYoY != null ? `${fmtPct(kpiData.expensesYoY)} Y/Y` : undefined}
              secondaryTrend={kpiData.expensesYoY != null ? (kpiData.expensesYoY <= 0 ? "up" : "down") : "neutral"}
              budgetLabel={monthExpBudget?.label}
              budgetFavorable={monthExpBudget?.favorable}
              sparkline={spark.expenses.length >= 2 ? spark.expenses : undefined}
              ytdLine={kpiData.ytdExpenses != null ? `YTD: ${formatCompact(kpiData.ytdExpenses)}${ytdExpBudget ? ` · ${ytdExpBudget.label}` : ""}` : undefined}
              subtitle="samlede driftsomk."
              icon={<Flame className="h-4 w-4" />}
              accentColor="amber"
            />
            <KPICard
              title="Resultat"
              value={kpiData.result != null ? formatDKK(kpiData.result) : "—"}
              trend={kpiData.result != null ? (kpiData.result >= 0 ? "up" : "down") : "neutral"}
              secondaryChange={kpiData.resultYoY != null ? `${fmtPct(kpiData.resultYoY)} Y/Y` : undefined}
              secondaryTrend={kpiData.resultYoY != null ? (kpiData.resultYoY >= 0 ? "up" : "down") : "neutral"}
              budgetLabel={monthResultBudget?.label}
              budgetFavorable={monthResultBudget?.favorable}
              sparkline={spark.result.length >= 2 ? spark.result : undefined}
              ytdLine={kpiData.ytdResult != null ? `YTD: ${formatCompact(kpiData.ytdResult)}${ytdResultBudget ? ` · ${ytdResultBudget.label}` : ""}` : undefined}
              subtitle="før skat"
              icon={<TrendingUp className="h-4 w-4" />}
              accentColor="blue"
            />
            <KPICard
              title="Bank"
              value={kpiData.bank != null ? formatDKK(kpiData.bank) : "—"}
              sparkline={spark.bank.length >= 2 ? spark.bank : undefined}
              subtitle={kpiData.bankPeriod ? `saldo (${kpiData.bankPeriod})` : "saldo"}
              icon={<Wallet className="h-4 w-4" />}
              accentColor="blue"
            />
          </div>
        </div>
        </>
      )}

      {/* Performance + Revenue chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        <div className="lg:col-span-4">
          <PerformanceScore />
        </div>
        <div className="lg:col-span-8">
          <RevenueChart />
        </div>
      </div>

      {/* 3-column snapshot grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        <DashboardHandouts />
        <BudgetOverview />
        <DashboardMilestones />
      </div>
    </AppLayout>
  );
};

export default Dashboard;
