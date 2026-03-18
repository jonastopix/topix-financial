/**
 * Normalization Profile Registry — Rev 7 Architecture
 *
 * Central registry of sign-normalization profiles for deterministic extraction.
 * Each profile declares:
 *   - family_defaults: rule per MetricFamily
 *   - field_overrides: rule per source_field_id (takes precedence)
 *
 * Normalization uses ONLY authoritative pre-canonical identifiers:
 *   - field_overrides[source_field_id]
 *   - family_defaults[normalization_family]
 *
 * proposed_canonical_target is NEVER used for rule selection.
 */

// ── Types ──

export type MetricFamily =
  | "revenue_like"
  | "cost_like"
  | "profit_like"
  | "asset_like"
  | "liability_like"
  | "equity_like"
  | "cash_like"
  | "receivable_payable_like"
  | "contra_or_unknown";

export type NormalizationAction = "abs" | "negate" | "keep" | "conditional" | "reject";

export interface ConditionalRule {
  check: "cross_validate_profit_direction" | "contra_cost_check";
  fallback_action: "abs" | "negate" | "keep";
}

export interface NormalizationRule {
  action: NormalizationAction;
  description: string;
  condition?: ConditionalRule;
}

export interface NormalizationProfile {
  profile_id: string;
  description: string;
  sign_convention: "credit" | "business";
  statement_type: "pnl" | "combined" | "trial_balance";
  family_defaults: Record<MetricFamily, NormalizationRule>;
  field_overrides: Record<string, NormalizationRule>;
}

// ── Shared rule constants ──

const ABS: NormalizationRule = { action: "abs", description: "Take absolute value" };
const NEGATE: NormalizationRule = { action: "negate", description: "Negate sign (credit→business)" };
const KEEP: NormalizationRule = { action: "keep", description: "Keep raw document sign" };
const REJECT: NormalizationRule = { action: "reject", description: "Unclassified — reject and fail loud" };

// ── Profile: e-conomic Saldobalance (credit convention, mixed P&L + balance) ──

const economic_saldobalance_credit_v1: NormalizationProfile = {
  profile_id: "economic_saldobalance_credit_v1",
  description: "e-conomic Saldobalance PDF — credit convention, mixed basis",
  sign_convention: "credit",
  statement_type: "trial_balance",
  family_defaults: {
    revenue_like:            ABS,
    cost_like:               ABS,
    profit_like:             NEGATE,
    asset_like:              ABS,
    liability_like:          ABS,
    equity_like:             KEEP,    // YTD equity already normal convention
    cash_like:               KEEP,    // Overdraft possible
    receivable_payable_like: KEEP,    // Direction matters
    contra_or_unknown:       REJECT,
  },
  field_overrides: {},
};

// ── Profile: e-conomic Resultatopgørelse PDF (credit convention, P&L only) ──

const economic_pnl_credit_v1: NormalizationProfile = {
  profile_id: "economic_pnl_credit_v1",
  description: "e-conomic Resultatopgørelse PDF/XLSX — credit convention, P&L only",
  sign_convention: "credit",
  statement_type: "pnl",
  family_defaults: {
    revenue_like:            ABS,
    cost_like:               ABS,
    profit_like:             NEGATE,
    asset_like:              ABS,       // Not expected in P&L, but safe default
    liability_like:          ABS,
    equity_like:             KEEP,
    cash_like:               KEEP,
    receivable_payable_like: KEEP,
    contra_or_unknown:       REJECT,
  },
  field_overrides: {
    direkte_omkostninger: {
      action: "conditional",
      description: "COGS may be negative (contra-cost) — validate against revenue-GP equation",
      condition: { check: "contra_cost_check", fallback_action: "abs" },
    },
  },
};

// ── Profile: Dinero Resultatopgørelse (credit convention, P&L only) ──

const dinero_pnl_credit_v1: NormalizationProfile = {
  profile_id: "dinero_pnl_credit_v1",
  description: "Dinero Resultatopgørelse PDF/CSV — credit convention, P&L only",
  sign_convention: "credit",
  statement_type: "pnl",
  family_defaults: {
    revenue_like:            ABS,
    cost_like:               ABS,
    profit_like:             NEGATE,
    asset_like:              ABS,
    liability_like:          ABS,
    equity_like:             KEEP,
    cash_like:               KEEP,
    receivable_payable_like: KEEP,
    contra_or_unknown:       REJECT,
  },
  field_overrides: {
    resultat_foer_skat: {
      action: "conditional",
      description: "Cross-validate profit direction against computed GP - opex",
      condition: { check: "cross_validate_profit_direction", fallback_action: "negate" },
    },
    arets_resultat: {
      action: "conditional",
      description: "Cross-validate net result direction",
      condition: { check: "cross_validate_profit_direction", fallback_action: "negate" },
    },
  },
};

