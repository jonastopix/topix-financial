import React from 'npm:react@18.3.1'
import { Resend } from 'npm:resend@4.0.0'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

// ---------- Inline email template ----------
interface ReminderEmailProps {
  companyName: string;
  period: string;
  reportUrl: string;
}

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
}
const containerStyle = {
  paddingLeft: '12px',
  paddingRight: '12px',
  margin: '0 auto',
  maxWidth: '480px',
}
const h1 = {
  color: '#1a1a2e',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  margin: '40px 0 20px',
}
const text = {
  color: '#333',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '16px 0',
}
const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}
const button = {
  backgroundColor: '#6366f1',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '600' as const,
  padding: '12px 32px',
  textDecoration: 'none',
}
const footer = {
  color: '#898989',
  fontSize: '12px',
  lineHeight: '20px',
  marginTop: '32px',
}

const ReminderEmail = ({ companyName, period, reportUrl }: ReminderEmailProps) => (
  React.createElement(Html, null,
    React.createElement(Head),
    React.createElement(Preview, null, `Påmindelse: Rapport for ${period} mangler`),
    React.createElement(Body, { style: main },
      React.createElement(Container, { style: containerStyle },
        React.createElement(Heading, { style: h1 }, `Rapport mangler for ${period}`),
        React.createElement(Text, { style: text },
          'Hej! Vi mangler stadig den månedlige rapport for ',
          React.createElement('strong', null, period),
          ' fra ',
          React.createElement('strong', null, companyName),
          '.'
        ),
        React.createElement(Text, { style: text },
          'Upload venligst jeres rapport, så vi kan følge med i virksomhedens udvikling.'
        ),
        React.createElement(Section, { style: buttonContainer },
          React.createElement(Link, { href: reportUrl, target: '_blank', style: button }, 'Upload rapport')
        ),
        React.createElement(Text, { style: footer },
          'Denne påmindelse er sendt fra The Boardroom. Hvis rapporten allerede er uploadet, kan du ignorere denne besked.'
        )
      )
    )
  )
)

// ---------- Edge function ----------
const DANISH_MONTHS = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

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
    // Parse body early to check for test mode
    let testEmail: string | null = null;
    let bodyParsed = false;
    try {
      const body = await req.clone().json();
      if (body?.test_email) testEmail = body.test_email;
      bodyParsed = true;
    } catch { /* no body */ }

    // Validate authorization
    // test_email mode: allow any authenticated request (verify_jwt=false handles gateway auth)
    // production mode: require service-role key (from pg_cron)
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;

    if (!testEmail && !isServiceRole) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // testEmail already parsed above

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey!);

    // Calculate expected period: previous month
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const expectedPeriod = `${DANISH_MONTHS[prevMonth.getMonth()]} ${prevMonth.getFullYear()}`;

    console.log(`[send-report-reminder] Period: ${expectedPeriod}${testEmail ? ` | TEST MODE → ${testEmail}` : ''}`);

    // If test_email is provided, send a single test email directly
    if (testEmail) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
      const resend = new Resend(resendApiKey);

      const html = await renderAsync(
        React.createElement(ReminderEmail, {
          companyName: "Test Virksomhed",
          period: expectedPeriod,
          reportUrl: "https://boardroom.topix.dk/reports",
        })
      );

      const { error: sendErr } = await resend.emails.send({
        from: "The Boardroom <noreply@boardroom.topix.dk>",
        to: [testEmail],
        subject: `[TEST] Påmindelse: Rapport for ${expectedPeriod} mangler`,
        html,
      });

      if (sendErr) throw new Error(`Send failed: ${JSON.stringify(sendErr)}`);

      console.log(`[TEST] Reminder sent to: ${testEmail}`);
      return new Response(JSON.stringify({ test: true, sent_to: testEmail, period: expectedPeriod }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Normal flow: find companies missing reports ---
    const { data: companies, error: compErr } = await supabase
      .from("companies")
      .select("id, name, start_date, created_at")
      .eq("status", "active");

    if (compErr) throw compErr;
    if (!companies?.length) {
      console.log("[send-report-reminder] No active companies found");
      return new Response(JSON.stringify({ sent: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingReports, error: repErr } = await supabase
      .from("financial_reports")
      .select("company_id")
      .eq("report_period", expectedPeriod);

    if (repErr) throw repErr;

    const reportedCompanyIds = new Set((existingReports || []).map((r: any) => r.company_id));

    const missingCompanies = companies.filter((c: any) => {
      if (reportedCompanyIds.has(c.id)) return false;
      const companyStart = new Date(c.start_date || c.created_at);
      const earliestReportMonth = new Date(companyStart.getFullYear(), companyStart.getMonth() - 1, 1);
      if (prevMonth.getTime() < earliestReportMonth.getTime()) {
        console.log(`[send-report-reminder] Skipping ${c.name}: too new`);
        return false;
      }
      return true;
    });

    if (!missingCompanies.length) {
      console.log(`[send-report-reminder] All eligible companies have reported for ${expectedPeriod}`);
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

    const reportUrl = "https://boardroom.topix.dk/reports";
    let sent = 0;
    let skipped = 0;

    for (const company of missingCompanies) {
      const { data: members, error: memErr } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", company.id);

      if (memErr) { console.error(`[send-report-reminder] Members error for ${company.name}:`, memErr); continue; }
      if (!members?.length) continue;

      for (const member of members) {
        const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(member.user_id);
        if (userErr || !userData?.user?.email) { console.error(`[send-report-reminder] No email for user ${member.user_id}`); continue; }

        const email = userData.user.email;

        if (!emailEnabled) {
          console.log(`[BLOCKED] Would send to: ${email} (${company.name}) for ${expectedPeriod}`);
          skipped++;
          continue;
        }

        try {
          const html = await renderAsync(
            React.createElement(ReminderEmail, { companyName: company.name, period: expectedPeriod, reportUrl })
          );

          const { error: sendErr } = await resend!.emails.send({
            from: "The Boardroom <noreply@boardroom.topix.dk>",
            to: [email],
            subject: `Påmindelse: Rapport for ${expectedPeriod} mangler`,
            html,
          });

          if (sendErr) { console.error(`[send-report-reminder] Failed ${email}:`, sendErr); continue; }
          console.log(`[LIVE] Sent to: ${email} (${company.name}) for ${expectedPeriod}`);
          sent++;
        } catch (sendError) {
          console.error(`[send-report-reminder] Error ${email}:`, sendError);
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
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
