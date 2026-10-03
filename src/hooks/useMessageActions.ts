import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";

import { indenForVinduet, kanRedigereBesked, kanSletteBesked } from "@/lib/beskedRegler";
import { byggChatBesked } from "@/lib/chatDokument";
import { laesChatVideo } from "@/lib/chatVideo";
import { sletGennemfoert } from "@/lib/chatVideoFlade";
import { vedhaeftningerAtSlette } from "@/lib/chatVedhaeftningSletning";

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
  // Beskedens indhold_json (29/9-2026, «#» i chatten) — redigeringsdialogen
  // åbner dokumentet, når der er et (MessageEditDialog.initialDokument).
  const [editDokument, setEditDokument] = useState<unknown>(null);

  const startEdit = useCallback((messageId: string, content: string, dokument?: unknown) => {
    setEditingId(messageId);
    setEditContent(content);
    setEditDokument(dokument ?? null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditContent("");
    setEditDokument(null);
  }, []);

  const saveEdit = useCallback(async (messageId: string, contentOverride?: string, dokument?: Record<string, unknown>) => {
    // contentOverride lader en rig edit-dialog gemme editorens HTML direkte uden
    // at gaa gennem editContent-state (loeser state-timing). Kaldere uden 2. arg
    // opfoerer sig praecis som foer og bruger editContent.
    const trimmed = (contentOverride ?? editContent).trim();
    if (!trimmed || !currentUserId) {
      cancelEdit();
      return false;
    }

    // Et dokument (beskeden havde ét, eller har nu en #-henvisning): content og
    // indhold_json opdateres SAMMEN, bygget af byggChatBesked — content er den
    // udledte tekst, aldrig skrevet ved siden af. Uden dokument: som før.
    const besked = dokument !== undefined ? byggChatBesked(dokument) : null;
    if (dokument !== undefined && besked === null) {
      cancelEdit();
      return false;
    }

    const { error } = besked
      ? await supabase
        .from(messageTable)
        .update({ ...besked, edited_at: new Date().toISOString() } as TablesUpdate<"messages">)
        .eq("id", messageId)
      : await supabase
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

  const deleteMessage = useCallback(async (messageId: string, contextMeta?: unknown) => {
    // VIDEOEN FØRST (29/9-2026): en besked med en chatvideo sletter også
    // videoen hos Bunny (chat-video «slet»). Rækkefølgen er bindende — når
    // beskeden er væk, kan videoen ikke længere findes (den eneste reference
    // er context_meta.video.guid). Fejler sletningen hos Bunny, slettes
    // beskeden IKKE. «Allerede væk» (fandtes: false) er en gennemført sletning.
    if (laesChatVideo(contextMeta)) {
      const { data: sletSvar, error: sletFejl } = await supabase.functions.invoke("chat-video", {
        body: { action: "slet", messageId },
      });
      if (sletFejl || !sletGennemfoert(sletSvar)) {
        console.error("Failed to delete chat video:", sletFejl ?? sletSvar);
        toast.error("Videoen kunne ikke slettes — beskeden står uændret.");
        return false;
      }
    }

    const { error } = await supabase
      .from(messageTable as any)
      .delete()
      .eq("id", messageId);

    if (error) {
      console.error("Failed to delete message:", error);
      toast.error("Kunne ikke slette beskeden");
      return false;
    }

    // VEDHÆFTNINGERNE EFTER (3/10-2026, a29-vedhaeftning-slettes-ikke): først
    // når beskeden er væk, så en fejlet sletning aldrig efterlader en besked
    // med døde filer. Kun afsenderens egne stier (vedhaeftningerAtSlette).
    // Fail-soft: beskeden ER slettet; en fil, der ikke kunne fjernes, ryddes
    // ved hard-sletningen (slet-medlemsdata-cron), som før.
    const stier = vedhaeftningerAtSlette(contextMeta, currentUserId);
    if (stier.length > 0) {
      const { error: filFejl } = await supabase.storage.from("chat-attachments").remove(stier);
      if (filFejl) console.warn("Vedhæftningerne kunne ikke slettes:", filFejl);
    }
    return true;
  }, [messageTable, currentUserId]);

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
    editDokument,
    setEditContent,
    startEdit,
    cancelEdit,
    saveEdit,
    deleteMessage,
    canEdit,
    canDelete,
  };
}
