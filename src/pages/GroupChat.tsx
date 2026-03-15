import { Navigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useGroupChat } from "@/hooks/useGroupChat";
import GroupChatMessageList from "@/components/GroupChatMessageList";
import ChatRichInput from "@/components/ChatRichInput";
import { Loader2, MessageCircle, AlertTriangle } from "lucide-react";
import { Send } from "lucide-react";

const GroupChat = () => {
  const { user, isGroupUser, loading: authLoading, groupName } = useAuth();
  const { messages, profiles, loading, accessDenied, sending, sendMessage } = useGroupChat();

  // Guard: only group members
  if (!authLoading && !isGroupUser) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <MessageCircle className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold text-foreground">
              {groupName ? `${groupName} — Chat` : "Koncern-chat"}
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
            <p className="text-sm">Ingen adgang til koncern-chat.</p>
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

export default GroupChat;
