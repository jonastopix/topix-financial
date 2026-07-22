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
 * - Anti-spam: max MAX_EMAILS_PER_DAY (5) emails/day per user, talt mod
 *   email_send_log (faktiske sends) — IKKE notifications.email_sent_at, som
 *   også sættes af commit-suppress/dispose og derfor ville æde kvoten.
 * - Rapport-notifikationer udvælges via selectNotificationEmails
 *   (_shared/notificationEmailSelection.ts): slettede/committede rapporter
 *   disposes, dubletter per (company, periode) kollapses, og kvote-udskudte
 *   mails sendes kun kl. 07-20 dansk tid (aldrig ved midnats-kvotereset).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import {
  REPORT_NOTIFICATION_TYPES,
  parseDkReportPeriodKey,
  selectNotificationEmails,
  type ReportJoin,
} from "../_shared/notificationEmailSelection.ts";

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

const SENDER_DOMAIN = "boardroom.topix.dk";
const VERIFIED_FROM_EMAIL = `noreply@${SENDER_DOMAIN}`;
const SENDER_FROM = `The Boardroom <${VERIFIED_FROM_EMAIL}>`;
const APP_URL = "https://app.theboardroom.dk";
const MAX_EMAILS_PER_DAY = 5;

const EMAIL_SUBJECTS: Record<string, string> = {
  advisor_replied: "Ny besked fra din rådgiver",
  chat_reply: "Ny besked fra din rådgiver",
  member_message: "Ny besked i chatten",
  report_review_ready: "Dine tal er klar til gennemsyn",
  report_error: "Din rapport kunne ikke behandles",
  report_committed: "Ny rapport godkendt",
  milestone_completed: "Milestone fuldført",
  pulse_checkin_received: "Nyt pulse check-in modtaget",
  weekly_focus_ready: "Ugens fokus er klar",
};

const NOTIFICATION_TEMPLATE_NAMES: Record<string, string> = {
  advisor_replied:        "Notifikation: Ny besked fra rådgiver",
  chat_reply:             "Notifikation: Ny besked fra rådgiver",
  member_message:         "Notifikation: Ny besked i chatten",
  report_review_ready:    "Notifikation: Rapport klar til gennemsyn",
  report_error:           "Notifikation: Rapport fejl",
  report_committed:       "Notifikation: Rapport godkendt",
  milestone_completed:    "Notifikation: Milestone fuldført",
  pulse_checkin_received: "Notifikation: Pulse check-in modtaget",
  weekly_focus_ready:     "Notifikation: Ugens fokus klar",
};

// Chat notification types that should be deduplicated and aggregated
const CHAT_NOTIFICATION_TYPES = new Set(["advisor_replied", "chat_reply"]);

import { bulletproofButton, fallbackLinkBlock } from "../_shared/emailButtonHelpers.ts";

