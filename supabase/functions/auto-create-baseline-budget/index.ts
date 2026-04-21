import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DANISH_MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { company_id, period_key, metrics, user_id } = await req.json();

  if (!company_id || !period_key || !metrics) {
    return new Response(JSON.stringify({ ok: false, reason: "missing_params" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const year = period_key.slice(0, 4);
  const revenue = metrics.revenue ?? null;

  // GUARD 1: Skip if company already has committed facts (not first report)
  const { count: factsCount } = await adminClient
    .from("financial_report_facts")
    .select("*", { count: "exact", head: true })
    .eq("company_id", company_id)
    .not("source_type", "eq", "manual_baseline");

  if (factsCount && factsCount > 1) {
    return new Response(JSON.stringify({ ok: false, reason: "not_first_report" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // GUARD 2: Skip if budget already exists for this year
  const { count: budgetCount } = await adminClient
    .from("budget_targets")
    .select("*", { count: "exact", head: true })
    .eq("company_id", company_id)
    .like("period", `${year}-base-%`);

  if (budgetCount && budgetCount > 0) {
    return new Response(JSON.stringify({ ok: false, reason: "budget_already_exists" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // GUARD 3: Skip if insufficient metrics
  if (!revenue || revenue <= 0) {
    return new Response(JSON.stringify({ ok: false, reason: "insufficient_metrics" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── PART 1: Save annual baseline in financial_report_facts ──
  // Annualise monthly metrics (×12) — clearly marked as estimate
  const annualRevenue = revenue * 12;
  const annualGrossProfit = metrics.gross_profit != null ? metrics.gross_profit * 12 : null;
  const annualPayroll = metrics.payroll != null ? metrics.payroll * 12 : null;
  const annualEbt = metrics.ebt != null ? metrics.ebt * 12 : null;
  const cash = metrics.cash ?? null;

  // Find or create sentinel report for baseline
  const sentinelFileName = `_annual_baseline_sentinel_${company_id}`;
  let sentinelId: string;

  const { data: existingSentinel } = await adminClient
    .from("financial_reports")
    .select("id")
    .eq("company_id", company_id)
    .eq("file_name", sentinelFileName)
    .maybeSingle();

  if (existingSentinel) {
    sentinelId = existingSentinel.id;
  } else {
    const { data: newSentinel, error: sentinelErr } = await adminClient
      .from("financial_reports")
      .insert({
        company_id,
        user_id,
        file_name: sentinelFileName,
        file_path: "_sentinel",
        report_type: "andet",
        status: "processed",
        extraction_contract_version: "baseline_v1",
      })
      .select("id")
      .single();
    if (sentinelErr || !newSentinel) {
      console.error("[auto-create-baseline-budget] Sentinel create failed:", sentinelErr);
      return new Response(JSON.stringify({ ok: false, reason: "sentinel_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    sentinelId = newSentinel.id;
  }

  // Insert 12 monthly baseline facts
  const baselineRows = Array.from({ length: 12 }, (_, i) => {
    const monthNum = String(i + 1).padStart(2, "0");
    const m: Record<string, number> = { revenue: annualRevenue / 12 };
    if (annualGrossProfit != null) m.gross_profit = annualGrossProfit / 12;
    if (annualPayroll != null) m.payroll = annualPayroll / 12;
    if (annualEbt != null) m.ebt = annualEbt / 12;
    if (cash != null) m.cash = cash;
    return {
      company_id,
      period_key: `${year}-${monthNum}`,
      period_label: `${DANISH_MONTHS[i]} ${year}`,
      source_report_id: sentinelId,
      source_type: "manual_baseline",
      metrics: m,
      committed_by: user_id,
      committed_at: new Date().toISOString(),
    };
  });

  // Only insert months that don't already exist
  const { data: existingFacts } = await adminClient
    .from("financial_report_facts")
    .select("period_key")
    .eq("company_id", company_id)
    .like("period_key", `${year}-%`);

  const existingPeriods = new Set((existingFacts ?? []).map(f => f.period_key));
  const rowsToInsert = baselineRows.filter(r => !existingPeriods.has(r.period_key));

  if (rowsToInsert.length > 0) {
    const { error: baselineErr } = await adminClient
      .from("financial_report_facts")
      .insert(rowsToInsert);
    if (baselineErr) {
      console.error("[auto-create-baseline-budget] Baseline insert failed:", baselineErr);
    }
  }

  // ── PART 2: Create draft budget_targets ──
  // Map available metrics to budget categories, distribute evenly across 12 months
  const budgetCategories: { category: string; annual: number }[] = [
    { category: "omsaetning", annual: annualRevenue },
  ];

  if (metrics.cogs != null && metrics.cogs > 0)
    budgetCategories.push({ category: "vareforbrug", annual: metrics.cogs * 12 });
  if (metrics.payroll != null && metrics.payroll > 0)
    budgetCategories.push({ category: "loenninger", annual: metrics.payroll * 12 });
  if (metrics.sales_costs != null && metrics.sales_costs > 0)
    budgetCategories.push({ category: "salgsomkostninger", annual: metrics.sales_costs * 12 });
  if (metrics.facility_costs != null && metrics.facility_costs > 0)
    budgetCategories.push({ category: "lokaleomkostninger", annual: metrics.facility_costs * 12 });
  if (metrics.admin_costs != null && metrics.admin_costs > 0)
    budgetCategories.push({ category: "admin", annual: metrics.admin_costs * 12 });
  if (metrics.depreciation != null && metrics.depreciation > 0)
    budgetCategories.push({ category: "afskrivninger", annual: metrics.depreciation * 12 });

  // Insert template marker
  await adminClient.from("budget_targets").upsert({
    user_id,
    company_id,
    category: "__template__",
    budget_amount: 0,
    period: "webshop_b2c",
  } as any, { onConflict: "company_id,user_id,category,period" });

  // Insert monthly budget rows
  const budgetRows = budgetCategories.flatMap(({ category, annual }) =>
    Array.from({ length: 12 }, (_, i) => ({
      user_id,
      company_id,
      category,
      budget_amount: Math.round(annual / 12),
      period: `${year}-base-${i}`,
    }))
  );

  const { error: budgetErr } = await adminClient
    .from("budget_targets")
    .insert(budgetRows);

  if (budgetErr) {
    console.error("[auto-create-baseline-budget] Budget insert failed:", budgetErr);
  }

  console.log(`[auto-create-baseline-budget] Created baseline + budget for company ${company_id}, year ${year}, ${budgetCategories.length} categories`);

  return new Response(JSON.stringify({
    ok: true,
    year,
    baseline_months: rowsToInsert.length,
    budget_categories: budgetCategories.length,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
