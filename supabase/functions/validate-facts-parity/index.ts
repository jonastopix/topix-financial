/**
 * validate-facts-parity — Phase 1A diagnostic endpoint
 * 
 * Advisor-only. Compares financial_report_facts against what the current
 * UI resolution path (getEffectiveMetrics) would display for each source report.
 * 
 * Auth: authenticateUser + advisor role check. No open surface.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth gate
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // Advisor role check via callerClient (RLS-scoped)
  const { data: roleData } = await callerClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId);

  const isAdvisor = roleData?.some(
    (r: { role: string }) => r.role === "advisor" || r.role === "admin"
  );
  if (!isAdvisor) {
    return new Response(JSON.stringify({ error: "Forbidden: advisor role required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Service client for reading all facts + reports
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Load all facts
  const { data: facts, error: factsErr } = await adminClient
    .from("financial_report_facts")
    .select("*");

  if (factsErr) {
    return new Response(JSON.stringify({ error: factsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!facts || facts.length === 0) {
    return new Response(JSON.stringify({ total: 0, matches: 0, mismatches: 0, details: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load all source reports
  const reportIds = [...new Set(facts.map((f: any) => f.source_report_id))];
  const { data: reports } = await adminClient
    .from("financial_reports")
    .select(
      "id, status, deleted_at, validation_status, normalized_data, " +
      "manual_override_status, manual_normalized_data, manual_report_period_key, " +
      "manual_report_period_label, report_period, extracted_data"
    )
    .in("id", reportIds);

  const reportMap = new Map<string, any>();
  (reports || []).forEach((r: any) => reportMap.set(r.id, r));

  // Danish→English key map (mirrors getCanonicalOrLegacyMetrics in financialUtils.ts)
  const CANONICAL_TO_DANISH: Record<string, string> = {
    revenue: "omsaetning",
    gross_profit: "daekningsbidrag",
    payroll: "loenninger",
    cogs: "direkte_omkostninger",
    sales_costs: "salgsomkostninger",
    facility_costs: "lokaleomkostninger",
    admin_costs: "administrationsomkostninger",
    depreciation: "afskrivninger",
    ebt: "resultat_foer_skat",
    net_result: "resultat_efter_skat",
    assets_total: "aktiver_i_alt",
    equity_total: "egenkapital",
    cash: "bank_balance",
    trade_receivables: "debitorer",
    current_liabilities: "kreditorer",
  };

  // Manual Danish keys that map to canonical (for reverse lookup)
  const DANISH_TO_CANONICAL: Record<string, string> = {
    omsaetning: "revenue",
    daekningsbidrag: "gross_profit",
    bruttofortjeneste: "gross_profit",
    loenninger: "payroll",
    direkte_omkostninger: "cogs",
    salgsomkostninger: "sales_costs",
    lokaleomkostninger: "facility_costs",
    administrationsomkostninger: "admin_costs",
    afskrivninger: "depreciation",
    resultat_foer_skat: "ebt",
    resultat_efter_skat: "net_result",
    aktiver_i_alt: "assets_total",
    egenkapital: "equity_total",
    bank_balance: "cash",
    likvider: "cash",
    debitorer: "trade_receivables",
    kreditorer: "current_liabilities",
  };

  const details: any[] = [];
  let matches = 0;
  let mismatches = 0;

  for (const fact of facts) {
    const report = reportMap.get(fact.source_report_id);
    if (!report) {
      mismatches++;
      details.push({
        fact_id: fact.id,
        company_id: fact.company_id,
        period_key: fact.period_key,
        status: "mismatch",
        reason: "source_report_not_found",
      });
      continue;
    }

    // Mirror getEffectiveMetrics() from financialUtils.ts
    let uiMetrics: Record<string, number | null> = {};
    let uiSource: string = "none";

    if (
      report.manual_override_status === "applied" &&
      report.manual_normalized_data?.metrics
    ) {
      // Manual path — UI uses Danish keys
      uiSource = "manual";
      const mnd = report.manual_normalized_data.metrics;
      // Convert Danish keys to canonical English for comparison
      for (const [dk, val] of Object.entries(mnd)) {
        const canonKey = DANISH_TO_CANONICAL[dk];
        if (canonKey && val != null) {
          uiMetrics[canonKey] = val as number;
        }
      }
    } else if (report.normalized_data?.metrics) {
      // Canonical path — UI maps English to Danish via getCanonicalOrLegacyMetrics
      uiSource = "canonical";
      const m = report.normalized_data.metrics;
      // These are already English keys in normalized_data.metrics
      for (const [key, val] of Object.entries(m)) {
        if (val != null && CANONICAL_TO_DANISH[key]) {
          uiMetrics[key] = val as number;
        }
      }
    } else if (
      report.extracted_data &&
      typeof report.extracted_data === "object" &&
      !Array.isArray(report.extracted_data) &&
      (report.extracted_data as any).key_figures
    ) {
      // Legacy path — should NOT be in facts
      uiSource = "legacy";
    }

    if (uiSource === "legacy" || uiSource === "none") {
      mismatches++;
      details.push({
        fact_id: fact.id,
        company_id: fact.company_id,
        period_key: fact.period_key,
        status: "mismatch",
        reason: `ui_source_is_${uiSource}_but_fact_exists`,
        fact_source: fact.source_type,
      });
      continue;
    }

    // Compare metric values
    const factMetrics = fact.metrics as Record<string, number>;
    const metricMismatches: any[] = [];

    // Check all canonical keys present in either side
    const allKeys = new Set([...Object.keys(factMetrics), ...Object.keys(uiMetrics)]);

    for (const key of allKeys) {
      const factVal = factMetrics[key] ?? null;
      const uiVal = uiMetrics[key] ?? null;

      if (factVal === null && uiVal === null) continue;
      if (factVal === null || uiVal === null) {
        metricMismatches.push({ key, fact: factVal, ui: uiVal });
        continue;
      }
      // Tolerance check
      if (Math.abs(factVal - uiVal) > 0.01) {
        metricMismatches.push({ key, fact: factVal, ui: uiVal });
      }
    }

    if (metricMismatches.length === 0) {
      matches++;
      details.push({
        fact_id: fact.id,
        company_id: fact.company_id,
        period_key: fact.period_key,
        status: "match",
        source: fact.source_type,
      });
    } else {
      mismatches++;
      details.push({
        fact_id: fact.id,
        company_id: fact.company_id,
        period_key: fact.period_key,
        status: "mismatch",
        source: fact.source_type,
        metric_mismatches: metricMismatches,
      });
    }
  }

  return new Response(
    JSON.stringify({ total: facts.length, matches, mismatches, details }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
