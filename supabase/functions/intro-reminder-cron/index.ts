import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { bulletproofButton, fallbackLinkBlock } from "../_shared/emailButtonHelpers.ts";

// Daglig cron: paaminder fulde medlemmer der endnu ikke har booket deres inkluderede
// intro-session hos Morten. Foerste mail 2 dage efter medlemskabsstart, derefter maanedligt
// indtil de booker (intro_session_used_at saettes) eller kontrakten udloeber.
// Spejler legat-reminder-cron: ingen Deno.serve, kun Deno.cron. Send-vej, bruger-opslag og
// opt-out-tjek er genbrugt verbatim fra send-pulse-reminder.

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SENDER_DOMAIN = "boardroom.topix.dk";
const VERIFIED_FROM_EMAIL = `noreply@${SENDER_DOMAIN}`;
const SENDER = `Morten fra The Boardroom <${VERIFIED_FROM_EMAIL}>`;
const APP_URL = "https://app.theboardroom.dk";

function buildIntroReminderHtml(firstName: string, bookingUrl: string): string {
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
    <p style="font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">Din sparring med Morten</p>
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">Du har en sparring med mig til gode</h1>
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px">Hej ${firstName},</p>
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px">Du har en sparring med mig paa 30 minutter inkluderet i dit medlemskab, og den har du ikke booket endnu.</p>
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px">Den er der, naar du har brug for den. Du vaelger selv tidspunktet.</p>
    ${bulletproofButton({ href: bookingUrl, label: "Book din session", bgColor: "#16a34a" })}
    ${fallbackLinkBlock(bookingUrl)}
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px">Morten</p>
    <div style="height:0.5px;background:#e5e7eb;margin:0"></div>
    <div style="padding:16px 0">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · theboardroom.dk &nbsp;·&nbsp; <a href="${APP_URL}/settings" style="font-size:12px;color:#9ca3af;text-decoration:underline">Administrer notifikationer</a></span>
    </div>
  </div>
</div>
</body>
</html>`;
}

Deno.cron("intro-session-reminder", "0 9 * * *", async () => {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const bookingUrl = `${APP_URL}/book-session`;

  // 1. Maalgruppe: fulde medlemmer (aktiv kontrakt) der ikke har booket, og hvor der enten
  //    aldrig er sendt en paamindelse eller der er gaaet over 30 dage siden sidst.
  const { data: companies, error: companiesErr } = await supabase
    .from("companies")
    .select("id, name, contract_start_date, created_at, intro_reminder_last_sent_at")
    .gt("contract_end_date", nowIso)          // aktiv kontrakt = tier full
    .is("intro_session_used_at", null)         // har ikke booket endnu
    .or(`intro_reminder_last_sent_at.is.null,intro_reminder_last_sent_at.lt.${thirtyDaysAgo}`);

  if (companiesErr) {
    console.error("[intro-reminder-cron] Failed to fetch companies:", companiesErr.message);
    return;
  }

  if (!companies || companies.length === 0) {
    console.log("[intro-reminder-cron] No eligible companies found");
    return;
  }

  let sent = 0;
  let skipped = 0;

  for (const company of companies) {
    try {
      // 2. Mindst 2 dage medlem. Start = contract_start_date hvis sat, ellers created_at.
      const start = company.contract_start_date ?? company.created_at;
      const daysSinceStart = Math.floor(
        (Date.now() - new Date(start).getTime()) / 86400000
      );
      if (daysSinceStart < 2) {
        continue;
      }

      // 3. Find medlemsbrugeren (samme moenster som send-pulse-reminder + create-free-intro-booking).
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

      // 4. Fornavn + opt-out (samme moenster som send-pulse-reminder).
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, notification_email_prefs")
        .eq("user_id", member.user_id)
        .maybeSingle();

      const prefs = (profile?.notification_email_prefs as any) || {};
      if (prefs.intro_reminders === false) {
        skipped++;
        continue;
      }

      const firstName = profile?.full_name?.split(" ")[0] || "dig";
      const subject = "Du har en sparring med mig til gode";
      const html = buildIntroReminderHtml(firstName, bookingUrl);
      const messageId = crypto.randomUUID();

      // 5. Send-vej (verbatim fra send-pulse-reminder): log pending -> enqueue.
      await supabase.from("email_send_log").insert({
        message_id: messageId,
        template_name: "intro-reminder",
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
          label: "intro-reminder",
          queued_at: new Date().toISOString(),
        },
      });

      if (enqueueError) {
        // Fejlet enqueue: last_sent opdateres IKKE, saa den proeves igen i morgen (ikke om en maaned).
        console.error(`[intro-reminder-cron] Enqueue failed for ${email}:`, enqueueError);
        continue;
      }

      // 6. Kun ved succes: markér hvornaar paamindelsen blev sendt (styrer maanedlig kadence).
      await supabase
        .from("companies")
        .update({ intro_reminder_last_sent_at: new Date().toISOString() })
        .eq("id", company.id);

      console.log(`[intro-reminder-cron] Enqueued for: ${email} (${company.name})`);
      sent++;
    } catch (err) {
      console.error(`[intro-reminder-cron] Error processing company ${company.id}:`, err);
    }
  }

  const summary = { sent, skipped, eligible: companies.length };
  console.log("[intro-reminder-cron] Summary:", JSON.stringify(summary));
});
