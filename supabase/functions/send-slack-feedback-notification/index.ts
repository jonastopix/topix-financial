import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const categoryLabels: Record<string, { emoji: string; label: string }> = {
  bug: { emoji: "🐛", label: "Ny bug-rapport" },
  suggestion: { emoji: "💡", label: "Nyt forslag" },
  other: { emoji: "📣", label: "Ny feedback" },
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
    const { feedback_id } = await req.json();
    if (!feedback_id) {
      return json({ error: "feedback_id required" }, 400);
    }

    // ── Caller→resource access check (JWT-scoped) ──
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: accessCheck, error: accessErr } = await callerClient
      .from("feedback")
      .select("id, user_id")
      .eq("id", feedback_id)
      .maybeSingle();

    if (accessErr) {
      console.error("Access check query error:", accessErr);
      return json({ error: "Internal server error" }, 500);
    }
    if (!accessCheck) {
      return json({ ok: true, skipped: "no_access" });
    }
    if (accessCheck.user_id !== callerId) {
      return json({ ok: true, skipped: "not_owner" });
    }

    // ── Service-role client ──
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Guard: skip if sender is advisor/admin ──
    const { data: senderRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["advisor", "admin"])
      .maybeSingle();

    if (senderRole) {
      return json({ ok: true, skipped: "sender_is_advisor" });
    }

    // ── Fetch feedback ──
    const { data: feedback, error: feedbackErr } = await admin
      .from("feedback")
      .select("id, category, title, description, company_id, user_id, created_at")
      .eq("id", feedback_id)
      .single();

    if (feedbackErr || !feedback) {
      return json({ ok: true, skipped: "feedback_not_found" });
    }

    // ── Fetch context ──
    const [companyRes, profileRes] = await Promise.all([
      feedback.company_id
        ? admin.from("companies").select("name").eq("id", feedback.company_id).single()
        : Promise.resolve({ data: null }),
      admin.from("profiles").select("full_name").eq("user_id", feedback.user_id).single(),
    ]);

    const companyName = companyRes.data?.name || "Ingen virksomhed";
    const memberName = profileRes.data?.full_name || "Ukendt bruger";
    const cat = categoryLabels[feedback.category] || categoryLabels.other;
    const descPreview = feedback.description
      ? feedback.description.length > 200
        ? feedback.description.slice(0, 200) + "…"
        : feedback.description
      : null;

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

    const feedbackLink = `${appUrl}/admin/feedback`;

    // ── Post Slack message ──
    const sectionText = [
      `*${companyName}* — ${memberName}`,
      `*${feedback.title}*`,
      descPreview ? `> ${descPreview}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${cat.emoji}  *${companyName}*  ·  ${cat.label.toLowerCase()}: ${feedback.title}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: sectionText,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${feedbackLink}|Se feedback →>`,
          },
        ],
      },
    ];

    await postToSlack(SLACK_BOT_TOKEN, {
      channel: SLACK_CHANNEL,
      text: `${cat.emoji} ${cat.label}: ${feedback.title} — ${companyName}`,
      blocks,
    });

    // ── Create advisor notification ──
    await admin.from("advisor_notifications").insert({
      type: "feedback_submitted",
      title: `${cat.label}: ${feedback.title}`,
      body: `${companyName} — ${memberName}`,
      company_id: feedback.company_id || "00000000-0000-0000-0000-000000000000",
      member_id: feedback.user_id,
      reference_id: feedback.id,
      reference_type: "feedback",
    });

    return json({ ok: true });
  } catch (err) {
    console.error("send-slack-feedback-notification error:", err);
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
