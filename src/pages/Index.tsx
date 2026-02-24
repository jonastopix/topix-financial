import { DollarSign, TrendingUp, Flame, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import KPICard from "@/components/KPICard";
import RevenueChart from "@/components/RevenueChart";
import BudgetOverview from "@/components/BudgetOverview";
import PerformanceScore from "@/components/PerformanceScore";
import AttentionNeeded from "@/components/AttentionNeeded";
import AIProgressWidget from "@/components/AIProgressWidget";
import DashboardMilestones from "@/components/DashboardMilestones";
import DashboardHandouts from "@/components/DashboardHandouts";
import DashboardActivity from "@/components/DashboardActivity";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getKeyFigures, parseReportPeriodToKey, formatDKK, pctChange, DANISH_MONTHS, type ReportData } from "@/lib/financialUtils";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
}

/** Sum all operating expenses from key figures */
function totalExpenses(kf: Record<string, number>): number {
  return Math.abs(kf.loenninger ?? 0) +
    Math.abs(kf.direkte_omkostninger ?? 0) +
    Math.abs(kf.marketing ?? 0) +
    Math.abs(kf.lokaler ?? 0) +
    Math.abs(kf.admin ?? 0) +
    Math.abs(kf.tech_software ?? 0) +
    Math.abs(kf.afskrivninger ?? 0);
}

const Dashboard = () => {
  const { user, profile, companyId } = useAuth();

  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard-kpis", companyId, user?.id],
    queryFn: async () => {
      const [reportsRes, convRes] = await Promise.all([
        (supabase
          .from("financial_reports")
          .select("id, report_period, extracted_data, status") as any)
          .eq("company_id", companyId!)
          .eq("status", "processed")
          .order("uploaded_at", { ascending: false })
          .limit(12),
        supabase.from("conversations").select("id").eq("member_id", user!.id).maybeSingle(),
      ]);

      const conversationId = convRes.data?.id || null;
      const reports = (reportsRes.data || []) as ReportData[];
      const sorted = reports
        .map(r => ({ key: parseReportPeriodToKey(r.report_period), kf: getKeyFigures(r), period: r.report_period }))
        .filter((d): d is { key: string; kf: Record<string, number>; period: string } => !!d.key && !!d.kf)
        .sort((a, b) => a.key.localeCompare(b.key));

      let kpiData = { revenue: null as number | null, revenuePrev: null as number | null, expenses: null as number | null, result: null as number | null, bank: null as number | null, bankPeriod: null as string | null, period: null as string | null };

      if (sorted.length > 0) {
        const latest = sorted[sorted.length - 1];
        const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

        // Find the most recent report that has bank_balance
        const bankReport = [...sorted].reverse().find(r => r.kf.bank_balance != null);

        kpiData = {
          revenue: latest.kf.omsaetning ?? null,
          revenuePrev: prev?.kf.omsaetning ?? null,
          expenses: totalExpenses(latest.kf),
          result: latest.kf.resultat_foer_skat ?? null,
          bank: bankReport?.kf.bank_balance ?? null,
          bankPeriod: bankReport?.period ?? null,
          period: latest.period,
        };
      }

      return { kpiData, conversationId };
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const kpiData = dashboardData?.kpiData ?? { revenue: null, revenuePrev: null, expenses: null, result: null, bank: null, bankPeriod: null, period: null };

  const firstName = profile?.full_name?.split(" ")[0] || "dig";
  const now = new Date();
  const currentMonthName = DANISH_MONTHS[now.getMonth()].toLowerCase();
  const currentYear = now.getFullYear();

  const revenueChange = pctChange(kpiData.revenue ?? undefined, kpiData.revenuePrev ?? undefined);

  return (
    <AppLayout>
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Dit finansielle overblik for <span className="font-medium text-foreground/70">{currentMonthName} {currentYear}</span>
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KPICard
          title="Omsætning"
          value={kpiData.revenue != null ? formatDKK(kpiData.revenue) : "—"}
          change={revenueChange != null ? `${revenueChange >= 0 ? "+" : ""}${revenueChange.toFixed(1)}%` : undefined}
          trend={revenueChange != null ? (revenueChange >= 0 ? "up" : "down") : "neutral"}
          subtitle={kpiData.period ? `fra ${kpiData.period}` : "Upload rapport"}
          icon={<DollarSign className="h-4 w-4" />}
          accentColor="emerald"
        />
        <KPICard
          title="Udgifter"
          value={kpiData.expenses != null ? formatDKK(kpiData.expenses) : "—"}
          subtitle="samlede driftsomk."
          icon={<Flame className="h-4 w-4" />}
          accentColor="amber"
        />
        <KPICard
          title="Resultat"
          value={kpiData.result != null ? formatDKK(kpiData.result) : "—"}
          trend={kpiData.result != null ? (kpiData.result >= 0 ? "up" : "down") : "neutral"}
          subtitle="før skat"
          icon={<TrendingUp className="h-4 w-4" />}
          accentColor="blue"
        />
        <KPICard
          title="Bank"
          value={kpiData.bank != null ? formatDKK(kpiData.bank) : "—"}
          subtitle={kpiData.bankPeriod ? `saldo (${kpiData.bankPeriod})` : "saldo"}
          icon={<Wallet className="h-4 w-4" />}
          accentColor="blue"
        />
      </div>

      {/* Attention needed */}
      <div className="mb-6">
        <AttentionNeeded />
      </div>

      {/* Performance + Revenue chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        <div className="lg:col-span-4">
          <PerformanceScore />
        </div>
        <div className="lg:col-span-8">
          <RevenueChart />
        </div>
      </div>

      {/* 4-column snapshot grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DashboardHandouts />
        <BudgetOverview />
        <DashboardMilestones />
        <AIProgressWidget compact />
      </div>

      {/* Horizontal activity feed */}
      <DashboardActivity />
    </AppLayout>
  );
};

export default Dashboard;
