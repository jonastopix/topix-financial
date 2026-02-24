import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseReportPeriodToKey, getKeyFigures, SHORT_MONTHS, type ReportData } from "@/lib/financialUtils";

const RevenueChart = () => {
  const { user } = useAuth();

  const { data: reports = [] } = useQuery({
    queryKey: ["financial-reports-chart", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_reports")
        .select("id, report_period, extracted_data, status")
        .eq("user_id", user!.id)
        .eq("status", "processed")
        .order("uploaded_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data || []) as ReportData[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo(() => {
    return reports
      .map(r => {
        const key = parseReportPeriodToKey(r.report_period);
        const kf = getKeyFigures(r);
        if (!key || !kf) return null;
        const [year, monthStr] = key.split("-");
        const monthIdx = parseInt(monthStr, 10) - 1;
        return {
          key,
          month: `${SHORT_MONTHS[monthIdx]} ${year.slice(2)}`,
          revenue: kf.omsaetning || 0,
          expenses: Math.abs(kf.loenninger || 0) + Math.abs(kf.direkte_omkostninger || 0),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.key.localeCompare(b!.key)) as { key: string; month: string; revenue: number; expenses: number }[];
  }, [reports]);

  const hasData = chartData.length > 0;

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground">Omsætning vs. Udgifter</h3>
        <span className="text-xs text-muted-foreground">
          {hasData ? `${chartData.length} måneder` : "Ingen data endnu"}
        </span>
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
