import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  const { report_id, year, company_id, annual_revenue } = await req.json();

  if (!report_id || !year || !company_id || annual_revenue == null) {
    return new Response(JSON.stringify({ ok: false, error: "Missing params" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authority check (member of target company OR advisor) — via callerClient so
  // RLS gives defense-in-depth. Must pass before service-role client is built.
  const { data: isAdvisor } = await callerClient.rpc('has_role', { _user_id: callerId, _role: 'advisor' });
  let authorized = isAdvisor === true;
  if (!authorized) {
    const { data: membership } = await callerClient
      .from('company_members')
      .select('id')
      .eq('user_id', callerId)
      .eq('company_id', company_id)
      .maybeSingle();
    authorized = !!membership;
  }
  if (!authorized) {
    console.warn(`[update-annual-report-revenue] denied: caller=${callerId} not authorized for company=${company_id}`);
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const monthlyRevenue = Math.round(annual_revenue / 12);

  // Fetch all annual_report facts for this year
  const { data: facts, error: fetchErr } = await adminClient
    .from("financial_report_facts")
    .select("id, metrics")
    .eq("company_id", company_id)
    .eq("source_type", "annual_report")
    .like("period_key", `${year}-%`);

  if (fetchErr) {
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!facts || facts.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "No annual_report facts found for this year. Re-upload the annual report first." }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update each fact's metrics.revenue
  let updated = 0;
  for (const fact of facts as any[]) {
    const updatedMetrics = { ...(fact.metrics as Record<string, number>), revenue: monthlyRevenue };
    const { error: updateErr } = await adminClient
      .from("financial_report_facts")
      .update({ metrics: updatedMetrics } as any)
      .eq("id", fact.id);

    if (updateErr) {
      console.error(`[update-annual-report-revenue] Failed to update fact ${fact.id}:`, updateErr);
      return new Response(JSON.stringify({ ok: false, error: `Failed to update fact: ${updateErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    updated++;
  }

  // Update extracted_data on the report record
  const { data: reportRow } = await adminClient
    .from("financial_reports")
    .select("extracted_data")
    .eq("id", report_id)
    .maybeSingle();

  const updatedExtracted = {
    ...((reportRow?.extracted_data as Record<string, any>) || {}),
    nettoomsaetning: annual_revenue,
    success_log: {
      ...(((reportRow?.extracted_data as any)?.success_log) || {}),
      revenue_status: "manual",
      manual_revenue: annual_revenue,
    },
  };

  await adminClient
    .from("financial_reports")
    .update({ extracted_data: updatedExtracted } as any)
    .eq("id", report_id);

  console.log(`[update-annual-report-revenue] Updated ${updated} facts for company ${company_id} year ${year} with monthly revenue ${monthlyRevenue}`);

  return new Response(JSON.stringify({ ok: true, updated, monthly_revenue: monthlyRevenue }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
