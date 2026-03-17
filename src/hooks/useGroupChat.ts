import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadChatAttachments } from "@/lib/chatAttachments";
import type { ChatAttachment } from "@/components/ChatAttachments";

export interface GroupMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  context_meta?: { attachments?: ChatAttachment[] } | null;
}

export interface SenderProfile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

interface UseGroupChatOptions {
  /** For members: resolved automatically. For advisors: passed from URL param. */
  groupId?: string | null;
}

export function useGroupChat({ groupId }: UseGroupChatOptions = {}) {
  const { user, isGroupUser, groupId: memberGroupId } = useAuth();
  const resolvedGroupId = groupId ?? memberGroupId;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [profiles, setProfiles] = useState<Map<string, SenderProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [sending, setSending] = useState(false);
  const profileCacheRef = useRef<Set<string>>(new Set());

  // Resolve conversation from group
  useEffect(() => {
    if (!resolvedGroupId || !user) {
      setLoading(false);
      return;
    }

    const resolve = async () => {
      setLoading(true);
      setAccessDenied(false);

      const { data, error } = await supabase
        .from("group_conversations" as any)
        .select("id")
        .eq("group_id", resolvedGroupId)
        .maybeSingle();

      if (error || !data) {
        setAccessDenied(true);
        setConversationId(null);
        setLoading(false);
        return;
      }

      setConversationId((data as any).id);
    };

    resolve();
  }, [resolvedGroupId, user]);

  // Fetch messages when conversation is resolved
  useEffect(() => {
    if (!conversationId) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("group_messages" as any)
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(500);

      if (error) {
        console.error("Failed to fetch group messages:", error);
        setLoading(false);
        return;
      }

      const msgs = (data as unknown as GroupMessage[]) || [];
      setMessages(msgs);

      // Fetch profiles for unique senders
      const senderIds = [...new Set(msgs.map(m => m.sender_id))];
      await fetchProfiles(senderIds);
      setLoading(false);
    };

    fetchMessages();
  }, [conversationId]);

  // Fetch sender profiles
  const fetchProfiles = useCallback(async (userIds: string[]) => {
    const newIds = userIds.filter(id => !profileCacheRef.current.has(id));
    if (newIds.length === 0) return;

    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", newIds);

    if (data) {
      setProfiles(prev => {
        const next = new Map(prev);
        data.forEach(p => {
          next.set(p.user_id, {
            user_id: p.user_id,
            full_name: p.full_name || "Ukendt",
            avatar_url: p.avatar_url,
          });
          profileCacheRef.current.add(p.user_id);
        });
        return next;
      });
    }
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`group-chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as unknown as GroupMessage;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          await fetchProfiles([newMsg.sender_id]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as unknown as GroupMessage;
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "group_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const old = payload.old as any;
          if (old?.id) setMessages(prev => prev.filter(m => m.id !== old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchProfiles]);

  // Send message
  const sendMessage = useCallback(async (content: string, files?: File[]) => {
    if (!conversationId || !user || sending) return;
    const trimmed = content.trim();
    const hasFiles = files && files.length > 0;
    if ((!trimmed && !hasFiles) || (trimmed.length > 5000)) return;

    setSending(true);

    let attachments: ChatAttachment[] = [];
    if (hasFiles) {
      attachments = await uploadChatAttachments(user.id, files);
    }

    const insertData: any = {
      conversation_id: conversationId,
      sender_id: user.id,
      content: trimmed || "📎",
    };

    if (attachments.length > 0) {
      insertData.context_meta = { attachments };
    }

    const { error } = await supabase
      .from("group_messages" as any)
      .insert(insertData);

    if (error) {
      console.error("Failed to send group message:", error);
    }
    setSending(false);
  }, [conversationId, user, sending]);

  return {
    messages,
    profiles,
    loading,
    accessDenied,
    sending,
    sendMessage,
    conversationId,
    resolvedGroupId,
  };
}
