import React from 'npm:react@18.3.1'
import { Resend } from 'npm:resend@4.0.0'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { InvitationEmail } from './_templates/invitation.tsx'

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
    // Validate auth (accepts both user JWT and service-role key from monday-webhook)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const token = authHeader.replace('Bearer ', '');
    // Accept service-role key directly (for internal calls like monday-webhook or test)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const isServiceRole = serviceRoleKey && token === serviceRoleKey;
    if (!isServiceRole) {
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const { email, company_name, signup_url } = await req.json();

    if (!email || !company_name || !signup_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, company_name, signup_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ⚠️ EMAIL WHITELIST: Only send to approved test addresses
    const EMAIL_WHITELIST = ["jonas@topix.dk"];

    // ⚠️ TEST-MODE TOGGLE: Check if email sending is enabled
    const rawEmailEnabled = Deno.env.get("EMAIL_SENDING_ENABLED");
    console.log(`[DEBUG] EMAIL_SENDING_ENABLED raw value: "${rawEmailEnabled}"`);
    const emailEnabled = rawEmailEnabled?.trim().toLowerCase() === "true";

    if (!emailEnabled || !EMAIL_WHITELIST.includes(email.toLowerCase())) {
      const reason = !emailEnabled ? "test-mode" : "not in whitelist";
      console.log(`[BLOCKED] Email NOT sent to: ${email} (${reason})`);
      console.log(`[BLOCKED] Company: ${company_name}`);
      console.log(`[BLOCKED] Signup URL: ${signup_url}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          test_mode: true, 
          message: `Email not sent (${reason}). Would send to: ${email}` 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // LIVE MODE: Actually send the email
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const resend = new Resend(resendApiKey);

    const html = await renderAsync(
      React.createElement(InvitationEmail, {
        companyName: company_name,
        signupUrl: signup_url,
      })
    );

    const { error } = await resend.emails.send({
      from: "The Boardroom <noreply@boardroom.topix.dk>",
      to: [email],
      subject: `Du er inviteret til ${company_name} på The Boardroom`,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      throw new Error(`Failed to send email: ${JSON.stringify(error)}`);
    }

    console.log(`[LIVE] Invitation email sent to: ${email} for company: ${company_name}`);

    return new Response(
      JSON.stringify({ success: true, test_mode: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("send-invitation-email error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
