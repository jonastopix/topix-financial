import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { medVersion } from "@/lib/billedVersion";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { HbAvatar } from "./HbAvatar";
import { HbButton } from "./HbButton";

/** Teksten i profil-fanen (PR 4b, Jonas 17/9 «Ja det er i orden») — samme ord i fladen og værnet. */
export const PROFIL_FOTO_TEKST = "Et foto gør det lettere for de andre at genkende dig";

/**
 * Profilfotoet ét sted (PR 4b): samme bucket, sti og profiles-skrivning som
 * /konto (KontoView.uploadBillede — «avatars», {uid}/avatar, upsert,
 * versionen i den gemte URL via billedVersion) — flyttet, ikke omskrevet.
 * Første bruger: «Din profil i netværket» (/settings?fane=profil), som
 * tjeklistens «Din profil» fører til — fotoet står ØVERST, fordi kun 6 af 30
 * medlemmer har et (Jonas' SQL 17/9 13:01). /konto bruger samme komponent.
 * Fotoet er et KRAV (17/9, Jonas ordret «C»): «færdig» i tjeklisten er
 * ask_me_about OG avatar_url (profilUdfyldt.ts — begge citater i filhovedet).
 */
export const ProfilFotoFelt = ({ variant = "profil", className }: { variant?: "profil" | "konto"; className?: string }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploader, setUploader] = useState(false);
  const filRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setAvatarUrl(profile?.avatar_url || null); }, [profile?.avatar_url]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fil = e.target.files?.[0];
    if (!fil || !user) return;
    if (!fil.type.startsWith("image/")) { toast.error("Vælg en billedfil"); return; }
    if (fil.size > 2 * 1024 * 1024) { toast.error("Billedet må højst være 2 MB"); return; }
    setUploader(true);
    const sti = `${user.id}/avatar`;
    const { error: upFejl } = await supabase.storage.from("avatars").upload(sti, fil, { upsert: true, contentType: fil.type });
    if (upFejl) { toast.error("Billedet kunne ikke uploades"); setUploader(false); return; }
    const renUrl = medVersion(supabase.storage.from("avatars").getPublicUrl(sti).data.publicUrl);
    const { error: gemFejl } = await supabase.from("profiles").update({ avatar_url: renUrl }).eq("user_id", user.id);
    if (gemFejl) toast.error("Billedet blev ikke gemt på profilen");
    else { setAvatarUrl(renUrl); await refreshProfile(); toast.success("Billede opdateret"); }
    setUploader(false);
    if (filRef.current) filRef.current.value = "";
  };
  const fjern = async () => {
    if (!user) return;
    setUploader(true);
    const { error: sletFejl } = await supabase.storage.from("avatars").remove([`${user.id}/avatar`]);
    if (sletFejl) { toast.error("Billedet kunne ikke fjernes"); setUploader(false); return; }
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", user.id);
    if (error) toast.error("Profilen blev ikke opdateret");
    else { setAvatarUrl(null); await refreshProfile(); toast.success("Billede fjernet"); }
    setUploader(false);
  };

  return (
    <div className={cn("flex items-center gap-4", className)} data-profil-foto={avatarUrl ? "billede" : "intet"}>
      <HbAvatar navn={profile?.full_name ?? user?.email ?? null} avatarUrl={avatarUrl} stoerrelse="lg" />
      <div>
        {variant === "profil" && <p className="text-sm font-medium text-hb-ink">{PROFIL_FOTO_TEKST}</p>}
        <input ref={filRef} type="file" accept="image/*" onChange={upload} className="hidden" />
        <div className={cn("flex flex-wrap items-center gap-2", variant === "profil" && "mt-2")}>
          <HbButton type="button" variant="secondary" className="h-9 gap-1.5 px-4 text-sm" onClick={() => filRef.current?.click()} disabled={uploader}>
            {uploader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {avatarUrl ? "Skift billede" : "Upload billede"}
          </HbButton>
          {avatarUrl && (
            <button type="button" onClick={fjern} disabled={uploader} className="inline-flex items-center gap-1 text-sm text-hb-ink-soft underline-offset-4 hover:text-hb-rust hover:underline">
              <Trash2 className="h-3.5 w-3.5" /> Fjern
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-hb-ink-soft">PNG eller JPG, højst 2 MB.</p>
      </div>
    </div>
  );
};
