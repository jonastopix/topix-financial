import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.97.0'

// Modtager Lovables leveringshændelser (bounce, klage, afmelding) og
// bogfører dem i husets egne tabeller, så mail-loggen og rådgiverfladen
// viser det samme som før. Spærringen selv håndteres af Lovable —
// disse rækker er visning, aldrig en port foran en afsendelse.

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function bogfoer(
  eventId: string,
  recipient: string,
  logStatus: string,
  suppressionReason: 'bounce' | 'complaint' | 'unsubscribe',
  besked: string,
) {
  const email = (recipient ?? '').trim().toLowerCase()
  if (!email) return

  const { error: logFejl } = await admin.from('email_send_log').insert({
    message_id: eventId,
    template_name: 'system',
    recipient_email: email,
    status: logStatus,
    error_message: besked,
  })
  if (logFejl && logFejl.code !== '23505') {
    console.error('email_send_log fejlede', { event_id: eventId, code: logFejl.code, message: logFejl.message })
    throw new Error('email_send_log insert failed')
  }

  const { error: spaerFejl } = await admin
    .from('suppressed_emails')
    .upsert({ email, reason: suppressionReason, metadata: null }, { onConflict: 'email' })
  if (spaerFejl) {
    console.error('suppressed_emails fejlede', { event_id: eventId, code: spaerFejl.code, message: spaerFejl.message })
    throw new Error('suppressed_emails upsert failed')
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await bogfoer(event.event_id, event.data.recipient, 'bounced', 'bounce', 'Mailen bouncede')
    },
    'email.complaint': async (event) => {
      await bogfoer(event.event_id, event.data.recipient, 'complained', 'complaint', 'Modtageren markerede mailen som spam')
    },
    'email.unsubscribed': async (event) => {
      await bogfoer(event.event_id, event.data.recipient, 'suppressed', 'unsubscribe', 'Modtageren har afmeldt sig')
    },
  },
})

Deno.serve((req) => handler(req))
