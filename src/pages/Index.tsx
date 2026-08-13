import { useState, useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import "@/styles/hjemmebane.css";
import AppLayout from "@/components/AppLayout";
import AdvisorDashboard from "@/components/AdvisorDashboard";
import MembershipExpiredGate from "@/components/MembershipExpiredGate";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { BoardroomView } from "@/components/hjemmebane/boardroom/BoardroomView";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";

/** FORSIDE-GO (2026-08-12): "/" bærer nu Hb-forsiden "Dit Boardroom"
    (swap-PR'en bogført i BACKLOG.md "[P1] Forside-GO = swap-PR").
    Medlemsgrenen renderer BoardroomView i HbMemberShell; det gamle
    dashboard er fjernet. Rådgiver-grenen (AdvisorDashboard) er bevaret
    ordret — den har sin egen konvertering. Legat dækkes af MemberRoute
    (App.tsx), som redirecter til /legat før denne side renderes. */

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
}

const Dashboard = () => {
  const { user, profile, companyId, isAdvisor: rawAdvisor, refreshProfile, membershipTier } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [searchParams, setSearchParams] = useSearchParams();
  const subscriptionResult = searchParams.get("subscription");

  /* Arves 1:1 ved GO (BACKLOG.md:495-497): Stripe sender medlemmet
     tilbage til "/" med ?subscription=… — toasten kører som effekt og
     skal fortsat køre, uanset hvad siden renderer. */
  useEffect(() => {
    if (subscriptionResult === "success") {
      setSearchParams({}, { replace: true });
      toast.success("Abonnement aktiveret 🎉", {
        description: "Opdaterer din adgang…",
      });
      setTimeout(() => window.location.reload(), 1500);
    } else if (subscriptionResult === "cancelled") {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionResult]);

  /* Den stille tour-markering arves 1:1 (BACKLOG.md:495-497):
     tour-BANNERET er væk med det gamle dashboard, men engangs-stemplet
     af profiles.tour_completed_at skal fortsat sættes ved første besøg,
     så intet andet flow venter forgæves på det. */
  const shouldShowTour = !rawAdvisor && profile && !profile.tour_completed_at;
  const [tourTriggered, setTourTriggered] = useState(false);
  useEffect(() => {
    if (shouldShowTour && !tourTriggered) {
      setTourTriggered(true);
      supabase.from("profiles").update({ tour_completed_at: new Date().toISOString() } as any).eq("user_id", user!.id).then(() => refreshProfile());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShowTour, tourTriggered]);

  const firstName = profile?.full_name?.split(" ")[0] || "dig";

  /* Spinner mens auth-tieren afgøres — uden dette ville et udløbet
     medlem nå at se forsiden, før gaten nedenfor kan gribe ind. */
  if (!rawAdvisor && membershipTier === null) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  /* Bevidst bro (BACKLOG.md:495-497): gaten er gammelt udtryk, men et
     udløbet medlem må ALDRIG lande på forsiden i stedet — den skal stå
     FØR den nye forside. */
  if (!rawAdvisor && membershipTier === "expired") {
    return <MembershipExpiredGate />;
  }

  /* Abonnenten (exit-produktet) beholder KUN Dine tal og Podcast & Talks.
     Alt andet er lukket i datalaget siden 13-08-2026 (PR #350, #351, #354).
     Landingen manglede: en abonnent faldt gennem fallthrough til Dit
     Boardroom og så hele nav'en, hvor seks af otte punkter er lukkede.
     Podcast & Talks findes endnu ikke som rute — noteret i BACKLOG.

     Abonnenten har ikke Dit Boardroom. "/" spærres bevidst IKKE — den er
     husets universelle fallback (logo-hjemlink, expired-redirect,
     rolleafvisninger, onboarding-resume, PulseCheckin, Auth) — så roden
     skal kunne modtage en abonnent og selv sende dem videre. Landingen er
     /kpis: produktet er "behold dine tal", og der findes ingen
     Dine tal-oversigtsside at lande på. */
  if (!rawAdvisor && membershipTier === "subscriber") {
    return <Navigate to="/kpis" replace />;
  }

  if (isAdvisor && !companyId) {
    return (
      <AppLayout>
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
        </div>
        <AdvisorDashboard />
      </AppLayout>
    );
  }

  return (
    <HbMemberShell active="boardroom">
      <BoardroomView />
    </HbMemberShell>
  );
};

export default Dashboard;
