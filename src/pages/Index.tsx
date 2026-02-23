import { useEffect, useState } from "react";
import { DollarSign, Users, TrendingUp, Flame } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import KPICard from "@/components/KPICard";
import RevenueChart from "@/components/RevenueChart";
import MilestonesList from "@/components/MilestonesList";
import RecentReports from "@/components/RecentReports";
import BudgetOverview from "@/components/BudgetOverview";
import PerformanceScore from "@/components/PerformanceScore";
import AttentionNeeded from "@/components/AttentionNeeded";
import ActivityFeed from "@/components/ActivityFeed";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getKeyFigures, parseReportPeriodToKey, formatDKK, pctChange, DANISH_MONTHS, type ReportData } from "@/lib/financialUtils";

const Dashboard = () => {
  const { user, profile } = useAuth();
  const [kpiData, setKpiData] = useState<{
    revenue: number | null;
    revenuePrev: number | null;
    expenses: number | null;
    result: number | null;
    bank: number | null;
    period: string | null;
  }>({ revenue: null, revenuePrev: null, expenses: null, result: null, bank: null, period: null });

  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadKPIs = async () => {
      const [reportsRes, convRes] = await Promise.all([
        supabase
          .from("financial_reports")
          .select("id, report_period, extracted_data, status")
          .eq("user_id", user.id)
          .eq("status", "processed")
          .order("uploaded_at", { ascending: false })
          .limit(12),
        supabase.from("conversations").select("id").eq("member_id", user.id).maybeSingle(),
      ]);

      setConversationId(convRes.data?.id || null);

      const reports = (reportsRes.data || []) as ReportData[];
      const sorted = reports
        .map(r => ({ key: parseReportPeriodToKey(r.report_period), kf: getKeyFigures(r), period: r.report_period }))
        .filter((d): d is { key: string; kf: Record<string, number>; period: string } => !!d.key && !!d.kf)
        .sort((a, b) => a.key.localeCompare(b.key));

      if (sorted.length > 0) {
        const latest = sorted[sorted.length - 1];
        const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
        setKpiData({
          revenue: latest.kf.omsaetning ?? null,
          revenuePrev: prev?.kf.omsaetning ?? null,
          expenses: latest.kf.loenninger != null ? Math.abs(latest.kf.loenninger) + Math.abs(latest.kf.direkte_omkostninger || 0) : null,
          result: latest.kf.resultat_foer_skat ?? null,
          bank: latest.kf.bank_balance ?? null,
          period: latest.period,
        });
      }
    };

    loadKPIs();
  }, [user]);

  const firstName = profile?.full_name?.split(" ")[0] || "dig";
  const now = new Date();
  const currentMonthName = DANISH_MONTHS[now.getMonth()].toLowerCase();
  const currentYear = now.getFullYear();

  const revenueChange = pctChange(kpiData.revenue ?? undefined, kpiData.revenuePrev ?? undefined);

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
          Godmorgen, {firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Her er dit overblik for {currentMonthName} {currentYear}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KPICard
          title="Omsætning"
          value={kpiData.revenue != null ? formatDKK(kpiData.revenue) : "—"}
          change={revenueChange != null ? `${revenueChange >= 0 ? "+" : ""}${revenueChange.toFixed(1)}%` : undefined}
          trend={revenueChange != null ? (revenueChange >= 0 ? "up" : "down") : "neutral"}
          subtitle={kpiData.period ? `fra ${kpiData.period}` : "Upload rapport"}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title="Udgifter"
          value={kpiData.expenses != null ? formatDKK(kpiData.expenses) : "—"}
          subtitle="løn + direkte omk."
          icon={<Flame className="h-4 w-4" />}
        />
        <KPICard
          title="Resultat"
          value={kpiData.result != null ? formatDKK(kpiData.result) : "—"}
          trend={kpiData.result != null ? (kpiData.result >= 0 ? "up" : "down") : "neutral"}
          subtitle="før skat"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KPICard
          title="Bank"
          value={kpiData.bank != null ? formatDKK(kpiData.bank) : "—"}
          subtitle="saldo"
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <div className="mb-6">
        <AttentionNeeded />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <RevenueChart />
          <RecentReports />
        </div>
        <div className="space-y-6">
          <PerformanceScore />
          <ActivityFeed />
          <BudgetOverview />
          <MilestonesList userId={user?.id} conversationId={conversationId} />
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
