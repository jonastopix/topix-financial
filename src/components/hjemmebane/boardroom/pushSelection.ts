import type { ContentItem } from "@/lib/hjemmebane/adminContentApi";
import { isoWeekNumber } from "@/lib/hjemmebane/week";
// Dansk kalenderdag og dato-aritmetik — samme rene helpers som fristen på
// medlemmets skridt (skridtForslag.ts har nul imports).
import { dagsdatoDansk, laegDageTilDato } from "@/lib/hjemmebane/skridtForslag";

/** Forsidens kuraterings-domme som rene funktioner (testbare): nyeste
    published indslag der ikke er udløbet. Dommen er AREA-AGNOSTISK
    (pickActiveItem) — pickActivePush (hero) og pickActiveWeekVideo
    (ugens video, bølge 1) er tynde wrappers over samme dom
    (deriveNextStep/deriveFocus-mønstret; ingen duplikeret logik).
    Udløb bæres i metadata.expires_at ("YYYY-MM-DD", valgfrit — som
    author-mønstret, ingen kolonne): udløbsdagen selv er stadig aktiv
    ("torsdagens push lever torsdagen ud, væk fredag").

    NYHEDENS LEVETID (forside PR 1, 17/9 — Jonas «A på alle», valg 4):
    et PUSH uden (gyldig) expires_at udløber PUSH_STANDARD_LEVETID_DAGE
    (28) dage efter published_at — dag 28 er stadig aktiv, dag 29 væk,
    regnet i dansk kalenderdag. Før stod «Ugens push» fra 12. august på
    forsiden 17. september (analyse-medlemmets-forside.md §5.4). Ugens
    video (pickActiveWeekVideo) deler kerne-dommen men IKKE levetiden:
    den kurateres i hånden og har ingen beslutning om alder — den
    udløber kun med expires_at som før (valget står i testen).

    METADATA-KONVENTIONER på forside-indslag (bølge 1, bindende for
    PR 2/3): author (fri tekst, byline-FALLBACK) · author_user_id
    (uuid → profiles(user_id, full_name, avatar_url) — afsender-ANSIGTET;
    har forrang for fri-teksten når den kan slås op) · expires_at
    ("YYYY-MM-DD", dommen ovenfor). Alt jsonb — ingen kolonner. */

export const byPublishedDesc = (a: ContentItem, b: ContentItem) =>
  (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);

/** Et push uden dato lever 28 dage (Jonas 17/9: «A»). Ét sted. */
export const PUSH_STANDARD_LEVETID_DAGE = 28;

/** Udløbsdommen — eksporteret så admin-listen (PushView) kan vise
    "Udløbet" med SAMME dom som forsidens udvælgelse. Med
    `standardLevetidDage` gælder standard-levetiden når expires_at mangler
    eller er ugyldig; uden (ugens video) = aldrig udløb uden dato, som før. */
export function isPushExpired(item: ContentItem, now: Date, standardLevetidDage?: number): boolean {
  const raw = (item.metadata as Record<string, unknown> | null)?.expires_at;
  const match = typeof raw === "string" ? raw.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  if (match) {
    // Udgangen af udløbsdagen i LOKAL tid: startet af dagen efter.
    const endOfDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1);
    return now.getTime() >= endOfDay.getTime();
  }
  if (standardLevetidDage == null) return false;
  // Standard-levetiden: sidste aktive dag = udgivelsesdagen (dansk tid) +
  // levetiden; dagen efter er pushet væk. Ulæselig udgivelsesdato → aldrig
  // udløb (fail-open på visning: et push uden stempel er ikke «gammelt»).
  const udgivet = new Date(item.published_at ?? item.created_at);
  if (Number.isNaN(udgivet.getTime())) return false;
  const sidsteDag = laegDageTilDato(dagsdatoDansk(udgivet), standardLevetidDage);
  return dagsdatoDansk(now) > sidsteDag;
}

/** Kerne-dommen (area-agnostisk): nyeste published, ikke udløbet.
    `standardLevetidDage` gives KUN af pushet. */
export function pickActiveItem(items: ContentItem[], now: Date, standardLevetidDage?: number): ContentItem | undefined {
  return [...items].sort(byPublishedDesc).find((item) => !isPushExpired(item, now, standardLevetidDage));
}

/** Hero-udvælgelsen (area='push'): kerne-dommen + standard-levetiden. */
export function pickActivePush(items: ContentItem[], now: Date): ContentItem | undefined {
  return pickActiveItem(items, now, PUSH_STANDARD_LEVETID_DAGE);
}

/** Ugens video (area='ugens_video', bølge 1) — samme dom som hero'en. */
export function pickActiveWeekVideo(items: ContentItem[], now: Date): ContentItem | undefined {
  return pickActiveItem(items, now);
}

/** Evergreen-rotationen (PR B1): deterministisk pr. ISO-uge — alle
    medlemmer ser det samme, og valget skifter mandag. Puljen sorteres
    på SLUG (stabil nøgle: uafhængig af published_at-redigeringer og af
    kaldernes rækkefølge). Kalderen filtrerer status (published) som ved
    de øvrige domme. Tom pulje → undefined. */
export function pickEvergreen(items: ContentItem[], now: Date): ContentItem | undefined {
  const pool = [...items].sort((a, b) => a.slug.localeCompare(b.slug));
  if (pool.length === 0) return undefined;
  return pool[isoWeekNumber(now) % pool.length];
}

// Før (til 17/9): "push" | "video" | "redaktionelt" | "podcast" | "evergreen" — podcast-kortet udgik (beslutning 17).
export type StoryKind = "push" | "video" | "redaktionelt" | "evergreen";

export interface StoryCandidate<T = unknown> {
  kind: StoryKind;
  item: T;
}

/** Rykkeliste-dommen (PR B1): første IKKE-NULL kandidat vinder
    hovedpladsen; resten fylder sidespalten — ingen tomme pladser.
    Kandidaterne ankommer i FAST rækkefølge (push → ugens video →
    redaktionelt → evergreen; podcasten udgik 17/9), og enhver kandidat
    kan være null af HVILKEN SOM HELST grund (udløbet, tom pulje) —
    dommen antager aldrig at en kandidat findes. */
export function pickMainStory<T>(
  candidates: (StoryCandidate<T> | null | undefined)[],
): { main: StoryCandidate<T> | null; side: StoryCandidate<T>[] } {
  const present = candidates.filter((c): c is StoryCandidate<T> => c != null);
  return { main: present[0] ?? null, side: present.slice(1) };
}

export interface NewsCandidate {
  /** ISO-timestamp eller null — null tæller aldrig som nyt. */
  publishedAt: string | null;
}

/** "Siden sidst"-dommen (bølge 3): antal kandidater publiceret STRENGT
    efter sidste besøg. null/ulæseligt lastVisit (første besøg, ryddet
    storage) → 0 — "alt er nyt" er ingen nyhed, og linjen skal tie
    stille frem for at råbe ved første møde. Dommen er DUM: den tæller
    det den får — hvilke kinds der deltager (fx at evergreen udelades)
    er kalderens fravalg og dokumenteres dér. */
export function countNewSince(
  candidates: NewsCandidate[],
  lastVisitIso: string | null,
): number {
  if (!lastVisitIso) return 0;
  const since = new Date(lastVisitIso).getTime();
  if (Number.isNaN(since)) return 0;
  return candidates.filter((c) => {
    if (!c.publishedAt) return false;
    const t = new Date(c.publishedAt).getTime();
    return !Number.isNaN(t) && t > since;
  }).length;
}
