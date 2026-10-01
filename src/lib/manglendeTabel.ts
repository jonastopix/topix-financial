/**
 * manglendeTabel — «findes tabellen slet ikke?» ud fra et PostgREST-fejlsvar.
 *
 * Bruges hvor en flade læser en tabel fra en migration, der endnu ikke er
 * kørt, og skal stå ROLIGT («på vej») i stedet for at fejle — og blive
 * rigtig af sig selv i samme sekund migrationen er kørt, uden en ny Update.
 *
 * To koder, fordi to veje giver hver sin (IKKE målt i prod, hvilken Lovables
 * PostgREST svarer med — derfor begge):
 *   - PGRST205: PostgREST ≥ 12 — «Could not find the table 'public.x' in the
 *     schema cache». Svaret FØR forespørgslen når Postgres.
 *   - 42P01: Postgres' egen «relation "x" does not exist» (ældre PostgREST,
 *     og samme mønster som hooks/annonceforbrug.ts:erUkendtTabel).
 * Koden tjekkes FØRST: en netværksfejl, en RLS-afvisning eller en manglende
 * KOLONNE (42703/PGRST204) må aldrig læses som «tabellen mangler» — så ville
 * fladen sige «på vej» om en fejl, der skal ses. Uden kode: kun beskeder,
 * der entydigt siger, at tabellen/relationen ikke findes.
 */
export const MANGLENDE_TABEL_KODER: readonly string[] = ["PGRST205", "42P01"];

export function erManglendeTabel(fejl: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!fejl) return false;
  if (typeof fejl.code === "string" && fejl.code !== "") return MANGLENDE_TABEL_KODER.includes(fejl.code);
  const besked = fejl.message ?? "";
  return (/could not find the table/i.test(besked) && /schema cache/i.test(besked)) || (/relation/i.test(besked) && /does not exist/i.test(besked));
}

/**
 * erManglendeKolonne — «findes KOLONNEN ikke?» (1/10-2026, Dine mål:
 * hooks/dineMaalGrundlag.ts læser milestones.art/maal_noegle/udgangspunkt/
 * udgangspunkt_dato fra migration 20261001210000 og falder tilbage på de
 * gamle kolonner, til migrationen er kørt). Samme mønster som tabellen:
 *   - 42703: Postgres' «column … does not exist» — svaret på en SELECT af en
 *     ukendt kolonne gennem PostgREST.
 *   - PGRST204: PostgREST's «Could not find the '…' column of '…' in the
 *     schema cache» — svaret på en INSERT/UPDATE med en ukendt kolonne.
 * (IKKE målt i prod, hvilken af de to Lovables PostgREST giver — derfor begge.)
 * Koden tjekkes FØRST; en manglende TABEL (PGRST205/42P01), RLS eller netværk
 * er aldrig «kolonnen mangler». Uden kode: kun en besked, der entydigt siger det.
 */
export const MANGLENDE_KOLONNE_KODER: readonly string[] = ["42703", "PGRST204"];

export function erManglendeKolonne(fejl: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!fejl) return false;
  if (typeof fejl.code === "string" && fejl.code !== "") return MANGLENDE_KOLONNE_KODER.includes(fejl.code);
  const besked = fejl.message ?? "";
  return (/column/i.test(besked) && /does not exist/i.test(besked)) || (/could not find the/i.test(besked) && /column/i.test(besked) && /schema cache/i.test(besked));
}
