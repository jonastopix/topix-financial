import { describe, it, expect } from "vitest";
import {
  computeMembershipTier,
  type MembershipTier,
  type MembershipTierInput,
} from "@/lib/membershipTier";
// Parity import — the Deno copy is intentionally a verbatim mirror of the
// frontend copy. We import it here so vitest fails loudly if the two drift.
import { computeMembershipTier as computeMembershipTierDeno } from "../../../supabase/functions/_shared/membershipTier.ts";

const NOW = new Date("2026-05-22T12:00:00Z");
const FUTURE_CONTRACT = "2027-01-01";
const PAST_CONTRACT = "2026-01-01";
const FUTURE_SUB_END = "2026-12-31T23:59:59Z";
const PAST_SUB_END = "2026-01-01T00:00:00Z";

interface Case {
  name: string;
  input: MembershipTierInput;
  expected: MembershipTier;
}

describe("computeMembershipTier", () => {
  const cases: Case[] = [
    {
      name: "all null → no_date",
      input: { contract_end_date: null, subscription_status: null, subscription_current_period_end: null },
      expected: "no_date",
    },
    {
      name: "no contract_end_date even with active sub fields → no_date (sub does not promote)",
      input: { contract_end_date: null, subscription_status: "active", subscription_current_period_end: FUTURE_SUB_END },
      expected: "no_date",
    },
    {
      name: "contract in future, no sub → full",
      input: { contract_end_date: FUTURE_CONTRACT, subscription_status: null, subscription_current_period_end: null },
      expected: "full",
    },
    {
      name: "contract in future + active sub → full (contract wins)",
      input: { contract_end_date: FUTURE_CONTRACT, subscription_status: "active", subscription_current_period_end: FUTURE_SUB_END },
      expected: "full",
    },
    {
      name: "contract in past, no sub → expired",
      input: { contract_end_date: PAST_CONTRACT, subscription_status: null, subscription_current_period_end: null },
      expected: "expired",
    },
    {
      name: "contract in past, sub status active but period_end null → expired (both required)",
      input: { contract_end_date: PAST_CONTRACT, subscription_status: "active", subscription_current_period_end: null },
      expected: "expired",
    },
    {
      name: "contract in past, sub active + period_end in future → subscriber",
      input: { contract_end_date: PAST_CONTRACT, subscription_status: "active", subscription_current_period_end: FUTURE_SUB_END },
      expected: "subscriber",
    },
    {
      name: "contract in past, sub active + period_end in past → expired",
      input: { contract_end_date: PAST_CONTRACT, subscription_status: "active", subscription_current_period_end: PAST_SUB_END },
      expected: "expired",
    },
    {
      name: "contract in past, sub status canceled with future period_end → expired (status must be active)",
      input: { contract_end_date: PAST_CONTRACT, subscription_status: "canceled", subscription_current_period_end: FUTURE_SUB_END },
      expected: "expired",
    },
    {
      name: "contract in past, sub status past_due with future period_end → expired",
      input: { contract_end_date: PAST_CONTRACT, subscription_status: "past_due", subscription_current_period_end: FUTURE_SUB_END },
      expected: "expired",
    },
    {
      name: "boundary: contract_end_date exactly at now → expired (strict >)",
      input: { contract_end_date: NOW.toISOString(), subscription_status: null, subscription_current_period_end: null },
      expected: "expired",
    },
    {
      name: "boundary: subscription_current_period_end exactly at now with active sub → expired (strict >)",
      input: { contract_end_date: PAST_CONTRACT, subscription_status: "active", subscription_current_period_end: NOW.toISOString() },
      expected: "expired",
    },
    {
      name: "subscription_current_period_end empty string with active sub → expired (falsy)",
      input: { contract_end_date: PAST_CONTRACT, subscription_status: "active", subscription_current_period_end: "" },
      expected: "expired",
    },
    {
      name: "typical full member: future contract, no sub fields → full",
      input: { contract_end_date: FUTURE_CONTRACT, subscription_status: null, subscription_current_period_end: null },
      expected: "full",
    },
  ];

  for (const c of cases) {
    it(`${c.name}`, () => {
      expect(computeMembershipTier(c.input, NOW)).toBe(c.expected);
    });
  }

  it("defaults to new Date() when now is omitted", () => {
    const farPast = "2020-01-01";
    expect(computeMembershipTier({
      contract_end_date: farPast,
      subscription_status: null,
      subscription_current_period_end: null,
    })).toBe("expired");
  });
});

// Parity gate — the Deno copy at supabase/functions/_shared/membershipTier.ts
// must produce identical output for every input the frontend copy handles.
// If this block fails, the two files have drifted and must be re-synced.
describe("computeMembershipTier — parity between src/lib and supabase/functions/_shared", () => {
  const parityCases: Array<{ input: MembershipTierInput; now: Date }> = [
    { input: { contract_end_date: null, subscription_status: null, subscription_current_period_end: null }, now: NOW },
    { input: { contract_end_date: FUTURE_CONTRACT, subscription_status: null, subscription_current_period_end: null }, now: NOW },
    { input: { contract_end_date: PAST_CONTRACT, subscription_status: "active", subscription_current_period_end: FUTURE_SUB_END }, now: NOW },
    { input: { contract_end_date: PAST_CONTRACT, subscription_status: null, subscription_current_period_end: null }, now: NOW },
    { input: { contract_end_date: NOW.toISOString(), subscription_status: null, subscription_current_period_end: null }, now: NOW },
  ];

  for (const { input, now } of parityCases) {
    it(`parity: ${JSON.stringify(input)}`, () => {
      const fe = computeMembershipTier(input, now);
      const deno = computeMembershipTierDeno(input, now);
      expect(deno).toBe(fe);
    });
  }
});
