import { useState, useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import "@/styles/hjemmebane.css";
import MembershipExpiredGate from "@/components/MembershipExpiredGate";
import CompanyLinkFailedGate from "@/components/CompanyLinkFailedGate";
import FornyelseKvittering from "@/components/FornyelseKvittering";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { BoardroomView } from "@/components/hjemmebane/boardroom/BoardroomView";
import { RaadgiverForsideView } from "@/components/hjemmebane/forside/RaadgiverForsideView";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";

/** FORSIDE-GO (2026-08-12): "/" bærer nu Hb-forsiden "Dit Boardroom"
    (swap-PR'en bogført i BACKLOG.md "[P1] Forside-GO = swap-PR").
    Medlemsgrenen renderer BoardroomView i HbMemberShell; det gamle
    dashboard er fjernet. Legat dækkes af MemberRoute (App.tsx), som
    redirecter til /legat før denne side renderes.

    RÅDGIVER-SWAPPET (4/9): rådgiver-grenen renderer nu RaadgiverForsideView
    i HbMemberShell — forsiden på dommen (docs/forsiden-design.md, bevist på
    skærm 4/9 kl. 13:04: syv linjer mod køernes 38; køerne fjernet #638,
    «derfor er du her» #641). AdvisorDashboard (AppLayout) er ikke længere
    nogens landingsside; dens hentAdvisorDashboard er stadig forsidens
    datalag. /forside viderestiller hertil (Forside.tsx). Hilsenen bor i
    RaadgiverForsideView, så getGreeting er væk herfra. */

/* ── Fornyelses-låsen ────────────────────────────────────────────────────
   HVORFOR DEN FINDES: opret-fornyelse-checkout sender medlemmet tilbage til
   /?fornyelse=success i samme øjeblik Stripe har gennemført betalingen —
   mens stripe-webhook, der forlænger contract_end_date, fyrer selvstændigt.
   Er webhooken ikke landet endnu, er tier stadig "expired" og beslutningen
   stadig "tilbyd": uden låsen ser medlemmet MembershipExpiredGate IGEN med
   tilbuddet, som om de ikke havde betalt. Et tryk mere giver en ny
   checkout-session, og webhookens idempotens (på session.id) forhindrer
   ikke at der bliver betalt to gange.

   Låsen er et tidsstempel i localStorage — ikke React-state alene, fordi
   mekanikken er genindlæsning (samme som subscription=success): tier hentes
   kun af useAuth ved session-start, og useAuth røres ikke. localStorage
   frem for sessionStorage, så en ny fane i samme browser heller ikke kan
   nå gaten. Så længe stemplet står, og tier er "expired" (eller uafgjort),
   vises kvitteringen i stedet for gaten, og siden genindlæser sig selv med
   FORNYELSE_RETRY_MS mellemrum. Stemplet ryddes i det øjeblik tier ikke
   længere er "expired". Efter FORNYELSE_GRAENSE_MS uden ændring stopper
   genindlæsningerne, og kvitteringen skifter til "adgangen åbner snarest"
   med Prøv igen og Skriv til os — aldrig en uendelig venten. Stemplet
   udløber af sig selv efter FORNYELSE_TTL_MS, så en webhook der aldrig
   lander, ikke låser gaten for evigt. */
const FORNYELSE_STEMPEL_KEY = "tbr.fornyelse_betalt_at";
const FORNYELSE_RETRY_MS = 3_000;
const FORNYELSE_GRAENSE_MS = 30_000;
const FORNYELSE_TTL_MS = 24 * 60 * 60 * 1000;

function laesFornyelseStempel(): number | null {
  try {
    const raa = localStorage.getItem(FORNYELSE_STEMPEL_KEY);
    const stempel = raa ? Number(raa) : NaN;
    if (!Number.isFinite(stempel)) return null;
    if (Date.now() - stempel > FORNYELSE_TTL_MS) {
      localStorage.removeItem(FORNYELSE_STEMPEL_KEY);
      return null;
    }
    return stempel;
  } catch {
    return null;
  }
}

function skrivFornyelseStempel(stempel: number | null) {
  try {
    if (stempel === null) localStorage.removeItem(FORNYELSE_STEMPEL_KEY);
    else localStorage.setItem(FORNYELSE_STEMPEL_KEY, String(stempel));
  } catch {
    // privat tilstand o.l. — låsen lever så kun i React-state for denne visning
  }
}

const Dashboard = () => {
  const { user, profile, companyId, isAdvisor: rawAdvisor, refreshProfile, membershipTier, companyResolution } = useAuth();
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

  /* ?fornyelse=… — samme sted og samme mønster som ?subscription ovenfor:
     ryd parameteren, vis en toast, genindlæs. Forskellen er låsen (se
     kommentaren ved FORNYELSE_STEMPEL_KEY): genindlæsningen styres af
     stemplet og gentages, indtil tier ikke længere er "expired". */
  const fornyelseResult = searchParams.get("fornyelse");
  const [fornyelseStempel, setFornyelseStempel] = useState<number | null>(() => laesFornyelseStempel());
  useEffect(() => {
    if (fornyelseResult === "success") {
      setSearchParams({}, { replace: true });
      const nu = Date.now();
      skrivFornyelseStempel(nu);
      setFornyelseStempel(nu);
      toast.success("Tak — vi glæder os til et år mere", {
        description: "Vi åbner din adgang om et øjeblik…",
      });
    } else if (fornyelseResult === "cancelled") {
      // En der fortrød, skal ikke mødes med noget.
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fornyelseResult]);

  /* Låsen slippes i det øjeblik tier ikke længere er "expired" — så er
     webhooken landet, og forsiden nedenfor kan vises. null = uafgjort,
     der ventes videre. */
  useEffect(() => {
    if (fornyelseStempel === null || membershipTier === null) return;
    if (membershipTier !== "expired") {
      skrivFornyelseStempel(null);
      setFornyelseStempel(null);
    }
  }, [fornyelseStempel, membershipTier]);

  /* Genindlæs med få sekunders mellemrum, så useAuth henter den nye
     contract_end_date — kun inden for grænsen; derefter står kvitteringen
     stille med Prøv igen. */
  useEffect(() => {
    if (fornyelseStempel === null || membershipTier !== "expired") return;
    if (Date.now() - fornyelseStempel > FORNYELSE_GRAENSE_MS) return;
    const t = setTimeout(() => window.location.reload(), FORNYELSE_RETRY_MS);
    return () => clearTimeout(t);
  }, [fornyelseStempel, membershipTier]);

  /* Grænsen som STATE med sin egen timer — ikke en beregning ved render.
     Uden den kan spinneren blive stående for evigt: efter grænsen stopper
     genindlæsningerne ovenfor, og dermed også rerender. Rammer den sidste
     genindlæsning kort før grænsen, ville "Date.now() ved render" aldrig
     blive regnet igen, og fladen ville aldrig skifte til "Adgangen åbner
     snarest" med Prøv igen — præcis den uendelige venten uden udgang,
     låsen skulle forhindre. Timeren fyrer når grænsen nås (minimum 0 ms,
     så et allerede overskredet stempel skifter med det samme) og ryddes i
     cleanup. */
  const [fornyelseOverskredet, setFornyelseOverskredet] = useState(false);
  useEffect(() => {
    if (fornyelseStempel === null) {
      setFornyelseOverskredet(false);
      return;
    }
    const rest = Math.max(0, FORNYELSE_GRAENSE_MS - (Date.now() - fornyelseStempel));
    const t = setTimeout(() => setFornyelseOverskredet(true), rest);
    return () => clearTimeout(t);
  }, [fornyelseStempel]);

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

  /* Koblingen konto → virksomhed GIK GALT (process-pending-invitation
     svarede med fejl). Står FØR fornyelses-kvitteringen, så en fejlet
     kobling vinder over stemplet. De øvrige tier-null-tilfælde fanges i
     grenen efter kvitteringen (trin 10, docs/indgangen-overhaling.md
     §7.1); de to grene kan ikke blive én uden at flytte kvitteringens
     forrang, som er fornyelses-låsens kontrakt. */
  if (!rawAdvisor && companyResolution === "failed") {
    return <CompanyLinkFailedGate />;
  }

  /* Lige betalt for et år mere (låsen står), og tier er stadig "expired"
     eller uafgjort: kvitteringen i stedet for gaten. Skal stå FØR både
     skelettet og gaten — gaten er præcis det, der ikke må vises nu. */
  if (!rawAdvisor && fornyelseStempel !== null && (membershipTier === null || membershipTier === "expired")) {
    return <FornyelseKvittering overskredet={fornyelseOverskredet} />;
  }

  /* Blindgyden lukket (trin 10, docs/indgangen-overhaling.md §7.1). Her
     stod DashboardSkeleton i AppLayout — mørkegrønt, uden grænse, uden
     besked, uden knap. (Komponenten er fjernet 3/9 som død kode — filen
     findes ikke længere.) Efter #554 er tier null for en ikke-rådgiver
     ALDRIG en ventetilstand: hænger et opslag ved login, holder `loading`
     porten, og MemberRoute viser HbSpinner — denne side tegnes ikke. Når
     siden tegnes med tier null, er opslaget afgjort og svaret var
     «ingen virksomhed» (companyResolution "none") eller fetchUserData
     kastede ("pending" med loading falsk). Begge er fejl for et medlem:
     der er intet at vente på, så ingen timeout — gaten med det samme,
     med Prøv igen og Skriv til os. (Den tredje vej, PPI-succes uden
     tier, er lukket i useAuth, som nu sætter tier i den gren.) Grenen
     står EFTER fornyelses-kvitteringen, som beholder sin forrang. */
  if (!rawAdvisor && membershipTier === null) {
    return <CompanyLinkFailedGate />;
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

  /* Rådgiveren uden valgt virksomhed lander på SIN forside — dommen i
     Hjemmebane (swappet 4/9). Med et valgt medlem (companyId sat via
     «Visning som») falder rådgiveren igennem til medlemmets Boardroom
     nedenfor, som før. active="boardroom": det ER Dit Boardroom, for
     rådgiveren, og menuens punkt peger på "/" (HbMemberShell boardroomTo). */
  if (isAdvisor && !companyId) {
    return (
      <HbMemberShell active="boardroom">
        <RaadgiverForsideView />
      </HbMemberShell>
    );
  }

  return (
    <HbMemberShell active="boardroom">
      <BoardroomView />
    </HbMemberShell>
  );
};

export default Dashboard;
