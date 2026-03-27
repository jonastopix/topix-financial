const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER = 'The Boardroom <noreply@mail.topix.dk>';
const SENDER_DOMAIN = 'mail.topix.dk';
const VERIFIED_FROM_EMAIL = 'noreply@mail.topix.dk';

// Hardcoded fallback if no template exists in DB
const FALLBACK_SUBJECT = 'Du er inviteret til {{company_name}} på The Boardroom';
const FALLBACK_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background-color:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px 0">
<div style="max-width:520px;margin:0 auto">
  <div style="background:#0f1117;border-radius:10px 10px 0 0;padding:18px 28px">
    <div style="width:28px;height:28px;background:#16a34a;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-right:10px"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" fill="white"/><rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity=".6"/><rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity=".6"/><rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity=".3"/></svg></div>
    <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-.01em">The Boardroom</span>
  </div>
  <div style="background:#ffffff;border-radius:0 0 10px 10px;padding:28px 28px 0">
    <p style="font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">Du er inviteret</p>
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">{{company_name}} har åbnet døren for dig</h1>
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px">Du er inviteret til The Boardroom — et privat rum for økonomi, strategi og dialog med dine rådgivere. Opret dig på under 2 minutter.</p>
    <div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 6px 6px 0;padding:12px 14px;margin:16px 0">
      <p style="color:#166534;font-size:13px;margin:0;font-weight:500">Brug en hvilken som helst e-mail — du tilknyttes {{company_name}} automatisk via dit invitationslink.</p>
    </div>
    <div style="padding:20px 0">
      <a href="{{signup_url}}" target="_blank" style="background:#16a34a;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 28px;text-decoration:none">Acceptér invitation →</a>
    </div>
    <div style="height:0.5px;background:#e5e7eb"></div>
    <div style="padding:16px 0;display:flex;justify-content:space-between">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · topix.dk</span>
      <span style="font-size:12px;color:#9ca3af">Ignorer denne besked hvis du ikke forventer den.</span>
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

function resolveSenderFromTemplate(
  senderName: string | null | undefined,
  senderEmail: string | null | undefined
): string {
  const safeName = (senderName ?? 'The Boardroom').trim() || 'The Boardroom';
  const normalizedEmail = (senderEmail ?? VERIFIED_FROM_EMAIL).trim().toLowerCase();
  const emailDomain = normalizedEmail.split('@')[1] ?? '';

  if (emailDomain !== SENDER_DOMAIN) {
    console.warn('[send-invitation-email] Overriding sender_email to verified domain', {
      configured_sender_email: senderEmail,
      enforced_domain: SENDER_DOMAIN,
    });
    return `${safeName} <${VERIFIED_FROM_EMAIL}>`;
  }

  return `${safeName} <${normalizedEmail}>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth (accepts both user JWT and service-role key)
    const authHeader = req.headers.get('Authorization');
    console.log('[send-invitation-email] Auth header present:', !!authHeader);
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[send-invitation-email] No Bearer token found');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = authHeader.replace('Bearer ', '');

    const isServiceRole = token === serviceRoleKey;
    console.log('[send-invitation-email] Is service role:', isServiceRole);
    if (!isServiceRole) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      const userId = claimsData?.claims?.sub;
      console.log('[send-invitation-email] JWT claims result:', userId, 'error:', claimsError?.message);
      if (claimsError || !userId) {
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
    let senderFrom = SENDER;

    const { data: tpl } = await adminSupabase
      .from('email_templates')
      .select('id, subject, body_html, sender_name, sender_email, enabled')
      .eq('name', 'Invitation til virksomhed')
      .maybeSingle();

    if (tpl && tpl.enabled) {
      subjectTpl = tpl.subject;
      bodyTpl = tpl.body_html;
      senderFrom = resolveSenderFromTemplate(tpl.sender_name, tpl.sender_email);
      console.log('[send-invitation-email] Using DB template');
    } else {
      console.log('[send-invitation-email] Using fallback template');
    }

    // Replace variables
    const vars: Record<string, string> = { company_name, signup_url };
    const subject = replaceVars(subjectTpl, vars);
    const html = replaceVars(bodyTpl, vars);

    // Enqueue email via Lovable Email queue
    const messageId = crypto.randomUUID();

    // Log pending
    await adminSupabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'invitation',
      recipient_email: email,
      status: 'pending',
    });

    const { error: enqueueError } = await adminSupabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: email,
        from: senderFrom,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: `${subject}\n\n${company_name}\n\n${signup_url}`,
        purpose: 'transactional',
        label: 'invitation',
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error('[send-invitation-email] Enqueue failed:', enqueueError);
      await adminSupabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'invitation',
        recipient_email: email,
        status: 'failed',
        error_message: 'Failed to enqueue email',
      });
      throw new Error(`Failed to enqueue email: ${JSON.stringify(enqueueError)}`);
    }

    console.log(`[send-invitation-email] Enqueued invitation for: ${email} (company: ${company_name})`);

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