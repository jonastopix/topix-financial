/**
 * send-monthly-digest — Monthly personalised digest email to founders
 *
 * Admin/advisor only (browser or cron trigger).
 * Sends each founder a summary: KPI movement, upcoming milestones, unread advisor messages.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const SENDER_DOMAIN = "mail.topix.dk";
const FROM = `The Boardroom <noreply@${SENDER_DOMAIN}>`;
const APP_URL = "https://topix.lovable.app";

const DANISH_MONTHS = [
  "Januar","Februar","Marts","April","Maj","Juni",
  "Juli","August","September","Oktober","November","December",
];

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
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px;white-space:pre-line">${body}</p>
    ${highlightBlock}
    <div style="padding:20px 0">
      <a href="${fullUrl}" target="_blank" style="background:#16a34a;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 28px;text-decoration:none;letter-spacing:-.01em">${ctaLabel || 'Åbn i The Boardroom'} →</a>
    </div>
    <div style="height:0.5px;background:#e5e7eb;margin:0"></div>
    <div style="padding:16px 0;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · topix.dk</span>
      <a href="${APP_URL}/settings" style="font-size:12px;color:#9ca3af;text-decoration:underline">Administrer notifikationer</a>
    </div>
  </div>
</div>
</body>
</html>`;
}

function formatDKK(n: number): string {
  // Simple Danish number format
  const abs = Math.abs(n);
  const formatted = abs >= 1000
    ? abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    : abs.toFixed(0);
  return `${n < 0 ? "-" : ""}${formatted} kr.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Support service-role calls (cron) — bypass user auth
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const isServiceRole = authHeader === `Bearer ${serviceKey}`;

  if (!isServiceRole) {
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const { callerId, callerClient } = auth;

    // Verify caller is admin or advisor
    const { data: roleRow } = await callerClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["admin", "advisor"])
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, svcKey);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return json({ error: "RESEND_API_KEY not configured" }, 500);
  }

  // Allow manual override: POST body may contain { company_ids: string[] }
  let targetCompanyIds: string[] | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.company_ids) && body.company_ids.length > 0) {
      targetCompanyIds = body.company_ids;
    }
  } catch { /* ignore */ }

  // Fetch all company members
  const { data: members } = await adminClient
    .from("company_members")
    .select("company_id, user_id")
    .limit(500);

  if (!members?.length) {
    return json({ ok: true, sent: 0 });
  }

  // Deduplicate: one digest per company (first member = owner)
  const companyToUser = new Map<string, string>();
  for (const m of members) {
    if (!companyToUser.has(m.company_id)) companyToUser.set(m.company_id, m.user_id);
  }

  // Filter out advisors/admins
  const allUserIds = [...new Set(companyToUser.values())];
  const { data: roleRows } = await adminClient
    .from("user_roles")
    .select("user_id")
    .in("user_id", allUserIds)
    .in("role", ["advisor", "admin"]);
  const advisorIds = new Set((roleRows || []).map((r: { user_id: string }) => r.user_id));

  let sent = 0;
  const now = new Date();
  const currentMonthLabel = `${DANISH_MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  for (const [companyId, userId] of companyToUser) {
    if (targetCompanyIds && !targetCompanyIds.includes(companyId)) continue;
    if (advisorIds.has(userId)) continue;

    // Get user email
    const { data: userData } = await adminClient.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) continue;

    const { data: profile } = await adminClient
      .from("profiles").select("full_name, notification_email_prefs").eq("user_id", userId).maybeSingle();
    const firstName = profile?.full_name?.split(" ")[0] || "dig";

    // Respect user opt-out preference
    const digestPrefs = (profile?.notification_email_prefs as any) || {};
    if (digestPrefs.monthly_digest === false) {
      console.log(`[digest] User ${userId} opted out of monthly digest`);
      continue;
    }

    const { data: company } = await adminClient
      .from("companies").select("name").eq("id", companyId).maybeSingle();
    const companyName = company?.name || "";

    // Latest committed facts (most recent period)
    const { data: facts } = await adminClient
      .from("financial_report_facts")
      .select("period_label, metrics")
      .eq("company_id", companyId)
      .order("period_key", { ascending: false })
      .limit(2);

    // Active milestones with deadlines in next 30 days
    const in30Days = new Date(now.getTime() + 30 * 86400000).toISOString().split("T")[0];
    const { data: milestones } = await adminClient
      .from("milestones")
      .select("title, deadline, progress, target_value, current_value, unit")
      .eq("company_id", companyId)
      .lt("progress", 100)
      .neq("status", "parked")
      .not("deadline", "is", null)
      .lte("deadline", in30Days)
      .order("deadline", { ascending: true })
      .limit(3);

    // Unread advisor messages
    const { data: conv } = await adminClient
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();
    let unreadCount = 0;
    if (conv?.id) {
      const { count } = await adminClient
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .neq("sender_id", userId)
        .is("read_at", null)
        .eq("message_type", "user");
      unreadCount = count || 0;
    }

    // Build KPI highlight
    const latestFact = facts?.[0];
    const metrics = latestFact?.metrics as Record<string, number> | null;
    const revenue = metrics?.omsaetning;
    const result = metrics?.resultat_foer_skat;

    let highlight = "";
    if (revenue != null && latestFact?.period_label) {
      highlight = `${latestFact.period_label}: Omsætning ${formatDKK(revenue)}`;
      if (result != null) highlight += ` · Resultat ${formatDKK(result)}`;
    }

    // Build body
    const bodyLines = [`Her er dit overblik for ${currentMonthLabel}, ${firstName}.`];
    if (milestones?.length) {
      const msLines = milestones.map((m: { title: string; deadline: string | null }) => {
        const d = m.deadline
          ? new Date(m.deadline).toLocaleDateString("da-DK", { day: "numeric", month: "short" })
          : "";
        return `• ${m.title}${d ? ` (${d})` : ""}`;
      });
      bodyLines.push(`\nMilestones med deadline snart:\n${msLines.join("\n")}`);
    }
    if (unreadCount > 0) {
      bodyLines.push(`\nDu har ${unreadCount} ulæst${unreadCount > 1 ? "e" : ""} besked${unreadCount > 1 ? "er" : ""} fra din rådgiver.`);
    }
    if (!milestones?.length && unreadCount === 0 && !highlight) {
      bodyLines.push("Log ind for at se din seneste status og hold momentum oppe.");
    }

    // Add secondary action links when multiple content types are present
    if ((milestones?.length ?? 0) > 0 && unreadCount > 0) {
      bodyLines.push(`\nGå direkte til: <a href="${APP_URL}/chat" style="color:#16a34a">Beskeder</a> · <a href="${APP_URL}/milestones" style="color:#16a34a">Milestones</a> · <a href="${APP_URL}/kpis" style="color:#16a34a">Nøgletal</a>`);
    }

    // Choose the most relevant deep link based on what's in the digest
    let deepLink = "/";
    let ctaLabel = "Åbn dit boardroom";

    if (unreadCount > 0) {
      deepLink = "/chat";
      ctaLabel = "Læs beskeder fra din rådgiver";
    } else if (milestones?.length) {
      deepLink = "/milestones";
      ctaLabel = "Se dine milestones";
    } else if (revenue != null) {
      deepLink = "/kpis";
      ctaLabel = "Se dine nøgletal";
    }

    
    const html = buildEmailHtml(
      `Dit ${currentMonthLabel}-overblik`,
      bodyLines.join("\n"),
      deepLink,
      ctaLabel,
      `${companyName} · ${currentMonthLabel}`,
      highlight || undefined,
    );

    // Enqueue via email queue for retry safety
    const messageId = crypto.randomUUID();

    await adminClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: "monthly-digest",
      recipient_email: email,
      status: "pending",
    });

    const { error: enqueueErr } = await adminClient.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: email,
        from: FROM,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: subject,
        purpose: "transactional",
        label: "monthly-digest",
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueErr) {
      console.error(`[digest] Enqueue failed for ${email}:`, enqueueErr);
      continue;
    }

    sent++;
  }

  console.log(`[send-monthly-digest] Sent: ${sent}`);
  return json({ ok: true, sent });
});
