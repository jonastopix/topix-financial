/** Podcast-RSS-parseren som REN klientfunktion (forside PR B1,
    hb-forside-prb-recon §1): edge-funktionen (B2) er en dum CORS-proxy
    der returnerer rå XML — parsningen bor HER, hvor den kan dybdetestes
    (DOMParser findes i browser og i vitest/jsdom). Feltfacittet er
    verificeret empirisk mod Anchor-feedet 2026-08-09 (enclosure-MP3,
    itunes:duration som HH:MM:SS, itunes:image pr. episode, CDATA-titler).
    KONTRAKT: manglende felter → null (graceful); ugyldig XML → tom
    liste — parseren KASTER ALDRIG. */

export interface PodcastEpisode {
  guid: string | null;
  title: string;
  description: string | null;
  link: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  imageUrl: string | null;
  /** ISO-8601 — null hvis pubDate mangler/er ulæselig. */
  publishedAt: string | null;
  /** <itunes:season> — null når feltet mangler eller ikke er et tal. */
  season: number | null;
  /** <itunes:episode> — null når feltet mangler eller ikke er et tal. */
  episode: number | null;
  /** <itunes:episodeType> — rå streng ("full"/"bonus"/"trailer"), null når den mangler. */
  episodeType: string | null;
}

/** Number() m. null-fallback ved NaN/tomt (tomt fanges før Number(""),
    som ellers ville give 0). */
const intOrNull = (raw: string | null): number | null => {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
};

/** "HH:MM:SS" | "MM:SS" | rå sekunder → sekunder; alt andet → null. */
export function parseDurationSeconds(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  return parts.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1];
}

const text = (parent: Element, tag: string): string | null => {
  const el = parent.getElementsByTagName(tag)[0];
  const value = el?.textContent?.trim();
  return value ? value : null;
};

export function parsePodcastFeed(xml: string): PodcastEpisode[] {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    // jsdom/browsere signalerer ugyldig XML m. et <parsererror>-element.
    if (doc.getElementsByTagName("parsererror").length > 0) return [];

    return Array.from(doc.getElementsByTagName("item")).map((item) => {
      const pubDateRaw = text(item, "pubDate");
      const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
      return {
        guid: text(item, "guid"),
        title: text(item, "title") ?? "Uden titel",
        description: text(item, "description"),
        link: text(item, "link"),
        audioUrl: item.getElementsByTagName("enclosure")[0]?.getAttribute("url") ?? null,
        durationSeconds: parseDurationSeconds(text(item, "itunes:duration")),
        imageUrl: item.getElementsByTagName("itunes:image")[0]?.getAttribute("href") ?? null,
        publishedAt:
          pubDate && !Number.isNaN(pubDate.getTime()) ? pubDate.toISOString() : null,
        season: intOrNull(text(item, "itunes:season")),
        episode: intOrNull(text(item, "itunes:episode")),
        episodeType: text(item, "itunes:episodeType"),
      };
    });
  } catch {
    return [];
  }
}
