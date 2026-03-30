import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";

const KPI_LABELS: Record<string, string> = {
  omsaetning: "Omsætning",
  db_margin: "DB Margin",
  loenninger: "Lønninger",
  resultat: "Resultat",
  omkostninger: "Omkostninger",
  ebitda_margin: "Resultatmargin",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerClient } = auth;

  const { company_id, period_label, kpi_key } = await req.json();
  if (!company_id) {
    return new Response(JSON.stringify({ error: "company_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify caller is advisor with access to this company
  const { data: company } = await callerClient
    .from("companies")
    .select("name")
    .eq("id", company_id)
    .maybeSingle();
  if (!company) {
    return new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get all company member user_ids to notify
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: members } = await adminClient
    .from("company_members")
    .select("user_id")
    .eq("company_id", company_id);

  const userIds = (members || []).map((m: any) => m.user_id);
  if (userIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, notified: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const kpiLabel = KPI_LABELS[kpi_key] || kpi_key;
  const inserted = await writeNotificationToMany(adminClient, userIds, {
    type: "advisor_kpi_comment",
    priority: "important",
    title: `Din rådgiver har kommenteret på ${kpiLabel}`,
    body: `Se kommentaren direkte på grafen for ${period_label}`,
    deep_link: "/kpis",
    company_id,
    reference_type: "kpi_comment",
    dedup_key: `advisor_kpi_comment:${company_id}:${kpi_key}:${period_label}`,
  });

  return new Response(JSON.stringify({ ok: true, notified: inserted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
