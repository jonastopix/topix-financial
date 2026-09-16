import "@/styles/hjemmebane.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HB_EYEBROW, HB_H1, HB_RAMME } from "@/components/hjemmebane/hbFormKlasser";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";

/**
 * /auth?invite=… åbnet i en browser der allerede er logget ind (16/9 2026,
 * recon-signup-daarlige-dage.md scenarie 4, indgangen-overhaling.md §7.3).
 * Før sendte AuthRoute ordløst til / og tabte tokenet. Nu siger skærmen
 * hvem der er logget ind, og giver to veje: log ud og BLIV på samme URL
 * (useAuth ser SIGNED_OUT → user null → AuthRoute tegner Auth med tokenet),
 * eller fortsæt som den indloggede. Samme ramme som Auth (HB_RAMME +
 * useHbDokumentGrund, hbFuldhoejde.guard). Hooks i topblokken.
 */
export default function InvitationTilLoggetInd({ email }: { email: string }) {
  const navigate = useNavigate();
  const [loggerUd, setLoggerUd] = useState(false);
  useHbDokumentGrund();

  const logUdOgBliv = async () => {
    setLoggerUd(true);
    await supabase.auth.signOut();
    // Ingen navigation: URL'en med tokenet bevares, og AuthRoute skifter selv.
  };

  return (
    <div className={HB_RAMME}>
      <div className="mx-auto max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <p className={HB_EYEBROW}>The Boardroom</p>
          <h1 className={HB_H1}>Du er logget ind som {email}.</h1>
          <p className="text-hb-ink-soft">Invitationslinket skal åbnes af den der er inviteret.</p>
        </div>
        <HbCard className="p-6 md:p-8">
          <div className="flex flex-col gap-3">
            <HbButton type="button" onClick={logUdOgBliv} disabled={loggerUd} className="w-full">
              {loggerUd ? "Vent..." : "Log ud og brug invitationen"}
            </HbButton>
            <HbButton type="button" variant="secondary" onClick={() => navigate("/", { replace: true })} disabled={loggerUd} className="w-full">
              Fortsæt som {email}
            </HbButton>
          </div>
        </HbCard>
      </div>
    </div>
  );
}
