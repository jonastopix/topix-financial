import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronUp, ExternalLink, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import {
  REPORT_OVERRIDE_SELECT,
  formatDKK,
  getEffectiveReportPeriodKey,
  type ReportData,
} from "@/lib/financialUtils";
import { AREAS, getAssetPreviewUrl, type ContentItem } from "@/lib/hjemmebane/adminContentApi";
import { bunnyThumbnailUrl } from "@/lib/hjemmebane/bunnyMedia";
import { parsePodcastFeed, type PodcastEpisode } from "@/lib/hjemmebane/podcastRss";
import { getISOWeekKey } from "@/lib/hjemmebane/week";
import { listUpcomingEvents } from "@/lib/hjemmebane/akademiApi";
import { eventMeetPhase } from "@/lib/hjemmebane/eventPhase";
import { EventRegisterAction } from "../events/EventRegisterAction";
import { formatDuration } from "@/components/hjemmebane/admin/editors/shared";
import { handoutConfigs, moduleOrder, type HandoutModule } from "@/lib/handoutConfig";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { hasRichTextContent } from "@/lib/hjemmebane/richtext";
import { isTrackedEntry, useAkademiData, type AkademiItem } from "../akademi/useAkademiData";
import { HbVideoEmbed } from "../akademi/HbVideoEmbed";
import { deriveFocus, type FocusItem } from "./nextStep";
import {
  byPublishedDesc,
  countNewSince,
  pickActiveItem,
  pickActivePush,
  pickActiveWeekVideo,
  pickEvergreen,
  pickMainStory,
  type NewsCandidate,
  type StoryCandidate,
  type StoryKind,
} from "./pushSelection";
import { extractYouTubeId } from "./youtube";

/** Dit Boardroom (/boardroom) — Hb-forsiden i VANE-ANKER-IA'en (forside
    PR 2, hb-forside-recon §C/§G): de tre lag i rækkefølgen
    1) "Dit næste skridt" ØVERST — fokus-motoren (deriveFocus, PR #217)
       m. ALLE kilder: rapport-signal, beskeder, ugens fokus (læses
       INLINE så notifikations-kontrakten "Ugens fokus er klar" → "/"
       indfries), milestones, company_actions, pulse, løftestænger.
       #1 stort, #2-4 som stille linjer.
    2) "Kommende"-sektionen — de næste 2-3 events som egen sektion
       (live-sessions er en kerneydelse, ikke en nyhed). Uden CTA
       (tilmelding er egen leverance).
    3) "Fra os til dig"-båndet — kurateret via RYKKELISTEN (PR B3,
       pickMainStory): push → ugens video → nyeste redaktionelle →
       nyeste podcast-episode → evergreen-rotationen. Første kandidat
       vinder hovedpladsen; resten fylder tile-rækken sammen m. seneste
       talk. Hver kandidat kan være null af hvilken som helst grund
       (udløbet, tom pulje, RSS-fejl) — båndet vælter aldrig.
    4) Tal-strippen NEDERST som rolig status (uændret indhold/kilder).
    Motoren er LÅST (ingen ændringer i deriveFocus); alle nye queries er
    company-scoped og arvet ORDRET fra DashboardActionCenter (citeret
    ved hver query). Advisor-gated route i byggeperioden. */

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
};

const proseClasses =
  "prose-hb mt-6 max-w-3xl text-[15px] leading-relaxed text-hb-ink [&_a]:text-hb-rust [&_a]:underline [&_h2]:mt-8 [&_h2]:font-editorial [&_h2]:text-2xl [&_h2]:font-medium [&_h3]:mt-6 [&_h3]:font-editorial [&_h3]:text-xl [&_h3]:font-medium [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-5";

// Uge-nøglen bor nu i den delte helper (PR B1) — samme aritmetik, ordret.

// ── Diskrete tidsmarkeringer (lag 2: "siden sidst"-følelsen) ────────────
const publishedMarker = (iso: string | null): string | null => {
  if (!iso) return null;
  const published = new Date(iso).getTime();
  if (Number.isNaN(published)) return null;
  const days = (Date.now() - published) / 86400000;
  if (days <= 7) return "Ny i denne uge";
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long" });
};

const eventCountdown = (startsAt: string): string => {
  const days = Math.ceil((new Date(startsAt).getTime() - Date.now()) / 86400000);
  if (days <= 0) return "I dag";
  if (days === 1) return "I morgen";
  return `Om ${days} dage`;
};

/** Sidehovedet: rolig, personlig velkomst — altid til stede (pushet er
    flyttet ned i båndet som hovedhistorie). INGEN eyebrow (polish):
    sidebaren siger allerede "Dit Boardroom", og siden har eyebrows nok
    — rubrikken står selv. Topluften (mt-8 md:mt-10) bor HER i
    komponenten, ikke i shell'en — eyebrow'en bar tidligere luften, og
    shell'ens py-10/14 deles af alle flader og må ikke vokse for én. */
const PageHeader = ({ firstName }: { firstName: string }) => (
  <section className="mt-8 max-w-3xl md:mt-10">
    <h1 className="font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
      {getGreeting()}, {firstName}.
    </h1>
  </section>
);

/** Bånd-varianterne (PR B3): hver kind har ÉT komponentsæt m. en
    variant-prop — "main" (hovedpladsen, col-span-4) og "side"
    (sidespalten, kompakt p-4-kort) — ikke to sæt komponenter. */
type StoryVariant = "main" | "side";

/** Push som lag 2-hovedhistorie (kilde/udløbsdom uændret — pickActivePush).
    Afsender-bylinen (bølge 1, PR 3): findes metadata.author_user_id, vises
    portræt (40 px) + navn — profilen slås op af forælderen (rolle-sikkert
    via get_all_advisor_profiles-RPC'en); manglende avatar → initial-cirkel
    i Hb-toner (admin-vælgerens fallback-mønster). Uden author_user_id:
    fri-tekst-bylinen uændret (bagudkompatibelt). PR B3: main-formen er
    uændret (blot m. HbCard flyttet HERIND fra forælderen); side-formen
    findes for komponentsæt-symmetrien — pushet står først i rykkelisten
    og er i praksis altid main når det findes. */