function buildEmailHtml(title: string, body: string, deepLink: string, ctaLabel?: string, eyebrow?: string, highlight?: string): string {
  const fullUrl = `${APP_URL}${deepLink}`;

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
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse">
    <tr><td style="background-color:#133332;border-radius:10px 10px 0 0;padding:18px 28px">
      <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-.01em;font-family:'Manrope',Arial,sans-serif">The Boardroom</span>
    </td></tr>
  </table>
  <div style="background:#ffffff;border-radius:0 0 10px 10px;padding:28px 28px 0">
    ${eyebrowBlock}
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">${title}</h1>
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px">${body}</p>
    ${highlightBlock}
    ${bulletproofButton({ href: fullUrl, label: ctaLabel || 'Åbn i The Boardroom', bgColor: "#16a34a" })}
    ${fallbackLinkBlock(fullUrl)}
    <div style="height:0.5px;background:#e5e7eb;margin:0"></div>
    <div style="padding:16px 0">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · theboardroom.dk &nbsp;·&nbsp; <a href="${APP_URL}/settings" style="font-size:12px;color:#9ca3af;text-decoration:underline">Administrer notifikationer</a></span>
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
      .select("id, user_id, type, priority, title, body, deep_link, reference_id, company_id, created_at")
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

    // Resolve user emails up front (needed for both quota count and sending)
    const userEmailMap = new Map<string, string>();
    for (const uid of userIds) {
      const { data: userData } = await admin.auth.admin.getUserById(uid);
      if (userData?.user?.email) userEmailMap.set(uid, userData.user.email);
    }

    // Fetch daily email counts per user — counted against email_send_log
    // (actual send attempts). notifications.email_sent_at is ALSO set by
    // commit-suppress and delete-dispose without any mail being sent, so
    // counting that column would let suppressions eat the daily quota and
    // defer legitimate mails to the next quota window.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const emailToUser = new Map(
      [...userEmailMap.entries()].map(([uid, email]) => [email, uid]),
    );
    const countMap: Record<string, number> = {};
    if (emailToUser.size > 0) {
      const { data: dailyCounts } = await admin
        .from("email_send_log")
        .select("recipient_email")
        .gte("created_at", todayIso)
        .like("template_name", "notification-%")
        .in("recipient_email", [...emailToUser.keys()]);
      for (const row of dailyCounts || []) {
        const uid = emailToUser.get(row.recipient_email);
        if (uid) countMap[uid] = (countMap[uid] || 0) + 1;
      }
    }

    const ctaLabels: Record<string, string> = {
      report_review_ready: "Gennemgå mine tal →",
      report_error: "Prøv igen →",
      advisor_replied: "Læs beskeden →",
      chat_reply: "Læs beskeden →",
      report_committed: "Se virksomhedens tal →",
      weekly_focus_ready: "Se ugens fokus",
    };
    const eyebrows: Record<string, string> = {
      report_review_ready: "Dine tal er klar",
      report_error: "Rapport fejl",
      advisor_replied: "Ny besked",
      chat_reply: "Ny besked",
      weekly_focus_ready: "Ugens fokus",
    };
    const highlights: Record<string, string> = {
      report_review_ready: "Omsætning, dækningsbidrag og resultat er klar til verifikation.",
      report_error: "Prøv at eksportere filen direkte fra dit regnskabsprogram og upload igen.",
    };

    // ── Separate chat notifications from non-chat ──
    const chatNotifsByUser = new Map<string, any[]>();
    const nonChatNotifs: any[] = [];

    for (const notif of pending) {
      if (CHAT_NOTIFICATION_TYPES.has(notif.type)) {
        const existing = chatNotifsByUser.get(notif.user_id) || [];
        existing.push(notif);
        chatNotifsByUser.set(notif.user_id, existing);
      } else {
        nonChatNotifs.push(notif);
      }
    }

    // ── Rapport-tilstandsjoin: financial_reports + committed-state ──
    // Udvælgelsen (pure function) afgør mail/dispose/vent — se fejlspor
    // 2026-07-22 (natlige mails for slettede/duplikerede rapporter).
    const reportIds = [
      ...new Set(
        nonChatNotifs
          .filter((n: any) => REPORT_NOTIFICATION_TYPES.has(n.type) && n.reference_id)
          .map((n: any) => n.reference_id as string),
      ),
    ];
    const reportJoinMap = new Map<string, ReportJoin>();
    if (reportIds.length > 0) {
      const { data: reportRows } = await admin
        .from("financial_reports")
        .select("id, deleted_at, report_period, manual_report_period_key")
        .in("id", reportIds);
      const { data: factRows } = await admin
        .from("financial_report_facts")
        .select("source_report_id")
        .in("source_report_id", reportIds);
      const committedIds = new Set((factRows || []).map((f: any) => f.source_report_id));
      for (const r of reportRows || []) {
        reportJoinMap.set(r.id, {
          deleted_at: r.deleted_at,
          committed: committedIds.has(r.id),
          period_key: r.manual_report_period_key ?? parseDkReportPeriodKey(r.report_period),
        });
      }
    }

    const candidates = nonChatNotifs.map((n: any) => ({
      ...n,
      report:
        REPORT_NOTIFICATION_TYPES.has(n.type) && n.reference_id
          ? reportJoinMap.get(n.reference_id) ?? null // null = rapport findes ikke længere
          : undefined,
    }));

    const { toEmail, toDispose } = selectNotificationEmails(candidates);

    // Dispose: marker email_sent_at UDEN at sende — samme mekanisme som
    // commit-suppress. Rapporten er slettet/committet eller mailen er en
    // dublet for samme (company, periode).
    for (const notif of toDispose) {
      await admin
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", notif.id);
      console.log(
        `[dispose] ${notif.type} ${notif.id} (report=${notif.reference_id}) — slettet/committet/dublet, ingen mail`,
      );
      skipped++;
    }

    // ── Process aggregated chat notifications (one email per user) ──
    for (const [userId, chatNotifs] of chatNotifsByUser.entries()) {
      const userDailyCount = countMap[userId] || 0;
      if (userDailyCount >= MAX_EMAILS_PER_DAY) {
        console.log(`[anti-spam] Skipping chat notifs for user ${userId} (${userDailyCount} emails today)`);
        skipped += chatNotifs.length;
        continue;
      }

      if (advisorUserIds.has(userId)) {
        for (const n of chatNotifs) {
          await admin.from("notifications").update({ email_sent_at: new Date().toISOString() }).eq("id", n.id);
        }
        console.log(`[advisor-skip] Skipping ${chatNotifs.length} chat emails for advisor ${userId}`);
        skipped += chatNotifs.length;
        continue;
      }

      const userPrefs = prefsByUser.get(userId);
      if (userPrefs && (userPrefs as any).important === false) {
        for (const n of chatNotifs) {
          await admin.from("notifications").update({ email_sent_at: new Date().toISOString() }).eq("id", n.id);
        }
        console.log(`[pref-optout] User ${userId} opted out of important emails`);
        skipped += chatNotifs.length;
        continue;
      }

      const userEmail = userEmailMap.get(userId);
      if (!userEmail) {
        skipped += chatNotifs.length;
        continue;
      }

      // Aggregate: use the latest notification for deep_link, send one email
      const latestNotif = chatNotifs[chatNotifs.length - 1];
      const msgCount = chatNotifs.length;
      const subject = msgCount > 1
        ? `Du har ${msgCount} ulæste beskeder fra din rådgiver`
        : (EMAIL_SUBJECTS[latestNotif.type] || latestNotif.title);
      const body = msgCount > 1
        ? `Du har ${msgCount} ulæste beskeder. Log ind for at læse dem.`
        : (latestNotif.body || "");
      const deepLink = latestNotif.deep_link || "/chat";

      const html = buildEmailHtml(
        subject,
        body,
        deepLink,
        "Læs beskeden →",
        "Ny besked",
        undefined
      );

      const messageId = crypto.randomUUID();

      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: `notification-chat_aggregated`,
        recipient_email: userEmail,
        status: "pending",
      });

      const { error: enqueueErr } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          idempotency_key: messageId,
          to: userEmail,
          from: SENDER_FROM,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text: subject,
          purpose: "transactional",
          label: `notification-chat_aggregated`,
          queued_at: new Date().toISOString(),
        },
      });

      if (enqueueErr) {
        console.error(`Enqueue failed for aggregated chat notifs user ${userId}:`, enqueueErr);
        skipped += chatNotifs.length;
        continue;
      }

      // Mark all chat notifications as email_sent
      for (const n of chatNotifs) {
        await admin.from("notifications").update({ email_sent_at: new Date().toISOString() }).eq("id", n.id);
      }

      countMap[userId] = (countMap[userId] || 0) + 1;
      sent++;
    }

    // ── Process non-chat notifications (én mail per udvalgt kandidat) ──
    for (const notif of toEmail) {
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
      const userEmail = userEmailMap.get(notif.user_id);
      if (!userEmail) {
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
        recipient_email: userEmail,
        status: "pending",
      });

      // Enqueue via existing email queue
      const { error: enqueueErr } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          idempotency_key: messageId,
          to: userEmail,
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
