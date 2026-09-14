/**
 * src/lib/optagelsesdato.ts
 *
 * «Optaget {måned år}» på kreativen (14/9, set på skærm af Jonas): linjen
 * sagde «september 2026» på alle tolv varianter, fordi dateLabel blev
 * regnet af dagens dato — datoen kreativen LAVES, ikke datoen hun blev
 * medlem. Kilden er companies.contract_start_date, som sættes ved indgangen
 * (stripe-webhook:681, periode.periode_start) og ved import
 * (import-application:171). Er feltet tomt, vises INGEN dato — aldrig en
 * gættet. Ren funktion; formen er delingskreativ.dateLabel's («marts 2026»).
 */
import { dateLabel } from "./delingskreativ";

/**
 * «2026-03-01» eller «2026-03-01T00:00:00+00:00» → «marts 2026». Kun år og
 * måned læses (de første syv tegn), så tidszonen kan ikke flytte en
 * månedsstart over midnat. null når feltet er tomt eller ikke er en dato.
 */
export function optagelsesLabel(contractStartDate: string | null | undefined): string | null {
  const t = (contractStartDate ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(t);
  if (!m) return null;
  const aar = Number(m[1]);
  const maaned = Number(m[2]);
  if (maaned < 1 || maaned > 12) return null;
  return dateLabel(new Date(aar, maaned - 1, 1));
}
