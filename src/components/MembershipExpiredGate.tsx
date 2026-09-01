import "@/styles/hjemmebane.css";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Betalingsmodel } from "@/lib/fornyelsespris";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { toast } from "sonner";
import { Loader2, ArrowRight, ChevronRight } from "lucide-react";

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
  const [loadingFornyelse, setLoadingFornyelse] = useState<Betalingsmodel | null>(null);
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

  const handleFornyelse = async (betalingsmodel: Betalingsmodel) => {
    setLoadingFornyelse(betalingsmodel);
    try {
      const { data, error } = await supabase.functions.invoke("opret-fornyelse-checkout", {
        body: { betalingsmodel },
      });
      if (error) {
        // 403-beskeden "Fornyelse er ikke tilgængelig." kan vises som den
        // er — den rammes fx hvis beslutningen er trukket tilbage mens
        // medlemmet sad på siden. Alt andet får en neutral besked; aldrig
        // en teknisk fejlbesked til medlemmet.
        let besked = "Noget gik galt — skriv til os, så hjælper vi dig videre.";
        try {
          const body = await (
            error as { context?: { json: () => Promise<{ error?: string }> } }
          ).context?.json();
          if (body?.error === "Fornyelse er ikke tilgængelig.") besked = body.error;
        } catch {
          // uparsebart fejlsvar — behold den neutrale besked
        }
        toast.error(besked);
        setLoadingFornyelse(null);
        return;
      }
      if (!data?.url) throw new Error("Ingen checkout URL");
      window.location.href = data.url;
    } catch {
      toast.error("Noget gik galt — skriv til os, så hjælper vi dig videre.");
      setLoadingFornyelse(null);
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
      <div className="theme-hjemmebane min-h-screen flex items-center justify-center bg-hb-paper font-body text-hb-ink antialiased px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="font-editorial text-2xl font-medium text-hb-ink">
            Tak for din tid hos The Boardroom
          </h1>
          <p className="text-hb-ink-soft">
            Vi har modtaget din anmodning om sletning af data. Jonas kontakter dig
            inden for 2 hverdage for at bekræfte.
          </p>
          <HbButton variant="primary" onClick={() => signOut()}>
            Log ud
          </HbButton>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-hjemmebane min-h-screen bg-hb-paper font-body text-hb-ink antialiased px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-10">
        {/* Header */}
        <div className="text-center space-y-3">
          <p className="text-sm uppercase tracking-widest text-hb-rust font-medium">
            The Boardroom
          </p>
          <h1 className="font-editorial text-3xl md:text-4xl font-medium leading-tight text-hb-ink">
            Dit medlemskab er udløbet, {firstName}
          </h1>
          <p className="text-hb-ink-soft max-w-lg mx-auto">
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
            <p className="text-sm text-hb-ink">Jonas</p>
          </div>
          <div className="text-center space-y-2">
            <img
              src="/morten-larsen.jpg"
              alt="Morten Larsen"
              className="h-16 w-16 rounded-full object-cover mx-auto"
            />
            <p className="text-sm text-hb-ink">Morten</p>
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
          {/* Samme ydre form for begge fornyelseskort: samme HbCard, samme
              polstring, samme placering — kun indholdet varierer. Ordningens
              §2 kræver at siden ser ens ud for alle uden tilbud, og en
              forskel i kortets form ville kunne aflæses. Det gælder også
              hover og markør, ikke kun form: begge kort er selv passive med
              handlinger på knapper indeni — en forskel man kan MÆRKE (et
              kort der reagerer på musen hvor det andet ikke gør) er også
              en besked. */}
          {tilbud ? (
            /* Kortet er ikke længere ét link — det er en pris med tre
               handlinger. Derfor ingen link-hover på selve kortet: intet må
               se klikbart ud uden at være det. Handlingerne er knapperne. */
            <HbCard className="p-5">
              <div className="space-y-3">
                <h3 className="font-editorial text-lg font-medium text-hb-ink">
                  Forny dit medlemskab
                </h3>
                <p className="font-editorial text-4xl md:text-5xl font-medium text-hb-ink">
                  {kr(tilbud.grundbeloeb_oere)}{" "}
                  <span className="font-body text-base font-normal text-hb-ink-soft">
                    kr. ekskl. moms
                  </span>
                </p>
                {/* pt-3 oven i kortets space-y-3: beløbet er sidens svar og
                    skal stå frit — ikke læses som overskrift til knaplisten.
                    Afstanden mellem knapperne indbyrdes er uændret.
                    ChevronRight, ikke ArrowRight: knapperne er et VALG mellem
                    tre ligeværdige muligheder, ikke navigation fremad. */}
                <div className="space-y-2 pt-3">
                  {tilbud.muligheder.map((m) => (
                    <HbButton
                      key={m.lookup_key}
                      variant="secondary"
                      onClick={() => handleFornyelse(m.betalingsmodel)}
                      disabled={loadingFornyelse !== null}
                      className="w-full justify-between text-left"
                    >
                      {beskrivMulighed(m)}
                      {loadingFornyelse === m.betalingsmodel ? (
                        <Loader2 className="h-4 w-4 shrink-0 text-hb-ink-soft animate-spin" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-hb-evergreen" />
                      )}
                    </HbButton>
                  ))}
                </div>
              </div>
            </HbCard>
          ) : (
            /* Uden tilbud. Dette kort vises både til medlemmer der ikke får
               tilbudt fornyelse og til dem hvor ingen beslutning er truffet —
               de to grupper skal se NØJAGTIG det samme. Teksten må derfor ikke
               love et tilbud: en tekst der lover noget, ville gøre fraværet af
               tilbud til en besked i sig selv. Samme grund til det neutrale
               mail-subject "The Boardroom" frem for "Fornyelse af medlemskab". */
            <HbCard className="p-5">
              <div className="space-y-3">
                <h3 className="font-editorial text-lg font-medium text-hb-ink">
                  Vil du fortsætte?
                </h3>
                <p className="text-sm text-hb-ink-soft">
                  Skriv til os, så tager vi en snak om mulighederne.
                </p>
                <HbButton
                  variant="secondary"
                  onClick={() => {
                    window.location.href = `mailto:jonas@topix.dk?subject=${encodeURIComponent("The Boardroom")}`;
                  }}
                  className="w-full justify-between text-left"
                >
                  Skriv til os
                  <ArrowRight className="h-4 w-4 shrink-0 text-hb-evergreen" />
                </HbButton>
              </div>
            </HbCard>
          )}

          {/* Path 2: Self-serve subscription — "The Boardroom — dine tal".
              Beløbet skal stemme med prisen bag lookup_key
              "abonnement_maanedlig" på den aktive Stripe-konto. Ændres
              prisen i Stripe, skal teksten ændres her. */}
          <HbCard className="p-0">
            <button
              onClick={handleSubscribe}
              disabled={loadingCheckout}
              className="block w-full text-left p-5 group disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <h3 className="font-editorial text-lg font-medium text-hb-ink">
                    Behold adgang til dine tal og din historik
                  </h3>
                  <p className="text-sm text-hb-ink-soft">
                    Fortsæt med at uploade rapporter, følge dine KPI'er og bruge
                    AI-analysen. Uden personlig rådgivning.
                  </p>
                  <p className="text-sm font-medium text-hb-ink">
                    399 kr./md. ekskl. moms — opsig når som helst
                  </p>
                </div>
                {loadingCheckout ? (
                  <Loader2 className="h-5 w-5 text-hb-ink-soft mt-1 animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5 text-hb-ink-soft mt-1 group-hover:translate-x-1 transition-transform" />
                )}
              </div>
            </button>
          </HbCard>

          {/* Path 3: Offboard */}
          {!showOffboardConfirm ? (
            <HbCard className="p-0">
              <button
                onClick={() => setShowOffboardConfirm(true)}
                className="block w-full text-left p-5 group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <h3 className="font-editorial text-base font-medium text-hb-ink">
                      Farvel og tak
                    </h3>
                    <p className="text-sm text-hb-ink-soft">
                      Slet din data og luk din konto. Vi sender en bekræftelse og
                      håndterer det inden for 2 hverdage.
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-hb-ink-soft mt-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </HbCard>
          ) : (
            <HbCard className="p-5 space-y-3 border-destructive/30 bg-destructive/5">
              <p className="text-sm font-medium text-hb-ink">
                Er du sikker? Din data kan ikke gendannes.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleOffboard}
                  className="flex-1 rounded-full bg-destructive text-destructive-foreground text-sm font-medium py-2 hover:bg-destructive/90 transition-colors"
                >
                  Ja, slet min data
                </button>
                <HbButton
                  variant="secondary"
                  onClick={() => setShowOffboardConfirm(false)}
                  className="flex-1"
                >
                  Annuller
                </HbButton>
              </div>
            </HbCard>
          )}
        </div>

        <p className="text-center text-sm text-hb-ink-soft">
          Spørgsmål? Skriv til{" "}
          <a href="mailto:jonas@topix.dk" className="text-hb-evergreen hover:underline">
            jonas@topix.dk
          </a>
        </p>
      </div>
    </div>
  );
}
