/**
 * communityOpslagBesked — den RENE del af rådgivernes klokke ved et nyt
 * opslag i Community (16/9-2026). Uden Supabase-import, så vitest kan dække
 * den (src/lib/__tests__/communityOpslagBesked.test.ts). Writeren er husets
 * skrivRaadgiverBesked (raadgiverBesked.ts); kalderen er
 * notify-community-opslag, som er den ENESTE importør af denne fil — så en
 * ændring her rammer kun den ene function (udrulningslisten).
 *
 * JONAS 16/9: «Opslag i community kunne være fedt at få givet notifikation
 * på til rådgivere. Vi får jo ikke mails, og det er nok okay. Men klokken og
 * måske endda forsiden skal fange at der er opslag fra et medlem. Vi vil jo
 * gerne engagere os og skrive kommentarer på folks ting når det giver
 * mening.» Kun klokken nu; forsiden afgøres af Jonas bagefter.
 *
 * HVORFOR DEN FINDES (recon-community-raadgiverne.md §1-§2): rådgiverne
 * FÅR allerede en notifications-række pr. nyt opslag (get_community_medlemmer
 * inkluderer alle rådgivere), men rådgiverens klokke (HbKlokkeRaadgiver →
 * useAdvisorNotifications) læser KUN advisor_notifications. Rækkerne lander
 * i en tabel klokken aldrig åbner, og stemples uden mail i samlemailens
 * rådgiver-gren. Derfor: én advisor_notifications-række pr. rådgiver, i
 * vagtens form (advisor_id sat, dedup på reference_id = trådens id).
 *
 * DOMMEN: forfatteren er rådgiver (admin arver advisor) → null — vi ringer
 * ikke klokken for vores egne opslag. Tom/ugyldig tråd-id → null (intet at
 * dedup'e på, intet at linke til). Navnet er det samme som in-app-titlen
 * (visningsnavn, opslagsMail.ts: profilnavn eller «Et medlem»). Tom titel →
 * body null — aldrig «undefined» i klokken. company_id er forfatterens
 * virksomhed når kalderen har slået den op, ellers null; member_id er
 * forfatteren (kolonnen er NOT NULL; writeren falder tilbage på rådgiveren
 * selv, men her kendes udløseren).
 *
 * KLOKKENS VEJ: reference_type 'community_traad' + reference_id = trådens
 * uuid → /community/{id} (src/lib/hjemmebane/klokke.ts raadgiverSti). Ruten
 * er MemberRoute, som rådgivere passerer (App.tsx:101-108).
 */
import { visningsnavn } from "./opslagsMail.ts";

/** Samme type-navn som notifications-rækken til medlemmerne (notify-community-opslag COMMUNITY_OPSLAG_TYPE). */
export const TYPE_COMMUNITY_OPSLAG = "community_opslag";
export const REFERENCE_COMMUNITY_TRAAD = "community_traad";

/** Strukturelt lig RaadgiverBesked (raadgiverBesked.ts) — som SpaerretMailBesked. */
export interface CommunityOpslagBesked {
  type: string;
  title: string;
  body: string | null;
  company_id: string | null;
  member_id: string;
  reference_type: "community_traad";
  reference_id: string;
}

/** «{navn} har skrevet et nyt opslag» — ordret som in-app-titlen i notify-community-opslag. */
export function opslagsTitel(forfatterNavn: string | null | undefined): string {
  return `${visningsnavn(forfatterNavn)} har skrevet et nyt opslag`;
}

/**
 * Ren dom: skal rådgivernes klokke ringe? Null når forfatteren selv er
 * rådgiver, eller når tråd-id/forfatter-id mangler.
 */
export function beskedVedNytOpslag(a: {
  traadId: string | null | undefined;
  titel: string | null | undefined;
  forfatterId: string | null | undefined;
  forfatterNavn: string | null | undefined;
  forfatterErRaadgiver: boolean;
  companyId?: string | null;
}): CommunityOpslagBesked | null {
  if (a.forfatterErRaadgiver) return null;
  const traadId = (a.traadId ?? "").trim();
  const forfatterId = (a.forfatterId ?? "").trim();
  if (!traadId || !forfatterId) return null;
  const titel = (a.titel ?? "").trim();
  return {
    type: TYPE_COMMUNITY_OPSLAG,
    title: opslagsTitel(a.forfatterNavn),
    body: titel === "" ? null : titel,
    company_id: (a.companyId ?? "").trim() || null,
    member_id: forfatterId,
    reference_type: REFERENCE_COMMUNITY_TRAAD,
    reference_id: traadId,
  };
}
