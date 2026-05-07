import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const SENDER_DOMAIN = "boardroom.topix.dk";
const VERIFIED_FROM_EMAIL = `noreply@${SENDER_DOMAIN}`;
const SENDER = `The Boardroom <${VERIFIED_FROM_EMAIL}>`;
const APP_URL = "https://app.theboardroom.dk";

import { bulletproofButton, fallbackLinkBlock } from "../_shared/emailButtonHelpers.ts";

function buildPulseHtml(firstName: string, companyName: string, pulseUrl: string): string {
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
    <p style="font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">Månedlig pulse · ${companyName}</p>
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">Hej ${firstName} — 2 minutter der gør en forskel</h1>
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px;white-space:pre-line">Det er tid til dit månedlige pulse check-in. Fortæl os hvad der gik godt, hvad der var svært, og hvad du har brug for hjælp til. Din rådgiver bruger dine svar til at give dig den bedste sparring.</p>
    <div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 6px 6px 0;padding:12px 14px;margin:16px 0">
      <p style="color:#166534;font-size:13px;margin:0;font-weight:500">Tager under 2 minutter — og giver din rådgiver det bedste udgangspunkt for næste møde.</p>
    </div>
    ${bulletproofButton({ href: pulseUrl, label: "Udfyld pulse check-in", bgColor: "#16a34a" })}
    ${fallbackLinkBlock(pulseUrl)}
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
  const authHeader = req.headers.get("Authorization") || "";
  const expectedToken = `Bearer ${serviceKey}`;
  if (authHeader !== expectedToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const now = new Date();
  const dayOfMonth = now.getDate();

  if (dayOfMonth !== 10) {
    return new Response(JSON.stringify({ skipped: true, reason: "Not day 10" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const pulseUrl = `${APP_URL}/pulse`;

  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { data: doneThisMonth } = await supabase
    .from("pulse_checkins")
    .select("company_id")
    .eq("period_key", periodKey);

  const doneIds = new Set((doneThisMonth || []).map((r: any) => r.company_id));
  const missing = (allCompanies || []).filter((c: any) => !doneIds.has(c.id));

  let sent = 0;
  let skipped = 0;

  for (const company of missing) {
    const { data: members } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", company.id)
      .eq("role", "member")
      .limit(1);

    const member = members?.[0] as any;
    if (!member?.user_id) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(member.user_id);
    const email = userData?.user?.email;
    if (!email) continue;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, notification_email_prefs")
      .eq("user_id", member.user_id)
      .maybeSingle();

    const prefs = (profile?.notification_email_prefs as any) || {};
    if (prefs.pulse_reminders === false) {
      skipped++;
      continue;
    }

    const firstName = profile?.full_name?.split(" ")[0] || "dig";
    const subject = `Husk dit pulse check-in for ${company.name}`;
    const html = buildPulseHtml(firstName, company.name, pulseUrl);
    const messageId = crypto.randomUUID();

    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: "pulse-reminder",
      recipient_email: email,
      status: "pending",
    });

    const { error: enqueueError } = await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        idempotency_key: messageId,
        to: email,
        from: SENDER,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: subject,
        purpose: "transactional",
        label: "pulse-reminder",
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error(`[send-pulse-reminder] Enqueue failed for ${email}:`, enqueueError);
      continue;
    }

    console.log(`[send-pulse-reminder] Enqueued for: ${email} (${company.name})`);
    sent++;
  }

  const summary = { sent, skipped, missing: missing.length, period: periodKey };
  console.log("[send-pulse-reminder] Summary:", JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
