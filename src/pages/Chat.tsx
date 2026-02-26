import { useState, useEffect, useRef, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageCircle, CheckCheck, FileText, Sparkles, Target,
  Search, Inbox, Clock, AlertCircle, Filter, Calculator, BookOpen, MessageSquare,
  BarChart3, Pin, Maximize2, Minimize2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
  message_type?: string;
  context_type?: string | null;
  context_meta?: any;
  pinned_at?: string | null;
}

interface ConversationWithProfile {
  id: string;
  member_id: string;
  last_message_at: string;
  profile: { full_name: string; company_name: string; avatar_url: string } | null;
  unreadCount: number;
  lastMessage?: string;
  lastMessageSenderId?: string;
  lastMessageType?: string;
  lastContextType?: string | null;
  hasRecentReport: boolean;
  recentReportName?: string;
}

type InboxFilter = "alle" | "ubesvaret" | "rapporter" | "besvaret";
type TopicFilter = "all" | "report" | "handout" | "milestone" | "budget" | "sparring";
type MessageTopic = "report" | "handout" | "milestone" | "budget" | null;

const FILTER_CONFIG: { key: InboxFilter; label: string; icon: typeof Inbox }[] = [
  { key: "alle", label: "Alle", icon: Inbox },
  { key: "ubesvaret", label: "Ubesvaret", icon: AlertCircle },
  { key: "rapporter", label: "Ny rapport", icon: FileText },
  { key: "besvaret", label: "Besvaret", icon: CheckCheck },
];

