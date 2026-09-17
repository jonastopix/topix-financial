/** Datalaget bag link-kortene (linkKort.ts er dommen; dette er hentningen).

    TO kilder, og ikke flere:
      1. oEmbed hos YouTube og Spotify — FASTE hosts (www.youtube.com/oembed,
         open.spotify.com/oembed). Kun id'et sendes: adressen bygges HER ud
         fra kortets id, aldrig ud fra medlemmets rå URL. Hentes DIREKTE fra
         browseren: begge endpoints svarer med CORS (målt 17/9 med Origin:
         https://app.theboardroom.dk — YouTube spejler origin'en, Spotify
         svarer «*», begge også på preflight). Ingen edge function, ingen
         nøgle, og dermed ingen server der kan lokkes til at hente noget.
      2. Vores egen database gennem medlemmets egen RLS: content_items
         (published + medlemskabsdommen), events (getEvent), community_traade
         (hentTraad, RPC med adgangsdom). Ingen adgang → null → intet kort,
         stille, som billeder der ikke må vises.

    Kaster ALDRIG for oEmbed: et kort uden titel er stadig et kort (YouTube
    har et fast thumbnail-mønster som fald-tilbage — pushMedie.ts
    youtubeThumbnailUrl, PR A's delte bygger), og en blokeret
    tredjepart må aldrig gøre et opslag ulæseligt. Databasekaldene kaster
    som resten af huset (throwIfError) — useQuery fanger, Sentry får dem. */

import { supabase } from "@/integrations/supabase/client";
import { bunnyThumbnailUrl } from "./bunnyMedia";
import { getAssetPreviewUrl } from "./adminContentApi";
import type { LinkKort } from "./linkKort";

export const OEMBED_TIMEOUT_MS = 5000;

export interface OembedData {
  titel: string | null;
  thumbnailUrl: string | null;
}

/** Thumbnails vises som <img src> — kun udbydernes egne CDN'er slipper
    igennem. Målt 17/9: YouTube svarer i.ytimg.com; Spotify svarer
    image-cdn-fa.spotifycdn.com (dokumentationens eksempel siger i.scdn.co)
    — hosten varierer, derfor endelser og ikke én host. */
const THUMBNAIL_HOSTS = [".ytimg.com", ".spotifycdn.com", ".scdn.co"];

function sikkerThumbnail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname;
    return THUMBNAIL_HOSTS.some((endelse) => host.endsWith(endelse)) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Titlen er tredjepartsdata og vises som tekst: kontroltegn væk, højst
    200 tegn, tom → null. */
function sikkerTitel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const renset = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 200);
  return renset.length > 0 ? renset : null;
}

/** Adressen der hentes — bygget af id'et alene. */
export function oembedUrl(kort: Extract<LinkKort, { art: "youtube" | "spotify" }>): string {
  if (kort.art === "youtube") {
    const video = `https://www.youtube.com/watch?v=${kort.videoId}`;
    return `https://www.youtube.com/oembed?url=${encodeURIComponent(video)}&format=json`;
  }
  const emne = `https://open.spotify.com/${kort.slags}/${kort.id}`;
  return `https://open.spotify.com/oembed?url=${encodeURIComponent(emne)}`;
}

const INGEN: OembedData = { titel: null, thumbnailUrl: null };

export async function hentOembed(
  kort: Extract<LinkKort, { art: "youtube" | "spotify" }>,
  fetchFn: typeof fetch = fetch,
): Promise<OembedData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const svar = await fetchFn(oembedUrl(kort), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!svar.ok) return INGEN;
    const json: unknown = await svar.json();
    if (typeof json !== "object" || json === null) return INGEN;
    const data = json as Record<string, unknown>;
    return { titel: sikkerTitel(data.title), thumbnailUrl: sikkerThumbnail(data.thumbnail_url) };
  } catch {
    return INGEN;
  } finally {
    clearTimeout(timer);
  }
}

export interface LektionKort {
  id: string;
  area: string;
  slug: string;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  /** Signeret cover-URL (content-assets) eller Bunnys auto-thumbnail —
      eller null. */
  coverUrl: string | null;
}

/** Lektionen bag /akademiet/{area}/{slug}, læst med medlemmets egen RLS
    (published + har_aktivt_medlemskab). Ingen række → null → intet kort. */
export async function hentLektionKort(area: string, slug: string): Promise<LektionKort | null> {
  const { data, error } = await supabase
    .from("content_items")
    .select(
      "id, area, slug, title, description, duration_seconds, published_at, cover_path, media_provider, bunny_video_id",
    )
    .eq("area", area)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  let coverUrl: string | null = null;
  if (data.cover_path) {
    try {
      coverUrl = await getAssetPreviewUrl(data.cover_path);
    } catch {
      coverUrl = null;
    }
  }
  if (coverUrl === null && data.media_provider === "bunny") {
    coverUrl = bunnyThumbnailUrl(data.bunny_video_id);
  }

  return {
    id: data.id,
    area: data.area,
    slug: data.slug,
    title: data.title,
    description: data.description,
    durationSeconds: data.duration_seconds,
    publishedAt: data.published_at,
    coverUrl,
  };
}
