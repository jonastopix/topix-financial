import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Target, Flame, BarChart3, Users, Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { DEMO_FACTS } from "./demoData";
import { formatDKK } from "@/lib/financialUtils";

const TT = {
  contentStyle: { background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--muted-foreground))" },
};

interface KPIDef {
  key: string; label: string; unit: "DKK" | "%"; icon: React.ElementType;
  description: string; lowerIsBetter: boolean;
  extract: (f: (typeof DEMO_FACTS)[0]) => number;
  target: number; targetLabel: string; benchmark: number; benchmarkLabel: string;
}

const KPI_DEFS: KPIDef[] = [
  { key: "omsaetning", label: "Omsætning", unit: "DKK", icon: DollarSign, description: "Månedlig omsætning", lowerIsBetter: false, extract: (f) => f.revenue, target: 400000, targetLabel: "Mål: 400.000 kr.", benchmark: 280000, benchmarkLabel: "Branche gns." },
  { key: "ebitda", label: "EBITDA", unit: "DKK", icon: Flame, description: "Resultat før renter, skat og afskrivninger", lowerIsBetter: false, extract: (f) => f.ebitda, target: 60000, targetLabel: "Mål: 60.000 kr.", benchmark: 35000, benchmarkLabel: "Branche gns." },
  { key: "db_margin", label: "DB Margin", unit: "%", icon: TrendingUp, description: "Dækningsgrad (brutto profit / omsætning)", lowerIsBetter: false, extract: (f) => Math.round((f.gross_profit / f.revenue) * 1000) / 10, target: 90, targetLabel: "Mål: 90%", benchmark: 72, benchmarkLabel: "Branche gns." },
  { key: "loenninger", label: "Lønninger", unit: "DKK", icon: Users, description: "Månedlige lønomkostninger", lowerIsBetter: true, extract: (f) => f.payroll, target: 160000, targetLabel: "Maks: 160.000 kr.", benchmark: 120000, benchmarkLabel: "Branche gns." },
  { key: "resultat", label: "Resultat", unit: "DKK", icon: Target, description: "Resultat før skat", lowerIsBetter: false, extract: (f) => f.revenue - f.expenses, target: 50000, targetLabel: "Mål: 50.000 kr.", benchmark: 20000, benchmarkLabel: "Branche gns." },
  { key: "ebitda_margin", label: "Resultat Margin", unit: "%", icon: BarChart3, description: "EBITDA i % af omsætning", lowerIsBetter: false, extract: (f) => Math.round((f.ebitda / f.revenue) * 1000) / 10, target: 20, targetLabel: "Mål: 20%", benchmark: 12, benchmarkLabel: "Branche gns." },
];

function fmt(value: number, unit: "DKK" | "%") {
  return unit === "DKK" ? formatDKK(value) : `${value.toFixed(1)}%`;
}
function getScoreColor(score: number) {
  if (score >= 75) return "text-primary";
  if (score >= 50) return "text-chart-warning";
  return "text-destructive";
}
function getScoreBg(score: number) {
  if (score >= 75) return "bg-primary";
  if (score >= 50) return "bg-chart-warning";
  return "bg-destructive";
}

const PERF_METRICS = [
  { label: "Vækstrate", value: "+14,8%", score: 80, detail: "Omsætningsvækst M/M" },
  { label: "Bruttomargin", value: "92,0%", score: 95, detail: "Dækningsgrad" },
  { label: "Nettoresultat", value: "1,2%", score: 42, detail: "Overskudsgrad" },
  { label: "Likviditet", value: "248k", score: 71, detail: "Banksaldo vs. 6 mdr. løn" },
];

