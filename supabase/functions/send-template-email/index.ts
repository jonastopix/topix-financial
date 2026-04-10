const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const SENDER_DOMAIN = 'boardroom.topix.dk'
const VERIFIED_FROM_EMAIL = `noreply@${SENDER_DOMAIN}`

function resolveSenderFromTemplate(
  senderName: string | null | undefined,
  senderEmail: string | null | undefined
): string {
  const safeName = (senderName ?? 'The Boardroom').trim() || 'The Boardroom'
  const normalizedEmail = (senderEmail ?? VERIFIED_FROM_EMAIL).trim().toLowerCase()
  const emailDomain = normalizedEmail.split('@')[1] ?? ''
  if (emailDomain !== SENDER_DOMAIN) {
    console.warn('[send-template-email] Overriding sender_email to verified domain', { configured_sender_email: senderEmail, enforced_domain: SENDER_DOMAIN })
    return `${safeName} <${VERIFIED_FROM_EMAIL}>`
  }
  return `${safeName} <${normalizedEmail}>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { template_id, test_email, variables: customVars } = await req.json()

    if (!template_id) {
      return new Response(JSON.stringify({ error: 'template_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify user identity via getUser() — works with verify_jwt=false
    const userSupabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await userSupabase.auth.getUser()
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const userId = userData.user.id

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: roleRow } = await adminSupabase
      .from('user_roles').select('role').eq('user_id', userId).eq('role', 'advisor').maybeSingle()

    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: template, error: tplErr } = await adminSupabase
      .from('email_templates').select('*').eq('id', template_id).single()

    if (tplErr || !template) {
      return new Response(JSON.stringify({ error: 'Template not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const vars: Record<string, string> = {}
    const templateVars = (template.variables || []) as Array<{ key: string; example: string }>
    for (const v of templateVars) { vars[v.key] = customVars?.[v.key] || v.example }

    let subject = template.subject
    let bodyHtml = template.body_html
    for (const [key, value] of Object.entries(vars)) {
      const placeholder = `{{${key}}}`
      while (subject.includes(placeholder)) subject = subject.replace(placeholder, value)
      while (bodyHtml.includes(placeholder)) bodyHtml = bodyHtml.replace(placeholder, value)
    }

    if (!test_email) {
      return new Response(JSON.stringify({ error: 'test_email required for now' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const finalSubject = `[TEST] ${subject}`
    const senderFrom = resolveSenderFromTemplate(template.sender_name, template.sender_email)
    const messageId = crypto.randomUUID()

    await adminSupabase.from('email_send_log').insert({
      message_id: messageId,
      template_id: template.id,
      recipient_email: test_email,
      subject: finalSubject,
      status: 'pending',
      is_test: true,
    })

    const { error: enqueueError } = await adminSupabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        idempotency_key: messageId,
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
    })

    if (enqueueError) {
      console.error('[send-template-email] Enqueue failed:', enqueueError)
      await adminSupabase.from('email_send_log').insert({
        message_id: messageId,
        template_id: template.id,
        recipient_email: test_email,
        subject: finalSubject,
        status: 'failed',
        is_test: true,
        error_message: 'Failed to enqueue email',
      })
      throw new Error(`Failed to enqueue: ${JSON.stringify(enqueueError)}`)
    }

    console.log(`[send-template-email] Test enqueued to ${test_email} (template: ${template.name})`)
    return new Response(
      JSON.stringify({ success: true, sent_to: test_email, template: template.name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('send-template-email error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
