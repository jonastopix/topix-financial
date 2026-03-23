/**
 * send-notification-email — Phase 2 email worker
 *
 * Cron-triggered (service-role only). Polls unseen notifications
 * older than 15 minutes and enqueues email fallback.
 *
 * Rules:
 * - action_required: always send email (mandatory)
 * - important: send email (mandatory default, no preferences in phase 2)
 * - info: never send email
 * - report_reminder: skip (already emailed by send-report-reminder)
 * - Anti-spam: max 20 emails/day per user
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const SENDER_DOMAIN = "mail.topix.dk";
const VERIFIED_FROM_EMAIL = `noreply@${SENDER_DOMAIN}`;
const SENDER_FROM = `The Boardroom <${VERIFIED_FROM_EMAIL}>`;
const APP_URL = "https://topix.lovable.app";
const MAX_EMAILS_PER_DAY = 20;

const EMAIL_SUBJECTS: Record<string, string> = {
  advisor_replied: "Ny besked fra din rådgiver",
  report_review_ready: "Din rapport er klar til gennemsyn",
  report_error: "Der opstod en fejl med din rapport",
};

function buildEmailHtml(title: string, body: string, deepLink: string): string {
  const fullUrl = `${APP_URL}${deepLink}?returnUrl=${encodeURIComponent(deepLink)}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0"><div style="max-width:480px;margin:0 auto;padding:0 12px"><h1 style="color:#1a1a2e;font-size:24px;font-weight:bold;margin:40px 0 20px">${title}</h1><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">${body}</p><div style="text-align:center;margin:32px 0"><a href="${fullUrl}" target="_blank" style="background-color:#16a34a;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 32px;text-decoration:none">Åbn i The Boardroom</a></div><p style="color:#898989;font-size:12px;line-height:20px;margin-top:32px">Denne besked er sendt fra The Boardroom.</p></div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Service-role only (cron)
  const auth = authenticateServiceRole(req);
  if (auth instanceof Response) return auth;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Fetch unseen notifications eligible for email
    const { data: pending, error: fetchErr } = await admin
      .from("notifications")
      .select("id, user_id, type, priority, title, body, deep_link")
      .is("email_sent_at", null)
      .is("seen_at", null)
      .in("priority", ["action_required", "important"])
      .lt("created_at", fifteenMinAgo)
      .neq("type", "report_reminder") // Already emailed by send-report-reminder
      .order("created_at", { ascending: true })
      .limit(50);

    if (fetchErr) {
      console.error("Fetch error:", fetchErr);
      return json({ error: "fetch_failed" }, 500);
    }

    if (!pending?.length) {
      return json({ processed: 0 });
    }

    let sent = 0;
    let skipped = 0;

    // Group by user for anti-spam check
    const userIds = [...new Set(pending.map((n: any) => n.user_id))];

    // Fetch daily email counts per user
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const { data: dailyCounts } = await admin
      .from("notifications")
      .select("user_id")
      .not("email_sent_at", "is", null)
      .gte("email_sent_at", todayIso)
      .in("user_id", userIds);

    const countMap: Record<string, number> = {};
    for (const row of dailyCounts || []) {
      countMap[row.user_id] = (countMap[row.user_id] || 0) + 1;
    }

    for (const notif of pending) {
      const userDailyCount = countMap[notif.user_id] || 0;
      if (userDailyCount >= MAX_EMAILS_PER_DAY) {
        console.log(`[anti-spam] Skipping user ${notif.user_id} (${userDailyCount} emails today)`);
        skipped++;
        continue;
      }

      // Get user email
      const { data: userData } = await admin.auth.admin.getUserById(notif.user_id);
      if (!userData?.user?.email) {
        skipped++;
        continue;
      }

      const subject = EMAIL_SUBJECTS[notif.type] || notif.title;
      const deepLink = notif.deep_link || "/";
      const html = buildEmailHtml(notif.title, notif.body || "", deepLink);
      const messageId = crypto.randomUUID();

      // Log pending
      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: `notification-${notif.type}`,
        recipient_email: userData.user.email,
        status: "pending",
      });

      // Enqueue via existing email queue
      const { error: enqueueErr } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: userData.user.email,
          from: SENDER_FROM,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text: subject,
          purpose: "transactional",
          label: `notification-${notif.type}`,
          queued_at: new Date().toISOString(),
        },
      });

      if (enqueueErr) {
        console.error(`Enqueue failed for ${notif.id}:`, enqueueErr);
        skipped++;
        continue;
      }

      // Mark email_sent_at
      await admin
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", notif.id);

      countMap[notif.user_id] = (countMap[notif.user_id] || 0) + 1;
      sent++;
    }

    const summary = { processed: pending.length, sent, skipped };
    console.log("[send-notification-email] Summary:", JSON.stringify(summary));
    return json(summary);
  } catch (err) {
    console.error("send-notification-email error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
