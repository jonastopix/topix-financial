/**
 * omkostningsFortegn — husets konvention for omkostningsposter: POSITIVE.
 *
 * MÅLT I PROD 7/9 kl. 19:00: to af fire skriveveje skrev omkostninger
 * NEGATIVT (regnskabets fortegn) — annual_report 24 af 132 rækker, manual
 * 16 af 67 — mens månedsvejen (canonical/canonical_v2, 118 rækker) skrev
 * positivt. Månedsvejen er flertallet og den kanoniske: normalizationProfiles
 * har `cost_like: ABS` i alle profiler, canonicalEngine regner
 * `ebitda = gross_profit − opex` med `opex > 0`-guard, og hver læser der
 * summerer (calcTotalExpenses, BVA, ugefokus) tager |beløb| selv. Ingen
 * læser LÆGGER en negativ omkostning til — så et negativt fortegn er aldrig
 * «rigtigt» nogen steder; det er kun en glidning fra formularens
 * placeholders («Eks. -320000») og fra AI'ens råtal på årsrapport-vejen.
 *
 * Årsrapport-vejen blev rettet 27/8 (normaliserAarsrapport, regel 1). Den
 * MANUELLE vej (saveManualOverride → manual_normalized_data → SQL-branchen
 * i resolve_report_commit_candidate, som kopierer råt) bruges hver gang
 * nogen retter data i hånden — den får samme regel her. Balanceposter og
 * resultatlinjer røres IKKE: bruttoresultat, resultat og egenkapital kan
 * være ægte negative (mangellisten #38).
 */

/** De seks omkostningsnøgler (danske, som formularen og adapteren bruger). */
export const OMKOSTNINGSNOEGLER_DK = [
  "direkte_omkostninger",
  "loenninger",
  "salgsomkostninger",
  "lokaleomkostninger",
  "administrationsomkostninger",
  "afskrivninger",
] as const;

/** Kopi af metrics hvor de seks omkostningsposter er |beløb|. null og
    manglende nøgler bevares; alle andre nøgler røres ikke. */
export function positiveOmkostninger<T extends Record<string, number | null | undefined>>(metrics: T): T {
  const ud: Record<string, number | null | undefined> = { ...metrics };
  for (const noegle of OMKOSTNINGSNOEGLER_DK) {
    const v = ud[noegle];
    if (typeof v === "number" && Number.isFinite(v)) ud[noegle] = Math.abs(v);
  }
  return ud as T;
}
