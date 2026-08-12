/** Upload af community-billeder til den private bucket — ren logik,
    ingen React. Returnerer STIEN (ikke en URL): dokumentet gemmer stier,
    og URL'er signeres først ved visning (get-community-billed-url bag
    adgangsdommen maa_se_community_billede). */

import { supabase } from "@/integrations/supabase/client";

export const MAKS_BILLED_BYTES = 10 * 1024 * 1024;
export const TILLADTE_BILLED_TYPER = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Endelsen udledes af MIME-typen via dette eksplicitte opslag — ALDRIG
    af filnavnet, som er brugerdata og kan hedde hvad som helst. */
const ENDELSE_AF_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadCommunityBillede(fil: File, brugerId: string): Promise<string> {
  /* Bucketen håndhæver ALLEREDE begge grænser server-side
     (20260812100000: file_size_limit 10 MB + MIME-hvidliste) —
     klient-tjekket her er for at give en pæn dansk besked, ikke for at
     beskytte. */
  if (fil.size > MAKS_BILLED_BYTES) {
    throw new Error("Billedet er for stort — maks. 10 MB.");
  }
  const endelse = ENDELSE_AF_TYPE[fil.type];
  if (!TILLADTE_BILLED_TYPER.includes(fil.type) || !endelse) {
    throw new Error("Filtypen understøttes ikke — brug JPEG, PNG, WebP eller GIF.");
  }

  /* Mappen SKAL være brugerens uuid: bucketens INSERT-policy kræver
     (storage.foldername(name))[1] = auth.uid(), og motorens
     BILLED_STI_MOENSTER (communityDokument.ts) kræver præcis formen
     uuid/filnavn.endelse — ellers kasseres noden ved visning. */
  const sti = `${brugerId}/${crypto.randomUUID()}.${endelse}`;

  const { error } = await supabase.storage
    .from("community-billeder")
    .upload(sti, fil, { contentType: fil.type, upsert: false });

  if (error) {
    throw new Error(`Billedet kunne ikke uploades: ${error.message}`);
  }
  return sti;
}
