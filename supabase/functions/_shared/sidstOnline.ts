/**
 * supabase/functions/_shared/sidstOnline.ts
 *
 * SPEJL af src/lib/sidstOnline.ts (sidstOnline — hele døgn siden, og det seneste af flere stempler).
 * Kroppen efter dette filhoved er ORDRET den samme som i src-udgaven (filen har ingen imports);
 * paritetsprøven src/lib/__tests__/medlemsOverblik.paritet.test.ts sammenligner tegn for tegn
 * og fælder, når kun det ene spejl ændres. Begrundelserne står i src-udgavens filhoved.
 * Lavet 29/9-2026 til statusmailen (Bucket B), som ikke kan nå src/lib.
 */

const MS_PER_DOEGN = 86_400_000;

/** Rust fra og med så mange dage. Tre måneder — som friskhedsgaten. */
export const LAENGE_SIDEN_DAGE = 90;

/** Hele døgn siden et ISO-tidsstempel; null når intet stempel eller
    ulæseligt. Negativ (stempel i fremtiden, uret skævt) klippes til 0. */
export function dageSiden(iso: string | null | undefined, nu: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nu.getTime() - t) / MS_PER_DOEGN));
}

/** Det seneste af flere stempler (ISO-strenge sorterer korrekt); null når
    ingen. Ulæselige og tomme springes over. */
export function senesteAf(isos: ReadonlyArray<string | null | undefined>): string | null {
  let seneste: string | null = null;
  for (const iso of isos) {
    if (!iso || Number.isNaN(new Date(iso).getTime())) continue;
    if (seneste === null || iso > seneste) seneste = iso;
  }
  return seneste;
}

/** «Online i dag» / «Online 1 dag siden» / «Online 63 dage siden» /
    «Aldrig logget ind». */
export function sidstOnlineTekst(dage: number | null): string {
  if (dage === null) return "Aldrig logget ind";
  if (dage <= 0) return "Online i dag";
  if (dage === 1) return "Online 1 dag siden";
  return `Online ${dage} dage siden`;
}

/** Rust når det er længe siden — ikke ved «aldrig». */
export function erLaengeSiden(dage: number | null): boolean {
  return dage !== null && dage >= LAENGE_SIDEN_DAGE;
}
