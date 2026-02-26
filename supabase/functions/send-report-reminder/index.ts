import React from 'npm:react@18.3.1'
import { Resend } from 'npm:resend@4.0.0'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { ReminderEmail } from './_templates/reminder.tsx'

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
    // Validate authorization — only service-role key from pg_cron / manual trigger
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey!);

    // Calculate expected period: previous month
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const expectedPeriod = `${DANISH_MONTHS[prevMonth.getMonth()]} ${prevMonth.getFullYear()}`;

    console.log(`[send-report-reminder] Checking for missing reports for period: ${expectedPeriod}`);

    // Get all companies with status 'active'
    const { data: companies, error: compErr } = await supabase
      .from("companies")
      .select("id, name")
      .eq("status", "active");

    if (compErr) throw compErr;
    if (!companies?.length) {
      console.log("[send-report-reminder] No active companies found");
      return new Response(JSON.stringify({ sent: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all reports for this period
    const { data: existingReports, error: repErr } = await supabase
      .from("financial_reports")
      .select("company_id")
      .eq("report_period", expectedPeriod);

    if (repErr) throw repErr;

    const reportedCompanyIds = new Set((existingReports || []).map((r: any) => r.company_id));

    // Find companies missing reports
    const missingCompanies = companies.filter((c: any) => !reportedCompanyIds.has(c.id));

    if (!missingCompanies.length) {
      console.log(`[send-report-reminder] All companies have reported for ${expectedPeriod}`);
      return new Response(JSON.stringify({ sent: 0, skipped: companies.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Email toggle
    const emailEnabled = Deno.env.get("EMAIL_SENDING_ENABLED") === "true";
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
      // Get members + their auth emails
      const { data: members, error: memErr } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", company.id);

      if (memErr) {
        console.error(`[send-report-reminder] Error fetching members for ${company.name}:`, memErr);
        continue;
      }

      if (!members?.length) continue;

      // Get emails from auth.users via admin API
      for (const member of members) {
        const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(member.user_id);

        if (userErr || !userData?.user?.email) {
          console.error(`[send-report-reminder] Could not get email for user ${member.user_id}`);
          continue;
        }

        const email = userData.user.email;

        if (!emailEnabled) {
          console.log(`[TEST-MODE] Would send reminder to: ${email} (${company.name}) for ${expectedPeriod}`);
          skipped++;
          continue;
        }

        try {
          const html = await renderAsync(
            React.createElement(ReminderEmail, {
              companyName: company.name,
              period: expectedPeriod,
              reportUrl,
            })
          );

          const { error: sendErr } = await resend!.emails.send({
            from: "MOLA Founder <noreply@boardroom.topix.dk>",
            to: [email],
            subject: `Påmindelse: Rapport for ${expectedPeriod} mangler`,
            html,
          });

          if (sendErr) {
            console.error(`[send-report-reminder] Failed to send to ${email}:`, sendErr);
            continue;
          }

          console.log(`[LIVE] Reminder sent to: ${email} (${company.name}) for ${expectedPeriod}`);
          sent++;
        } catch (sendError) {
          console.error(`[send-report-reminder] Send error for ${email}:`, sendError);
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
