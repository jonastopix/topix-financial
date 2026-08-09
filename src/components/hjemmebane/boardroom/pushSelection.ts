import type { ContentItem } from "@/lib/hjemmebane/adminContentApi";

/** Forsidens kuraterings-domme som rene funktioner (testbare): nyeste
    published indslag der ikke er udløbet. Dommen er AREA-AGNOSTISK
    (pickActiveItem) — pickActivePush (hero) og pickActiveWeekVideo
    (ugens video, bølge 1) er tynde wrappers over samme dom
    (deriveNextStep/deriveFocus-mønstret; ingen duplikeret logik).
    Udløb bæres i metadata.expires_at ("YYYY-MM-DD", valgfrit — som
    author-mønstret, ingen kolonne): udløbsdagen selv er stadig aktiv
    ("torsdagens push lever torsdagen ud, væk fredag"); manglende/
    ugyldig dato = aldrig udløb.

    METADATA-KONVENTIONER på forside-indslag (bølge 1, bindende for
    PR 2/3): author (fri tekst, byline-FALLBACK) · author_user_id
    (uuid → profiles(user_id, full_name, avatar_url) — afsender-ANSIGTET;
    har forrang for fri-teksten når den kan slås op) · expires_at
    ("YYYY-MM-DD", dommen ovenfor). Alt jsonb — ingen kolonner. */

export const byPublishedDesc = (a: ContentItem, b: ContentItem) =>
  (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);

/** Udløbsdommen — eksporteret så admin-listen (PushView) kan vise
    "Udløbet" med SAMME dom som forsidens udvælgelse. */
export function isPushExpired(item: ContentItem, now: Date): boolean {
  const raw = (item.metadata as Record<string, unknown> | null)?.expires_at;
  if (typeof raw !== "string") return false;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  // Udgangen af udløbsdagen i LOKAL tid: startet af dagen efter.
  const endOfDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1);
  return now.getTime() >= endOfDay.getTime();
}

/** Kerne-dommen (area-agnostisk): nyeste published, ikke udløbet. */
export function pickActiveItem(items: ContentItem[], now: Date): ContentItem | undefined {
  return [...items].sort(byPublishedDesc).find((item) => !isPushExpired(item, now));
}

/** Hero-udvælgelsen (area='push') — tynd wrapper, uændret adfærd. */
export function pickActivePush(items: ContentItem[], now: Date): ContentItem | undefined {
  return pickActiveItem(items, now);
}

/** Ugens video (area='ugens_video', bølge 1) — samme dom som hero'en. */
export function pickActiveWeekVideo(items: ContentItem[], now: Date): ContentItem | undefined {
  return pickActiveItem(items, now);
}
