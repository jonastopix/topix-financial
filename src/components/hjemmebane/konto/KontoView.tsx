import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, LogOut, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getPasswordScore } from "@/components/PasswordStrengthIndicator";
import { initialer, loginMetoder, styrkeOrd, tjekAdgangskode, validerNavn } from "@/lib/konto";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbTag } from "../HbTag";
import { HbField, HbInput } from "../admin/HbField";

/**
 * /konto — KONTOEN i Hjemmebane (Jonas 9/9: «Indstillinger er også gammelt
 * design. Det skal konverteres og gøres mere lækkert og intuitivt.»).
 *
 * Kun kontoen: navn og billede, e-mail, adgangskode, login-metoder, log ud.
 * Ens for alle roller — det er den eneste del rådgiveren har brug for.
 * /settings svarede på fire spørgsmål (analyse-settings.md: konto,
 * netværksprofil, virksomhed, notifikationer); de tre andre BLIVER dér
 * indtil de tages hver for sig. Kontodelene er fjernet fra /settings, så
 * navn og adgangskode kun har ét hjem.
 *
 * E-MAIL (besluttet 9/9): kan ikke ændres her. Supabase Auths e-mailskifte
 * kræver bekræftelse til BÅDE gammel og ny adresse (secure email change)
 * og egne mailskabeloner for det — en PR for sig. Fladen siger det, i
 * stedet for et felt der ikke virker.
 *
 * LOGIN-METODER er visning: Supabase-klienten kan ikke koble Google på en
 * eksisterende konto herfra uden manual linking slået til i projektet.
 * Teksten siger hvor det sker (login-siden med samme e-mail) og lader ikke
 * som om der er en knap.
 *
 * Udtrykket er husets (HbSection/HbCard/HbField/HbButton; rust kun til det
 * der er galt, evergreen til handlinger). Skrivningerne er de samme kald
 * som Settings brugte (profiles.full_name/avatar_url, storage «avatars»,
 * auth.updateUser) — flyttet, ikke omskrevet. De rene dele (regler, ord)
 * bor i src/lib/konto.ts.
 */

const Kort = ({ titel, children }: { titel: string; children: React.ReactNode }) => (
  <HbCard className="p-5">
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">{titel}</p>
    <div className="mt-4">{children}</div>
  </HbCard>
);

