import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, TrendingUp } from "lucide-react";
import { DEMO_FACTS } from "./demoData";
import { formatDKK } from "@/lib/financialUtils";

const TOOLTIP_STYLE = {
  contentStyle: { background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--muted-foreground))" },
};

const KPI_CONFIG: Record<string, { label: string; key: keyof typeof DEMO_FACTS[0]; target: number; targetLabel: string; benchmarkLabel: string; benchmark: number }> = {
  revenue: { label: "Omsætning", key: "revenue", target: 400000, targetLabel: "Mål: 400.000 kr.", benchmarkLabel: "Branche gns.", benchmark: 280000 },
  ebitda: { label: "EBITDA", key: "ebitda", target: 60000, targetLabel: "Mål: 60.000 kr.", benchmarkLabel: "Branche gns.", benchmark: 35000 },
  cash: { label: "Bank", key: "cash", target: 200000, targetLabel: "Mål: 200.000 kr.", benchmarkLabel: "Branche gns.", benchmark: 150000 },
};

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

export default function DemoKPIs() {
  const [selected, setSelected] = useState("revenue");
  const cfg = KPI_CONFIG[selected];
  const latest = DEMO_FACTS[DEMO_FACTS.length - 1];
  const value = latest[cfg.key] as number;
  const atTarget = value >= cfg.target;

  const perfScore = 72;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (perfScore / 100) * circumference;

  const perfMetrics = [
    { label: "Vækstrate", value: "+14,8%", score: 80, detail: "Omsætningsvækst M/M" },
    { label: "Bruttomargin", value: "92,0%", score: 95, detail: "Dækningsgrad" },
    { label: "Nettoresultat", value: "1,2%", score: 42, detail: "Overskudsgrad" },
    { label: "Likviditet", value: "248k", score: 71, detail: "Banksaldo vs. 6 mdr. løn" },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">KPIs</h1>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            {Object.entries(KPI_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Performance score */}
      <div className="glass-card rounded-xl p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="font-display font-semibold text-foreground">Performance score</h3>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">Sund</span>
        </div>
        <div className="flex items-center gap-6 mb-5">
          <div className="relative flex-shrink-0">
            <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
              <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
              <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--primary))" strokeWidth="8"
                strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-display font-bold text-primary">{perfScore}</span>
              <span className="text-[10px] text-foreground/60 uppercase tracking-wider">Sund</span>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            {perfMetrics.map((metric) => (
              <div key={metric.label} className="flex items-center gap-3">
                <div className={`p-1.5 rounded-md ${metric.score >= 75 ? "bg-primary/10" : metric.score >= 50 ? "bg-chart-warning/10" : "bg-destructive/10"}`}>
                  <TrendingUp className={`h-3.5 w-3.5 ${getScoreColor(metric.score)}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{metric.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{metric.value}</span>
                      <span className={`text-[10px] font-bold ${getScoreColor(metric.score)}`}>{metric.score}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${getScoreBg(metric.score)}`} style={{ width: `${metric.score}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI value cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl p-5">
          <p className="text-xs text-muted-foreground mb-1">Nuværende ({latest.period})</p>
          <p className="text-2xl font-display font-bold text-foreground">{formatDKK(value)}</p>
        </div>
        <div className="glass-card rounded-xl p-5">
          <p className="text-xs text-muted-foreground mb-1">Target</p>
          <p className="text-2xl font-display font-bold text-foreground">{formatDKK(cfg.target)}</p>
          <p className={`text-xs mt-1 ${atTarget ? "text-[hsl(var(--chart-positive))]" : "text-[hsl(var(--chart-warning))]"}`}>
            {atTarget ? "✓ Nået" : `${((value / cfg.target) * 100).toFixed(0)}% af mål`}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">{cfg.label} — 12 måneder</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={DEMO_FACTS}>
              <defs>
                <linearGradient id="demoKpiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-positive))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--chart-positive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatDKK(v)} {...TOOLTIP_STYLE} />
              <ReferenceLine y={cfg.target} stroke="hsl(var(--chart-warning))" strokeDasharray="6 3" label={{ value: cfg.targetLabel, position: "right", fill: "hsl(var(--chart-warning))", fontSize: 11 }} />
              <ReferenceLine y={cfg.benchmark} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: cfg.benchmarkLabel, position: "left", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <Area type="monotone" dataKey={cfg.key} stroke="hsl(var(--chart-positive))" fill="url(#demoKpiGrad)" strokeWidth={2} name={cfg.label} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
