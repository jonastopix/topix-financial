/**
 * communitySvarBesked — den RENE del af rådgivernes klokke ved et SVAR i en
 * community-tråd (Jonas 21/9-2026: «klokke, ikke mail»). Spejler formen i
 * communityOpslagBesked.ts: uden Supabase-import, så vitest kan dække den
 * (src/lib/__tests__/communitySvarBesked.test.ts). Writeren er husets
 * skrivRaadgiverBesked; kalderen er notify-community-svar, som er den ENESTE
 * importør af denne fil (udrulningslisten er én function).
 *
 * HVORFOR: notify-community-svar skrev kun en notifications-række til trådens
 * forfatter (recon-klokker-mail.md §1.1) — rådgivernes klokke hørte aldrig et
 * svar. Nu: én advisor_notifications-række pr. rådgiver, i vagtens form.
 *
 * DOMMEN: svarets forfatter er rådgiver (admin arver advisor) → null — vi ringer
 * ikke klokken for vores egne svar. Tom/ugyldig tråd-id eller forfatter-id → null.
 * Titlen bærer svarets forfatter OG trådens titel (visningsnavn: profilnavn eller
 * «Et medlem»); body null — trådens titel står i titlen. member_id er svarets
 * forfatter; company_id forfatterens virksomhed, når kalderen har slået den op.
 *
 * KLOKKENS VEJ: reference_type 'community_traad' + reference_id = TRÅDENS uuid →
 * /community/{id} (src/lib/hjemmebane/klokke.ts raadgiverSti) — linket går til
 * tråden, ikke til svaret. DEDUP (Jonas 21/9): notify-community-svar kalder
 * writeren med dedupKunUlaeste — kun ULÆSTE rækker (read_at IS NULL) spærrer,
 * pr. rådgiver. Flere svar, før rådgiveren har læst klokken, samles i den ene;
 * når den er læst, giver næste svar en ny. Alle andre kaldere er uændrede.
 *
 * MAILEN: typen står under ALDRIG i _shared/klokkeMail.ts («Jonas 21/9: klokke,
 * ikke mail») — klokke-mail-cron mailer den aldrig.
 */
import { visningsnavn } from "./opslagsMail.ts";

export const TYPE_COMMUNITY_SVAR = "community_svar";
export const REFERENCE_COMMUNITY_TRAAD = "community_traad";

/** Strukturelt lig RaadgiverBesked (raadgiverBesked.ts) — som CommunityOpslagBesked. */
export interface CommunitySvarBesked {
  type: string;
  title: string;
  body: string | null;
  company_id: string | null;
  member_id: string;
  reference_type: "community_traad";
  reference_id: string;
}

/** «{navn} har svaret i «{trådens titel}»» — eller «… på et opslag», når tråden ingen titel har. */
export function svarTitel(forfatterNavn: string | null | undefined, traadTitel: string | null | undefined): string {
  const titel = (traadTitel ?? "").trim();
  return titel === "" ? `${visningsnavn(forfatterNavn)} har svaret på et opslag` : `${visningsnavn(forfatterNavn)} har svaret i «${titel}»`;
}

/** Ren dom: skal rådgivernes klokke ringe ved svaret? Null når svarets forfatter selv er rådgiver, eller når tråd-id/forfatter-id mangler. */
export function beskedVedSvar(a: {
  traadId: string | null | undefined;
  traadTitel: string | null | undefined;
  forfatterId: string | null | undefined;
  forfatterNavn: string | null | undefined;
  forfatterErRaadgiver: boolean;
  companyId?: string | null;
}): CommunitySvarBesked | null {
  if (a.forfatterErRaadgiver) return null;
  const traadId = (a.traadId ?? "").trim();
  const forfatterId = (a.forfatterId ?? "").trim();
  if (!traadId || !forfatterId) return null;
  return {
    type: TYPE_COMMUNITY_SVAR,
    title: svarTitel(a.forfatterNavn, a.traadTitel),
    body: null,
    company_id: (a.companyId ?? "").trim() || null,
    member_id: forfatterId,
    reference_type: REFERENCE_COMMUNITY_TRAAD,
    reference_id: traadId,
  };
}
