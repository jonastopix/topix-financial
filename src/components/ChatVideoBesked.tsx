import React, { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { laesChatVideo, type ChatVideoStatus } from "@/lib/chatVideo";
import { formatVarighed, naesteAfspilForespoergsel } from "@/lib/chatVideoFlade";

/**
 * En chatvideo i boblen (29/9-2026) — begge paner.
 *
 * Videoen findes KUN ved laesChatVideo(context_meta) (nøglen video.guid).
 * Afspilningen kommer fra chat-video «afspil» { messageId }: serveren læser
 * beskeden med læserens RLS, tjekker afsender og collection og signerer
 * embed-URL'en. iframe-src er ALTID svarets embedUrl — aldrig bygget her,
 * aldrig fra context_meta (låst af chatVideoFlade.guard).
 *
 *   behandles → rolig linje; spørg igen hvert 10. sekund i højst 10 minutter.
 *   klar      → iframen; URL'en fornys et minut før `expires`.
 *   fejlet    → «Videoen kunne ikke behandles.»
 */

interface AfspilSvar {
  status: ChatVideoStatus;
  embedUrl?: string;
  expires?: number;
}

export function ChatVideoBesked({ messageId, contextMeta }: { messageId: string; contextMeta: unknown }) {
  const video = laesChatVideo(contextMeta);
  const foersteMsRef = useRef<number | null>(null);
  const varighed = (() => {
    const v = (contextMeta as { video?: { varighed?: unknown } } | null)?.video?.varighed;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  })();

  const afspil = useQuery({
    queryKey: ["chat-video", "afspil", messageId],
    enabled: video !== null,
    queryFn: async (): Promise<AfspilSvar> => {
      const { data, error } = await supabase.functions.invoke("chat-video", {
        body: { action: "afspil", messageId },
      });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        throw new Error(status === 503 ? "not_configured" : status === 403 ? "forbidden" : "fejl");
      }
      if (foersteMsRef.current === null) foersteMsRef.current = Date.now();
      return data as AfspilSvar;
    },
    // Ingen genhentning ved fokus: en ny URL udskifter iframe-src og genstarter videoen.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    refetchInterval: (q) => {
      const d = q.state.data as AfspilSvar | undefined;
      return naesteAfspilForespoergsel({
        status: d?.status,
        expires: d?.expires ?? null,
        nuMs: Date.now(),
        foersteMs: foersteMsRef.current ?? Date.now(),
      });
    },
  });

  if (!video) return null;

  const ramme = "mt-1.5 w-full max-w-[360px] rounded-hb border border-hb-line bg-hb-sage/20 px-3 py-3 text-xs text-hb-ink-soft";

  if (afspil.isLoading) {
    return (
      <div className={ramme}>
        <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden />
        Henter videoen …
      </div>
    );
  }
  if (afspil.isError) {
    const m = afspil.error instanceof Error ? afspil.error.message : "";
    return (
      <div className={ramme}>
        {m === "not_configured" ? "Video er ikke sat op endnu." : m === "forbidden" ? "Videoen kan ikke vises." : "Videoen kunne ikke hentes lige nu."}
      </div>
    );
  }

  const svar = afspil.data;
  if (svar?.status === "fejlet") {
    return <div className={ramme}>Videoen kunne ikke behandles.</div>;
  }
  if (svar?.status === "klar" && svar.embedUrl) {
    return (
      <iframe
        src={svar.embedUrl}
        title="Videosvar"
        className="mt-1.5 aspect-video w-full max-w-[360px] rounded-hb border border-hb-line bg-black"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <div className={ramme}>
      <Video className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
      Videoen behandles …{varighed ? ` (${formatVarighed(varighed)})` : ""}
    </div>
  );
}
