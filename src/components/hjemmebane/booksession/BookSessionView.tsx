import { useState } from "react";
import { mailtoKontakt } from "@/lib/kontaktadresse";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar, Clock, Video, CheckCircle2, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import {
  afgoerBookSession,
  visMortenKolonne,
} from "@/lib/hjemmebane/bookSessionTilstand";

/** Book session i Hb-udtryk (BookSession-GO 2026-08-13). Logikken er
    flyttet ORDRET fra src/pages/BookSession.tsx: samme tre queries, samme
    handlers (inkl. 403-body-parsningen fra PR #353), samme fire returns.
    Tilstandsmaskinen bor i bookSessionTilstand.ts (PR #356) — kun
    udtrykket er konverteret. Abonnent-returnen SKAL blive liggende under
    alle hooks (React #310, PR #353).

    TRE SPOR, TO KORT (13/9, recon-de-tre-sessioner.md): medlemskabet
    indeholder én session med hver rådgiver. Morten-kortet er som før.
    Jonas-kortet viser den inkluderede session (companies.jonas_session_used_at
    er NULL, eller linket er sendt men tiden ikke valgt) og skifter derefter
    til den købte — samme kort, to ansigter, dømt i afgoerBookSession. Den
    inkluderede vej er create-free-intro-booking med body { advisor }. */

type Raadgiver = "jonas" | "morten";
const NAVN: Record<Raadgiver, string> = { jonas: "Jonas", morten: "Morten" };

const TOPICS = [
  { title: "Procesoptimering", desc: "Find flaskehalsene i din forretning og fjern dem" },
  { title: "Automatisering", desc: "Hvilke opgaver kan du automatisere, og hvad skal du starte med" },
  { title: "Fokus & prioritering", desc: "Få hjælp til at skære fra og fokusere energien der hvor det rykker mest" },
  { title: "Fra tal til beslutning", desc: "Forstå hvad dine nøgletal faktisk fortæller dig, og hvad du skal gøre ved det" },
];

/** Avatar med React-renderet fallback: initialer i en cirkel når billedet
    fejler — samme visuelle resultat som den gamle innerHTML-injektion i
    BookSession.tsx:288-294/413-419, uden DOM-manipulation. */
const AdvisorAvatar = ({ src, alt, initials }: { src: string; alt: string; initials: string }) => {
  const [imgFejl, setImgFejl] = useState(false);
  return (
    <div className="h-16 w-16 rounded-full overflow-hidden shrink-0">
      {imgFejl ? (
        <div className="h-full w-full bg-hb-evergreen/10 flex items-center justify-center">
          <span className="text-xl font-bold text-hb-evergreen">{initials}</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setImgFejl(true)}
        />
      )}
    </div>
  );
};

/** Fakta-tiles — ens form i alle kort, kun varigheden skifter. */
const FaktaTiles = ({ minutter, undertekst }: { minutter: number; undertekst: string }) => (
  <div className="grid grid-cols-3 gap-4">
    <div className="text-center p-4 rounded-hb bg-hb-paper">
      <Clock className="h-5 w-5 mx-auto mb-2 text-hb-evergreen" />
      <p className="text-sm font-medium text-hb-ink">{minutter} minutter</p>
      <p className="text-xs text-hb-ink-soft">{undertekst}</p>
    </div>
    <div className="text-center p-4 rounded-hb bg-hb-paper">
      <Video className="h-5 w-5 mx-auto mb-2 text-hb-evergreen" />
      <p className="text-sm font-medium text-hb-ink">Online</p>
      <p className="text-xs text-hb-ink-soft">Google Meet</p>
    </div>
    <div className="text-center p-4 rounded-hb bg-hb-paper">
      <Calendar className="h-5 w-5 mx-auto mb-2 text-hb-evergreen" />
      <p className="text-sm font-medium text-hb-ink">Fleksibelt</p>
      <p className="text-xs text-hb-ink-soft">Vælg selv tid</p>
    </div>
  </div>
);

