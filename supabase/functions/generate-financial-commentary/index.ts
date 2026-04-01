/**
 * generate-financial-commentary — RP-2 server-controlled commentary generation
 *
 * Single server-controlled path for creating financial commentaries.
 * The client calls with { company_id, period_key } — nothing else.
 * This function:
 *   1. Validates caller auth + access
 *   2. Loads committed facts for the target period
 *   3. Builds canonical AI payload server-side (current-period-only)
 *   4. Calls ai-financial-feedback edge function
 *   5. Persists commentary in financial_commentaries via service-role
 *   6. Returns the new commentary row
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Auth
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const { callerId, authHeader, callerClient } = auth;

    const { company_id, period_key } = await req.json();
    if (!company_id || !period_key) {
      return jsonRes({ error: "company_id and period_key are required" }, 400);
    }

    // 2. Access check — caller must have RLS access to company
    const { data: companyData, error: companyErr } = await callerClient
      .from("companies")
      .select("id, name, industry_label")
      .eq("id", company_id)
      .maybeSingle();

    if (companyErr || !companyData) {
      return jsonRes({ error: "Access denied or company not found" }, 403);
    }

    // 3. Load committed facts for target period (via callerClient for RLS)
    const { data: facts, error: factsErr } = await callerClient
      .from("financial_report_facts")
      .select("id, company_id, period_key, period_label, source_type, metrics, committed_at")
      .eq("company_id", company_id)
      .eq("period_key", period_key)
      .maybeSingle();

    if (factsErr || !facts) {
      return jsonRes({ error: "No committed facts found for this period" }, 404);
    }

    // 4. Build canonical AI payload server-side (current-period-only — no historical context in RP-2)
    const metrics = facts.metrics as Record<string, unknown>;

    const canonicalPayload = {
      input_type: "canonical" as const,
      company_name: companyData.name,
      period_start: null,
      period_end: null,
      report_period_label: facts.period_label,
      statement_type: "pnl" as const,
      selected_period_basis: "period" as const,
      validation_status: "PASS" as const,
      metrics,
    };

    // 4b. Fetch budget for the same period to enrich AI analysis
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const periodYear = period_key.split("-")[0];
    const periodMonth = parseInt(period_key.split("-")[1], 10) - 1;

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: budgetRows } = await adminClient
      .from("budget_targets")
      .select("category, budget_amount, period")
      .eq("company_id", company_id)
      .eq("period", `${periodYear}-base-${periodMonth}`);

    let budgetContext = "";
    if (budgetRows && budgetRows.length > 0) {
      const budgetRevenue = budgetRows
        .filter((b: any) => b.category === "omsaetning")
        .reduce((s: number, b: any) => s + b.budget_amount, 0);
      const budgetCosts = budgetRows
        .filter((b: any) => b.category !== "omsaetning" && !b.category.startsWith("__"))
        .reduce((s: number, b: any) => s + b.budget_amount, 0);
      const budgetEbitda = budgetRevenue - budgetCosts;
      budgetContext = `\nBUDGETMÅL FOR ${period_key}:\n- Budgetteret omsætning: ${Math.round(budgetRevenue).toLocaleString("da-DK")} kr.\n- Budgetterede omkostninger: ${Math.round(budgetCosts).toLocaleString("da-DK")} kr.\n- Budgetteret EBITDA: ${Math.round(budgetEbitda).toLocaleString("da-DK")} kr.\n- Budget EBITDA-margin: ${budgetRevenue > 0 ? ((budgetEbitda / budgetRevenue) * 100).toFixed(1) : "—"}%\nSammenlign altid med disse budgetmål i analysen når de er tilgængelige.\nAngiv afvigelse i procent: f.eks. "Omsætningen er 12% under budgetmålet".\n`;
    }

    // 5. Call ai-financial-feedback edge function (server-to-server with caller's auth)
    const aiFeedbackUrl = `${supabaseUrl}/functions/v1/ai-financial-feedback`;

    const aiResponse = await fetch(aiFeedbackUrl, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        canonicalPayload,
        companyContext: {
          name: companyData.name,
          industry: companyData.industry_label,
        },
        companyId: company_id,
        budgetContext,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[generate-financial-commentary] AI call failed:", aiResponse.status, errText);
      return jsonRes({ error: "AI analysis generation failed" }, 502);
    }

    const analysis = await aiResponse.json();
    if (analysis.error) {
      return jsonRes({ error: analysis.error }, 502);
    }

    // If the AI layer says we need more data, return that directly without persisting
    if (analysis.needs_more_data) {
      return new Response(JSON.stringify(analysis), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Compute basis hash using the same function as the DB trigger
    const basisMetricsHash = await computeMetricsHash(metrics);

    // 7. Persist commentary via service-role (adminClient already created above)

    const { data: commentary, error: insertErr } = await adminClient
      .from("financial_commentaries")
      .insert({
        company_id,
        period_key,
        facts_id: facts.id,
        basis_metrics_hash: basisMetricsHash,
        basis_committed_at: facts.committed_at,
        basis_source_type: facts.source_type,
        analysis,
        is_stale: false,
        generated_by: callerId,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[generate-financial-commentary] Insert error:", insertErr);
      return jsonRes({ error: "Failed to persist commentary" }, 500);
    }

    return new Response(JSON.stringify(commentary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[generate-financial-commentary] Error:", error);
    return jsonRes(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

/**
 * Compute metrics hash — must match public.compute_facts_metrics_hash() in DB.
 * Uses md5(metrics::text) which in PostgreSQL is md5 of the jsonb text representation.
 * We replicate this by using the same JSON stringification approach.
 */
async function computeMetricsHash(metrics: Record<string, unknown>): Promise<string> {
  // PostgreSQL jsonb::text produces a canonical form. We use JSON.stringify
  // but to match PostgreSQL's md5(jsonb::text), we query the DB function directly.
  // Safest approach: call the DB function.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await adminClient.rpc("compute_facts_metrics_hash", {
    _metrics: metrics,
  });

  if (error) {
    console.error("[generate-financial-commentary] Hash computation error:", error);
    throw new Error("Failed to compute metrics hash");
  }

  return data as string;
}

function jsonRes(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
