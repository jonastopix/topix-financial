/**
 * src/lib/medlemsfjernelse.ts
 *
 * ÉN dom over «må dette medlem fjernes med remove-member» — den samme på
 * begge flader (MemberCompanyRow på /members og MemberDetail) og spejlet
 * ordret i edge-funktionen manage-advisor (Deno kan ikke importere herfra;
 * filhovedet i funktionen henviser hertil).
 *
 * BESLUTNING (Jonas, 4. september 2026): en owner kan ALDRIG fjernes med
 * remove-member. Sletningen er irreversibel — company_members, profiles OG
 * auth-brugeren ryger — og et værn der kun findes i fladen afhænger af
 * hvilken skærm knappen blev trykket på. Skal virksomheden væk, slettes
 * virksomheden (delete-company); skal owneren skiftes, er det en anden
 * handling, som ikke findes endnu.
 *
 * Målt 4/9: manage-advisor tillader kun admin at kalde remove-member
 * (per-action default-deny), så fladen må heller ikke vise knappen for en
 * rådgiver uden admin — ellers lover den noget serveren afviser.
 *
 * Ren funktion, ingen imports, testet i __tests__/medlemsfjernelse.test.ts.
 */

/** company_members.role for ejeren. De to værdier i drift er 'owner' og 'member'
    (målt i prod 13/8: 24 owner / 13 member). */
export const OWNER_ROLLE = "owner";

/** Er rækken en owner? null/undefined (rolle ukendt) er IKKE owner —
    serveren afviser kun når en owner-række faktisk findes, og fladen skal
    dømme ens. */
export function erOwner(role: string | null | undefined): boolean {
  return role === OWNER_ROLLE;
}

/** Må knappen «Fjern medlem» vises, og må kaldet sendes?
    Kræver admin (serverens per-action-gate) OG at målet ikke er owner. */
export function maaFjerneMedlem(erAdmin: boolean, role: string | null | undefined): boolean {
  return erAdmin && !erOwner(role);
}
