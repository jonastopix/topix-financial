/**
 * Normalization Profile Fixtures — Phase 1
 *
 * Test cases for profile-driven sign normalization.
 * Each fixture validates that the correct rule fires for given inputs.
 */

import type { NormalizationProfileFixture } from "./fixtureHelpers.ts";

// ── economic_saldobalance_credit_v1 ──

export const fixture_economic_saldobalance_equity: NormalizationProfileFixture = {
  fixture_id: "norm_saldobalance_equity_keep",
  description: "Saldobalance equity uses 'keep' — YTD equity already normal convention, do NOT flip",
  profile_id: "economic_saldobalance_credit_v1",
  candidates: [
    {
      source_field_id: "egenkapital_ialt",
      normalization_family: "equity_like",
      raw_value: -250000,
      expected_normalized_value: -250000, // keep: negative equity stays negative
      expected_action: "keep",
      expected_rule_type: "family_default",
    },
    {
      source_field_id: "egenkapital_ialt",
      normalization_family: "equity_like",
      raw_value: 150000,
      expected_normalized_value: 150000, // keep: positive equity stays positive
      expected_action: "keep",
      expected_rule_type: "family_default",
    },
  ],
};

export const fixture_economic_saldobalance_cash: NormalizationProfileFixture = {
  fixture_id: "norm_saldobalance_cash_keep",
  description: "Cash preserves sign — overdraft (negative) must survive",
  profile_id: "economic_saldobalance_credit_v1",
  candidates: [
    {
      source_field_id: "likvider_ialt",
      normalization_family: "cash_like",
      raw_value: -45000,
      expected_normalized_value: -45000, // keep: overdraft preserved
      expected_action: "keep",
      expected_rule_type: "family_default",
    },
    {
      source_field_id: "likvider_ialt",
      normalization_family: "cash_like",
      raw_value: 120000,
      expected_normalized_value: 120000,
      expected_action: "keep",
      expected_rule_type: "family_default",
    },
  ],
};

export const fixture_economic_saldobalance_revenue: NormalizationProfileFixture = {
  fixture_id: "norm_saldobalance_revenue_abs",
  description: "Revenue in credit convention is negative — abs to positive",
  profile_id: "economic_saldobalance_credit_v1",
  candidates: [
    {
      source_field_id: "omsaetning_ialt",
      normalization_family: "revenue_like",
      raw_value: -1500000,
      expected_normalized_value: 1500000,
      expected_action: "abs",
      expected_rule_type: "family_default",
    },
  ],
};

export const fixture_economic_saldobalance_liability: NormalizationProfileFixture = {
  fixture_id: "norm_saldobalance_liability_abs",
  description: "Liabilities in credit convention are negative — abs to positive",
  profile_id: "economic_saldobalance_credit_v1",
  candidates: [
    {
      source_field_id: "gaeld_ialt",
      normalization_family: "liability_like",
      raw_value: -380000,
      expected_normalized_value: 380000,
      expected_action: "abs",
      expected_rule_type: "family_default",
    },
    {
      source_field_id: "passiver_ialt",
      normalization_family: "liability_like",
      raw_value: -900000,
      expected_normalized_value: 900000,
      expected_action: "abs",
      expected_rule_type: "family_default",
    },
  ],
};

// ── economic_pnl_credit_v1 ──

export const fixture_economic_pnl_cogs_contra: NormalizationProfileFixture = {
  fixture_id: "norm_economic_pnl_cogs_conditional",
  description: "COGS uses field_override with contra_cost_check conditional",
  profile_id: "economic_pnl_credit_v1",
  candidates: [
    {
      source_field_id: "direkte_omkostninger",
      normalization_family: "cost_like",
      raw_value: -50000,
      expected_normalized_value: -50000, // conditional may keep negative if contra-cost validates
      expected_action: "conditional",
      expected_rule_type: "field_override",
    },
  ],
};

// ── Same raw value under different profiles ──

export const fixture_same_raw_different_profiles: NormalizationProfileFixture = {
  fixture_id: "norm_cross_profile_equity",
  description: "Same raw equity value under different profiles — proves profile matters",
  profile_id: "economic_saldobalance_credit_v1", // This profile: keep
  candidates: [
    {
      source_field_id: "egenkapital_ialt",
      normalization_family: "equity_like",
      raw_value: -50000,
      expected_normalized_value: -50000, // saldobalance keeps sign
      expected_action: "keep",
      expected_rule_type: "family_default",
    },
  ],
};

// ── Reject action ──

export const fixture_reject_unclassified: NormalizationProfileFixture = {
  fixture_id: "norm_reject_unclassified",
  description: "contra_or_unknown family triggers reject → null output + fail",
  profile_id: "economic_saldobalance_credit_v1",
  candidates: [
    {
      source_field_id: "unknown_line_total",
      normalization_family: "contra_or_unknown",
      raw_value: 12345,
      expected_normalized_value: null,
      expected_action: "reject",
      expected_rule_type: "family_default",
    },
  ],
};

// ── KJ Auto business convention ──

export const fixture_kj_auto_passthrough: NormalizationProfileFixture = {
  fixture_id: "norm_kj_auto_passthrough",
  description: "Business convention — all values keep sign",
  profile_id: "kj_auto_business_v1",
  candidates: [
    {
      source_field_id: "omsaetning",
      normalization_family: "revenue_like",
      raw_value: 2000000,
      expected_normalized_value: 2000000,
      expected_action: "keep",
      expected_rule_type: "family_default",
    },
    {
      source_field_id: "resultat_foer_skat",
      normalization_family: "profit_like",
      raw_value: -30000,
      expected_normalized_value: -30000, // business: negative = loss, keep it
      expected_action: "keep",
      expected_rule_type: "family_default",
    },
  ],
};
