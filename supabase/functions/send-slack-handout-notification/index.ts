import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Module key → Danish display title */
const moduleTitles: Record<string, string> = {
  overordnet: "Målsætning 12 mdr.",
  bogholderi: "Bogholderi",
  administration: "Administration",
  salg: "Salg",
  marketing: "Marketing",
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
    const { data: claimsData, error: claimsError } =
      await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }

    const callerId = claimsData.claims.sub as string;
    const { handout_id } = await req.json();
    if (!handout_id) {
      return json({ error: "handout_id required" }, 400);
    }

    // ── Caller→resource access check (JWT-scoped, before service-role) ──
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: accessCheck, error: accessErr } = await callerClient
      .from("handouts")
      .select("id, user_id")
      .eq("id", handout_id)
      .maybeSingle();

    if (accessErr) {
      console.error("Access check query error:", accessErr);
      return json({ error: "Internal server error" }, 500);
    }
    if (!accessCheck) {
      return json({ ok: true, skipped: "no_access" });
    }
    if (accessCheck.user_id !== callerId) {
      // Caller can see it (advisor) but is not the owner — skip notification
      return json({ ok: true, skipped: "sender_is_advisor" });
    }

    // ── All access checks passed — create service-role client ──
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Fetch handout (full data via service role) ──
    const { data: handout, error: handoutErr } = await admin
      .from("handouts")
      .select("id, module, company_id, user_id, completed_at, status")
      .eq("id", handout_id)
      .single();

    if (handoutErr || !handout) {
      console.log("Handout not found:", handout_id);
      return json({ ok: true, skipped: "handout_not_found" });
    }

    // ── Must be completed ──
    if (handout.status !== "completed" || !handout.completed_at) {
      return json({ ok: true, skipped: "not_completed" });
    }

    // ── Idempotency: UNIQUE(handout_id, completed_at) ──
    const { data: existingLog } = await admin
      .from("slack_handout_notification_log")
      .select("id")
      .eq("handout_id", handout.id)
      .eq("completed_at", handout.completed_at)
      .maybeSingle();

    if (existingLog) {
      return json({ ok: true, skipped: "already_notified" });
    }

    // ── Fetch context ──
    const [companyRes, profileRes] = await Promise.all([
      admin.from("companies").select("name").eq("id", handout.company_id).single(),
      admin.from("profiles").select("full_name").eq("user_id", handout.user_id).single(),
    ]);

    const companyName = companyRes.data?.name || "Ukendt virksomhed";
    const memberName = profileRes.data?.full_name || "Ukendt bruger";
    const moduleTitle = moduleTitles[handout.module] || handout.module;
    const completionTime = new Date(handout.completed_at).toLocaleString("da-DK", {
      timeZone: "Europe/Copenhagen",
    });

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
      "https://app.theboardroom.dk";

    // Deep link: opens advisor member detail with handout context
    const handoutLink = `${appUrl}/members/${handout.user_id}?handout=${handout.module}`;

    // ── Post Slack message ──
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📝 Handout udfyldt: ${moduleTitle}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${companyName}*\nUdfyldt af ${memberName} · ${completionTime}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${handoutLink}|Åbn handout →>`,
          },
        ],
      },
    ];

    const slackRes = await postToSlack(SLACK_BOT_TOKEN, {
      channel: SLACK_CHANNEL,
      text: `📝 Handout udfyldt: ${moduleTitle} — ${companyName}`,
      blocks,
    });

    // ── Log notification (idempotency) ──
    await admin.from("slack_handout_notification_log").insert({
      handout_id: handout.id,
      completed_at: handout.completed_at,
      company_id: handout.company_id,
      slack_channel_id: SLACK_CHANNEL,
      slack_ts: slackRes?.ts || null,
    });

    // ── Create advisor notification (legacy — dual write) ──
    await admin.from("advisor_notifications").insert({
      type: "handout_completed",
      title: `Handout udfyldt: ${moduleTitle}`,
      body: `${companyName} — ${memberName}`,
      company_id: handout.company_id,
      member_id: handout.user_id,
      reference_id: handout.id,
      reference_type: "handout",
    });

    // ── NEW notifications table (dual write, phase 1) ──
    const { data: advisorRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["advisor", "admin"]);
    const advisorIds = (advisorRoles || []).map((r: any) => r.user_id);

    if (advisorIds.length > 0) {
      const handoutDeepLink = `/members/${handout.user_id}?handout=${handout.module}`;
      await writeNotificationToMany(admin, advisorIds, {
        type: "handout_completed",
        priority: "info",
        title: `${companyName} har udfyldt handout: ${moduleTitle}`,
        body: `${companyName} — ${memberName}`,
        reference_type: "handout",
        reference_id: handout.id,
        deep_link: handoutDeepLink,
        company_id: handout.company_id,
        dedup_key: `handout_completed:${handout.id}`,
      });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("send-slack-handout-notification error:", err);
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
