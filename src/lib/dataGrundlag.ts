/**
 * dataGrundlag — ren, React-fri motor for skelnen mellem målinger og
 * estimater i financial_report_facts (data_basis-kolonnen, migration
 * 20260826120000).
 *
 * KONTRAKTEN (docs/data-basis-kontrakt.md):
 *   Beregninger udelukker estimater. Visninger må vise dem, men skal sige
 *   det. Et tal udledt af et estimat og præsenteret som en måling er en
 *   påstand systemet ikke kan indfri.
 *
 * Alle funktioner er rene: samme input → samme output, ingen sideeffekter.
 * Punkt-typen er strukturel ({ data_basis }) så både CompanyFact-rækker og
 * afledte grafpunkter kan dømmes uden konvertering.
 */

export type DataBasis = "measured" | "estimated";

export interface GrundlagsPunkt {
  data_basis: DataBasis;
}

/** Er rækken/punktet et estimat? */
export function erEstimat(fact: GrundlagsPunkt): boolean {
  return fact.data_basis === "estimated";
}

/** Kun de målte rækker — beregningsgrundlaget iht. kontrakten. */
export function kunMaalinger<T extends GrundlagsPunkt>(facts: readonly T[]): T[] {
  return facts.filter((f) => !erEstimat(f));
}

/** Optælling af grundlaget — til ærlige tællere ("6 målt · 12 estimeret"). */
export function opgoerGrundlag(facts: readonly GrundlagsPunkt[]): {
  maalte: number;
  estimerede: number;
  samlet: number;
} {
  let maalte = 0;
  for (const f of facts) if (!erEstimat(f)) maalte++;
  return { maalte, estimerede: facts.length - maalte, samlet: facts.length };
}

/** Må en måned-over-måned-sammenligning beregnes på denne serie?
    Sand KUN når serien har mindst to punkter og BEGGE de to sidste er
    målinger — en M/M-procent mod et /12-estimat måler afstanden til en
    regnekonstruktion, ikke en måneds udvikling. */
export function momErGyldig(punkter: readonly GrundlagsPunkt[]): boolean {
  if (punkter.length < 2) return false;
  return (
    !erEstimat(punkter[punkter.length - 1]) &&
    !erEstimat(punkter[punkter.length - 2])
  );
}

export interface SerieSegment<T extends GrundlagsPunkt> {
  basis: DataBasis;
  punkter: T[];
}

/** Del en serie i sammenhængende segmenter med hver sit grundlag — klar til
    at blive tegnet som adskilte serier (fx målt linje + stiplet estimatlinje).
    Punkterne dubleres IKKE ved segmentgrænser; om en tegning vil dele
    grænsepunktet mellem to segmenter for at undgå visuelle huller, er
    render-lagets valg i visnings-PR'en. ENDNU IKKE I BRUG — testet her, så
    den er klar før første forbruger. */
export function segmenterSerie<T extends GrundlagsPunkt>(
  punkter: readonly T[],
): SerieSegment<T>[] {
  const segmenter: SerieSegment<T>[] = [];
  for (const punkt of punkter) {
    const sidste = segmenter[segmenter.length - 1];
    if (sidste && sidste.basis === punkt.data_basis) {
      sidste.punkter.push(punkt);
    } else {
      segmenter.push({ basis: punkt.data_basis, punkter: [punkt] });
    }
  }
  return segmenter;
}
