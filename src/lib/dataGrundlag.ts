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

/** Nøgle-suffiks for estimat-delen af en delt serie (delSerieTilTegning). */
export const ESTIMAT_NOEGLE_SUFFIX = "__estimat";

export const erEstimatNoegle = (noegle: string): boolean =>
  noegle.endsWith(ESTIMAT_NOEGLE_SUFFIX);

/** "omsaetning__estimat" → "omsaetning"; målte nøgler passerer uændret. */
export const basisNoegle = (noegle: string): string =>
  erEstimatNoegle(noegle) ? noegle.slice(0, -ESTIMAT_NOEGLE_SUFFIX.length) : noegle;

/** Del en serie til tegning: hver værdinøgle k spaltes i k (målt) og
    k__estimat, så recharts kan tegne målt og estimat som to serier i samme
    farve — fuldt optrukket mod prikket.

    Reglerne:
    - Et punkt bærer kun tal i den nøgle der matcher dets data_basis …
    - … undtagen GRÆNSEPUNKTET: et målt punkt med en estimat-nabo bærer sin
      værdi i BEGGE nøgler, så linjerne mødes uden hul.
    - Konsekvens: en strækning tegnes kun fuldt optrukket når BEGGE
      endepunkter er målinger; enhver strækning med et estimat-endepunkt
      (inkl. selve overgangen) tegnes af estimat-serien. Ingen strækning
      tegnes af begge serier.

    OBS til render-laget: delte serier må IKKE tegnes med connectNulls — den
    målte serie ville bro-tegne fuldt optrukket hen over et estimatsegment
    oveni den prikkede linje. Reelt manglende værdier (null i input) forbliver
    null i begge nøgler og giver et ærligt hul.

    Punkternes øvrige felter (label, periodKey, data_basis, …) bevares
    uændret; input muteres ikke. */
export function delSerieTilTegning<T extends GrundlagsPunkt>(
  punkter: readonly T[],
  vaerdinoegler: readonly string[],
): (T & Record<string, number | null>)[] {
  return punkter.map((p, i) => {
    const erE = erEstimat(p);
    const naboErEstimat =
      (i > 0 && erEstimat(punkter[i - 1])) ||
      (i < punkter.length - 1 && erEstimat(punkter[i + 1]));
    const erGraense = !erE && naboErEstimat;
    const ud: Record<string, number | null> = {};
    for (const k of vaerdinoegler) {
      const val = ((p as Record<string, unknown>)[k] as number | null | undefined) ?? null;
      ud[k] = erE ? null : val;
      ud[`${k}${ESTIMAT_NOEGLE_SUFFIX}`] = erE || erGraense ? val : null;
    }
    return { ...p, ...ud } as T & Record<string, number | null>;
  });
}

export interface SerieSegment<T extends GrundlagsPunkt> {
  basis: DataBasis;
  punkter: T[];
}

/** Del en serie i sammenhængende segmenter med hver sit grundlag — klar til
    at blive tegnet som adskilte serier (fx målt linje + prikket estimatlinje).
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
