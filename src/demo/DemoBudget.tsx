import { useState } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { DEMO_FACTS, DEMO_BUDGET } from "./demoData";
import { formatDKK } from "@/lib/financialUtils";
import { TrendingUp, TrendingDown, Wallet, Target, Flame, BarChart3 } from "lucide-react";

const TT = {
  contentStyle: { background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--muted-foreground))" },
};

const TABS = ["Oversigt", "Budget vs. Realiseret", "Prognose", "Cashflow", "Scenarier"] as const;
type Tab = (typeof TABS)[number];

function DiffBadge({ actual, budget, lowerIsBetter = false }: { actual: number; budget: number; lowerIsBetter?: boolean }) {
  const diff = actual - budget;
  const pct = budget ? ((diff / Math.abs(budget)) * 100).toFixed(0) : "0";
  const favorable = lowerIsBetter ? diff <= 0 : diff >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${favorable ? "text-[hsl(var(--chart-positive))]" : "text-destructive"}`}>
      {favorable ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {diff >= 0 ? "+" : ""}{pct}%
    </span>
  );
}

function OverviewTab() {
  const totals = DEMO_BUDGET.reduce(
    (acc, r) => ({ revBudget: acc.revBudget + r.revBudget, revActual: acc.revActual + r.revActual, costBudget: acc.costBudget + r.costBudget, costActual: acc.costActual + r.costActual, ebitdaBudget: acc.ebitdaBudget + r.ebitdaBudget, ebitdaActual: acc.ebitdaActual + r.ebitdaActual }),
    { revBudget: 0, revActual: 0, costBudget: 0, costActual: 0, ebitdaBudget: 0, ebitdaActual: 0 }
  );
  const cards = [
    { label: "Omsætning (Q4)", budget: totals.revBudget, actual: totals.revActual, icon: <TrendingUp className="h-5 w-5" />, lowerIsBetter: false, accent: "border-l-primary" },
    { label: "Omkostninger (Q4)", budget: totals.costBudget, actual: totals.costActual, icon: <Wallet className="h-5 w-5" />, lowerIsBetter: true, accent: "border-l-chart-warning" },
    { label: "EBITDA (Q4)", budget: totals.ebitdaBudget, actual: totals.ebitdaActual, icon: <Flame className="h-5 w-5" />, lowerIsBetter: false, accent: "border-l-chart-info" },
  ];
  const chartData = DEMO_BUDGET.map(r => ({ name: r.month, "Oms. budget": r.revBudget, "Oms. realiseret": r.revActual, "EBITDA budget": r.ebitdaBudget, "EBITDA realiseret": r.ebitdaActual }));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(c => (
          <div key={c.label} className={`glass-card rounded-xl p-5 border-l-2 ${c.accent}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <span className="text-muted-foreground">{c.icon}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatDKK(c.actual)}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-muted-foreground">Budget: {formatDKK(c.budget)}</p>
              <DiffBadge actual={c.actual} budget={c.budget} lowerIsBetter={c.lowerIsBetter} />
            </div>
          </div>
        ))}
      </div>
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Omsætning og EBITDA — Q4 2025</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatDKK(v)} {...TT} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="Oms. budget" fill="hsl(var(--primary))" opacity={0.4} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Oms. realiseret" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="EBITDA budget" fill="hsl(var(--chart-info))" opacity={0.4} radius={[3, 3, 0, 0]} />
              <Bar dataKey="EBITDA realiseret" fill="hsl(var(--chart-info))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function BudgetVsActualTab() {
  const totals = DEMO_BUDGET.reduce(
    (acc, r) => ({ revBudget: acc.revBudget + r.revBudget, revActual: acc.revActual + r.revActual, costBudget: acc.costBudget + r.costBudget, costActual: acc.costActual + r.costActual, ebitdaBudget: acc.ebitdaBudget + r.ebitdaBudget, ebitdaActual: acc.ebitdaActual + r.ebitdaActual }),
    { revBudget: 0, revActual: 0, costBudget: 0, costActual: 0, ebitdaBudget: 0, ebitdaActual: 0 }
  );
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Q4 2025 — Budget vs. Realiseret</h3>
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Måned","Oms. budget","Oms. realiseret","Afv.","Omk. budget","Omk. realiseret","Afv.","EBITDA budget","EBITDA realiseret","Afv."].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_BUDGET.map(r => (
                <tr key={r.month} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-3 font-medium text-foreground">{r.month}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatDKK(r.revBudget)}</td>
                  <td className="px-3 py-3 text-foreground">{formatDKK(r.revActual)}</td>
                  <td className="px-3 py-3"><DiffBadge actual={r.revActual} budget={r.revBudget} /></td>
                  <td className="px-3 py-3 text-muted-foreground">{formatDKK(r.costBudget)}</td>
                  <td className="px-3 py-3 text-foreground">{formatDKK(r.costActual)}</td>
                  <td className="px-3 py-3"><DiffBadge actual={r.costActual} budget={r.costBudget} lowerIsBetter /></td>
                  <td className="px-3 py-3 text-muted-foreground">{formatDKK(r.ebitdaBudget)}</td>
                  <td className="px-3 py-3 text-foreground">{formatDKK(r.ebitdaActual)}</td>
                  <td className="px-3 py-3"><DiffBadge actual={r.ebitdaActual} budget={r.ebitdaBudget} /></td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold">
                <td className="px-3 py-3 text-foreground">Total</td>
                <td className="px-3 py-3 text-muted-foreground">{formatDKK(totals.revBudget)}</td>
                <td className="px-3 py-3 text-foreground">{formatDKK(totals.revActual)}</td>
                <td className="px-3 py-3"><DiffBadge actual={totals.revActual} budget={totals.revBudget} /></td>
                <td className="px-3 py-3 text-muted-foreground">{formatDKK(totals.costBudget)}</td>
                <td className="px-3 py-3 text-foreground">{formatDKK(totals.costActual)}</td>
                <td className="px-3 py-3"><DiffBadge actual={totals.costActual} budget={totals.costBudget} lowerIsBetter /></td>
                <td className="px-3 py-3 text-muted-foreground">{formatDKK(totals.ebitdaBudget)}</td>
                <td className="px-3 py-3 text-foreground">{formatDKK(totals.ebitdaActual)}</td>
                <td className="px-3 py-3"><DiffBadge actual={totals.ebitdaActual} budget={totals.ebitdaBudget} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const FM = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

