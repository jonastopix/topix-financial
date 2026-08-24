/**
 * supabase/functions/_shared/opgaveUdloeb.ts
 *
 * B10: udløbsfrist pr. kilde for forslag i opgave-modellen
 * (docs/opgave-model-design.md §2, tabellen under B10).
 *
 * Spejler UDLOEBSDAGE + beregnUdloeb i src/lib/opgaveEngine.ts —
 * edge functions kan ikke importere fra src/, så reglen findes ét sted
 * pr. runtime og INGEN andre steder. Enhver ændring her SKAL også laves
 * i motoren. Paritet håndhæves af
 * src/lib/__tests__/opgaveUdloeb.paritet.test.ts (membershipTier-mønstret).
 *
 * Nul imports, så filen kan læses af både Deno og Vite/Vitest.
 */

/** B10-tabellen. Kilder uden egen frist falder tilbage på 14 dage —
    samme levetid som ugefokus (spejl af opgaveEngine.ts). */
export const UDLOEBSDAGE: Record<string, number> = {
  advisor: 30,
  reflection: 21,
  ai_weekly: 14,
  agent: 14,
};

export const UDLOEB_FALLBACK_DAGE = 14;

/** Samme kalenderdags-aritmetik som motoren (setDate, ikke rå
    millisekunder), så paritetstesten kan kræve identiske datoer. */
export function beregnUdloeb(sourceType: string, oprettet: Date): Date {
  const ny = new Date(oprettet.getTime());
  ny.setDate(ny.getDate() + (UDLOEBSDAGE[sourceType] ?? UDLOEB_FALLBACK_DAGE));
  return ny;
}
