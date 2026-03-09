import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget: invoke the server-side Slack notification edge function.
 * The edge function handles all guards (message_type, sender role, idempotency).
 * Safe to call for any message — non-qualifying messages are silently ignored.
 */
export async function notifyChatMessage(messageId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await supabase.functions.invoke("send-slack-chat-notification", {
      body: { message_id: messageId },
    });
  } catch (e) {
    console.error("Slack notify failed (non-blocking):", e);
  }
}
