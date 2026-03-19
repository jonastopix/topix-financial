const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER = 'The Boardroom <noreply@topix.dk>';
const SENDER_DOMAIN = 'topix.dk';

// Hardcoded fallback if no template exists in DB
const FALLBACK_SUBJECT = 'Du er inviteret til {{company_name}} på The Boardroom';
const FALLBACK_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0"><div style="max-width:480px;margin:0 auto;padding:0 12px"><h1 style="color:#1a1a2e;font-size:24px;font-weight:bold;margin:40px 0 20px">Velkommen til The Boardroom</h1><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Du er blevet inviteret til at blive en del af <strong>{{company_name}}</strong> på The Boardroom — en platform der hjælper virksomheder med at få overblik over økonomi, milepæle og strategi.</p><div style="text-align:center;margin:32px 0"><a href="{{signup_url}}" target="_blank" style="background-color:#0fa968;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 32px;text-decoration:none">Acceptér invitation</a></div><p style="color:#333;font-size:14px;line-height:24px;margin:16px 0">Du kan oprette dig med en hvilken som helst e-mail — du bliver automatisk tilknyttet {{company_name}} via dit invitationslink.</p><p style="color:#898989;font-size:12px;line-height:20px;margin-top:32px">Denne invitation er sendt fra The Boardroom. Hvis du ikke forventer denne besked, kan du ignorere den.</p></div></body></html>`;

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
      senderFrom = `${tpl.sender_name} <${tpl.sender_email}>`;
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
