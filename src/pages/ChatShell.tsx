import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import CompanyChatPane from "@/components/CompanyChatPane";
import GroupChatInline from "@/components/GroupChatInline";
import FinancialAIChat from "@/components/FinancialAIChat";

/**
 * Unified /chat route orchestrator.
 * Renders the correct chat experience based on user type:
 * - Advisor → flat inbox (company + group threads in one list)
 * - Group member → group chat inline
 * - Single-company member → company chat with AI tab
 */
const ChatShell = () => {
  const { isAdvisor, isGroupUser, loading } = useAuth();
  const [chatTab, setChatTab] = useState<"advisor" | "ai">("advisor");

  if (loading) {
    return (
      <AppLayout fullscreen>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </AppLayout>
    );
  }

  // Advisor: flat inbox with both company + group threads
  if (isAdvisor) {
    return (
      <AppLayout fullscreen>
        <CompanyChatPane />
      </AppLayout>
    );
  }

  // Group member: group chat inline
  if (isGroupUser) {
    return (
      <AppLayout fullscreen>
        <GroupChatInline />
      </AppLayout>
    );
  }

  // Single-company member: company chat with AI tab
  return (
    <AppLayout fullscreen>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex items-center gap-1 px-4 pt-2 bg-card border-b border-border shrink-0 relative z-20">
          {(["advisor", "ai"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setChatTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                chatTab === tab
                  ? "bg-background text-foreground border border-b-0 border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "advisor" ? "Advisor" : "Finansiel AI"}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {chatTab === "advisor" ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <CompanyChatPane />
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <FinancialAIChat />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default ChatShell;
