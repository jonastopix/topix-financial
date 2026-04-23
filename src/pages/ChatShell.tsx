import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import CompanyChatPane from "@/components/CompanyChatPane";
import GroupChatInline from "@/components/GroupChatInline";
import FinancialAIChat from "@/components/FinancialAIChat";
import { MessageCircle, Sparkles } from "lucide-react";

/**
 * Unified /chat route orchestrator.
 * Renders the correct chat experience based on user type:
 * - Advisor → flat inbox (company + group threads in one list)
 * - Group member → group chat inline
 * - Single-company member → company chat with AI tab
 */
const ChatShell = () => {
  const { isAdvisor, isGroupUser, loading, membershipTier } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [chatTab, setChatTab] = useState<"advisor" | "ai">(
    searchParams.get("tab") === "ai" ? "ai" : "advisor"
  );

  if (!isAdvisor && membershipTier === "subscriber") {
    return (
      <AppLayout>
        <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
          <div className="max-w-lg w-full text-center space-y-8">
            <div className="flex items-center justify-center gap-8">
              <img
                src="/jonas-herlev.png"
                alt="Jonas Herlev"
                className="h-16 w-16 rounded-full object-cover"
              />
              <img
                src="/morten-larsen.jpg"
                alt="Morten Larsen"
                className="h-16 w-16 rounded-full object-cover"
              />
            </div>
            <div className="space-y-3">
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
                Bliv fuldt medlem af The Boardroom
              </h1>
              <p className="text-muted-foreground">
                Personlig sparring med Jonas & Morten er forbeholdt fulde medlemmer.
                Som abonnent har du adgang til alle data-features — men ikke den direkte rådgivning.
              </p>
            </div>
            <a
              href="mailto:jonas@topix.dk?subject=Opgradering%20til%20fuldt%20medlemskab"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Kontakt Jonas om fuldt medlemskab →
            </a>
            <p className="text-xs text-muted-foreground">
              Dit abonnement fortsætter uændret
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

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
              <FinancialAIChat initialMessage={searchParams.get("q") || undefined} />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default ChatShell;