export const KontoView = () => {
  const { user, profile, isAdvisor, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();

  // Navn + billede
  const [navn, setNavn] = useState("");
  const [gemmerNavn, setGemmerNavn] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploader, setUploader] = useState(false);
  const filRef = useRef<HTMLInputElement>(null);
  // Adgangskode
  const [nuvaerende, setNuvaerende] = useState("");
  const [ny, setNy] = useState("");
  const [gentag, setGentag] = useState("");
  const [gemmerKode, setGemmerKode] = useState(false);

  useEffect(() => {
    if (profile) {
      setNavn(profile.full_name || "");
      setAvatarUrl(profile.avatar_url || null);
    }
  }, [profile]);

  const gemNavn = async () => {
    if (!user) return;
    const v = validerNavn(navn);
    if (v.ok === false) { toast.error(v.fejl); return; }
    setGemmerNavn(true);
    const { data, error } = await supabase.from("profiles").update({ full_name: v.navn }).eq("user_id", user.id).select("user_id");
    if (error || !data || data.length === 0) {
      toast.error("Navnet blev ikke gemt", { description: error?.message ?? "Skrivningen ramte nul rækker." });
    } else {
      setNavn(v.navn);
      await refreshProfile();
      toast.success("Navn gemt");
    }
    setGemmerNavn(false);
  };

  // Samme bucket, sti og profiles-skrivning som Settings.handleAvatarUpload (:249-297).
  const uploadBillede = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fil = e.target.files?.[0];
    if (!fil || !user) return;
    if (!fil.type.startsWith("image/")) { toast.error("Vælg en billedfil"); return; }
    if (fil.size > 2 * 1024 * 1024) { toast.error("Billedet må højst være 2 MB"); return; }
    setUploader(true);
    const sti = `${user.id}/avatar`;
    const { error: upFejl } = await supabase.storage.from("avatars").upload(sti, fil, { upsert: true, contentType: fil.type });
    if (upFejl) { toast.error("Billedet kunne ikke uploades"); setUploader(false); return; }
    const renUrl = supabase.storage.from("avatars").getPublicUrl(sti).data.publicUrl;
    const { error: gemFejl } = await supabase.from("profiles").update({ avatar_url: renUrl }).eq("user_id", user.id);
    if (gemFejl) toast.error("Billedet blev ikke gemt på profilen");
    else { setAvatarUrl(`${renUrl}?t=${Date.now()}`); await refreshProfile(); toast.success("Billede opdateret"); }
    setUploader(false);
    if (filRef.current) filRef.current.value = "";
  };

  const fjernBillede = async () => {
    if (!user) return;
    setUploader(true);
    const { error: sletFejl } = await supabase.storage.from("avatars").remove([`${user.id}/avatar`]);
    if (sletFejl) { toast.error("Billedet kunne ikke fjernes"); setUploader(false); return; }
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", user.id);
    if (error) toast.error("Profilen blev ikke opdateret");
    else { setAvatarUrl(null); await refreshProfile(); toast.success("Billede fjernet"); }
    setUploader(false);
  };

  // Samme to auth-kald som Settings.handleChangePassword (:395-435).
  const score = getPasswordScore(ny);
  const skiftKode = async () => {
    const t = tjekAdgangskode({ nuvaerende, ny, gentag, score });
    if (t.ok === false) { toast.error(t.fejl); return; }
    setGemmerKode(true);
    const { error: loginFejl } = await supabase.auth.signInWithPassword({ email: user?.email || "", password: nuvaerende });
    if (loginFejl) {
      toast.error(loginFejl.message.includes("Invalid") ? "Den nuværende adgangskode er forkert" : "Adgangskoden kunne ikke bekræftes — prøv igen");
      setGemmerKode(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: ny });
    if (error) toast.error(error.message);
    else { toast.success("Adgangskode opdateret"); setNuvaerende(""); setNy(""); setGentag(""); }
    setGemmerKode(false);
  };

  const metoder = loginMetoder(user?.identities);

  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Konto</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Din konto</h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          Navn, adgangskode og login.
          {!isAdvisor && (
            <>
              {" "}Virksomheden, din profil i netværket og notifikationerne står under{" "}
              <Link to="/settings" className="text-hb-evergreen underline-offset-4 hover:underline">Indstillinger</Link>.
            </>
          )}
        </p>
      </section>

      <HbSection eyebrow="Dig" hairline className="mt-10 max-w-3xl">
        <div className="grid gap-4 md:grid-cols-2">
          <Kort titel="Navn og billede">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-hb-line bg-hb-sage">
                {avatarUrl ? <img src={avatarUrl} alt="Profilbillede" className="h-full w-full object-cover" /> : <span className="text-lg font-medium text-hb-ink">{initialer(navn || user?.email || "")}</span>}
              </div>
              <div>
                <input ref={filRef} type="file" accept="image/*" onChange={uploadBillede} className="hidden" />
                <div className="flex flex-wrap items-center gap-2">
                  <HbButton type="button" variant="secondary" className="h-9 gap-1.5 px-4 text-sm" onClick={() => filRef.current?.click()} disabled={uploader}>
                    {uploader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {avatarUrl ? "Skift billede" : "Upload billede"}
                  </HbButton>
                  {avatarUrl && (
                    <button type="button" onClick={fjernBillede} disabled={uploader} className="inline-flex items-center gap-1 text-sm text-hb-ink-soft underline-offset-4 hover:text-hb-rust hover:underline">
                      <Trash2 className="h-3.5 w-3.5" /> Fjern
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-hb-ink-soft">PNG eller JPG, højst 2 MB.</p>
              </div>
            </div>
            <div className="mt-5">
              <HbField label="Fuldt navn" htmlFor="konto-navn">
                <HbInput id="konto-navn" value={navn} onChange={(e) => setNavn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") gemNavn(); }} autoComplete="name" />
              </HbField>
              <HbButton type="button" className="mt-3 h-10 px-5" onClick={gemNavn} disabled={gemmerNavn || !navn.trim()}>
                {gemmerNavn ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Gem navn
              </HbButton>
            </div>
          </Kort>

          <Kort titel="E-mail">
            <p className="text-[15px] text-hb-ink">{user?.email}</p>
            <p className="mt-2 text-sm leading-relaxed text-hb-ink-soft">
              E-mailen er din nøgle til kontoen og kan ikke ændres her endnu. Skal den skiftes, så skriv til os i chatten — vi flytter kontoen og bekræfter med dig.
            </p>
          </Kort>
        </div>
      </HbSection>

      <HbSection eyebrow="Login" hairline className="mt-12 max-w-3xl">
        <div className="grid gap-4 md:grid-cols-2">
          <Kort titel="Adgangskode">
            <div className="space-y-3">
              <HbField label="Nuværende adgangskode" htmlFor="konto-nu">
                <HbInput id="konto-nu" type="password" value={nuvaerende} onChange={(e) => setNuvaerende(e.target.value)} autoComplete="current-password" />
              </HbField>
              <HbField label="Ny adgangskode" htmlFor="konto-ny">
                <HbInput id="konto-ny" type="password" value={ny} onChange={(e) => setNy(e.target.value)} autoComplete="new-password" />
              </HbField>
              {ny && (
                <div>
                  <div className="flex items-center justify-between text-xs text-hb-ink-soft">
                    <span>Styrke</span>
                    <span className={cn(score < 2 ? "text-hb-rust" : "text-hb-ink")}>{styrkeOrd(score)}</span>
                  </div>
                  <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-hb-line">
                    <div className={cn("h-full rounded-full", score < 2 ? "bg-hb-rust" : "bg-hb-evergreen")} style={{ width: `${(score / 4) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-hb-ink-soft">Mindst 8 tegn. Et stort bogstav, et tal og et specialtegn gør den stærkere.</p>
                </div>
              )}
              <HbField label="Gentag ny adgangskode" htmlFor="konto-gentag" error={gentag && ny !== gentag ? "De to adgangskoder er ikke ens." : undefined}>
                <HbInput id="konto-gentag" type="password" value={gentag} onChange={(e) => setGentag(e.target.value)} autoComplete="new-password" onKeyDown={(e) => { if (e.key === "Enter") skiftKode(); }} />
              </HbField>
            </div>
            <HbButton type="button" className="mt-4 h-10 px-5" onClick={skiftKode} disabled={gemmerKode || !nuvaerende || !ny || !gentag}>
              {gemmerKode ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Opdater adgangskode
            </HbButton>
          </Kort>

          <Kort titel="Login-metoder">
            <ul className="divide-y divide-hb-line text-sm">
              <li className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="block text-hb-ink">E-mail og adgangskode</span>
                  <span className="block text-xs text-hb-ink-soft">{user?.email}</span>
                </span>
                <HbTag className="px-2 py-0.5 text-[11px]">{metoder.harAdgangskode ? "Aktiv" : "Ikke i brug"}</HbTag>
              </li>
              <li className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="block text-hb-ink">Google</span>
                  <span className="block text-xs text-hb-ink-soft">{metoder.harGoogle ? metoder.googleEmail ?? "Tilknyttet" : "Ikke tilknyttet"}</span>
                </span>
                <HbTag className={cn("px-2 py-0.5 text-[11px]", !metoder.harGoogle && "bg-hb-paper text-hb-ink-soft border border-hb-line")}>{metoder.harGoogle ? "Aktiv" : "Ikke tilknyttet"}</HbTag>
              </li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-hb-ink-soft">
              Der er ingen knap til at koble Google på her. Google kobles på ved at logge ind med Google på login-siden med samme e-mail som kontoen — så genkender vi dig.
            </p>
          </Kort>
        </div>
      </HbSection>

      <HbSection eyebrow="Session" hairline className="mt-12 max-w-3xl">
        <HbCard className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-hb-ink-soft">Logget ind som <span className="text-hb-ink">{user?.email}</span></p>
          <HbButton type="button" variant="secondary" className="h-10 gap-2 px-5" onClick={async () => { await signOut(); navigate("/auth?force=true", { replace: true }); }}>
            <LogOut className="h-4 w-4" /> Log ud
          </HbButton>
        </HbCard>
      </HbSection>
    </div>
  );
};
