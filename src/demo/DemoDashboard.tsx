import { DollarSign, TrendingUp, Flame, Wallet, Sparkles, FileText, Target, Upload, MessageSquare, Activity, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import KPICard from "@/components/KPICard";
import { Progress } from "@/components/ui/progress";
import { DEMO_FACTS, DEMO_MILESTONES, CATEGORY_LABELS } from "./demoData";
import { formatDKK } from "@/lib/financialUtils";

const TOOLTIP_STYLE = {
  contentStyle: { background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--muted-foreground))" },
};

export default function DemoDashboard() {
  const latest = DEMO_FACTS[11];
  const prev = DEMO_FACTS[10];
  const pct = (c: number, p: number) => p ? ((c - p) / Math.abs(p) * 100) : 0;
  const revChange = pct(latest.revenue, prev.revenue);
  const ebitdaChange = pct(latest.ebitda, prev.ebitda);
  const h = new Date().getHours();
  const greeting = h < 12 ? "Godmorgen" : h < 18 ? "God eftermiddag" : "God aften";
  const sparkRev = DEMO_FACTS.map(f => f.revenue);
  const sparkExp = DEMO_FACTS.map(f => f.expenses);
  const sparkEbitda = DEMO_FACTS.map(f => f.ebitda);
  const sparkCash = DEMO_FACTS.map(f => f.cash);
  const ytdRevenue = DEMO_FACTS.reduce((s, f) => s + f.revenue, 0);

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

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-foreground">
        {greeting}, Morten
      </h1>

      {/* Action center */}
      <div className="space-y-2">
        <div className="glass-card rounded-xl p-4 flex items-start gap-3 border-l-2 border-l-chart-warning">
          <div className="p-2 rounded-lg bg-chart-warning/10">
            <Upload className="h-4 w-4 text-chart-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Marts-rapport mangler</p>
            <p className="text-xs text-muted-foreground">Upload din saldobalance for Marts 2026</p>
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">1d</span>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-start gap-3 border-l-2 border-l-primary">
          <div className="p-2 rounded-lg bg-primary/10">
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Månedlig pulse — 2 minutter</p>
            <p className="text-xs text-muted-foreground">Fortæl os hvad der gik godt og hvad der er din største udfordring</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 flex items-start gap-3 border-l-2 border-l-chart-info">
          <div className="p-2 rounded-lg bg-chart-info/10">
            <MessageSquare className="h-4 w-4 text-chart-info" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">1 ulæst besked fra Jonas Herlev</p>
            <p className="text-xs text-muted-foreground truncate">Imponerende december, Morten! Omsætningsvæksten på 88% YoY er stærk…</p>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div>
        <p className="text-xs text-muted-foreground mb-3">Seneste måned · December 2025</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Omsætning" value={formatDKK(latest.revenue)} change={`${revChange >= 0 ? "+" : ""}${revChange.toFixed(1)}% M/M`} trend={revChange >= 0 ? "up" : "down"} sparkline={sparkRev} ytdLine={`YTD: ${formatDKK(ytdRevenue)}`} icon={<DollarSign className="h-4 w-4" />} accentColor="emerald" />
          <KPICard title="EBITDA" value={formatDKK(latest.ebitda)} change={`${ebitdaChange >= 0 ? "+" : ""}${ebitdaChange.toFixed(1)}% M/M`} trend={ebitdaChange >= 0 ? "up" : "down"} sparkline={sparkEbitda} icon={<Flame className="h-4 w-4" />} accentColor="amber" />
          <KPICard title="Bank" value={formatDKK(latest.cash)} sparkline={sparkCash} icon={<Wallet className="h-4 w-4" />} accentColor="emerald" />
          <KPICard title="Udgifter" value={formatDKK(latest.expenses)} sparkline={sparkExp} icon={<TrendingUp className="h-4 w-4" />} accentColor="blue" />
        </div>
      </div>

      {/* Performance score + Revenue chart */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Performance score */}
        <div className="glass-card rounded-xl p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-foreground">Virksomhedens sundhed</h3>
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
            <div className="flex-1 space-y-1.5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Din samlede forretningssundhed baseret på vækst, marginer, resultat og likviditet.
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Du klarer dig godt på tværs af de fire områder.
              </p>
            </div>
          </div>

          <div className="space-y-3">
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
                  <p className="text-[10px] text-muted-foreground mt-0.5">{metric.detail}</p>
                  {metric.score < 40 && <p className="text-[10px] text-destructive mt-0.5">Under gennemsnit — se AI-analysen for forslag</p>}
                  {metric.score >= 40 && metric.score < 70 && <p className="text-[10px] text-chart-warning mt-0.5">Plads til forbedring</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue chart */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Omsætning — 12 måneder</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={DEMO_FACTS}>
                <defs>
                  <linearGradient id="demoRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-positive))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--chart-positive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatDKK(v), "Omsætning"]} {...TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-positive))" fill="url(#demoRevGrad)" strokeWidth={2} name="Omsætning" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3-col bottom */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Milestones widget */}
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Milestones</h3>
            <Link to="/demo/milestones" className="text-xs text-primary hover:underline">Se alle →</Link>
          </div>
          {DEMO_MILESTONES.slice(0, 2).map(m => (
            <div key={m.title} className="mb-3 last:mb-0">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-foreground truncate">{m.title}</p>
                <span className="text-[10px] font-bold text-muted-foreground">{m.progress}%</span>
              </div>
              <Progress value={m.progress} className="h-1.5" />
            </div>
          ))}
        </div>

        {/* Handouts widget */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Handouts fra board</h3>
          <div className="space-y-3">
            {[
              { title: "Q4 2025 strateginotat", date: "15. jan 2026", tag: "Strategi" },
              { title: "Skaleringsanalyse — SaaS", date: "8. dec 2025", tag: "Vækst" },
            ].map(ho => (
              <div key={ho.title} className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{ho.title}</p>
                  <p className="text-[10px] text-muted-foreground">{ho.date} · {ho.tag}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Budget widget */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Budget — December 2025</h3>
          {[
            { label: "Omsætning", budget: 320000, actual: 342000, favorable: true },
            { label: "Udgifter", budget: 250000, actual: 272080, favorable: false },
            { label: "EBITDA", budget: 70000, actual: 69920, favorable: false },
          ].map(r => {
            const diff = r.actual - r.budget;
            const diffPct = ((diff / r.budget) * 100).toFixed(0);
            return (
              <div key={r.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-xs text-muted-foreground">{r.label}</span>
                <div className="text-right">
                  <p className="text-xs font-semibold text-foreground">{formatDKK(r.actual)}</p>
                  <p className={`text-[10px] font-medium ${r.favorable ? "text-[hsl(var(--chart-positive))]" : "text-[hsl(var(--chart-negative))]"}`}>
                    {diff >= 0 ? "+" : ""}{diffPct}% vs budget
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI analysis teaser */}
      <div className="glass-card rounded-xl p-5 border-l-2 border-l-primary">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Din AI-analyse er klar</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Stærk afslutning på 2025 — December er årets bedste måned med 342.000 kr. i omsætning og 20,4% EBITDA-margin. Fokus denne uge: forbered Q1 2026-strategi og evaluer om det er tid til at ansætte CSM'en.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
