import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";

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
    const { report_id, message_id } = await req.json();
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

    // ── Create advisor notification (server-side, single source of truth) ──
    await admin.from("advisor_notifications").insert({
      type: "report_uploaded",
      title: `Ny ${reportLabel.toLowerCase()} fra ${companyName}`,
      body: `${reportLabel} for ${reportPeriod}`,
      company_id: report.company_id,
      member_id: report.user_id,
      reference_id: report.id,
      reference_type: "report",
    });

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
