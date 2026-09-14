/**
 * src/lib/kontaktadresse.ts
 *
 * Kontaktadressen i indgangen, på frontenden — ét sted.
 *
 * BESLUTTET af Jonas 14/9 2026: adressen i indgangen er
 * kontakt@theboardroom.dk. Invitationsmailen (#852), dag 0-mailen og
 * fornyelsens kvittering (#856) fik den samme dag; /betal var det fjerde og
 * sidste sted med en personlig adresse (set på skærm 14/9 kl. 12:47:
 * «Spørgsmål? Skriv til jonas@topix.dk») — og det er den skærm et menneske
 * står på MENS betalingen bekræftes. Målt i hele src/ samme dag: adressen
 * stod atten steder i seks filer (Betal, CompanyLinkFailedGate,
 * MembershipExpiredGate, FornyelseKvittering, BookSessionView, ChatShell).
 *
 * SYNC MED DENO-SIDEN: mailene læser KONTAKT_ADRESSE fra
 * supabase/functions/_shared/indgangsMail.ts, som src/ ikke kan importere
 * (Deno-import med .ts-endelse og esm.sh-afhængigheder). De to konstanter
 * holdes ens af et kildeværn, der læser begge filer og sammenligner
 * literalerne (src/lib/__tests__/kontaktadresseFladen.guard.test.ts) —
 * driver de fra hinanden, fejler testen. Værdien står altså to steder,
 * men kan ikke ændres ét sted uden at det ses.
 */

export const KONTAKT_ADRESSE = "kontakt@theboardroom.dk";

/** mailto-link med emne, så mailen kan kendes fra de andre («The Boardroom — mit betalingslink»). */
export function mailtoKontakt(emne?: string): string {
  return emne ? `mailto:${KONTAKT_ADRESSE}?subject=${encodeURIComponent(emne)}` : `mailto:${KONTAKT_ADRESSE}`;
}