function ForecastTab() {
  const data = DEMO_FACTS.map((f, i) => ({ name: FM[i], Historisk: f.revenue, Prognose: Math.round(f.revenue * 1.14) }));
  return (
    <div className="space-y-6">
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Omsætningsprognose — 2026</h3>
        <p className="text-xs text-muted-foreground mb-4">Baseret på historisk væksttrend (+14% M/M)</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="gradHist" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatDKK(v)} {...TT} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Area type="monotone" dataKey="Historisk" stroke="hsl(var(--primary))" fill="url(#gradHist)" strokeWidth={2} />
              <Area type="monotone" dataKey="Prognose" stroke="hsl(var(--chart-info))" fill="none" strokeWidth={2} strokeDasharray="6 3" />
              <ReferenceLine y={400000} stroke="hsl(var(--chart-positive))" strokeDasharray="4 4" label={{ value: "Mål 400k", fill: "hsl(var(--chart-positive))", fontSize: 11 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Antagelser</h3>
        <div className="space-y-3">
          {[
            { label: "Vækstrate", value: "+14% M/M", note: "Baseret på historisk gennemsnit" },
            { label: "Churn", value: "1,2%", note: "Fastholdt fra 2025" },
            { label: "Nye kunder/måned", value: "4–6", note: "Organisk via SEO" },
            { label: "Gns. ordreværdi", value: "8.100 kr.", note: "Stabil abonnementspris" },
          ].map(a => (
            <div key={a.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div><p className="text-sm font-medium text-foreground">{a.label}</p><p className="text-xs text-muted-foreground">{a.note}</p></div>
              <span className="text-sm font-semibold text-foreground">{a.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CashflowTab() {
  const data = DEMO_FACTS.map(f => ({ name: f.period.slice(0, 3), Indbetalinger: f.revenue, Udbetalinger: f.expenses, Bank: f.cash }));
  return (
    <div className="space-y-6">
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Likviditetsudvikling — 2025</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatDKK(v)} {...TT} />
              <Area type="monotone" dataKey="Bank" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Ind- og udbetalinger — 2025</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatDKK(v)} {...TT} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="Indbetalinger" fill="hsl(var(--chart-positive))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Udbetalinger" fill="hsl(var(--destructive))" opacity={0.7} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

const SCENARIOS = [
  { name: "Pessimistisk", border: "border-l-destructive", badge: "bg-destructive/10 text-destructive", growth: -5, rev: 3500000, ebitda: 420000, desc: "Væksten stagnerer og churn stiger til 2,5%. Kræver straks omkostningsreduktioner." },
  { name: "Basis", border: "border-l-primary", badge: "bg-primary/10 text-primary", growth: 14, rev: 5200000, ebitda: 936000, desc: "Fortsat organisk vækst på niveau med 2025. Ansæt CSM inden Q2." },
  { name: "Optimistisk", border: "border-l-[hsl(var(--chart-positive))]", badge: "bg-[hsl(var(--chart-positive)/0.12)] text-[hsl(var(--chart-positive))]", growth: 25, rev: 7800000, ebitda: 1872000, desc: "Vækstkanal bryder igennem — partnership tilføjer 20+ kunder/kvartal." },
];

function ScenariosTab() {
  const [sel, setSel] = useState("Basis");
  const scen = SCENARIOS.find(s => s.name === sel)!;
  const months = FM.map((m, i) => ({ name: m, Omsætning: Math.round(DEMO_FACTS[i].revenue * (1 + scen.growth / 100) ** (i / 12 + 1)) }));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {SCENARIOS.map(s => (
          <button key={s.name} onClick={() => setSel(s.name)} className={`glass-card rounded-xl p-5 text-left border-l-2 ${s.border} transition-all ${sel === s.name ? "ring-2 ring-primary/25 shadow-md" : "opacity-70 hover:opacity-100"}`}>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${s.badge}`}>{s.name}</span>
            <p className="text-xl font-bold text-foreground mt-2">{formatDKK(s.rev)}</p>
            <p className="text-xs text-muted-foreground">Omsætning 2026</p>
            <p className="text-xs text-muted-foreground mt-2">{s.desc}</p>
          </button>
        ))}
      </div>
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Scenarie: {scen.name} — 2026</h3>
        <p className="text-xs text-muted-foreground mb-4">Vækst: {scen.growth >= 0 ? "+" : ""}{scen.growth}% · EBITDA: {formatDKK(scen.ebitda)}</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatDKK(v), "Omsætning"]} {...TT} />
              <Area type="monotone" dataKey="Omsætning" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
              <ReferenceLine y={400000} stroke="hsl(var(--chart-positive))" strokeDasharray="4 4" label={{ value: "Mål", fill: "hsl(var(--chart-positive))", fontSize: 11 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function DemoBudget() {
  const [tab, setTab] = useState<Tab>("Oversigt");
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Budget</h1>
      </div>
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Oversigt" && <OverviewTab />}
      {tab === "Budget vs. Realiseret" && <BudgetVsActualTab />}
      {tab === "Prognose" && <ForecastTab />}
      {tab === "Cashflow" && <CashflowTab />}
      {tab === "Scenarier" && <ScenariosTab />}
    </div>
  );
}
