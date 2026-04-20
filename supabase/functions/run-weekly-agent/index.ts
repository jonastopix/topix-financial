import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth instanceof Response) return auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Get all active companies that have at least one committed fact
  const { data: companies, error } = await adminClient
    .from("companies")
    .select("id, name")
    .eq("status", "active");

  if (error || !companies?.length) {
    return new Response(JSON.stringify({ ok: false, error: error?.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // For each company, find their latest committed fact
  const results: { company_id: string; status: string }[] = [];

  for (const company of companies) {
    const { data: latestFact } = await adminClient
      .from("financial_report_facts")
      .select("period_key, period_label")
      .eq("company_id", company.id)
      .order("period_key", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestFact) {
      results.push({ company_id: company.id, status: "skipped_no_facts" });
      continue;
    }

    // Call agent directly via HTTP using service role key as Bearer token
    const agentUrl = `${supabaseUrl}/functions/v1/run-company-agent`;

    const agentResp = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        company_id: company.id,
        trigger: "weekly_cron",
        period_key: latestFact.period_key,
        period_label: latestFact.period_label,
      }),
    });

    const agentResult = agentResp.ok ? await agentResp.json() : null;
    results.push({
      company_id: company.id,
      status: agentResult?.ok ? "triggered" : `error: ${agentResult?.error || agentResp.status}`,
    });

    // Small delay between companies to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
