import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Play } from "lucide-react";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { youtubeNocookieEmbedUrl, youtubeThumbnailUrl } from "@/components/hjemmebane/boardroom/pushMedie";
import { getEvent } from "@/lib/hjemmebane/akademiApi";
import { hentTraad } from "@/lib/hjemmebane/communityApi";
import type { LinkKort } from "@/lib/hjemmebane/linkKort";
import { hentLektionKort, hentOembed } from "@/lib/hjemmebane/linkKortApi";

/** Link-kortene under et afsnit i et community-opslag (17/9). Fem arter,
    én visuel form: en lille eyebrow («YouTube», «Lektion · Fundamentet»,
    «Event · 24. sep.», «Opslag · Mette Hansen»), titlen, og for video/
    podcast et cover med play-knap. Komponenten træffer INGEN
    sikkerhedsbeslutninger: motoren (linkKort.ts) har allerede afgjort,
    hvad der er et kort, og datalaget (linkKortApi.ts) bygger selv de
    adresser, det henter fra.

    INGEN autoplay, ingen iframe før klik — samme dom som forsidens
    WeekVideoCard: kortet viser cover og play-knap, og afspilleren
    monteres FØRST når medlemmet klikker. En tråd med fem videoer henter
    dermed nul afspillere, indtil nogen trykker. YouTube: PR A's delte
    URL-bygger (pushMedie.ts: youtube-nocookie, privacy-enhanced mode, og
    start ved første klik) — nocookie-adressen bygges ÉT sted i huset,
    låst af pushVideo.guard. Spotify: open.spotify.com/embed/{episode|show}/
    {id} — Spotifys egen afspiller, 352 px som Spotifys standard-embed;
    pushMedie's spotifyEmbedUrl er bevidst KUN episode (pushet), mens et
    opslag også må pege på selve showet (valg A, Jonas 17/9).

    Fejl og «ingen adgang» giver INTET kort (null), ikke en fejlboks —
    som CommunityBillede: opslaget skal stadig kunne læses, og RLS må
    legitimt sige nej. Kun oEmbed-titlen kan mangle uden at kortet
    forsvinder: video-kortet lever af sit id. */

const eyebrow = "text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft";

const datoKort = (iso: string | null): string | null =>
  iso ? new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : null;

const Skelet = () => (
  <div aria-hidden className="h-16 w-full animate-pulse rounded-hb border border-hb-line bg-hb-sage/30" />
);

/** Cover med play-knap — hele fladen er knappen. Uden cover: rolig,
    tom Hb-flade med play-ikonet alene. */
