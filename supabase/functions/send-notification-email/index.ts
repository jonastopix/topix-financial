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
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const SENDER_DOMAIN = "mail.topix.dk";
const VERIFIED_FROM_EMAIL = `noreply@${SENDER_DOMAIN}`;
const SENDER_FROM = `The Boardroom <${VERIFIED_FROM_EMAIL}>`;
const APP_URL = "https://app.theboardroom.dk";
const MAX_EMAILS_PER_DAY = 5;

const EMAIL_SUBJECTS: Record<string, string> = {
  advisor_replied: "Ny besked fra din rådgiver",
  report_review_ready: "Dine tal er klar til gennemsyn",
  report_error: "Din rapport kunne ikke behandles",
  report_committed: "Nyt commit fra dit boardroom-medlem",
  milestone_completed: "Milestone fuldført",
  pulse_checkin_received: "Nyt pulse check-in fra dit member",
  weekly_focus_ready: "Ugens fokus er klar",
};

const NOTIFICATION_TEMPLATE_NAMES: Record<string, string> = {
  advisor_replied:        "Notifikation: Ny besked fra rådgiver",
  report_review_ready:    "Notifikation: Rapport klar til gennemsyn",
  report_error:           "Notifikation: Rapport fejl",
  report_committed:       "Notifikation: Rapport godkendt",
  milestone_completed:    "Notifikation: Milestone fuldført",
  pulse_checkin_received: "Notifikation: Pulse check-in modtaget",
  weekly_focus_ready:     "Notifikation: Ugens fokus klar",
};

