import { Resend } from 'npm:resend@4.0.0'

const DANISH_MONTHS = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Hardcoded fallback if no template exists in DB
const FALLBACK_SUBJECT = 'Påmindelse: Rapport for {{period}} mangler';
const FALLBACK_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0"><div style="max-width:480px;margin:0 auto;padding:0 12px"><h1 style="color:#1a1a2e;font-size:24px;font-weight:bold;margin:40px 0 20px">Rapport mangler for {{period}}</h1><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Hej! Vi mangler stadig den månedlige rapport for <strong>{{period}}</strong> fra <strong>{{company_name}}</strong>.</p><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Upload venligst jeres rapport, så vi kan følge med i virksomhedens udvikling.</p><div style="text-align:center;margin:32px 0"><a href="{{report_url}}" target="_blank" style="background-color:#6366f1;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 32px;text-decoration:none">Upload rapport</a></div><p style="color:#898989;font-size:12px;line-height:20px;margin-top:32px">Denne påmindelse er sendt fra The Boardroom. Hvis rapporten allerede er uploadet, kan du ignorere denne besked.</p></div></body></html>`;
const FALLBACK_SENDER = 'The Boardroom <noreply@boardroom.topix.dk>';

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
    let testEmail: string | null = null;
    try {
      const body = await req.clone().json();
      if (body?.test_email) testEmail = body.test_email;
    } catch { /* no body */ }

    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;

    if (!testEmail && !isServiceRole) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    let senderFrom = FALLBACK_SENDER;
    let templateId: string | null = null;

    const { data: tpl } = await supabase
      .from('email_templates')
      .select('id, subject, body_html, sender_name, sender_email, enabled')
      .eq('name', 'Rapport-påmindelse')
      .maybeSingle();

    if (tpl && tpl.enabled) {
      templateId = tpl.id;
      subjectTpl = tpl.subject;
      bodyTpl = tpl.body_html;
      senderFrom = `${tpl.sender_name} <${tpl.sender_email}>`;
      console.log('[send-report-reminder] Using DB template');
    } else {
      if (tpl) templateId = tpl.id;
      console.log('[send-report-reminder] Using fallback template');
    }

    // Ensure we have a templateId for logging
    if (!templateId) {
      const { data: newTpl } = await supabase
        .from('email_templates')
        .insert({
          name: 'Rapport-påmindelse',
          subject: FALLBACK_SUBJECT,
          body_html: FALLBACK_HTML,
          sender_name: 'The Boardroom',
          sender_email: 'noreply@boardroom.topix.dk',
          trigger_type: 'cron',
          enabled: false,
        })
        .select('id')
        .single();
      if (newTpl) templateId = newTpl.id;
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

    // --- Test mode ---
    if (testEmail) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
      const resend = new Resend(resendApiKey);

      const { subject, html } = buildEmail("Test Virksomhed", expectedPeriod, true);
      const { error: sendErr } = await resend.emails.send({
        from: senderFrom, to: [testEmail], subject, html,
      });

      if (templateId) {
        await supabase.from('email_send_log').insert({
          template_id: templateId, recipient_email: testEmail, subject,
          status: sendErr ? 'failed' : 'sent',
          error_message: sendErr ? JSON.stringify(sendErr) : null,
          is_test: true,
        });
      }
      if (sendErr) throw new Error(`Send failed: ${JSON.stringify(sendErr)}`);

      console.log(`[TEST] Reminder sent to: ${testEmail}`);
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

    const { data: existingReports, error: repErr } = await supabase
      .from("financial_reports").select("company_id").eq("report_period", expectedPeriod);
    if (repErr) throw repErr;

    const reportedIds = new Set((existingReports || []).map((r: any) => r.company_id));
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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    let resend: InstanceType<typeof Resend> | null = null;
    if (emailEnabled) {
      if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
      resend = new Resend(resendApiKey);
    }

    let sent = 0, skipped = 0;

    for (const company of missingCompanies) {
      const { data: members } = await supabase
        .from("company_members").select("user_id").eq("company_id", company.id);
      if (!members?.length) continue;

      for (const member of members) {
        const { data: userData } = await supabase.auth.admin.getUserById(member.user_id);
        if (!userData?.user?.email) continue;
        const email = userData.user.email;

        if (!emailEnabled) {
          console.log(`[BLOCKED] Would send to: ${email} (${company.name})`);
          skipped++;
          continue;
        }

        try {
          const { subject, html } = buildEmail(company.name, expectedPeriod, false);
          const { error: sendErr } = await resend!.emails.send({
            from: senderFrom, to: [email], subject, html,
          });
          if (templateId) {
            await supabase.from('email_send_log').insert({
              template_id: templateId, recipient_email: email, subject,
              status: sendErr ? 'failed' : 'sent',
              error_message: sendErr ? JSON.stringify(sendErr) : null,
              is_test: false,
            });
          }
          if (sendErr) { console.error(`Failed ${email}:`, sendErr); continue; }
          console.log(`[LIVE] Sent to: ${email} (${company.name})`);
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
