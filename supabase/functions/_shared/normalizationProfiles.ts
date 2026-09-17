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
/** Afledt i skabelonen (−Σ resultatkonti, revenue − cogs) — allerede i forretningskonvention; et underskud er negativt og SKAL blive det. */
const KEEP_DERIVED: NormalizationRule = { action: "keep", description: "Derived in template — already business convention, sign is the result" };

// ── Profile: e-conomic Saldobalance (credit convention, mixed P&L + balance) ──

// FORTEGNSFEJLEN (rettet 17/9-2026, recon-saldobalance-fortegn.md §1): de fire
// feltregler for de AFLEDTE resultatlinjer stod som `abs` («already in business
// convention»). abs kaster fortegnet væk: et overskud stod uændret, et underskud
// blev positivt. Målt i prod 17/9: Fjeldgaardshop 2025-10 ebt −241.813,30 →
// +241.813,30 (correction_log «field_override_abs»); 12 abs-poster hos
// Fjeldgaardshop, 12 hos Brick Works. Reglen kom ind 26/3-2026 (79d65be5). Et tal
// der allerede har sit fortegn skal `keep`. Skabelonen (dkEconomicSaldobalanceXlsxV1)
// udsteder nu resultatet som −Σ alle resultatkonti, omkostningsgrupperne som deres
// positive del og «andre driftsindtægter» som en kredit-kandidat (revenue_like →
// NEGATE, som signRule på intervallet altid har sagt; ABS ville skjule en måned hvor
// omsætningsgruppen netto er debet — nu bliver den negativ og fældes af anker-tjekket).
// Kildeværn: src/lib/__tests__/saldobalanceFortegn.guard.test.ts.
const economic_saldobalance_credit_v1: NormalizationProfile = {
  profile_id: "economic_saldobalance_credit_v1",
  description: "e-conomic Saldobalance XLSX (detailed, no subtotals) — credit convention, mixed basis",
  sign_convention: "credit",
  statement_type: "trial_balance",
  family_defaults: {
    revenue_like:            NEGATE,  // kredit (negativ) → positiv; en debet-gruppe bliver negativ og fældes (17/9-2026, var ABS)
    cost_like:               ABS,     // grupperne er allerede den positive del (skabelonen) — ABS er identitet
    profit_like:             NEGATE,
    asset_like:              ABS,
    liability_like:          ABS,
    equity_like:             KEEP,    // YTD equity already normal convention
    cash_like:               KEEP,    // Overdraft possible
    receivable_payable_like: KEEP,    // Direction matters
    contra_or_unknown:       REJECT,
  },
  field_overrides: {
    daekningsbidrag:     KEEP_DERIVED, // derived gross_profit (revenue − cogs) — var abs
    resultat_foer_skat:  KEEP_DERIVED, // derived EBT (−Σ resultatkonti) — var abs
    ebitda:              KEEP_DERIVED, // var abs (skabelonen udsteder den ikke; motoren afleder)
    resultat_efter_skat: KEEP_DERIVED, // var abs (skabelonen udsteder den ikke)
  },
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
    asset_like:              ABS,      // Credit: raw sign varies across files → abs to positive
    liability_like:          ABS,      // Liabilities are negative in credit → abs
    equity_like:             NEGATE,   // Credit: positive equity is negative → negate to positive canonical
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
    asset_like:              ABS,      // Credit: raw sign varies across files → abs to positive
    liability_like:          ABS,
    equity_like:             NEGATE,   // Credit: positive equity is negative → negate to positive canonical
    cash_like:               KEEP,
    receivable_payable_like: KEEP,
    contra_or_unknown:       REJECT,
  },
  field_overrides: {},
};

// ── Profile: e-conomic Resultatopgørelse (business convention, P&L only) ──

// BUSINESS-KONVENTIONEN (rettet 10/9-2026): detectSignConvention i XLSX-skabelonen
// definerer «business» som omsætning > 0 og enkeltkontolinjer for omkostninger
// < 0 — omkostningerne står altså NEGATIVT i kilden (Topix dec 2025, målt:
// «Lønninger i alt» −86.673,29). Profilen sagde det modsatte («values already
// positive») og beholdt rå fortegn (KEEP), så canonical fik payroll −86.673,
// ebitda kunne ikke afledes (opexSum > 0-gaten) og fortegnsdommen fældede
// «4/5 cost fields negative» — og for ANLA GLAS «1/1». Legacy-vejen abs'er de
// samme subtotaler (signRule "abs"). Nu gør profilen det samme: cost_like ABS,
// som hver anden profil. Nogle business-filer viser subtotaler som absolutte
// tal i forvejen (skabelonens kommentar) — ABS er rigtig for begge.
const economic_pnl_business_v1: NormalizationProfile = {
  profile_id: "economic_pnl_business_v1",
  description: "e-conomic Resultatopgørelse — business convention: revenue positive, costs negative in the source (made positive here)",
  sign_convention: "business",
  statement_type: "pnl",
  family_defaults: {
    revenue_like:            KEEP,
    cost_like:               ABS,      // Business: costs are negative in the source → positive bucket
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