function PerformanceScore() {
  const perfScore = 72;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (perfScore / 100) * circumference;
  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Performance score</h2>
        </div>
        <span className="text-xs text-muted-foreground">Sund</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex flex-col items-center gap-2">
          <div className="relative h-[128px] w-[128px]">
            <svg width="128" height="128" className="-rotate-90">
              <circle cx="64" cy="64" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
              <circle cx="64" cy="64" r={radius} fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-foreground">{perfScore}</span>
              <span className="text-xs text-muted-foreground">Sund</span>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-3">
          {PERF_METRICS.map((metric) => (
            <div key={metric.label} className="flex items-start gap-3">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${metric.score >= 75 ? "bg-primary/10" : metric.score >= 50 ? "bg-chart-warning/10" : "bg-destructive/10"}`}>
                <Activity className={`h-4 w-4 ${getScoreColor(metric.score)}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{metric.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{metric.value}</span>
                    <span className={`text-xs ${getScoreColor(metric.score)}`}>{metric.score}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full mt-1.5">
                  <div className={`h-full rounded-full transition-all ${getScoreBg(metric.score)}`} style={{ width: `${metric.score}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{metric.detail}</p>
                {metric.score < 50 && <p className="text-xs text-destructive mt-0.5">Under gennemsnit — se AI-analysen</p>}
                {metric.score >= 50 && metric.score < 70 && <p className="text-xs text-chart-warning mt-0.5">Plads til forbedring</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KPIOverviewCards({ onSelect, selected }: { onSelect: (key: string) => void; selected: string }) {
  const latest = DEMO_FACTS[DEMO_FACTS.length - 1];
  const prev = DEMO_FACTS[DEMO_FACTS.length - 2];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {KPI_DEFS.map((kpi) => {
        const value = kpi.extract(latest);
        const prevVal = kpi.extract(prev);
        const change = prevVal ? ((value - prevVal) / Math.abs(prevVal)) * 100 : 0;
        const atTarget = kpi.lowerIsBetter ? value <= kpi.target : value >= kpi.target;
        const Icon = kpi.icon;
        const isSelected = selected === kpi.key;
        return (
          <button key={kpi.key} onClick={() => onSelect(kpi.key)} className={`glass-card rounded-xl p-4 text-left border-l-2 border-l-primary transition-all hover:shadow-md ${isSelected ? "ring-2 ring-primary/20" : "opacity-80 hover:opacity-100"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              {atTarget ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-chart-warning" />}
            </div>
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="text-lg font-bold text-foreground">{fmt(value, kpi.unit)}</p>
            <span className={`inline-flex items-center gap-1 text-xs font-medium mt-1 px-1.5 py-0.5 rounded ${change >= 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
              {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {change >= 0 ? "+" : ""}{change.toFixed(1)}% M/M
            </span>
          </button>
        );
      })}
    </div>
  );
}

function KPIDetail({ kpiKey }: { kpiKey: string }) {
  const kpi = KPI_DEFS.find((k) => k.key === kpiKey)!;
  const chartData = DEMO_FACTS.map((f) => ({
    period: f.period.slice(0, 3) + " '" + f.period.slice(-2),
    value: kpi.extract(f),
  }));
  const latest = chartData[chartData.length - 1];
  const atTarget = kpi.lowerIsBetter ? latest.value <= kpi.target : latest.value >= kpi.target;
  const pctTarget = Math.min(Math.round((latest.value / kpi.target) * 100), 150);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card rounded-xl p-5 border-l-2 border-l-primary">
          <p className="text-xs text-muted-foreground mb-1">Nuværende (Dec 2025)</p>
          <p className="text-2xl font-bold text-foreground">{fmt(latest.value, kpi.unit)}</p>
        </div>
        <div className="glass-card rounded-xl p-5 border-l-2 border-l-chart-info">
          <p className="text-xs text-muted-foreground mb-1">Mål</p>
          <p className="text-2xl font-bold text-foreground">{fmt(kpi.target, kpi.unit)}</p>
          <span className={`inline-block mt-1 text-xs font-medium ${atTarget ? "text-primary" : "text-chart-warning"}`}>
            {atTarget ? "✓ Nået" : `${pctTarget}% af mål`}
          </span>
        </div>
        <div className="glass-card rounded-xl p-5 border-l-2 border-l-chart-warning">
          <p className="text-xs text-muted-foreground mb-1">Branche gns.</p>
          <p className="text-2xl font-bold text-foreground">{fmt(kpi.benchmark, kpi.unit)}</p>
          <p className={`text-xs font-medium mt-1 ${kpi.lowerIsBetter ? (latest.value < kpi.benchmark ? "text-primary" : "text-destructive") : (latest.value > kpi.benchmark ? "text-primary" : "text-destructive")}`}>
            {kpi.lowerIsBetter ? (latest.value < kpi.benchmark ? "Under branche" : "Over branche") : (latest.value > kpi.benchmark ? "Over branche" : "Under branche")}
          </p>
        </div>
      </div>
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">{kpi.label} — 12 måneder</h3>
        <p className="text-xs text-muted-foreground mb-4">{kpi.description}</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradKPI" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => kpi.unit === "DKK" ? `${(v / 1000).toFixed(0)}k` : `${v}%`} />
              <Tooltip formatter={(v: number) => [fmt(v, kpi.unit), kpi.label]} {...TT} />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#gradKPI)" strokeWidth={2} />
              <ReferenceLine y={kpi.target} stroke="hsl(var(--chart-positive))" strokeDasharray="4 4" label={{ value: kpi.targetLabel, fill: "hsl(var(--chart-positive))", fontSize: 11 }} />
              <ReferenceLine y={kpi.benchmark} stroke="hsl(var(--chart-warning))" strokeDasharray="4 4" label={{ value: kpi.benchmarkLabel, fill: "hsl(var(--chart-warning))", fontSize: 11 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function DemoKPIs() {
  const [selectedKPI, setSelectedKPI] = useState("omsaetning");
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">KPIs</h1>
        <span className="text-sm text-muted-foreground">December 2025</span>
      </div>
      <PerformanceScore />
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Klik på en KPI for at se detaljer</p>
        <KPIOverviewCards onSelect={setSelectedKPI} selected={selectedKPI} />
      </div>
      <KPIDetail kpiKey={selectedKPI} />
    </div>
  );
}
