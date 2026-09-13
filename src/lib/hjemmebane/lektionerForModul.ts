/**
 * src/lib/hjemmebane/lektionerForModul.ts
 *
 * Koblingen handout → lektioner (kort 56). Ren motor uden supabase-kald:
 * den får det publicerede katalog ind (listPublishedItems, cache-nøgle
 * ["akademi","items"]) og svarer hvilke lektioner der hører til ét
 * handout-modul. Delt, fordi «Måske relevant for dig» skal bruge samme
 * mapping — koblingen må ikke bo i én flade.
 *
 * DATAGRUNDLAG: content_items.handout_module er TEXT, nullable, CHECK på
 * de fem modulnøgler, uden UNIQUE og uden FK (20260805120000:21-25) — ét
 * modul kan høre til mange lektioner, og en lektion højst ét modul.
 * Målt i prod 11/9: 14 lektioner bærer et modul, én til fire pr. modul.
 * Læses i dag kun af ElementView (lektion→handout) og ItemEditor (admin).
 *
 * KUN PUBLICEREDE: listPublishedItems filtrerer allerede på status, men
 * formen skal holde uanset hvem der leverer rækkerne — en kladde må
 * aldrig blive et link. Rækkefølgen er kursets (position, så created_at),
 * som i akademiApi.
 */

export interface LektionRaekke {
  id: string;
  area: string;
  slug: string;
  title: string;
  status: string;
  handout_module: string | null;
  position: number;
  created_at: string;
}

/** Ruten er /akademiet/:area/:slug (App.tsx:291) — nøglen er area+slug,
    aldrig id. Samme streng som HbItemRow, ForsideView og ElementView
    bygger inline. */
export function lektionsSti(lektion: Pick<LektionRaekke, "area" | "slug">): string {
  return `/akademiet/${lektion.area}/${lektion.slug}`;
}

/** De publicerede lektioner der hører til modulet, i forløbsrækkefølge.
    Tomt modul (null/""), ukendt modul eller ingen match giver en tom
    liste — fladen viser da intet. */
export function lektionerForModul<T extends LektionRaekke>(
  lektioner: readonly T[],
  modul: string | null | undefined,
): T[] {
  if (!modul) return [];
  return lektioner
    .filter((l) => l.status === "published" && l.handout_module === modul)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

/** Overskriften bøjes efter antal: «Hører til lektionen» / «Hører til
    lektionerne». Nul giver null — der er intet at sige. */
export function hoererTilTekst(antal: number): string | null {
  if (antal <= 0) return null;
  return antal === 1 ? "Hører til lektionen" : "Hører til lektionerne";
}
