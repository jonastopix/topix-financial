import { useState } from "react";
import { CheckCircle2, FileUp, Sparkles, TrendingUp, TrendingDown, ChevronDown, ChevronUp, BarChart3, DollarSign, Flame, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DEMO_FACTS } from "./demoData";
import { formatDKK } from "@/lib/financialUtils";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";

const TT = {
  contentStyle: { background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
};

const AI_ANALYSIS = [
  {
    title: "Stærk omsætningsvækst",
    body: "December er årets bedste måned med 342.000 kr. i omsætning — en stigning på 14,8% M/M og 88% YoY. Den organiske SEO-kanal begynder for alvor at levere.",
    type: "positive" as const,
  },
  {
    title: "EBITDA-margin under pres",
    body: "EBITDA-marginen er 20,4% i december mod et budgetmål på 21,9%. Stigende lønomkostninger (140.000 kr.) presser marginen. Overvej om næste ansættelse skal ske i Q2 frem for Q1.",
    type: "warning" as const,
  },
  {
    title: "Likviditet er sund",
    body: "Banksaldo på 248.000 kr. svarer til ca. 1,8 måneders løn. Anbefalet buffer er 3 måneder — det betyder du bør sigte mod 420.000 kr. inden Q3 2026.",
    type: "neutral" as const,
  },
  {
    title: "Fokuspunkt: Churn",
    body: "Baseret på dine tal estimeres churn til ca. 1,2%. Det koster dig ca. 41.000 kr. MRR om året. En Customer Success Manager betaler sig selv hjem inden for 6 måneder.",
    type: "warning" as const,
  },
];

function SparkCell({ data }: { data: number[] }) {
  const pts = data.map((v) => ({ v }));
  return (
    <div className="h-6 w-16">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pts} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" fill="url(#sparkGrad)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function AIAnalysisCard({ item }: { item: (typeof AI_ANALYSIS)[0] }) {
  const [open, setOpen] = useState(false);
  const color = item.type === "positive" ? "border-l-primary text-primary bg-primary/5" : item.type === "warning" ? "border-l-chart-warning text-chart-warning bg-chart-warning/5" : "border-l-muted-foreground text-muted-foreground bg-muted/30";
  const dotColor = item.type === "positive" ? "bg-primary" : item.type === "warning" ? "bg-chart-warning" : "bg-muted-foreground";
  return (
    <div className={`border-l-2 rounded-r-lg overflow-hidden ${color}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span className="text-sm font-medium text-foreground">{item.title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-3 pl-8">
          <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
        </div>
      )}
    </div>
  );
}

const METRIC_ROWS = [
  { label: "Omsætning", key: "revenue" as const, icon: <DollarSign className="h-3.5 w-3.5" />, format: "dkk" },
  { label: "EBITDA", key: "ebitda" as const, icon: <Flame className="h-3.5 w-3.5" />, format: "dkk" },
  { label: "Bank", key: "cash" as const, icon: <Wallet className="h-3.5 w-3.5" />, format: "dkk" },
  { label: "Udgifter", key: "expenses" as const, icon: <BarChart3 className="h-3.5 w-3.5" />, format: "dkk" },
];

export default function DemoRapportering() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Rapportering</h1>
        <p className="text-sm text-muted-foreground mt-1">Her uploader du din månedlige saldobalance — AI'en læser tallene automatisk</p>
      </div>

      {/* Upload zone */}
      <button
        onClick={() => toast.info("Dette er en demooplevelse — ansøg til The Boardroom for at uploade rigtige rapporter", {
          action: { label: "Ansøg til The Boardroom →", onClick: () => window.open("https://theboardroom.dk", "_blank") },
        })}
        className="w-full glass-card rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors p-8 flex flex-col items-center gap-3 cursor-pointer group"
      >
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <FileUp className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Upload saldobalance</p>
          <p className="text-xs text-muted-foreground">PDF, CSV eller Excel · AI udtrækker tallene automatisk</p>
        </div>
      </button>

      {/* AI Analysis */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-start gap-3 mb-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">AI-analyse · December 2025</h2>
            <p className="text-xs text-muted-foreground">Genereret på baggrund af din saldobalance</p>
          </div>
        </div>
        <div className="space-y-1">
          {AI_ANALYSIS.map((item) => (
            <AIAnalysisCard key={item.title} item={item} />
          ))}
        </div>
      </div>

      {/* Period table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Perioder med indlæste tal</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Periode</th>
                {METRIC_ROWS.map(m => (
                  <th key={m.key} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{m.label}</th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Trend</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...DEMO_FACTS].reverse().map((f) => {
                const idx = DEMO_FACTS.indexOf(f);
                const prevF = DEMO_FACTS[idx - 1];
                const revChange = prevF ? ((f.revenue - prevF.revenue) / prevF.revenue) * 100 : 0;
                const up = revChange >= 0;
                const sparkData = DEMO_FACTS.slice(Math.max(0, idx - 5), idx + 1).map(x => x.revenue);
                return (
                  <tr key={f.key} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium text-foreground">{f.period}</td>
                    <td className="px-4 py-3 text-foreground">{formatDKK(f.revenue)}</td>
                    <td className="px-4 py-3 text-foreground">{formatDKK(f.ebitda)}</td>
                    <td className="px-4 py-3 text-foreground">{formatDKK(f.cash)}</td>
                    <td className="px-4 py-3 text-foreground">{formatDKK(f.expenses)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <SparkCell data={sparkData} />
                        <span className={`text-xs font-medium ${up ? "text-primary" : "text-destructive"}`}>
                          {up ? <TrendingUp className="h-3 w-3 inline mr-0.5" /> : <TrendingDown className="h-3 w-3 inline mr-0.5" />}
                          {prevF ? `${up ? "+" : ""}${revChange.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="default" className="text-[10px] gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Analyse klar
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
