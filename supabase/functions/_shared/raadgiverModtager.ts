/**
 * raadgiverModtager — HVOR rådgiverbeskederne sendes hen, mens kontakt@ er spærret.
 *
 * MIDLERTIDIG (18/9-2026 → 19/10-2026). MÅLT 18/9: kontakt@theboardroom.dk fik en HARD BOUNCE
 * 18/9-2026 kl. 20:47:49 — postkassen fandtes ikke, fordi viderestillingen til jonas@topix.dk ikke
 * var sat op endnu. Mailudbyderen (Lovables managed email) spærrer adressen med kilden «bounce»;
 * den spærring kan IKKE fjernes manuelt — hverken af Lovable eller fra koden — og udløber af sig
 * selv 18/10-2026 kl. 20:47. Indtil da logges alt til kontakt@ som «suppressed» og når ingen.
 * Adressen VIRKER nu (viderestiller til jonas@topix.dk), så den bouncer ikke igen.
 *
 * DERFOR: alt der SENDES TIL kontakt@ (modtager) går til jonas@theboardroom.dk indtil KONTAKT_SPAERRET_TIL,
 * og derefter til kontakt@ igen — af sig selv, på datoen, uden at nogen skal huske det. Skiftet
 * ligger midnat EFTER udbyderens udløb (18/10 20:47 → 19/10 00:00 dansk tid), så der ikke sendes
 * i det minut spærringen falder.
 *
 * KUN modtageren skiftes. Svaradressen (replyTo) på ansøgerens mails, «skriv til kontakt@…» i
 * teksterne og mailto-links rører vi IKKE: de peger på en adresse, der virker for et menneske —
 * spærringen gælder udbyderens afsendelse TIL adressen, ikke andres mails til den.
 *
 * Ren funktion; testet i src/lib/__tests__/raadgiverModtager.guard.test.ts — den test FEJLER
 * efter 19/11-2026 med besked om at fjerne omvejen igen (så den ikke bliver liggende).
 */
import { KONTAKT_ADRESSE } from "./indgangsMail.ts";

/** Bouncen der udløste spærringen (dansk tid). */
export const KONTAKT_BOUNCE_TIDSPUNKT = "2026-09-18T20:47:49+02:00";
/** Udbyderens spærring udløber 18/10-2026 20:47:49; vi skifter tilbage midnat efter. */
export const KONTAKT_SPAERRET_TIL = "2026-10-19T00:00:00+02:00";
/**
 * Hvor beskederne går imens: jonas@theboardroom.dk — samme domæne som afsenderen (notify.theboardroom.dk),
 * hører til The Boardroom, og Jonas har bekræftet 18/9 at den virker. (Ikke jonas@topix.dk — fremmed domæne.)
 */
export const MIDLERTIDIG_RAADGIVERADRESSE = "jonas@theboardroom.dk";

export function erKontaktSpaerret(nu: Date): boolean {
  return nu.getTime() < new Date(KONTAKT_SPAERRET_TIL).getTime();
}

/** En modtageradresse uden om spærringen: kontakt@ → jonas@ mens spærringen gælder; alt andet uændret. */
export function udenSpaerring(adresse: string, nu: Date): string {
  const a = adresse.trim();
  return a.toLowerCase() === KONTAKT_ADRESSE && erKontaktSpaerret(nu) ? MIDLERTIDIG_RAADGIVERADRESSE : a;
}

/** Rådgiverbeskedernes modtager lige nu. */
export function raadgiverModtager(nu: Date): string {
  return udenSpaerring(KONTAKT_ADRESSE, nu);
}
