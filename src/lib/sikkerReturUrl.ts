/**
 * sikkerReturSti — hvor må /auth?returnUrl=… sende en bruger hen efter login?
 * (30/9-2026, sikkerhedsanalysen fund 4.)
 *
 * HULLET: Auth.tsx satte `window.location.href = returnUrl` for ENHVER
 * https-adresse. Et link til app.theboardroom.dk/auth?returnUrl=https://falsk…
 * lod medlemmet logge ind på den ægte side og lande på en falsk.
 *
 * DOMMEN: svaret er ALTID en intern sti (starter med «/», aldrig «//»), ellers «/».
 *   - En relativ sti skal starte med «/», ikke «//», og må hverken indeholde
 *     «\» eller mellemrum/kontroltegn (browseren fjerner tab/linjeskift i en
 *     URL, så «/\t/ond.dk» ville blive «//ond.dk»).
 *   - En absolut https-adresse på vores EGEN vært (appens origin, eller
 *     app.theboardroom.dk) oversættes til sin sti — det er formen, som
 *     create-legat-enrollment sender (…/auth?returnUrl=https://app.theboardroom.dk/legat).
 *     Alle andre absolutte adresser → «/».
 *   - Til sidst parses resultatet mod vores origin, og det skal blive på den
 *     origin — det fanger former, reglerne ovenfor ikke har forudset.
 *
 * Ren funktion — testes i src/lib/__tests__/sikkerReturUrl.test.ts.
 */

/** Værter, en absolut returnUrl må pege på (målt 30/9: create-legat-enrollment). */
export const TILLADTE_RETUR_VAERTER: readonly string[] = ["app.theboardroom.dk"];

const STANDARD = "/";
// deno-lint-ignore no-control-regex
const FORBUDTE_TEGN = /[\s\u0000-\u001f\u007f\\]/;

export function sikkerReturSti(raa: string | null | undefined, egenOrigin?: string): string {
  if (!raa || FORBUDTE_TEGN.test(raa)) return STANDARD;

  let base: URL;
  try {
    base = new URL(egenOrigin || "https://app.theboardroom.dk");
  } catch {
    base = new URL("https://app.theboardroom.dk");
  }

  let kandidat: URL;
  if (raa.startsWith("/")) {
    if (raa.startsWith("//")) return STANDARD;
    try {
      kandidat = new URL(raa, base);
    } catch {
      return STANDARD;
    }
    if (kandidat.origin !== base.origin) return STANDARD;
  } else if (/^https:\/\//i.test(raa)) {
    try {
      kandidat = new URL(raa);
    } catch {
      return STANDARD;
    }
    const egen = kandidat.origin === base.origin;
    const tilladt = kandidat.protocol === "https:" && TILLADTE_RETUR_VAERTER.includes(kandidat.hostname) && kandidat.port === "";
    if (!egen && !tilladt) return STANDARD;
    if (kandidat.username || kandidat.password) return STANDARD;
  } else {
    return STANDARD;
  }

  const sti = `${kandidat.pathname}${kandidat.search}${kandidat.hash}`;
  if (!sti.startsWith("/") || sti.startsWith("//")) return STANDARD;
  return sti;
}
