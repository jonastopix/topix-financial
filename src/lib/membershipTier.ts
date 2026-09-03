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
 * The function has zero imports so it can be loaded by both Vite/Vitest
 * (Node) and Deno without modification.
 */

export type MembershipTier = "no_date" | "full" | "subscriber" | "expired";

export interface MembershipTierInput {
  contract_end_date: string | null | undefined;
  subscription_status: string | null | undefined;
  subscription_current_period_end: string | null | undefined;
}

export function computeMembershipTier(
  input: MembershipTierInput,
  now: Date = new Date(),
): MembershipTier {
  if (!input.contract_end_date) return "no_date";
  if (new Date(input.contract_end_date) > now) return "full";
  if (
    input.subscription_status === "active" &&
    input.subscription_current_period_end &&
    new Date(input.subscription_current_period_end) > now
  ) {
    return "subscriber";
  }
  return "expired";
}
