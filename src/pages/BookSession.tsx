import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Calendar, Clock, Video, CheckCircle2, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const TOPICS = [
  { title: "Procesoptimering", desc: "Find flaskehalsene i din forretning og fjern dem" },
  { title: "Automatisering", desc: "Hvilke opgaver kan du automatisere, og hvad skal du starte med" },
  { title: "Fokus & prioritering", desc: "Få hjælp til at skære fra og fokusere energien der hvor det rykker mest" },
  { title: "Fra tal til beslutning", desc: "Forstå hvad dine nøgletal faktisk fortæller dig, og hvad du skal gøre ved det" },
];

export default function BookSession() {
  const { user, isAdvisor, membershipTier, companyId } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [loadingFree, setLoadingFree] = useState(false);
  const [freeUrl, setFreeUrl] = useState<string | null>(null);
  const success = searchParams.get("success") === "true";
  const sessionId = searchParams.get("session_id");

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
              <div className="h-16 w-16 rounded-full bg-accent/40 text-foreground flex items-center justify-center text-base font-semibold">
                MH
              </div>
            </div>
            <div className="space-y-3">
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
                Book session er forbeholdt fulde medlemmer
              </h1>
              <p className="text-muted-foreground">
                1:1 sessioner med Jonas er en del af det fulde Boardroom-medlemskab.
                Som abonnent har du adgang til alle data-features — opgrader for at få personlig sparring.
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

  // Gratis intro-status. Henter ogsaa contract_end_date, saa Morten-kortets gating kan
  // matche backend'ens "full" praecist (kontrakt i fremtiden), uafhaengigt af at useAuth
  // remapper no_date til "full".
  const { data: company } = useQuery({
    queryKey: ["company-intro-session", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("companies")
        .select("intro_session_used_at, contract_end_date")
        .eq("id", companyId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  const introUsed = !!(company as any)?.intro_session_used_at;
  const contractInFuture =
    !!(company as any)?.contract_end_date &&
    new Date((company as any).contract_end_date) > new Date();
  // Vis KUN Morten naar backend ville acceptere: ikke raadgiver, fuldt medlem med kontrakt i
  // fremtiden (ikke no_date), company-data hentet, og gratis ikke brugt.
  const showMortenCard =
    !isAdvisor &&
    membershipTier === "full" &&
    !!companyId &&
    !!company &&
    contractInFuture &&
    !introUsed;

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
      toast.error(err?.message || "Noget gik galt — prøv igen");
    } finally {
      setLoading(false);
    }
  };

  const handleBookFree = async () => {
    if (!user) return;
    setLoadingFree(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-free-intro-booking");
      if (error) throw error;
      if (data?.url) {
        setFreeUrl(data.url);
        queryClient.invalidateQueries({ queryKey: ["company-intro-session", companyId] });
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
      setLoadingFree(false);
    }
  };

  if (freeUrl) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto py-16 px-4 text-center">
          <div className="bg-card border border-border rounded-2xl p-10 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-3">Din gratis intro er klar!</h1>
            <p className="text-muted-foreground mb-8">
              Vælg et tidspunkt der passer dig, så er du booket ind hos Morten.
            </p>
            <div className="space-y-4">
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Dit personlige booking-link er klar</p>
                <p className="text-xs text-muted-foreground mt-1">Linket kan kun bruges én gang.</p>
              </div>
              <a href={freeUrl} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="w-full">
                  <Calendar className="h-4 w-4 mr-2" />
                  Vælg tidspunkt
                </Button>
              </a>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (success && sessionId) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto py-16 px-4 text-center">
          <div className="bg-card border border-border rounded-2xl p-10 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-3">Betaling modtaget!</h1>
            <p className="text-muted-foreground mb-8">
              Vi genererer dit personlige booking-link — det tager et øjeblik.
            </p>
            {!booking?.calendly_booking_url ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Henter dit booking-link...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Dit personlige booking-link er klar</p>
                  <p className="text-xs text-muted-foreground mt-1">Linket kan kun bruges én gang og er også sendt til din email.</p>
                </div>
                <a href={booking.calendly_booking_url} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="w-full">
                    <Calendar className="h-4 w-4 mr-2" />
                    Vælg tidspunkt
                  </Button>
                </a>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className={`mx-auto py-10 px-4 ${showMortenCard ? "max-w-5xl" : "max-w-2xl"}`}>
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">Book en 1:1 session</h1>
          <p className="text-muted-foreground">Få fokuseret sparring direkte med en rådgiver</p>
        </div>

        <div className={showMortenCard ? "grid grid-cols-1 md:grid-cols-2 gap-6 items-start" : ""}>
        {showMortenCard && (
          <div className="bg-card border border-border rounded-2xl p-8 shadow-sm space-y-8">

            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full overflow-hidden shrink-0">
                <img
                  src="/morten-larsen.png"
                  alt="Morten"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const el = e.currentTarget;
                    el.style.display = "none";
                    const parent = el.parentElement!;
                    parent.classList.add("bg-primary/10", "flex", "items-center", "justify-center");
                    parent.innerHTML = '<span class="text-xl font-bold text-primary">ML</span>';
                  }}
                />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Morten Larsen</h2>
                <p className="text-sm text-muted-foreground">Investor og rådgiver, The Boardroom</p>
                <p className="text-xs text-muted-foreground mt-0.5">Din personlige 1:1 strategi-session</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-xl bg-secondary/50">
                <Clock className="h-5 w-5 mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium text-foreground">30 minutter</p>
                <p className="text-xs text-muted-foreground">Personlig sparring</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-secondary/50">
                <Video className="h-5 w-5 mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium text-foreground">Online</p>
                <p className="text-xs text-muted-foreground">Google Meet</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-secondary/50">
                <Calendar className="h-5 w-5 mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium text-foreground">Fleksibelt</p>
                <p className="text-xs text-muted-foreground">Vælg selv tid</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Det kan du få ud af det</h3>
              <p className="text-sm text-muted-foreground">
                Som nyt medlem får du én personlig 1:1 strategi-session med Morten. Du bestemmer
                selv hvad den skal bruges til. Det kan være en strategisk gennemgang, sparring på
                en konkret beslutning, et regnskab du vil have øjne på, eller noget helt fjerde.
                Du sidder for bordenden.
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-lg font-bold text-foreground">Inkluderet i dit medlemskab</p>
                    <p className="text-sm text-muted-foreground">én session per virksomhed</p>
                  </div>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full"
                onClick={handleBookFree}
                disabled={loadingFree}
              >
                {loadingFree ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Henter dit link...</>
                ) : (
                  <>Book din session med Morten</>
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm space-y-8">

          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full overflow-hidden shrink-0">
              <img
                src="/jonas-herlev.png"
                alt="Jonas Herlev"
                className="h-full w-full object-cover"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  const parent = el.parentElement!;
                  parent.classList.add("bg-primary/10", "flex", "items-center", "justify-center");
                  parent.innerHTML = '<span class="text-xl font-bold text-primary">JH</span>';
                }}
              />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Jonas Herlev</h2>
              <p className="text-sm text-muted-foreground">Partner & Advisor, The Boardroom</p>
              <p className="text-xs text-muted-foreground mt-0.5">Investor · Iværksætter · Rådgiver</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-xl bg-secondary/50">
              <Clock className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium text-foreground">45 minutter</p>
              <p className="text-xs text-muted-foreground">Fokuseret sparring</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-secondary/50">
              <Video className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium text-foreground">Online</p>
              <p className="text-xs text-muted-foreground">Google Meet</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-secondary/50">
              <Calendar className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium text-foreground">Fleksibelt</p>
              <p className="text-xs text-muted-foreground">Vælg selv tid</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-3">Det kan du få sparring på</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TOPICS.map((topic) => (
                <div key={topic.title} className="flex items-start gap-2 p-3 rounded-lg bg-secondary/30">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{topic.title}</p>
                    <p className="text-xs text-muted-foreground">{topic.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground line-through">1.000 kr. ex. moms</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-foreground">500 kr.</p>
                  <p className="text-sm text-muted-foreground">ex. moms · member-pris</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-right">Sikker betaling<br />via Stripe</p>
            </div>
            <Button size="lg" className="w-full" onClick={handleBook} disabled={loading}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Henter betalingsside...</>
              ) : (
                <>Book og betal — 500 kr. ex. moms</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Du modtager et personligt booking-link via email og i platformen efter betaling.
            </p>
          </div>
        </div>
        </div>
      </div>
    </AppLayout>
  );
}
