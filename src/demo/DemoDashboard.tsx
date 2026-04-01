import { TrendingUp, TrendingDown, Banknote, Receipt, Sparkles, CalendarCheck, Upload } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DEMO_FACTS, DEMO_MILESTONES, DEMO_USER, CATEGORY_LABELS } from "./demoData";
import { formatDKK } from "@/lib/financialUtils";

const TOOLTIP_STYLE = {
  contentStyle: { background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--muted-foreground))" },
};

function pctChange(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export default function DemoDashboard() {
  const latest = DEMO_FACTS[DEMO_FACTS.length - 1];
  const prev = DEMO_FACTS[DEMO_FACTS.length - 2];
  const expenses = latest.revenue - latest.ebitda;

  const revChange = pctChange(latest.revenue, prev.revenue);
  const ebitdaChange = pctChange(latest.ebitda, prev.ebitda);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Godmorgen";
    if (h < 18) return "God eftermiddag";
    return "God aften";
  })();

  const kpis = [
    { label: "Omsætning", value: formatDKK(latest.revenue), change: revChange, icon: TrendingUp, positive: true },
    { label: "EBITDA", value: formatDKK(latest.ebitda), change: ebitdaChange, icon: TrendingUp, positive: true },
    { label: "Bank", value: formatDKK(latest.cash), change: null, icon: Banknote, positive: true },
    { label: "Udgifter", value: formatDKK(expenses), change: null, icon: Receipt, positive: false },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">
        {greeting}, {DEMO_USER.split(" ")[0]}
      </h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <k.icon className="h-3.5 w-3.5" />
                {k.label}
              </div>
              <p className="text-lg font-bold text-foreground">{k.value}</p>
              {k.change != null && (
                <p className={`text-xs mt-0.5 ${k.change >= 0 ? "text-[hsl(var(--chart-positive))]" : "text-[hsl(var(--chart-negative))]"}`}>
                  {k.change >= 0 ? "+" : ""}{k.change.toFixed(1)}% M/M
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue chart */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Omsætning — 12 måneder</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
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
              <Tooltip formatter={(v: number) => formatDKK(v)} {...TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-positive))" fill="url(#demoRevGrad)" strokeWidth={2} name="Omsætning" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Milestones */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Milestones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {DEMO_MILESTONES.map((m) => (
              <div key={m.title} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{m.title}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{CATEGORY_LABELS[m.category]}</span>
                </div>
                <Progress value={m.progress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{m.current} / {m.target}</span>
                  <span>{m.deadline}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* AI focus + actions */}
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-[hsl(var(--chart-warning))]" /> AI Ugefokus
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground leading-relaxed">
                Stærk afslutning på 2025 — December er årets bedste måned med 342.000 kr. i omsætning og 20,4% EBITDA-margin. Fokus denne uge: forbered Q1 2026-strategi og evaluer om det er tid til at ansætte CSM'en.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Handlinger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Upload className="h-4 w-4 text-[hsl(var(--chart-warning))] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Marts-rapport mangler</p>
                  <p className="text-xs text-muted-foreground">Upload din saldobalance</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <CalendarCheck className="h-4 w-4 text-[hsl(var(--chart-info))] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Næste møde: 30. april 2026</p>
                  <p className="text-xs text-muted-foreground">Forbered Q1-opsamling</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