const PushStory = ({
  push,
  sender,
  coverUrl,
  variant,
}: {
  push: ContentItem;
  sender: { full_name: string; avatar_url: string | null } | null;
  coverUrl: string | null;
  variant: StoryVariant;
}) => {
  const [bodyOpen, setBodyOpen] = useState(false);
  const metadata = (push.metadata as Record<string, unknown>) ?? {};
  const author = (metadata.author as string) || null;
  const hasSenderId = Boolean(metadata.author_user_id);
  const marker = publishedMarker(push.published_at ?? push.created_at);
  const senderName = sender?.full_name ?? author;

  // PR A (visuel vægt): hovedhistorien skal SE UD som en historie —
  // cover øverst, større overskrift, mere luft. Uden cover bærer
  // afsenderens portræt i STORT format (72 px) den visuelle vægt i
  // stedet; m. cover holdes bylinen lille (40 px). Kun Hb-paletten —
  // vægten kommer fra billede, typografi-skala og luft.
  const bigPortrait = !coverUrl && hasSenderId && senderName;

  if (variant === "side") {
    // Redesign (materiale, ikke farve): sidetiles er redaktionelle
    // opslag — ingen ramme/kortbaggrund, kun hb-line-streg og luft.
    return (
      <div className="border-t border-hb-line pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
          Ugens push{marker && <span className="ml-2 normal-case tracking-normal">· {marker}</span>}
        </p>
        <p className="mt-2 text-[15px] font-medium leading-snug text-hb-ink">{push.title}</p>
        {push.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{push.description}</p>
        )}
        {senderName && <p className="mt-2.5 text-xs font-medium text-hb-ink">{senderName}</p>}
      </div>
    );
  }

  return (
    // Polering #1: to-spaltet m. cover (billede venstre, tekst højre);
    // uden cover bærer teksten fuld bredde som i dag (bigPortrait-
    // fallback'et er netop cover-løs og forbliver fuldbredde).
    <MainStoryShell coverUrl={coverUrl}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
        Ugens push{marker && <span className="ml-2 normal-case tracking-normal text-hb-ink-soft">· {marker}</span>}
      </p>
      {bigPortrait ? (
        <div className="mt-4 flex items-start gap-5">
          {sender?.avatar_url ? (
            <img
              src={sender.avatar_url}
              alt={senderName!}
              className="h-[72px] w-[72px] shrink-0 rounded-full border border-hb-line object-cover"
            />
          ) : (
            <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-2xl text-hb-ink-soft">
              {senderName!.charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
              {push.title}
            </h2>
            <p className="mt-2 text-sm font-medium text-hb-ink">{senderName}</p>
          </div>
        </div>
      ) : (
        <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
          {push.title}
        </h2>
      )}
      {push.description && (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{push.description}</p>
      )}
      {!bigPortrait && hasSenderId && senderName ? (
        <p className="mt-5 flex items-center gap-3">
          {sender?.avatar_url ? (
            <img
              src={sender.avatar_url}
              alt={senderName}
              className="h-10 w-10 shrink-0 rounded-full border border-hb-line object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 text-sm text-hb-ink-soft">
              {senderName.charAt(0)}
            </span>
          )}
          <span className="text-sm font-medium text-hb-ink">{senderName}</span>
        </p>
      ) : (
        !bigPortrait && author && <p className="mt-5 text-sm font-medium text-hb-ink">{author}</p>
      )}
      {hasRichTextContent(push.body) && (
        <>
          <button
            type="button"
            onClick={() => setBodyOpen((open) => !open)}
            className="mt-4 flex items-center gap-1.5 text-sm text-hb-rust underline-offset-4 hover:underline"
          >
            {bodyOpen ? "Vis mindre" : "Læs mere"}
            {bodyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {bodyOpen && (
            <div className={proseClasses} dangerouslySetInnerHTML={{ __html: push.body as string }} />
          )}
        </>
      )}
    </MainStoryShell>
  );
};

/** Cover m. play-knap (PR A: INGEN autoplay/lyd før klik): afspilleren
    monteres først når brugeren klikker. Uden cover: rolig, TOM Hb-flade
    m. play-knappen — ingen titel (titlen står allerede over playeren i
    alle tre kaldsteder, og aria-label bærer den for skærmlæsere). Kun
    Hb-toner — vægten kommer fra billedet. */
const PlayCover = ({
  coverUrl,
  title,
  onPlay,
  shape = "video",
}: {
  coverUrl: string | null;
  title: string;
  onPlay: () => void;
  /** Polering #3: podcast-episoders covers er KVADRATISKE — presset i
      bredformat klippes hoveder/tekst. "square" viser dem 1:1 (intet
      crop af et kvadratisk billede i kvadratisk ramme). Bunny/YouTube
      er 16:9 og beholder default "video". Ren præsentation — gate-
      funktionen (ingen lyd/afspilning før klik) er uændret. */
  shape?: "video" | "square";
}) => (
  <button
    type="button"
    onClick={onPlay}
    aria-label={`Afspil: ${title}`}
    className="group relative block w-full overflow-hidden rounded-hb border border-hb-line"
  >
    {coverUrl ? (
      <img
        src={coverUrl}
        alt=""
        className={cn(shape === "square" ? "aspect-square" : "aspect-video", "w-full object-cover")}
      />
    ) : (
      // Fallback uden cover: REN rolig flade — ingen titel-tekst (alle
      // kaldere viser titlen over playeren, og aria-label bærer den for
      // skærmlæsere), så play-cirklen ikke lander oven i tekst.
      <span
        className={cn(
          shape === "square" ? "aspect-square" : "aspect-video",
          "block w-full bg-hb-sage/30",
        )}
      />
    )}
    {/* Sløret gælder KUN over et cover (læsbarheds-kontrast for
        play-cirklen på billeder); uden cover er hvilefladen ren, og
        hover-tonen dæmpet. */}
    <span
      className={cn(
        "absolute inset-0 flex items-center justify-center transition-colors",
        coverUrl ? "bg-hb-ink/10 group-hover:bg-hb-ink/20" : "group-hover:bg-hb-ink/10",
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-hb-evergreen text-white shadow-hb-hover transition-transform group-hover:scale-105">
        <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
      </span>
    </span>
  </button>
);

/** Polering #1 — fælles main-layout, ÉT sted for alle main-varianter:
    m. medie → TO-SPALTET på md+ (medie venstre ~42 %, tekst højre m.
    luft); mobil: medie over tekst; uden medie → tekst i fuld bredde
    (den variant var allerede god — uændret udtryk). To medie-former:
    - coverUrl (push/redaktionelt/evergreen): billedet FYLDER spalten
      (absolute-fill + object-cover; aspect-[3/2] på mobil, md+ følger
      tekstens højde via flex-stretch) — 21:9-dominansen er væk.
    - player (video/podcast): gate/afspiller beholder sit EGET format
      og ligger roligt centreret i spalten (en iframe/audio-bar må ikke
      strækkes). */
const MainStoryShell = ({
  coverUrl,
  player,
  children,
}: {
  coverUrl?: string | null;
  player?: React.ReactNode | null;
  children: React.ReactNode;
}) => {
  if (!player && !coverUrl) {
    return <HbCard className="p-6 md:p-8">{children}</HbCard>;
  }
  return (
    <HbCard className="overflow-hidden">
      <div className="md:flex md:min-h-[280px]">
        {player ? (
          <div className="p-6 pb-0 md:w-[42%] md:shrink-0 md:self-center md:py-6 md:pl-6 md:pr-0">
            {player}
          </div>
        ) : (
          <div className="relative aspect-[3/2] md:aspect-auto md:w-[42%] md:shrink-0">
            <img src={coverUrl!} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </div>
        )}
        <div className="min-w-0 md:flex-1">
          <div className="p-6 md:p-8">{children}</div>
        </div>
      </div>
    </HbCard>
  );
};

/** "Denne uges video"-kortet (bølge 1, PR 3 + PR A): valgt m. den DELTE
    dom (pickActiveWeekVideo). INGEN autoplay: kortet viser cover m.
    play-knap, og afspilleren monteres FØRST ved klik — Bunny via det
    eksisterende get-video-embed-flow (HbVideoEmbed 1:1 inkl. loading-/
    fejltilstande, no-op-callbacks: forsiden skriver ikke progress);
    YouTube via nocookie-iframe m. autoplay=1 så FØRSTE klik også starter
    afspilningen. Bunny-cover hentes som Akademiets covers
    (getAssetPreviewUrl, signeret URL); YouTube-cover fra i.ytimg.com.
    Alt andet eksternt → "Åbn"-knap. PR B3: variant-prop — "side" er den
    hidtidige form (p-4, alm. brødskrift-titel); "main" er STOR form
    (hovedpladsen når pushet mangler: editorial-titel, mere luft) m.
    SAMME player-blok — gate/afspiller-logikken er delt, kun rammen
    skifter. */
const WeekVideoCard = ({ video, variant }: { video: ContentItem; variant: StoryVariant }) => {
  const [playing, setPlaying] = useState(false);
  const marker = publishedMarker(video.published_at ?? video.created_at);
  const youTubeId = video.media_provider === "external" ? extractYouTubeId(video.external_url) : null;
  const isBunny = video.media_provider === "bunny" && Boolean(video.bunny_video_id);

  // Bunny-cover som Akademiet henter covers: signeret URL fra content-assets.
  const coverQuery = useQuery({
    queryKey: ["boardroom", "week-video-cover", video.cover_path ?? null],
    queryFn: () => getAssetPreviewUrl(video.cover_path as string),
    enabled: isBunny && !!video.cover_path,
    staleTime: 30 * 60_000,
  });
  // Manuelt cover_path VINDER; mangler det (38 af 39 videoer), falder
  // Bunny-grenen tilbage til auto-thumbnailet fra pull zonen (usigneret,
  // referrer-gated — se bunnyMedia.ts). YouTube-grenen uændret.
  const coverUrl = isBunny
    ? coverQuery.data ?? bunnyThumbnailUrl(video.bunny_video_id)
    : youTubeId
      ? `https://i.ytimg.com/vi/${youTubeId}/hqdefault.jpg`
      : null;

  const player = isBunny ? (
    playing ? (
      <HbVideoEmbed itemId={video.id} resumeAt={null} onPosition={() => {}} onCompleted={() => {}} />
    ) : (
      <PlayCover coverUrl={coverUrl} title={video.title} onPlay={() => setPlaying(true)} />
    )
  ) : youTubeId ? (
    playing ? (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${youTubeId}?autoplay=1`}
        title={video.title}
        className="aspect-video w-full rounded-hb border border-hb-line bg-black"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    ) : (
      <PlayCover coverUrl={coverUrl} title={video.title} onPlay={() => setPlaying(true)} />
    )
  ) : video.external_url ? (
    <a href={video.external_url} target="_blank" rel="noopener noreferrer">
      <HbButton variant="secondary" className="h-9 px-4 text-sm">
        <ExternalLink className="h-4 w-4" />
        Åbn videoen
      </HbButton>
    </a>
  ) : null;

  if (variant === "main") {
    // Polering #1: gaten/afspilleren i venstre spalte, teksten højre.
    return (
      <MainStoryShell player={player}>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
          Denne uges video
          {marker && <span className="ml-2 normal-case tracking-normal text-hb-ink-soft">· {marker}</span>}
        </p>
        <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
          {video.title}
        </h2>
        {video.description && (
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{video.description}</p>
        )}
        {video.duration_seconds != null && (
          <p className="mt-2 text-sm text-hb-ink-soft">{formatDuration(video.duration_seconds)}</p>
        )}
      </MainStoryShell>
    );
  }

  // Redesign: tile-form — ingen ramme/kortbaggrund; player-blokken
  // (inkl. PlayCover-gaten) er uændret i funktion.
  return (
    <div className="border-t border-hb-line pt-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
        Denne uges video
        {marker && <span className="ml-2 normal-case tracking-normal">· {marker}</span>}
      </p>
      <p className="mt-2 text-[15px] font-medium leading-snug text-hb-ink">{video.title}</p>
      {video.description && (
        <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{video.description}</p>
      )}
      {video.duration_seconds != null && (
        <p className="mt-1.5 text-xs text-hb-ink-soft">{formatDuration(video.duration_seconds)}</p>
      )}
      <div className="mt-3">{player}</div>
    </div>
  );
};

/** Cover-opslag for indslags-kort — samme signerede-URL-mønster som
    Akademiets covers (getAssetPreviewUrl mod content-assets). */
const useCoverUrl = (coverPath: string | null): string | null =>
  useQuery({
    queryKey: ["boardroom", "story-cover", coverPath],
    queryFn: () => getAssetPreviewUrl(coverPath as string),
    enabled: !!coverPath,
    staleTime: 30 * 60_000,
  }).data ?? null;

/** Anchor-feedets beskrivelser er HTML i CDATA — strippes til ren tekst
    til teaseren (DOMParser findes i browser og jsdom). */
const stripHtml = (html: string): string =>
  new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";

const truncateText = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`;

/** Redaktionelt indslag (PR B3): cover + titel + hvorfor-linje + evt.
    citat + "Læs artiklen" i nyt vindue. Felterne er B1's metadata-
    konvention (link/quote — jsonb, ingen kolonner). */
const RedaktioneltCard = ({ item, variant }: { item: ContentItem; variant: StoryVariant }) => {
  const coverUrl = useCoverUrl(item.cover_path ?? null);
  const metadata = (item.metadata as Record<string, unknown>) ?? {};
  const link = (metadata.link as string) || null;
  const quote = (metadata.quote as string) || null;
  const marker = publishedMarker(item.published_at ?? item.created_at);

  if (variant === "side") {
    return (
      <div className="border-t border-hb-line pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
          Redaktionelt{marker && <span className="ml-2 normal-case tracking-normal">· {marker}</span>}
        </p>
        <p className="mt-2 text-[15px] font-medium leading-snug text-hb-ink">{item.title}</p>
        {item.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{item.description}</p>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-hb-rust underline-offset-4 hover:underline"
          >
            Læs artiklen
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  return (
    <MainStoryShell coverUrl={coverUrl}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
        Redaktionelt{marker && <span className="ml-2 normal-case tracking-normal text-hb-ink-soft">· {marker}</span>}
      </p>
      <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
        {item.title}
      </h2>
      {item.description && (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{item.description}</p>
      )}
      {quote && (
        <blockquote className="mt-5 max-w-2xl border-l-2 border-hb-evergreen pl-4 font-editorial text-xl italic leading-snug text-hb-ink">
          "{quote}"
        </blockquote>
      )}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block">
          <HbButton variant="secondary" className="h-9 px-4 text-sm">
            <ExternalLink className="h-4 w-4" />
            Læs artiklen
          </HbButton>
        </a>
      )}
    </MainStoryShell>
  );
};

/** Hb-stylet lydafspiller (podcast-tile): den nøgne <audio controls>
    gav browser-chrome og download-menu. <audio>-elementet er nu SKJULT
    og styres af play/pause-cirklen (samme udtryk som PlayCovers knap),
    en klikbar forløbslinje i hb-line/hb-evergreen og tiden som
    "12:04 / 47:10". Monteres fortsat FØRST ved klik på gaten og
    autostarter dér — monteringen ER klikket (PR A-reglen intakt). */
const HbAudioPlayer = ({ src, title }: { src: string; title: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  const seek = (event: React.MouseEvent<HTMLButtonElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * duration;
  };

  const progress = duration ? Math.min(currentTime / duration, 1) : 0;

  return (
    <div className="flex items-center gap-3 rounded-hb border border-hb-line bg-hb-surface px-3 py-2.5">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- eksternt podcast-feed uden tekstspor */}
      <audio
        ref={audioRef}
        src={src}
        autoPlay
        onPlay={() => setAudioPlaying(true)}
        onPause={() => setAudioPlaying(false)}
        onEnded={() => setAudioPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        className="hidden"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={audioPlaying ? `Pause: ${title}` : `Afspil: ${title}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hb-evergreen text-white shadow-hb-hover transition-transform hover:scale-105"
      >
        {audioPlaying ? (
          <Pause className="h-4 w-4" fill="currentColor" />
        ) : (
          <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
        )}
      </button>
      <button
        type="button"
        onClick={seek}
        aria-label="Spol i afspilningen"
        className="relative h-1.5 min-w-0 flex-1 cursor-pointer overflow-hidden rounded-full bg-hb-line"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-hb-evergreen"
          style={{ width: `${progress * 100}%` }}
        />
      </button>
      <span className="shrink-0 text-xs tabular-nums text-hb-ink-soft">
        {formatDuration(Math.floor(currentTime)) ?? "0:00"} /{" "}
        {duration != null ? formatDuration(Math.floor(duration)) ?? "0:00" : "–:––"}
      </span>
    </div>
  );
};

/** Podcast-kortet (PR B3): nyeste episode fra feedet (dum proxy + ren
    parser, B1/B2). INGEN LYD FØR KLIK (PR A-reglen gælder også podcast):
    afspilleren monteres FØRST ved klik på PlayCover-gaten — autostart er
    OK dér, monteringen ER klikket. Uden audioUrl: "Åbn episoden"-link. */
const PodcastCard = ({ episode, variant }: { episode: PodcastEpisode; variant: StoryVariant }) => {
  const [playing, setPlaying] = useState(false);
  // Sæson/episode-etiket i stedet for dato (podcast-tile): "S2E2" når
  // BEGGE findes, ellers ingenting — bevidst INGEN dato-fallback (en
  // elleve måneder gammel dato skal ikke vises).
  const seasonLabel =
    episode.season != null && episode.episode != null
      ? `S${episode.season}E${episode.episode}`
      : null;
  const teaser = episode.description
    ? truncateText(stripHtml(episode.description), variant === "main" ? 200 : 110)
    : null;

  const player =
    playing && episode.audioUrl ? (
      // Coveret BLIVER stående når afspilningen starter — ellers
      // kollapser podcast-spalten til tom luft ved siden af
      // video-spalten. Nu som RENT billede uden gate/overlay
      // (afspilningen styres af afspilleren nedenunder); separat <img>
      // frem for en "inert" PlayCover-prop, fordi gaten er en <button>
      // m. Afspil-aria og ikke skal kunne være en ikke-knap.
      <div>
        {episode.imageUrl && (
          <img
            src={episode.imageUrl}
            alt=""
            className="aspect-square w-full rounded-hb border border-hb-line object-cover"
          />
        )}
        <div className={cn(episode.imageUrl && "mt-3")}>
          <HbAudioPlayer src={episode.audioUrl} title={episode.title} />
        </div>
      </div>
    ) : episode.audioUrl ? (
      // Polering #3: kvadratisk ramme — episode-covers er 1:1 og skal
      // ikke beskæres i bredformat (hoveder/tekst klippes).
      <PlayCover
        coverUrl={episode.imageUrl}
        title={episode.title}
        onPlay={() => setPlaying(true)}
        shape="square"
      />
    ) : episode.link ? (
      <a href={episode.link} target="_blank" rel="noopener noreferrer">
        <HbButton variant="secondary" className="h-9 px-4 text-sm">
          <ExternalLink className="h-4 w-4" />
          Åbn episoden
        </HbButton>
      </a>
    ) : null;

  if (variant === "side") {
    return (
      <div className="border-t border-hb-line pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
          Podcast{seasonLabel && <span className="ml-2 normal-case tracking-normal">· {seasonLabel}</span>}
        </p>
        <p className="mt-2 text-[15px] font-medium leading-snug text-hb-ink">{episode.title}</p>
        {teaser && <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{teaser}</p>}
        {episode.durationSeconds != null && (
          <p className="mt-1.5 text-xs text-hb-ink-soft">{formatDuration(episode.durationSeconds)}</p>
        )}
        <div className="mt-3">{player}</div>
      </div>
    );
  }

  // Polering #1: gaten (kvadratisk albumkunst) i venstre spalte, teksten
  // højre — samme fælles layout-greb som de øvrige main-varianter.
  return (
    <MainStoryShell player={player}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
        Podcast{seasonLabel && <span className="ml-2 normal-case tracking-normal text-hb-ink-soft">· {seasonLabel}</span>}
      </p>
      <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
        {episode.title}
      </h2>
      {teaser && <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{teaser}</p>}
      {episode.durationSeconds != null && (
        <p className="mt-2 text-sm text-hb-ink-soft">{formatDuration(episode.durationSeconds)}</p>
      )}
    </MainStoryShell>
  );
};

/** Evergreen-indslaget (PR B3): biblioteket der bærer forsiden når alt
    andet er stille — markeret "Værd at se igen", BEVIDST uden
    tidsmarkering (indslaget er tidløst; en dato ville modsige det). */
const EvergreenCard = ({ item, variant }: { item: ContentItem; variant: StoryVariant }) => {
  const coverUrl = useCoverUrl(item.cover_path ?? null);
  const link = (((item.metadata as Record<string, unknown>) ?? {}).link as string) || null;

  if (variant === "side") {
    return (
      <div className="border-t border-hb-line pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
          Værd at se igen
        </p>
        <p className="mt-2 text-[15px] font-medium leading-snug text-hb-ink">{item.title}</p>
        {item.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{item.description}</p>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-hb-rust underline-offset-4 hover:underline"
          >
            Se indslaget
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  return (
    <MainStoryShell coverUrl={coverUrl}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Værd at se igen</p>
      <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
        {item.title}
      </h2>
      {item.description && (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{item.description}</p>
      )}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block">
          <HbButton variant="secondary" className="h-9 px-4 text-sm">
            <ExternalLink className="h-4 w-4" />
            Se indslaget
          </HbButton>
        </a>
      )}
    </MainStoryShell>
  );
};

type BandItem = ContentItem | PodcastEpisode;

/** Rykkelistens FASTE rækkefølge som rang — bruges til at holde podcast-
    skeletonets plads i sidespalten mens feedet hentes. */
const KIND_RANK: Record<StoryKind, number> = {
  push: 0,
  video: 1,
  redaktionelt: 2,
  podcast: 3,
  evergreen: 4,
};

/** Polering #2 (begrundet valg): kolonneantal AFHÆNGIGT af antallet frem
    for fast grid. Fast cols-3 efterlader én enlig ved 4 (3+1), og fast
    cols-4 gør det samme ved 5 (4+1) — ingen fast værdi dækker hele
    intervallet. Mapningen 2→2 · 3→3 · 4→4 på lg (2+2 på md) · 5-6→3
    (3+2 / 3+3) efterlader ALDRIG præcis én tile alene på sidste række
    for 2-6 elementer — på hverken md eller lg. 1 element → fuld bredde. */
const tileColsClass = (count: number): string => {
  switch (count) {
    case 2:
      return "md:grid-cols-2";
    case 3:
      return "md:grid-cols-3";
    case 4:
      return "md:grid-cols-2 lg:grid-cols-4";
    case 5:
    case 6:
      return "md:grid-cols-3";
    default:
      return count <= 1 ? "" : "md:grid-cols-3";
  }
};

/** Dispatcher: én kandidat → det rigtige kort i den rigtige variant.
    StoryCandidate<T> er kind-agnostisk (dommen er låst) — kandidat-
    byggeren i BoardroomView garanterer kind↔type-parringen, så casts
    her er sikre pr. konstruktion. */
const StoryCard = ({
  story,
  variant,
  pushSender,
  pushCoverUrl,
}: {
  story: StoryCandidate<BandItem>;
  variant: StoryVariant;
  pushSender: { full_name: string; avatar_url: string | null } | null;
  pushCoverUrl: string | null;
}) => {
  switch (story.kind) {
    case "push":
      return (
        <PushStory
          push={story.item as ContentItem}
          sender={pushSender}
          coverUrl={pushCoverUrl}
          variant={variant}
        />
      );
    case "video":
      return <WeekVideoCard video={story.item as ContentItem} variant={variant} />;
    case "redaktionelt":
      return <RedaktioneltCard item={story.item as ContentItem} variant={variant} />;
    case "podcast":
      return <PodcastCard episode={story.item as PodcastEpisode} variant={variant} />;
    case "evergreen":
      return <EvergreenCard item={story.item as ContentItem} variant={variant} />;
  }
};

/** Reserveret højde mens podcast-feedet hentes (ingen layout-hop):
    main-formen matcher det to-spaltede kort (polering #1); side-formen
    den rammeløse tile — m. KVADRATISK medie-blok, for skeletonet holder
    netop podcastens plads, og dens cover er 1:1 (polering #3). */
const StorySkeleton = ({ variant }: { variant: StoryVariant }) =>
  variant === "main" ? (
    <HbCard className="overflow-hidden" aria-hidden>
      <div className="md:flex md:min-h-[280px]">
        <div className="aspect-[3/2] w-full animate-pulse bg-hb-line/40 md:aspect-auto md:w-[42%] md:shrink-0" />
        <div className="min-w-0 md:flex-1">
          <div className="p-6 md:p-8">
            <div className="h-3 w-28 animate-pulse rounded bg-hb-line/40" />
            <div className="mt-4 h-9 w-2/3 animate-pulse rounded bg-hb-line/60" />
            <div className="mt-4 h-4 w-5/6 animate-pulse rounded bg-hb-line/40" />
          </div>
        </div>
      </div>
    </HbCard>
  ) : (
    <div className="border-t border-hb-line pt-4" aria-hidden>
      <div className="h-3 w-24 animate-pulse rounded bg-hb-line/40" />
      <div className="mt-2.5 h-4 w-3/4 animate-pulse rounded bg-hb-line/60" />
      <div className="mt-3 aspect-square w-full animate-pulse rounded bg-hb-line/40" />
    </div>
  );

/** Tal-strip (lag 3): senest godkendte periode fra facts-laget — indhold
    og kilder uændret; kun placeringen er flyttet nederst. */
const TalStrip = ({
  hasFacts,
  processing,
  periodLabel,
  revenue,
  result,
  bank,
}: {
  hasFacts: boolean;
  processing: boolean;
  periodLabel: string | null;
  revenue: number | null;
  result: number | null;
  bank: number | null;
}) => {
  if (!hasFacts) {
    return (
      <HbCard className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine tal</p>
          <p className="mt-1 text-sm text-hb-ink-soft">
            {processing
              ? "Dine tal er ved at blive behandlet — de lander her, så snart de er godkendt."
              : "Ingen godkendte tal endnu — upload din første rapport, så fylder vi båndet ud."}
          </p>
        </div>
        <Link
          to="/reports"
          className="shrink-0 whitespace-nowrap text-sm text-hb-rust underline-offset-4 hover:underline"
        >
          {processing ? "Se status" : "Kom i gang med dine tal"}
        </Link>
      </HbCard>
    );
  }

  const figures: { label: string; value: number | null }[] = [
    { label: "Omsætning", value: revenue },
    { label: "Resultat f. skat", value: result },
    { label: "Bank", value: bank },
  ];

  return (
    <HbCard className="flex flex-col gap-6 p-6 md:flex-row md:items-center">
      <div className="shrink-0 md:w-48">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine tal</p>
        <p className="mt-1 whitespace-nowrap text-sm text-hb-ink-soft">
          Senest godkendt: {periodLabel}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-4 md:flex-row md:items-center md:justify-around md:gap-6">
        {figures.map((figure) => (
          <div key={figure.label}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              {figure.label}
            </p>
            {/* Fortegns-tonen: ordret samme udtryk som resten af
                platformen (HbBudgetEditTable:625). */}
            <p
              className={cn(
                "mt-1 font-editorial text-2xl font-medium",
                figure.value != null && figure.value < 0 ? "text-hb-rust" : "text-hb-ink",
              )}
            >
              {figure.value != null ? formatDKK(figure.value) : "—"}
            </p>
          </div>
        ))}
      </div>
      <Link
        to="/kpis"
        className="shrink-0 whitespace-nowrap text-sm text-hb-rust underline-offset-4 hover:underline"
      >
        Se dine tal
      </Link>
    </HbCard>
  );
};

/** Lag 1-kortet: #1 stort, #2-4 som stille linjer. weekly_focus læses
    INLINE (headline + summary) — kontrakten "Ugens fokus er klar" → "/".
    CTA-knap vises kun når punktet peger VÆK fra forsiden (ctaHref ≠ "/").
    Skeleton m. reserveret højde — ingen layout-hop. */
const FocusCard = ({
  loading,
  items,
  weeklySummary,
  nextEntry,
  journeyLine,
}: {
  loading: boolean;
  items: FocusItem[];
  weeklySummary: string | null;
  nextEntry: AkademiItem | undefined;
  /** Anerkendelses-linjen (bølge 3) — null når alle tal er 0. */
  journeyLine: string | null;
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const displayed = items.slice(0, 4);
  const primary = displayed[0];
  const quiet = displayed.slice(1);

  const inlineBody = (item: FocusItem) =>
    item.kind === "weekly-focus" && weeklySummary ? weeklySummary : null;

  // Redesign (ægte form): primær handling i STOR editorial-skala m.
  // manchet i rolig grad og CTA'en i bunden af den primære zone m. luft
  // omkring — ikke klemt op under teksten. Sekundære punkter (#2-4) som
  // tydeligt adskilt liste under en hb-line. Tom-tilstanden bærer SAMME
  // typografiske vægt som den aktive — sidens vigtigste plads må ikke
  // være svagest den uge, hvor medlemmet har styr på det hele.
  return (
    <HbCard className="min-h-[230px] p-7 md:p-9">
      {loading ? (
        <div aria-hidden>
          <div className="h-10 w-2/3 animate-pulse rounded bg-hb-line/60" />
          <div className="mt-5 h-4 w-full animate-pulse rounded bg-hb-line/40" />
          <div className="mt-2.5 h-4 w-5/6 animate-pulse rounded bg-hb-line/40" />
          <div className="mt-8 h-11 w-44 animate-pulse rounded-full bg-hb-line/40" />
        </div>
      ) : primary ? (
        <div>
          <h3 className="font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
            {primary.title}
          </h3>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">
            {primary.description}
          </p>
          {inlineBody(primary) && (
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-hb-ink">{inlineBody(primary)}</p>
          )}
          {primary.ctaHref !== "/" && (
            <Link to={primary.ctaHref} className="mt-7 inline-block">
              <HbButton>{primary.ctaLabel}</HbButton>
            </Link>
          )}
          {quiet.length > 0 && (
            <ul className="mt-9 w-full border-t border-hb-line pt-4">
              {quiet.map((item) => (
                <li key={item.key}>
                  {item.ctaHref !== "/" ? (
                    <Link
                      to={item.ctaHref}
                      className="flex items-center gap-3 py-2.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpandedKey((k) => (k === item.key ? null : item.key))}
                      className="flex w-full items-center gap-3 py-2.5 text-left text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {expandedKey === item.key ? (
                        <ChevronUp className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      )}
                    </button>
                  )}
                  {expandedKey === item.key && (
                    <p className="pb-2 pl-0 text-sm leading-relaxed text-hb-ink-soft">
                      {item.description}
                      {inlineBody(item) && <span className="mt-1 block text-hb-ink">{inlineBody(item)}</span>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <h3 className="font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
            Alt er ajour.
          </h3>
          {/* Anerkendelse frem for tomhed (bølge 3): samme typografiske
              vægt som den aktive tilstand — overskrift + linje i læsbar
              grad. Alle tal nul (nyt medlem) → den hidtidige sætning
              uændret. */}
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">
            {journeyLine ?? "Rapport, refleksion og milestones er på plads — brug momentum i dit forløb."}
          </p>
        </div>
      )}
      {!loading && nextEntry && (
        <Link
          to={`/akademiet/${nextEntry.item.area}/${nextEntry.item.slug}`}
          className="mt-6 inline-block text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-ink hover:underline"
        >
          Eller fortsæt dit forløb: {nextEntry.item.title}
        </Link>
      )}
    </HbCard>
  );
};

export const BoardroomView = () => {
  const { user, profile, companyId } = useAuth();
  const akademi = useAkademiData();
  const { data: facts = [], isLoading: factsLoading } = useCompanyFacts();

  // ── Katalog-afledninger (deler cache med Akademiet) ─────────────────────
  const items = akademi.orderedByArea;
  const pushItem = useMemo(
    () =>
      pickActivePush(
        (items.get("push") ?? []).map((entry) => entry.item),
        new Date(),
      ),
    [items],
  );
  const latestTalk = useMemo(
    () =>
      [...(items.get("talks") ?? [])]
        .map((entry) => entry.item)
        .sort(byPublishedDesc)[0],
    [items],
  );
  const weekVideo = useMemo(
    () =>
      pickActiveWeekVideo(
        (items.get("ugens_video") ?? []).map((entry) => entry.item),
        new Date(),
      ),
    [items],
  );

  // ── Rykkelistens øvrige kandidater (PR B3) — hver hentes UAFHÆNGIGT ─────
  // Kataloget fra useAkademiData er published-only (listPublishedItems), så
  // status-filteret er allerede indfriet før dommene anvendes.
  const redaktioneltItem = useMemo(
    () =>
      pickActiveItem(
        (items.get("redaktionelt") ?? []).map((entry) => entry.item),
        new Date(),
      ),
    [items],
  );
  const evergreenItem = useMemo(
    () =>
      pickEvergreen(
        (items.get("evergreen") ?? []).map((entry) => entry.item),
        new Date(),
      ),
    [items],
  );

  // Podcast: dum proxy (podcast-rss, B2) + ren parser (parsePodcastFeed,
  // B1) → nyeste episode. FEJL/tom → null: queryFn'en kaster ALDRIG, så
  // medlemmet ser aldrig en fejl — kandidaten falder bare ud af
  // rykkelisten. invoke() bærer sessionens JWT (Bucket A-kravet).
  const podcastQuery = useQuery({
    queryKey: ["boardroom", "podcast-latest"],
    queryFn: async (): Promise<PodcastEpisode | null> => {
      try {
        const { data, error } = await supabase.functions.invoke("podcast-rss");
        if (error) return null;
        // functions-js afleverer ikke-JSON-svar som tekst; Blob-grenen er
        // defensiv mod content-type-afvigelser.
        const xml =
          typeof data === "string" ? data : data instanceof Blob ? await data.text() : null;
        if (!xml) return null;
        const episodes = parsePodcastFeed(xml);
        if (episodes.length === 0) return null;
        return [...episodes].sort((a, b) =>
          (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
        )[0];
      } catch {
        return null;
      }
    },
    staleTime: 30 * 60_000,
    retry: 1,
    enabled: !!user,
  });
  const podcastEpisode = podcastQuery.data ?? null;
  const podcastPending = !!user && podcastQuery.isPending;

  // Rykkelisten (LÅST dom): første ikke-null kandidat vinder hovedpladsen.
  const band = useMemo(
    () =>
      pickMainStory<BandItem>([
        pushItem ? { kind: "push", item: pushItem } : null,
        weekVideo ? { kind: "video", item: weekVideo } : null,
        redaktioneltItem ? { kind: "redaktionelt", item: redaktioneltItem } : null,
        podcastEpisode ? { kind: "podcast", item: podcastEpisode } : null,
        evergreenItem ? { kind: "evergreen", item: evergreenItem } : null,
      ]),
    [pushItem, weekVideo, redaktioneltItem, podcastEpisode, evergreenItem],
  );

  // ── "Siden sidst"-linjen (bølge 3) ──────────────────────────────────────
  // READ-THEN-STAMP på localStorage: forrige besøgs stempel fanges i
  // lazy-initializeren FØR det nye skrives — én gang pr. mount, så et
  // refresh midt i besøget ikke nulstiller linjen utilsigtet. Pr. enhed
  // (recon §1: bevidst mindste vej — linjen er en blød nudge, ikke en
  // indbakke-badge; ingen migration/RLS-flade).
  const [lastVisitIso] = useState<string | null>(() => {
    try {
      const prev = localStorage.getItem("hb.forside.lastVisitAt");
      localStorage.setItem("hb.forside.lastVisitAt", new Date().toISOString());
      return prev;
    } catch {
      return null; // storage utilgængelig (privat tilstand m.m.) → linjen tier
    }
  });

  // Kandidatlisten til tællingen = båndets kandidater MINUS evergreen:
  // rotationen er deterministisk (isoWeekNumber % length) og indslaget
  // bevidst tidløst — talte den med, ville linjen råbe "nyt" hver mandag
  // uden at noget faktisk var nyt. Dommen selv er dum og tæller det den
  // får; fravalget er kalderens (dokumenteret i pushSelection-headeren).
  const newsCount = useMemo(
    () =>
      countNewSince(
        [
          pushItem ? { publishedAt: pushItem.published_at ?? pushItem.created_at } : null,
          weekVideo ? { publishedAt: weekVideo.published_at ?? weekVideo.created_at } : null,
          redaktioneltItem
            ? { publishedAt: redaktioneltItem.published_at ?? redaktioneltItem.created_at }
            : null,
          podcastEpisode ? { publishedAt: podcastEpisode.publishedAt } : null,
        ].filter((c): c is NewsCandidate => c != null),
        lastVisitIso,
      ),
    [pushItem, weekVideo, redaktioneltItem, podcastEpisode, lastVisitIso],
  );

  // 0 → ingen linje. Tidsdel: ≤7 dage → ugedag ("siden i tirsdags"),
  // ellers den rolige fallback (en gammel dato ville udstille fraværet).
  const newsLine = useMemo(() => {
    if (newsCount === 0 || !lastVisitIso) return null;
    const since = new Date(lastVisitIso);
    const days = (Date.now() - since.getTime()) / 86400000;
    const sincePart =
      !Number.isNaN(since.getTime()) && days <= 7
        ? `siden i ${since.toLocaleDateString("da-DK", { weekday: "long" })}s`
        : "siden dit sidste besøg";
    return `${newsCount === 1 ? "1 ny ting" : `${newsCount} nye ting`} ${sincePart}`;
  }, [newsCount, lastVisitIso]);

  // Historik (PR B3): seneste redaktionelle som rolige linjer, kollapset.
  const [historikOpen, setHistorikOpen] = useState(false);
  const redaktioneltHistory = useMemo(
    () =>
      [...(items.get("redaktionelt") ?? [])]
        .map((entry) => entry.item)
        .sort(byPublishedDesc)
        .slice(0, 5),
    [items],
  );

  // Afsender-portrættet (PR 3): profiler slås op via den SAMME RPC som
  // medlems-chatten bruger ("Fetch all advisors for member header",
  // CompanyChatPane:163-176 — get_all_advisor_profiles er security definer,
  // så MEDLEMMER må kalde den; direkte profiles-select er ikke garanteret
  // for medlemmer). Kun når pushet bærer et author_user_id.
  const pushAuthorUserId =
    ((pushItem?.metadata as Record<string, unknown> | null)?.author_user_id as string) || null;
  const { data: pushSender = null } = useQuery({
    queryKey: ["boardroom", "push-sender", pushAuthorUserId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_all_advisor_profiles" as any);
      if (error) {
        console.error("Failed to fetch advisor profiles:", error);
        return null;
      }
      const match = ((data as any[]) || []).find((r: any) => r.user_id === pushAuthorUserId);
      return match
        ? { full_name: match.full_name as string, avatar_url: (match.avatar_url as string) ?? null }
        : null;
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!pushAuthorUserId,
  });

  // Push-coveret (PR A) — samme signerede-URL-mønster som Akademiets covers
  // (getAssetPreviewUrl mod content-assets).
  const { data: pushCoverUrl = null } = useQuery({
    queryKey: ["boardroom", "push-cover", pushItem?.cover_path ?? null],
    queryFn: () => getAssetPreviewUrl(pushItem!.cover_path as string),
    enabled: !!pushItem?.cover_path,
    staleTime: 30 * 60_000,
  });

  // Forløbs-linket — samme dom som Akademi-forsiden.
  const nextEntry = useMemo(() => {
    const inAkademi = (entry: AkademiItem) =>
      AREAS.find((a) => a.key === entry.item.area)?.akademi === true;
    return AREAS.filter((area) => area.akademi)
      .flatMap((area) => akademi.orderedByArea.get(area.key) ?? [])
      .find(
        (entry) =>
          isTrackedEntry(entry) && inAkademi(entry) && entry.drip.unlocked && entry.state !== "done",
      );
  }, [akademi.orderedByArea]);

  // ── Fokus-motorens inputs (kilderne arvet ordret fra ActionCenter) ──────
  const processedQuery = useQuery({
    queryKey: ["boardroom", "processed-reports", companyId],
    queryFn: async () => {
      // Samme select-form som DashboardActionCenter (110-113).
      const { data } = await (supabase
        .from("financial_reports")
        .select(`report_period, ${REPORT_OVERRIDE_SELECT}`) as any)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("status", "processed");
      const keys = ((data ?? []) as ReportData[])
        .map((r) => getEffectiveReportPeriodKey(r))
        .filter(Boolean) as string[];
      return new Set(keys);
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  const milestonesQuery = useQuery({
    queryKey: ["boardroom", "milestones", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("milestones")
        .select("title, deadline, progress, status")
        .eq("company_id", companyId!);
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  const pulseQuery = useQuery({
    queryKey: ["boardroom", "pulse", companyId],
    queryFn: async () => {
      const prev = new Date();
      prev.setMonth(prev.getMonth() - 1);
      const periodKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      const { data } = await supabase
        .from("pulse_checkins")
        .select("id")
        .eq("company_id", companyId!)
        .eq("period_key", periodKey)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  // Ugens fokus — query ordret fra DashboardActionCenter:71-85
  // (company_id + week_key + status-listen).
  const weekKey = getISOWeekKey(new Date());
  const weeklyFocusQuery = useQuery({
    queryKey: ["boardroom", "weekly-focus", companyId, weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_focus")
        .select("*")
        .eq("company_id", companyId!)
        .eq("week_key", weekKey)
        .in("status", ["active", "quiet", "no_data"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Åbne handlinger — query + sortering ordret fra
  // DashboardActionCenter:200-208 (high → medium → low, dernæst ældste).
  const actionsQuery = useQuery({
    queryKey: ["boardroom", "company-actions", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("company_actions").select("id, title, context, priority, status, created_at")
        .eq("company_id", companyId!).eq("status", "open").order("created_at", { ascending: false }).limit(10) as any;
      return ((data || []) as any[]).sort((a: any, b: any) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] ?? 1) - (order[b.priority] ?? 1) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  // Ulæste beskeder — begge tællinger ordret fra
  // DashboardActionCenter:150-160 (user-beskeder + agent-beskeder).
  const unreadQuery = useQuery({
    queryKey: ["boardroom", "unread", companyId, user?.id],
    queryFn: async () => {
      const { data: conv } = await supabase.from("conversations").select("id").eq("company_id", companyId!).maybeSingle();
      if (!conv?.id) return { userCount: 0, agentCount: 0 };
      const { count } = await supabase.from("messages").select("*", { count: "exact", head: true })
        .eq("conversation_id", conv.id).neq("sender_id", user!.id).is("read_at", null).eq("message_type", "user");
      const { count: agentCount } = await supabase.from("messages").select("*", { count: "exact", head: true })
        .eq("conversation_id", conv.id).is("read_at", null).eq("message_type", "system").eq("context_type", "agent");
      return { userCount: count ?? 0, agentCount: agentCount ?? 0 };
    },
    enabled: !!companyId && !!user,
    staleTime: 60_000,
  });

  // Løftestænger uden milestone — handouts.levers minus junction-rækkerne
  // (handout_lever_milestones); deterministisk orden: moduleOrder → index.
  const leversQuery = useQuery({
    queryKey: ["boardroom", "unlinked-levers", companyId],
    queryFn: async () => {
      const { data: handoutRows } = await supabase
        .from("handouts")
        .select("id, module, levers")
        .eq("company_id", companyId!);
      const rows = (handoutRows ?? []) as { id: string; module: string; levers: unknown }[];
      if (rows.length === 0) return [];
      const { data: links } = await supabase
        .from("handout_lever_milestones" as any)
        .select("handout_id, lever_index")
        .in("handout_id", rows.map((r) => r.id));
      const linked = new Set(((links ?? []) as any[]).map((l) => `${l.handout_id}:${l.lever_index}`));
      const result: { lever: string; moduleTitle: string }[] = [];
      for (const module of moduleOrder) {
        const row = rows.find((r) => r.module === module);
        if (!row) continue;
        const levers = (row.levers as string[]) || [];
        levers.forEach((lever, index) => {
          if (lever.trim() && !linked.has(`${row.id}:${index}`)) {
            result.push({ lever: lever.trim(), moduleTitle: handoutConfigs[module as HandoutModule]?.title ?? module });
          }
        });
      }
      return result;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  const committedKeys = useMemo(() => new Set(facts.map((f) => f.period_key)), [facts]);

  // ── Anerkendelses-linjen til fokus-kortets tom-tilstand (bølge 3) ───────
  // RENT afledt af hånd-data — INGEN nye queries: committedKeys (godkendte
  // facts-perioder, "YYYY-MM"), milestonesQuery (progress >= 100 er SAMME
  // dom som Milestones.tsx:60) og akademi-objektet (isTrackedEntry +
  // state === "done" — B1-video-dommen). BEVIDST ingen nævner: "5 af 6"
  // er mangel-fokus (nævneren siger "du mangler 1") — anerkendelsen
  // tæller det GJORTE. Kun tal > 0 vises; ALLE nul → null, og kortet
  // beholder den nuværende sætning (tomheden må aldrig blive "0
  // rapporter"). Ingen scores, procenter eller sammenligninger.
  const journeyLine = useMemo(() => {
    const year = String(new Date().getFullYear());
    const reportsThisYear = [...committedKeys].filter((k) => k.startsWith(year)).length;
    const milestonesDone = (milestonesQuery.data ?? []).filter((m) => m.progress >= 100).length;
    const akademiDone = [...akademi.orderedByArea.values()]
      .flat()
      .filter((entry) => isTrackedEntry(entry) && entry.state === "done").length;
    const parts: string[] = [];
    if (reportsThisYear > 0)
      parts.push(
        reportsThisYear === 1 ? "1 godkendt rapport i år" : `${reportsThisYear} godkendte rapporter i år`,
      );
    if (milestonesDone > 0)
      parts.push(milestonesDone === 1 ? "1 milepæl nået" : `${milestonesDone} milepæle nået`);
    if (akademiDone > 0)
      parts.push(
        akademiDone === 1 ? "1 video gennemført i Akademiet" : `${akademiDone} videoer gennemført i Akademiet`,
      );
    return parts.length > 0 ? `Og rejsen kan ses: ${parts.join(" · ")}.` : null;
  }, [committedKeys, milestonesQuery.data, akademi.orderedByArea]);

  const focus = useMemo(() => {
    if (!companyId) return []; // advisor uden company-override i byggeperioden
    return deriveFocus({
      now: new Date(),
      processedPeriodKeys: processedQuery.data ?? new Set<string>(),
      committedPeriodKeys: committedKeys,
      milestones: milestonesQuery.data ?? [],
      hasPulseThisMonth: Boolean(pulseQuery.data),
      unreadUserMessages: unreadQuery.data?.userCount ?? 0,
      unreadAgentMessages: unreadQuery.data?.agentCount ?? 0,
      weeklyFocus: weeklyFocusQuery.data
        ? { headline: weeklyFocusQuery.data.headline ?? null, seen: Boolean(weeklyFocusQuery.data.seen_at) }
        : null,
      openActions: (actionsQuery.data ?? []).map((a: any) => ({ id: a.id, title: a.title, priority: a.priority })),
      unlinkedLevers: leversQuery.data ?? [],
    });
  }, [companyId, processedQuery.data, committedKeys, milestonesQuery.data, pulseQuery.data, unreadQuery.data, weeklyFocusQuery.data, actionsQuery.data, leversQuery.data]);

  // Markér ugens fokus som SET når punktet faktisk vises — samme mekanik
  // som DashboardActionCenter:87-98 (mutation + engangs-ref).
  const seenMarked = useRef(false);
  const markSeen = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("weekly_focus").update({ seen_at: new Date().toISOString() } as any).eq("id", id);
    },
  });
  const weeklyDisplayed = focus.slice(0, 4).some((i) => i.kind === "weekly-focus");
  useEffect(() => {
    const row = weeklyFocusQuery.data;
    if (weeklyDisplayed && row && !row.seen_at && !seenMarked.current) {
      seenMarked.current = true;
      markSeen.mutate(row.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyDisplayed, weeklyFocusQuery.data]);

  const focusLoading =
    !!companyId &&
    (processedQuery.isPending ||
      milestonesQuery.isPending ||
      pulseQuery.isPending ||
      weeklyFocusQuery.isPending ||
      actionsQuery.isPending ||
      unreadQuery.isPending ||
      leversQuery.isPending);

  // ── Events-sektionen (egen sektion mellem lag 1 og lag 2) ───────────────
  // Samme kilde som hidtil: listUpcomingEvents (akademiApi.ts:152-162 —
  // status='published', gte(starts_at, nu), order ascending) — kun
  // limit er udvidet fra 1 til 3: live-sessions er en kerneydelse og
  // fortjener de næste 2-3 pladser, ikke én tile i det redaktionelle bånd.
  const { data: events = [] } = useQuery({
    queryKey: ["boardroom", "events"],
    queryFn: () => listUpcomingEvents(3),
    staleTime: 5 * 60_000,
  });

  // ── Tal-strip-afledning (uændret) ───────────────────────────────────────
  const sorted = useMemo(
    () => facts.map((f) => ({ key: f.period_key, kf: factsToDanishMetrics(f.metrics), period: f.period_label })),
    [facts],
  );
  const latestFacts = sorted[sorted.length - 1];
  const bankRow = [...sorted].reverse().find((r) => r.kf.bank_balance != null);
  const processing = sorted.length === 0 && (processedQuery.data?.size ?? 0) > 0;

  const firstName = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "dig";

  if (akademi.loading || factsLoading) {
    return <p className="text-sm text-hb-ink-soft">Henter dit Boardroom…</p>;
  }

  // Kan podcasten stadig ende som HOVEDhistorie? Kun når alle kandidater
  // FØR den i rykkelisten mangler. Så viser hovedpladsen skeleton m.
  // reserveret højde i stedet for at lade evergreen rykke ind og blive
  // skubbet ud igen når feedet lander — ingen indholds-swap/layout-hop.
  const podcastCouldLeadBand = podcastPending && !pushItem && !weekVideo && !redaktioneltItem;
  const hasBand = Boolean(
    band.main || podcastCouldLeadBand || latestTalk || redaktioneltHistory.length > 0,
  );
  const sideBefore = band.side.filter((s) => KIND_RANK[s.kind] < KIND_RANK.podcast);
  const sideAfter = band.side.filter((s) => KIND_RANK[s.kind] >= KIND_RANK.podcast);
  // Antal tiles i rækken (polering #2) — skeletonet tæller med, så
  // kolonnevalget ikke skifter når feedet lander. Event er flyttet til
  // egen sektion og tælles IKKE længere med; tileColsClass-mapningen
  // (2→2, 3→3, 4→4/2+2, 5-6→3) dækker fortsat hele intervallet — rækken
  // kan nu højst rumme 5 (4 side-historier + talk), og 5 → 3+2.
  const tileCount =
    (podcastCouldLeadBand ? 0 : band.side.length + (podcastPending ? 1 : 0)) +
    (latestTalk ? 1 : 0);

  return (
    <div>
      <PageHeader firstName={firstName} />

      {/* ── LAG 1: Dit næste skridt (fuld bredde, øverst) ── */}
      <HbSection eyebrow="Dit næste skridt" hairline className="mt-10 md:mt-12">
        <FocusCard
          loading={focusLoading}
          items={focus}
          weeklySummary={weeklyFocusQuery.data?.summary ?? null}
          nextEntry={nextEntry}
          journeyLine={journeyLine}
        />
      </HbSection>

      {/* ── EVENTS: egen sektion mellem lag 1 og lag 2 — live-sessions
          er en KERNEYDELSE, ikke en nyhed; de skal ikke bo som én tile
          i det redaktionelle bånd. Rolige rammeløse rækker (samme
          tile-materiale: hb-line + luft) m. dato tydeligt.
          Højrekolonnen bærer inline-tilmeldingen (Events trin 3b);
          nedtællingen bor i meta-linjen. Ingen kommende events → ingen
          sektion. */}
      {events.length > 0 && (
        <HbSection eyebrow="Kommende" hairline className="mt-14 md:mt-16">
          {/* Link'et dækker KUN dato+titel+meta — tilmeldingshandlingen
              står som SØSKENDE i rækken, aldrig inde i linket (klikbar
              handling i et anker er ugyldig HTML og ville trigge
              navigation). Hover-tonen bor på wrapperen. */}
          <ul>
            {events.map((event) => (
              <li key={event.id} className="border-t border-hb-line last:border-b">
                <div className="flex items-center gap-5 py-4 transition-colors hover:bg-hb-sage/20">
                  <Link to={`/events/${event.id}`} className="flex min-w-0 flex-1 items-center gap-5">
                    <div className="w-12 shrink-0 text-center">
                      <p className="font-editorial text-3xl font-medium leading-none text-hb-ink">
                        {new Date(event.starts_at).getDate()}
                      </p>
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                        {new Date(event.starts_at).toLocaleDateString("da-DK", { month: "short" }).replace(".", "")}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium leading-snug text-hb-ink">{event.title}</p>
                      <p className="mt-1 text-sm text-hb-ink-soft">
                        {[
                          event.kind === "live_sparring" ? "Live sparring" : event.kind === "workshop" ? "Workshop" : "Event",
                          event.meet_url ? "Online" : null,
                          new Date(event.starts_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }),
                          eventCountdown(event.starts_at),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </Link>
                  <EventRegisterAction eventId={event.id} phase={eventMeetPhase(event)} />
                </div>
              </li>
            ))}
          </ul>
        </HbSection>
      )}

      {/* ── LAG 2: Fra os til dig (kurateret bånd) ── */}
      {hasBand && (
        // Overskriften: "Siden sidst" → "Fra os til dig" — båndet rummer
        // både tidløst (evergreen) og fremtid gjorde det tidligere (event);
        // "siden sidst" var kun sandt for push/podcast. Selve "siden
        // sidst"-LINJEN (countNewSince) beholder sin tekst — den handler
        // netop om det nye.
        <HbSection eyebrow="Fra os til dig" linkLabel="Se Akademiet" linkTo="/akademiet" hairline className="mt-14 md:mt-16">
          {/* "Siden sidst"-linjen (bølge 3): rolig grund til at kigge i
              dag frem for på fredag. 0 nye → ingen linje (tavshed, ikke
              "0 nye ting"). */}
          {newsLine && <p className="mb-5 text-sm text-hb-ink-soft">{newsLine}</p>}
          {/* Redesign (bryd to-kolonne-stakken): rykkelistens vinder står
              i FULD bredde som fokus-kortet ovenfor — cover i fuld
              kortbredde, editorial-overskrift i stor skala. Resten
              (side[] + talk) ligger UNDER i ét jævnt 3-kolonne-
              grid af ENS, rammeløse tiles (materiale-differentiering:
              hovedhistorien er det eneste hvide kort i båndet) — grid'et
              wrapper og tåler 2-6 elementer uden tomme hjørner. Mens
              feedet hentes holder skeletons pladsen (reserveret højde);
              side-tiles skjules mens podcasten kan ende som main
              (evergreen må ikke først stå i rækken og så hoppe op). */}
          {(band.main || podcastCouldLeadBand) &&
            (podcastCouldLeadBand ? (
              <StorySkeleton variant="main" />
            ) : (
              <StoryCard
                story={band.main!}
                variant="main"
                pushSender={pushSender}
                pushCoverUrl={pushCoverUrl}
              />
            ))}
          {(band.side.length > 0 || podcastPending || latestTalk) && (
            <div className={cn("mt-10 grid grid-cols-1 items-start gap-x-8 gap-y-9", tileColsClass(tileCount))}>
              {!podcastCouldLeadBand && (
                <>
                  {sideBefore.map((story) => (
                    <StoryCard
                      key={story.kind}
                      story={story}
                      variant="side"
                      pushSender={pushSender}
                      pushCoverUrl={pushCoverUrl}
                    />
                  ))}
                  {podcastPending && <StorySkeleton variant="side" />}
                  {sideAfter.map((story) => (
                    <StoryCard
                      key={story.kind}
                      story={story}
                      variant="side"
                      pushSender={pushSender}
                      pushCoverUrl={pushCoverUrl}
                    />
                  ))}
                </>
              )}
              {/* Talk som SAMME tile-materiale — rækken er ét
                  redaktionelt opslag, ikke dashboard-fliser. Event er
                  flyttet til sin egen "Kommende"-sektion ovenfor. */}
              {latestTalk && (
                <Link
                  to={`/akademiet/talks/${latestTalk.slug}`}
                  className="group block border-t border-hb-line pt-4"
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                    Seneste talk
                    {publishedMarker(latestTalk.published_at ?? latestTalk.created_at) && (
                      <span className="ml-2 normal-case tracking-normal">
                        · {publishedMarker(latestTalk.published_at ?? latestTalk.created_at)}
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-[15px] font-medium leading-snug text-hb-ink">
                    {latestTalk.title}
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 text-sm text-hb-ink-soft transition-colors group-hover:text-hb-ink">
                    {latestTalk.duration_seconds != null && formatDuration(latestTalk.duration_seconds)}
                    <ArrowRight className="h-4 w-4" />
                  </p>
                </Link>
              )}
            </div>
          )}

          {/* Historik (PR B3): diskret "Se tidligere" under båndet —
              seneste redaktionelle (byPublishedDesc, 5 stk) som rolige
              linjer m. titel + dato + link. Kollapset som standard. */}
          {redaktioneltHistory.length > 0 && (
            <div className="mt-9">
              <button
                type="button"
                onClick={() => setHistorikOpen((open) => !open)}
                className="flex items-center gap-1.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
              >
                {historikOpen ? "Skjul tidligere" : "Se tidligere"}
                {historikOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {historikOpen && (
                <ul className="mt-3">
                  {redaktioneltHistory.map((item) => {
                    const link =
                      (((item.metadata as Record<string, unknown>) ?? {}).link as string) || null;
                    const date = new Date(item.published_at ?? item.created_at).toLocaleDateString(
                      "da-DK",
                      { day: "numeric", month: "short", year: "numeric" },
                    );
                    return (
                      <li
                        key={item.id}
                        className="flex items-baseline gap-3 border-t border-hb-line/60 py-2.5 text-sm"
                      >
                        <span className="w-28 shrink-0 text-xs text-hb-ink-soft">{date}</span>
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-hb-ink underline-offset-4 hover:underline"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <span className="text-hb-ink">{item.title}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </HbSection>
      )}

      {/* ── LAG 3: Tal-strippen (rolig status, nederst) ── */}
      {companyId && (
        <div className="mt-14 md:mt-16">
          <TalStrip
            hasFacts={sorted.length > 0}
            processing={processing}
            periodLabel={latestFacts?.period ?? null}
            revenue={latestFacts?.kf.omsaetning ?? null}
            result={latestFacts?.kf.resultat_foer_skat ?? null}
            bank={bankRow?.kf.bank_balance ?? null}
          />
        </div>
      )}
    </div>
  );
};
