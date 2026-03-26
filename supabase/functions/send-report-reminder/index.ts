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
const FALLBACK_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0"><div style="max-width:480px;margin:0 auto;padding:0 12px"><h1 style="color:#1a1a2e;font-size:24px;font-weight:bold;margin:40px 0 20px">Din rapport for {{period}} mangler</h1><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Hej {{first_name}},</p><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Vi har endnu ikke modtaget din rapport for <strong>{{period}}</strong>. Upload den når du har et øjeblik — det tager under 2 minutter, og vi trækker tallene ud automatisk.</p><div style="text-align:center;margin:32px 0"><a href="{{report_url}}" target="_blank" style="background-color:#16a34a;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 32px;text-decoration:none">Upload rapport nu</a></div><p style="color:#898989;font-size:12px;line-height:20px;margin-top:32px">Hvis rapporten allerede er uploadet kan du se bort fra denne besked.</p></div></body></html>`;

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

    console.log(`[send-report-reminder] Period: ${expectedPeriod}${testEmail ? ` | TEST → ${testEmail}` : ''}`);

    // --- Fetch template from DB (by name), fallback to hardcoded ---
    let subjectTpl = FALLBACK_SUBJECT;
    let bodyTpl = FALLBACK_HTML;
    let senderFrom = SENDER;

    const { data: tpl } = await supabase
      .from('email_templates')
      .select('id, subject, body_html, sender_name, sender_email, enabled')
      .eq('name', 'Rapport-påmindelse')
      .maybeSingle();

    if (tpl && tpl.enabled) {
      subjectTpl = tpl.subject;
      bodyTpl = tpl.body_html;
      senderFrom = resolveSenderFromTemplate(tpl.sender_name, tpl.sender_email);
      console.log('[send-report-reminder] Using DB template');
    } else {
      console.log('[send-report-reminder] Using fallback template');
    }

    // Ensure we have a templateId for logging
    if (!tpl) {
      await supabase
        .from('email_templates')
        .insert({
          name: 'Rapport-påmindelse',
          subject: FALLBACK_SUBJECT,
          body_html: FALLBACK_HTML,
          sender_name: 'The Boardroom',
          sender_email: VERIFIED_FROM_EMAIL,
          trigger_type: 'cron',
          enabled: false,
        })
        .select('id')
        .single();
    }

    const reportUrl = "https://topix.lovable.app/reports";

    // Helper to build email for a specific company
    function buildEmail(companyName: string, period: string, isTest: boolean) {
      const vars: Record<string, string> = {
        period,
        company_name: companyName,
        report_url: reportUrl,
      };
      const subject = (isTest ? '[TEST] ' : '') + replaceVars(subjectTpl, vars);
      const html = replaceVars(bodyTpl, vars);
      return { subject, html };
    }

    // Helper to enqueue a reminder email
    async function enqueueReminder(recipientEmail: string, companyName: string, period: string, isTest: boolean) {
      const { subject, html } = buildEmail(companyName, period, isTest);
      const messageId = crypto.randomUUID();

      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'report-reminder',
        recipient_email: recipientEmail,
        status: 'pending',
      });

      const { error: enqueueError } = await supabase.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          to: recipientEmail,
          from: senderFrom,
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

    // Fetch minimal fields for effective-period resolution; exclude soft-deleted reports
    const { data: existingReports, error: repErr } = await supabase
      .from("financial_reports")
      .select("company_id, report_period, manual_override_status, manual_report_period_label, manual_report_period_key")
      .is("deleted_at", null);
    if (repErr) throw repErr;

    // Resolve effective period per report — exclusive, not additive
    const reportedIds = new Set<string>();
    for (const r of existingReports || []) {
      if (r.manual_override_status === 'applied') {
        if (r.manual_report_period_key) {
          if (r.manual_report_period_key === expectedPeriodKey) reportedIds.add(r.company_id);
        } else if (r.manual_report_period_label === expectedPeriod) {
          reportedIds.add(r.company_id);
        }
      } else {
        if (r.report_period === expectedPeriod) reportedIds.add(r.company_id);
      }
    }
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

    const emailEnabled = Deno.env.get("EMAIL_SENDING_ENABLED")?.trim().toLowerCase() === "true";

    let sent = 0, skipped = 0;

    for (const company of missingCompanies) {
      const { data: members } = await supabase
        .from("company_members").select("user_id").eq("company_id", company.id);
      if (!members?.length) continue;

      for (const member of members) {
        const { data: userData } = await supabase.auth.admin.getUserById(member.user_id);
        if (!userData?.user?.email) continue;
        const email = userData.user.email;

        // ── Phase 2: Write report_reminder notification (with email_sent_at to prevent double email) ──
        try {
          const { writeNotification } = await import("../_shared/notificationWriter.ts");
          await writeNotification(supabase, {
            user_id: member.user_id,
            type: "report_reminder",
            priority: "action_required",
            title: `Rapport for ${expectedPeriod} mangler`,
            body: `Upload venligst rapporten for ${company.name}.`,
            reference_type: "report",
            deep_link: "/reports",
            company_id: company.id,
            dedup_key: `report_reminder:${company.id}:${expectedPeriodKey}`,
          });
          // Mark email_sent_at immediately since this function already sends the email
          await supabase
            .from("notifications")
            .update({ email_sent_at: new Date().toISOString() })
            .eq("user_id", member.user_id)
            .eq("dedup_key", `report_reminder:${company.id}:${expectedPeriodKey}`);
        } catch (notifErr) {
          console.error(`[Phase2] report_reminder notification error (non-blocking):`, notifErr);
        }

        if (!emailEnabled) {
          console.log(`[BLOCKED] Would send to: ${email} (${company.name})`);
          skipped++;
          continue;
        }

        try {
          await enqueueReminder(email, company.name, expectedPeriod, false);
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