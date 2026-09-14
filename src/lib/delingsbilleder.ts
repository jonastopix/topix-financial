/**
 * src/lib/delingsbilleder.ts
 *
 * Kreativens to billeder, så de er der efter refresh (14/9, Jonas'
 * beslutning efter recon-kreativ-persistens.md):
 *
 *   LOGOET — vej (a): virksomhedens logo, gemt i den eksisterende bucket
 *   company-logos på `${company.id}/logo` og skrevet til companies.logo_url,
 *   ordret som IndstillingerView.handleLogoUpload (:212-226). Det er det
 *   samme logo alle steder — profil, sidebar, Indstillinger, kreativ.
 *
 *   PORTRÆTTET — vej (b): et nyt sted KUN til kreativen. En delingsside må
 *   ikke ændre hendes profilbillede. Bucket `deling-portraetter` (privat,
 *   migration 20260914170000), sti `${user.id}/portraet` (upsert). Stien er
 *   deterministisk, så intet skal huskes i en kolonne: fladen lister sin
 *   egen mappe og signerer stien ved visning. Signerede URL'er udløber
 *   (1 time); stien gør ikke.
 *
 * GRÆNSERNE er avatar-uploadens (KontoView.tsx:94-95): image/* og 2 MB —
 * ingen ny grænse. Bucketen håndhæver de samme.
 *
 * OPLØSNINGEN: kreativen viser portrættet i en slot på op til 310 px
 * (delingskreativ.ts, 3a kvadrat) og PNG'en er 1080 px, så et
 * billede under 310 px opskaleres og bliver uskarpt. Målt 14/9: to af otte
 * profilbilleder i avatars er under. Filen måles i browseren FØR upload
 * (maalBillede) og der SIGES noget — ingen afvisning: hun må gerne bruge
 * et lille billede.
 *
 * De rene domme (tjekBilledfil, oploesningsBesked, stierne, teksterne)
 * står øverst og er testet i __tests__/delingsbilleder.test.ts; IO'en
 * nederst går gennem supabase-klienten som memberProfile.ts.
 */

import { supabase } from "@/integrations/supabase/client";
import { medVersion } from "./billedVersion";

export const PORTRAET_BUCKET = "deling-portraetter";
export const PORTRAET_FILNAVN = "portraet";
export const LOGO_BUCKET = "company-logos";
/** Som avatar-uploaden: 2 MB. */
export const MAKS_BYTES = 2 * 1024 * 1024;
/** Signerede URL'er lever en time — kreativen henter en ny ved næste besøg. */
export const SIGNERET_URL_SEKUNDER = 60 * 60;
/**
 * Den STØRSTE slot portrættet vises i: 3a «Tre på række» i kvadrat, ring
 * 340 med slot 310 (delingskreativ.ts, `slot: 310`; liggende 226,
 * «Optagelsen» 304). Egen konstant, ikke import: måltabellerne i
 * delingskreativ.ts bygges om lige nu, og oplysningen må ikke vælte med dem.
 * Kildeværnet i __tests__/delingsbilleder.test.ts låser tallet mod filen.
 */
export const PORTRAET_SLOT_PX = 310;

export const TEKST = {
  /** Samme dom som KontoView:94, med husets ordvalg på /deling. */
  ikkeBillede: "Vælg en billedfil — jpg, png eller webp.",
  /** Ordret KontoView:95. */
  forStor: "Billedet må højst være 2 MB",
  /** Står FØR hun trykker — logoet er virksomhedens, ikke kun kreativens. */
  logoAdvarsel: "Det logo du lægger her, bliver virksomhedens logo: det gemmes under Indstillinger og vises på jeres profil — ikke kun på kreativen.",
  logoGemt: "Logoet er gemt som virksomhedens logo.",
  logoFejlUpload: "Kunne ikke uploade logo",
  logoFejlGem: "Kunne ikke gemme logo-URL",
  portraetHjaelp: "Portrættet gemmes kun til kreativen — dit profilbillede under Konto rører vi ikke.",
  portraetGemt: "Portrættet er gemt til kreativen — ikke som dit profilbillede.",
  portraetFejlUpload: "Portrættet kunne ikke uploades",
  portraetFejlFjern: "Portrættet kunne ikke fjernes",
} as const;

export function portraetSti(userId: string): string {
  return `${userId}/${PORTRAET_FILNAVN}`;
}

/** Ordret IndstillingerView.tsx:218 — `${company.id}/logo`. */
export function logoSti(companyId: string): string {
  return `${companyId}/logo`;
}

export type FilDom = { ok: true } | { ok: false; fejl: string };