function buildEmailHtml(title: string, body: string, deepLink: string, ctaLabel?: string, eyebrow?: string, highlight?: string): string {
  const fullUrl = `${APP_URL}${deepLink}`;
  const logoMark = `<div style="width:28px;height:28px;background:#16a34a;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-right:10px"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="5" height="5" rx="1" fill="white"/><rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity=".6"/><rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity=".6"/><rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity=".3"/></svg></div>`;

  const highlightBlock = highlight
    ? `<div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 6px 6px 0;padding:12px 14px;margin:16px 0"><p style="color:#166534;font-size:13px;margin:0;font-weight:500">${highlight}</p></div>`
    : '';
  const eyebrowBlock = eyebrow
    ? `<p style="font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">${eyebrow}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background-color:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px 0">
<div style="max-width:520px;margin:0 auto">
  <div style="background:hsl(170,46%,14%);border-radius:10px 10px 0 0;padding:18px 28px;display:flex;align-items:center">
    ${logoMark}
    <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-.01em">The Boardroom</span>
  </div>
  <div style="background:#ffffff;border-radius:0 0 10px 10px;padding:28px 28px 0">
    ${eyebrowBlock}
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">${title}</h1>
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px">${body}</p>
    ${highlightBlock}
    <div style="padding:20px 0">
      <a href="${fullUrl}" target="_blank" style="background:#16a34a;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 28px;text-decoration:none;letter-spacing:-.01em">${ctaLabel || 'Åbn i The Boardroom'} →</a>
    </div>
    <div style="height:0.5px;background:#e5e7eb;margin:0"></div>
    <div style="padding:16px 0;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · theboardroom.dk</span>
      <a href="${APP_URL}/settings" style="font-size:12px;color:#9ca3af;text-decoration:underline">Administrer notifikationer</a>
    </div>
  </div>
</div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Service-role only (cron) — use JWT claims parsing (same as process-email-queue)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const claims = parseJwtClaims(token);
  if (claims?.role !== "service_role") {
    return json({ error: "Forbidden" }, 403);
  }

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

    // Load notification email templates (one query for all types)
    const { data: notifTemplates } = await admin
      .from("email_templates")
      .select("name, subject, body_html, sender_name, sender_email, enabled")
      .in("name", Object.values(NOTIFICATION_TEMPLATE_NAMES));

    const notifTemplateMap = new Map(
      (notifTemplates || [])
        .filter((t: any) => t.enabled)
        .map((t: any) => [t.name, t])
    );

    // Auto-create missing templates (disabled by default) so they appear in admin panel
    for (const [type, tplName] of Object.entries(NOTIFICATION_TEMPLATE_NAMES)) {
      const exists = (notifTemplates || []).some((t: any) => t.name === tplName);
      if (!exists) {
        const defaultSubject = EMAIL_SUBJECTS[type] || tplName;
        await admin.from("email_templates").insert({
          name: tplName,
          subject: defaultSubject,
          body_html: buildEmailHtml(
            defaultSubject,
            "{{body}}",
            "{{deep_link}}",
            "{{cta_label}}",
            "{{eyebrow}}",
            "{{highlight}}"
          ),
          sender_name: "The Boardroom",
          sender_email: VERIFIED_FROM_EMAIL,
          trigger_type: "event",
          trigger_config: { event: type },
          enabled: false,
        });
      }
    }

    let sent = 0;
    let skipped = 0;

    // Group by user for anti-spam check
    const userIds = [...new Set(pending.map((n: any) => n.user_id))];

    // Advisor/admin role lookup for email suppression
    const { data: advisorRoleRows } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds)
      .in("role", ["advisor", "admin"]);
    const advisorUserIds = new Set((advisorRoleRows || []).map((r: any) => r.user_id));

    // Advisors receive Slack notifications — email is for members only
    const ADVISOR_EMAIL_DISABLED = true;

    // Fetch notification email preferences per user
    const { data: profileRows } = await admin
      .from("profiles")
      .select("user_id, notification_email_prefs")
      .in("user_id", userIds);
    const prefsByUser = new Map(
      (profileRows || []).map((p: any) => [p.user_id, p.notification_email_prefs])
    );

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

    const ctaLabels: Record<string, string> = {
      report_review_ready: "Gennemgå mine tal →",
      report_error: "Prøv igen →",
      advisor_replied: "Læs beskeden →",
      report_committed: "Se virksomhedens tal →",
      weekly_focus_ready: "Se ugens fokus",
    };
    const eyebrows: Record<string, string> = {
      report_review_ready: "Dine tal er klar",
      report_error: "Rapport fejl",
      advisor_replied: "Ny besked",
      weekly_focus_ready: "Ugens fokus",
    };
    const highlights: Record<string, string> = {
      report_review_ready: "Omsætning, dækningsbidrag og resultat er klar til verifikation.",
      report_error: "Prøv at eksportere filen direkte fra dit regnskabsprogram og upload igen.",
    };

    for (const notif of pending) {
      const userDailyCount = countMap[notif.user_id] || 0;
      if (userDailyCount >= MAX_EMAILS_PER_DAY) {
        console.log(`[anti-spam] Skipping user ${notif.user_id} (${userDailyCount} emails today)`);
        skipped++;
        continue;
      }

      // Advisor/admin email suppression: skip email for Slack-covered events
      if (advisorUserIds.has(notif.user_id)) {
        // Mark email_sent_at to prevent future retries, but don't actually send
        await admin
          .from("notifications")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("id", notif.id);
        console.log(`[advisor-skip] Skipping email for advisor ${notif.user_id}, type=${notif.type}`);
        skipped++;
        continue;
      }

      // User email preference opt-out
      const userPrefs = prefsByUser.get(notif.user_id);
      if (userPrefs) {
        const priorityKey = notif.priority as string;
        if ((userPrefs as any)[priorityKey] === false) {
          await admin
            .from("notifications")
            .update({ email_sent_at: new Date().toISOString() })
            .eq("id", notif.id);
          console.log(`[pref-optout] User ${notif.user_id} opted out of ${priorityKey} emails`);
          skipped++;
          continue;
        }
      }

      // Get user email
      const { data: userData } = await admin.auth.admin.getUserById(notif.user_id);
      if (!userData?.user?.email) {
        skipped++;
        continue;
      }

      // Template-aware subject and body rendering
      const tplName = NOTIFICATION_TEMPLATE_NAMES[notif.type];
      const tpl = tplName ? notifTemplateMap.get(tplName) : undefined;

      // Subject: use DB template if available, else hardcoded fallback
      const subject = tpl?.subject
        ? tpl.subject
            .replace("{{title}}", notif.title)
            .replace("{{type}}", notif.type)
        : (EMAIL_SUBJECTS[notif.type] || notif.title);

      // Body: use DB template if available, else buildEmailHtml with hardcoded content
      const deepLink = notif.deep_link || "/";
      const html = tpl?.body_html
        ? tpl.body_html
            .replace(/\{\{body\}\}/g, notif.body || "")
            .replace(/\{\{deep_link\}\}/g, notif.deep_link || "/")
            .replace(/\{\{cta_label\}\}/g, ctaLabels[notif.type] || "Åbn i The Boardroom →")
            .replace(/\{\{eyebrow\}\}/g, eyebrows[notif.type] || "")
            .replace(/\{\{highlight\}\}/g, highlights[notif.type] || "")
            .replace(/\{\{title\}\}/g, notif.title)
            .replace(/\{\{first_name\}\}/g, "")
        : buildEmailHtml(
            notif.title,
            notif.body || "",
            deepLink,
            ctaLabels[notif.type],
            eyebrows[notif.type],
            highlights[notif.type]
          );

      const senderFrom = tpl?.sender_name
        ? `${tpl.sender_name} <${VERIFIED_FROM_EMAIL}>`
        : SENDER_FROM;

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
          idempotency_key: messageId,
          to: userData.user.email,
          from: senderFrom,
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
