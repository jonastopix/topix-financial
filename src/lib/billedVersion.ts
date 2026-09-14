/**
 * src/lib/billedVersion.ts
 *
 * Versionen i den GEMTE billed-URL (Jonas' beslutning 14/9).
 *
 * MÅLT 14/9 på /deling: «Jeg kan ikke skifte logo, når først jeg har valgt
 * et.» To lag: (1) getPublicUrl giver den samme URL for den samme sti, så
 * companies.logo_url fik den samme streng som før, React så ingen ændring
 * i <img src>, og browseren bad aldrig om billedet igen. (2) Storage
 * svarer `cache-control: public, max-age=3600` (storage-js' standard
 * cacheControl "3600" ved upload), så selv en ny forespørgsel på samme URL
 * fik det gamle billede i op til en time.
 *
 * DERFOR EN VERSION I DEN GEMTE URL — ikke i komponentens state, og ikke
 * ved at fjerne cachen:
 *   - En fjernet cache betales hver gang et billede vises (medlems-
 *     oversigten henter 30 avatarer ved hvert besøg). En version i URL'en
 *     koster kun noget når billedet faktisk skifter.
 *   - Den løser alle visninger på én gang: strengen er ny for alle der
 *     læser kolonnen — kreativen, sidebaren, medlemsoversigten, mails.
 *   - Versionen er stabil i databasen, ikke regnet ved visning. Den ligger
 *     som `?v=<tidsstempel>` i selve URL'en; visningerne rører den ikke.
 *   Før 14/9 bustede KontoView og IndstillingerView deres egen visning med
 *   `?t=${Date.now()}` i state — det virkede kun for den ene komponent i
 *   den ene session, og alle andre visninger halter. Det er taget ud.
 *
 * DE EKSISTERENDE URL'ER har ingen version og skal IKKE migreres: de
 * virker som de er, og de får en version næste gang billedet skiftes.
 * Ingen migration, ingen bagudrettet omskrivning — en URL uden `?v=` er
 * en gyldig URL og vises uændret.
 *
 * Portrættet på /deling er en signeret URL (privat bucket) med eget udløb
 * og token — den bruger ikke dette og skal lade være.
 */

export const VERSION_PARAM = "v";

/**
 * URL'en med en version bag på: `…/logo?v=1757856000000`. Har URL'en
 * allerede en query, bruges `&`. Versionen er tidsstemplet i ms som
 * standard — to uploads giver to forskellige strenge.
 */
export function medVersion(url: string, version: number = Date.now()): string {
  const [uden, hash] = url.split("#", 2);
  const sep = uden.includes("?") ? "&" : "?";
  return `${uden}${sep}${VERSION_PARAM}=${version}${hash ? `#${hash}` : ""}`;
}

/** Versionen i en gemt URL, eller null når den ingen har (de gamle). */
export function versionAf(url: string | null | undefined): string | null {
  if (!url) return null;
  const q = url.split("#", 1)[0].split("?", 2)[1];
  if (!q) return null;
  for (const del of q.split("&")) {
    const [k, v] = del.split("=", 2);
    if (k === VERSION_PARAM && v) return v;
  }
  return null;
}
