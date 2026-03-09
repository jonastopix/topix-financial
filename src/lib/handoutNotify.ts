import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget: invoke the server-side Slack handout notification edge function.
 * The edge function handles role guards, ownership check, idempotency,
 * Slack posting, and advisor_notifications.
 */
export async function notifyHandoutCompleted(handoutId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await supabase.functions.invoke("send-slack-handout-notification", {
      body: { handout_id: handoutId },
    });
  } catch (e) {
    console.error("Handout Slack notify failed (non-blocking):", e);
  }
}
