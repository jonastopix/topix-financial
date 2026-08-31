/**
 * supabase/functions/_shared/foreslaaOpgaveValidering.ts
 *
 * Valideringen af et opgave-forslags input (foreslaa-opgave) — udtrukket
 * som ren funktion, så function og eventuelle senere kaldere deler
 * dommen. Nul imports, så filen kan læses af både Deno og Vite/Vitest
 * (opgaveUdloeb-mønstret). Testes i
 * src/lib/__tests__/foreslaaOpgaveValidering.test.ts.
 */

export const TITEL_MAX_LAENGDE = 200;

/** Titlen er obligatorisk: trimmes, tom afvises, over 200 tegn afvises.
    Grunden er dansk og vises ordret til rådgiveren (400-svaret). */
export function validerTitel(input: unknown): { ok: true; titel: string } | { ok: false; grund: string } {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, grund: "Titlen mangler — skriv hvad medlemmet skal gøre" };
  }
  const titel = input.trim();
  if (titel.length > TITEL_MAX_LAENGDE) {
    return { ok: false, grund: `Titlen må højst være ${TITEL_MAX_LAENGDE} tegn` };
  }
  return { ok: true, titel };
}

/** Begrundelsen er valgfri: trimmes, tom/ikke-streng bliver null
    (context-kolonnen er nullable). */
export function normaliserBegrundelse(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmet = input.trim();
  return trimmet === "" ? null : trimmet;
}
