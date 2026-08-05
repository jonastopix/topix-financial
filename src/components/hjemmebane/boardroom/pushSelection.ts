import type { ContentItem } from "@/lib/hjemmebane/adminContentApi";

/** Hero-udvælgelsen som ren funktion (testbar): nyeste published push der
    ikke er udløbet. Udløb bæres i metadata.expires_at ("YYYY-MM-DD",
    valgfrit — som author-mønstret, ingen kolonne): udløbsdagen selv er
    stadig aktiv ("torsdagens push lever torsdagen ud, væk fredag");
    manglende/ugyldig dato = aldrig udløb. */

export const byPublishedDesc = (a: ContentItem, b: ContentItem) =>
  (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);

function isExpired(item: ContentItem, now: Date): boolean {
  const raw = (item.metadata as Record<string, unknown> | null)?.expires_at;
  if (typeof raw !== "string") return false;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  // Udgangen af udløbsdagen i LOKAL tid: startet af dagen efter.
  const endOfDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1);
  return now.getTime() >= endOfDay.getTime();
}

export function pickActivePush(items: ContentItem[], now: Date): ContentItem | undefined {
  return [...items].sort(byPublishedDesc).find((item) => !isExpired(item, now));
}
