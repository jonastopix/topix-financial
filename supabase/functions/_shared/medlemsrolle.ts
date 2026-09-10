/**
 * medlemsrolle — rollen et nyt company_members-medlem skal have.
 *
 * REGLEN er migrationens (20260904110000, handle_new_user, #622): er der
 * INGEN company_members-rækker i virksomheden i forvejen, er personen
 * ejeren («owner»); ellers er personen medlem («member»). Målt 4/9: ni
 * virksomheder havde ét medlem med rollen member og ingen owner — og uden
 * owner kan ingen i virksomheden gøre det owner-værnet (#608) beskytter,
 * kontaktpersonen er tom, og alle kan fjernes.
 *
 * Triggeren blev rettet 4/9; de tre edge-veje der også skriver
 * company_members (process-pending-invitation, attach-user-to-company,
 * create-legat-enrollment) skrev stadig 'member' ubetinget. De bruger nu
 * denne ene funktion (10/9, recon-penge-og-roller.md §4).
 *
 * REN: kalderen tæller rækkerne, dommen er her. Testet i
 * src/lib/__tests__/medlemsrolle.test.ts.
 */

export const OWNER_ROLLE = "owner";
export const MEDLEM_ROLLE = "member";
export type Medlemsrolle = typeof OWNER_ROLLE | typeof MEDLEM_ROLLE;

/** Ingen medlemmer i forvejen → owner. Ellers member. Et ugyldigt tal (null/negativt/NaN) regnes som 0. */
export function foersteMedlemsRolle(antalEksisterende: number | null | undefined): Medlemsrolle {
  const n = typeof antalEksisterende === "number" && Number.isFinite(antalEksisterende) ? antalEksisterende : 0;
  return n > 0 ? MEDLEM_ROLLE : OWNER_ROLLE;
}
