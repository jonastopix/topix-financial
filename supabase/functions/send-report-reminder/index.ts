const DANISH_MONTHS = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER_DOMAIN = 'mail.topix.dk';
const VERIFIED_FROM_EMAIL = 'noreply@mail.topix.dk';
const SENDER = `The Boardroom <${VERIFIED_FROM_EMAIL}>`;

function resolveSenderFromTemplate(
  senderName: string | null | undefined,
  senderEmail: string | null | undefined
): string {
  const safeName = (senderName ?? 'The Boardroom').trim() || 'The Boardroom';
  const normalizedEmail = (senderEmail ?? VERIFIED_FROM_EMAIL).trim().toLowerCase();
  const emailDomain = normalizedEmail.split('@')[1] ?? '';

  if (emailDomain !== SENDER_DOMAIN) {
    console.warn('[send-report-reminder] Overriding sender_email to verified domain', {
      configured_sender_email: senderEmail,
      enforced_domain: SENDER_DOMAIN,
    });
    return `${safeName} <${VERIFIED_FROM_EMAIL}>`;
  }

  return `${safeName} <${normalizedEmail}>`;
}

// Hardcoded fallback if no template exists in DB
const FALLBACK_SUBJECT = 'Påmindelse: Din rapport for {{period}} mangler';
const FALLBACK_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background-color:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px 0">
<div style="max-width:520px;margin:0 auto">
  <div style="background:hsl(170,46%,14%);border-radius:10px 10px 0 0;padding:18px 28px">
    <div style="width:28px;height:28px;background:#16a34a;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-right:10px"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" fill="white"/><rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity=".6"/><rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity=".6"/><rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity=".3"/></svg></div>
    <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-.01em">The Boardroom</span>
  </div>
  <div style="background:#ffffff;border-radius:0 0 10px 10px;padding:28px 28px 0">
    <p style="font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">Rapportering · {{period}}</p>
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">{{subject_line}}</h1>
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px">Hej {{first_name}} — {{intro}}</p>
    <div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 6px 6px 0;padding:12px 14px;margin:16px 0">
      <p style="color:#166534;font-size:13px;margin:0;font-weight:500">Eksportér direkte fra e-conomic, Dinero eller Billy og upload filen.</p>
    </div>
    <div style="padding:20px 0">
      <a href="{{report_url}}" target="_blank" style="background:#16a34a;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 28px;text-decoration:none">Upload rapport →</a>
    </div>
    <div style="height:0.5px;background:#e5e7eb"></div>
    <div style="padding:16px 0;display:flex;justify-content:space-between">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · theboardroom.dk</span>
      <a href="https://app.theboardroom.dk/settings" style="font-size:12px;color:#9ca3af;text-decoration:underline">Administrer notifikationer</a>
    </div>
  </div>
