/**
 * src/lib/medlemsfjernelse.ts
 *
 * ÉN dom over «må dette medlem fjernes fra virksomheden» — den samme i
 * fladen (virksomhedssidens knap i VirksomhedView) og spejlet i
 * edge-funktionen manage-advisor (Deno kan ikke importere herfra; dommen
 * på serveren ligger i _shared/fjernFraVirksomhed.ts).
 *
 * BESLUTNING (Jonas, 4. september 2026): en owner kan ALDRIG fjernes. Skal
 * virksomheden væk, slettes virksomheden (delete-company); skal owneren
 * skiftes, er det en anden handling, som ikke findes endnu.
 *
 * SIDEN 10/9 NAT: fjern-fra-virksomhed sletter kun company_members-rækken
 * (advisor ELLER admin) og er reversibel — personen kan inviteres igen.
 * #803 byggede den admin-only samme aften — Morten kunne ikke bruge knappen
 * (Morten-gaten, mangellistens kort 109). Fladen og serveren
 * (ADVISOR_ALLOWED_ACTIONS i manage-advisor) skal sige det samme;
 * kildeværnet i testen læser begge filer.
 *
 * KORT 83 (13/9): den gamle dom over sletning af PERSONEN (/members' knap,
 * admin-only) er fjernet sammen med knappen og serverens gren. Grenen
 * slettede company_members, profiles og auth-brugeren i tre skridt uden
 * transaktion, og FK'erne på financial_report_facts (NO ACTION) lod
 * auth-sletningen fejle efter de to første — personen stod halvt slettet.
 * Rigtig sletning af en person har sit eget kort. Kildeværnet i testen
 * fejler, hvis dommen eller action'en kommer tilbage.
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

/** fjern-fra-virksomhed (virksomhedssidens «Fjern fra virksomheden», 10/9,
    dommen i _shared/fjernFraVirksomhed.ts — kun company_members-rækken):
    kræver rådgiver (advisor ELLER admin — useAuth.isAdvisor er begge) OG at
    målet ikke er owner. Jonas og Morten er de to; en gate der kun slipper
    den ene igennem, er ikke en gate. */
export function maaFjerneFraVirksomhed(erRaadgiver: boolean, role: string | null | undefined): boolean {
  return erRaadgiver && !erOwner(role);
}
