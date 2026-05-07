import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerClient } = auth;

  const { company_id } = await req.json();
  if (!company_id) return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: facts } = await callerClient
    .from("financial_report_facts")
    .select("period_key, period_label, metrics")
    .eq("company_id", company_id)
    .order("period_key", { ascending: false })
    .limit(6);

  if (!facts || facts.length < 3) {
    return new Response(JSON.stringify({ error: "insufficient_data", months_needed: 3 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const sorted = [...facts].sort((a, b) => a.period_key.localeCompare(b.period_key));
  const revenues = sorted.map(f => (f.metrics as any)?.revenue ?? null).filter(v => v != null) as number[];
  const results = sorted.map(f => (f.metrics as any)?.ebt ?? null).filter(v => v != null) as number[];

  // Simple linear trend
  function forecast(values: number[], months: number): number[] {
    const n = values.length;
    const avgGrowth = n > 1 ? (values[n-1] - values[0]) / (n - 1) : 0;
    return Array.from({ length: months }, (_, i) => Math.round(values[n-1] + avgGrowth * (i + 1)));
  }

  const revenueF = forecast(revenues, 3);
  const resultF = forecast(results, 3);

  // Generate period keys for next 3 months
  const lastKey = sorted[sorted.length - 1].period_key;
  const [y, m] = lastKey.split("-").map(Number);
  const MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];
  const periods = Array.from({ length: 3 }, (_, i) => {
    const date = new Date(y, m + i, 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`, label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}` };
  });

  return new Response(JSON.stringify({
    forecast: periods.map((p, i) => ({ period_key: p.key, period_label: p.label, revenue: revenueF[i], ebt: resultF[i] })),
    based_on_months: sorted.length,
    method: "linear_trend",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
