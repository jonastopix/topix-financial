/** Pushets medie som REN dom (PR A «video i nyheden», 17/9-2026).
    JONAS 17/9 (ordret): «Jeg vil rigtig gerne kunne smide en video ind som
    nyhed på forsiden til medlemmerne. Men lige nu kan jeg kun smide billede
    op med nyheden. Den er nemlig det store felt på forsiden … Morten har
    lige optaget en spændende podcast (m. video) sammen med Nordea, og den
    skal frem i bussen.»

    Ét sted for: (1) hvilken video et content_item bærer (YouTube-id fra
    media_provider 'external' + external_url — samme udtræk som «Denne uges
    video», youtube.ts), (2) hvilken Spotify-EPISODE pushet peger på
    (metadata.spotify_url — kun open.spotify.com/episode/<id>; show/track
    afvises), og (3) URL-formerne forsiden og editoren bruger: nocookie-embed
    m. autoplay=1 (monteres FØRST ved klik — gaten er komponentens),
    i.ytimg.com-thumbnail, Spotify-episode-embed. Ingen React, ingen
    Supabase. Testet i __tests__/pushMedie.test.ts; kildeværn
    src/lib/__tests__/pushVideo.guard.test.ts. */
import { extractYouTubeId } from "./youtube";

/** Det af content_items-rækken dommen læser. */
export interface MedieRaekke {
  media_provider: string | null;
  external_url: string | null;
  metadata?: unknown;
}

export interface PushMedie {
  youtubeId: string | null;
  spotifyEpisodeId: string | null;
}

/** Spotify-id'er er base62, 22 tegn. */
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

/** Episode-id fra et Spotify-link: KUN https://open.spotify.com/episode/<id>
    (query — fx ?si=… — ignoreres). Show, track, playlist, spotify:-URI'er,
    fremmede hosts og ikke-https → null. */
export function spotifyEpisodeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "open.spotify.com") return null;
  const match = parsed.pathname.match(/^\/episode\/([^/]+)\/?$/);
  return match && SPOTIFY_ID.test(match[1]) ? match[1] : null;
}

/** Den rensede form der gemmes i metadata.spotify_url — uden ?si=… og
    andre parametre. null når linket ikke er en episode. */
export function rensSpotifyEpisodeUrl(url: string | null | undefined): string | null {
  const id = spotifyEpisodeId(url);
  return id ? `https://open.spotify.com/episode/${id}` : null;
}

/** Spotify-afspilleren: kun episode-embed'et — aldrig show/track. */
export function spotifyEmbedUrl(episodeId: string): string {
  return `https://open.spotify.com/embed/episode/${episodeId}`;
}

/** YouTube-id'et pushet/videoen bærer: kun når kilden er 'external'. */
export function youtubeIdAf(item: Pick<MedieRaekke, "media_provider" | "external_url">): string | null {
  return item.media_provider === "external" ? extractYouTubeId(item.external_url) : null;
}

/** metadata.spotify_url → episode-id (tåler fejlformet metadata). */
export function spotifyEpisodeIdAf(item: Pick<MedieRaekke, "metadata">): string | null {
  const meta = item.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const url = (meta as Record<string, unknown>).spotify_url;
  return typeof url === "string" ? spotifyEpisodeId(url) : null;
}

/** Pushets medie samlet. */
export function pushMedie(item: MedieRaekke): PushMedie {
  return { youtubeId: youtubeIdAf(item), spotifyEpisodeId: spotifyEpisodeIdAf(item) };
}

/** YouTube-thumbnail (hqdefault findes for alle videoer; maxres ikke). */
export function youtubeThumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

/** Privacy Enhanced Mode + autoplay=1, så det FØRSTE klik også starter
    afspilningen. Må kun monteres efter klik (gaten er YouTubePlayer's). */
export function youtubeNocookieEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`;
}
