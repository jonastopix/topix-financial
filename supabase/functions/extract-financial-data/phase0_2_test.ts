/**
 * Phase 0-2 Tests: Comparison utility, fixture shapes, source fingerprinting
 */

import { assertEquals, assert, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  compareExtractions,
  formatComparisonReport,
} from "../_shared/extractionCompare.ts";
import {
  getNormalizationProfile,
  listNormalizationProfileIds,
} from "../_shared/normalizationProfiles.ts";
import {
  detectSourceSystem,
  isAiAllowed,
} from "../_shared/sourceFingerprint.ts";
import {
  assertNormalizationFixtureShape,
} from "../_test_fixtures/fixtureHelpers.ts";
import {
  fixture_economic_saldobalance_equity,
  fixture_economic_saldobalance_cash,
  fixture_economic_saldobalance_revenue,
  fixture_economic_saldobalance_liability,
  fixture_economic_pnl_cogs_contra,
  fixture_reject_unclassified,
  fixture_kj_auto_passthrough,
  fixture_same_raw_different_profiles,
} from "../_test_fixtures/normalizationProfileFixtures.ts";
import {
  fixture_economic_pdf_fingerprint,
  fixture_economic_xlsx_fingerprint,
  fixture_dinero_csv_fingerprint,
  fixture_dinero_pdf_fingerprint,
  fixture_unknown_pdf_fingerprint,
  fixture_kj_auto_xlsx_fingerprint,
} from "../_test_fixtures/sourceFingerprintFixtures.ts";
import type { CanonicalOutput } from "../_shared/canonicalTypes.ts";

// ══════════════════════════════════════════════════════════════
// PHASE 0: Comparison utility
// ══════════════════════════════════════════════════════════════

Deno.test("Comparison: identical outputs produce zero regressions", () => {
  const output: CanonicalOutput = {
    template_id: "TEST",
    statement_type: "pnl",
    company_name: "Test ApS",
    cvr: null,
    period_start: "01-01-2026",
    period_end: "31-01-2026",
    report_period_label: "Januar 2026",
    extraction_method: "deterministic_template",
    raw_lines: [],
    normalized_lines: [],
    selected_period_basis: "period",
    metrics: {
      revenue: 1000000, cogs: 400000, gross_profit: 600000, gross_margin_pct: 60,
      payroll: 200000, payroll_related: null, other_staff_costs: null,
      sales_costs: null, facility_costs: null, admin_costs: 50000, vehicle_costs: null,
      ebitda: 350000, depreciation: 30000, ebit: 320000, financial_costs: null,
      extraordinary_items: null, ebt: 320000, net_result: 250000,
      assets_total: null, inventory: null, receivables_total: null,
      trade_receivables: null, unbilled_wip: null, cash: null,
      equity_total: null, equity_ratio_pct: null, related_party_net: null,
      provisions_total: null, current_liabilities: null, debt_total: null,
      vat_payable: null, liabilities_total: null,
    },
    correction_log: [],
    provenance: { revenue: { source_type: "deterministic_template", label_match: "omsaetning", report_type: "pnl", confidence: "HIGH", line_item_reference: null } },
    validation: { status: "PASS", ai_checks: [], server_checks: [], canonical_checks: [] },
    ai_eligible: true,
    ai_eligible_payload: null,
  };

  const result = compareExtractions(output, output, "test.pdf");

  assertEquals(result.summary.regressions.length, 0);
  assertEquals(result.summary.major_diffs, 0);
  assert(result.summary.exact_matches > 0);

  // Format should not throw
  const report = formatComparisonReport(result);
  assert(report.includes("PASS"));
});

Deno.test("Comparison: detects metric regression (missing_new)", () => {
  const oldOutput: any = {
    metrics: { revenue: 500000, ebt: 100000 },
    validation: { status: "PASS", canonical_checks: [] },
    provenance: {},
  };
  const newOutput: any = {
    metrics: { revenue: 500000, ebt: null }, // ebt lost
    validation: { status: "PASS", canonical_checks: [] },
    provenance: {},
  };

  const result = compareExtractions(oldOutput, newOutput, "test.pdf");
  assert(result.summary.regressions.length > 0);
  assert(result.summary.regressions.some(r => r.includes("ebt")));
});

