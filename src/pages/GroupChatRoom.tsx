import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useGroupChat } from "@/hooks/useGroupChat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import GroupChatMessageList from "@/components/GroupChatMessageList";
import ChatRichInput from "@/components/ChatRichInput";
import { Loader2, MessageCircle, AlertTriangle, ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

const GroupChatRoom = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user, isAdvisor, loading: authLoading } = useAuth();
  const hasShownToast = useRef(false);

  const { messages, profiles, loading, accessDenied, sending, sendMessage, conversationId } = useGroupChat({
    groupId: groupId || null,
  });

  // Fetch group name for header
  const { data: groupInfo } = useQuery({
    queryKey: ["group-info", groupId],
    queryFn: async () => {
      const { data } = await supabase
        .from("groups" as any)
        .select("name")
        .eq("id", groupId!)
        .maybeSingle();
      return data as any;
    },
    enabled: !!groupId && !!user && isAdvisor,
    staleTime: 60_000,
  });

  // Explicit page-level access guard: redirect if no access
  useEffect(() => {
    if (!loading && accessDenied && !hasShownToast.current) {
      hasShownToast.current = true;
      toast.error("Ingen adgang til denne koncern");
      navigate("/group-chats", { replace: true });
    }
  }, [loading, accessDenied, navigate]);

  // Guard: advisor-only route (after all hooks)
  if (!authLoading && (!user || !isAdvisor)) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Ingen adgang.
        </div>
      </AppLayout>
    );
  }

  if (!groupId) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Ingen koncern valgt.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <button
            onClick={() => navigate("/group-chats")}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <MessageCircle className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold text-foreground">
              {groupInfo?.name ? `${groupInfo.name} — Chat` : "Koncern-chat"}
            </h1>
            <p className="text-xs text-muted-foreground">Delt chat for hele koncernen</p>
          </div>
        </div>

        {/* Content */}
        {loading || authLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : accessDenied ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm">Ingen adgang til denne koncern.</p>
          </div>
        ) : (
          <>
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <MessageCircle className="h-10 w-10 opacity-30" />
                <p className="text-sm">Ingen beskeder endnu. Start samtalen!</p>
              </div>
            ) : (
              <GroupChatMessageList
                messages={messages}
                profiles={profiles}
                currentUserId={user?.id || ""}
                conversationId={conversationId || undefined}
                isAdvisor={isAdvisor}
                onMessageDeleted={(id) => {
                  // Remove from local state; realtime will also handle
                }}
                onMessageEdited={(id, content, editedAt) => {
                  // Local update; realtime will also handle
                }}
              />
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t border-border shrink-0">
              <div className="flex items-end gap-2">
                <ChatRichInput
                  onSubmit={sendMessage}
                  disabled={sending}
                  placeholder="Skriv en besked til koncernen..."
                  maxLength={5000}
                />
                <button
                  onClick={() => {}}
                  className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shrink-0 opacity-50 pointer-events-none"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default GroupChatRoom;
