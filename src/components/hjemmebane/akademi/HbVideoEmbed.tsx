import * as React from "react";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import playerjs from "player.js";
import { getVideoEmbed } from "@/lib/hjemmebane/akademiApi";

const POSITION_WRITE_INTERVAL_MS = 10_000;
const AUTO_COMPLETE_FRACTION = 0.9;

interface HbVideoEmbedProps {
  itemId: string;
  /** Genoptag-position (sekunder) — sendes til get-video-embed som &t=. */
  resumeAt: number | null;
  onPosition: (seconds: number) => void;
  onCompleted: () => void;
}

/** Signeret Bunny-embed + player.js-integration (D4): position skrives
    throttled hvert 10. sek. og straks ved pause; ≥90 % eller 'ended' =
    auto-gennemført. Ærlig fallback: fejler player.js-koblingen, afspiller
    videoen stadig — kun auto-position/auto-gennemført degraderer (manuel
    kvittering består). */
export const HbVideoEmbed = ({ itemId, resumeAt, onPosition, onCompleted }: HbVideoEmbedProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastWriteRef = useRef(0);
  const positionRef = useRef(0);
  const completedRef = useRef(false);
  const callbacksRef = useRef({ onPosition, onCompleted });
  callbacksRef.current = { onPosition, onCompleted };

  // Ingen automatiske refetches: en frisk signeret URL midt i afspilningen
  // ville udskifte iframe-src og genstarte videoen.
  const embed = useQuery({
    queryKey: ["akademi", "embed", itemId],
    queryFn: () => getVideoEmbed(itemId, resumeAt ?? undefined),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!embed.data || !iframe) return;

    let player: InstanceType<typeof playerjs.Player> | null = null;
    try {
      player = new playerjs.Player(iframe);
      player.on("ready", () => {
        player?.on("timeupdate", ({ seconds, duration }) => {
          positionRef.current = Math.floor(seconds);
          if (
            !completedRef.current &&
            duration > 0 &&
            seconds / duration >= AUTO_COMPLETE_FRACTION
          ) {
            completedRef.current = true;
            callbacksRef.current.onCompleted();
          }
          const now = Date.now();
          if (now - lastWriteRef.current >= POSITION_WRITE_INTERVAL_MS) {
            lastWriteRef.current = now;
            callbacksRef.current.onPosition(positionRef.current);
          }
        });
        player?.on("pause", () => {
          lastWriteRef.current = Date.now();
          callbacksRef.current.onPosition(positionRef.current);
        });
        player?.on("ended", () => {
          if (!completedRef.current) {
            completedRef.current = true;
            callbacksRef.current.onCompleted();
          }
        });
      });
    } catch {
      // Fallback (D4): afspilning virker; kun auto-progress degraderer.
    }

    return () => {
      // Best-effort: skriv sidste kendte position når afspilleren forlades.
      if (positionRef.current > 0) callbacksRef.current.onPosition(positionRef.current);
    };
  }, [embed.data]);

  if (embed.isLoading) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-hb border border-hb-line bg-hb-surface text-sm text-hb-ink-soft">
        Henter video…
      </div>
    );
  }

  if (embed.isError || !embed.data) {
    const message = embed.error instanceof Error ? embed.error.message : "";
    return (
      <div className="flex aspect-video items-center justify-center rounded-hb border border-hb-line bg-hb-sage/30 px-8 text-center text-sm leading-relaxed text-hb-ink">
        {/dripped/.test(message)
          ? "Videoen er ikke åbnet for dig endnu — den drypper ind senere i forløbet."
          : /not_configured/.test(message)
            ? "Videoafspilning er ikke sat op endnu."
            : "Videoen kunne ikke hentes lige nu. Prøv igen om lidt."}
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={embed.data.embedUrl}
      title="Videoafspiller"
      className="aspect-video w-full rounded-hb border border-hb-line bg-black"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  );
};
