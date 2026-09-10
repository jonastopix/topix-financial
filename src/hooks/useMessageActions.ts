import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { indenForVinduet, kanRedigereBesked, kanSletteBesked } from "@/lib/beskedRegler";

/** 15 minutter — reglen bor i src/lib/beskedRegler.ts (delt af redigering og sletning, 10/9). */
export function canEditMessage(createdAt: string): boolean {
  return indenForVinduet(createdAt);
}

export function useMessageActions(
  messageTable: "messages",
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

  const saveEdit = useCallback(async (messageId: string, contentOverride?: string) => {
    // contentOverride lader en rig edit-dialog gemme editorens HTML direkte uden
    // at gaa gennem editContent-state (loeser state-timing). Kaldere uden 2. arg
    // opfoerer sig praecis som foer og bruger editContent.
    const trimmed = (contentOverride ?? editContent).trim();
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
    // Advisors can edit own messages without time limit; members have 15-min window
    return kanRedigereBesked({ senderId, currentUserId, isAdvisor, createdAt });
  }, [currentUserId, isAdvisor]);

  // Sletning har SAMME grænse som redigering (10/9, beskedRegler.ts) — før
  // var det sender alene, uden tidsgrænse, og databasen var enig.
  const canDelete = useCallback((senderId: string, createdAt: string) => {
    return kanSletteBesked({ senderId, currentUserId, isAdvisor, createdAt });
  }, [currentUserId, isAdvisor]);

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
