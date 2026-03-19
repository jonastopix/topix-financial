const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const SENDER = 'The Boardroom <noreply@boardroom.topix.dk>';
const SENDER_DOMAIN = 'boardroom.topix.dk';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { template_id, test_email, variables: customVars } = await req.json()

    if (!template_id) {
      return new Response(JSON.stringify({ error: 'template_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify user is advisor
    const userSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: claimsData, error: claimsErr } = await userSupabase.auth.getClaims(
      authHeader.replace('Bearer ', '')
    )
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = claimsData.claims.sub

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)

    // Check advisor role
    const { data: roleRow } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'advisor')
      .maybeSingle()

    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch template
    const { data: template, error: tplErr } = await adminSupabase
      .from('email_templates')
      .select('*')
      .eq('id', template_id)
      .single()

    if (tplErr || !template) {
      return new Response(JSON.stringify({ error: 'Template not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build variables: use custom vars or fall back to example values
    const vars: Record<string, string> = {}
    const templateVars = (template.variables || []) as Array<{ key: string; example: string }>
    for (const v of templateVars) {
      vars[v.key] = customVars?.[v.key] || v.example
    }

    // Replace placeholders
    let subject = template.subject
    let bodyHtml = template.body_html
    for (const [key, value] of Object.entries(vars)) {
      const placeholder = `{{${key}}}`
      while (subject.includes(placeholder)) subject = subject.replace(placeholder, value)
      while (bodyHtml.includes(placeholder)) bodyHtml = bodyHtml.replace(placeholder, value)
    }

    if (!test_email) {
      return new Response(JSON.stringify({ error: 'test_email required for now' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const finalSubject = `[TEST] ${subject}`
    const senderFrom = `${template.sender_name} <${template.sender_email}>`;

    // Enqueue email via Lovable Email queue
    const messageId = crypto.randomUUID();

    // Log pending
    await adminSupabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: template.name || 'template-test',
      recipient_email: test_email,
      status: 'pending',
    });

    const { error: enqueueError } = await adminSupabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: test_email,
        from: senderFrom,
        sender_domain: SENDER_DOMAIN,
        subject: finalSubject,
        html: bodyHtml,
        text: finalSubject,
        purpose: 'transactional',
        label: 'template-test',
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error('[send-template-email] Enqueue failed:', enqueueError);
      await adminSupabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: template.name || 'template-test',
        recipient_email: test_email,
        status: 'failed',
        error_message: 'Failed to enqueue email',
      });
      throw new Error(`Failed to enqueue: ${JSON.stringify(enqueueError)}`);
    }

    console.log(`[send-template-email] Test enqueued to ${test_email} (template: ${template.name})`)

    return new Response(
      JSON.stringify({ success: true, sent_to: test_email, template: template.name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('send-template-email error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
