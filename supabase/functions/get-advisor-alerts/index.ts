import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId } = auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: roleRows } = await adminClient
    .from("user_roles").select("role").eq("user_id", callerId)
    .in("role", ["advisor", "admin"]).limit(1);
  if (!roleRows || roleRows.length === 0) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch financial alerts from last 60 days across ALL companies
  // We query notifications directly but only alert types, deduplicated per company+type
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const { data: alerts } = await adminClient
    .from("notifications")
    .select("id, type, title, body, company_id, created_at")
    .in("type", ["alert_revenue_drop", "alert_negative_cash", "alert_result_negative"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!alerts?.length) {
    return new Response(JSON.stringify({ alerts: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Deduplicate: keep only the latest alert per company+type
  const seen = new Set<string>();
  const deduped = alerts.filter((a: any) => {
    const key = `${a.company_id}:${a.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Fetch active snoozes for financial alerts
  const alertIds = deduped.map((a: any) => a.id);
  const now = new Date().toISOString();
  const { data: snoozedActions } = await adminClient
    .from("advisor_financial_actions")
    .select("notification_id, snoozed_until, note, actioned_by_advisor_id, profiles:actioned_by_advisor_id(full_name)")
    .in("notification_id", alertIds)
    .gt("snoozed_until", now);

  const snoozedMap = new Map(
    (snoozedActions || []).map((a: any) => [a.notification_id, {
      snoozed_until: a.snoozed_until,
      note: a.note,
      advisor_name: (a.profiles as any)?.full_name || null,
    }])
  );

  // Enrich with company names
  const companyIds = [...new Set(deduped.map((a: any) => a.company_id).filter(Boolean))];
  const { data: companies } = await adminClient
    .from("companies").select("id, name").in("id", companyIds);
  const nameMap = new Map((companies || []).map((c: any) => [c.id, c.name]));

  // Filter out snoozed alerts and enrich
  const result = deduped
    .filter((a: any) => !snoozedMap.has(a.id))
    .map((a: any) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      body: a.body,
      company_id: a.company_id,
      company_name: nameMap.get(a.company_id) || "Ukendt",
      created_at: a.created_at,
    }));

  return new Response(JSON.stringify({ alerts: result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
