import { useState, useEffect, useRef, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageCircle, CheckCheck, FileText, Sparkles, Target,
  Search, Inbox, Clock, AlertCircle, Filter,
} from "lucide-react";
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

const FILTER_CONFIG: { key: InboxFilter; label: string; icon: typeof Inbox }[] = [
  { key: "alle", label: "Alle", icon: Inbox },
  { key: "ubesvaret", label: "Ubesvaret", icon: AlertCircle },
  { key: "rapporter", label: "Ny rapport", icon: FileText },
  { key: "besvaret", label: "Besvaret", icon: CheckCheck },
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          .select("id, conversation_id, sender_id, content, read_at, created_at, message_type, context_type")
          .order("created_at", { ascending: false }),
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConvId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConvId || !user) return;

    setSending(true);
    const { error } = await supabase.from("messages").insert({
      conversation_id: activeConvId,
      sender_id: user.id,
      content: newMessage.trim(),
    });

    if (!error) {
      setNewMessage("");
    }
    setSending(false);
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const relativeTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: da });
    } catch {
      return "";
    }
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-primary" />
          {isAdvisor ? "Indbakke" : "Chat med rådgivere"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdvisor ? "Alle medlemssamtaler samlet ét sted" : "Skriv direkte til Morten og Jonas"}
        </p>
      </div>

      <div className="glass-card rounded-xl overflow-hidden flex" style={{ height: "calc(100vh - 200px)" }}>
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
                              {getInitials(conv.profile?.full_name || "??")}
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
              {/* Header */}
              <div className="p-4 border-b border-border flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary">
                    {getInitials(
                      isAdvisor
                        ? activeConv?.profile?.full_name || "??"
                        : "MJ"
                    )}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {isAdvisor
                      ? activeConv?.profile?.full_name || "Ukendt"
                      : "Morten & Jonas"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {isAdvisor
                      ? activeConv?.profile?.company_name || ""
                      : "Dine rådgivere"}
                  </p>
                </div>
                {isAdvisor && activeConv?.hasRecentReport && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                    <FileText className="h-3 w-3" />
                    Ny rapport indsendt
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Ingen beskeder endnu</p>
                    <p className="text-xs text-muted-foreground mt-1">Skriv den første besked nedenfor</p>
                  </div>
                )}
                {messages.map((msg) => {
                  const isMine = msg.sender_id === user?.id;
                  const isSystem = msg.message_type === "system" || msg.message_type === "ai";
                  const contextType = msg.context_type;
                  const contextMeta = msg.context_meta;

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <div className="max-w-[85%] rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                              {msg.message_type === "ai" ? "AI Analyse" : "System"}
                            </span>
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
                    <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[75%]">
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

              {/* Input */}
              <form onSubmit={handleSend} className="p-4 border-t border-border flex gap-2">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Skriv en besked..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
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
