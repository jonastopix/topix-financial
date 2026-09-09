/**
 * src/lib/importensAdvarsel.ts
 *
 * Teksten der står i import-dialogen på /members FØR man klikker
 * «Importér og send invitation» (Jonas 9/9: «Det er fint. Det er godt at
 * have den mulighed. Men enig i det skal være tydeligt, at det er det der
 * sker.»). Knappen bliver; den skal bare sige hvad den gør.
 *
 * Der er to veje ind (recon-vejen-ind, 9/9):
 *   Monday-vejen: «Godkendt» → virksomhed + prisniveau + betalingslink →
 *     påmindelser → faktura → BETALING → kontraktdatoer + invitation.
 *   Import-vejen (denne dialog): virksomheden oprettes med kontraktdatoer
 *     fra regnearket, intet betalingslink, og invitationen går STRAKS.
 *
 * Teksten nævner præcis de tre ting der adskiller import fra den normale
 * vej, og peger på den anden vej. Det er en oplysning, ikke en fejlbesked.
 * Den vises IKKE i berig-tilstand: berig sender ingen invitation og
 * opretter ingen virksomhed (import-application, enrich mode).
 *
 * Ingen bekræftelse ud over dialogen selv (afgjort 9/9): huset bekræfter
 * sletninger (slet virksomhed, slet invitation, fjern teammedlem), ikke
 * afsendelser (send invitation, gensend, sæt indgangspris, fjern
 * beslutning). Dialogen er allerede to trin — upload, gennemgå, klik på
 * en knap der siger hvad den gør — og advarslen står over knappen.
 */

export const IMPORT_ADVARSEL_OVERSKRIFT = "Det her sker når du importerer";

export const IMPORT_ADVARSEL_LINJER: readonly string[] = [
  "Virksomheden oprettes med kontraktdatoerne fra regnearket.",
  "Der sendes ikke noget betalingslink, og der opkræves ingen betaling.",
  "Invitationen går straks — de har adgang med det samme.",
];

export const IMPORT_ADVARSEL_ANDEN_VEJ =
  "Skal de betale først, sker det automatisk når ansøgningen sættes til Godkendt i Monday.";

export interface ImportAdvarsel {
  overskrift: string;
  linjer: readonly string[];
  andenVej: string;
}

/**
 * Advarslen for dialogens tilstand. `null` i berig-tilstand — der oprettes
 * ingen virksomhed og sendes ingen invitation, så der er intet at advare om.
 */
export function importAdvarsel(enrichCompanyId: string | null | undefined): ImportAdvarsel | null {
  if (enrichCompanyId) return null;
  return {
    overskrift: IMPORT_ADVARSEL_OVERSKRIFT,
    linjer: IMPORT_ADVARSEL_LINJER,
    andenVej: IMPORT_ADVARSEL_ANDEN_VEJ,
  };
}
