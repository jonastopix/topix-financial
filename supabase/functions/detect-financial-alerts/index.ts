import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotification } from "../_shared/notificationWriter.ts";

function formatDKK(val: number): string {
  return new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(val);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate caller
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;

  const { company_id, period_key, report_id } = await req.json();
  if (!company_id || !period_key || !report_id) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: company_id, period_key, report_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Service-role client for cross-RLS reads and notification writes
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // 1. Get the committed fact for the current period
  const { data: currentFact } = await adminClient
    .from("financial_report_facts")
    .select("metrics, period_label")
    .eq("company_id", company_id)
    .eq("period_key", period_key)
    .maybeSingle();

  if (!currentFact) {
    return new Response(
      JSON.stringify({ alerts_written: 0, reason: "no_fact_found" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 2. Get the previous period fact for MoM comparison
  const [year, month] = period_key.split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevPeriodKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  const { data: prevFact } = await adminClient
    .from("financial_report_facts")
    .select("metrics")
    .eq("company_id", company_id)
    .eq("period_key", prevPeriodKey)
    .maybeSingle();

  // Get all company members (founders)
  const { data: members } = await adminClient
    .from("company_members")
    .select("user_id")
    .eq("company_id", company_id);
  const memberUserIds = (members || []).map((m: { user_id: string }) => m.user_id);

  // Also get all advisors and admins so alerts appear in their dashboard
  const { data: advisorRoles } = await adminClient
    .from("user_roles")
    .select("user_id")
    .in("role", ["advisor", "admin"]);
  const advisorUserIds = (advisorRoles || []).map((r: { user_id: string }) => r.user_id);

  // Combine and deduplicate
  const userIds = [...new Set([...memberUserIds, ...advisorUserIds])];

  if (userIds.length === 0) {
    return new Response(
      JSON.stringify({ alerts_written: 0, reason: "no_members" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 4. Check alert conditions
  const cur = currentFact.metrics as Record<string, number | null>;
  const prev = prevFact?.metrics as Record<string, number | null> | undefined;

  const alerts: { type: string; priority: "important" | "action_required"; title: string; body: string; deep_link: string; dedup_suffix: string }[] = [];

  // ALERT 1: Revenue drop ≥15% MoM
  if (prev && cur.revenue != null && prev.revenue != null && prev.revenue > 0 && cur.revenue > 0) {
    const changePct = ((cur.revenue - prev.revenue) / prev.revenue) * 100;
    if (changePct <= -15) {
      alerts.push({
        type: "alert_revenue_drop",
        priority: "important",
        title: `Omsætningen faldt ${Math.abs(changePct).toFixed(0)}% i ${currentFact.period_label}`,
        body: `Din omsætning gik fra ${formatDKK(prev.revenue)} til ${formatDKK(cur.revenue)}. Hvad er årsagen?`,
        deep_link: "/kpis",
        dedup_suffix: period_key,
      });
    }
  }

  // ALERT 2: Cash/bank gone negative
  if (cur.cash != null && cur.cash < 0) {
    alerts.push({
      type: "alert_negative_cash",
      priority: "action_required",
      title: `Bankovertræk i ${currentFact.period_label}`,
      body: `Din likviditet er negativ (${formatDKK(cur.cash)}). Tjek dit cash flow.`,
      deep_link: "/budget",
      dedup_suffix: period_key,
    });
  }

  // ALERT 3: Result (ebt) negative when previous period was positive
  if (prev && cur.ebt != null && prev.ebt != null && cur.ebt < 0 && prev.ebt >= 0) {
    alerts.push({
      type: "alert_result_negative",
      priority: "important",
      title: `Negativt resultat i ${currentFact.period_label}`,
      body: `Resultatet vendte fra ${formatDKK(prev.ebt)} til ${formatDKK(cur.ebt)}. Tag det op på næste board-session.`,
      deep_link: "/kpis",
      dedup_suffix: period_key,
    });
  }

  // 5. Write notifications
  for (const alert of alerts) {
    for (const userId of userIds) {
      await writeNotification(adminClient, {
        user_id: userId,
        type: alert.type,
        priority: alert.priority,
        title: alert.title,
        body: alert.body,
        deep_link: alert.deep_link,
        company_id: company_id,
        reference_type: "report",
        reference_id: report_id,
        dedup_key: `${alert.type}:${company_id}:${alert.dedup_suffix}`,
      });
    }
  }

  return new Response(
    JSON.stringify({ alerts_written: alerts.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
