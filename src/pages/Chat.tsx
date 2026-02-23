import { useState, useEffect, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Send, MessageCircle, Circle, CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

interface ConversationWithProfile {
  id: string;
  member_id: string;
  last_message_at: string;
  profile: { full_name: string; company_name: string; avatar_url: string } | null;
  unreadCount: number;
  lastMessage?: string;
}

const Chat = () => {
  const { user, isAdvisor } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithProfile[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations
  useEffect(() => {
    if (!user) return;

    const loadConversations = async () => {
      const { data: convs } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false });

      if (!convs) return;

      // Load profiles for each conversation
      const memberIds = convs.map((c) => c.member_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, company_name, avatar_url")
        .in("user_id", memberIds);

      // Load last message + unread count per conversation
      const enriched: ConversationWithProfile[] = await Promise.all(
        convs.map(async (c) => {
          const profile = profiles?.find((p) => p.user_id === c.member_id) || null;

          const { data: lastMsg } = await supabase
            .from("messages")
            .select("content")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1);

          // Unread: messages not sent by current user and not read
          const { count } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", c.id)
            .neq("sender_id", user.id)
            .is("read_at", null);

          return {
            id: c.id,
            member_id: c.member_id,
            last_message_at: c.last_message_at || c.created_at,
            profile: profile
              ? { full_name: profile.full_name, company_name: profile.company_name || "", avatar_url: profile.avatar_url || "" }
              : null,
            unreadCount: count || 0,
            lastMessage: lastMsg?.[0]?.content,
          };
        })
      );

      setConversations(enriched);

      // Auto-select for members (they only have one conversation)
      if (!isAdvisor && enriched.length > 0 && !activeConvId) {
        setActiveConvId(enriched[0].id);
      }
    };

    loadConversations();
  }, [user, isAdvisor]);

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

      // Mark messages as read
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

    // Real-time subscription
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
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);

          // Mark as read if not from current user
          if (newMsg.sender_id !== user?.id) {
            supabase
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

  // Scroll to bottom on new messages
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
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

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
        {/* Conversation list (advisors see all, members see their own) */}
        {isAdvisor && (
          <div className="w-80 border-r border-border flex flex-col">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Samtaler</h3>
              <p className="text-[10px] text-muted-foreground">
                {conversations.filter((c) => c.unreadCount > 0).length} ubesvarede
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full text-left p-4 border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                    activeConvId === conv.id ? "bg-secondary" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-primary">
                        {getInitials(conv.profile?.full_name || "??")}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground truncate">
                          {conv.profile?.full_name || "Ukendt"}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="ml-2 h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                      {conv.profile?.company_name && (
                        <p className="text-[10px] text-muted-foreground">{conv.profile.company_name}</p>
                      )}
                      {conv.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {conversations.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">Ingen samtaler endnu</p>
              )}
            </div>
          </div>
        )}

        {/* Message area */}
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
                <div>
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
                  return (
                    <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                          isMine
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-secondary text-foreground rounded-bl-md"
                        }`}
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
