import { useEffect, useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface LastSeenEntry {
  conversation_id: string;
  conversation_type: string;
  last_seen_message_id: string | null;
}

/**
 * Tracks last-seen message for each conversation.
 * On open: returns lastSeenMessageId so a "Nye beskeder" divider can be shown.
 * On close/scroll: updates last_seen to the latest message.
 */
export function useConversationLastSeen(
  conversationId: string | null,
  conversationType: "company",
  currentUserId: string | undefined,
  latestMessageId: string | null
) {
  const [lastSeenMessageId, setLastSeenMessageId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const initialFetchDone = useRef(false);
  // En tjenestekonto KIGGER (30/9, tjenestekonto.guard dom 6): «Nye beskeder»-
  // skillet vises stadig, men stemplet flyttes ikke.
  const { laeseMarkeringTilladt } = useAuth();

  // Fetch last_seen on conversation open
  useEffect(() => {
    if (!conversationId || !currentUserId) {
      setLastSeenMessageId(null);
      setLoaded(false);
      initialFetchDone.current = false;
      return;
    }

    initialFetchDone.current = false;
    setLoaded(false);

    const fetch = async () => {
      const { data } = await supabase
        .from("conversation_last_seen" as any)
        .select("last_seen_message_id")
        .eq("user_id", currentUserId)
        .eq("conversation_id", conversationId)
        .eq("conversation_type", conversationType)
        .maybeSingle();

      const id = (data as any)?.last_seen_message_id || null;
      setLastSeenMessageId(id);
      setLoaded(true);
      initialFetchDone.current = true;
    };

    fetch();
  }, [conversationId, conversationType, currentUserId]);

  // Update last_seen when leaving or on latest message change
  const markSeen = useCallback(async () => {
    if (!conversationId || !currentUserId || !latestMessageId || !laeseMarkeringTilladt) return;

    await supabase
      .from("conversation_last_seen" as any)
      .upsert(
        {
          user_id: currentUserId,
          conversation_id: conversationId,
          conversation_type: conversationType,
          last_seen_message_id: latestMessageId,
          last_seen_at: new Date().toISOString(),
        } as any,
        { onConflict: "user_id,conversation_id,conversation_type" }
      );
  }, [conversationId, conversationType, currentUserId, latestMessageId, laeseMarkeringTilladt]);

  // Auto-mark as seen after a short delay when conversation is open
  useEffect(() => {
    if (!loaded || !initialFetchDone.current || !latestMessageId) return;

    const timer = setTimeout(() => {
      markSeen();
    }, 2000);

    return () => clearTimeout(timer);
  }, [loaded, latestMessageId, markSeen]);

  return {
    /** The message ID that was last seen BEFORE opening. Show "Nye beskeder" after this message. */
    lastSeenMessageId: loaded ? lastSeenMessageId : null,
    loaded,
    markSeen,
  };
}