function PlayCover({ coverUrl, titel, onPlay }: { coverUrl: string | null; titel: string; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Afspil ${titel}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-hb border border-hb-line bg-hb-sage/30"
    >
      {coverUrl && (
        <img src={coverUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-hb-surface/90 text-hb-ink shadow-hb-hover transition-transform group-hover:scale-105">
          <Play className="ml-0.5 h-6 w-6" />
        </span>
      </span>
    </button>
  );
}

function YouTubeKort({ kort }: { kort: Extract<LinkKort, { art: "youtube" }> }) {
  const [playing, setPlaying] = useState(false);
  const oembed = useQuery({
    queryKey: ["linkkort", "oembed", kort.noegle],
    queryFn: () => hentOembed(kort),
    staleTime: 60 * 60_000,
    retry: false,
  });
  const titel = oembed.data?.titel ?? "Video på YouTube";
  const coverUrl = oembed.data?.thumbnailUrl ?? youtubeThumbnailUrl(kort.videoId);
  const url = `https://www.youtube.com/watch?v=${kort.videoId}`;

  return (
    <HbCard className="overflow-hidden p-3">
      {playing ? (
        <iframe
          src={youtubeNocookieEmbedUrl(kort.videoId)}
          title={titel}
          className="aspect-video w-full rounded-hb border border-hb-line bg-black"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <PlayCover coverUrl={coverUrl} titel={titel} onPlay={() => setPlaying(true)} />
      )}
      <p className={`mt-3 ${eyebrow}`}>YouTube</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-1 flex items-start gap-2 font-body text-sm font-medium text-hb-ink hover:underline"
      >
        <span className="min-w-0 flex-1">{titel}</span>
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-hb-ink-soft" />
      </a>
    </HbCard>
  );
}

function SpotifyKort({ kort }: { kort: Extract<LinkKort, { art: "spotify" }> }) {
  const [playing, setPlaying] = useState(false);
  const oembed = useQuery({
    queryKey: ["linkkort", "oembed", kort.noegle],
    queryFn: () => hentOembed(kort),
    staleTime: 60 * 60_000,
    retry: false,
  });
  const titel = oembed.data?.titel ?? (kort.slags === "show" ? "Podcast på Spotify" : "Episode på Spotify");
  const url = `https://open.spotify.com/${kort.slags}/${kort.id}`;

  return (
    <HbCard className="overflow-hidden p-3">
      {playing ? (
        <iframe
          src={`https://open.spotify.com/embed/${kort.slags}/${kort.id}`}
          title={titel}
          className="w-full rounded-hb border-0"
          height={352}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      ) : (
        <PlayCover coverUrl={oembed.data?.thumbnailUrl ?? null} titel={titel} onPlay={() => setPlaying(true)} />
      )}
      <p className={`mt-3 ${eyebrow}`}>Spotify</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-1 flex items-start gap-2 font-body text-sm font-medium text-hb-ink hover:underline"
      >
        <span className="min-w-0 flex-1">{titel}</span>
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-hb-ink-soft" />
      </a>
    </HbCard>
  );
}

const OMRAADE_LABELS: Record<string, string> = {
  classroom: "Fundamentet",
  academy: "Kursus",
  rabataftaler: "Rabataftale",
  quick_wins: "Quick win",
  start_her: "Start her",
};

/** Internt kort — én ramme for lektion, event og opslag: evt. cover til
    venstre, eyebrow + titel + undertekst til højre, hele kortet er et
    <Link>. */
function InterntKort({
  to,
  coverUrl,
  overlinje,
  titel,
  underlinje,
}: {
  to: string;
  coverUrl: string | null;
  overlinje: string;
  titel: string;
  underlinje: string | null;
}) {
  return (
    <Link to={to} className="block">
      <HbCard className="flex items-stretch gap-4 overflow-hidden p-3">
        {coverUrl && (
          <div className="relative w-28 shrink-0 overflow-hidden rounded-hb border border-hb-line bg-hb-sage/30">
            <img src={coverUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1 py-1">
          <p className={eyebrow}>{overlinje}</p>
          <p className="mt-1 font-body text-sm font-medium leading-snug text-hb-ink">{titel}</p>
          {underlinje && <p className="mt-1 text-xs text-hb-ink-soft">{underlinje}</p>}
        </div>
      </HbCard>
    </Link>
  );
}

function LektionKortVisning({ kort }: { kort: Extract<LinkKort, { art: "lektion" }> }) {
  const lektion = useQuery({
    queryKey: ["linkkort", "lektion", kort.area, kort.slug],
    queryFn: () => hentLektionKort(kort.area, kort.slug),
    staleTime: 30 * 60_000,
  });
  if (lektion.isLoading) return <Skelet />;
  if (lektion.isError || !lektion.data) return null;
  const l = lektion.data;
  const dele: string[] = [];
  if (l.durationSeconds) dele.push(`${Math.max(1, Math.round(l.durationSeconds / 60))} min`);
  const dato = datoKort(l.publishedAt);
  if (dato) dele.push(dato);
  return (
    <InterntKort
      to={`/akademiet/${kort.area}/${kort.slug}`}
      coverUrl={l.coverUrl}
      overlinje={`Lektion · ${OMRAADE_LABELS[l.area] ?? l.area}`}
      titel={l.title}
      underlinje={dele.length > 0 ? dele.join(" · ") : null}
    />
  );
}

function EventKortVisning({ kort }: { kort: Extract<LinkKort, { art: "event" }> }) {
  const event = useQuery({
    queryKey: ["linkkort", "event", kort.eventId],
    queryFn: () => getEvent(kort.eventId),
    staleTime: 5 * 60_000,
  });
  if (event.isLoading) return <Skelet />;
  if (event.isError || !event.data) return null;
  const e = event.data;
  const starter = new Date(e.starts_at).toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const kl = new Date(e.starts_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  return (
    <InterntKort
      to={`/events/${kort.eventId}`}
      coverUrl={null}
      overlinje={`Event · ${datoKort(e.starts_at) ?? ""}`}
      titel={e.title}
      underlinje={`${starter} kl. ${kl}${e.status === "cancelled" ? " · Aflyst" : ""}`}
    />
  );
}

function OpslagKortVisning({ kort }: { kort: Extract<LinkKort, { art: "opslag" }> }) {
  const traad = useQuery({
    queryKey: ["community", "traad", kort.traadId],
    queryFn: () => hentTraad(kort.traadId),
    staleTime: 60_000,
  });
  if (traad.isLoading) return <Skelet />;
  if (traad.isError || !traad.data) return null;
  const t = traad.data;
  const svar = `${t.antal_svar} svar`;
  return (
    <InterntKort
      to={`/community/${kort.traadId}`}
      coverUrl={t.forfatter_avatar_url}
      overlinje={`Opslag · ${t.forfatter_navn ?? "Medlem"}`}
      titel={t.titel}
      underlinje={`${datoKort(t.created_at) ?? ""} · ${svar}`}
    />
  );
}

function LinkKortVisning({ kort }: { kort: LinkKort }) {
  switch (kort.art) {
    case "youtube":
      return <YouTubeKort kort={kort} />;
    case "spotify":
      return <SpotifyKort kort={kort} />;
    case "lektion":
      return <LektionKortVisning kort={kort} />;
    case "event":
      return <EventKortVisning kort={kort} />;
    case "opslag":
      return <OpslagKortVisning kort={kort} />;
  }
}

/** Kortene under ét afsnit. Tom liste → null (ingen tom wrapper). */
export function CommunityLinkKortListe({ kort }: { kort: LinkKort[] }) {
  if (kort.length === 0) return null;
  return (
    <div className="space-y-3">
      {kort.map((k) => (
        <LinkKortVisning key={k.noegle} kort={k} />
      ))}
    </div>
  );
}
