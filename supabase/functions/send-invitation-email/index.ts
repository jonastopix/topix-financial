const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER = 'The Boardroom <noreply@boardroom.topix.dk>';
const SENDER_DOMAIN = 'boardroom.topix.dk';
const VERIFIED_FROM_EMAIL = 'noreply@boardroom.topix.dk';

const FALLBACK_SUBJECT = 'Du er inviteret til The Boardroom';
const FALLBACK_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px 0">
<div style="max-width:520px;margin:0 auto;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td style="background-color:hsl(170,46%,14%);padding:18px 24px;border-radius:10px 10px 0 0">
      <span style="font-family:'Manrope',Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">The Boardroom</span>
      <span style="font-family:'Manrope',Arial,sans-serif;font-size:13px;font-weight:400;color:rgba(255,255,255,0.55)">&nbsp;by Topix</span>
    </td></tr>
    <tr><td style="height:3px;background-color:hsl(158,64%,42%)"></td></tr>
  </table>
  <div style="background:#ffffff;padding:28px 32px 32px">
    <h1 style="color:hsl(170,46%,14%);font-size:20px;font-weight:700;margin:0 0 16px;line-height:1.3">Velkommen til The Boardroom</h1>
    <p style="color:hsl(170,15%,35%);font-size:14px;line-height:1.6;margin:0 0 14px">Du er blevet inviteret til at blive en del af <strong>The Boardroom</strong> på vores platform der hjælper virksomheder med at få overblik over økonomi, milepæle og strategi.</p>
    <div style="background:#f0fdf4;border-left:3px solid hsl(158,64%,42%);border-radius:0 6px 6px 0;padding:12px 14px;margin:16px 0">
      <p style="color:#166534;font-size:13px;margin:0;font-weight:500">Du kan oprette dig med en hvilken som helst e-mail — du bliver automatisk tilknyttet The Boardroom via dit invitationslink.</p>
    </div>
    <div style="padding:20px 0">
      <a href="{{signup_url}}" target="_blank" style="background-color:hsl(170,46%,14%);border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:13px 28px;text-decoration:none">Acceptér invitationen</a>
    </div>
    <div style="height:0.5px;background:#e5e7eb"></div>
    <div style="padding:16px 0">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · theboardroom.dk &nbsp;·&nbsp; Ignorer denne besked hvis du ikke forventer den.</span>
    </div>
  </div>
</div>
</body>
</html>`;

function replaceVars(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    while (result.includes(placeholder)) result = result.replace(placeholder, value);
  }
  return result;
}

function resolveSenderFromTemplate(senderName: string | null | undefined, senderEmail: string | null | undefined): string {
  const safeName = (senderName ?? 'The Boardroom').trim() || 'The Boardroom';
  const normalizedEmail = (senderEmail ?? VERIFIED_FROM_EMAIL).trim().toLowerCase();
  const emailDomain = normalizedEmail.split('@')[1] ?? '';
  if (emailDomain !== SENDER_DOMAIN) return `${safeName} <${VERIFIED_FROM_EMAIL}>`;
  return `${safeName} <${normalizedEmail}>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userErr } = await authClient.auth.getUser();
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { email, company_name, signup_url } = await req.json();

    if (!email || !company_name || !signup_url) {
      return new Response(JSON.stringify({ error: "Missing required fields: email, company_name, signup_url" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    let subjectTpl = FALLBACK_SUBJECT;
    let bodyTpl = FALLBACK_HTML;
    let senderFrom = SENDER;
    let templateId: string | null = null;

    const { data: tpl } = await adminSupabase
      .from('email_templates')
      .select('id, subject, body_html, sender_name, sender_email, enabled')
      .eq('name', 'Invitation til virksomhed')
      .maybeSingle();

    if (tpl && tpl.enabled) {
      subjectTpl = tpl.subject;
      bodyTpl = tpl.body_html;
      senderFrom = resolveSenderFromTemplate(tpl.sender_name, tpl.sender_email);
      templateId = tpl.id;
    }

    const vars: Record<string, string> = { company_name, signup_url };
    const subject = replaceVars(subjectTpl, vars);
    const html = replaceVars(bodyTpl, vars);

    const messageId = crypto.randomUUID();

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
        idempotency_key: messageId,
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
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("send-invitation-email error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