Deno.test("Comparison: detects validation regression", () => {
  const oldOutput: any = {
    metrics: { revenue: 500000 },
    validation: { status: "PASS", canonical_checks: [] },
    provenance: {},
  };
  const newOutput: any = {
    metrics: { revenue: 500000 },
    validation: { status: "FAIL", canonical_checks: [{ name: "balance_equation", result: "FAIL", details: "mismatch" }] },
    provenance: {},
  };

  const result = compareExtractions(oldOutput, newOutput, "test.pdf");
  assert(result.summary.regressions.some(r => r.includes("Validation regressed")));
});

// ══════════════════════════════════════════════════════════════
// PHASE 1: Normalization profile registry + fixture shapes
// ══════════════════════════════════════════════════════════════

Deno.test("Profile registry: all profiles loadable", () => {
  const ids = listNormalizationProfileIds();
  assert(ids.length >= 5, `Expected at least 5 profiles, got ${ids.length}`);

  for (const id of ids) {
    const profile = getNormalizationProfile(id);
    assertExists(profile, `Profile ${id} not found`);
    assert(profile!.family_defaults.contra_or_unknown.action === "reject",
      `Profile ${id} must have contra_or_unknown → reject`);
  }
});

Deno.test("Profile registry: economic_saldobalance equity = keep", () => {
  const profile = getNormalizationProfile("economic_saldobalance_credit_v1")!;
  assertEquals(profile.family_defaults.equity_like.action, "keep");
  assertEquals(profile.family_defaults.cash_like.action, "keep");
  assertEquals(profile.family_defaults.revenue_like.action, "abs");
  assertEquals(profile.family_defaults.liability_like.action, "abs");
});

Deno.test("Profile registry: economic_pnl has COGS field_override", () => {
  const profile = getNormalizationProfile("economic_pnl_credit_v1")!;
  const cogsOverride = profile.field_overrides["direkte_omkostninger"];
  assertExists(cogsOverride, "COGS override must exist");
  assertEquals(cogsOverride.action, "conditional");
  assertEquals(cogsOverride.condition?.check, "contra_cost_check");
});

Deno.test("Profile registry: kj_auto business convention — all keep", () => {
  const profile = getNormalizationProfile("kj_auto_business_v1")!;
  assertEquals(profile.sign_convention, "business");
  for (const [family, rule] of Object.entries(profile.family_defaults)) {
    if (family === "contra_or_unknown") {
      assertEquals(rule.action, "reject");
    } else {
      assertEquals(rule.action, "keep", `${family} should be keep for business convention`);
    }
  }
});

Deno.test("Fixture shapes: all normalization fixtures are valid", () => {
  const fixtures = [
    fixture_economic_saldobalance_equity,
    fixture_economic_saldobalance_cash,
    fixture_economic_saldobalance_revenue,
    fixture_economic_saldobalance_liability,
    fixture_economic_pnl_cogs_contra,
    fixture_reject_unclassified,
    fixture_kj_auto_passthrough,
    fixture_same_raw_different_profiles,
  ];

  for (const f of fixtures) {
    assertNormalizationFixtureShape(f);
  }
});

// ══════════════════════════════════════════════════════════════
// PHASE 2: Source-system fingerprinting
// ══════════════════════════════════════════════════════════════

Deno.test("Fingerprint: e-conomic PDF detected", () => {
  const f = fixture_economic_pdf_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, f.raw_text);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), f.expected_allows_ai);
});

Deno.test("Fingerprint: e-conomic XLSX detected", () => {
  const f = fixture_economic_xlsx_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, undefined, f.header_rows);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), f.expected_allows_ai);
});

Deno.test("Fingerprint: Dinero CSV detected", () => {
  const f = fixture_dinero_csv_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, f.raw_text);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), f.expected_allows_ai);
});

Deno.test("Fingerprint: Dinero PDF detected", () => {
  const f = fixture_dinero_pdf_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, f.raw_text);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), f.expected_allows_ai);
});

Deno.test("Fingerprint: unknown PDF allows AI", () => {
  const f = fixture_unknown_pdf_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, f.raw_text);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), true);
});

Deno.test("Fingerprint: KJ Auto XLSX detected", () => {
  const f = fixture_kj_auto_xlsx_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, undefined, f.header_rows);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), f.expected_allows_ai);
});

Deno.test("Fingerprint: known source blocks AI", () => {
  const economic = detectSourceSystem("report.pdf", "pdf", "secure.e-conomic.com Saldobalance");
  assertEquals(isAiAllowed(economic), false);

  const unknown = detectSourceSystem("report.pdf", "pdf", "Some random text");
  assertEquals(isAiAllowed(unknown), true);
});
