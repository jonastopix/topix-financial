import { Fragment, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parsePodcastFeed, type PodcastEpisode } from "@/lib/hjemmebane/podcastRss";
import { useAkademiData } from "../akademi/useAkademiData";
import { HbEpisodeRow } from "../HbEpisodeRow";
import { HbSection } from "../HbSection";

/** Podcast & Talks som selvstændigt medlemsmiljø (13-08-2026) — abonnentens
    sidste manglende flade, jf. BACKLOG "Abonnent-grænsen". To sektioner:
    Podcast (hele RSS-feedet, sæsongrupperet, med cover og afspilning på
    siden — samme proxy/parser som forsidens tile, men EGEN queryKey så
    forsidens cache ikke forgiftes med et andet resultat under samme
    nøgle) og Talks (content_items med area='talks' fra Akademiets delte
    katalog-cache — talks BLIVER i Akademiet i dette trin; flytningen er
    et separat PR). Tom talks-liste er den forventede tilstand i dag
    (0 rækker i prod). */

/** mm:ss af sekunder — "–" når varigheden er ukendt (RSS-kontrakten:
    manglende felter er null). */
const formatVarighed = (sekunder: number | null): string => {
  if (sekunder == null) return "–";
  const m = Math.floor(sekunder / 60);
  const s = Math.round(sekunder % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

interface EpisodeEntry {
  episode: PodcastEpisode;
  /** Stabil nøgle pr. episode — guid når den findes, ellers titel+index. */
  noegle: string;
  /** itunes-episodenummeret med løbenummer-fallback (nyeste = højest). */
  nummer: number;
}

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

  /* Sæsongruppering — datadrevet af PodcastEpisode.season: nyeste sæson
     øverst, episoder inden for sæsonen nyeste først (listens sortering på
     publishedAt bevares). season = null samles i én gruppe UDEN label
     nederst — vi gætter aldrig på et sæsonnummer. En ny sæson i feedet
     dukker op af sig selv. */
  const saesoner = useMemo(() => {
    const nummererede: EpisodeEntry[] = episoder.map((episode, idx) => ({
      episode,
      noegle: episode.guid ?? `${episode.title}-${idx}`,
      nummer: episode.episode ?? episoder.length - idx,
    }));
    const grupper = new Map<number | null, EpisodeEntry[]>();
    for (const entry of nummererede) {
      const saeson = entry.episode.season;
      const liste = grupper.get(saeson) ?? [];
      liste.push(entry);
      grupper.set(saeson, liste);
    }
    const medNummer = [...grupper.entries()]
      .filter((par): par is [number, EpisodeEntry[]] => par[0] !== null)
      .sort((a, b) => b[0] - a[0])
      .map(([saeson, entries]) => ({ saeson: saeson as number | null, entries }));
    const udenNummer = grupper.get(null);
    return udenNummer ? [...medNummer, { saeson: null, entries: udenNummer }] : medNummer;
  }, [episoder]);

  /* Afspilning: ÉT <audio>-element for hele sektionen — det renderes kun
     under den aktive række. Lyden hentes fra RSS-feedets enclosure.
     Bliver den blokeret af Anchors CORS/hotlink-beskyttelse, fanger
     onError det og rækken falder tilbage til eksternt link — derfor kan
     afspilleren ikke vise en død knap. En fejlet episode huskes i
     fejledeNoegler, så den fremover åbner eksternt uden at forsøge igen.
     Ingen Spotify-iframe: Spotify-ID'et findes ikke i feedet, ville
     skulle vedligeholdes manuelt pr. episode, henter tredjepartskode ind
     og giver kun 30 sekunder uden login. */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [aktivNoegle, setAktivNoegle] = useState<string | null>(null);
  const [spiller, setSpiller] = useState(false);
  const [fejledeNoegler, setFejledeNoegler] = useState<Set<string>>(new Set());

  const aabnEksternt = (episode: PodcastEpisode) => {
    const url = episode.link ?? episode.audioUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const vaelgEpisode = (entry: EpisodeEntry) => {
    // Uden audioUrl — eller efter en afspilningsfejl — er adfærden præcis
    // som før afspilleren: åbn episoden eksternt i ny fane.
    if (!entry.episode.audioUrl || fejledeNoegler.has(entry.noegle)) {
      aabnEksternt(entry.episode);
      return;
    }
    if (aktivNoegle === entry.noegle) {
      const el = audioRef.current;
      if (!el) return;
      if (el.paused) void el.play();
      else el.pause();
      return;
    }
    setAktivNoegle(entry.noegle);
    setSpiller(false); // onPlay sætter den, når lyden faktisk starter
  };

  const haandterLydfejl = (entry: EpisodeEntry) => {
    setFejledeNoegler((forrige) => new Set(forrige).add(entry.noegle));
    setAktivNoegle(null);
    setSpiller(false);
    aabnEksternt(entry.episode);
  };

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
          saesoner.map(({ saeson, entries }) => (
            <div key={saeson ?? "uden-saeson"} className="mb-8 last:mb-0">
              {saeson !== null && (
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
                  Sæson {saeson}
                </p>
              )}
              <div className="border-b border-hb-line">
                {entries.map((entry) => {
                  const erAktiv = aktivNoegle === entry.noegle;
                  /* Rækken bygges LOKALT i HbEpisodeRows visuelle form
                     (samme hairline, samme talstil, samme højde) i stedet
                     for at genbruge komponenten: den har ikke et
                     cover-prop, og den udvides ikke her — den bruges også
                     til talks-listen nedenfor og potentielt andre steder. */
                  return (
                    <Fragment key={entry.noegle}>
                      <div
                        className="group flex cursor-pointer items-center gap-5 border-t border-hb-line py-4 transition-colors hover:bg-hb-sage/20"
                        onClick={() => vaelgEpisode(entry)}
                      >
                        <span className="w-10 shrink-0 font-editorial text-2xl font-medium text-hb-ink-soft">
                          {String(entry.nummer).padStart(2, "0")}
                        </span>
                        {entry.episode.imageUrl && (
                          <img
                            src={entry.episode.imageUrl}
                            alt=""
                            loading="lazy"
                            className="h-12 w-12 shrink-0 rounded-hb object-cover"
                          />
                        )}
                        <span className="flex-1 text-base text-hb-ink">{entry.episode.title}</span>
                        <span className="shrink-0 text-sm text-hb-ink-soft">
                          {formatVarighed(entry.episode.durationSeconds)}
                        </span>
                        {/* Diskret markering af den aktive række: kun ikonet
                            skifter — evergreen og pause/play-form. Ingen
                            animation, intet farveskift af hele rækken. */}
                        {erAktiv ? (
                          spiller ? (
                            <Pause className="h-4 w-4 shrink-0 text-hb-evergreen" />
                          ) : (
                            <Play className="h-4 w-4 shrink-0 text-hb-evergreen" />
                          )
                        ) : (
                          <Play className="h-4 w-4 shrink-0 text-hb-ink-soft transition-colors group-hover:text-hb-evergreen" />
                        )}
                      </div>
                      {erAktiv && entry.episode.audioUrl && (
                        // eslint-disable-next-line jsx-a11y/media-has-caption -- eksternt podcast-feed uden tekstspor
                        <audio
                          ref={audioRef}
                          src={entry.episode.audioUrl}
                          controls
                          autoPlay
                          className="mb-4 mt-1 w-full"
                          onPlay={() => setSpiller(true)}
                          onPause={() => setSpiller(false)}
                          onError={() => haandterLydfejl(entry)}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          ))
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