const TOPIC_CONFIG: { key: TopicFilter; label: string; icon: typeof MessageSquare; color: string }[] = [
  { key: "all", label: "Alle", icon: MessageSquare, color: "bg-muted text-muted-foreground" },
  { key: "report", label: "Rapporter", icon: FileText, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { key: "handout", label: "Handouts", icon: BookOpen, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { key: "milestone", label: "Milestones", icon: Target, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { key: "budget", label: "Budget", icon: Calculator, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  { key: "sparring", label: "Sparring", icon: MessageSquare, color: "bg-muted text-muted-foreground" },
];

const TOPIC_COLORS: Record<string, { bg: string; text: string; label: string; icon: typeof MessageSquare }> = {
  report: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", label: "Rapport", icon: FileText },
  handout: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", label: "Handout", icon: BookOpen },
  milestone: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", label: "Milestone", icon: Target },
  budget: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", label: "Budget", icon: Calculator },
};

const MESSAGE_TOPICS: { key: MessageTopic; label: string }[] = [
  { key: null, label: "Generelt" },
  { key: "report", label: "Rapport" },
  { key: "handout", label: "Handout" },
  { key: "milestone", label: "Milestone" },
  { key: "budget", label: "Budget" },
];

const Chat = () => {
  const { user, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [conversations, setConversations] = useState<ConversationWithProfile[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("alle");
  const [topicFilter, setTopicFilter] = useState<TopicFilter>("all");
  const [selectedTopic, setSelectedTopic] = useState<MessageTopic>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load conversations — batch fetch, no N+1
  useEffect(() => {
    if (!user) return;

    const loadConversations = async () => {
      const [convsRes, profilesRes, msgsRes, reportsRes] = await Promise.all([
        supabase
          .from("conversations")
          .select("*")
          .order("last_message_at", { ascending: false }),
        supabase.from("profiles").select("user_id, full_name, company_name, avatar_url"),
        supabase
          .from("messages")
          .select("id, conversation_id, sender_id, content, read_at, created_at, message_type, context_type, pinned_at")
          .order("created_at", { ascending: false })
          .limit(500),
        // Fetch recent reports (last 7 days) for advisor view
        isAdvisor
          ? supabase
              .from("financial_reports")
              .select("user_id, file_name, uploaded_at, status")
              .gte("uploaded_at", new Date(Date.now() - 7 * 86400000).toISOString())
              .order("uploaded_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

      const convs = convsRes.data || [];
      const profiles = profilesRes.data || [];
      const allMessages = msgsRes.data || [];
      const recentReports = reportsRes.data || [];

      // Recent reports by user
      const reportsByUser = new Map<string, { name: string }>();
      recentReports.forEach((r: any) => {
        if (!reportsByUser.has(r.user_id)) {
          reportsByUser.set(r.user_id, { name: r.file_name });
        }
      });

      // Group messages by conversation for quick lookup
      const msgsByConv = new Map<string, typeof allMessages>();
      allMessages.forEach((m) => {
        const arr = msgsByConv.get(m.conversation_id) || [];
        arr.push(m);
        msgsByConv.set(m.conversation_id, arr);
      });

      const enriched: ConversationWithProfile[] = convs.map((c) => {
        const profile = profiles.find((p) => p.user_id === c.member_id) || null;
        const convMsgs = msgsByConv.get(c.id) || [];

        const lastMsg = convMsgs[0];
        const unreadCount = convMsgs.filter(
          (m) => m.sender_id !== user.id && !m.read_at
        ).length;

        const report = reportsByUser.get(c.member_id);

        return {
          id: c.id,
          member_id: c.member_id,
          last_message_at: c.last_message_at || c.created_at,
          profile: profile
            ? { full_name: profile.full_name, company_name: profile.company_name || "", avatar_url: profile.avatar_url || "" }
            : null,
          unreadCount,
          lastMessage: lastMsg?.content,
          lastMessageSenderId: lastMsg?.sender_id,
          lastMessageType: lastMsg?.message_type,
          lastContextType: lastMsg?.context_type,
          hasRecentReport: !!report,
          recentReportName: report?.name,
        };
      });

      setConversations(enriched);

      // Auto-select for members
      if (!isAdvisor && enriched.length > 0 && !activeConvId) {
        setActiveConvId(enriched[0].id);
      }
    };

    loadConversations();
  }, [user, isAdvisor, activeConvId]);

  // Filtered & searched conversations for advisor
  const filteredConversations = useMemo(() => {
    let result = conversations;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.profile?.full_name?.toLowerCase().includes(q) ||
          c.profile?.company_name?.toLowerCase().includes(q)
      );
    }

    // Filter
    switch (activeFilter) {
      case "ubesvaret":
        result = result.filter((c) => c.unreadCount > 0);
        break;
      case "rapporter":
        result = result.filter((c) => c.hasRecentReport);
        break;
      case "besvaret":
        result = result.filter((c) => c.unreadCount === 0);
        break;
    }

    return result;
  }, [conversations, searchQuery, activeFilter]);

  // Stats for filter badges
  const stats = useMemo(() => ({
    total: conversations.length,
    unanswered: conversations.filter((c) => c.unreadCount > 0).length,
    withReports: conversations.filter((c) => c.hasRecentReport).length,
    answered: conversations.filter((c) => c.unreadCount === 0).length,
  }), [conversations]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConvId) return;

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeConvId)
        .order("created_at", { ascending: true });
      setMessages(data || []);

      if (user) {
        await supabase
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .eq("conversation_id", activeConvId)
          .neq("sender_id", user.id)
          .is("read_at", null);
      }
    };

    loadMessages();

    const channel = supabase
      .channel(`messages-${activeConvId}`)
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

          if (newMsg.sender_id !== user?.id) {
            await supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", newMsg.id);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConvId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const MAX_MESSAGE_LENGTH = 5000;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMessage.trim();
    if (!trimmed || !activeConvId || !user) return;

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return; // UI already prevents this, but guard anyway
    }

    setSending(true);
    const insertData: any = {
      conversation_id: activeConvId,
      sender_id: user.id,
      content: trimmed,
    };

    if (selectedTopic) {
      insertData.context_type = selectedTopic;
    }

    const { error } = await supabase.from("messages").insert(insertData);

    if (!error) {
      setNewMessage("");
      // Don't reset selectedTopic — user might send multiple messages on same topic
    }
    setSending(false);
  };

  // Filter messages by topic
  const filteredMessages = useMemo(() => {
    if (topicFilter === "all") return messages;
    if (topicFilter === "sparring") return messages.filter(m => !m.context_type);
    return messages.filter(m => m.context_type === topicFilter);
  }, [messages, topicFilter]);

  const activeConv = conversations.find((c) => c.id === activeConvId);

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
      el.classList.add("ring-2", "ring-primary/50");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2000);
    }
  };

  const getInitialsLocal = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const relativeTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: da });
    } catch {
      return "";
    }
  };

  return (
    <AppLayout fullscreen={isFullscreen}>
      {isAdvisor && !isFullscreen && (
        <div className="mb-2">
          <h1 className="text-xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Indbakke
          </h1>
        </div>
      )}

      <div className={`glass-card overflow-hidden flex ${isFullscreen ? "h-screen" : "rounded-xl"}`} style={isFullscreen ? undefined : { height: isAdvisor ? "calc(100vh - 120px)" : "calc(100vh - 80px)" }}>
        {/* ─── ADVISOR INBOX SIDEBAR ─── */}
        {isAdvisor && (
          <div className="w-[340px] border-r border-border flex flex-col bg-card/50">
            {/* Quick stats */}
            <div className="px-4 pt-4 pb-3 border-b border-border space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center py-2 rounded-lg bg-secondary/50">
                  <p className={`text-lg font-display font-bold ${stats.unanswered > 0 ? "text-destructive" : "text-foreground"}`}>
                    {stats.unanswered}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Ubesvaret</p>
                </div>
                <div className="text-center py-2 rounded-lg bg-secondary/50">
                  <p className={`text-lg font-display font-bold ${stats.withReports > 0 ? "text-primary" : "text-foreground"}`}>
                    {stats.withReports}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Ny rapport</p>
                </div>
                <div className="text-center py-2 rounded-lg bg-secondary/50">
                  <p className="text-lg font-display font-bold text-foreground">{stats.total}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total</p>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Søg medlem eller virksomhed..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1">
                {FILTER_CONFIG.map((f) => {
                  const count = f.key === "alle" ? stats.total
                    : f.key === "ubesvaret" ? stats.unanswered
                    : f.key === "rapporter" ? stats.withReports
                    : stats.answered;
                  const isActive = activeFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setActiveFilter(f.key)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      <f.icon className="h-3 w-3" />
                      {f.label}
                      {count > 0 && f.key !== "alle" && (
                        <span className={`ml-0.5 text-[9px] ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-6 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {searchQuery ? "Ingen resultater" : "Ingen samtaler i denne kategori"}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isActive = activeConvId === conv.id;
                  const isUnread = conv.unreadCount > 0;
                  const lastMsgIsFromMember = conv.lastMessageSenderId && conv.lastMessageSenderId !== user?.id;

                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConvId(conv.id)}
                      className={`w-full text-left px-4 py-3.5 border-b border-border/30 transition-colors ${
                        isActive
                          ? "bg-primary/5 border-l-2 border-l-primary"
                          : isUnread
                          ? "bg-destructive/[0.03] hover:bg-secondary/50"
                          : "hover:bg-secondary/30"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar with status indicator */}
                        <div className="relative flex-shrink-0">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            isUnread ? "bg-destructive/10" : "bg-primary/10"
                          }`}>
                            <span className={`text-xs font-semibold ${isUnread ? "text-destructive" : "text-primary"}`}>
                              {getInitialsLocal(conv.profile?.full_name || "??")}
                            </span>
                          </div>
                          {isUnread && (
                            <div className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-destructive border-2 border-card flex items-center justify-center">
                              <span className="text-[7px] font-bold text-destructive-foreground">{conv.unreadCount}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Name + time row */}
                          <div className="flex items-center justify-between mb-0.5">
                            <p className={`text-sm truncate ${isUnread ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                              {conv.profile?.full_name || "Ukendt"}
                            </p>
                            <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                              {relativeTime(conv.last_message_at)}
                            </span>
                          </div>

                          {/* Company */}
                          {conv.profile?.company_name && (
                            <p className="text-[10px] text-muted-foreground mb-1">{conv.profile.company_name}</p>
                          )}

                          {/* Last message preview */}
                          {conv.lastMessage && (
                            <p className={`text-xs truncate ${isUnread ? "text-foreground/70 font-medium" : "text-muted-foreground"}`}>
                              {lastMsgIsFromMember ? "" : "Du: "}
                              {conv.lastMessage}
                            </p>
                          )}

                          {/* Tags row */}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {conv.hasRecentReport && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                <FileText className="h-2.5 w-2.5" />
                                {conv.recentReportName
                                  ? conv.recentReportName.length > 20
                                    ? conv.recentReportName.slice(0, 20) + "…"
                                    : conv.recentReportName
                                  : "Ny rapport"}
                              </span>
                            )}
                            {isUnread && lastMsgIsFromMember && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                                <Clock className="h-2.5 w-2.5" />
                                Afventer svar
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ─── MESSAGE AREA ─── */}
        <div className="flex-1 flex flex-col">
          {activeConvId ? (
            <>
              {/* Header — only show for advisor view */}
              {isAdvisor ? (
                <div className="px-5 py-3 border-b border-border flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-semibold text-primary">
                      {getInitialsLocal(activeConv?.profile?.full_name || "??")}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {activeConv?.profile?.full_name || "Ukendt"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {activeConv?.profile?.company_name || ""}
                    </p>
                  </div>
                  {activeConv?.hasRecentReport && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                      <FileText className="h-3 w-3" />
                      Ny rapport indsendt
                    </span>
                  )}
                </div>
              ) : null}

              {/* Topic filter chips + fullscreen toggle */}
              <div className="px-4 py-2 border-b border-border/50 flex items-center gap-1.5 overflow-x-auto">
                {isFullscreen && (
                  <button
                    onClick={() => setIsFullscreen(false)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors mr-1"
                    title="Afslut fuldskærm"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                )}
                {TOPIC_CONFIG.map(t => {
                  const isActive = topicFilter === t.key;
                  const TopicIcon = t.icon;
                  const count = t.key === "all" ? messages.length
                    : t.key === "sparring" ? messages.filter(m => !m.context_type).length
                    : messages.filter(m => m.context_type === t.key).length;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTopicFilter(t.key)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? `${t.color} ring-1 ring-current/20`
                          : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      <TopicIcon className="h-3 w-3" />
                      {t.label}
                      {count > 0 && t.key !== "all" && (
                        <span className="text-[9px] opacity-70">{count}</span>
                      )}
                    </button>
                  );
                })}
                {!isFullscreen && (
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
                    title="Fuldskærm"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Pinned messages – compact bar */}
              {pinnedMessages.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-1.5 border-b border-primary/10 bg-primary/5">
                  <Pin className="h-3 w-3 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0 overflow-x-auto flex items-center gap-1.5" style={{ scrollbarWidth: "none" }}>
                    {pinnedMessages.map(pm => (
                      <button
                        key={pm.id}
                        onClick={() => scrollToMessage(pm.id)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-primary/10 transition-colors group flex-shrink-0 max-w-[200px]"
                      >
                        <span className="text-[10px] text-foreground truncate">{pm.content}</span>
                        <span
                          onClick={(e) => { e.stopPropagation(); togglePin(pm); }}
                          className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                          title="Fjern pin"
                        >
                          ×
                        </span>
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{pinnedMessages.length} pinned</span>
                </div>
              )}

              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                {filteredMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {topicFilter !== "all" ? "Ingen beskeder med dette emne" : "Ingen beskeder endnu"}
                    </p>
                    {topicFilter !== "all" && (
                      <button
                        onClick={() => setTopicFilter("all")}
                        className="text-xs text-primary hover:underline mt-2"
                      >
                        Vis alle beskeder
                      </button>
                    )}
                  </div>
                )}
                {filteredMessages.map((msg) => {
                  const isMine = msg.sender_id === user?.id;
                  const isSystem = msg.message_type === "system" || msg.message_type === "ai";
                  const contextType = msg.context_type;
                  const contextMeta = msg.context_meta;
                  const topicInfo = contextType ? TOPIC_COLORS[contextType] : null;

                  if (isSystem) {
                    return (
                      <div
                        key={msg.id}
                        ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
                        className="flex justify-center group/msg transition-all duration-300"
                      >
                        <div
                          className={`max-w-[85%] rounded-xl border border-border/50 bg-muted/30 px-5 py-4 relative ${msg.pinned_at ? "ring-1 ring-primary/20" : ""}`}
                        >
                          <button
                            onClick={() => togglePin(msg)}
                            className={`absolute top-2 right-2 p-1 rounded-md transition-all ${
                              msg.pinned_at
                                ? "text-primary opacity-100 hover:text-destructive"
                                : "text-muted-foreground opacity-0 group-hover/msg:opacity-100 hover:text-primary hover:bg-primary/10"
                            }`}
                            title={msg.pinned_at ? "Fjern pin" : "Pin besked"}
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                              {msg.message_type === "ai" ? "AI Analyse" : "System"}
                            </span>
                            {topicInfo && (
                              <span className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${topicInfo.bg} ${topicInfo.text}`}>
                                <topicInfo.icon className="h-2.5 w-2.5" />
                                {topicInfo.label}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(msg.created_at), "d. MMM HH:mm", { locale: da })}
                            </span>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          {contextType && contextMeta?.title && (
                            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md bg-secondary text-muted-foreground">
                              {contextType === "report" && <FileText className="h-3 w-3" />}
                              {contextType === "milestone" && <Target className="h-3 w-3" />}
                              {String(contextMeta.title)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
                      className={`flex group/msg ${isMine ? "justify-end" : "justify-start"} transition-all duration-300`}
                    >
                      <div
                        className={`max-w-[70%] relative ${msg.pinned_at ? "ring-1 ring-primary/20 rounded-2xl" : ""}`}
                      >
                        <button
                          onClick={() => togglePin(msg)}
                          className={`absolute ${isMine ? "-left-8" : "-right-8"} top-1/2 -translate-y-1/2 p-1 rounded-md transition-all z-10 ${
                            msg.pinned_at
                              ? "text-primary opacity-100 hover:text-destructive"
                              : "text-muted-foreground opacity-0 group-hover/msg:opacity-100 hover:text-primary hover:bg-primary/10"
                          }`}
                          title={msg.pinned_at ? "Fjern pin" : "Pin besked"}
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>
                        {/* Topic tag above message */}
                        {topicInfo && (
                          <div className={`mb-1 inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full ${topicInfo.bg} ${topicInfo.text} ${isMine ? "ml-auto" : ""}`}>
                            <topicInfo.icon className="h-2.5 w-2.5" />
                            {topicInfo.label}
                          </div>
                        )}
                        {contextType && contextMeta?.title && (
                          <div className={`mb-1 inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-t-lg ${
                            isMine ? "bg-primary/20 text-primary ml-auto" : "bg-secondary text-muted-foreground"
                          }`}>
                            {contextType === "report" && <FileText className="h-3 w-3" />}
                            {contextType === "milestone" && <Target className="h-3 w-3" />}
                            Re: {String(contextMeta.title)}
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2.5 ${
                            isMine
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-secondary text-foreground rounded-bl-md"
                          } ${contextType ? "rounded-tl-md" : ""}`}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : ""}`}>
                            <span className={`text-[10px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                              {format(new Date(msg.created_at), "HH:mm", { locale: da })}
                            </span>
                            {isMine && msg.read_at && (
                              <CheckCheck className="h-3 w-3 text-primary-foreground/60" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input with topic selector */}
              <form onSubmit={handleSend} className="p-4 border-t border-border">
                {/* Topic selector row */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-muted-foreground mr-1">Emne:</span>
                  {MESSAGE_TOPICS.map(t => {
                    const isActive = selectedTopic === t.key;
                    const topicInfo = t.key ? TOPIC_COLORS[t.key] : null;
                    return (
                      <button
                        key={t.key ?? "general"}
                        type="button"
                        onClick={() => setSelectedTopic(t.key)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                          isActive
                            ? topicInfo
                              ? `${topicInfo.bg} ${topicInfo.text} ring-1 ring-current/20`
                              : "bg-muted text-foreground ring-1 ring-border"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                      maxLength={MAX_MESSAGE_LENGTH}
                      placeholder={selectedTopic ? `Skriv om ${MESSAGE_TOPICS.find(t => t.key === selectedTopic)?.label?.toLowerCase()}...` : "Skriv en besked..."}
                      className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      disabled={sending}
                    />
                    {newMessage.length > MAX_MESSAGE_LENGTH * 0.9 && (
                      <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] ${newMessage.length >= MAX_MESSAGE_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                        {newMessage.length}/{MAX_MESSAGE_LENGTH}
                      </span>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={sending || !newMessage.trim()}
                    className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <MessageCircle className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Vælg en samtale for at starte</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Chat;
