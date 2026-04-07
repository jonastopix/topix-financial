import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Calendar, Clock, Video, CheckCircle2, Loader2, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function BookSession() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const success = searchParams.get("success") === "true";
  const sessionId = searchParams.get("session_id");

  const { data: booking, isLoading: bookingLoading } = useQuery({
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
    refetchInterval: (query: any) => {
      const d = query?.state?.data;
      return !d?.calendly_booking_url ? 2000 : false;
    },
    refetchIntervalInBackground: true,
  });

  const handleBook = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-stripe-checkout");
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast.error("Noget gik galt — prøv igen");
      console.error(err);
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
            {bookingLoading || !booking?.calendly_booking_url ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Henter dit booking-link...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Dit personlige booking-link er klar</p>
                  <p className="text-xs text-muted-foreground mt-1">Linket kan kun bruges én gang og er sendt til din email.</p>
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
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              JH
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Jonas Herlev</h2>
              <p className="text-sm text-muted-foreground">Partner & Advisor, The Boardroom</p>
              <div className="flex gap-0.5 mt-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
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
            <h3 className="font-semibold text-foreground mb-3">Hvad får du?</h3>
            {[
              "Dybdegående gennemgang af dine tal og nøgletal",
              "Konkrete handlingsanvisninger til din situation",
              "Sparring på strategi, prissætning eller vækst",
              "Opfølgning via platformen efter sessionen",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground line-through">1.000 kr.</p>
                <p className="text-2xl font-bold text-foreground">500 kr. <span className="text-sm font-normal text-muted-foreground">member-pris</span></p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Inkl. moms</p>
                <p className="text-xs text-muted-foreground">Sikker betaling via Stripe</p>
              </div>
            </div>
            <Button size="lg" className="w-full" onClick={handleBook} disabled={loading}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Henter betalingsside...</>
              ) : (
                <>Book og betal — 500 kr.</>
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
