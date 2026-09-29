/**
 * supabase/functions/_shared/raadgiverensKunder.ts
 *
 * SPEJL af src/lib/raadgiverensKunder.ts (raadgiverensKunder — er virksomheden en kunde (fail-open på er_kunde)).
 * Kroppen efter dette filhoved er ORDRET den samme som i src-udgaven (filen har ingen imports);
 * paritetsprøven src/lib/__tests__/medlemsOverblik.paritet.test.ts sammenligner tegn for tegn
 * og fælder, når kun det ene spejl ændres. Begrundelserne står i src-udgavens filhoved.
 * Lavet 29/9-2026 til statusmailen (Bucket B), som ikke kan nå src/lib.
 */

export function erKunde(c: { er_kunde?: boolean | null }): boolean {
  return c.er_kunde !== false;
}
