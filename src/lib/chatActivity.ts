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
 * Returns the inserted message id, or null on failure.
 */
export async function postActivityMessage({
  conversationId,
  senderId,
  content,
  contextType = null,
  contextId = null,
  contextMeta = null,
}: PostActivityOptions): Promise<string | null> {
  try {
    const { data, error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      message_type: "system",
      context_type: contextType,
      context_id: contextId,
      context_meta: contextMeta,
    } as any).select("id").single();

    if (error) {
      console.error("Failed to post activity message:", error);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error("Failed to post activity message:", err);
    return null;
  }
}
