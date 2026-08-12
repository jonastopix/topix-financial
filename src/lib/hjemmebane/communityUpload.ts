/** Upload af community-billeder OG -filer til de private buckets — ren
    logik, ingen React. Returnerer STIER (ikke URL'er): dokumentet gemmer
    stier, og URL'er signeres først ved visning (get-community-billed-url/
    get-community-fil-url bag adgangsdommene). */

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

export const MAKS_FIL_BYTES = 25 * 1024 * 1024;
export const TILLADTE_FIL_TYPER = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/xml",
  "application/xml",
];

/** Endelsen udledes af MIME-typen — ALDRIG af filnavnet (brugerdata). */
const FIL_ENDELSE_AF_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/xml": "xml",
  "application/xml": "xml",
};

export async function uploadCommunityFil(
  fil: File,
  brugerId: string,
): Promise<{ sti: string; navn: string }> {
  /* Bucketen håndhæver ALLEREDE begge grænser server-side
     (20260812130000: file_size_limit 25 MB + MIME-hvidliste) —
     klient-tjekket her er for at give en pæn dansk besked, ikke for at
     beskytte. */
  if (fil.size > MAKS_FIL_BYTES) {
    throw new Error("Filen er for stor — maks. 25 MB.");
  }
  const endelse = FIL_ENDELSE_AF_TYPE[fil.type];
  if (!TILLADTE_FIL_TYPER.includes(fil.type) || !endelse) {
    throw new Error("Filtypen understøttes ikke — brug PDF, Excel, Word eller XML.");
  }

  /* Samme sti-mønster som billeder: brugerens uuid som mappe (bucketens
     INSERT-policy kræver det) + tilfældigt uuid-filnavn — matcher
     motorens FIL_STI_MOENSTER, ellers kasseres noden ved visning. */
  const sti = `${brugerId}/${crypto.randomUUID()}.${endelse}`;

  const { error } = await supabase.storage
    .from("community-filer")
    .upload(sti, fil, { contentType: fil.type, upsert: false });

  if (error) {
    throw new Error(`Filen kunne ikke uploades: ${error.message}`);
  }

  /* Navnet (fil.name) er brugerdata: motoren renser det ved visning
     (sikkertFilNavn — kontroltegn, 120 tegn), og upload-laget videregiver
     det råt. */
  return { sti, navn: fil.name };
}
