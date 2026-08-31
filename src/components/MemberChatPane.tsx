import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { notifyChatMessage } from "@/lib/chatNotify";
import { uploadChatAttachments } from "@/lib/chatAttachments";
import { MessageAttachments, type ChatAttachment } from "@/components/ChatAttachments";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import { ReactionBar, ReactionPicker } from "@/components/MessageReactions";
import { useMessageActions } from "@/hooks/useMessageActions";
import { useConversationLastSeen } from "@/hooks/useConversationLastSeen";
import MessageActionMenu from "@/components/MessageActionMenu";
import MessageEditDialog from "@/components/MessageEditDialog";
import MobileMessageActionDrawer from "@/components/MobileMessageActionDrawer";
import { computeMembershipTier } from "@/lib/membershipTier";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import {
  Send, MessageCircle, CheckCheck, FileText, Target,
  AlertCircle, MessageSquare, Pin, ArrowLeft,
  Building2, Loader2,
} from "lucide-react";
import ChatRichInput from "@/components/ChatRichInput";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { format, startOfDay } from "date-fns";
import { da } from "date-fns/locale";
import {
  dateSeparatorLabel,
  MAX_MESSAGE_LENGTH,
  TOPIC_COLORS,
  type ConversationWithProfile,
  type Message,
} from "@/lib/chatShared";

/** Medlemmets chat — udskilt fra CompanyChatPane (C1 i
    docs/chat-design.md, grundlag chat-split-recon §5). REN kodeflytning:
    kopien hvor alle rådgiver-dele er slettet og isAdvisor-forgreningerne
    er kollapset (isAdvisor var konstant false her). Skelet-JSX og
    load/realtime-effekterne er BEVIDST dubleret med CompanyChatPane —
    medlemssiden skal kunne designes frit (Hb-konvertering), og delt
    skelet ville binde de to flader sammen igen. Komponenten mountes af
    ChatShell for medlemmer OG for rådgivere i "Se som medlem". */
/** Samme avatar-form som Community (kopieret fra CommunityTraadView,
    hvor den er lokal): rounded-full, hb-line-ramme, sage-initial som
    fallback. */
