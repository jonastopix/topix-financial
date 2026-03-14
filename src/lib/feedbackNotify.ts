import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget: invoke the server-side Slack feedback notification edge function.
 * The edge function handles role guards, Slack posting, and advisor_notifications.
 */
export async function notifyFeedbackSubmitted(feedbackId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await supabase.functions.invoke("send-slack-feedback-notification", {
      body: { feedback_id: feedbackId },
    });
  } catch (e) {
    console.error("Feedback Slack notify failed (non-blocking):", e);
  }
}
