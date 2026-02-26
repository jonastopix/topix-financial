import { Resend } from 'npm:resend@4.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

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

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) throw new Error('RESEND_API_KEY not configured')
    const resend = new Resend(resendApiKey)

    const finalSubject = `[TEST] ${subject}`
    const { error: sendErr } = await resend.emails.send({
      from: `${template.sender_name} <${template.sender_email}>`,
      to: [test_email],
      subject: finalSubject,
      html: bodyHtml,
    })

    if (sendErr) {
      // Log failure
      await adminSupabase.from('email_send_log').insert({
        template_id, recipient_email: test_email, subject: finalSubject,
        status: 'failed', error_message: JSON.stringify(sendErr), is_test: true,
      })
      throw new Error(`Send failed: ${JSON.stringify(sendErr)}`)
    }

    // Log success
    await adminSupabase.from('email_send_log').insert({
      template_id, recipient_email: test_email, subject: finalSubject,
      status: 'sent', is_test: true,
    })

    console.log(`[send-template-email] Test sent to ${test_email} (template: ${template.name})`)

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
