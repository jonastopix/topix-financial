import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useGroupChat } from "@/hooks/useGroupChat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import GroupChatMessageList from "@/components/GroupChatMessageList";
import ChatRichInput from "@/components/ChatRichInput";
import { Loader2, MessageCircle, AlertTriangle, ArrowLeft, Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Advisor group chat pane: list of groups + active group room.
 * Rendered inside the "Koncerner" tab of AdvisorChatShell.
 */
const AdvisorGroupChatPane = () => {
  const { user, isAdvisor, loading: authLoading } = useAuth();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Fetch groups this advisor has access to
  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ["advisor-group-chat-list"],
    queryFn: async () => {
      const { data: accessRows, error: accessErr } = await supabase
        .from("group_advisor_access" as any)
        .select("group_id")
        .eq("advisor_user_id", user!.id);

      if (accessErr || !accessRows || accessRows.length === 0) return [];

      const groupIds = (accessRows as any[]).map(r => r.group_id);

      const { data: groupRows, error: groupErr } = await supabase
        .from("groups" as any)
        .select("id, name")
        .in("id", groupIds)
        .order("name");

      if (groupErr) return [];
      return (groupRows as any[]) || [];
    },
    enabled: !!user && isAdvisor,
    staleTime: 60_000,
  });

  // Group chat hook for the active group
  const { messages, profiles, loading: chatLoading, accessDenied, sending, sendMessage } = useGroupChat({
    groupId: activeGroupId,
  });

  const activeGroup = groups?.find((g: any) => g.id === activeGroupId);

  if (groupsLoading || authLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No active group selected — show list
  if (!activeGroupId) {
    return (
      <div className="p-4 space-y-4">
        {!groups || groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Layers className="h-10 w-10 opacity-30" />
            <p className="text-sm">Du har ikke adgang til nogen koncerner.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g: any) => (
              <Card
                key={g.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setActiveGroupId(g.id)}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{g.name}</p>
                    <p className="text-xs text-muted-foreground">Åbn koncern-chat</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Active group room
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={() => setActiveGroupId(null)}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <MessageCircle className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-base font-semibold text-foreground">
            {activeGroup?.name ? `${activeGroup.name} — Chat` : "Koncern-chat"}
          </h1>
          <p className="text-xs text-muted-foreground">Delt chat for hele koncernen</p>
        </div>
      </div>

      {/* Content */}
      {chatLoading ? (
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

export default AdvisorGroupChatPane;
