import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message_id } = await req.json();
    if (!message_id) {
      return new Response(JSON.stringify({ error: "message_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Fetch message ──
    const { data: message, error: msgErr } = await admin
      .from("messages")
      .select("id, conversation_id, sender_id, content, message_type, context_type, context_meta, created_at")
      .eq("id", message_id)
      .single();

    if (msgErr || !message) {
      console.log("Message not found:", message_id);
      return json({ ok: true, skipped: "message_not_found" });
    }

    // ── Guard: only human user messages ──
    if (message.message_type !== "user") {
      return json({ ok: true, skipped: "not_user_message" });
    }

    // ── Guard: sender must not be advisor/admin ──
    const { data: senderRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", message.sender_id);

    const isAdvisorOrAdmin = (senderRoles || []).some(
      (r: any) => r.role === "advisor" || r.role === "admin"
    );
    if (isAdvisorOrAdmin) {
      return json({ ok: true, skipped: "sender_is_advisor" });
    }

    // ── Idempotency check ──
    const { data: existingLog } = await admin
      .from("slack_notification_log")
      .select("id")
      .eq("message_id", message_id)
      .eq("notification_type", "new_chat_message")
      .maybeSingle();

    if (existingLog) {
      return json({ ok: true, skipped: "already_notified" });
    }

    // ── Fetch context ──
    const { data: conversation } = await admin
      .from("conversations")
      .select("id, company_id, member_id")
      .eq("id", message.conversation_id)
      .single();

    if (!conversation?.company_id) {
      return json({ ok: true, skipped: "no_company" });
    }

    const [companyRes, profileRes] = await Promise.all([
      admin.from("companies").select("name").eq("id", conversation.company_id).single(),
      admin.from("profiles").select("full_name").eq("user_id", message.sender_id).single(),
    ]);

    const companyName = companyRes.data?.name || "Ukendt virksomhed";
    const senderName = profileRes.data?.full_name || "Ukendt afsender";
    const preview = (message.content || "").slice(0, 250);
    const contextType = message.context_type || null;

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

    const deepLink = `${appUrl}/chat?conversationId=${conversation.id}&messageId=${message.id}`;

    // ── Race-safe thread creation (claim-first) ──
    let threadTs: string | null = null;
    let isNewThread = false;

    // Try to claim thread creation
    const { error: insertErr } = await admin
      .from("slack_conversation_threads")
      .insert({
        conversation_id: conversation.id,
        company_id: conversation.company_id,
        slack_channel_id: SLACK_CHANNEL,
        status: "creating",
      });

    if (!insertErr) {
      // We won the claim — post root message
      isNewThread = true;

      const contextBadge = contextType
        ? ` • ${contextType.charAt(0).toUpperCase() + contextType.slice(1)}`
        : "";

      const emoji = chatEmoji(contextType);

      const rootBlocks = [
        {
          type: "header",
          text: { type: "plain_text", text: `${emoji} Ny chat fra ${companyName}`, emoji: true },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${senderName}*${contextBadge}\n>${preview}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `${new Date(message.created_at).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" })} · <${deepLink}|Åbn chat →>`,
            },
          ],
        },
      ];

      const slackRes = await postToSlack(SLACK_BOT_TOKEN, {
        channel: SLACK_CHANNEL,
        text: `Ny chat fra ${companyName}: ${preview}`,
        blocks: rootBlocks,
      });

      if (slackRes?.ts) {
        threadTs = slackRes.ts;
        await admin
          .from("slack_conversation_threads")
          .update({ slack_thread_ts: threadTs, status: "ready" })
          .eq("conversation_id", conversation.id);
      } else {
        // Failed to post — clean up claim
        await admin
          .from("slack_conversation_threads")
          .delete()
          .eq("conversation_id", conversation.id)
          .eq("status", "creating");
        console.error("Failed to post root Slack message");
        return json({ ok: false, error: "slack_post_failed" }, 500);
      }
    } else {
      // Conflict — another request owns thread creation
      // Poll until ready (max 5s)
      for (let i = 0; i < 10; i++) {
        const { data: row } = await admin
          .from("slack_conversation_threads")
          .select("slack_thread_ts, status")
          .eq("conversation_id", conversation.id)
          .single();

        if (row?.status === "ready" && row.slack_thread_ts) {
          threadTs = row.slack_thread_ts;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!threadTs) {
        console.error("Timed out waiting for thread creation");
        return json({ ok: false, error: "thread_creation_timeout" }, 500);
      }
    }

    // ── Post reply (if existing thread) ──
    if (!isNewThread && threadTs) {
      const replyBlocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `💬 *${senderName}* fra ${companyName}\n>${preview}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `${new Date(message.created_at).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" })} • <${deepLink}|Åbn besked>`,
            },
          ],
        },
      ];

      await postToSlack(SLACK_BOT_TOKEN, {
        channel: SLACK_CHANNEL,
        thread_ts: threadTs,
        reply_broadcast: true,
        text: `💬 ${senderName} fra ${companyName}: ${preview}`,
        blocks: replyBlocks,
      });
    }

    // ── Log notification (idempotency) ──
    await admin.from("slack_notification_log").insert({
      message_id: message.id,
      conversation_id: conversation.id,
      company_id: conversation.company_id,
      slack_channel_id: SLACK_CHANNEL,
      slack_ts: threadTs,
      slack_thread_ts: isNewThread ? null : threadTs,
    });

    // ── Create advisor notification (server-side) ──
    await admin.from("advisor_notifications").insert({
      type: "new_message",
      title: `Ny besked fra ${senderName}`,
      body: preview.length > 100 ? preview.slice(0, 100) + "…" : preview,
      company_id: conversation.company_id,
      member_id: message.sender_id,
      reference_id: message.id,
      reference_type: "chat",
    });

    return json({ ok: true, isNewThread });
  } catch (err) {
    console.error("send-slack-chat-notification error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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
      console.log(`Slack rate limited, retrying after ${retryAfter}s`);
      await res.text(); // consume body
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
