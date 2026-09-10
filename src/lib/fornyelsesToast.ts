/**
 * fornyelsesToast — den første sætning efter en fornyelsesbetaling.
 *
 * HVORFOR (10/9, recon-sikkerhed-og-toast.md §3): teksten blev valgt på
 * tier EFTER hjemkomsten, men webhooken (der sætter contract_end_date) og
 * returen fra Stripe er et kapløb, og webhooken vinder normalt. En
 * GENÅBNET (betalte fra gaten) kom derfor hjem med tier «full» og fik
 * «fortsætter uden afbrydelse — den nye periode begynder hvor den nuværende
 * slutter» — falsk to gange: adgangen VAR afbrudt, og perioden begynder på
 * betalingsdagen (fornyelsesperiode, efter-grenen).
 *
 * Nu bærer opret-fornyelse-checkout FØR-tilstanden med i success_url
 * (?foer=aktiv|udloebet), og sætningen vælges på den. Tier-efter bruges kun
 * til at sige om adgangen allerede er åben igen. Uden foer (en session
 * oprettet før denne ændring) falder vi tilbage på den gamle tier-regel.
 */

export type FornyelseFoer = "aktiv" | "udloebet";
export type TierEfter = "full" | "subscriber" | "expired" | null;

export const TOAST_TITEL = "Tak — vi glæder os til et år mere";

export const TOAST_FORTSAETTER =
  "Betalingen er modtaget. Dit medlemskab fortsætter uden afbrydelse — den nye periode begynder hvor den nuværende slutter.";
export const TOAST_AABEN_IGEN = "Betalingen er modtaget. Din adgang er åben igen — den nye periode løber fra i dag.";
export const TOAST_AABNER_SNART = "Vi åbner din adgang om et øjeblik…";

/** Læser ?foer= — alt andet end de to kendte værdier er «ukendt» (null). */
export function laesFoer(raa: string | null | undefined): FornyelseFoer | null {
  return raa === "aktiv" || raa === "udloebet" ? raa : null;
}

export function fornyelsesToastTekst(a: { foer: FornyelseFoer | null; tier: TierEfter }): string {
  if (a.foer === "aktiv") return TOAST_FORTSAETTER;
  if (a.foer === "udloebet") return a.tier === "expired" || a.tier === null ? TOAST_AABNER_SNART : TOAST_AABEN_IGEN;
  // Ukendt før-tilstand: den gamle regel — tier-efter.
  return a.tier === "full" ? TOAST_FORTSAETTER : TOAST_AABNER_SNART;
}
