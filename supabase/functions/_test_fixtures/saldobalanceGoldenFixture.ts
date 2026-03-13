/**
 * Golden Fixture: e-conomic Saldobalance PDF (DK_ECONOMIC_SALDOBALANCE_PDF_V1)
 *
 * Source: "Balance februar 2026.pdf" — Topix.dk ApS, CVR 45281736
 * Period: 01.02.26 - 28.02.26 (YTD: 01.01.26 - 28.02.26)
 *
 * These are the EXACT expected canonical output values after:
 * - 4-column parser fix (3-number lines: period, period_prev, ytd)
 * - Credit convention sign normalization (equity/provisions negated, debt abs'd)
 *
 * DO NOT MODIFY these values without explicit approval.
 */

export const SALDOBALANCE_GOLDEN = {
  template_id: "DK_ECONOMIC_SALDOBALANCE_PDF_V1",
  company_name: "Topix.dk ApS",
  cvr: "45281736",

  /** Expected canonical metrics (after sign normalization) */
  expected_metrics: {
    // P&L (from Perioden column, flipPnlSign on raw negative credit values)
    period_result: 4200.24,       // resultat_foer_skat: flipPnlSign(-4200.24) = +4200.24

    // Balance (from År til dato column)
    assets_total: 859725.36,       // absVal(859725.36) — positive raw, keeps positive
    equity_total: -332549.93,      // flipPnlSign(332549.93) — positive raw NEGATED (credit convention)
    provisions_total: -105560.00,  // flipPnlSign(105560.00) — positive raw NEGATED (credit convention)
    debt_total: 1297835.29,        // absVal(-1297835.29) — negative raw, abs'd to positive
    cash: 72357.32,                // raw sign kept (bank balance)
    liabilities_total: 859725.36,  // absVal(-859725.36) — negative raw, abs'd to positive
  },

  /** AI eligibility: BLOCKED until this fixture is proven in real flow */
  expected_ai_eligible: false,

  /**
   * Raw PDF values (before sign normalization) for traceability.
   * These are the YTD "Indeværende år" column values from the PDF.
   */
  raw_ytd_values: {
    aktiver_i_alt: 859725.36,     // 3-number line: nums[2]
    egenkapital_i_alt: 332549.93, // 4-number line: nums[2]
    hensaettelser_i_alt: 105560.00, // 4-number line: nums[2]
    gaeld_i_alt: -1297835.29,     // 4-number line: nums[2]
    passiver_i_alt: -859725.36,   // 4-number line: nums[2]
  },

  /** P&L raw period values for traceability */
  raw_period_values: {
    resultat_foer_skat: -4200.24, // Period column, credit convention (negative = profit)
  },
} as const;
