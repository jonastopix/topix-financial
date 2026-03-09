/**
 * Canonical Engine Acceptance Tests — Phase 3 Hardening
 * 8 test cases as specified
 */

import {
  normalizeToCanonical,
  inferPeriodBasis,
  detectStatementType,
  runExtendedValidation,
  computeAiEligible,
  buildCanonicalOutput,
  buildRawLines,
  buildNormalizedLines,
} from "../_shared/canonicalEngine.ts";
import type { CanonicalOutput, ValidationStatus } from "../_shared/canonicalTypes.ts";
import { assertEquals, assert, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ══════════════════════════════════════════════════════════════════
// CASE 1: Revenue normaliseres positivt
// ══════════════════════════════════════════════════════════════════
Deno.test("CASE 1: Revenue normaliseres positivt", () => {
  const extractedData = {
    report_type: "resultatopgørelse",
    report_period: "Oktober 2025",
    key_figures: {
      omsaetning: -1482730.84,
      direkte_omkostninger: 500000,
      daekningsbidrag: 982730.84,
      resultat_foer_skat: 200000,
    },
    line_items: [],
  };

  const { metrics, correction_log } = normalizeToCanonical(extractedData);

  // Revenue should be positive
  assertEquals(metrics.revenue, 1482730.84);
  assert(metrics.revenue! > 0, "Revenue should be positive");

  // Correction should be logged
  assert(correction_log.length > 0, "Should have correction log entries");
  const revCorrection = correction_log.find(c => c.field === "omsaetning");
  assertExists(revCorrection, "Should have omsaetning correction");
  assertEquals(revCorrection?.rule, "revenue_must_be_positive");
  assertEquals(revCorrection?.raw_value, -1482730.84);
  assertEquals(revCorrection?.normalized_value, 1482730.84);
});

// ══════════════════════════════════════════════════════════════════
// CASE 2: Saldobalance equity sign-inversion
// ══════════════════════════════════════════════════════════════════
Deno.test("CASE 2: Saldobalance equity sign-inversion (resultat)", () => {
  const extractedData = {
    report_type: "saldobalance",
    report_period: "Oktober 2025",
    key_figures: {
      omsaetning: 1000000,
      resultat_foer_skat: -200000, // In saldobalance: negative = profit
      egenkapital: 500000,        // Equity stays as-is (not flipped for positive values)
      aktiver_i_alt: 1000000,
      passiver_i_alt: 1000000,
    },
    line_items: [],
  };

  const { metrics, correction_log } = normalizeToCanonical(extractedData);

  // In saldobalance, result sign is inverted: -200000 → +200000 (profit)
  assertEquals(metrics.ebt, 200000);

  // Should have correction logged
  const resultCorrection = correction_log.find(c => c.field === "resultat_foer_skat");
  assertExists(resultCorrection, "Should have resultat correction");
  assertEquals(resultCorrection?.rule, "saldobalance_result_sign_inverted");
});

// ══════════════════════════════════════════════════════════════════
// CASE 3: Bank overtræk bevarer negativ
// ══════════════════════════════════════════════════════════════════
Deno.test("CASE 3: Bank overtræk bevarer negativ", () => {
  const extractedData = {
    report_type: "saldobalance",
    report_period: "Oktober 2025",
    key_figures: {
      omsaetning: 1000000,
      resultat_foer_skat: 100000,
      bank_balance: -50000, // Overdraft — should stay negative
      aktiver_i_alt: 500000,
      passiver_i_alt: 500000,
    },
    line_items: [],
  };

  const { metrics, correction_log } = normalizeToCanonical(extractedData);

  // Cash/bank should stay negative (overdraft)
  assertEquals(metrics.cash, -50000);

  // NO correction should exist for cash
  const cashCorrection = correction_log.find(c => c.field === "bank_balance");
  assertEquals(cashCorrection, undefined, "Should NOT have cash correction");
});

// ══════════════════════════════════════════════════════════════════
// CASE 4: Mixed period/YTD giver FAIL eller UNSURE
// ══════════════════════════════════════════════════════════════════
Deno.test("CASE 4: Mixed period/YTD giver FAIL eller UNSURE", () => {
  const extractedData = {
    report_type: "resultatopgørelse",
    report_period: "Oktober 2025",
    key_figures: {
      omsaetning: 200000,       // Period value
      omsaetning_aar: 100000,   // YTD < period — IMPOSSIBLE
      resultat_foer_skat: 50000,
    },
    line_items: [],
  };

  const periodBasis = inferPeriodBasis(extractedData.key_figures);
  assertEquals(periodBasis, "unknown", "Period basis should be unknown");

  const canonical = buildCanonicalOutput(extractedData, {}, "ai");

  // Should be FAIL or UNSURE due to mixed columns
  assert(
    canonical.validation.status === "FAIL" || canonical.validation.status === "UNSURE",
    `Status should be FAIL or UNSURE, got ${canonical.validation.status}`
  );
  assertEquals(canonical.selected_period_basis, "unknown");

  // Should NOT be ai_eligible
  assertEquals(canonical.ai_eligible, false);
});

// ══════════════════════════════════════════════════════════════════
// CASE 5: Manglende subtotaler giver ikke PASS
// ══════════════════════════════════════════════════════════════════
Deno.test("CASE 5: Manglende subtotaler giver ikke PASS", () => {
  const extractedData = {
    report_type: "resultatopgørelse",
    report_period: "Oktober 2025",
    key_figures: {
      // Missing revenue!
      direkte_omkostninger: 100000,
      resultat_foer_skat: -50000,
    },
    line_items: [],
  };

  const canonical = buildCanonicalOutput(extractedData, {}, "ai");

  // Should be FAIL due to missing core fields
  assertEquals(canonical.validation.status, "FAIL");
  assertEquals(canonical.ai_eligible, false);

  // Check that missing_core_totals or required_fields_present failed
  const missingCheck = canonical.validation.canonical_checks.find(
    c => c.name === "required_fields_present" || c.name === "missing_core_totals"
  );
  assertExists(missingCheck);
  assertEquals(missingCheck?.result, "FAIL");
});

// ══════════════════════════════════════════════════════════════════
// CASE 6: Ren P&L rapport → PASS + ai_eligible = true
// ══════════════════════════════════════════════════════════════════
Deno.test("CASE 6: Ren P&L rapport → PASS + ai_eligible = true", () => {
  const extractedData = {
    report_type: "resultatopgørelse",
    report_period: "Oktober 2025",
    company_name: "TestCo ApS",
    cvr_number: "12345678",
    key_figures: {
      omsaetning: 1000000,
      direkte_omkostninger: 400000,
      daekningsbidrag: 600000,
      loenninger: 200000,
      lokaler: 50000,
      admin: 50000,
      afskrivninger: 20000,
      resultat_foer_skat: 280000,
      resultat_efter_skat: 220000,
    },
    line_items: [
      { name: "Omsætning", period_amount: 1000000, ytd_amount: 10000000, raw_sign: "MINUS", class: "REVENUE" },
      { name: "Vareforbrug", period_amount: 400000, ytd_amount: 4000000, raw_sign: "PLUS", class: "COGS" },
    ],
    validation: {
      status: "PASS",
      checks: [{ name: "ai_check", result: "PASS", details: "OK" }],
    },
  };

  const canonical = buildCanonicalOutput(extractedData, extractedData, "ai");

  // Should PASS
  assertEquals(canonical.validation.status, "PASS");
  assertEquals(canonical.ai_eligible, true);
  assertExists(canonical.ai_eligible_payload);

  // Canonical metrics should be populated
  assertEquals(canonical.metrics.revenue, 1000000);
  assertEquals(canonical.metrics.cogs, 400000);
  assertEquals(canonical.metrics.gross_profit, 600000);
  assertEquals(canonical.metrics.ebt, 280000);

  // Period basis should be detected
  assertEquals(canonical.selected_period_basis, "period");

  // Statement type should be detected
  assertEquals(canonical.statement_type, "pnl");

  // ai_eligible_payload should be minimal and clean
  const payload = canonical.ai_eligible_payload!;
  assertEquals(payload.input_type, "canonical");
  assertEquals(payload.validation_status, "PASS");
  assertExists(payload.metrics);
  // Should NOT contain raw_lines, normalized_lines, correction_log, provenance
  assertEquals((payload as any).raw_lines, undefined);
  assertEquals((payload as any).normalized_lines, undefined);
  assertEquals((payload as any).correction_log, undefined);
  assertEquals((payload as any).provenance, undefined);
});

// ══════════════════════════════════════════════════════════════════
// CASE 7: UNSURE rapport → ai_eligible = false (suspicious sign pattern)
// ══════════════════════════════════════════════════════════════════
Deno.test("CASE 7: UNSURE rapport (suspicious sign pattern) → ai_eligible = false", () => {
  const extractedData = {
    report_type: "resultatopgørelse",
    report_period: "Oktober 2025",
    key_figures: {
      // Most metrics negative — suspicious sign pattern
      omsaetning: -500000,
      direkte_omkostninger: -200000,
      daekningsbidrag: -300000,
      loenninger: -100000,
      resultat_foer_skat: -50000,
    },
    line_items: [],
    validation: {
      status: "UNSURE",
      checks: [],
    },
  };

  const canonical = buildCanonicalOutput(extractedData, extractedData, "ai");

  // Even after normalization, suspicious pattern should trigger FAIL (>50% still negative)
  // or validation inherits UNSURE from AI
  assert(
    canonical.validation.status === "FAIL" || canonical.validation.status === "UNSURE",
    `Expected FAIL or UNSURE, got ${canonical.validation.status}`
  );
  assertEquals(canonical.ai_eligible, false);

  // Check that suspicious_sign_pattern check exists
  const signCheck = canonical.validation.canonical_checks.find(c => c.name === "suspicious_sign_pattern");
  assertExists(signCheck);
});

// ══════════════════════════════════════════════════════════════════
// CASE 8: Golden snapshot af fuldt canonical output
// ══════════════════════════════════════════════════════════════════
Deno.test("CASE 8: Golden snapshot of full canonical output", () => {
  const extractedData = {
    report_type: "resultatopgørelse",
    report_period: "November 2025",
    company_name: "Golden Test ApS",
    cvr_number: "87654321",
    key_figures: {
      omsaetning: 2000000,
      omsaetning_aar: 20000000,
      direkte_omkostninger: 800000,
      daekningsbidrag: 1200000,
      loenninger: 400000,
      marketing: 100000,
      lokaler: 80000,
      admin: 60000,
      afskrivninger: 40000,
      resultat_foer_skat: 520000,
      resultat_efter_skat: 400000,
    },
    line_items: [
      { name: "Omsætning ialt", period_amount: 2000000, ytd_amount: 20000000, raw_sign: "MINUS", class: "REVENUE" },
      { name: "Vareforbrug", period_amount: 800000, ytd_amount: 8000000, raw_sign: "PLUS", class: "COGS" },
      { name: "Lønninger", period_amount: 400000, ytd_amount: 4000000, raw_sign: "PLUS", class: "OPEX" },
    ],
    validation: {
      status: "PASS",
      checks: [
        { name: "ai_gross_check", result: "PASS", details: "AI verified" },
      ],
    },
  };

  const canonical = buildCanonicalOutput(extractedData, extractedData, "ai");

  // ── TOP-LEVEL FIELDS ──
  assertEquals(canonical.template_id, null);
  assertEquals(canonical.statement_type, "pnl");
  assertEquals(canonical.company_name, "Golden Test ApS");
  assertEquals(canonical.cvr, "87654321");
  assertEquals(canonical.report_period_label, "November 2025");
  assertEquals(canonical.extraction_method, "ai");
  assertEquals(canonical.selected_period_basis, "period");

  // ── METRICS ASSERTIONS ──
  assertEquals(canonical.metrics.revenue, 2000000);
  assertEquals(canonical.metrics.cogs, 800000);
  assertEquals(canonical.metrics.gross_profit, 1200000);
  assertEquals(canonical.metrics.payroll, 400000);
  assertEquals(canonical.metrics.sales_costs, 100000);
  assertEquals(canonical.metrics.facility_costs, 80000);
  assertEquals(canonical.metrics.depreciation, 40000);
  assertEquals(canonical.metrics.ebt, 520000);
  assertEquals(canonical.metrics.net_result, 400000);
  // Derived
  assert(canonical.metrics.gross_margin_pct !== null);
  assert(Math.abs(canonical.metrics.gross_margin_pct! - 60) < 0.1, "Gross margin should be ~60%");

  // ── CORRECTION LOG ──
  assert(Array.isArray(canonical.correction_log));
  // No corrections expected for this clean data
  assertEquals(canonical.correction_log.length, 0);

  // ── RAW_LINES / NORMALIZED_LINES ──
  assert(Array.isArray(canonical.raw_lines));
  assertEquals(canonical.raw_lines.length, 3);
  assert(Array.isArray(canonical.normalized_lines));
  assertEquals(canonical.normalized_lines.length, 3);

  // ── PROVENANCE ──
  assert(typeof canonical.provenance === "object");
  assertExists(canonical.provenance.revenue);
  assertEquals(canonical.provenance.revenue.source_type, "ai_extraction");

  // ── VALIDATION ──
  assertEquals(canonical.validation.status, "PASS");
  assert(Array.isArray(canonical.validation.canonical_checks));
  assertEquals(canonical.validation.canonical_checks.length, 12); // All 12 checks
  assert(Array.isArray(canonical.validation.ai_checks));
  assertEquals(canonical.validation.ai_checks.length, 1);

  // ── AI_ELIGIBLE ──
  assertEquals(canonical.ai_eligible, true);
  assertExists(canonical.ai_eligible_payload);
  assertEquals(canonical.ai_eligible_payload?.input_type, "canonical");
  assertEquals(canonical.ai_eligible_payload?.validation_status, "PASS");
  assertExists(canonical.ai_eligible_payload?.metrics);
  assertEquals(canonical.ai_eligible_payload?.metrics.revenue, 2000000);
});
