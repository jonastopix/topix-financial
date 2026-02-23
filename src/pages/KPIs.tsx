import { useState, useEffect, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Flame,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Users,
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
import { getKeyFigures, parseReportPeriodToKey, formatCompact, SHORT_MONTHS } from "@/lib/financialUtils";
import type { ReportData } from "@/lib/financialUtils";

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
  lowerIsBetter: boolean;
  history: { month: string; value: number }[];
}

// Default targets — users can adjust later
const DEFAULT_TARGETS: Record<string, { target: number; label: string }> = {
  omsaetning: { target: 120000, label: "120.000" },
  db_margin: { target: 60, label: "60%" },
  loenninger: { target: 50000, label: "< 50.000" },
  resultat: { target: 10000, label: "10.000" },
  omkostninger: { target: 80000, label: "< 80.000" },
  ebitda_margin: { target: 15, label: "15%" },
};

const tooltipStyle = {
  background: "hsl(220, 25%, 9%)",
  border: "1px solid hsl(220, 20%, 14%)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(220, 10%, 90%)",
};

const KPIs = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKPI, setSelectedKPI] = useState<string>("omsaetning");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("financial_reports")
        .select("id, report_period, extracted_data, status")
        .eq("user_id", user.id)
        .eq("status", "processed")
        .order("uploaded_at", { ascending: true });
      setReports(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  // Build sorted monthly data points
  const monthlyData = useMemo(() => {
    const byKey = new Map<string, { sortKey: string; month: string; kf: Record<string, number> }>();

    reports.forEach((r) => {
      const kf = getKeyFigures(r);
      if (!kf) return;
      const key = parseReportPeriodToKey(r.report_period);
      if (!key) return;

      // Parse month label
      const [, monthStr] = key.split("-");
      const monthIdx = parseInt(monthStr, 10) - 1;
      const monthLabel = SHORT_MONTHS[monthIdx] || monthStr;

      byKey.set(key, { sortKey: key, month: monthLabel, kf });
    });

    return Array.from(byKey.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [reports]);

  // Derive KPI metrics from monthly data
  const kpiMetrics: KPIMetric[] = useMemo(() => {
    if (monthlyData.length === 0) return [];

    const latest = monthlyData[monthlyData.length - 1].kf;
    const prev = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].kf : null;

    const mkMetric = (
      key: string,
      label: string,
      extractValue: (kf: Record<string, number>) => number,
      unit: string,
      icon: any,
      description: string,
      lowerIsBetter = false
    ): KPIMetric => {
      const currentVal = extractValue(latest);
      const prevVal = prev ? extractValue(prev) : currentVal;
      const changePct = prevVal !== 0 ? ((currentVal - prevVal) / Math.abs(prevVal)) * 100 : 0;
      const target = DEFAULT_TARGETS[key];
      const trendIsGood = lowerIsBetter ? changePct <= 0 : changePct >= 0;

      const history = monthlyData.map((d) => ({
        month: d.month,
        value: Math.round(extractValue(d.kf)),
      }));

      const formatted = Math.abs(currentVal) >= 1000
        ? currentVal.toLocaleString("da-DK", { maximumFractionDigits: 0 })
        : currentVal.toFixed(1);

      return {
        key,
        label,
        value: formatted,
        numValue: currentVal,
        target: target?.label || "—",
        targetNum: target?.target || 0,
        change: `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`,
        changePct,
        trend: trendIsGood ? "up" : "down",
        unit,
        icon,
        description,
        lowerIsBetter,
        history,
      };
    };

    return [
      mkMetric("omsaetning", "Omsætning", (kf) => kf.omsaetning || 0, "DKK", DollarSign, "Månedlig omsætning"),
      mkMetric("db_margin", "DB Margin", (kf) => {
        const rev = kf.omsaetning || 0;
        const direct = kf.direkte_omkostninger || 0;
        return rev > 0 ? ((rev - Math.abs(direct)) / rev) * 100 : 0;
      }, "%", TrendingUp, "Dækningsgrad (Omsætning − direkte omk.)"),
      mkMetric("loenninger", "Lønninger", (kf) => Math.abs(kf.loenninger || 0), "DKK", Users, "Månedlige lønomkostninger", true),
      mkMetric("resultat", "Resultat", (kf) => kf.resultat_foer_skat || 0, "DKK", Target, "Resultat før skat"),
      mkMetric("omkostninger", "Omk. total", (kf) => {
        return Math.abs(kf.direkte_omkostninger || 0) + Math.abs(kf.loenninger || 0) +
          Math.abs(kf.andre_eksterne_omkostninger || 0);
      }, "DKK", Flame, "Samlede omkostninger", true),
      mkMetric("ebitda_margin", "EBITDA Margin", (kf) => {
        const rev = kf.omsaetning || 0;
        const result = kf.resultat_foer_skat || 0;
        return rev > 0 ? (result / rev) * 100 : 0;
      }, "%", BarChart3, "Resultat i % af omsætning"),
    ];
  }, [monthlyData]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (kpiMetrics.length === 0) {
    return (
      <AppLayout>
        <div className="mb-8">
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            KPI'er
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Følg dine vigtigste nøgletal mod targets</p>
        </div>
        <div className="glass-card rounded-xl p-12 text-center animate-fade-in">
          <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Ingen rapportdata endnu</p>
          <p className="text-xs text-muted-foreground mt-1">Upload din første rapport under Rapportering for at se KPI'er her</p>
        </div>
      </AppLayout>
    );
  }

  const activeMetric = kpiMetrics.find((m) => m.key === selectedKPI) || kpiMetrics[0];

  function getTargetStatus(metric: KPIMetric): { hit: boolean; pct: number } {
    if (!metric.targetNum) return { hit: false, pct: 0 };
    const hit = metric.lowerIsBetter
      ? metric.numValue <= metric.targetNum
      : metric.numValue >= metric.targetNum;
    const pct = metric.lowerIsBetter
      ? Math.min((metric.targetNum / Math.max(metric.numValue, 1)) * 100, 100)
      : Math.min((metric.numValue / metric.targetNum) * 100, 100);
    return { hit, pct };
  }

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
          Følg dine vigtigste nøgletal mod targets · baseret på {monthlyData.length} rapporter
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
              {metric.targetNum > 0 && (
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
              )}
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
              <p className="text-xs text-muted-foreground">{activeMetric.description} · {monthlyData.length} perioder</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Nuværende</p>
              <p className="text-lg font-display font-bold text-foreground">{activeMetric.value}</p>
            </div>
            {activeMetric.targetNum > 0 && (
              <>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className={`text-lg font-display font-bold ${targetStatus.hit ? "text-primary" : "text-chart-warning"}`}>
                    {activeMetric.target}
                  </p>
                </div>
              </>
            )}
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
              {activeMetric.targetNum > 0 && (
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
              )}
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
                {activeMetric.targetNum > 0 && (
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">vs. Target</th>
                )}
              </tr>
            </thead>
            <tbody>
              {activeMetric.history.map((point, i) => {
                const prev = i > 0 ? activeMetric.history[i - 1].value : point.value;
                const change = prev !== 0 ? ((point.value - prev) / Math.abs(prev)) * 100 : 0;
                const vsTarget = activeMetric.lowerIsBetter
                  ? point.value <= activeMetric.targetNum
                  : point.value >= activeMetric.targetNum;

                return (
                  <tr key={point.month} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="py-2 px-2 text-foreground font-medium">{point.month}</td>
                    <td className="py-2 px-2 text-right font-display text-foreground">
                      {point.value > 1000 ? formatCompact(point.value) : point.value.toFixed(1)}
                    </td>
                    <td className={`py-2 px-2 text-right font-display text-xs ${
                      i === 0 ? "text-muted-foreground" : change > 0 ? "text-primary" : "text-destructive"
                    }`}>
                      {i === 0 ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
                    </td>
                    {activeMetric.targetNum > 0 && (
                      <td className="py-2 px-2 text-right">
                        {vsTarget ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary inline-block" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-chart-warning inline-block" />
                        )}
                      </td>
                    )}
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
