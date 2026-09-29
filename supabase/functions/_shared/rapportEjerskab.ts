/**
 * rapportEjerskab — hører rapporten (og dens fil) til den virksomhed, kaldet
 * gælder? (30/9-2026, sikkerhedsanalysen fund 2 og 5.)
 *
 * HULLET: extract-annual-report og update-annual-report-revenue tjekkede kun,
 * at kalderen måtte røre `company_id` fra body'en — `report_id` og `file_path`
 * fra SAMME body blev brugt med service role uden at være bundet til den
 * virksomhed. Et medlem af A kunne sende company_id = A og file_path = «B/…»
 * og få B's årsrapport læst af AI'en ind i A's tal; eller report_id = B's
 * rapport og overskrive den.
 *
 * DOMMEN: rapporten slås op med KALDERENS klient (RLS: egne/virksomhedens
 * rapporter for et medlem, alle for en rådgiver), og dens company_id skal være
 * den virksomhed, kaldet gælder. Filen hentes fra databasens file_path —
 * aldrig body'ens — og den skal ligge i virksomhedens egen mappe
 * (`<company_id>/…`, som RapporteringView uploader den). Stien tjekkes, fordi
 * rapportrækken selv kan skrives af medlemmet («Users can update own reports»
 * har ingen WITH CHECK — fund 6/B3).
 *
 * Ingen IO, ingen Deno-afhængighed — testes i vitest fra src/lib/__tests__.
 */

export type RapportRaekke = { company_id?: unknown; file_path?: unknown } | null | undefined;

export type RapportDom =
  | { ok: true }
  | { ok: false; status: 403 | 404; grund: "rapport_findes_ikke" | "rapport_tilhoerer_anden_virksomhed" };

export type FilDom =
  | { ok: true; filSti: string }
  | { ok: false; status: 403; grund: "fil_uden_for_virksomhedens_mappe" };

/** Rapporten findes (for kalderen) og tilhører `companyId`. */
export function doemRapportEjer(rapport: RapportRaekke, companyId: string): RapportDom {
  if (!rapport) return { ok: false, status: 404, grund: "rapport_findes_ikke" };
  if (typeof rapport.company_id !== "string" || rapport.company_id !== companyId) {
    return { ok: false, status: 403, grund: "rapport_tilhoerer_anden_virksomhed" };
  }
  return { ok: true };
}

/**
 * Databasens file_path ligger i `<companyId>/` — ingen «..», ingen «\», ingen
 * tom mappe («//») og ingen kontroltegn, så stien ikke kan pege ud af mappen.
 */
export function doemRapportFil(rapport: RapportRaekke, companyId: string): FilDom {
  const sti = rapport?.file_path;
  const afvist = { ok: false as const, status: 403 as const, grund: "fil_uden_for_virksomhedens_mappe" as const };
  if (typeof sti !== "string" || !companyId) return afvist;
  if (!sti.startsWith(`${companyId}/`)) return afvist;
  const rest = sti.slice(companyId.length + 1);
  if (rest.length === 0) return afvist;
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(sti)) return afvist;
  if (sti.includes("//")) return afvist;
  if (sti.split("/").some((del) => del === ".." || del === ".")) return afvist;
  return { ok: true, filSti: sti };
}

/**
 * Årstallet indsættes i et PostgREST-filter (`.or(...)`, `.like(...)`), så det
 * skal være præcis fire cifre — ellers kan «%» eller «,» brede filteret ud.
 */
export function gyldigtAarstal(year: unknown): year is string | number {
  if (typeof year !== "string" && typeof year !== "number") return false;
  return /^\d{4}$/.test(String(year));
}
