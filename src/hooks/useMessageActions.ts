import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function canEditMessage(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

export function useMessageActions(
  messageTable: "messages" | "group_messages",
  currentUserId: string | undefined,
  isAdvisor: boolean
) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const startEdit = useCallback((messageId: string, content: string) => {
    setEditingId(messageId);
    setEditContent(content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditContent("");
  }, []);

  const saveEdit = useCallback(async (messageId: string) => {
    const trimmed = editContent.trim();
    if (!trimmed || !currentUserId) {
      cancelEdit();
      return false;
    }

    const { error } = await supabase
      .from(messageTable as any)
      .update({ content: trimmed, edited_at: new Date().toISOString() } as any)
      .eq("id", messageId);

    if (error) {
      console.error("Failed to edit message:", error);
      toast.error("Kunne ikke redigere beskeden");
      return false;
    }

    cancelEdit();
    return true;
  }, [editContent, currentUserId, messageTable, cancelEdit]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const { error } = await supabase
      .from(messageTable as any)
      .delete()
      .eq("id", messageId);

    if (error) {
      console.error("Failed to delete message:", error);
      toast.error("Kunne ikke slette beskeden");
      return false;
    }
    return true;
  }, [messageTable]);

  const canEdit = useCallback((senderId: string, createdAt: string) => {
    if (senderId !== currentUserId) return false;
    // Advisors can edit own messages without time limit; members have 15-min window
    return isAdvisor || canEditMessage(createdAt);
  }, [currentUserId, isAdvisor]);

  const canDelete = useCallback((senderId: string) => {
    return senderId === currentUserId;
  }, [currentUserId]);

  return {
    editingId,
    editContent,
    setEditContent,
    startEdit,
    cancelEdit,
    saveEdit,
    deleteMessage,
    canEdit,
    canDelete,
  };
}
