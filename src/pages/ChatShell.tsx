import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import CompanyChatPane from "@/components/CompanyChatPane";
import GroupChatInline from "@/components/GroupChatInline";

/**
 * Unified /chat route orchestrator.
 * Renders the correct chat experience based on user type:
 * - Advisor → flat inbox (company + group threads in one list)
 * - Group member → group chat inline
 * - Single-company member → company chat
 */
const ChatShell = () => {
  const { isAdvisor, isGroupUser, loading } = useAuth();

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

  // Single-company member: existing company chat
  return (
    <AppLayout fullscreen>
      <CompanyChatPane />
    </AppLayout>
  );
};

export default ChatShell;
