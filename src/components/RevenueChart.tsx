import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { calcTotalExpenses, SHORT_MONTHS } from "@/lib/financialUtils";

const RevenueChart = () => {
  const [mode, setMode] = useState<"last12" | "ytd">("last12");
  const { data: facts = [], isLoading, isError } = useCompanyFacts();

  const chartData = useMemo(() => {
    let sorted = facts.map((f) => {
      const kf = factsToDanishMetrics(f.metrics);
      const [year, monthStr] = f.period_key.split("-");
      const monthIdx = parseInt(monthStr, 10) - 1;
      return {
        key: f.period_key,
        revenue: kf.omsaetning || 0,
        expenses: calcTotalExpenses(kf),
        result: kf.resultat_foer_skat ?? null,
        month: `${SHORT_MONTHS[monthIdx]} ${year.slice(2)}`,
      };
    });

    if (mode === "ytd") {
      const yearPrefix = `${new Date().getFullYear()}-`;
      sorted = sorted.filter(d => d.key.startsWith(yearPrefix));
    } else {
      sorted = sorted.slice(-12);
    }

    return sorted;
  }, [facts, mode]);

  const hasData = chartData.length > 0;

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground">Omsætning vs. Udgifter</h3>
        <div className="flex items-center gap-1.5">
          {(["last12", "ytd"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-[10px] font-medium px-2.5 py-1 rounded-md transition-all ${
                mode === m
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              {m === "last12" ? "12 mdr" : "År til dato"}
            </button>
          ))}
          <Link
            to="/kpis"
            className="text-[10px] text-muted-foreground hover:text-primary transition-colors ml-2 hidden sm:block"
          >
            Se alle KPI'er →
          </Link>
        </div>
      </div>
      {(() => {
        const hasResult = chartData.some(d => d.result != null);
        const items: { color: string; label: string; dashed?: boolean }[] = [
          { color: "hsl(var(--primary))", label: "Omsætning" },
          { color: "hsl(var(--destructive))", label: "Udgifter" },
          ...(hasResult ? [{ color: "hsl(var(--chart-2))", label: "Resultat", dashed: true }] : []),
        ];
        return (
          <div className="flex items-center gap-4 mb-3">
            {items.map(({ color, label, dashed }) => (
              <div key={label} className="flex items-center gap-1.5">
                {dashed ? (
                  <div className="flex gap-0.5">
                    <div className="h-0.5 w-2 rounded-full" style={{ background: color }} />
                    <div className="h-0.5 w-1.5 rounded-full opacity-0" />
                    <div className="h-0.5 w-2 rounded-full" style={{ background: color }} />
                  </div>
                ) : (
                  <div className="h-0.5 w-4 rounded-full" style={{ background: color }} />
                )}
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        );
      })()}
      <div className="h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorResult" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--foreground))" }}
                formatter={(value: number, name: string) => [
                  `${(value / 1000).toFixed(0)}k DKK`,
                  name === "revenue" ? "Omsætning" : name === "expenses" ? "Udgifter" : "Resultat"
                ]}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#colorRevenue)" name="Omsætning" />
              <Area type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" strokeWidth={2} fill="url(#colorExpenses)" name="Udgifter" />
              <Area type="monotone" dataKey="result" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#colorResult)" name="Resultat" strokeDasharray="4 2" connectNulls dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Upload rapporter for at se omsætning vs. udgifter
          </div>
        )}
      </div>
    </div>
  );
};

export default RevenueChart;
