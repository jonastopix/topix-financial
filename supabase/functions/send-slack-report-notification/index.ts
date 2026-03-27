import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { writeNotification, writeNotificationToMany } from "../_shared/notificationWriter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }

    const callerId = claimsData.claims.sub as string;
    const body = await req.json();
    const event = body.event || "report_uploaded";

    // ── NEW: report_committed event ──
    if (event === "report_committed") {
      const { reportId, periodLabel } = body;
      if (!reportId) return json({ error: "missing reportId" }, 400);

      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceRoleKey);

      const { data: report } = await admin
        .from("financial_reports")
        .select("id, company_id, user_id, report_period")
        .eq("id", reportId)
        .single();

      if (!report) return json({ error: "report not found" }, 404);

      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", report.company_id)
        .single();

      const companyName = company?.name || "Ukendt virksomhed";
      const period = periodLabel || report.report_period || "ukendt periode";

      const { data: advisorRoles } = await admin
        .from("user_roles")
        .select("user_id")
        .in("role", ["advisor", "admin"]);

      const advisorIds = (advisorRoles || []).map((r: any) => r.user_id);

      if (advisorIds.length > 0) {
        await writeNotificationToMany(admin, advisorIds, {
          type: "report_committed",
          priority: "info",
          title: `${companyName} har godkendt sine tal for ${period}`,
          body: `Tallene for ${period} er verificeret og klar. AI-analysen er aktiveret.`,
          reference_type: "report",
          reference_id: reportId,
          deep_link: `/members/${report.user_id}?reportId=${reportId}`,
          company_id: report.company_id,
          dedup_key: `report_committed:${reportId}`,
        });
      }

      return json({ ok: true, notified: advisorIds.length });
    }
    // ── END report_committed ──

    // ── milestone_completed event ──
    if (event === "milestone_completed") {
      const { companyId: milestoneCompanyId, milestoneTitle } = body;
      if (!milestoneCompanyId) return json({ error: "missing companyId" }, 400);

      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceRoleKey);

      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", milestoneCompanyId)
        .single();

      const companyName = company?.name || "Et member";
      const title = milestoneTitle ? `"${milestoneTitle}"` : "Et milestone";

      const { data: advisorRoles } = await admin
        .from("user_roles")
        .select("user_id")
        .in("role", ["advisor", "admin"]);

      const advisorIds = (advisorRoles || []).map((r: any) => r.user_id);

      if (advisorIds.length > 0) {
        await writeNotificationToMany(admin, advisorIds, {
          type: "milestone_completed",
          priority: "info",
          title: `${companyName} har nået ${title}`,
          body: `Milestone fuldført — ${companyName} er et skridt tættere på sit mål.`,
          reference_type: "milestone",
          company_id: milestoneCompanyId,
          deep_link: `/members?companyId=${milestoneCompanyId}`,
          dedup_key: `milestone_completed:${milestoneCompanyId}:${milestoneTitle || "unknown"}:${Date.now()}`,
        });
      }

      return json({ ok: true, notified: advisorIds.length });
    }
    // ── END milestone_completed ──

    // ── pulse_checkin_received event ──
    if (event === "pulse_checkin_received") {
      const { companyId: pulseCompanyId, periodKey: pulsePeriodKey } = body;
      if (!pulseCompanyId) return json({ error: "missing companyId" }, 400);

      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceRoleKey);

      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", pulseCompanyId)
        .single();

      const companyName = company?.name || "Et member";
      const months = ["Januar","Februar","Marts","April","Maj","Juni",
        "Juli","August","September","Oktober","November","December"];
      const periodLabel = pulsePeriodKey
        ? (() => { const [y,m] = pulsePeriodKey.split("-"); return `${months[parseInt(m,10)-1]} ${y}`; })()
        : "denne måned";

      const { data: advisorRoles } = await admin
        .from("user_roles")
        .select("user_id")
        .in("role", ["advisor", "admin"]);

      const advisorIds = (advisorRoles || []).map((r: any) => r.user_id);

      if (advisorIds.length > 0) {
        await writeNotificationToMany(admin, advisorIds, {
          type: "pulse_checkin_received",
          priority: "info",
          title: `${companyName} har udfyldt pulse check-in for ${periodLabel}`,
          body: `Læs hvad der gik godt og hvad der er den største udfordring inden jeres næste session.`,
          reference_type: "pulse",
          company_id: pulseCompanyId,
          deep_link: `/members?companyId=${pulseCompanyId}`,
          dedup_key: `pulse_checkin:${pulseCompanyId}:${pulsePeriodKey || "unknown"}`,
        });
      }

      return json({ ok: true, notified: advisorIds.length });
    }
    // ── END pulse_checkin_received ──

    // ── milestone_deadline_reminder event ──
    if (event === "milestone_deadline_reminder") {
      const { milestoneId, milestoneTitle, daysUntil, userId, companyId: msCompanyId } = body;
      if (!userId || !milestoneId) return json({ error: "missing userId or milestoneId" }, 400);

      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceRoleKey);

      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();

      const firstName = profile?.full_name?.split(" ")[0] || "dig";
      const title = `"${milestoneTitle || "Dit milestone"}" — deadline om ${daysUntil} dag${daysUntil !== 1 ? "e" : ""}`;
      const body_text = `Hej ${firstName} — du har ${daysUntil} dag${daysUntil !== 1 ? "e" : ""} til at nå dit milestone. Opdater din fremgang inden boardroom-sessionen.`;

      await writeNotification(admin, {
        user_id: userId,
        type: "milestone_deadline_reminder",
        priority: "important",
        title,
        body: body_text,
        reference_type: "milestone",
        reference_id: milestoneId,
        deep_link: "/milestones",
        company_id: msCompanyId || undefined,
        dedup_key: `milestone_deadline:${milestoneId}:${daysUntil}d`,
      });

      return json({ ok: true });
    }
    // ── END milestone_deadline_reminder ──

    const { report_id, message_id } = body;
    if (!report_id || !message_id) {
      return json({ error: "report_id and message_id required" }, 400);
    }

    // ── Caller→resource access check (JWT-scoped, before service-role) ──
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: accessCheck, error: accessErr } = await callerClient
      .from("financial_reports")
      .select("id, user_id")
      .eq("id", report_id)
      .maybeSingle();

    if (accessErr) {
      console.error("Access check query error:", accessErr);
      return json({ error: "Internal server error" }, 500);
    }
    if (!accessCheck) {
      return json({ ok: true, skipped: "no_access" });
    }
    if (accessCheck.user_id !== callerId) {
      return json({ ok: true, skipped: "not_uploader" });
    }

    // ── All access checks passed — create service-role client ──
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Guard: sender must not be advisor/admin ──
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const isAdvisorOrAdmin = (callerRoles || []).some(
      (r: any) => r.role === "advisor" || r.role === "admin"
    );
    if (isAdvisorOrAdmin) {
      return json({ ok: true, skipped: "sender_is_advisor" });
    }

    // ── Idempotency check ──
    const { data: existingLog } = await admin
      .from("slack_report_notification_log")
      .select("id")
      .eq("message_id", message_id)
      .maybeSingle();

    if (existingLog) {
      return json({ ok: true, skipped: "already_notified" });
    }

    // ── Fetch report (full data via service role) ──
    const { data: report, error: reportErr } = await admin
      .from("financial_reports")
      .select("id, company_id, user_id, file_name, file_path, report_period, report_type, uploaded_at")
      .eq("id", report_id)
      .single();

    if (reportErr || !report) {
      console.log("Report not found:", report_id);
      return json({ ok: true, skipped: "report_not_found" });
    }

    // ── Fetch context ──
    const [companyRes, profileRes] = await Promise.all([
      admin.from("companies").select("name").eq("id", report.company_id).single(),
      admin.from("profiles").select("full_name").eq("user_id", report.user_id).single(),
    ]);

    const companyName = companyRes.data?.name || "Ukendt virksomhed";
    const uploaderName = profileRes.data?.full_name || "Ukendt bruger";
    const reportPeriod = report.report_period || "Ukendt periode";
    const reportLabel = report.report_type === "saldobalance" ? "Saldobalance" : "Resultatopgørelse";

    // ── Slack config ──
    const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
    const SLACK_CHANNEL = Deno.env.get("SLACK_ADVISOR_CHANNEL_ID");
    if (!SLACK_BOT_TOKEN || !SLACK_CHANNEL) {
      console.error("Missing SLACK_BOT_TOKEN or SLACK_ADVISOR_CHANNEL_ID");
      return json({ ok: false, error: "slack_not_configured" }, 500);
    }

    const appUrl =
      Deno.env.get("PUBLIC_APP_URL") ||
      Deno.env.get("APP_URL") ||
      "https://topix.lovable.app";

    const reportLink = `${appUrl}/reports?reportId=${report.id}`;
    const uploadTime = new Date(report.uploaded_at).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" });

    // ── Post Slack message (mrkdwn only, no buttons) ──
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: `📊 Ny rapport fra ${companyName}`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${reportLabel}* · ${reportPeriod}\nFil: \`${report.file_name}\`\nUploadet af ${uploaderName} · ${uploadTime}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${reportLink}|Åbn rapport →>`,
          },
        ],
      },
    ];

    const slackRes = await postToSlack(SLACK_BOT_TOKEN, {
      channel: SLACK_CHANNEL,
      text: `Ny ${reportLabel.toLowerCase()} fra ${companyName}: ${reportPeriod}`,
      blocks,
    });

    // ── Log notification ──
    await admin.from("slack_report_notification_log").insert({
      report_id: report.id,
      message_id,
      company_id: report.company_id,
      slack_channel_id: SLACK_CHANNEL,
      slack_ts: slackRes?.ts || null,
    });

    // ── Create advisor notification (legacy — dual write) ──
    await admin.from("advisor_notifications").insert({
      type: "report_uploaded",
      title: `Ny ${reportLabel.toLowerCase()} fra ${companyName}`,
      body: `${reportLabel} for ${reportPeriod}`,
      company_id: report.company_id,
      member_id: report.user_id,
      reference_id: report.id,
      reference_type: "report",
    });

    // ── NEW notifications table (dual write, phase 1) ──
    const { data: advisorRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["advisor", "admin"]);
    const advisorIds = (advisorRoles || []).map((r: any) => r.user_id);

    if (advisorIds.length > 0) {
      const deepLink = `/members/${report.user_id}?reportId=${report.id}`;
      await writeNotificationToMany(admin, advisorIds, {
        type: "report_uploaded",
        priority: "info",
        title: `Ny ${reportLabel.toLowerCase()} fra ${companyName}`,
        body: `${reportLabel} for ${reportPeriod}`,
        reference_type: "report",
        reference_id: report.id,
        deep_link: deepLink,
        company_id: report.company_id,
        dedup_key: `report_uploaded:${report.id}`,
      });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("send-slack-report-notification error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function postToSlack(
  token: string,
  body: Record<string, unknown>,
  retryCount = 0
): Promise<{ ok: boolean; ts?: string } | null> {
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && retryCount < 1) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
      await res.text();
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return postToSlack(token, body, retryCount + 1);
    }

    const data = await res.json();
    if (!data.ok) {
      console.error("Slack API error:", data.error);
      return null;
    }
    return data;
  } catch (e) {
    console.error("Slack fetch error:", e);
    return null;
  }
}