const ForfatterAvatar = ({ navn, avatarUrl, className = "h-9 w-9" }: { navn: string | null; avatarUrl: string | null; className?: string }) =>
  avatarUrl ? (
    <img
      src={avatarUrl}
      alt={navn ?? "Medlem"}
      className={`${className} shrink-0 rounded-full border border-hb-line object-cover`}
    />
  ) : (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-sm text-hb-ink-soft`}>
      {(navn ?? "?").charAt(0)}
    </span>
  );

const MemberChatPane = () => {
  const { user, companyId, companyName } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationWithProfile[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, { full_name: string; avatar_url: string | null }>>(new Map());
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatSubmitRef = useRef<() => void>(() => {});
  const [showMessages, setShowMessages] = useState(false);
  const [participants, setParticipants] = useState<{ user_id: string; full_name: string; avatar_url: string | null; isAdvisor: boolean }[]>([]);

  // Fetch all advisors for member header (independent of conversation participation)
  const { data: allAdvisors } = useQuery({
    queryKey: ["all-advisor-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_all_advisor_profiles" as any);
      if (error) { console.error("Failed to fetch advisor profiles:", error); return []; }
      return (data as any[] || []).map((r: any) => ({
        user_id: r.user_id as string,
        full_name: r.full_name as string,
        avatar_url: r.avatar_url as string | null,
      }));
    },
    staleTime: 10 * 60 * 1000,
  });

  const advisorNamesLabel = allAdvisors && allAdvisors.length > 0
    ? allAdvisors.map((a: any) => a.full_name.split(" ")[0]).join(" & ")
    : "Dine rådgivere";

  // Deep linking
  useEffect(() => {
    const convParam = searchParams.get("conversationId");
    const msgParam = searchParams.get("messageId");
    if (convParam && conversations.length > 0) {
      const conv = conversations.find(c => c.id === convParam);
      if (conv && activeConvId !== convParam) {
        setActiveConvId(convParam);
        if (isMobile) setShowMessages(true);
        // Clear URL param immediately after applying — prevents re-locking
        setSearchParams({}, { replace: true });
      }
      if (msgParam && messages.length > 0 && activeConvId === convParam) {
        setTimeout(() => {
          scrollToMessage(msgParam);
          setSearchParams({}, { replace: true });
        }, 300);
      }
    }
  }, [searchParams, conversations, messages, activeConvId]);

  // Reset active conversation when company changes
  useEffect(() => {
    setActiveConvId(null);
    setMessages([]);
    setShowMessages(false);
  }, [companyId]);

  // Fetch participants for active conversation via security-definer RPC
  const fetchParticipants = async (convId: string) => {
    const { data, error } = await supabase.rpc("get_conversation_sender_profiles" as any, { _conversation_id: convId });
    if (error) { console.error("Failed to load conversation participants:", error); return; }
    const list = ((data as any[]) || []).map((row: any) => ({
      user_id: row.user_id as string,
      full_name: row.full_name as string,
      avatar_url: row.avatar_url as string | null,
      isAdvisor: row.is_advisor as boolean,
    }));
    setParticipants(list);
  };

  useEffect(() => {
    if (!activeConvId) { setParticipants([]); return; }
    fetchParticipants(activeConvId);
  }, [activeConvId]);

  // Load conversations — batch fetch, no N+1
  useEffect(() => {
    if (!user) return;

    const loadConversations = async () => {
      // Kun de 9 læste kolonner — select("*") trak også ops-model-resterne
      // (acknowledged_*, conversation_status, follow_up_at, resolved_at),
      // som ingen læser her (perf/chatpane-nyttelast). Join uændret.
      let convsQuery = supabase
        .from("conversations")
        .select("id, member_id, company_id, last_message_at, created_at, awaiting_reply_from, assigned_advisor_id, last_member_message_at, last_advisor_reply_at, companies:company_id(id, name, logo_url, is_legat, contract_end_date, subscription_status, subscription_current_period_end)")
        .order("last_message_at", { ascending: false });

      // Medlems-grenene fra CompanyChatPane, kollapset (isAdvisor var
      // konstant false her): company-scoped når companyId findes
      // (dækker også company-override), ellers member-scoped.
      if (companyId) {
        convsQuery = convsQuery.eq("company_id", companyId);
      } else {
        convsQuery = convsQuery.eq("member_id", user.id);
      }

      const [convsRes, profilesRes, msgsRes] = await Promise.all([
        convsQuery,
        supabase.from("profiles").select("user_id, full_name, company_name, avatar_url"),
        supabase
          .from("messages")
          .select("id, conversation_id, sender_id, content, read_at, created_at, message_type, context_type, pinned_at")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const convs = convsRes.data || [];
      const profiles = profilesRes.data || [];
      const allMessages = msgsRes.data || [];

      const filteredConvs = convs;

      const pMap = new Map<string, { full_name: string; avatar_url: string | null }>();
      profiles.forEach(p => pMap.set(p.user_id, { full_name: p.full_name, avatar_url: p.avatar_url || null }));
      setProfilesMap(pMap);

      const msgsByConv = new Map<string, typeof allMessages>();
      allMessages.forEach((m) => {
        const arr = msgsByConv.get(m.conversation_id) || [];
        arr.push(m);
        msgsByConv.set(m.conversation_id, arr);
      });

      const enriched: ConversationWithProfile[] = filteredConvs.map((c: any) => {
        const profile = profiles.find((p) => p.user_id === c.member_id) || null;
        const convMsgs = msgsByConv.get(c.id) || [];
        const lastMsg = convMsgs[0];
        const unreadCount = convMsgs.filter(
          (m) => m.sender_id !== user.id && !m.read_at && m.message_type === "user"
        ).length;

        const companyData = c.companies as any;
        const cid = c.company_id || undefined;
        const membershipTier = companyData
          ? computeMembershipTier({
              contract_end_date: companyData.contract_end_date,
              subscription_status: companyData.subscription_status,
              subscription_current_period_end: companyData.subscription_current_period_end,
            })
          : undefined;

        return {
          id: c.id,
          member_id: c.member_id,
          last_message_at: c.last_message_at || c.created_at,
          company_id: cid,
          companyName: companyData?.name || undefined,
          companyLogoUrl: companyData?.logo_url || undefined,
          isLegat: !!companyData?.is_legat,
          membershipTier,
          profile: profile
            ? { full_name: profile.full_name, company_name: profile.company_name || "", avatar_url: profile.avatar_url || "" }
            : null,
          unreadCount,
          lastMessage: lastMsg?.content,
          lastMessageSenderId: lastMsg?.sender_id,
          lastMessageType: lastMsg?.message_type,
          lastContextType: lastMsg?.context_type,
          hasRecentReport: false,
          awaiting_reply_from: c.awaiting_reply_from || null,
          assigned_advisor_id: c.assigned_advisor_id || null,
          last_member_message_at: c.last_member_message_at || null,
          last_advisor_reply_at: c.last_advisor_reply_at || null,
        };
      });

      // Deduplicate by company_id
      const deduped: ConversationWithProfile[] = [];
      const seenCompanies = new Set<string>();
      for (const conv of enriched) {
        if (conv.company_id) {
          if (seenCompanies.has(conv.company_id)) continue;
          seenCompanies.add(conv.company_id);
        }
        deduped.push(conv);
      }

      setConversations(deduped);

      // Auto-select for members
      if (enriched.length > 0 && !activeConvId) {
        setActiveConvId(enriched[0].id);
        if (enriched.length <= 1) setShowMessages(true);
        else if (isMobile) setShowMessages(true);
      }
    };

    loadConversations();
  }, [user, companyId]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConvId) return;

    // Company thread: existing logic
    const loadMessages = async () => {
      // Kun de 11 læste kolonner (alt undtagen edited_at — attachments bor i
      // context_meta-jsonb'en og SKAL med), og et loft på 500: median er 26
      // beskeder og max 89 i dag, så loftet ændrer intet i praksis. Hentes
      // nyeste-først og vendes, så en samtale over loftet viser de NYESTE
      // 500 — ikke de ældste (perf/chatpane-nyttelast).
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, read_at, created_at, message_type, context_type, context_id, context_meta, pinned_at")
        .eq("conversation_id", activeConvId)
        .order("created_at", { ascending: false })
        .limit(500);
      setMessages((data || []).reverse());

      if (user) {
        await supabase.rpc("mark_messages_read", { p_conversation_id: activeConvId });
      }
    };

    loadMessages();

    const channel = supabase
      .channel(`member-chat-messages-${activeConvId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);

          if (newMsg.message_type !== 'system') {
            setParticipants((prev) => {
              if (!prev.some(p => p.user_id === newMsg.sender_id)) {
                fetchParticipants(activeConvId);
              }
              return prev;
            });
          }

          if (newMsg.sender_id !== user?.id && user) {
            await supabase.rpc("mark_messages_read", { p_conversation_id: activeConvId });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload) => {
          const deleted = payload.old as any;
          if (deleted?.id) setMessages((prev) => prev.filter(m => m.id !== deleted.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConvId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (content: string, files?: File[]) => {
    const trimmed = content.trim();
    const hasFiles = files && files.length > 0;
    if ((!trimmed && !hasFiles) || !activeConvId || !user) return;

    if (trimmed.length > MAX_MESSAGE_LENGTH) return;

    // Defense in depth: composer is also hidden in the UI when this is true,
    // but a stale `conversations` snapshot or a race could still leave it
    // mounted. The toast surfaces why nothing happened.
    const activeConvForSend = conversations.find(c => c.id === activeConvId);
    if (activeConvForSend?.membershipTier === "expired") {
      toast.error("Denne virksomhed er udløbet — beskeder kan ikke sendes");
      return;
    }

    setSending(true);

    // Upload attachments if any
    let attachments: ChatAttachment[] = [];
    if (hasFiles) {
      const uploadResult = await uploadChatAttachments(user.id, files);
      attachments = uploadResult.attachments;
      if (uploadResult.failedCount > 0) {
        if (attachments.length === 0 && !trimmed) {
          setSending(false);
          toast.error("Filer kunne ikke uploades. Prøv igen.");
          return;
        }
        toast.warning(`${uploadResult.failedCount} fil${uploadResult.failedCount > 1 ? "er" : ""} kunne ikke uploades og er ikke vedhæftet.`);
      }
    }

    const contextMeta = attachments.length > 0 ? { attachments } : undefined;

    {
      const insertData: any = {
        conversation_id: activeConvId,
        sender_id: user.id,
        content: trimmed || "📎",
      };

      if (contextMeta) {
        insertData.context_meta = contextMeta;
      }

      const { data, error } = await supabase.from("messages").insert(insertData).select().single();

      if (!error && data) {
        setNewMessage("");
        notifyChatMessage((data as any).id);
      }
    }

    setSending(false);
  }, [activeConvId, user, conversations]);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  // useCompanyFacts er fjernet med C2: hooken var her alene for
  // report_card-kortets nøgletals-fliser, og kortet findes ikke længere.

  const pinnedMessages = useMemo(() =>
    messages.filter(m => m.pinned_at).sort((a, b) =>
      new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime()
    ), [messages]);

  const togglePin = async (msg: Message) => {
    const newVal = msg.pinned_at ? null : new Date().toISOString();
    await supabase.from("messages").update({ pinned_at: newVal } as any).eq("id", msg.id);
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned_at: newVal } : m));
  };

  const scrollToMessage = (msgId: string) => {
    const el = messageRefs.current.get(msgId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-hb-evergreen/50");
      setTimeout(() => el.classList.remove("ring-2", "ring-hb-evergreen/50"), 2000);
    }
  };

  const handleBackToList = () => {
    setShowMessages(false);
  };

  // Compute latestReadOwnMsgId for member read receipt
  const latestReadOwnMsgId = useMemo(() => {
    if (!user) return null;
    const ownMsgs = messages.filter(m => m.sender_id === user.id && m.read_at);
    return ownMsgs.length > 0 ? ownMsgs[ownMsgs.length - 1].id : null;
  }, [messages, user]);

  // Reactions hook
  const reactionMessageTable = "messages" as const;
  const reactionMessageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { getAggregated: getReactions, toggleReaction } = useMessageReactions(
    reactionMessageIds,
    reactionMessageTable,
    user?.id
  );

  // Edit/delete hook (isAdvisor = false: medlemmet har 15-min-vinduet)
  const {
    editingId, editContent, setEditContent,
    startEdit, cancelEdit, saveEdit: saveEditAction,
    deleteMessage: deleteMessageAction, canEdit: canEditCheck, canDelete: canDeleteCheck,
  } = useMessageActions(reactionMessageTable, user?.id, false);

  // Long-press quick-react overlay for mobile message bubbles
  const [longPressedMessageId, setLongPressedMessageId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressHandlers = useCallback((messageId: string) => ({
    onTouchStart: () => {
      longPressTimerRef.current = setTimeout(() => setLongPressedMessageId(messageId), 500);
    },
    onTouchEnd: () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
    onTouchMove: () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
  }), []);

  // Last-seen / unread marker hook
  const lastSeenConvType = "company" as const;
  const latestMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const { lastSeenMessageId: companyLastSeenId } = useConversationLastSeen(
    activeConvId,
    lastSeenConvType,
    user?.id,
    latestMsgId
  );

  const handleEditSave = async (html: string) => {
    // editingId kan nulstilles af saveEdit ved success, saa fang id'et foer await.
    const id = editingId;
    if (!id) return false;
    const ok = await saveEditAction(id, html);
    if (ok) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, content: html, edited_at: new Date().toISOString() } as any : m));
    }
    return ok;
  };

  const handleDeleteMsg = async (messageId: string) => {
    const ok = await deleteMessageAction(messageId);
    if (ok) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    }
  };

  return (
    <>
      {/* C4/C: kassen er væk — papiret går ud til kanten; beskedlisten
          bærer selv sin vandrette margin. */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          {activeConvId ? (
            <>
              {/* Header — medlemmets rådgiver-avatarer (Community-formen) */}
              {(allAdvisors && allAdvisors.length > 0) ? (
                <div className={`${isMobile ? "px-3 py-2.5" : "px-4 md:px-6 py-3"} border-b border-hb-line flex items-center gap-3`}>
                  {isMobile && (
                    <button
                      onClick={handleBackToList}
                      className="p-1.5 -ml-1 rounded-full text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/30 transition-colors"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                  )}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex -space-x-2">
                      {allAdvisors.slice(0, 3).map((p) => (
                        <ForfatterAvatar key={p.user_id} navn={p.full_name} avatarUrl={p.avatar_url} />
                      ))}
                    </div>
                    <span className="text-sm text-hb-ink-soft truncate">
                      {isMobile
                        ? allAdvisors.map(p => p.full_name.split(" ")[0]).join(", ")
                        : `Dine rådgivere: ${allAdvisors.map(p => p.full_name.split(" ")[0]).join(", ")}`}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Messages list */}
              <div ref={messagesContainerRef} className={`flex-1 overflow-y-auto min-w-0 ${isMobile ? "px-3 py-3 space-y-2" : "px-4 md:px-5 py-4 space-y-4"}`}>
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center px-8">
                    <div className="h-12 w-12 rounded-full bg-hb-sage/40 flex items-center justify-center mb-4">
                      <MessageSquare className="h-6 w-6 text-hb-evergreen" />
                    </div>
                    <p className="text-sm font-medium text-hb-ink mb-1">
                      Din direkte linje til rådgiverne
                    </p>
                    <p className="text-xs text-hb-ink-soft leading-relaxed max-w-xs">
                      Skriv hvad du har på hjerte — spørgsmål, opdateringer eller bare hvad der fylder. Dine rådgivere læser dine tal og svarer hurtigt.
                    </p>
                  </div>
                )}
                {(() => {
                  let lastDateKey = "";
                  let unreadDividerShown = false;
                  return messages.map((msg, msgIdx) => {
                    // Bælte og seler: RLS (migration 20260831131200) forhindrer at
                    // session_prep-rækker overhovedet når medlemmets klient. Filteret
                    // her gælder rådgiveren i "Se som medlem" (ChatShell mounter denne
                    // komponent for dem), hvor RLS ikke kan skelne — JWT'en er stadig
                    // rådgiverens.
                    if (msg.context_type === "session_prep") return null;
                    const isMine = msg.sender_id === user?.id;
                    const contextType = msg.context_type || null;
                    const contextMeta = msg.context_meta || null;
                    const topicInfo = contextType && TOPIC_COLORS[contextType] ? TOPIC_COLORS[contextType] : null;

                    // Date separator
                    const msgDate = new Date(msg.created_at);
                    const dateKey = startOfDay(msgDate).toISOString();
                    let dateSep: React.ReactNode = null;
                    if (dateKey !== lastDateKey) {
                      lastDateKey = dateKey;
                      dateSep = (
                        /* Events-rytmen: ÉN hairline, labelen står på
                           papiret over den — ikke to streger om et ord. */
                        <div className="relative py-3">
                          <div className="border-t border-hb-line" />
                          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-hb-paper px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                            {dateSeparatorLabel(msgDate)}
                          </span>
                        </div>
                      );
                    }

                    // System / AI messages — C4/B: ikke længere et KORT.
                    // Målt: ét systemkort fyldte mere end fire replikker
                    // tilsammen. Nu en STILLE LINJE i strømmen: centreret,
                    // rammeløs, ink-soft — den vejer mindre end en
                    // menneskebesked. Gælder milestone, agent og
                    // opgave_forslag; agent-feedback består som tekstuelle
                    // handlinger (evergreen).
                    if (msg.message_type === "system" || msg.message_type === "ai") {
                      return (
                        <React.Fragment key={msg.id}>
                          {dateSep}
                        <div
                          ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
                          className="flex justify-center group/msg transition-all duration-300"
                        >
                          <div className="max-w-[90%] md:max-w-[75%] px-2 py-1 text-center">
                            <div className="text-[13px] text-hb-ink-soft leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(
                              msg.content
                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                .replace(/\n/g, '<br>'),
                              { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }
                            ) }} />
                            {/* C2 (besluttet 31/8): report_card/ai_analysis er
                                væk. Milestone-titlen står som stille suffiks —
                                den lilla off-token-chip er erstattet af ren
                                tekst i strømmens egen tone. */}
                            <div className="mt-0.5 flex items-center justify-center gap-2 text-[10px] text-hb-ink-soft/70">
                              {contextType && contextMeta?.title && (
                                <span className="inline-flex items-center gap-1 truncate">
                                  {contextType === "milestone" && <Target className="h-2.5 w-2.5 shrink-0" />}
                                  {String(contextMeta.title)}
                                  <span aria-hidden>·</span>
                                </span>
                              )}
                              <span>{format(new Date(msg.created_at), "HH:mm", { locale: da })}</span>
                              <button
                                onClick={() => togglePin(msg)}
                                className={`p-0.5 rounded transition-all ${
                                  msg.pinned_at
                                    ? "text-hb-evergreen opacity-100 hover:text-hb-rust"
                                    : "text-hb-ink-soft opacity-0 group-hover/msg:opacity-100 hover:text-hb-evergreen"
                                }`}
                                title={msg.pinned_at ? "Fjern pin" : "Pin besked"}
                              >
                                <Pin className="h-3 w-3" />
                              </button>
                            </div>
                            {msg.context_type === "agent" && (
                              <div className="mt-1 flex items-center justify-center gap-3 text-[11px]">
                                <span className="text-hb-ink-soft/70">Var dette nyttigt?</span>
                                <button
                                  onClick={async () => {
                                    await supabase.from("messages").update({
                                      context_meta: { ...(msg.context_meta as any || {}), feedback: "up" }
                                    } as any).eq("id", msg.id);
                                    toast.success("Tak for feedback");
                                  }}
                                  className="text-hb-evergreen transition-colors hover:underline underline-offset-2"
                                >
                                  Ja
                                </button>
                                <button
                                  onClick={async () => {
                                    await supabase.from("messages").update({
                                      context_meta: { ...(msg.context_meta as any || {}), feedback: "down" }
                                    } as any).eq("id", msg.id);
                                    toast("Forstået — vi arbejder på det");
                                  }}
                                  className="text-hb-evergreen transition-colors hover:underline underline-offset-2"
                                >
                                  Nej
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                      );
                    }

                    const participant = participants.find(p => p.user_id === msg.sender_id);
                    const senderProfile = participant || profilesMap.get(msg.sender_id);
                    const senderName = senderProfile?.full_name || "Rådgiver";
                    const senderAvatar = senderProfile?.avatar_url;

                    // Unread divider
                    let showUnreadDivider = false;
                    if (!unreadDividerShown && companyLastSeenId && companyLastSeenId !== latestMsgId && msgIdx > 0) {
                      if (messages[msgIdx - 1].id === companyLastSeenId && !isMine) {
                        showUnreadDivider = true;
                        unreadDividerShown = true;
                      }
                    }

                    const isEditingThis = editingId === msg.id;

                    return (
                      <React.Fragment key={msg.id}>
                        {dateSep}
                        {showUnreadDivider && (
                          /* Evergreen, diskret — samme én-hairline-form som
                             dags-separatoren. */
                          <div className="relative py-3">
                            <div className="border-t border-hb-evergreen/40" />
                            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-hb-paper px-3 text-[11px] font-medium text-hb-evergreen">
                              Nye beskeder
                            </span>
                          </div>
                        )}
                      <div
                        ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
                        className={`flex group/msg ${isMine ? "justify-end" : "justify-start"} items-end gap-2 transition-all duration-300`}
                      >
                        {!isMine && !isMobile && (
                          <div className="mb-1">
                            <ForfatterAvatar navn={senderName} avatarUrl={senderAvatar ?? null} className="h-7 w-7" />
                          </div>
                        )}
                        <div
                          className={`${isMobile ? "max-w-[88%]" : "max-w-[70%]"} relative ${msg.pinned_at ? "ring-1 ring-hb-evergreen/20 rounded-hb" : ""}`}
                          {...(isMobile ? longPressHandlers(msg.id) : {})}
                        >
                          {longPressedMessageId === msg.id && isMobile && (
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-hb-surface border border-hb-line rounded-full px-2 py-1 shadow-hb-hover">
                              <button onClick={() => { toggleReaction(msg.id, "👍"); setLongPressedMessageId(null); }} className="p-1.5 hover:bg-hb-sage/30 rounded-full text-sm">👍</button>
                              <button onClick={() => { toggleReaction(msg.id, "❤️"); setLongPressedMessageId(null); }} className="p-1.5 hover:bg-hb-sage/30 rounded-full text-sm">❤️</button>
                              <button onClick={() => { navigator.clipboard.writeText(msg.content || ""); setLongPressedMessageId(null); }} className="p-1.5 hover:bg-hb-sage/30 rounded-full text-sm">📋</button>
                            </div>
                          )}
                          {!isMobile && !isEditingThis && (
                            <div className={`absolute ${isMine ? "-left-20" : "-right-20"} top-1/2 -translate-y-1/2 flex gap-0.5 z-10`}>
                              <button
                                onClick={() => togglePin(msg)}
                                className={`p-1 rounded-md transition-all ${
                                  msg.pinned_at
                                    ? "text-hb-evergreen opacity-100 hover:text-hb-rust"
                                    : "text-hb-ink-soft opacity-0 group-hover/msg:opacity-100 hover:text-hb-evergreen hover:bg-hb-evergreen/10"
                                }`}
                                title={msg.pinned_at ? "Fjern pin" : "Pin besked"}
                              >
                                <Pin className="h-3.5 w-3.5" />
                              </button>
                              <ReactionPicker
                                onSelect={(emoji) => toggleReaction(msg.id, emoji)}
                                isMine={isMine}
                                variant="hb"
                              />
                              <MessageActionMenu
                                canEdit={canEditCheck(msg.sender_id, msg.created_at)}
                                canDelete={canDeleteCheck(msg.sender_id)}
                                onEdit={() => startEdit(msg.id, msg.content)}
                                onDelete={() => handleDeleteMsg(msg.id)}
                                isMine={isMine}
                                variant="hb"
                              />
                            </div>
                          )}
                          {isMobile ? (
                            <MobileMessageActionDrawer
                              canEdit={canEditCheck(msg.sender_id, msg.created_at)}
                              canDelete={canDeleteCheck(msg.sender_id)}
                              onEdit={() => startEdit(msg.id, msg.content)}
                              onDelete={() => handleDeleteMsg(msg.id)}
                              onReaction={(emoji) => toggleReaction(msg.id, emoji)}
                              variant="hb"
                            >
                              {topicInfo && (
                                /* Emnefarverne (inkl. milestone-lilla) er off-token —
                                   i Hb er alle emne-chips sage/ink (HbTag-formen). */
                                <div className={`mb-1 inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full bg-hb-sage/50 text-hb-ink ${isMine ? "ml-auto" : ""}`}>
                                  <topicInfo.icon className="h-2.5 w-2.5" />
                                  {topicInfo.label}
                                </div>
                              )}
                              {contextType && contextMeta?.title && (
                                <div className={`mb-1 inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-t-lg ${
                                  isMine ? "bg-hb-sage/60 text-hb-ink ml-auto" : "bg-hb-sage/30 text-hb-ink-soft"
                                }`}>
                                  {contextType === "report" && <FileText className="h-3 w-3" />}
                                  {contextType === "milestone" && <Target className="h-3 w-3" />}
                                  Re: {String(contextMeta.title)}
                                </div>
                              )}
                              <div
                                className={`rounded-hb px-4 py-2.5 ${
                                  isMine
                                    ? "bg-hb-sage text-hb-ink rounded-br-md"
                                    : "bg-hb-surface border border-hb-line text-hb-ink rounded-bl-md"
                                } ${contextType ? "rounded-tl-md" : ""}`}
                              >
                                {!isMine && (
                                  <p className="text-[10px] font-medium text-hb-ink-soft mb-0.5">
                                    {senderName}
                                  </p>
                                )}
                                {msg.content !== "📎" && (
                                  <div className="text-sm leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }) }} />
                                )}
                                <MessageAttachments attachments={msg.context_meta?.attachments} isMine={isMine} messageId={msg.id} source="messages" variant="hb" />
                                <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : ""}`}>
                                  {(msg as any).edited_at && (
                                    <span className="text-[9px] italic text-hb-ink-soft/70">
                                      (redigeret)
                                    </span>
                                  )}
                                  <span className="text-[10px] text-hb-ink-soft">
                                    {format(new Date(msg.created_at), "HH:mm", { locale: da })}
                                  </span>
                                  {isMine && msg.id === latestReadOwnMsgId && (
                                    <>
                                      <CheckCheck className="h-3 w-3 text-hb-ink-soft" />
                                      <span className="text-[10px] text-hb-ink-soft">Læst</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </MobileMessageActionDrawer>
                          ) : (
                            <>
                              {topicInfo && (
                                /* Emnefarverne (inkl. milestone-lilla) er off-token —
                                   i Hb er alle emne-chips sage/ink (HbTag-formen). */
                                <div className={`mb-1 inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full bg-hb-sage/50 text-hb-ink ${isMine ? "ml-auto" : ""}`}>
                                  <topicInfo.icon className="h-2.5 w-2.5" />
                                  {topicInfo.label}
                                </div>
                              )}
                              {contextType && contextMeta?.title && (
                                <div className={`mb-1 inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-t-lg ${
                                  isMine ? "bg-hb-sage/60 text-hb-ink ml-auto" : "bg-hb-sage/30 text-hb-ink-soft"
                                }`}>
                                  {contextType === "report" && <FileText className="h-3 w-3" />}
                                  {contextType === "milestone" && <Target className="h-3 w-3" />}
                                  Re: {String(contextMeta.title)}
                                </div>
                              )}
                              <div
                                className={`rounded-hb px-4 py-2.5 ${
                                  isMine
                                    ? "bg-hb-sage text-hb-ink rounded-br-md"
                                    : "bg-hb-surface border border-hb-line text-hb-ink rounded-bl-md"
                                } ${contextType ? "rounded-tl-md" : ""}`}
                              >
                                {!isMine && (
                                  <p className="text-[10px] font-medium text-hb-ink-soft mb-0.5">
                                    {senderName}
                                  </p>
                                )}
                                {msg.content !== "📎" && (
                                  <div className="text-sm leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }) }} />
                                )}
                                <MessageAttachments attachments={msg.context_meta?.attachments} isMine={isMine} messageId={msg.id} source="messages" variant="hb" />
                                <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : ""}`}>
                                  {(msg as any).edited_at && (
                                    <span className="text-[9px] italic text-hb-ink-soft/70">
                                      (redigeret)
                                    </span>
                                  )}
                                  <span className="text-[10px] text-hb-ink-soft">
                                    {format(new Date(msg.created_at), "HH:mm", { locale: da })}
                                  </span>
                                  {isMine && msg.id === latestReadOwnMsgId && (
                                    <>
                                      <CheckCheck className="h-3 w-3 text-hb-ink-soft" />
                                      <span className="text-[10px] text-hb-ink-soft">Læst</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                          <ReactionBar
                            reactions={getReactions(msg.id)}
                            onToggle={(emoji) => toggleReaction(msg.id, emoji)}
                            isMine={isMine}
                            variant="hb"
                            getReactorName={(userId) =>
                              profilesMap.get(userId)?.full_name ||
                              participants.find(p => p.user_id === userId)?.full_name ||
                              "Ukendt"
                            }
                          />
                        </div>
                        {isMine && !isMobile && (
                          <div className="mb-1">
                            <ForfatterAvatar navn={senderName} avatarUrl={senderAvatar ?? null} className="h-7 w-7" />
                          </div>
                        )}
                      </div>
                      </React.Fragment>
                    );
                  });
                })()}
                <div ref={messagesEndRef} />
              </div>

              {/* Input — sticky at bottom of message column (ingen emne-
                  vælger: den var rådgiverens og skrev kun til lokal state).
                  Hairline over feltet; selve feltet er HbCard-agtigt via
                  ChatRichInputs hb-variant (hvid flade, hb-line, rounded-hb). */}
              <div
                className={`${isMobile ? "px-2 pt-2 pb-2" : "p-3 md:p-4"} border-t border-hb-line bg-hb-paper shrink-0 z-10`}
                style={{
                  paddingBottom: isMobile ? "calc(0.5rem + env(safe-area-inset-bottom))" : undefined,
                }}
              >
                {activeConv?.membershipTier === "expired" ? (
                  /* Advarsel — rust (en af rusts fire betydninger). */
                  <div className="flex items-center gap-2 px-3 py-3 rounded-hb bg-hb-sage/20 border border-hb-line text-xs text-hb-ink-soft">
                    <AlertCircle className="h-4 w-4 text-hb-rust shrink-0" />
                    <span>
                      Denne virksomhed er <span className="font-medium text-hb-ink">udløbet</span> — beskeder kan ikke sendes. Historik er stadig læsbar.
                    </span>
                  </div>
                ) : (
                <>
                <div className="flex gap-2 items-end">
                  <ChatRichInput
                    onSubmit={handleSend}
                    onRequestSubmit={(fn) => { chatSubmitRef.current = fn; }}
                    disabled={sending}
                    placeholder={`Skriv til ${advisorNamesLabel}...`}
                    maxLength={MAX_MESSAGE_LENGTH}
                    variant="hb"
                  />
                  {!isMobile && (
                    <HbButton
                      type="button"
                      onClick={() => chatSubmitRef.current()}
                      disabled={sending}
                      className="h-11 w-11 shrink-0 px-0"
                      aria-label="Send besked"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </HbButton>
                  )}
                </div>
                {!isMobile && <div className="safe-bottom-spacer" />}
                </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col min-w-0">
              {companyName && (
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-hb-line bg-hb-sage/20 text-xs text-hb-ink-soft">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Samtale for <span className="font-medium text-hb-ink">{companyName}</span> med {advisorNamesLabel}</span>
                </div>
              )}
              <div className="flex-1 flex items-center justify-center text-center px-6">
                <div className="max-w-sm">
                  <div className="mx-auto w-14 h-14 rounded-full bg-hb-sage/40 flex items-center justify-center mb-4">
                    <MessageCircle className="h-7 w-7 text-hb-evergreen" />
                  </div>
                  <h3 className="font-editorial text-xl font-medium text-hb-ink mb-2">
                    Din direkte linje til {advisorNamesLabel}
                  </h3>
                  <p className="text-sm text-hb-ink-soft leading-relaxed">
                    Stil spørgsmål, del opdateringer eller få sparring på dine tal og beslutninger.
                    Vi svarer typisk inden for 24 timer.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <MessageEditDialog
        open={editingId !== null}
        onOpenChange={(o) => { if (!o) cancelEdit(); }}
        initialHTML={editContent}
        onSave={handleEditSave}
        variant="hb"
      />
    </>
  );
};

export default MemberChatPane;
