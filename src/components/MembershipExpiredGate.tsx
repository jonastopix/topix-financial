import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Betalingsmodel } from "@/lib/fornyelsespris";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";

interface FornyelsesMulighed {
  betalingsmodel: Betalingsmodel;
  samlet_oere: number;
  rate_oere: number;
  antal_traek: number;
  lookup_key: string;
}

interface Fornyelsestilbud {
  grundbeloeb_oere: number;
  muligheder: FornyelsesMulighed[];
}

// Øre → dansk kronestreng. Hele beløb uden decimaler ("2.000"), skæve med
// to ("2.187,50") — ører må ikke forsvinde i formateringen.
function kr(oere: number): string {
  const kroner = oere / 100;
  return new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: Number.isInteger(kroner) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(kroner);
}

function beskrivMulighed(m: FornyelsesMulighed): string {
  switch (m.betalingsmodel) {
    case "fuld":
      return "Betal på én gang";
    case "rate2":
      return `2 rater à ${kr(m.rate_oere)} kr. — nu og om 6 måneder`;
    case "rate12":
      return `12 rater à ${kr(m.rate_oere)} kr. — i alt ${kr(m.samlet_oere)} kr.`;
  }
}

export default function MembershipExpiredGate() {
  const { companyId, profile, signOut } = useAuth();
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [offboardingDone, setOffboardingDone] = useState(false);
  const [showOffboardConfirm, setShowOffboardConfirm] = useState(false);

  // Serverside afgørelse: hent-fornyelsestilbud tager ingen parametre —
  // virksomheden udledes af kalderen, og beslutningen (company_fornyelse,
  // advisor-only) når aldrig browseren; her kendes kun resultatet.
  // Fejl behandles som "intet tilbud": et udløbet medlem skal møde noget
  // der virker, aldrig en fejlbesked.
  const { data: tilbud = null } = useQuery({
    queryKey: ["fornyelsestilbud"],
    queryFn: async (): Promise<Fornyelsestilbud | null> => {
      const { data, error } = await supabase.functions.invoke("hent-fornyelsestilbud");
      if (error) throw error;
      return (data?.tilbud ?? null) as Fornyelsestilbud | null;
    },
    staleTime: 5 * 60_000,
  });

  const firstName = profile?.full_name?.split(" ")[0] || "dig";

  const handleSubscribe = async () => {
    setLoadingCheckout(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-subscription-checkout", {
        body: { company_id: companyId },
      });
      if (error || !data?.url) throw new Error(error?.message || "Ingen checkout URL");
      window.location.href = data.url;
    } catch (err: any) {
      toast.error("Noget gik galt", { description: err.message });
      setLoadingCheckout(false);
    }
  };

  const handleOffboard = async () => {
    try {
      await supabase
        .from("companies")
        .update({ offboarding_requested_at: new Date().toISOString() } as any)
        .eq("id", companyId!);
      setOffboardingDone(true);
    } catch {
      toast.error("Noget gik galt — kontakt os direkte.");
    }
  };

  if (offboardingDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="text-2xl font-semibold text-foreground">
            Tak for din tid hos The Boardroom
          </h1>
          <p className="text-muted-foreground">
            Vi har modtaget din anmodning om sletning af data. Jonas kontakter dig
            inden for 2 hverdage for at bekræfte.
          </p>
          <button
            onClick={() => signOut()}
            className="rounded-lg bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Log ud
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-10">
        {/* Header */}
        <div className="text-center space-y-3">
          <p className="text-sm uppercase tracking-widest text-muted-foreground font-medium">
            The Boardroom
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground">
            Dit medlemskab er udløbet, {firstName}
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Dit forløb med The Boardroom er afsluttet. Vælg hvad der sker nu —
            din data er stadig her og venter på dig.
          </p>
        </div>

        {/* Advisor avatars */}
        <div className="flex items-center justify-center gap-8">
          <div className="text-center space-y-2">
            <img
              src="/jonas-herlev.png"
              alt="Jonas Herlev"
              className="h-16 w-16 rounded-full object-cover mx-auto"
            />
            <p className="text-sm text-foreground">Jonas</p>
          </div>
          <div className="text-center space-y-2">
            <img
              src="/morten-larsen.jpg"
              alt="Morten Larsen"
              className="h-16 w-16 rounded-full object-cover mx-auto"
            />
            <p className="text-sm text-foreground">Morten</p>
          </div>
        </div>

        {/* Three paths */}
        <div className="space-y-3">
          {/* Path 1: Fornyelse — afgøres serverside af hent-fornyelsestilbud.
              Bevidst INGEN indlæsningstilstand: udgangstilstanden er kortet
              uden tilbud, som kun erstattes hvis der kommer et tilbud. En
              pladsholder der foldede ud for den ene gruppe og kollapsede for
              den anden, ville lække dommen i selve overgangen — en overgang
              der kun sker for den ene gruppe, er i sig selv en besked. */}
          {tilbud ? (
            <a
              href={`mailto:jonas@topix.dk?subject=${encodeURIComponent("Fornyelse af medlemskab")}&body=${encodeURIComponent("Sig til, så sender vi betalingslinket.")}`}
              className="block w-full rounded-xl border-2 border-primary/30 bg-primary/5 p-5 hover:border-primary/60 hover:bg-primary/10 transition-all group"
            >
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">
                  Forny dit medlemskab
                </h3>
                <p className="text-3xl font-semibold text-foreground">
                  {kr(tilbud.grundbeloeb_oere)}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    kr. ekskl. moms
                  </span>
                </p>
                <ul className="space-y-1">
                  {tilbud.muligheder.map((m) => (
                    <li key={m.lookup_key} className="text-sm text-muted-foreground">
                      {beskrivMulighed(m)}
                    </li>
                  ))}
                </ul>
                {/* Ingen betalingsknap endnu — betalingsvejen findes ikke. */}
                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                  Sig til, så sender vi betalingslinket.
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </p>
              </div>
            </a>
          ) : (
            /* Uden tilbud. Dette kort vises både til medlemmer der ikke får
               tilbudt fornyelse og til dem hvor ingen beslutning er truffet —
               de to grupper skal se NØJAGTIG det samme. Teksten må derfor ikke
               love et tilbud: en tekst der lover noget, ville gøre fraværet af
               tilbud til en besked i sig selv. Samme grund til det neutrale
               mail-subject "The Boardroom" frem for "Fornyelse af medlemskab". */
            <a
              href={`mailto:jonas@topix.dk?subject=${encodeURIComponent("The Boardroom")}`}
              className="block w-full rounded-xl border-2 border-primary/30 bg-primary/5 p-5 hover:border-primary/60 hover:bg-primary/10 transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Vil du fortsætte?
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Skriv til os, så tager vi en snak om mulighederne.
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-primary mt-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </a>
          )}

          {/* Path 2: Self-serve subscription */}
          <button
            onClick={handleSubscribe}
            disabled={loadingCheckout}
            className="block w-full text-left rounded-xl border border-border bg-card p-5 hover:border-foreground/30 hover:bg-muted/30 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <h3 className="text-lg font-semibold text-foreground">
                  Behold adgang til platformen
                </h3>
                <p className="text-sm text-muted-foreground">
                  Fortsæt med at uploade rapporter, følge dine KPI'er og bruge
                  AI-analysen. Uden personlig rådgivning.
                </p>
                <p className="text-sm font-medium text-foreground">
                  299 kr./md. — opsig når som helst
                </p>
              </div>
              {loadingCheckout ? (
                <Loader2 className="h-5 w-5 text-muted-foreground mt-1 animate-spin" />
              ) : (
                <ArrowRight className="h-5 w-5 text-muted-foreground mt-1 group-hover:translate-x-1 transition-transform" />
              )}
            </div>
          </button>

          {/* Path 3: Offboard */}
          {!showOffboardConfirm ? (
            <button
              onClick={() => setShowOffboardConfirm(true)}
              className="block w-full text-left rounded-xl border border-border/50 bg-transparent p-5 hover:bg-muted/30 transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <h3 className="text-base font-semibold text-foreground">
                    Farvel og tak
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Slet din data og luk din konto. Vi sender en bekræftelse og
                    håndterer det inden for 2 hverdage.
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground mt-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          ) : (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
              <p className="text-sm font-medium text-foreground">
                Er du sikker? Din data kan ikke gendannes.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleOffboard}
                  className="flex-1 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium py-2 hover:bg-destructive/90 transition-colors"
                >
                  Ja, slet min data
                </button>
                <button
                  onClick={() => setShowOffboardConfirm(false)}
                  className="flex-1 rounded-lg border border-border text-sm font-medium py-2 hover:bg-muted/50 transition-colors"
                >
                  Annuller
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Spørgsmål? Skriv til{" "}
          <a href="mailto:jonas@topix.dk" className="text-primary hover:underline">
            jonas@topix.dk
          </a>
        </p>
      </div>
    </div>
  );
}
