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

const Dashboard = () => {
  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
          Godmorgen, Jonas 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Her er dit overblik for februar 2026
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KPICard
          title="MRR"
          value="115.000 DKK"
          change="+17,3%"
          trend="up"
          subtitle="vs. forrige måned"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title="Kunder"
          value="87"
          change="+12"
          trend="up"
          subtitle="nye denne måned"
          icon={<Users className="h-4 w-4" />}
        />
        <KPICard
          title="Burn Rate"
          value="75.000 DKK"
          change="-4,2%"
          trend="up"
          subtitle="forbedring"
          icon={<Flame className="h-4 w-4" />}
        />
        <KPICard
          title="Runway"
          value="14 mdr."
          change="+2 mdr."
          trend="up"
          subtitle="ved nuværende burn"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* Attention needed */}
      <div className="mb-6">
        <AttentionNeeded />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <RevenueChart />
          <RecentReports />
        </div>
        <div className="space-y-6">
          <PerformanceScore />
          <ActivityFeed />
          <BudgetOverview />
          <MilestonesList />
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
