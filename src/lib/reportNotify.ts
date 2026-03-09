import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget: invoke the server-side Slack report notification edge function.
 * The edge function handles role guards, idempotency, and advisor_notifications.
 */
export async function notifyReportUpload(reportId: string, messageId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await supabase.functions.invoke("send-slack-report-notification", {
      body: { report_id: reportId, message_id: messageId },
    });
  } catch (e) {
    console.error("Report Slack notify failed (non-blocking):", e);
  }
}
