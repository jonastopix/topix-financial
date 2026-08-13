import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Pause, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parsePodcastFeed, type PodcastEpisode } from "@/lib/hjemmebane/podcastRss";
import { HbSection } from "../HbSection";

/** Podcast & Talks som selvstændigt medlemsmiljø (13-08-2026) — abonnentens
    sidste manglende flade, jf. BACKLOG "Abonnent-grænsen". Podcast-sektionen
    bærer hele RSS-feedet, sæsongrupperet, med cover og afspilning på siden
    (samme proxy/parser som forsidens tile, men EGEN queryKey så forsidens
    cache ikke forgiftes med et andet resultat under samme nøgle).
    Talks-sektionen henviser til events: produktbeslutning 13-08-2026
    (Jonas) — en optagelse hører til sit event og vises der, ikke i en
    samlet talks-liste. */

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
    const raakke = episoder.map((episode, idx) => ({
      episode,
      noegle: episode.guid ?? `${episode.title}-${idx}`,
    }));
    const grupper = new Map<number | null, typeof raakke>();
    for (const entry of raakke) {
      const saeson = entry.episode.season;
      const liste = grupper.get(saeson) ?? [];
      liste.push(entry);
      grupper.set(saeson, liste);
    }
    /* Fallback-nummeret tildeles INDEN FOR gruppen — et globalt løbenummer
       betyder intet efter sæsongrupperingen: to sæsoner kunne få samme
       fallback-nummer, og en gruppe kunne starte på 16. Hver sæson tæller
       fra sin egen top (gruppens længde ned til 1, nyeste øverst);
       itunes-episodenummeret vinder fortsat, når det findes. */
    const nummerer = (entries: typeof raakke): EpisodeEntry[] =>
      entries.map((entry, idxIGruppe) => ({
        ...entry,
        nummer: entry.episode.episode ?? entries.length - idxIGruppe,
      }));
    const medNummer = [...grupper.entries()]
      .filter((par): par is [number, typeof raakke] => par[0] !== null)
      .sort((a, b) => b[0] - a[0])
      .map(([saeson, entries]) => ({ saeson: saeson as number | null, entries: nummerer(entries) }));
    const udenNummer = grupper.get(null);
    return udenNummer
      ? [...medNummer, { saeson: null, entries: nummerer(udenNummer) }]
      : medNummer;
  }, [episoder]);

  /* Afspilning: ÉT <audio>-element for hele sektionen — i en KLÆBENDE
     bjælke sidst i sektionen (sticky bottom-0), så den altid er synlig
     mens noget spiller. STICKY, ikke fixed: HbMemberShell har sin egen
     scroll-container på lg (lg:overflow-y-auto på den indre kolonne), og
     sticky klæber til nærmeste scrollport — den indre kolonne på desktop,
     viewporten på mobil — hvor fixed ville pinne til vinduet og
     overlejre sidebaren. Rækkerne flytter sig fortsat ikke, når en
     episode vælges. Lyden hentes fra RSS-feedets
     enclosure. Bliver den blokeret af Anchors CORS/hotlink-beskyttelse,
     fanger onError det og rækken falder tilbage til eksternt link —
     derfor kan afspilleren ikke vise en død knap. En fejlet episode
     huskes i fejledeNoegler, så den fremover åbner eksternt uden at
     forsøge igen. Ingen Spotify-iframe: Spotify-ID'et findes ikke i
     feedet, ville skulle vedligeholdes manuelt pr. episode, henter
     tredjepartskode ind og giver kun 30 sekunder uden login. */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [aktivNoegle, setAktivNoegle] = useState<string | null>(null);
  const [spiller, setSpiller] = useState(false);
  const [fejledeNoegler, setFejledeNoegler] = useState<Set<string>>(new Set());

  const aktivEntry = useMemo(
    () =>
      saesoner.flatMap((gruppe) => gruppe.entries).find((entry) => entry.noegle === aktivNoegle) ??
      null,
    [saesoner, aktivNoegle],
  );

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

  const lukAfspiller = () => {
    audioRef.current?.pause();
    setAktivNoegle(null);
    setSpiller(false);
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
          <>
            {/* mt-4 giver første sæson-label luft til sektionens hairline;
                space-y-8 holder afstanden mellem grupperne ens hele vejen
                (samme spacing-sprog som kortenes space-y-8). */}
            <div className="mt-4 space-y-8">
              {saesoner.map(({ saeson, entries }) => (
                <div key={saeson ?? "uden-saeson"}>
                  {saeson !== null && (
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
                      Sæson {saeson}
                    </p>
                  )}
                  <div className="border-b border-hb-line">
                    {entries.map((entry) => {
                      const erAktiv = aktivNoegle === entry.noegle;
                      /* Rækken bygges LOKALT i HbEpisodeRows visuelle form
                         (samme hairline, samme talstil, samme højde) i
                         stedet for at genbruge komponenten: den har ikke
                         et cover-prop, og den udvides ikke her. Rækken er
                         en RIGTIG <button> (tabbar, tastatur, skærmlæser)
                         med nulstillet knap-styling — hele rækken bærer
                         handlingen; ikonet er ren tilstandsmarkering. */
                      return (
                        <button
                          key={entry.noegle}
                          type="button"
                          aria-label={
                            erAktiv && spiller
                              ? `Sæt ${entry.episode.title} på pause`
                              : `Afspil ${entry.episode.title}`
                          }
                          className="group flex w-full items-center gap-5 border-t border-hb-line py-4 text-left transition-colors hover:bg-hb-sage/20"
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
                          <span className="flex-1 text-base text-hb-ink">
                            {entry.episode.title}
                          </span>
                          <span className="shrink-0 text-sm text-hb-ink-soft">
                            {formatVarighed(entry.episode.durationSeconds)}
                          </span>
                          {/* Ren tilstandsmarkering — ingen hover-farve på
                              ikonet selv, så det ikke ligner en selvstændig
                              knap; evergreen + pause/play viser kun den
                              aktive tilstand. */}
                          {erAktiv ? (
                            spiller ? (
                              <Pause
                                className="h-4 w-4 shrink-0 text-hb-evergreen"
                                aria-hidden="true"
                              />
                            ) : (
                              <Play
                                className="h-4 w-4 shrink-0 text-hb-evergreen"
                                aria-hidden="true"
                              />
                            )
                          ) : (
                            <Play
                              className="h-4 w-4 shrink-0 text-hb-ink-soft"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </HbSection>

      {/* Produktbeslutning 13-08-2026 (Jonas): en optagelse hører til sit
          event og vises der, ikke i en samlet talks-liste. Sektionen
          henviser derfor roligt til events — ingen liste, ingen
          call-to-action. */}
      <HbSection eyebrow="Talks" hairline className="mt-14 md:mt-16">
        <p className="text-sm text-hb-ink-soft">
          Optagelser fra afholdte sessions ligger på det enkelte event under{" "}
          <Link to="/events" className="text-hb-evergreen underline-offset-4 hover:underline">
            Events
          </Link>
          .
        </p>
      </HbSection>

      {/* Klæbende afspiller-bjælke: sticky bottom-0 mod nærmeste scrollport
          (den indre kolonne på lg, viewporten på mobil). Ligger paa RODENS
          niveau, EFTER begge sektioner — sticky klæber kun inden for sin
          forælders højde, så inde i podcast-sektionen holdt bjælken op med
          at følge med, når man scrollede forbi sektionens bund; her er
          klæbeområdet hele siden. Renderes KUN når en episode er aktiv —
          ingen reserveret plads og ingen synlig bjælke ellers. Solid
          hb-surface + hairline foroven løfter den fra indholdet der
          scroller forbi; ingen skygge, ingen animation. På de smalleste
          skærme skjules cover og sæson-linjen, så <audio> og luk-knappen
          altid er fuldt brugbare. */}
      {aktivEntry && aktivEntry.episode.audioUrl && (
        <>
          {/* Luft i bunden KUN mens bjælken er der: spaceren gør at den
              sidste række og Talks-sektionen kan scrolles helt fri af det
              klæbende lag, og den bærer afstanden mellem Talks og bjælken,
              når man står i bunden. Ingen tom plads uden aktiv episode. */}
          <div aria-hidden="true" className="h-24" />
          {/* rounded-t-hb + hairline hele vejen rundt (minus bunden) læser
              bjælken som et lag der ligger OVER listen — ikke en kant der
              er vokset fast i skærmen; px-4 holder indholdet fri af de
              afrundede hjørner. */}
          <div className="sticky bottom-0 z-10 rounded-t-hb border border-b-0 border-hb-line bg-hb-surface">
            <div className="flex items-center gap-4 px-4 py-3">
            {aktivEntry.episode.imageUrl && (
              <img
                src={aktivEntry.episode.imageUrl}
                alt=""
                className="hidden h-10 w-10 shrink-0 rounded-hb object-cover sm:block"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-hb-ink">{aktivEntry.episode.title}</p>
              <p className="hidden text-xs text-hb-ink-soft sm:block">
                {aktivEntry.episode.season !== null
                  ? `Sæson ${aktivEntry.episode.season} · Episode ${aktivEntry.nummer}`
                  : `Episode ${aktivEntry.nummer}`}
              </p>
            </div>
            {/* min-w-56 holder kontrollerne brugbare — titlen (flex-1 +
                truncate) giver plads først. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- eksternt podcast-feed uden tekstspor */}
            <audio
              ref={audioRef}
              src={aktivEntry.episode.audioUrl}
              controls
              autoPlay
              className="h-10 w-full min-w-56 max-w-sm"
              onPlay={() => setSpiller(true)}
              onPause={() => setSpiller(false)}
              onError={() => haandterLydfejl(aktivEntry)}
            />
            <button
              type="button"
              aria-label="Luk afspilleren"
              onClick={lukAfspiller}
              className="shrink-0 p-2 text-hb-ink-soft transition-colors hover:text-hb-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
