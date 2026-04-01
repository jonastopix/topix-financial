import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEMO_FACTS } from "./demoData";
import { formatDKK } from "@/lib/financialUtils";

const KPI_CONFIG: Record<string, { label: string; key: keyof typeof DEMO_FACTS[0]; target: number; targetLabel: string }> = {
  revenue: { label: "Omsætning", key: "revenue", target: 400000, targetLabel: "Mål: 400.000 kr." },
  ebitda: { label: "EBITDA", key: "ebitda", target: 60000, targetLabel: "Mål: 60.000 kr." },
  cash: { label: "Bank", key: "cash", target: 200000, targetLabel: "Mål: 200.000 kr." },
};

const TOOLTIP_STYLE = {
  contentStyle: { background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--muted-foreground))" },
};

export default function DemoKPIs() {
  const [selected, setSelected] = useState("revenue");
  const cfg = KPI_CONFIG[selected];
  const latest = DEMO_FACTS[DEMO_FACTS.length - 1];
  const value = latest[cfg.key] as number;
  const atTarget = value >= cfg.target;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">KPIs</h1>
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

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">Nuværende ({latest.period})</p>
            <p className="text-2xl font-bold text-foreground">{formatDKK(value)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">Target</p>
            <p className="text-2xl font-bold text-foreground">{formatDKK(cfg.target)}</p>
            <p className={`text-xs mt-1 ${atTarget ? "text-[hsl(var(--chart-positive))]" : "text-[hsl(var(--chart-warning))]"}`}>
              {atTarget ? "✓ Nået" : `${((value / cfg.target) * 100).toFixed(0)}% af mål`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{cfg.label} — 12 måneder</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
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
              <Area type="monotone" dataKey={cfg.key} stroke="hsl(var(--chart-positive))" fill="url(#demoKpiGrad)" strokeWidth={2} name={cfg.label} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
