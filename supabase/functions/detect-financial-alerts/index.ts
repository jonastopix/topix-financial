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

  // ── Auth (Bucket A) — must precede any service-role construction ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  const { company_id, period_key, report_id } = await req.json();
  if (!company_id || !period_key || !report_id) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: company_id, period_key, report_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Authority check (member of target company OR advisor) via callerClient ──
  // before service-role. Advisor bypass is required because advisors trigger
  // this flow on customer pages via overrideCompanyId (body.company_id is the
  // customer's UUID; advisor has no company_members row for them).
  const { data: isAdvisor } = await callerClient.rpc('has_role', { _user_id: callerId, _role: 'advisor' });
  let authorized = isAdvisor === true;
  if (!authorized) {
    const { data: membership } = await callerClient
      .from("company_members")
      .select("id")
      .eq("user_id", callerId)
      .eq("company_id", company_id)
      .maybeSingle();
    authorized = !!membership;
  }
  if (!authorized) {
    console.warn(`[detect-financial-alerts] denied: caller=${callerId} not authorized for company=${company_id}`);
    return new Response(
      JSON.stringify({ error: "forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Service-role client for cross-RLS reads and notification writes
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // ── Defence-in-depth: verify report_id belongs to company_id ──
  // Prevents reference_id pollution (linking notifications to reports of
  // other companies). Existence check only — authz already passed above.
  const { data: reportRow, error: reportErr } = await adminClient
    .from("financial_reports")
    .select("id")
    .eq("id", report_id)
    .eq("company_id", company_id)
    .maybeSingle();
  if (reportErr) {
    console.error(`[detect-financial-alerts] report lookup failed:`, reportErr);
    return new Response(
      JSON.stringify({ error: "report lookup failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!reportRow) {
    console.warn(`[detect-financial-alerts] report_id ${report_id} does not belong to company ${company_id} (caller=${callerId})`);
    return new Response(
      JSON.stringify({ error: "report_id does not belong to company_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

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

  // 5. Write notifications (split: advisors keep the three separate alerts,
  //    members get one calm consolidated message instead of a burst).
  if (alerts.length > 0) {
    // A) ADVISORS: unchanged. One notification per alert per advisor, with the
    //    existing types and dedup_keys. The advisor dashboard, get-advisor-alerts
    //    feed and panels all filter on these three specific types, so this
    //    behaviour must stay exactly as before.
    for (const alert of alerts) {
      for (const advisorUserId of advisorUserIds) {
        await writeNotification(adminClient, {
          user_id: advisorUserId,
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

    // B) MEMBERS: one consolidated, calm message. The founder just uploaded and
    //    approved these figures, so the tone is informative, not alarming.
    const hasNegativeCash = alerts.some((a) => a.type === "alert_negative_cash");
    const summaryPriority: "important" | "action_required" = hasNegativeCash
      ? "action_required"
      : "important";

    let summaryTitle: string;
    let summaryBody: string;
    let summaryDeepLink: string;

    if (alerts.length === 1) {
      // Single condition: reuse the alert's own title, body and deep link.
      summaryTitle = alerts[0].title;
      summaryBody = alerts[0].body;
      summaryDeepLink = alerts[0].deep_link;
    } else {
      // Several conditions: gather the concrete numbers into one calm text
      //    and close with a single, lasting call to action.
      summaryTitle = `Et par tal værd at se på i ${currentFact.period_label}`;
      const details = alerts.map((a) => {
        switch (a.type) {
          case "alert_revenue_drop":
            return `Omsætningen faldt fra ${formatDKK(prev!.revenue!)} til ${formatDKK(cur.revenue!)}.`;
          case "alert_negative_cash":
            return `Likviditeten er negativ med ${formatDKK(cur.cash!)}.`;
          case "alert_result_negative":
            return `Resultatet vendte fra ${formatDKK(prev!.ebt!)} til ${formatDKK(cur.ebt!)}.`;
          default:
            return a.body;
        }
      });
      summaryBody = `${details.join(" ")} Du kan se de fulde tal på dine KPI'er, når du har tid.`;
      summaryDeepLink = "/kpis";
    }

    for (const memberUserId of memberUserIds) {
      await writeNotification(adminClient, {
        user_id: memberUserId,
        type: "alert_financial_summary",
        priority: summaryPriority,
        title: summaryTitle,
        body: summaryBody,
        deep_link: summaryDeepLink,
        company_id: company_id,
        reference_type: "report",
        reference_id: report_id,
        dedup_key: `alert_financial_summary:${company_id}:${period_key}`,
      });
    }
  }

  return new Response(
    JSON.stringify({ alerts_written: alerts.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
