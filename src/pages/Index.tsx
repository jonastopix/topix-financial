import { useState, useMemo, useEffect } from "react";
import GroupWelcomeBanner from "@/components/GroupWelcomeBanner";
import { Link } from "react-router-dom";
import { DollarSign, TrendingUp, Flame, Wallet, FileText, Clock, Upload, ArrowRight, Sparkles, CheckCircle2, ChevronRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import KPICard from "@/components/KPICard";
import RevenueChart from "@/components/RevenueChart";
import CombinedBudgetWidget from "@/components/CombinedBudgetWidget";
import PerformanceScore from "@/components/PerformanceScore";
import DashboardActionCenter from "@/components/DashboardActionCenter";
import DashboardMilestones from "@/components/DashboardMilestones";
import DashboardHandouts from "@/components/DashboardHandouts";
import DashboardActivity from "@/components/DashboardActivity";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import PulseCheckinModal from "@/components/PulseCheckinModal";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";

import AdvisorDashboard from "@/components/AdvisorDashboard";
import AdvisorCompanyOverview from "@/components/AdvisorCompanyOverview";
import GuidedTour from "@/components/GuidedTour";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { useCompanyCommentary } from "@/hooks/useCompanyCommentary";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { formatDKK, formatCompact, pctChange, calcTotalExpenses, DANISH_MONTHS, parseReportPeriodToKey } from "@/lib/financialUtils";


function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
}

/** Parse budget period to "YYYY-MM" key. Handles "2026-base-3" and "April 2026" formats */
function budgetPeriodToKey(period: string): string | null {
  const idxMatch = period.match(/^(\d{4})-\w+-(\d+)$/);
  if (idxMatch) return `${idxMatch[1]}-${String(Number(idxMatch[2]) + 1).padStart(2, "0")}`;
  return parseReportPeriodToKey(period);
}

