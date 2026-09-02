import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { getVelkomstVideoEmbed } from "@/lib/hjemmebane/akademiApi";

/**
 * Velkomstvideoen — signeret Bunny-embed uden content_items-række.
 *
 * Samme form som HbVideoEmbed (akademi/HbVideoEmbed.tsx), som IKKE er
 * skrevet om: den er bundet til et itemId og Akademiets dryp; velkomsten
 * har ingen af delene. Denne udgave er den samme iframe med den samme
 * query-disciplin (staleTime Infinity, ingen refetch — en frisk signeret
 * URL midt i afspilningen ville genstarte videoen) og de samme
 * fallback-tekster. GUID'et hentes aldrig af browseren; get-video-embed
 * læser app_config.velkomstvideo_guid selv og returnerer den færdige,
 * tidsbegrænsede URL ({ velkomst: true } → { embedUrl, expires }).
 *
 * Ingen player.js: velkomsten kvitteres med knappen «Kom i gang», ikke
 * ved 90 % afspilning (Model B1 gælder Akademiet).
 *
 * REFERER (målt 2/9, c0-bunny.md §3.7): Bunny tillader kun referrers fra
 * app.theboardroom.dk på library-niveau. Videoen virker derfor
 * automatisk her på samme domæne — men i Lovables PREVIEW-domæne kan
 * playeren svare 403 uanset gyldigt token. Det er UKLART om preview-
 * domænet er tilladt i Bunny; en 403 dér er ikke en fejl i vores kode.
 */
export const HbVelkomstVideoEmbed = () => {
  const embed = useQuery({
    queryKey: ["velkomst", "embed"],
    queryFn: getVelkomstVideoEmbed,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

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
        {/not_configured/.test(message)
          ? "Videoafspilning er ikke sat op endnu."
          : "Videoen kunne ikke hentes lige nu. Prøv igen om lidt."}
      </div>
    );
  }

  return (
    <iframe
      src={embed.data.embedUrl}
      title="Velkomstvideo"
      className="aspect-video w-full rounded-hb border border-hb-line bg-black"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  );
};
