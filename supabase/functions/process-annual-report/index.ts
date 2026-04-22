import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const DANISH_MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { report_id, company_id, year, extracted, user_id } = await req.json();
  if (!report_id || !company_id || !year || !extracted) {
    return new Response(JSON.stringify({ error: "Missing params" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build monthly metrics by dividing annual figures evenly across 12 months
  const monthlyMetrics = (val: number | null | undefined) =>
    val != null ? Math.round(val / 12) : null;

  const baseMetrics: Record<string, number | null> = {
    revenue: monthlyMetrics(extracted.nettoomsaetning),
    gross_profit: monthlyMetrics(extracted.bruttoresultat),
    payroll: monthlyMetrics(extracted.personaleomkostninger),
    ebt: monthlyMetrics(extracted.resultat_foer_skat),
    depreciation: monthlyMetrics(extracted.afskrivninger),
    cogs: monthlyMetrics(extracted.direkte_omkostninger),
    admin_costs: monthlyMetrics(extracted.andre_eksterne_omkostninger),
  };

  // Remove null values
  const metrics: Record<string, number> = {};
  for (const [k, v] of Object.entries(baseMetrics)) {
    if (v != null) metrics[k] = v;
  }

  // Cash and equity are balance sheet items — use as-is (not divided)
  if (extracted.likvider != null) metrics.cash = extracted.likvider;
  if (extracted.egenkapital != null) metrics.equity = extracted.egenkapital;

  if (Object.keys(metrics).length === 0) {
    return new Response(JSON.stringify({ ok: false, reason: "no_metrics_extracted" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find which months already have committed non-annual facts (don't overwrite)
  const { data: existingFacts } = await adminClient
    .from("financial_report_facts")
    .select("period_key, source_type")
    .eq("company_id", company_id)
    .like("period_key", `${year}-%`);

  const protectedPeriods = new Set(
    (existingFacts || [])
      .filter((f: any) => f.source_type !== "annual_report" && f.source_type !== "manual_baseline")
      .map((f: any) => f.period_key)
  );

  // Delete existing annual_report facts for this year (allow re-upload)
  await adminClient
    .from("financial_report_facts")
    .delete()
    .eq("company_id", company_id)
    .eq("source_type", "annual_report")
    .like("period_key", `${year}-%`);

  // Insert 12 monthly facts
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const monthNum = String(i + 1).padStart(2, "0");
    const periodKey = `${year}-${monthNum}`;

    // Skip months that have real committed data
    if (protectedPeriods.has(periodKey)) continue;

    rows.push({
      company_id,
      period_key: periodKey,
      period_label: `${DANISH_MONTHS[i]} ${year}`,
      source_report_id: report_id,
      source_type: "annual_report",
      metrics,
      committed_by: user_id || null,
      committed_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, inserted: 0, reason: "all_months_protected" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error } = await adminClient.from("financial_report_facts").insert(rows);
  if (error) {
    console.error("[process-annual-report] Insert failed:", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[process-annual-report] Inserted ${rows.length} monthly facts for ${company_id} year ${year}`);

  return new Response(JSON.stringify({ ok: true, inserted: rows.length, year, metrics_keys: Object.keys(metrics) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
