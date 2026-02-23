import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Target,
  Flame,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface KPIMetric {
  key: string;
  label: string;
  value: string;
  numValue: number;
  target: string;
  targetNum: number;
  change: string;
  changePct: number;
  trend: "up" | "down";
  unit: string;
  icon: any;
  description: string;
  history: { month: string; value: number }[];
  benchmark?: { label: string; value: number };
}

const kpiMetrics: KPIMetric[] = [
  {
    key: "mrr",
    label: "MRR",
    value: "115.000",
    numValue: 115000,
    target: "120.000",
    targetNum: 120000,
    change: "+17,3%",
    changePct: 17.3,
    trend: "up",
    unit: "DKK",
    icon: DollarSign,
    description: "Monthly Recurring Revenue",
    history: [
      { month: "Sep", value: 42000 },
      { month: "Okt", value: 58000 },
      { month: "Nov", value: 71000 },
      { month: "Dec", value: 85000 },
      { month: "Jan", value: 98000 },
      { month: "Feb", value: 115000 },
    ],
    benchmark: { label: "Benchmark (SaaS Q1)", value: 95000 },
  },
  {
    key: "customers",
    label: "Aktive kunder",
    value: "87",
    numValue: 87,
    target: "100",
    targetNum: 100,
    change: "+16%",
    changePct: 16,
    trend: "up",
    unit: "",
    icon: Users,
    description: "Betalende kunder",
    history: [
      { month: "Sep", value: 45 },
      { month: "Okt", value: 52 },
      { month: "Nov", value: 60 },
      { month: "Dec", value: 68 },
      { month: "Jan", value: 75 },
      { month: "Feb", value: 87 },
    ],
    benchmark: { label: "Mål Q1", value: 100 },
  },
  {
    key: "churn",
    label: "Churn Rate",
    value: "2,8%",
    numValue: 2.8,
    target: "< 2,5%",
    targetNum: 2.5,
    change: "-0,2pp",
    changePct: -7.1,
    trend: "up",
    unit: "%",
    icon: TrendingDown,
    description: "Månedlig churn",
    history: [
      { month: "Sep", value: 5.2 },
      { month: "Okt", value: 4.8 },
      { month: "Nov", value: 4.1 },
      { month: "Dec", value: 3.5 },
      { month: "Jan", value: 3.0 },
      { month: "Feb", value: 2.8 },
    ],
    benchmark: { label: "Best-in-class SaaS", value: 2.0 },
  },
  {
    key: "ltv",
    label: "LTV",
    value: "42.000",
    numValue: 42000,
    target: "50.000",
    targetNum: 50000,
    change: "+8%",
    changePct: 8,
    trend: "up",
    unit: "DKK",
    icon: Target,
    description: "Customer Lifetime Value",
    history: [
      { month: "Sep", value: 28000 },
      { month: "Okt", value: 31000 },
      { month: "Nov", value: 34000 },
      { month: "Dec", value: 37000 },
      { month: "Jan", value: 39000 },
      { month: "Feb", value: 42000 },
    ],
  },
  {
    key: "burn",
    label: "Burn Rate",
    value: "75.000",
    numValue: 75000,
    target: "< 70.000",
    targetNum: 70000,
    change: "-4,2%",
    changePct: -4.2,
    trend: "up",
    unit: "DKK/mdr",
    icon: Flame,
    description: "Månedlig cash burn",
    history: [
      { month: "Sep", value: 88000 },
      { month: "Okt", value: 85000 },
      { month: "Nov", value: 82000 },
      { month: "Dec", value: 80000 },
      { month: "Jan", value: 78000 },
      { month: "Feb", value: 75000 },
    ],
  },
  {
    key: "runway",
    label: "Runway",
    value: "14",
    numValue: 14,
    target: "> 12",
    targetNum: 12,
    change: "+2 mdr.",
    changePct: 16.7,
    trend: "up",
    unit: "måneder",
    icon: BarChart3,
    description: "Ved nuværende burn rate",
    history: [
      { month: "Sep", value: 8 },
      { month: "Okt", value: 9 },
      { month: "Nov", value: 10 },
      { month: "Dec", value: 11 },
      { month: "Jan", value: 12 },
      { month: "Feb", value: 14 },
    ],
    benchmark: { label: "Anbefalet minimum", value: 12 },
  },
];

function getTargetStatus(metric: KPIMetric): { hit: boolean; pct: number } {
  const isLowerBetter = metric.key === "churn" || metric.key === "burn";
  const hit = isLowerBetter
    ? metric.numValue <= metric.targetNum
    : metric.numValue >= metric.targetNum;
  const pct = isLowerBetter
    ? Math.min((metric.targetNum / metric.numValue) * 100, 100)
    : Math.min((metric.numValue / metric.targetNum) * 100, 100);
  return { hit, pct };
}

const tooltipStyle = {
  background: "hsl(220, 25%, 9%)",
  border: "1px solid hsl(220, 20%, 14%)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(220, 10%, 90%)",
};

