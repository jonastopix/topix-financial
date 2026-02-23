import { supabase } from "@/integrations/supabase/client";

interface PostActivityOptions {
  conversationId: string;
  senderId: string;
  content: string;
  contextType?: "report" | "milestone" | null;
  contextId?: string | null;
  contextMeta?: Record<string, unknown> | null;
}

/**
 * Posts a system activity message to the member's chat conversation.
 * Used for automated notifications like report uploads, milestone completions, etc.
 */
export async function postActivityMessage({
  conversationId,
  senderId,
  content,
  contextType = null,
  contextId = null,
  contextMeta = null,
}: PostActivityOptions): Promise<boolean> {
  try {
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      message_type: "system",
      context_type: contextType,
      context_id: contextId,
      context_meta: contextMeta,
    } as any);

    if (error) {
      console.error("Failed to post activity message:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to post activity message:", err);
    return false;
  }
}
