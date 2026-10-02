/**
 * src/lib/hjemmebane/communityNyttigt.ts
 *
 * Like-tallet som ORD (den godkendte mockup til Community-feedet, 2/10-2026):
 * «N fandt det nyttigt» i stedet for et nøgent tal ved hjertet. Ren funktion,
 * ingen React. Testet i __tests__/communityNyttigt.test.ts; kildeværnet
 * communityMestLaest.guard.test.ts låser, at LikeKnap skriver ordene HER.
 *
 * Tallet er stadig RPC'ens antal_reaktioner (databasens, aldrig klientens
 * gæt — LikeKnap.tsx). Kun formen skifter:
 *   0  → null (intet tal — kun knappen med hjertet)
 *   1  → «1 fandt det nyttigt»
 *   N  → «N fandt det nyttigt» (verbet bøjes ikke i tal på dansk)
 * Et ugyldigt tal (NaN, negativt, ikke-heltal) behandles som 0 — et forkert
 * tal er værre end intet tal.
 */

export const NYTTIGT_ORD = "fandt det nyttigt";

export function nyttigtTekst(antal: number): string | null {
  if (!Number.isFinite(antal) || !Number.isInteger(antal) || antal <= 0) return null;
  return `${antal} ${NYTTIGT_ORD}`;
}
