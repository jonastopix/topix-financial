import "@/styles/hjemmebane.css";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";

/** Kvitteringen efter en gennemført fornyelse — vises af Index i stedet
    for MembershipExpiredGate, mens stripe-webhook stadig er på vej.

    HVORFOR DEN FINDES: Stripe omdirigerer medlemmet tilbage i samme
    øjeblik betalingen er gennemført, mens webhooken der forlænger
    contract_end_date fyrer selvstændigt. Er den ikke landet, er tier
    stadig "expired" og beslutningen stadig "tilbyd" — og uden denne
    flade ville medlemmet se gaten med tilbuddet IGEN, som om de ikke
    havde betalt. Et tryk mere giver en ny checkout-session, og
    webhookens idempotens (på session.id) forhindrer ikke at der bliver
    betalt to gange. Fladen er samme ydre form som MembershipExpiredGate
    og CompanyLinkFailedGate: standalone Hb uden skal.

    To tilstande: `venter` (siden prøver selv igen med få sekunders
    mellemrum) og `overskredet` (den øvre grænse er nået — betalingen er
    modtaget, adgangen åbner snarest, og der er en vej til at skrive til
    os). Aldrig en uendelig venten uden udgang. */
export default function FornyelseKvittering({ overskredet }: { overskredet: boolean }) {
  const { profile, signOut } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0] || null;

  return (
    <div className="theme-hjemmebane min-h-screen bg-hb-paper font-body text-hb-ink antialiased px-4 py-12">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <p className="text-sm uppercase tracking-widest text-hb-rust font-medium">
            The Boardroom
          </p>
          <h1 className="font-editorial text-3xl md:text-4xl font-medium leading-tight text-hb-ink">
            {firstName ? `Tak, ${firstName} — vi glæder os til et år mere` : "Tak — vi glæder os til et år mere"}
          </h1>
          <p className="text-hb-ink-soft max-w-md mx-auto">
            Betalingen er modtaget. Din adgang åbner om et øjeblik — siden
            opdaterer sig selv, du behøver ikke gøre noget.
          </p>
        </div>

        <HbCard className="p-5">
          {overskredet ? (
            <div className="space-y-3">
              <h2 className="font-editorial text-lg font-medium text-hb-ink">
                Adgangen åbner snarest
              </h2>
              <p className="text-sm text-hb-ink-soft">
                Betalingen er gået igennem, men det tager lidt længere end
                normalt at åbne adgangen. Prøv igen om lidt — eller skriv til
                os, så åbner vi den i hånden.
              </p>
              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <HbButton
                  variant="primary"
                  onClick={() => window.location.reload()}
                  className="w-full sm:flex-1"
                >
                  <RefreshCw className="h-4 w-4 shrink-0" />
                  Prøv igen
                </HbButton>
                <HbButton
                  variant="secondary"
                  onClick={() => {
                    window.location.href = `mailto:jonas@topix.dk?subject=${encodeURIComponent("The Boardroom — min fornyelse")}`;
                  }}
                  className="w-full sm:flex-1"
                >
                  Skriv til os
                  <ArrowRight className="h-4 w-4 shrink-0 text-hb-evergreen" />
                </HbButton>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 shrink-0 text-hb-ink-soft animate-spin" />
              <p className="text-sm text-hb-ink-soft">Vi åbner din adgang…</p>
            </div>
          )}
        </HbCard>

        <p className="text-center text-sm text-hb-ink-soft">
          Spørgsmål? Skriv til{" "}
          <a href="mailto:jonas@topix.dk" className="text-hb-evergreen hover:underline">
            jonas@topix.dk
          </a>
          <span className="mx-2">·</span>
          <HbButton variant="link" onClick={() => signOut()} className="text-sm">
            Log ud
          </HbButton>
        </p>
      </div>
    </div>
  );
}
