import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Reaction {
  id: string;
  message_id: string;
  message_table: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface AggregatedReaction {
  emoji: string;
  count: number;
  reacted: boolean; // current user has reacted
}

export function useMessageReactions(
  messageIds: string[],
  messageTable: "messages" | "group_messages",
  currentUserId: string | undefined
) {
  const [reactions, setReactions] = useState<Map<string, Reaction[]>>(new Map());
  const fetchedRef = useRef(false);
  const idsKey = messageIds.join(",");

  // Fetch reactions for all visible messages
  useEffect(() => {
    if (!messageIds.length) return;
    fetchedRef.current = false;

    const fetch = async () => {
      const { data, error } = await supabase
        .from("message_reactions" as any)
        .select("*")
        .eq("message_table", messageTable)
        .in("message_id", messageIds);

      if (error) {
        console.error("Failed to fetch reactions:", error);
        return;
      }

      const map = new Map<string, Reaction[]>();
      (data as unknown as Reaction[])?.forEach((r) => {
        const arr = map.get(r.message_id) || [];
        arr.push(r);
        map.set(r.message_id, arr);
      });
      setReactions(map);
      fetchedRef.current = true;
    };

    fetch();
  }, [idsKey, messageTable]);

  // Realtime subscription
  useEffect(() => {
    if (!messageIds.length) return;

    const channel = supabase
      .channel(`reactions-${messageTable}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const r = payload.new as unknown as Reaction;
          if (r.message_table !== messageTable) return;
          setReactions((prev) => {
            const next = new Map(prev);
            const arr = [...(next.get(r.message_id) || [])];
            if (!arr.some((x) => x.id === r.id)) arr.push(r);
            next.set(r.message_id, arr);
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const r = payload.old as unknown as Reaction;
          if (r.message_table !== messageTable) return;
          setReactions((prev) => {
            const next = new Map(prev);
            const arr = (next.get(r.message_id) || []).filter((x) => x.id !== r.id);
            if (arr.length) next.set(r.message_id, arr);
            else next.delete(r.message_id);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [idsKey, messageTable]);

  const getAggregated = useCallback(
    (messageId: string): AggregatedReaction[] => {
      const list = reactions.get(messageId) || [];
      const emojiMap = new Map<string, { count: number; reacted: boolean }>();
      list.forEach((r) => {
        const existing = emojiMap.get(r.emoji) || { count: 0, reacted: false };
        existing.count++;
        if (r.user_id === currentUserId) existing.reacted = true;
        emojiMap.set(r.emoji, existing);
      });
      return Array.from(emojiMap.entries()).map(([emoji, v]) => ({
        emoji,
        count: v.count,
        reacted: v.reacted,
      }));
    },
    [reactions, currentUserId]
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId) return;

      const list = reactions.get(messageId) || [];
      const existing = list.find(
        (r) => r.user_id === currentUserId && r.emoji === emoji
      );

      if (existing) {
        // Optimistic delete
        setReactions((prev) => {
          const next = new Map(prev);
          const arr = (next.get(messageId) || []).filter((r) => r.id !== existing.id);
          if (arr.length) next.set(messageId, arr);
          else next.delete(messageId);
          return next;
        });

        await supabase
          .from("message_reactions" as any)
          .delete()
          .eq("id", existing.id);
      } else {
        // Optimistic insert
        const tempId = crypto.randomUUID();
        const tempReaction: Reaction = {
          id: tempId,
          message_id: messageId,
          message_table: messageTable,
          user_id: currentUserId,
          emoji,
          created_at: new Date().toISOString(),
        };

        setReactions((prev) => {
          const next = new Map(prev);
          const arr = [...(next.get(messageId) || []), tempReaction];
          next.set(messageId, arr);
          return next;
        });

        const { data, error } = await supabase
          .from("message_reactions" as any)
          .insert({
            message_id: messageId,
            message_table: messageTable,
            user_id: currentUserId,
            emoji,
          })
          .select()
          .single();

        if (error) {
          // Rollback
          setReactions((prev) => {
            const next = new Map(prev);
            const arr = (next.get(messageId) || []).filter((r) => r.id !== tempId);
            if (arr.length) next.set(messageId, arr);
            else next.delete(messageId);
            return next;
          });
        } else if (data) {
          // Replace temp with real
          setReactions((prev) => {
            const next = new Map(prev);
            const arr = (next.get(messageId) || []).map((r) =>
              r.id === tempId ? (data as unknown as Reaction) : r
            );
            next.set(messageId, arr);
            return next;
          });
        }
      }
    },
    [currentUserId, reactions, messageTable]
  );

  return { getAggregated, toggleReaction, reactions };
}