const KPIs = () => {
  const [selectedKPI, setSelectedKPI] = useState<string>("mrr");
  const activeMetric = kpiMetrics.find((m) => m.key === selectedKPI)!;
  const targetStatus = getTargetStatus(activeMetric);

  const hitsCount = kpiMetrics.filter((m) => getTargetStatus(m).hit).length;

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          KPI'er
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Følg dine vigtigste nøgletal mod targets
        </p>
      </div>

      {/* Target progress banner */}
      <div className="glass-card rounded-xl p-5 mb-6 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-display font-semibold text-foreground text-sm">Target Oversigt</h3>
              <p className="text-xs text-muted-foreground">{hitsCount} af {kpiMetrics.length} targets nået</p>
            </div>
          </div>
          <span className={`text-xl font-display font-bold ${hitsCount >= 4 ? "text-primary" : "text-chart-warning"}`}>
            {Math.round((hitsCount / kpiMetrics.length) * 100)}%
          </span>
        </div>
        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700"
            style={{ width: `${(hitsCount / kpiMetrics.length) * 100}%` }}
          />
        </div>
      </div>

      {/* KPI cards grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {kpiMetrics.map((metric) => {
          const Icon = metric.icon;
          const status = getTargetStatus(metric);
          const isSelected = selectedKPI === metric.key;

          return (
            <button
              key={metric.key}
              onClick={() => setSelectedKPI(metric.key)}
              className={`glass-card rounded-xl p-4 text-left transition-all animate-fade-in ${
                isSelected ? "border-primary/40 ring-1 ring-primary/20" : "hover:border-primary/20"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">{metric.label}</span>
                </div>
                {status.hit ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-chart-warning" />
                )}
              </div>
              <p className="text-lg font-display font-bold text-foreground">
                {metric.value} <span className="text-xs font-normal text-muted-foreground">{metric.unit}</span>
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  metric.trend === "up" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                }`}>
                  {metric.trend === "up" ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                  {metric.change}
                </span>
              </div>
              {/* Mini sparkline via progress bar */}
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-0.5">
                  <span>Mål: {metric.target}</span>
                  <span>{Math.round(status.pct)}%</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${status.hit ? "bg-primary" : "bg-chart-warning"}`}
                    style={{ width: `${status.pct}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail view */}
      <div className="glass-card rounded-xl p-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
          <div className="flex items-center gap-3">
            <activeMetric.icon className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-display font-semibold text-foreground">
                {activeMetric.label} Trend
              </h3>
              <p className="text-xs text-muted-foreground">{activeMetric.description} · Sidste 6 måneder</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Nuværende</p>
              <p className="text-lg font-display font-bold text-foreground">{activeMetric.value}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Target</p>
              <p className={`text-lg font-display font-bold ${targetStatus.hit ? "text-primary" : "text-chart-warning"}`}>
                {activeMetric.target}
              </p>
            </div>
          </div>
        </div>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activeMetric.history} margin={{ top: 10, right: 10, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="kpiGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 14%)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: "hsl(220, 10%, 46%)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "hsl(220, 10%, 46%)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              {activeMetric.benchmark && (
                <ReferenceLine
                  y={activeMetric.benchmark.value}
                  stroke="hsl(38, 92%, 50%)"
                  strokeDasharray="6 4"
                  label={{
                    value: activeMetric.benchmark.label,
                    position: "insideTopRight",
                    fill: "hsl(38, 92%, 50%)",
                    fontSize: 10,
                  }}
                />
              )}
              <ReferenceLine
                y={activeMetric.targetNum}
                stroke="hsl(160, 84%, 39%)"
                strokeDasharray="4 2"
                label={{
                  value: `Target: ${activeMetric.target}`,
                  position: "insideBottomRight",
                  fill: "hsl(160, 84%, 39%)",
                  fontSize: 10,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(160, 84%, 39%)"
                strokeWidth={2.5}
                fill="url(#kpiGradient)"
                name={activeMetric.label}
                dot={{ r: 4, fill: "hsl(160, 84%, 39%)", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "hsl(160, 84%, 39%)", strokeWidth: 2, stroke: "hsl(220, 25%, 9%)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Period comparison table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Måned</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Værdi</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Ændring</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">vs. Target</th>
              </tr>
            </thead>
            <tbody>
              {activeMetric.history.map((point, i) => {
                const prev = i > 0 ? activeMetric.history[i - 1].value : point.value;
                const change = prev !== 0 ? ((point.value - prev) / Math.abs(prev)) * 100 : 0;
                const isLowerBetter = activeMetric.key === "churn" || activeMetric.key === "burn";
                const vsTarget = isLowerBetter
                  ? point.value <= activeMetric.targetNum
                  : point.value >= activeMetric.targetNum;

                return (
                  <tr key={point.month} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="py-2 px-2 text-foreground font-medium">{point.month}</td>
                    <td className="py-2 px-2 text-right font-display text-foreground">
                      {typeof point.value === "number" && point.value > 1000
                        ? `${(point.value / 1000).toFixed(0)}k`
                        : point.value}
                    </td>
                    <td className={`py-2 px-2 text-right font-display text-xs ${
                      i === 0 ? "text-muted-foreground" : change > 0 ? "text-primary" : "text-destructive"
                    }`}>
                      {i === 0 ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {vsTarget ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary inline-block" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-chart-warning inline-block" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
};

export default KPIs;