/** "link-ready": retten er brugt, booking_sent -> vis det personlige link igen. */
const LinkKlar = ({ navn, url }: { navn: string; url: string }) => (
  <div className="space-y-4">
    <p className="text-sm text-hb-ink-soft">
      Din session med {navn} er klar. Åbn dit personlige link og vælg en tid der passer dig.
    </p>
    <p className="text-xs text-hb-ink-soft">
      Linket er personligt og kan kun bruges én gang.
    </p>
    <a href={url} target="_blank" rel="noopener noreferrer">
      <HbButton className="w-full">
        <Calendar className="h-4 w-4" />
        Åbn dit booking-link
      </HbButton>
    </a>
  </div>
);

interface InkluderetRaekke {
  advisor: string;
  status: string;
  calendly_booking_url: string | null;
  created_at: string;
}

export const BookSessionView = () => {
  const { user, isAdvisor, membershipTier, companyId } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [loadingFree, setLoadingFree] = useState<Raadgiver | null>(null);
  const [freeUrl, setFreeUrl] = useState<{ url: string; advisor: Raadgiver } | null>(null);
  const success = searchParams.get("success") === "true";
  const sessionId = searchParams.get("session_id");

  const { data: booking } = useQuery({
    queryKey: ["session-booking", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const { data } = await (supabase as any)
        .from("session_bookings")
        .select("*")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();
      return data;
    },
    enabled: !!sessionId && success,
    refetchInterval: (query) => (!query.state.data?.calendly_booking_url ? 2000 : false),
  });

  // Begge rettigheder + contract_end_date, saa kortenes gating kan matche backend'ens
  // "full" praecist (kontrakt i fremtiden), uafhaengigt af at useAuth remapper no_date
  // til "full". jonas_session_used_at (20260913220000) er endnu ikke i types.ts (Lovable
  // regenererer den) — derfor den utypede klient, som Q1 og Q3 allerede bruger.
  const { data: company } = useQuery({
    queryKey: ["company-intro-session", companyId],
    queryFn: async (): Promise<{
      intro_session_used_at: string | null;
      jonas_session_used_at: string | null;
      contract_end_date: string | null;
    } | null> => {
      if (!companyId) return null;
      const { data } = await (supabase as any)
        .from("companies")
        .select("intro_session_used_at, jonas_session_used_at, contract_end_date")
        .eq("id", companyId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  // Brugerens egne INKLUDEREDE bookinger (amount_dkk = 0, begge raadgivere; RLS: "Users can
  // view own session bookings" -> user_id = auth.uid()). Nyeste raekke pr. raadgiver. Status
  // saettes af create-free-intro-booking (booking_sent) og af calendly-webhook (booked/
  // cancelled). Per-bruger, ikke per-firma. De koebte raekker (amount_dkk > 0) laeses ikke her.
  const { data: inkluderede, isLoading: inkluderedeLoading } = useQuery({
    queryKey: ["my-inkluderede-bookinger", user?.id],
    queryFn: async (): Promise<InkluderetRaekke[]> => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("session_bookings")
        .select("advisor, status, calendly_booking_url, created_at")
        .eq("user_id", user.id)
        .eq("amount_dkk", 0)
        .order("created_at", { ascending: false });
      return (data as InkluderetRaekke[] | null) ?? [];
    },
    enabled: !!user && !isAdvisor && membershipTier === "full",
    // Mens vi venter paa webhooken: poll hvert 10. sekund saa "booked" dukker op live. Stop
    // saa snart ingen raekke laengere er booking_sent.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "booking_sent") ? 10000 : false,
  });

  const mortenBooking = inkluderede?.find((r) => r.advisor === "morten") ?? null;
  const jonasBooking = inkluderede?.find((r) => r.advisor === "jonas") ?? null;

  // Tilstandsmaskinen bor i bookSessionTilstand.ts — begge rettigheder
  // doemmes eet sted, fra samme kilder: useAuth, Q2 og Q3.
  const { morten: mortenState, jonas: jonasKort } = afgoerBookSession({
    isAdvisor,
    membershipTier,
    companyId,
    company: company ?? null,
    inkluderedeLoading,
    mortenBooking,
    jonasBooking,
  });
  const showMortenColumn = visMortenKolonne(mortenState);

  // Denne return laa foer de tre useQuery-kald. Ved foerste render er
  // membershipTier endnu ikke afgjort, saa hooksene koerte; naar auth landede
  // og vaerdien blev "subscriber", blev returnen taget og hooksene sprunget
  // over — React-fejl #310, "rendered fewer hooks than expected". Ingen har
  // set den, fordi der endnu ikke findes en eneste abonnent i produktion
  // (alle fire Stripe-kolonner er NULL for alle virksomheder, maalt
  // 13-08-2026). Returnen skal blive liggende under hooksene.
  if (!isAdvisor && membershipTier === "subscriber") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full text-center space-y-8">
          <div className="flex items-center justify-center gap-8">
            <img
              src="/jonas-herlev.png"
              alt="Jonas Herlev"
              className="h-16 w-16 rounded-full object-cover"
            />
            <div className="h-16 w-16 rounded-full bg-hb-sage/40 text-hb-ink flex items-center justify-center text-base font-semibold">
              MH
            </div>
          </div>
          <div className="space-y-3">
            <h1 className="font-editorial text-2xl md:text-3xl font-medium text-hb-ink">
              Book session er forbeholdt fulde medlemmer
            </h1>
            <p className="text-hb-ink-soft">
              Sessioner med Jonas og Morten er en del af det fulde Boardroom-medlemskab.
              Som abonnent har du adgang til alle data-features — opgrader for at få personlig sparring.
            </p>
          </div>
          <a
            href={mailtoKontakt("Opgradering til fuldt medlemskab")}
            className="inline-flex items-center gap-2 rounded-full bg-hb-evergreen px-6 py-2.5 text-sm font-medium text-white hover:bg-hb-evergreen/90 transition-colors"
          >
            Kontakt os om fuldt medlemskab →
          </a>
          <p className="text-xs text-hb-ink-soft">
            Dit abonnement fortsætter uændret
          </p>
        </div>
      </div>
    );
  }

  const handleBook = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-stripe-checkout");
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
      else toast.error("Ingen URL modtaget — prøv igen");
    } catch (err: any) {
      console.error("Booking error:", err);
      // PR #352 gav create-stripe-checkout en serverside tier-gate der svarer
      // 403 med dansk tekst; uden body-parsning naaede den besked aldrig frem
      // til brugeren.
      let message = err?.message || "Noget gik galt. Prøv igen.";
      if (err?.context && typeof err.context.json === "function") {
        try {
          const payload = await err.context.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignorer parse-fejl og brug fallback-beskeden
        }
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // Den inkluderede vej — samme function for begge raadgivere, body { advisor } vaelger
  // ret, secrets og raekkens advisor (create-free-intro-booking, 13/9).
  const handleBookFree = async (advisor: Raadgiver) => {
    if (!user) return;
    setLoadingFree(advisor);
    try {
      const { data, error } = await supabase.functions.invoke("create-free-intro-booking", {
        body: { advisor },
      });
      if (error) throw error;
      if (data?.url) {
        setFreeUrl({ url: data.url, advisor });
        queryClient.invalidateQueries({ queryKey: ["company-intro-session", companyId] });
        queryClient.invalidateQueries({ queryKey: ["my-inkluderede-bookinger", user.id] });
      } else {
        toast.error("Ingen URL modtaget. Prøv igen.");
      }
    } catch (err: any) {
      console.error("Free booking error:", err);
      // Vis edge function'ens danske besked (503/409/403) ved at parse svar-body'en.
      let message = err?.message || "Noget gik galt. Prøv igen.";
      if (err?.context && typeof err.context.json === "function") {
        try {
          const payload = await err.context.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignorer parse-fejl og brug fallback-beskeden
        }
      }
      toast.error(message);
    } finally {
      setLoadingFree(null);
    }
  };

  if (freeUrl) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <HbCard className="p-10">
          <div className="w-16 h-16 rounded-full bg-hb-evergreen/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-8 w-8 text-hb-evergreen" />
          </div>
          <h1 className="font-editorial text-2xl font-medium text-hb-ink mb-3">Din session med {NAVN[freeUrl.advisor]} er klar</h1>
          <p className="text-hb-ink-soft mb-8">
            Vælg et tidspunkt der passer dig, så er du booket ind hos {NAVN[freeUrl.advisor]}.
          </p>
          <div className="space-y-4">
            <div className="bg-hb-evergreen/5 border border-hb-evergreen/20 rounded-hb p-4">
              <p className="text-sm font-medium text-hb-evergreen">Dit personlige booking-link er klar</p>
              <p className="text-xs text-hb-ink-soft mt-1">Linket kan kun bruges én gang.</p>
            </div>
            <a href={freeUrl.url} target="_blank" rel="noopener noreferrer">
              <HbButton className="w-full">
                <Calendar className="h-4 w-4" />
                Vælg tidspunkt
              </HbButton>
            </a>
          </div>
        </HbCard>
      </div>
    );
  }

  if (success && sessionId) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <HbCard className="p-10">
          <div className="w-16 h-16 rounded-full bg-hb-evergreen/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-8 w-8 text-hb-evergreen" />
          </div>
          <h1 className="font-editorial text-2xl font-medium text-hb-ink mb-3">Betaling modtaget!</h1>
          <p className="text-hb-ink-soft mb-8">
            Vi genererer dit personlige booking-link — det tager et øjeblik.
          </p>
          {!booking?.calendly_booking_url ? (
            <p className="text-sm text-hb-ink-soft">Henter dit booking-link...</p>
          ) : (
            <div className="space-y-4">
              <div className="bg-hb-evergreen/5 border border-hb-evergreen/20 rounded-hb p-4">
                <p className="text-sm font-medium text-hb-evergreen">Dit personlige booking-link er klar</p>
                <p className="text-xs text-hb-ink-soft mt-1">Linket kan kun bruges én gang og er også sendt til din email.</p>
              </div>
              <a href={booking.calendly_booking_url} target="_blank" rel="noopener noreferrer">
                <HbButton className="w-full">
                  <Calendar className="h-4 w-4" />
                  Vælg tidspunkt
                </HbButton>
              </a>
            </div>
          )}
        </HbCard>
      </div>
    );
  }

  return (
    <div className={`mx-auto ${showMortenColumn ? "max-w-5xl" : "max-w-2xl"}`}>
      <div className="mb-10">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Din rådgiver</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          Book en session
        </h1>
        <p className="mt-3 text-sm text-hb-ink-soft">Få fokuseret sparring direkte med en rådgiver</p>
      </div>

      <div className={showMortenColumn ? "grid grid-cols-1 md:grid-cols-2 gap-6 items-start" : ""}>
      {showMortenColumn && (
        <HbCard className="p-8 space-y-8">

          {/* Avatar-header: konstant i alle tilstande. Ingen spor-etiket
              («… · inkluderet») under titlen: kortet ER
              sessionen, saa linjen navngav kun det medlemmet allerede ser og
              gentog knappen nedenunder. Navnet bruges stadig hvor det er en
              label i en liste — Virksomhed, admin-dialogen, indstillinger,
              Stripe-kvitteringen (13/9). */}
          <div className="flex items-center gap-4">
            <AdvisorAvatar src="/morten-larsen.jpg" alt="Morten" initials="ML" />
            <div>
              <h2 className="font-semibold text-hb-ink">Morten Larsen</h2>
              <p className="text-sm text-hb-ink-soft">Investor og rådgiver, The Boardroom</p>
            </div>
          </div>

          {/* Fakta-tiles: deles af "book" og "link-ready", saa Morten-kortet
              holder hoejde med Jonas-kortet naar linket er klar. */}
          {(mortenState === "book" || mortenState === "link-ready") && (
            <FaktaTiles minutter={30} undertekst="Personlig sparring" />
          )}

          {/* "book": beskrivelse + book-knap. De to broedtekster deler rammen
              — medlemmet bestemmer indholdet (Jonas 13/9: «det er ikke os, der
              saetter rammerne for den snak») — men ikke ordene, for staar de
              ens side om side laeses kun den foerste. Forskellen er raadgiverens
              blik: Morten er INVESTOR og ser forretningen udefra; Jonas er
              PARTNER og kender platformen og tallene indefra. Overskriften
              baerer forskellen foerst. «Onboarding» og «strategi-session» er
              forbudte — den foerste er for snaever for Jonas' session (den
              udloeber ikke, og mange behoever det ikke), den anden for Mortens. */}
          {mortenState === "book" && (
            <>
              <div>
                <h3 className="font-semibold text-hb-ink mb-2">Blikket udefra</h3>
                <p className="text-sm text-hb-ink-soft">
                  Morten er investor og ser din forretning udefra, med det blik en investor
                  lægger på en virksomhed. Du bestemmer selv hvad sessionen skal bruges til.
                  Det kan være en beslutning du står over for, en plan du vil have udfordret,
                  eller et regnskab du vil have friske øjne på. Du sætter dagsordenen, og
                  Morten stiller de spørgsmål en investor ville stille.
                </p>
              </div>

              <div className="border-t border-hb-line pt-6">
                {/* «Én session per virksomhed» er kortets vigtigste oplysning:
                    retten kan bruges én gang, af én i virksomheden, og derefter
                    er den vaek (Morten) eller afloest af den koebte (Jonas). Den
                    stod som graa fodnote paa linje med «Inkluderet»; nu staar den
                    paa egen linje i ink med konsekvensen skrevet ud (13/9). */}
                <div className="mb-4 space-y-1">
                  <p className="text-lg font-bold text-hb-ink">Inkluderet i dit medlemskab</p>
                  <p className="text-sm font-medium text-hb-ink">
                    Én session per virksomhed, ikke per bruger. Når den er booket, er den brugt
                    for hele virksomheden.
                  </p>
                </div>
                <HbButton
                  className="w-full"
                  onClick={() => handleBookFree("morten")}
                  disabled={loadingFree !== null}
                >
                  {loadingFree === "morten" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Henter dit link...</>
                  ) : (
                    <>Book din session med Morten</>
                  )}
                </HbButton>
              </div>
            </>
          )}

          {/* "loading": holder kolonnen aaben saa book-kortet aldrig blinker. */}
          {mortenState === "loading" && (
            <p className="flex items-center justify-center py-8 text-sm text-hb-ink-soft">Henter…</p>
          )}

          {mortenState === "link-ready" && mortenBooking?.calendly_booking_url && (
            <LinkKlar navn="Morten" url={mortenBooking.calendly_booking_url} />
          )}

          {/* "booked": moedet er booket -> bekraeftelse, INTET link. */}
          {mortenState === "booked" && (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-hb-evergreen shrink-0 mt-0.5" />
              <p className="text-sm text-hb-ink-soft">
                Din session med Morten er booket. Du har fået en bekræftelse på mail med tid og
                link til mødet.
              </p>
            </div>
          )}

          {/* "cancelled": aegte aflysning -> venlig besked, ingen hardcoded kontakt-vej. */}
          {mortenState === "cancelled" && (
            <p className="text-sm text-hb-ink-soft">
              Din session med Morten blev aflyst. Skriv til os, så finder vi en ny tid sammen.
            </p>
          )}
        </HbCard>
      )}

      {/* Jonas-kortet: ALTID til stede. Inkluderet indtil retten er brugt, derefter koebt. */}
      <HbCard className="p-8 space-y-8">

        {/* Samme som Morten-headeren: ingen spor-etiket («· inkluderet» /
            «· købt»). Ansigtet er allerede synligt i kortets krop — den
            inkluderede via «Inkluderet i dit medlemskab», den koebte via
            45 minutter, prisen og «Book og betal» (13/9). */}
        <div className="flex items-center gap-4">
          <AdvisorAvatar src="/jonas-herlev.png" alt="Jonas Herlev" initials="JH" />
          <div>
            <h2 className="font-semibold text-hb-ink">Jonas Herlev</h2>
            <p className="text-sm text-hb-ink-soft">Partner & Advisor, The Boardroom</p>
          </div>
        </div>

        {jonasKort.kort === "inkluderet" ? (
          <>
            {(jonasKort.tilstand === "book" || jonasKort.tilstand === "link-ready") && (
              <FaktaTiles minutter={30} undertekst="Personlig sparring" />
            )}

            {jonasKort.tilstand === "book" && (
              <>
                {/* Modstykket til Mortens tekst — se kommentaren ved hans
                    "book"-blok. Her er blikket indefra: platformen og tallene. */}
                <div>
                  <h3 className="font-semibold text-hb-ink mb-2">Blikket indefra</h3>
                  <p className="text-sm text-hb-ink-soft">
                    Jonas er partner i The Boardroom og kender platformen og dine tal indefra.
                    Du bestemmer selv hvad sessionen skal bruges til. Det kan være en gennemgang
                    af det platformen viser om din virksomhed, hjælp til at læse dine nøgletal,
                    eller sparring på en beslutning hvor tallene skal med. Du sætter dagsordenen,
                    og Jonas tager udgangspunkt i det der allerede ligger i dit Boardroom.
                  </p>
                </div>

                <div className="border-t border-hb-line pt-6">
                  {/* Samme vaegt som paa Mortens kort; konsekvensen er en anden:
                      retten afloeses af den koebte session, ikke af ingenting. */}
                  <div className="mb-4 space-y-1">
                    <p className="text-lg font-bold text-hb-ink">Inkluderet i dit medlemskab</p>
                    <p className="text-sm font-medium text-hb-ink">
                      Én session per virksomhed, ikke per bruger. Når den er booket, kan du købe
                      flere sessioner med Jonas til medlemspris.
                    </p>
                  </div>
                  <HbButton
                    className="w-full"
                    onClick={() => handleBookFree("jonas")}
                    disabled={loadingFree !== null}
                  >
                    {loadingFree === "jonas" ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Henter dit link...</>
                    ) : (
                      <>Book din session med Jonas</>
                    )}
                  </HbButton>
                </div>
              </>
            )}

            {jonasKort.tilstand === "loading" && (
              <p className="flex items-center justify-center py-8 text-sm text-hb-ink-soft">Henter…</p>
            )}

            {jonasKort.tilstand === "link-ready" && jonasBooking?.calendly_booking_url && (
              <LinkKlar navn="Jonas" url={jonasBooking.calendly_booking_url} />
            )}
          </>
        ) : (
          <>
            <FaktaTiles minutter={45} undertekst="Fokuseret sparring" />

            <div>
              <h3 className="font-semibold text-hb-ink mb-3">Det kan du få sparring på</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TOPICS.map((topic) => (
                  <div key={topic.title} className="flex items-start gap-2 p-3 rounded-hb bg-hb-paper">
                    <CheckCircle2 className="h-4 w-4 text-hb-evergreen mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-hb-ink">{topic.title}</p>
                      <p className="text-xs text-hb-ink-soft">{topic.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-hb-line pt-6">
              <div className="mb-4">
                <p className="text-sm text-hb-ink-soft line-through">1.000 kr. ex. moms</p>
                <div className="flex items-baseline gap-2">
                  <p className="font-editorial text-2xl font-medium text-hb-ink">500 kr.</p>
                  <p className="text-sm text-hb-ink-soft">ex. moms · member-pris</p>
                </div>
              </div>
              <HbButton className="w-full" onClick={handleBook} disabled={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Henter betalingsside...</>
                ) : (
                  <>Book og betal — 500 kr. ex. moms</>
                )}
              </HbButton>
              <p className="text-xs text-hb-ink-soft text-center mt-3">
                Du modtager et personligt booking-link via email og i platformen efter betaling.
              </p>
              <p className="text-xs text-hb-ink-soft text-center mt-1">
                Sikker betaling via Stripe
              </p>
            </div>
          </>
        )}
      </HbCard>
      </div>
    </div>
  );
};
