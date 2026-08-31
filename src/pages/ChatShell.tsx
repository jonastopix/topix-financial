import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useIsMobile } from "@/hooks/use-mobile";
import CompanyChatPane from "@/components/CompanyChatPane";
import MemberChatPane from "@/components/MemberChatPane";
import FinancialAIChat from "@/components/FinancialAIChat";
import { MessageCircle, Sparkles } from "lucide-react";

/**
 * Unified /chat route orchestrator.
 * Renders the correct chat experience based on user type:
 * - Advisor → flat inbox (CompanyChatPane)
 * - Single-company member → member chat with AI tab (MemberChatPane)
 */
const ChatShell = () => {
  const { isAdvisor: rawAdvisor, loading, membershipTier } = useAuth();
  const { viewingAsMember } = useViewMode();
  // C1-splittet: rolle-dommen er den viewMode-JUSTEREDE — samme dom som
  // CompanyChatPane selv regnede før splittet. En rådgiver i "Se som
  // medlem" skal mounte MEDLEMS-komponenten; med rå isAdvisor ville de
  // aldrig se den. Bemærk: dommen gælder nu OGSÅ abonnent-muren nedenfor
  // (før: rå isAdvisor) — se PR-rapporten for hvad det betyder.
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [chatTab, setChatTab] = useState<"advisor" | "ai">(
    searchParams.get("tab") === "ai" ? "ai" : "advisor"
  );

  if (!isAdvisor && membershipTier === "subscriber") {
    // Abonnent-muren er medlemsvendt og bor derfor i Hb-skallen (C4
    // trin 1) — indholdet står ORDRET som før; konverteringen af selve
    // murens udtryk er ikke denne PR.
    return (
      <HbMemberShell active="chat">
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
      </HbMemberShell>
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

  // Advisor: flat inbox
  if (isAdvisor) {
    return (
      <AppLayout fullscreen>
        <CompanyChatPane />
      </AppLayout>
    );
  }

  // Single-company member: company chat with AI tab.
  // C4 trin 1: chatten bor i Hb-skallens fuld-variant (layout="fuld" —
  // AppLayout fullscreen-præcedensen). Indholdet herunder er UÆNDRET:
  // faner, paner og deres gamle udtryk konverteres i næste PR og ser
  // bevidst skæve ud på papiret indtil da.
  return (
    <HbMemberShell active="chat" layout="fuld">
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* C4: fanerne i Hb-udtryk — understregnings-faner på papiret,
            aktiv markering i evergreen. "Advisor" → "Rådgiver" på BEGGE
            breakpoints (desktop-labelen var engelsk). */}
        <div className={`flex items-center gap-5 border-b border-hb-line shrink-0 relative z-20 ${isMobile ? "px-3" : "px-4 md:px-6"}`}>
          {(["advisor", "ai"] as const).map(tab => {
            const Icon = tab === "advisor" ? MessageCircle : Sparkles;
            const active = chatTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setChatTab(tab)}
                className={`flex items-center gap-1.5 ${isMobile ? "pb-2 pt-2.5 text-xs" : "pb-2.5 pt-3 text-sm"} font-medium -mb-px border-b-2 transition-colors ${
                  active
                    ? "border-hb-evergreen text-hb-ink"
                    : "border-transparent text-hb-ink-soft hover:text-hb-ink"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab === "advisor" ? "Rådgiver" : isMobile ? "AI" : "Finansiel AI"}
              </button>
            );
          })}
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {chatTab === "advisor" ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <MemberChatPane />
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <FinancialAIChat initialMessage={searchParams.get("q") || undefined} />
            </div>
          )}
        </div>
      </div>
    </HbMemberShell>
  );
};

export default ChatShell;
