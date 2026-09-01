import "@/styles/hjemmebane.css";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";

/** Forsiden når koblingen konto → virksomhed FEJLEDE (useAuth:
    companyResolution === "failed"). Før stod medlemmet på et
    DashboardSkeleton uden timeout og uden besked
    (docs/indgangsfladen-design.md §5). Fladen siger hvad der skete,
    uden teknik, og giver to veje: prøv igen (genindlæs — useAuth kalder
    process-pending-invitation ved hvert load, så det er et rigtigt nyt
    forsøg) og skriv til os. Samme ydre form som MembershipExpiredGate:
    standalone Hb-flade uden skal, for der findes ingen virksomhed at
    tegne en skal for. */
export default function CompanyLinkFailedGate() {
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
            {firstName ? `Vi mangler et led, ${firstName}` : "Vi mangler et led"}
          </h1>
          <p className="text-hb-ink-soft max-w-md mx-auto">
            Der gik noget galt, da vi skulle koble din konto til din
            virksomhed. Vi er på den — og du er velkommen til at skrive til
            os, så hjælper vi dig videre.
          </p>
        </div>

        <HbCard className="p-5">
          <div className="space-y-3">
            <h2 className="font-editorial text-lg font-medium text-hb-ink">
              Prøv igen
            </h2>
            <p className="text-sm text-hb-ink-soft">
              Nogle gange er det nok at indlæse siden igen. Virker det ikke,
              så skriv til os — så ordner vi det i hånden.
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
                  window.location.href = `mailto:jonas@topix.dk?subject=${encodeURIComponent("The Boardroom — min konto")}`;
                }}
                className="w-full sm:flex-1"
              >
                Skriv til os
                <ArrowRight className="h-4 w-4 shrink-0 text-hb-evergreen" />
              </HbButton>
            </div>
          </div>
        </HbCard>

        <p className="text-center text-sm text-hb-ink-soft">
          Spørgsmål? Skriv til{" "}
          <a href="mailto:jonas@topix.dk" className="text-hb-evergreen hover:underline">
            jonas@topix.dk
          </a>
          <span className="mx-2">·</span>
          <HbButton variant="link" onClick={() => signOut()} className="text-sm">
            Forkert konto? Log ud
          </HbButton>
        </p>
      </div>
    </div>
  );
}