// ── Profile: Combined DK (credit convention, P&L + Balance) ──

const combined_dk_credit_v1: NormalizationProfile = {
  profile_id: "combined_dk_credit_v1",
  description: "Combined DK Balance/P&L XLSX — credit convention, revenue negative, costs positive",
  sign_convention: "credit",
  statement_type: "combined",
  family_defaults: {
    revenue_like:            NEGATE,   // Credit: revenue is negative → negate to positive
    cost_like:               ABS,      // Costs are positive in credit convention
    profit_like:             NEGATE,   // Profit subtotals are negative when profitable
    asset_like:              KEEP,     // Assets keep raw sign
    liability_like:          ABS,      // Liabilities are negative in credit → abs
    equity_like:             KEEP,     // Equity keeps sign (negative = positive equity in credit)
    cash_like:               KEEP,     // Cash keeps sign (overdraft possible)
    receivable_payable_like: KEEP,     // Direction matters
    contra_or_unknown:       REJECT,
  },
  field_overrides: {},
};

// ── Profile: Combined Balance/PnL XLSX (credit convention) ──

const combined_balance_pnl_credit_v1: NormalizationProfile = {
  profile_id: "combined_balance_pnl_credit_v1",
  description: "Combined Balance/P&L XLSX — credit convention",
  sign_convention: "credit",
  statement_type: "combined",
  family_defaults: {
    revenue_like:            NEGATE,   // Credit convention: revenue is negative
    cost_like:               ABS,
    profit_like:             NEGATE,
    asset_like:              KEEP,
    liability_like:          ABS,
    equity_like:             KEEP,     // Negative equity = negative equity
    cash_like:               KEEP,
    receivable_payable_like: KEEP,
    contra_or_unknown:       REJECT,
  },
  field_overrides: {},
};

// ── Profile: e-conomic Resultatopgørelse (business convention, P&L only) ──

const economic_pnl_business_v1: NormalizationProfile = {
  profile_id: "economic_pnl_business_v1",
  description: "e-conomic Resultatopgørelse — business convention, values already positive-means-positive",
  sign_convention: "business",
  statement_type: "pnl",
  family_defaults: {
    revenue_like:            KEEP,
    cost_like:               KEEP,
    profit_like:             KEEP,
    asset_like:              KEEP,
    liability_like:          KEEP,
    equity_like:             KEEP,
    cash_like:               KEEP,
    receivable_payable_like: KEEP,
    contra_or_unknown:       REJECT,
  },
  field_overrides: {},
};

// ── Profile: Combined DK (business convention, P&L + Balance) ──

const combined_dk_business_v1: NormalizationProfile = {
  profile_id: "combined_dk_business_v1",
  description: "Combined DK Balance/P&L XLSX — business convention, revenue positive, costs negative",
  sign_convention: "business",
  statement_type: "combined",
  family_defaults: {
    revenue_like:            KEEP,     // Business: revenue already positive → keep
    cost_like:               NEGATE,   // Business: costs are negative → negate to positive bucket
    profit_like:             KEEP,     // Business: positive = profit, negative = loss → keep
    asset_like:              KEEP,     // Assets keep raw sign
    liability_like:          NEGATE,   // Business: liabilities are negative → negate to positive
    equity_like:             KEEP,     // Equity keeps sign
    cash_like:               KEEP,     // Cash keeps sign (overdraft possible)
    receivable_payable_like: KEEP,     // Direction matters
    contra_or_unknown:       REJECT,
  },
  field_overrides: {},
};

// ── Registry ──

const NORMALIZATION_PROFILES: Record<string, NormalizationProfile> = {
  economic_saldobalance_credit_v1,
  economic_pnl_credit_v1,
  economic_pnl_business_v1,
  dinero_pnl_credit_v1,
  combined_dk_credit_v1,
  combined_balance_pnl_credit_v1,
  combined_dk_business_v1,
};

export function getNormalizationProfile(profileId: string): NormalizationProfile | null {
  return NORMALIZATION_PROFILES[profileId] || null;
}

export function listNormalizationProfileIds(): string[] {
  return Object.keys(NORMALIZATION_PROFILES);
}
