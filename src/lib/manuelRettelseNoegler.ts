/**
 * Den manuelle rettelse og de nøgler, formularen ikke kan udtrykke (3/10-2026, kort
 * g03-manuel-rettelse-taber-noegler; migration 20261003221500_manuel_rettelse_bevarer_noegler.sql).
 *
 * REN spejling af blokken i `public.resolve_report_commit_candidate`s manuelle gren. Den kører ingen steder
 * i appen — den er værnets og genskabelses-SQL'ens orakel: samme regel, skrevet én gang i TypeScript med
 * tests, så SQL'en kan holdes op imod den.
 *
 * Reglen:
 *  - Formularen (reportOverrideHelpers.ALL_FIELDS) skriver kun danske navne. En kanonisk nøgle kan sendes
 *    gennem formularen, hvis den har `dansk_noegle` ELLER et af `danske_aliaser` i public.kanoniske_noegler.
 *  - En nøgle UDEN begge kan formularen aldrig sende. Den tages fra samme rapports `normalized_data.metrics`.
 *  - Formularens tal vinder altid: en nøgle, der allerede står i den manuelle preview, overskrives ikke.
 *  - En værdi tæller som tal på SQL'ens betingelse: ikke null og teksten matcher `^-?[0-9]`
 *    (jsonb_each_text → `value ~ '^-?[0-9]'` → `value::numeric`).
 */

export interface KanoniskNoegleRaekke {
  noegle: string;
  dansk_noegle: string | null;
  danske_aliaser: string[] | null;
}

/** Kan formularen IKKE sende nøglen? (dansk_noegle IS NULL AND COALESCE(cardinality(danske_aliaser), 0) = 0) */
export function formularenKanIkkeUdtrykke(r: KanoniskNoegleRaekke): boolean {
  return r.dansk_noegle === null && (r.danske_aliaser?.length ?? 0) === 0;
}

/** SQL'ens talbetingelse på jsonb_each_text-værdien. Giver tallet eller null. */
export function somSqlTal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" || typeof v === "boolean") return null; // jsonb_each_text: «true»/«{…}» matcher ikke ^-?[0-9]
  const tekst = String(v);
  if (!/^-?[0-9]/.test(tekst)) return null;
  const tal = Number(tekst);
  return Number.isFinite(tal) ? tal : null;
}

/**
 * De nøgler, blokken ville lægge til `manuelPreview` ud fra kilden — i kildens rækkefølge.
 * Formularens nøgler vinder; kun nøgler, formularen ikke kan udtrykke, kommer med.
 */
export function bevaredeNoegler(
  manuelPreview: Record<string, number>,
  kildeMetrics: unknown,
  noegler: KanoniskNoegleRaekke[],
): Record<string, number> {
  if (kildeMetrics === null || typeof kildeMetrics !== "object" || Array.isArray(kildeMetrics)) return {};
  const uudtrykkelige = new Set(noegler.filter(formularenKanIkkeUdtrykke).map((r) => r.noegle));
  const ud: Record<string, number> = {};
  for (const [noegle, vaerdi] of Object.entries(kildeMetrics as Record<string, unknown>)) {
    if (!uudtrykkelige.has(noegle)) continue;
    if (noegle in manuelPreview) continue;
    const tal = somSqlTal(vaerdi);
    if (tal === null) continue;
    ud[noegle] = tal;
  }
  return ud;
}

/** Den manuelle preview efter blokken: formularens tal + de bevarede nøgler. */
export function manuelPreviewMedBevarede(
  manuelPreview: Record<string, number>,
  kildeMetrics: unknown,
  noegler: KanoniskNoegleRaekke[],
): Record<string, number> {
  return { ...manuelPreview, ...bevaredeNoegler(manuelPreview, kildeMetrics, noegler) };
}

/**
 * Genskabelsens regel for én facts-række (docs/sql/20261003-genskab-manuelle-noegler.sql):
 * de nøgler, kilden har, formularen ikke kan udtrykke, og som MANGLER i facts — det, en commit med den
 * rettede funktion ville have bragt med. En nøgle, facts allerede har, røres aldrig (vagten).
 */
export function tabteNoegler(
  factsMetrics: Record<string, unknown>,
  kildeMetrics: unknown,
  noegler: KanoniskNoegleRaekke[],
): Record<string, number> {
  const tilstede: Record<string, number> = {};
  for (const k of Object.keys(factsMetrics)) tilstede[k] = 0;
  return bevaredeNoegler(tilstede, kildeMetrics, noegler);
}
