import { useAuth } from "@/hooks/useAuth";
import { useGroupChat } from "@/hooks/useGroupChat";
import GroupChatMessageList from "@/components/GroupChatMessageList";
import ChatRichInput from "@/components/ChatRichInput";
import { Loader2, MessageCircle, AlertTriangle, Send } from "lucide-react";

/**
 * Group chat body for members, rendered inline inside ChatShell (no AppLayout).
 * Extracted from GroupChat.tsx minus the AppLayout wrapper.
 */
const GroupChatInline = () => {
  const { user, loading: authLoading, groupName } = useAuth();
  const { messages, profiles, loading, accessDenied, sending, sendMessage } = useGroupChat();

  return (
    <div className="flex flex-col h-full">
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
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GroupChatInline;
