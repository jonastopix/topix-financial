import { Resend } from 'npm:resend@4.0.0'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Hardcoded fallback if no template exists in DB
const FALLBACK_SUBJECT = 'Du er inviteret til {{company_name}} på The Boardroom';
const FALLBACK_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0"><div style="max-width:480px;margin:0 auto;padding:0 12px"><h1 style="color:#1a1a2e;font-size:24px;font-weight:bold;margin:40px 0 20px">Velkommen til The Boardroom</h1><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Du er blevet inviteret til at blive en del af <strong>{{company_name}}</strong> på The Boardroom — en platform der hjælper virksomheder med at få overblik over økonomi, milepæle og strategi.</p><div style="text-align:center;margin:32px 0"><a href="{{signup_url}}" target="_blank" style="background-color:#6366f1;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 32px;text-decoration:none">Acceptér invitation</a></div><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Når du accepterer invitationen med denne e-mail, bliver du automatisk tilknyttet {{company_name}}.</p><p style="color:#898989;font-size:12px;line-height:20px;margin-top:32px">Denne invitation er sendt fra The Boardroom. Hvis du ikke forventer denne besked, kan du ignorere den.</p></div></body></html>`;
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
    // Validate auth (accepts both user JWT and service-role key)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = authHeader.replace('Bearer ', '');

    const isServiceRole = token === serviceRoleKey;
    if (!isServiceRole) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: { user }, error: userError } = await authClient.auth.getUser(token);
      if (userError || !user) {
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

    // --- Fetch template from DB, fallback to hardcoded ---
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    let subjectTpl = FALLBACK_SUBJECT;
    let bodyTpl = FALLBACK_HTML;
    let senderFrom = FALLBACK_SENDER;
    let templateId: string | null = null;

    const { data: tpl } = await adminSupabase
      .from('email_templates')
      .select('id, subject, body_html, sender_name, sender_email, enabled')
      .eq('name', 'Invitation til virksomhed')
      .maybeSingle();

    if (tpl && tpl.enabled) {
      templateId = tpl.id;
      subjectTpl = tpl.subject;
      bodyTpl = tpl.body_html;
      senderFrom = `${tpl.sender_name} <${tpl.sender_email}>`;
      console.log('[send-invitation-email] Using DB template');
    } else {
      // Use fallback template but still get template id for logging
      if (tpl) {
        templateId = tpl.id;
      }
      console.log('[send-invitation-email] Using fallback template');
    }

    // Replace variables
    const vars: Record<string, string> = { company_name, signup_url };
    const subject = replaceVars(subjectTpl, vars);
    const html = replaceVars(bodyTpl, vars);

    // Send
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: senderFrom, to: [email], subject, html,
    });

    // Log to email_send_log — always log, even with fallback template
    if (templateId) {
      await adminSupabase.from('email_send_log').insert({
        template_id: templateId, recipient_email: email, subject,
        status: error ? 'failed' : 'sent',
        error_message: error ? JSON.stringify(error) : null,
        is_test: false,
      });
    } else {
      // No template in DB at all — create a minimal one for logging
      const { data: newTpl } = await adminSupabase
        .from('email_templates')
        .insert({
          name: 'Invitation til virksomhed',
          subject: FALLBACK_SUBJECT,
          body_html: FALLBACK_HTML,
          sender_name: 'The Boardroom',
          sender_email: 'noreply@boardroom.topix.dk',
          trigger_type: 'manual',
          enabled: false,
        })
        .select('id')
        .single();

      if (newTpl) {
        await adminSupabase.from('email_send_log').insert({
          template_id: newTpl.id, recipient_email: email, subject,
          status: error ? 'failed' : 'sent',
          error_message: error ? JSON.stringify(error) : null,
          is_test: false,
        });
      }
    }

    if (error) {
      console.error("Resend error:", error);
      throw new Error(`Failed to send email: ${JSON.stringify(error)}`);
    }

    console.log(`[LIVE] Invitation email sent to: ${email} for company: ${company_name}`);

    return new Response(
      JSON.stringify({ success: true }),
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