const Dashboard = () => {
  const { user, profile, companyId, isAdvisor: rawAdvisor, refreshProfile } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [showTour, setShowTour] = useState(false);
  const [showPulseModal, setShowPulseModal] = useState(false);
  const queryClient = useQueryClient();

  const shouldShowTour = !rawAdvisor && profile && !profile.tour_completed_at;
  const [tourTriggered, setTourTriggered] = useState(false);

  // ── Facts from the facts layer ──
  const { data: facts = [], isLoading: factsLoading } = useCompanyFacts();
  const { data: commentaries = [] } = useCompanyCommentary();

  // ── Budget targets (separate query) ──
  const { data: budgetTargets = [], isLoading: budgetLoading } = useQuery({
    queryKey: ["dashboard-budgets", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("budget_targets")
        .select("category, period, budget_amount")
        .eq("company_id", companyId!);
      return (data || []) as { category: string; period: string; budget_amount: number }[];
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60_000,
  });

  // ── Company name check ──
  const { data: companyInfo } = useQuery({
    queryKey: ["company-name-check", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("name")
        .eq("id", companyId!)
        .single();
      return data;
    },
    enabled: !!companyId && !isAdvisor,
    staleTime: 10 * 60_000,
  });

  const needsCompanyName = useMemo(() => {
    if (!companyInfo?.name) return false;
    const name = companyInfo.name;
    return (
      name.toLowerCase().endsWith("s virksomhed") ||
      name.toLowerCase() === "ny bruger" ||
      name.trim().length < 3
    );
  }, [companyInfo]);

  const isLoading = factsLoading || budgetLoading;

  // Trigger tour after data loads (must be before early returns)
  useEffect(() => {
    if (shouldShowTour && !tourTriggered && !isLoading) {
      const timer = setTimeout(() => setShowTour(true), 800);
      setTourTriggered(true);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTour, tourTriggered, isLoading]);

  // ── Transform facts to sorted Danish-key shape ──
  const sorted = useMemo(() => {
    return facts.map((f) => ({
      key: f.period_key,
      kf: factsToDanishMetrics(f.metrics),
      period: f.period_label,
    }));
    // Already sorted by period_key from the hook
  }, [facts]);

  const latestCommentary = useMemo(() => {
    if (commentaries.length === 0 || sorted.length === 0) return null;
    const latestPeriodKey = sorted[sorted.length - 1].key;
    return commentaries.find(c => c.period_key === latestPeriodKey && !c.is_stale) || null;
  }, [commentaries, sorted]);

  // ── Derive KPI data from sorted facts ──
  const dashboardData = useMemo(() => {
    let kpiData = {
      revenue: null as number | null, revenuePrev: null as number | null,
      expenses: null as number | null, result: null as number | null,
      bank: null as number | null, bankPeriod: null as string | null,
      period: null as string | null,
      revenueYoY: null as number | null, resultYoY: null as number | null,
      expensesYoY: null as number | null,
      ytdRevenue: null as number | null, ytdResult: null as number | null,
      ytdExpenses: null as number | null,
    };

    if (sorted.length > 0) {
      const latest = sorted[sorted.length - 1];
      const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

      const [latestYear, latestMonth] = latest.key.split("-");
      const yoyKey = `${Number(latestYear) - 1}-${latestMonth}`;
      const yoyReport = sorted.find(r => r.key === yoyKey);

      const bankReport = [...sorted].reverse().find(r => r.kf.bank_balance != null);

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
        revenueYoY: pctChange(latest.kf.omsaetning, yoyReport?.kf.omsaetning),
        resultYoY: pctChange(latest.kf.resultat_foer_skat, yoyReport?.kf.resultat_foer_skat),
        expensesYoY: pctChange(calcTotalExpenses(latest.kf), yoyReport ? calcTotalExpenses(yoyReport.kf) : undefined),
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
    const budgetByMonthCat = new Map<string, Map<string, number>>();
    for (const b of budgetTargets) {
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

    return { kpiData, budgetData, sparklines, hasReports };
  }, [sorted, budgetTargets]);

  const kpiData = dashboardData.kpiData;
  const budgetData = dashboardData.budgetData;
  const spark = dashboardData.sparklines;
  const hasReports = dashboardData.hasReports;

  // ── Pulse check for "Dit forløb" card ──
  const { data: pulseThisMonth } = useQuery({
    queryKey: ["pulse-this-month", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const periodKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      const { data } = await supabase
        .from("pulse_checkins")
        .select("id")
        .eq("company_id", companyId)
        .eq("period_key", periodKey)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !isAdvisor,
    staleTime: 5 * 60_000,
  });
  const hasPulseThisMonth = !!pulseThisMonth;

  // ── Milestones progress this month ──
  const { data: milestonesThisMonth } = useQuery({
    queryKey: ["milestones-this-month", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data } = await supabase
        .from("milestones")
        .select("id")
        .eq("company_id", companyId)
        .or(`status.eq.done,progress.gt.0`)
        .gte("updated_at", monthStart)
        .limit(1);
      return data;
    },
    enabled: !!companyId && !isAdvisor,
    staleTime: 5 * 60_000,
  });
  const hasMilestoneProgressThisMonth = !!(milestonesThisMonth && milestonesThisMonth.length > 0);

  const firstName = profile?.full_name?.split(" ")[0] || "dig";
  const now = new Date();
  const currentMonthName = DANISH_MONTHS[now.getMonth()].toLowerCase();
  const currentYear = now.getFullYear();

  const revenueChange = pctChange(kpiData.revenue ?? undefined, kpiData.revenuePrev ?? undefined);
  const fmtPct = (v: number | null) => v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : undefined;

  const budgetBadge = (actual: number | null, budget: number | null, revenueType: boolean) => {
    if (actual == null || budget == null || budget === 0) return null;
    const diff = actual - budget;
    const pct = ((diff / Math.abs(budget)) * 100).toFixed(0);
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


  return (
    <AppLayout>
      {showTour && (
        <GuidedTour onComplete={() => { setShowTour(false); refreshProfile(); }} />
      )}
      {/* Group welcome (compact) — shown only for non-advisor group members */}
      <GroupWelcomeBanner variant="compact" />
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
            <Link
              to="/annual-baseline"
              className="block mt-3 text-sm text-primary hover:underline transition-colors"
            >
              Eller sæt baseline med årstal →
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

      {/* Company name banner */}
      {needsCompanyName && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4 animate-fade-in">
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Giv din virksomhed et rigtigt navn
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
              Dit virksomhedsnavn er stadig det automatisk genererede.
              Opdater det i Indstillinger så dit board ser professionelt ud.
            </p>
          </div>
          <Link
            to="/settings"
            className="shrink-0 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition-colors"
          >
            Ret navn →
          </Link>
        </div>
      )}


      {/* Pulse modal */}
      <PulseCheckinModal
        open={showPulseModal}
        onOpenChange={setShowPulseModal}
        onComplete={() => queryClient.invalidateQueries({ queryKey: ["pulse-this-month", companyId] })}
      />

      {/* Unified action center */}
      {!isAdvisor && companyId && (
        <DashboardActionCenter
          companyId={companyId}
          hasPulseThisMonth={hasPulseThisMonth}
          hasReports={hasReports}
          hasMilestoneProgressThisMonth={hasMilestoneProgressThisMonth}
        />
      )}

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
      <div className="flex justify-end mb-6 -mt-3">
        <Link
          to="/kpis"
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          Se detaljeret finansiel oversigt
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* 3-column snapshot grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        <DashboardMilestones />
        <DashboardHandouts />
        <CombinedBudgetWidget />
      </div>

      {latestCommentary && !isAdvisor && (
        <div className="mb-6">
          <Link to="/kpis" className="block group">
            <div className="rounded-lg border bg-card p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Din AI-analyse er klar</p>
                  <p className="text-xs text-muted-foreground">
                    Se indsigter og anbefalinger for{" "}
                    {sorted[sorted.length - 1]?.period || "seneste periode"}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </Link>
        </div>
      )}

      {/* AI-chat teaser — only shown when founder has data */}
      {kpiData.period && !isAdvisor && (
        <div className="mb-6">
          <Link to="/chat?tab=ai" className="block group">
            <div className="rounded-lg border bg-card p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Stil AI et spørgsmål om dine tal</p>
                  <p className="text-xs text-muted-foreground">
                    Hvad var min bedste måned? Hvad driver mine udgifter?
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </Link>
        </div>
      )}

      <div className="mb-6">
        <DashboardActivity />
      </div>
    </AppLayout>
  );
};

export default Dashboard;
