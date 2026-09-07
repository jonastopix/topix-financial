/**
 * src/lib/membershipTier.ts
 *
 * Canonical membership-tier computation for The Boardroom.
 * Mirrored verbatim in supabase/functions/_shared/membershipTier.ts —
 * any change here MUST be applied there too. Parity is enforced by the
 * unit test in src/lib/__tests__/membershipTier.test.ts.
 *
 * Denne dom findes FEM steder, ikke to (målt 3/9 2026, docs/adgangsdomme.md):
 *   1. src/lib/membershipTier.ts                     (kanonisk, frontend)
 *   2. supabase/functions/_shared/membershipTier.ts  (Deno-spejl, paritetstestet)
 *   3. public.is_membership_active(uuid)             (SQL, fail-open — Netværk, events)
 *   4. public.har_aktivt_medlemskab(uuid)            (SQL, læser kun contract_end_date —
 *                                                     community, indhold, events, storage)
 *   5. public.har_aktivt_abonnement(uuid)            (SQL, læser kun abonnementet — Talks)
 * Kun 1 og 2 er dækket af en test. De tre SQL-domme fanges af INGEN test og
 * skal rettes i hånden med en migration, når logikken her ændres — ellers
 * står indholdsadgangen tilbage på den gamle dom. Læs docs/adgangsdomme.md
 * før nogen ændring.
 *
 * REGLEN FOR SLUTDATOEN (besluttet 7/9-2026, Jonas): contract_end_date er
 * den SIDSTE DAG MED ADGANG. Tier skifter til "expired" kl. 00:00 UTC
 * dagen EFTER slutdatoen. Eksempel: slutdato 7/9 → adgang til og med 7/9,
 * expired fra 8/9 kl. 00:00 UTC. Før 7/9 gjaldt det modsatte (strengt
 * `contract_end_date > now` mod en date-kolonne, dvs. UTC-midnat PÅ
 * slutdagen), så et medlem mistede adgangen kl. 02 dansk tid natten før
 * sin egen slutdato — mens mails og bånd sagde «slutter i dag» og
 * «udløber 27. september». Målt i prod 7/9: ændringen ramte præcis én
 * virksomhed (CARMA STUDIO, slutdato 7/9) og gav dem den dag de havde
 * betalt for; ingen udløben virksomhed fik adgang igen (nærmeste var 2 og
 * 6 dage forbi). Sammenligningen sker på UTC-kalenderdagen af
 * contract_end_date (en date-kolonne læses som UTC-midnat; et
 * tidsstempel læses som sin UTC-dag), så resultatet er det samme uanset
 * maskinens tidszone. Abonnementets current_period_end er et TIDSSTEMPEL
 * og sammenlignes uændret som tidspunkt.
 *
 * DE TRE SQL-DOMME (3-5 ovenfor) er IKKE rettet med denne ændring:
 * is_membership_active og har_aktivt_medlemskab siger stadig
 * `contract_end_date > now()`, altså den gamle grænse. De er SECURITY
 * DEFINER og kræver eksplicit grønt lys og en migration (CLAUDE.md).
 * Indtil da er community/indhold/events/storage lukket på slutdagen,
 * mens skallen er åben.
 *
 * The function has zero imports so it can be loaded by both Vite/Vitest
 * (Node) and Deno without modification.
 */

export type MembershipTier = "no_date" | "full" | "subscriber" | "expired";

export interface MembershipTierInput {
  contract_end_date: string | null | undefined;
  subscription_status: string | null | undefined;
  subscription_current_period_end: string | null | undefined;
}

/**
 * Første øjeblik UDEN adgang: kl. 00:00 UTC dagen efter contract_end_date,
 * regnet på slutdatoens UTC-kalenderdag. Null når datoen ikke kan læses —
 * så gives der ikke "full" på et tal vi ikke har (uændret fail-closed:
 * før gav `NaN > now` også false).
 */
function foersteOejeblikUdenAdgang(contractEndDate: string): number | null {
  const d = new Date(contractEndDate);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export function computeMembershipTier(
  input: MembershipTierInput,
  now: Date = new Date(),
): MembershipTier {
  if (!input.contract_end_date) return "no_date";
  // Slutdatoen er den sidste dag med adgang: full til og med slutdagen,
  // expired fra kl. 00:00 UTC dagen efter (se filhovedet).
  const udenAdgangFra = foersteOejeblikUdenAdgang(input.contract_end_date);
  if (udenAdgangFra !== null && now.getTime() < udenAdgangFra) return "full";
  if (
    input.subscription_status === "active" &&
    input.subscription_current_period_end &&
    new Date(input.subscription_current_period_end) > now
  ) {
    return "subscriber";
  }
  return "expired";
}
