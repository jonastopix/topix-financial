/**
 * chatVideoUpload — en chatvideo fra browseren til Bunny Stream (29/9-2026).
 *
 * Samme vej som HbBunnyPicker (Akademiet): chat-video «opret» giver en
 * video-scoped TUS-grant (API-nøglen forlader aldrig edge-functionen), og
 * browseren uploader DIREKTE til Bunnys TUS-endpoint med de samme fire
 * headere. Forskellen: «opret» lægger videoen i chattens EGET Bunny-bibliotek
 * («boardroom-chat», Premium Encoding + Just-In-Time — 29/9 aften; secrets
 * BUNNY_CHAT_*) og er rådgiver-gated på serveren. libraryId i grantet ER
 * chat-biblioteket — TUS-uploaden rammer aldrig Hjemmebanes.
 *
 * «Færdig» her = Bunny har modtaget filen (TUS onSuccess). Encodingen følger
 * efter; den spørges der om ved afspilningen (chat-video «afspil»).
 */
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

interface Grant {
  videoGuid: string;
  signature: string;
  expires: number;
  libraryId: string;
}

export type UploadUdfald =
  | { ok: true; guid: string }
  | { ok: false; grund: "ikke_sat_op" | "afvist" | "fejl"; besked: string };

/** Fejlens statuskode og body fra en FunctionsHttpError (husets mønster: error.context). */
async function fejlSvar(error: unknown): Promise<{ status: number | null; body: { error?: string } | null }> {
  const ctx = (error as { context?: { status?: number; json?: () => Promise<unknown> } } | null)?.context;
  const status = typeof ctx?.status === "number" ? ctx.status : null;
  let body: { error?: string } | null = null;
  try {
    body = ((await ctx?.json?.()) ?? null) as { error?: string } | null;
  } catch {
    body = null;
  }
  return { status, body };
}

export async function uploadChatVideo(
  fil: Blob,
  valg: { titel: string; onFremdrift: (procent: number) => void },
): Promise<UploadUdfald> {
  const { data, error } = await supabase.functions.invoke("chat-video", {
    body: { action: "opret", title: valg.titel },
  });
  if (error) {
    const { status, body } = await fejlSvar(error);
    if (status === 503 || body?.error === "not_configured") {
      return { ok: false, grund: "ikke_sat_op", besked: "Video er ikke sat op endnu." };
    }
    if (status === 403) {
      return { ok: false, grund: "afvist", besked: "Kun rådgivere kan sende video." };
    }
    return { ok: false, grund: "fejl", besked: "Videoen kunne ikke sendes. Prøv igen." };
  }
  const grant = data as Grant;
  if (!grant?.videoGuid || !grant.signature || !grant.libraryId) {
    return { ok: false, grund: "fejl", besked: "Videoen kunne ikke sendes. Prøv igen." };
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(fil, {
        endpoint: TUS_ENDPOINT,
        retryDelays: [0, 3000, 5000, 10000],
        headers: {
          AuthorizationSignature: grant.signature,
          AuthorizationExpire: String(grant.expires),
          VideoId: grant.videoGuid,
          LibraryId: grant.libraryId,
        },
        metadata: { filetype: fil.type || "video/mp4", title: valg.titel },
        onError: reject,
        onProgress: (sent, total) => valg.onFremdrift(total > 0 ? Math.round((sent / total) * 100) : 0),
        onSuccess: () => resolve(),
      });
      upload.start();
    });
  } catch (err) {
    console.error("[chatVideoUpload] TUS-upload fejlede:", err instanceof Error ? err.message : String(err));
    return { ok: false, grund: "fejl", besked: "Videoen kunne ikke uploades. Prøv igen." };
  }

  return { ok: true, guid: grant.videoGuid };
}
