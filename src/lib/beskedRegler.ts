/**
 * beskedRegler — hvem må redigere og slette en chatbesked, og hvornår.
 *
 * AFGJORT 10/9 (recon-sikkerhed-og-toast.md §1): sletning får SAMME grænse
 * som redigering — 15 minutter for medlemmer, kun egne beskeder. Før havde
 * databasen ingen tidsgrænse på DELETE (to overlappende policies, den
 * bredeste vandt: sender_id = auth.uid() OR advisor), og fladen var enig
 * (canDelete = sender alene). Et medlem kunne fjerne en tre måneder gammel
 * besked om en aftale — også for rådgiveren, der måske har svaret på den.
 * Chatten er en fælles optegnelse; efter et kvarter står det der står.
 *
 * Rådgiveren er urørt: egne beskeder uden tidsgrænse i fladen (som ved
 * redigering); databasen bevilger rådgiveren mere («Advisors can delete
 * messages»), fordi papirkurven (RapporteringView) rydder rapportbeskeder
 * op ad den vej.
 *
 * Databasen håndhæver det samme i migration 20260911020000. Én kilde til
 * tallet: BESKED_VINDUE_MS. Testet i __tests__/beskedRegler.test.ts.
 */

/** 15 minutter — redigering OG sletning. Spejlet i policyen «within 15 min». */
export const BESKED_VINDUE_MS = 15 * 60 * 1000;

export interface BeskedRegelInput {
  senderId: string;
  currentUserId: string | undefined;
  isAdvisor: boolean;
  createdAt: string;
  now?: number;
}

/** Er beskeden yngre end vinduet? En ulæselig dato er «for gammel». */
export function indenForVinduet(createdAt: string, now: number = Date.now()): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t < BESKED_VINDUE_MS;
}

/** Egne beskeder: rådgiver altid, medlem inden for vinduet. */
export function kanRedigereBesked(a: BeskedRegelInput): boolean {
  if (!a.currentUserId || a.senderId !== a.currentUserId) return false;
  return a.isAdvisor || indenForVinduet(a.createdAt, a.now);
}

/** Samme regel som redigering — det er pointen (10/9). */
export function kanSletteBesked(a: BeskedRegelInput): boolean {
  return kanRedigereBesked(a);
}
