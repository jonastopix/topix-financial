/**
 * supabase/functions/_shared/membershipTier.ts
 *
 * Canonical membership-tier computation for The Boardroom.
 * Mirrored verbatim in src/lib/membershipTier.ts —
 * any change here MUST be applied there too. Parity is enforced by the
 * unit test in src/lib/__tests__/membershipTier.test.ts.
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
