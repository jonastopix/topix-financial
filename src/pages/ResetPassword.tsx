import "@/styles/hjemmebane.css";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PasswordStrengthIndicator, { getPasswordScore } from "@/components/PasswordStrengthIndicator";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbSpinner } from "@/components/hjemmebane/HbSpinner";
import { HB_EYEBROW, HB_H1, HB_INPUT, HB_LABEL, HB_RAMME } from "@/components/hjemmebane/hbFormKlasser";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";

/* /reset-password — siden Supabases nulstil-mail fører til. Hjemmebane
   (indgangen-overhaling §7.5, sidste del af trin 10-12), samme udtryk som
   Auth.tsx' fem tilstande. ADFÆRD ORDRET SOM FØR: sessionen genoprettes
   fra URL-hashen (recovery-token) via getSession + onAuthStateChange
   (PASSWORD_RECOVERY eller SIGNED_IN); indtil da spinner; uden session
   «Ugyldigt eller udløbet link» med vej til /auth; ellers formularen —
   styrke < 2 toaster «Vælg en stærkere adgangskode», updateUser toaster
   Supabases fejl eller «Adgangskode opdateret!» og navigerer til «/». */
const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const navigate = useNavigate();
  // Lærredet bag HB_RAMME er papir mens siden er mountet (4/9) — som Auth.
  useHbDokumentGrund();

  useEffect(() => {
    // First restore any session from the URL hash (recovery token)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setHasSession(true);
      }
      setIsReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasSession(true);
        setIsReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (getPasswordScore(password) < 2) {
      toast.error("Vælg en stærkere adgangskode");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Adgangskode opdateret!");
      navigate("/");
    }
    setLoading(false);
  };

  if (!isReady) {
    return <HbSpinner />;
  }

  if (!hasSession) {
    return (
      <div className={HB_RAMME}>
        <div className="mx-auto max-w-md space-y-8">
          <div className="space-y-3 text-center">
            <p className={HB_EYEBROW}>The Boardroom</p>
            <h1 className={HB_H1}>Linket virker ikke længere</h1>
            <p className="text-hb-ink-soft">
              Linket til at nulstille din adgangskode er udløbet eller allerede brugt. Bed om et nyt fra login.
            </p>
          </div>
          <div className="text-center">
            <HbButton variant="secondary" onClick={() => navigate("/auth")}>
              Gå til login
            </HbButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={HB_RAMME}>
      <div className="mx-auto max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <p className={HB_EYEBROW}>The Boardroom</p>
          <h1 className={HB_H1}>Ny adgangskode</h1>
          <p className="text-hb-ink-soft">Vælg en ny adgangskode, så er du inde igen.</p>
        </div>
        <HbCard className="p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={HB_LABEL}>Ny adgangskode</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={HB_INPUT}
                placeholder="••••••••"
              />
              <div className="mt-3">
                <PasswordStrengthIndicator password={password} />
              </div>
            </div>
            <HbButton type="submit" disabled={loading} className="w-full">
              {loading ? "Opdaterer..." : "Opdater adgangskode"}
            </HbButton>
          </form>
        </HbCard>
      </div>
    </div>
  );
};

export default ResetPassword;