</div>
</body>
</html>`;

function replaceVars(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    while (result.includes(placeholder)) {
      result = result.replace(placeholder, value);
    }
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth gate: service role required for ALL paths ---
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body only after auth is confirmed
    let testEmail: string | null = null;
    try {
      const body = await req.clone().json();
      if (body?.test_email) testEmail = body.test_email;
    } catch { /* no body — normal cron flow */ }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Calculate expected period
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const expectedPeriod = `${DANISH_MONTHS[prevMonth.getMonth()]} ${prevMonth.getFullYear()}`;

    const dayOfMonth = now.getDate();

    // Reminder triggers: day 7 (gentle), day 15 (urgent), day 20 (critical)
    const REMINDER_DAYS = [7, 15, 20];
    const isReminderDay = REMINDER_DAYS.includes(dayOfMonth);

    console.log(`[send-report-reminder] Period: ${expectedPeriod} | Day: ${dayOfMonth}${testEmail ? ` | TEST → ${testEmail}` : ''}`);

    const reportUrl = "https://app.theboardroom.dk/reports";

    // Urgency-specific subjects and intros
    type Urgency = "gentle" | "urgent" | "critical";
    const subjectLines: Record<Urgency, string> = {
      gentle: `Husk at uploade din rapport`,
      urgent: `Din rapport mangler stadig`,
      critical: `Vigtigt — rapporten er forsinket`,
    };
    const intros: Record<Urgency, string> = {
      gentle: `vi har endnu ikke modtaget din rapport for <strong>{{period}}</strong>. Det tager under 2 minutter, og vi trækker tallene ud automatisk.`,
      urgent: `din rapport for <strong>{{period}}</strong> er stadig ikke modtaget. Upload den snarest så vi kan følge med i udviklingen og give dig den bedste sparring.`,
      critical: `vi mangler fortsat din rapport for <strong>{{period}}</strong>. Upload den hurtigst muligt.`,
    };
    const emailSubjects: Record<Urgency, string> = {
      gentle: `Husk: Upload din rapport for {{period}}`,
      urgent: `Din rapport for {{period}} mangler stadig`,
      critical: `Vigtigt: {{period}}-rapport er nu forsinket`,
    };

    // Template names per urgency level
    const TEMPLATE_NAMES: Record<Urgency, string> = {
      gentle:   "Rapport-påmindelse (venlig)",
      urgent:   "Rapport-påmindelse (presserende)",
      critical: "Rapport-påmindelse (kritisk)",
    };

    // Fetch all three templates in one query
    const { data: tpls } = await supabase
      .from('email_templates')
      .select('name, subject, body_html, sender_name, sender_email, enabled')
      .in('name', Object.values(TEMPLATE_NAMES));

    const tplMap = new Map((tpls || []).map((t: any) => [t.name, t]));

    // Ensure missing templates are auto-created (disabled by default)
    for (const [urgency, tplName] of Object.entries(TEMPLATE_NAMES) as [Urgency, string][]) {
      if (!tplMap.has(tplName)) {
        await supabase.from('email_templates').insert({
          name: tplName,
          subject: emailSubjects[urgency as Urgency],
          body_html: FALLBACK_HTML,
          sender_name: 'The Boardroom',
          sender_email: VERIFIED_FROM_EMAIL,
          trigger_type: 'cron',
          trigger_config: {
            schedule: urgency === 'gentle' ? '0 9 7 * *' : urgency === 'urgent' ? '0 9 15 * *' : '0 9 20 * *',
            description: urgency === 'gentle' ? 'Dag 7 i måneden' : urgency === 'urgent' ? 'Dag 15 i måneden' : 'Dag 20 i måneden',
          },
          enabled: false,
        });
        console.log(`[send-report-reminder] Auto-created template: ${tplName}`);
      }
    }

    // Helper to build email for a specific company
    function buildEmail(companyName: string, period: string, isTest: boolean, firstName?: string | null, urgency: Urgency = "gentle") {
      const tplName = TEMPLATE_NAMES[urgency];
      const tpl = tplMap.get(tplName);
      const activeSubjectTpl = (tpl?.enabled && tpl.subject) ? tpl.subject : emailSubjects[urgency];
      const activeBodyTpl = (tpl?.enabled && tpl.body_html) ? tpl.body_html : FALLBACK_HTML;
      const activeSender = (tpl?.enabled && tpl.sender_name)
        ? resolveSenderFromTemplate(tpl.sender_name, tpl.sender_email)
        : SENDER;

      const vars: Record<string, string> = {
        period,
        company_name: companyName,
        report_url: reportUrl,
        first_name: firstName || "dig",
        subject_line: subjectLines[urgency],
        intro: replaceVars(intros[urgency], { period }),
      };
      const subject = (isTest ? '[TEST] ' : '') + replaceVars(activeSubjectTpl, vars);
      const html = replaceVars(activeBodyTpl, vars);
      return { subject, html, sender: activeSender };
    }

    // Helper to enqueue a reminder email
    async function enqueueReminder(recipientEmail: string, companyName: string, period: string, isTest: boolean, firstName?: string | null, urgency: Urgency = "gentle") {
      const { subject, html, sender } = buildEmail(companyName, period, isTest, firstName, urgency);
      const messageId = crypto.randomUUID();

      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'report-reminder',
        recipient_email: recipientEmail,
        subject: subject,
        status: 'pending',
        is_test: isTest ?? false,
      });

      const { error: enqueueError } = await supabase.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          idempotency_key: messageId,
          to: recipientEmail,
          from: sender,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text: subject,
          purpose: 'transactional',
          label: 'report-reminder',
          queued_at: new Date().toISOString(),
        },
      });

      if (enqueueError) {
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: 'report-reminder',
          recipient_email: recipientEmail,
          status: 'failed',
          error_message: 'Failed to enqueue email',
        });
        throw new Error(`Failed to enqueue: ${JSON.stringify(enqueueError)}`);
      }

      return messageId;
    }

    // --- Test mode ---
    if (testEmail) {
      await enqueueReminder(testEmail, "Test Virksomhed", expectedPeriod, true);
      console.log(`[TEST] Reminder enqueued for: ${testEmail}`);
      return new Response(JSON.stringify({ test: true, sent_to: testEmail, period: expectedPeriod }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Day gate: only proceed on reminder days ---
    if (!isReminderDay) {
      return new Response(JSON.stringify({ skipped: "not a reminder day", day: dayOfMonth }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set urgency based on day of month
    const urgencyLevel: Urgency = dayOfMonth >= 20 ? "critical"
      : dayOfMonth >= 15 ? "urgent"
      : "gentle";

    // --- Normal flow ---
    const { data: companies, error: compErr } = await supabase
      .from("companies").select("id, name, start_date, created_at").eq("status", "active");
    if (compErr) throw compErr;
    if (!companies?.length) {
      return new Response(JSON.stringify({ sent: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute expected period key (YYYY-MM) for structured matching
    const expectedPeriodKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    // Check committed facts instead of uploaded reports
    // A reminder should only be skipped if the period is COMMITTED — not just uploaded
    const { data: committedFacts, error: factsErr } = await supabase
      .from("financial_report_facts")
      .select("company_id, period_key, source_type")
      .eq("period_key", expectedPeriodKey);
    if (factsErr) throw factsErr;

    const reportedIds = new Set<string>(
      (committedFacts || []).map((f: any) => f.company_id)
    );
    const missingCompanies = companies.filter((c: any) => {
      if (reportedIds.has(c.id)) return false;
      const start = new Date(c.start_date || c.created_at);
      const earliest = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      return prevMonth.getTime() >= earliest.getTime();
    });

    if (!missingCompanies.length) {
      return new Response(JSON.stringify({ sent: 0, skipped: companies.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailEnabled = true;

    let sent = 0, skipped = 0;

    for (const company of missingCompanies) {
      const { data: members } = await supabase
        .from("company_members").select("user_id").eq("company_id", company.id);
      if (!members?.length) continue;

      for (const member of members) {
        const { data: userData } = await supabase.auth.admin.getUserById(member.user_id);
        if (!userData?.user?.email) continue;
        const email = userData.user.email;

        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, notification_email_prefs")
          .eq("user_id", member.user_id)
          .maybeSingle();
        const memberFirstName = profileData?.full_name?.split(" ")[0] || null;

        // Respect user opt-out preference
        const reminderPrefs = (profileData?.notification_email_prefs as any) || {};
        if (reminderPrefs.report_reminders === false) {
          skipped++;
          continue;
        }

        // ── Phase 2: Write report_reminder notification (with email_sent_at to prevent double email) ──
        try {
          const { writeNotification } = await import("../_shared/notificationWriter.ts");
          await writeNotification(supabase, {
            user_id: member.user_id,
            type: "report_reminder",
            priority: dayOfMonth >= 15 ? "action_required" : "important",
            title: dayOfMonth >= 15
              ? `Rapport for ${expectedPeriod} mangler stadig`
              : `Husk: Upload din rapport for ${expectedPeriod}`,
            body: `Din rapport for ${expectedPeriod} mangler. Upload den direkte fra dit regnskabsprogram — det tager under 2 minutter.`,
            reference_type: "report",
            deep_link: "/reports",
            company_id: company.id,
            dedup_key: `report_reminder:${company.id}:${expectedPeriodKey}:d${dayOfMonth}`,
          });
          // Mark email_sent_at immediately since this function already sends the email
          await supabase
            .from("notifications")
            .update({ email_sent_at: new Date().toISOString() })
            .eq("user_id", member.user_id)
            .eq("dedup_key", `report_reminder:${company.id}:${expectedPeriodKey}:d${dayOfMonth}`);
        } catch (notifErr) {
          console.error(`[Phase2] report_reminder notification error (non-blocking):`, notifErr);
        }

        if (!emailEnabled) {
          console.log(`[BLOCKED] Would send to: ${email} (${company.name})`);
          skipped++;
          continue;
        }

        try {
          await enqueueReminder(email, company.name, expectedPeriod, false, memberFirstName, urgencyLevel);
          console.log(`[LIVE] Enqueued for: ${email} (${company.name})`);
          sent++;
        } catch (e) {
          console.error(`Error ${email}:`, e);
        }
      }
    }

    const summary = { sent, skipped, period: expectedPeriod, test_mode: !emailEnabled };
    console.log("[send-report-reminder] Summary:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("send-report-reminder error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});