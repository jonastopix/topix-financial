import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parsePodcastFeed, type PodcastEpisode } from "@/lib/hjemmebane/podcastRss";
import { useAkademiData } from "../akademi/useAkademiData";
import { HbEpisodeRow } from "../HbEpisodeRow";
import { HbSection } from "../HbSection";

/** Podcast & Talks som selvstændigt medlemsmiljø (13-08-2026) — abonnentens
    sidste manglende flade, jf. BACKLOG "Abonnent-grænsen". To sektioner:
    Podcast (hele RSS-feedet, nyeste først — samme proxy/parser som
    forsidens tile, men EGEN queryKey så forsidens cache ikke forgiftes
    med et andet resultat under samme nøgle) og Talks (content_items med
    area='talks' fra Akademiets delte katalog-cache — talks BLIVER i
    Akademiet i dette trin; flytningen er et separat PR). Tom talks-liste
    er den forventede tilstand i dag (0 rækker i prod). */

/** mm:ss af sekunder — "–" når varigheden er ukendt (RSS-kontrakten:
    manglende felter er null). */
const formatVarighed = (sekunder: number | null): string => {
  if (sekunder == null) return "–";
  const m = Math.floor(sekunder / 60);
  const s = Math.round(sekunder % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const PodcastTalksView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const akademi = useAkademiData();
  const talks = akademi.orderedByArea.get("talks") ?? [];

  // Podcast: dum proxy (podcast-rss, B2) + ren parser (parsePodcastFeed,
  // B1) → HELE listen, nyeste først. FEJL/tom → tom liste: queryFn'en
  // kaster ALDRIG, så medlemmet ser aldrig en fejl — kun den rolige
  // tom-linje. invoke() bærer sessionens JWT (Bucket A-kravet).
  const episoderQuery = useQuery({
    queryKey: ["podcast-talks", "episoder"],
    queryFn: async (): Promise<PodcastEpisode[]> => {
      try {
        const { data, error } = await supabase.functions.invoke("podcast-rss");
        if (error) return [];
        // functions-js afleverer ikke-JSON-svar som tekst; Blob-grenen er
        // defensiv mod content-type-afvigelser.
        const xml =
          typeof data === "string" ? data : data instanceof Blob ? await data.text() : null;
        if (!xml) return [];
        const episodes = parsePodcastFeed(xml);
        return [...episodes].sort((a, b) =>
          (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
        );
      } catch {
        return [];
      }
    },
    staleTime: 30 * 60_000,
    retry: 1,
    enabled: !!user,
  });
  const episoder = episoderQuery.data ?? [];

  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
          Fra os til dig
        </p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          Podcast & Talks
        </h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          Podcasten og optagelser fra live sessions — lyt og se, når det passer dig.
        </p>
      </section>

      <HbSection eyebrow="Podcast" hairline className="mt-12 md:mt-14">
        {episoderQuery.isLoading ? (
          <p className="text-sm text-hb-ink-soft">Henter episoder…</p>
        ) : episoder.length === 0 ? (
          <p className="text-sm text-hb-ink-soft">Ingen episoder at vise lige nu.</p>
        ) : (
          <div className="border-b border-hb-line">
            {episoder.map((episode, idx) => {
              const url = episode.link ?? episode.audioUrl;
              return (
                <HbEpisodeRow
                  key={episode.guid ?? `${episode.title}-${idx}`}
                  number={episode.episode ?? episoder.length - idx}
                  title={episode.title}
                  duration={formatVarighed(episode.durationSeconds)}
                  onClick={() => {
                    if (url) window.open(url, "_blank", "noopener,noreferrer");
                  }}
                />
              );
            })}
          </div>
        )}
      </HbSection>

      <HbSection eyebrow="Talks" hairline className="mt-14 md:mt-16">
        {akademi.loading ? (
          <p className="text-sm text-hb-ink-soft">Henter talks…</p>
        ) : talks.length === 0 ? (
          <p className="text-sm text-hb-ink-soft">
            Optagelser fra live sessions lander her, efterhånden som de afholdes.
          </p>
        ) : (
          <div className="border-b border-hb-line">
            {talks.map((entry, idx) => (
              <HbEpisodeRow
                key={entry.item.id}
                number={idx + 1}
                title={entry.item.title}
                duration={formatVarighed(entry.item.duration_seconds)}
                onClick={() => navigate(`/akademiet/talks/${entry.item.slug}`)}
              />
            ))}
          </div>
        )}
      </HbSection>
    </div>
  );
};