/** Avatar-uploadens to tjek (KontoView.tsx:94-95), i samme rækkefølge: type, så størrelse. */
export function tjekBilledfil(f: { type: string; size: number }): FilDom {
  if (!f.type.startsWith("image/")) return { ok: false, fejl: TEKST.ikkeBillede };
  if (f.size > MAKS_BYTES) return { ok: false, fejl: TEKST.forStor };
  return { ok: true };
}

export interface BilledMaal {
  bredde: number;
  hoejde: number;
}

/**
 * Oplysning, ikke afvisning: null når billedet er stort nok (den korteste
 * side mindst slot'en — object-fit: cover beskærer den lange), ellers én
 * sætning der siger målet, slot'en og at hun må bruge det alligevel.
 * Kunne målet ikke læses (null), siges intet.
 */
export function oploesningsBesked(maal: BilledMaal | null, slotPx: number = PORTRAET_SLOT_PX): string | null {
  if (!maal) return null;
  const korteste = Math.min(maal.bredde, maal.hoejde);
  if (!Number.isFinite(korteste) || korteste <= 0 || korteste >= slotPx) return null;
  return `Billedet er ${maal.bredde}×${maal.hoejde} px. Kreativen viser det i ${slotPx} px, så det bliver uskarpt — du må gerne bruge det alligevel.`;
}

// ── IO — browseren ────────────────────────────────────────────────────────

/** Måler filen i browseren før upload. null når den ikke kan læses som billede (siger så intet). */
export async function maalBillede(fil: Blob): Promise<BilledMaal | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bm = await createImageBitmap(fil);
      const maal = { bredde: bm.width, hoejde: bm.height };
      bm.close?.();
      return maal;
    }
    return await new Promise<BilledMaal | null>((resolve) => {
      const url = URL.createObjectURL(fil);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve({ bredde: img.naturalWidth, hoejde: img.naturalHeight }); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  } catch {
    return null;
  }
}

// ── IO — storage og databasen ─────────────────────────────────────────────

/**
 * Vej (a) — ordret IndstillingerView.handleLogoUpload (:217-222): samme
 * bucket, samme sti, samme upsert, samme public-URL, samme skrivning til
 * companies.logo_url. Kaster med fladens egne fejltekster; kalderen viser.
 * URL'en gemmes MED version (billedVersion.ts, 14/9): samme sti giver samme
 * public-URL, og uden version så kreativen ingen ændring ved andet valg —
 * hverken React (samme streng) eller browseren (max-age=3600). Returnerer
 * den gemte, versionerede URL.
 */
export async function uploadVirksomhedslogo(companyId: string, file: File): Promise<string> {
  const filePath = logoSti(companyId);
  const { error: uploadError } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(TEKST.logoFejlUpload);
  const cleanUrl = medVersion(supabase.storage.from(LOGO_BUCKET).getPublicUrl(filePath).data.publicUrl);
  const { error: updateError } = await supabase.from("companies").update({ logo_url: cleanUrl }).eq("id", companyId);
  if (updateError) throw new Error(TEKST.logoFejlGem);
  return cleanUrl;
}

/** Signerer stien — den eneste læsevej i en privat bucket. */
async function signerPortraet(userId: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PORTRAET_BUCKET).createSignedUrl(portraetSti(userId), SIGNERET_URL_SEKUNDER);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Portrættet kunne ikke signeres");
  return data.signedUrl;
}

/**
 * Vej (b) — upload til hendes egen mappe (RLS: kun {uid}/...), upsert på den
 * faste sti. Intet skrives til profiles. Returnerer en signeret URL til visning.
 */
export async function uploadPortraet(userId: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(PORTRAET_BUCKET).upload(portraetSti(userId), file, { upsert: true, contentType: file.type });
  if (error) throw new Error(TEKST.portraetFejlUpload);
  return signerPortraet(userId);
}

/**
 * Efter refresh: findes objektet i hendes mappe? Stien er deterministisk,
 * så der er ingen kolonne at læse — mappen listes (SELECT-policyen giver kun
 * egen mappe), og findes `portraet`, signeres den. null = intet gemt endnu.
 * Fejl kaster (kraevRaekker-ånden: en tom mappe og en fejlet listning må
 * ikke ligne hinanden).
 */
export async function hentPortraetUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PORTRAET_BUCKET).list(userId);
  if (error) throw new Error(error.message);
  const findes = (data ?? []).some((o) => o.name === PORTRAET_FILNAVN);
  if (!findes) return null;
  return signerPortraet(userId);
}

export async function fjernPortraet(userId: string): Promise<void> {
  const { error } = await supabase.storage.from(PORTRAET_BUCKET).remove([portraetSti(userId)]);
  if (error) throw new Error(TEKST.portraetFejlFjern);
}
