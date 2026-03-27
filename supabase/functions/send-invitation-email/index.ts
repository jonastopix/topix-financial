const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER = 'The Boardroom <noreply@mail.topix.dk>';
const SENDER_DOMAIN = 'mail.topix.dk';
const VERIFIED_FROM_EMAIL = 'noreply@mail.topix.dk';

const FALLBACK_SUBJECT = 'Du er inviteret til {{company_name}} på The Boardroom';
const FALLBACK_HTML = `<div style="max-width:520px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="background:#0f1117;border-radius:10px 10px 0 0;padding:18px 28px;display:flex;align-items:center;gap:10px">
    <div style="width:28px;height:28px;background:#16a34a;border-radius:6px;display:inline-flex;align-items:center;justify-content:center">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" fill="white"/><rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity=".6"/><rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity=".6"/><rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity=".3"/></svg>
    </div>
    <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-.01em">The Boardroom</span>
    <span style="color:#9ca3af;font-size:12px;font-weight:400"> by Topix</span>
  </div>
  <div style="background:#ffffff;border-radius:0 0 10px 10px;padding:28px 28px 20px">

    <h1 style="font-size:20px;font-weight:700;color:#0f1117;margin:0 0 14px;line-height:1.3">Velkommen til The Boardroom</h1>

    <p style="font-size:14px;color:#4a4a4a;line-height:1.6;margin:0 0 16px">Du er blevet inviteret til at blive en del af <strong>{{company_name}}</strong> på vores platform der hjælper virksomheder med at få overblik over økonomi, milepæle og strategi.</p>

    <div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 6px 6px 0;padding:12px 14px;margin:0 0 20px">
      <p style="color:#166534;font-size:13px;margin:0;font-weight:500">Du kan oprette dig med en hvilken som helst e-mail — du bliver automatisk tilknyttet {{company_name}} via dit invitationslink.</p>
    </div>

    <div style="margin:0 0 24px">
      <a href="{{signup_url}}" target="_blank" style="background:#16a34a;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 28px;text-decoration:none">Acceptér invitationen</a>
    </div>

    <div style="height:1px;background:#e5e7eb;margin:0 0 16px"></div>

    <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.5">
      The Boardroom · topix.dk  ·  Ignorer denne besked hvis du ikke forventer den.
    </p>
  </div>
</div>`;

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

    const logPayload: Record<string, unknown> = {
      message_id: messageId,
      recipient_email: email,
      subject,
      status: 'pending',
      is_test: false,
    };
    if (templateId) logPayload.template_id = templateId;

    await adminSupabase.from('email_send_log').insert(logPayload);

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
      await adminSupabase.from('email_send_log').insert({ ...logPayload, status: 'failed', error_message: 'Failed to enqueue email' });
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
