/**
 * fjernFraVirksomhed — dommen bag «Fjern fra virksomheden» (10/9,
 * recon-de-tre-paa-ny.md §5).
 *
 * HVORFOR: knappen «Fjern medlem» kaldte manage-advisor remove-member, som
 * sletter company_members, profiles OG auth-brugeren — synkront og uden
 * frist. Auth-sletningen kaskaderer (messages.sender_id, conversations
 * .member_id, financial_reports.user_id), og financial_report_facts peger
 * på financial_reports UDEN ON DELETE, så sletningen kan fejle halvvejs:
 * medlemskab og profil væk, kontoen tilbage. Det rådgiveren vil 9 af 10
 * gange er noget andet: personen er stoppet i virksomheden.
 *
 * DENNE handling fjerner ADGANGEN og intet andet: company_members-rækken
 * for (virksomhed, person) slettes. Mennesket, kontoen, profilen, beskederne
 * og uploads bliver. Personen kan inviteres igen. Sletning af en PERSON er
 * en anden beslutning (en vej som slettefunktionen #734) og findes ikke her.
 *
 * AFGJORT 10/9 (Jonas' udgangspunkt var «stempel rækken»): rækken SLETTES,
 * fordi adgangen ER rækkens eksistens — user_company_id(), har_aktivt_
 * medlemskab() og alle company-scoped RLS-policies læser company_members
 * uden at kende et stempel, og de SECURITY DEFINER-funktioner står på
 * FORBIDDEN-listen. Et stempel uden ændring dér fjerner ingen adgang.
 * Arkivsporet er company_invitations (accepted_at, accepted_by), som IKKE
 * nulstilles: process-pending-invitation kobler en konto uden virksomhed på
 * en PENDING invitation med samme e-mail ved hvert load — en nulstilling
 * ville sætte personen ind igen af sig selv.
 *
 * OWNER (afgjort): en owner kan ikke fjernes — hverken den eneste eller en
 * af flere. At lade «en anden overtage» er et ejerskifte, som er sin egen
 * handling («Skift owner findes ikke», mangellisten). Samme regel som
 * remove-member (#608).
 *
 * SAMTALEN: conversations.member_id er NOT NULL UNIQUE og bærer medlemmets
 * SELECT (auth.uid() = member_id). Hænger virksomhedens samtale på personen,
 * flyttes den til owneren FØR rækken slettes — ellers beholder personen
 * chatten. Findes ingen anden owner at flytte til, afvises handlingen.
 *
 * REN, testet i src/lib/__tests__/fjernFraVirksomhed.test.ts. Kalderen
 * (manage-advisor) slår op; dommen er her.
 */

export interface FjernFraVirksomhedInput {
  /** company_members-rækken for (virksomhed, person) — null når personen ikke er medlem dér. */
  medlemskab: { role: string | null } | null;
  /** Hænger virksomhedens samtale (conversations.member_id) på personen? */
  samtaleHaengerPaaPerson: boolean;
  /** Findes der en owner i virksomheden som IKKE er personen (til at overtage samtalen)? */
  andenOwnerFindes: boolean;
}

export type FjernFraVirksomhedGrund = "ikke_medlem" | "er_owner" | "samtale_uden_owner";

export type FjernFraVirksomhedDom =
  | { ok: true; flytSamtale: boolean }
  | { ok: false; grund: FjernFraVirksomhedGrund; status: 404 | 403 | 409; besked: string };

export const OWNER_ROLLE = "owner";

export function doemFjernFraVirksomhed(i: FjernFraVirksomhedInput): FjernFraVirksomhedDom {
  if (!i.medlemskab) {
    return { ok: false, grund: "ikke_medlem", status: 404, besked: "Personen er ikke medlem af virksomheden." };
  }
  if (i.medlemskab.role === OWNER_ROLLE) {
    return {
      ok: false,
      grund: "er_owner",
      status: 403,
      besked: "Ejeren af en virksomhed kan ikke fjernes. Skal ejerskabet skiftes, er det en anden handling.",
    };
  }
  if (i.samtaleHaengerPaaPerson && !i.andenOwnerFindes) {
    return {
      ok: false,
      grund: "samtale_uden_owner",
      status: 409,
      besked: "Virksomhedens samtale hænger på personen, og der er ingen ejer at flytte den til.",
    };
  }
  return { ok: true, flytSamtale: i.samtaleHaengerPaaPerson };
}
