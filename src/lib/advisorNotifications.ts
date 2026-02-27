import { supabase } from "@/integrations/supabase/client";

interface NotifyOptions {
  type: "report_uploaded" | "handout_completed" | "new_message";
  title: string;
  body?: string;
  companyId: string;
  memberId: string;
  referenceId?: string;
  referenceType?: "report" | "handout" | "chat";
}

/**
 * Insert an advisor notification so all advisors see it.
 */
export async function createAdvisorNotification({
  type,
  title,
  body,
  companyId,
  memberId,
  referenceId,
  referenceType,
}: NotifyOptions): Promise<boolean> {
  try {
    const { error } = await supabase.from("advisor_notifications" as any).insert({
      type,
      title,
      body: body || null,
      company_id: companyId,
      member_id: memberId,
      reference_id: referenceId || null,
      reference_type: referenceType || null,
    });
    if (error) {
      console.error("Failed to create advisor notification:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to create advisor notification:", err);
    return false;
  }
}
