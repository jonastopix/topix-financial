import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseReportPeriodToKey, getKeyFigures, SHORT_MONTHS, type ReportData } from "@/lib/financialUtils";
import { type PeriodMode } from "@/components/PeriodSelector";

const RevenueChart = () => {
  const { user, companyId } = useAuth();
  const [mode, setMode] = useState<"last12" | "ytd">("last12");

  const { data: reports = [] } = useQuery({
    queryKey: ["financial-reports-chart", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("financial_reports")
        .select("id, report_period, extracted_data, status") as any)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("status", "processed")
      .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ReportData[];
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo(() => {
    const byKey = new Map<string, { key: string; revenue: number; expenses: number }>();

    for (const r of reports) {
      const key = parseReportPeriodToKey(r.report_period);
      const kf = getKeyFigures(r);
      if (!key || !kf) continue;
      if (byKey.has(key)) continue;

      byKey.set(key, {
        key,
        revenue: kf.omsaetning || 0,
        expenses: Math.abs(kf.loenninger || 0) + Math.abs(kf.direkte_omkostninger || 0) + Math.abs(kf.marketing || 0) + Math.abs(kf.lokaler || 0) + Math.abs(kf.admin || 0) + Math.abs(kf.tech_software || 0) + Math.abs(kf.afskrivninger || 0),
      });
    }

    let sorted = Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));

    if (mode === "ytd") {
      const yearPrefix = `${new Date().getFullYear()}-`;
      sorted = sorted.filter(d => d.key.startsWith(yearPrefix));
    } else {
      sorted = sorted.slice(-12);
    }

    return sorted.map(d => {
      const [year, monthStr] = d.key.split("-");
      const monthIdx = parseInt(monthStr, 10) - 1;
      return { ...d, month: `${SHORT_MONTHS[monthIdx]} ${year.slice(2)}` };
    });
  }, [reports, mode]);

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
        </div>
      </div>
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
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [`${(value / 1000).toFixed(0)}k DKK`, ""]}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#colorRevenue)" name="Omsætning" />
              <Area type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" strokeWidth={2} fill="url(#colorExpenses)" name="Udgifter" />
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
