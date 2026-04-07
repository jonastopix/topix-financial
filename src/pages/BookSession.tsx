import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Calendar, Clock, Video, CheckCircle2, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const TOPICS = [
  { title: "Procesoptimering", desc: "Find flaskehalsene i din forretning og fjern dem" },
  { title: "Automatisering", desc: "Hvilke opgaver kan du automatisere, og hvad skal du starte med" },
  { title: "Fokus & prioritering", desc: "Få hjælp til at skære fra og fokusere energien der hvor det rykker mest" },
  { title: "Fra tal til beslutning", desc: "Forstå hvad dine nøgletal faktisk fortæller dig, og hvad du skal gøre ved det" },
];

export default function BookSession() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
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
      <div className="max-w-2xl mx-auto py-10 px-4">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">Book 1:1 session med Jonas</h1>
          <p className="text-muted-foreground">Få fokuseret sparring direkte med Jonas Herlev</p>
        </div>

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
    </AppLayout>
  );
}
