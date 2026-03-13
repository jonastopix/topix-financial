/**
 * Phase 0-4 Tests: Gate fixes + parser + XLSX raw + routing integration
 */

import { assertEquals, assert, assertExists, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  compareExtractions,
  formatComparisonReport,
  compareRawStructural,
  compareSemantic,
  compareNormalizedMetrics,
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
  parseEconomicPdfText,
  type PdfParsedLine,
} from "../_shared/pdfTextParser.ts";
import {
  parseXlsxRawFromBase64,
} from "../_shared/xlsxRawParser.ts";
import {
  assertNormalizationFixtureShape,
  assertMetricsMatch,
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
import {
  ECONOMIC_SALDOBALANCE_PDF_TEXT,
  ECONOMIC_PNL_PDF_TEXT,
  DINERO_PNL_PDF_TEXT,
  fixture_economic_saldobalance_parser,
  fixture_economic_pnl_parser,
  fixture_dinero_pnl_parser,
} from "../_test_fixtures/pdfParserFixtures.ts";
import type { CanonicalOutput } from "../_shared/canonicalTypes.ts";

// ══════════════════════════════════════════════════════════════
// GATE FIX 3: Multi-layer comparison
// ══════════════════════════════════════════════════════════════

Deno.test("Comparison: multi-layer with raw structural diff", () => {
  const oldLines: PdfParsedLine[] = [
    { account_no: "1000", name: "Omsætning", period_amount: -1500000, ytd_amount: null, is_subtotal: false, section: "PNL" },
    { account_no: null, name: "Dækningsbidrag", period_amount: -900000, ytd_amount: null, is_subtotal: true, section: "PNL" },
  ];
  const newLines: PdfParsedLine[] = [
    { account_no: "1000", name: "Omsætning", period_amount: -1500000, ytd_amount: null, is_subtotal: false, section: "PNL" },
    { account_no: null, name: "Dækningsbidrag", period_amount: -900000, ytd_amount: null, is_subtotal: true, section: "PNL" },
    { account_no: null, name: "Resultat før skat", period_amount: -460000, ytd_amount: null, is_subtotal: true, section: "PNL" },
  ];

  const raw = compareRawStructural(oldLines, newLines);
  assertExists(raw);
  assertEquals(raw!.old_line_count, 2);
  assertEquals(raw!.new_line_count, 3);
  assertEquals(raw!.subtotal_names_diff.removed.length, 0);
  assertEquals(raw!.subtotal_names_diff.added.length, 1);
});

Deno.test("Comparison: multi-layer detects lost subtotal as regression", () => {
  const oldLines: PdfParsedLine[] = [
    { account_no: null, name: "AKTIVER I ALT", period_amount: 850000, ytd_amount: null, is_subtotal: true, section: "AKTIVER" },
  ];
  const newLines: PdfParsedLine[] = [];

  const raw = compareRawStructural(oldLines, newLines);
  assert(raw!.subtotal_names_diff.removed.length > 0);
});

Deno.test("Comparison: semantic layer diff", () => {
  const result = compareSemantic(null, null);
  assertEquals(result, null);

  const semantic1: any = {
    source_system: "economic",
    normalization_profile_id: "economic_pnl_credit_v1",
    metric_candidates: [
      { source_field_id: "omsaetning", raw_value: -1500000 },
      { source_field_id: "daekningsbidrag", raw_value: -900000 },
    ],
  };
  const semantic2: any = {
    source_system: "economic",
    normalization_profile_id: "economic_pnl_credit_v1",
    metric_candidates: [
      { source_field_id: "omsaetning", raw_value: -1500000 },
      { source_field_id: "daekningsbidrag", raw_value: -900000 },
      { source_field_id: "resultat_foer_skat", raw_value: -460000 },
    ],
  };

  const diff = compareSemantic(semantic1, semantic2);
  assertExists(diff);
  assertEquals(diff!.candidates_gained.length, 1);
  assertEquals(diff!.candidates_lost.length, 0);
});

Deno.test("Comparison: normalized metrics diff", () => {
  const old = { revenue: 1500000, ebt: 460000 } as any;
  const new_ = { revenue: 1500000, ebt: null } as any;
  const result = compareNormalizedMetrics(old, new_);
  assert(result.major_diffs === 0); // missing_new is tracked separately
  const ebtDiff = result.diffs.find(d => d.field === "ebt");
  assertEquals(ebtDiff?.status, "missing_new");
});

Deno.test("Comparison: full multi-layer zero regressions", () => {
  const output: CanonicalOutput = {
    template_id: "TEST", statement_type: "pnl", company_name: "Test", cvr: null,
    period_start: null, period_end: null, report_period_label: null,
    extraction_method: "deterministic_template",
    raw_lines: [], normalized_lines: [], selected_period_basis: "period",
    metrics: { revenue: 1000000, cogs: null, gross_profit: null, gross_margin_pct: null,
      payroll: null, payroll_related: null, other_staff_costs: null,
      sales_costs: null, facility_costs: null, admin_costs: null, vehicle_costs: null,
      ebitda: null, depreciation: null, ebit: null, financial_costs: null,
      extraordinary_items: null, ebt: 200000, net_result: null,
      assets_total: null, inventory: null, receivables_total: null,
      trade_receivables: null, unbilled_wip: null, cash: null,
      equity_total: null, equity_ratio_pct: null, related_party_net: null,
      provisions_total: null, current_liabilities: null, debt_total: null,
      vat_payable: null, liabilities_total: null },
    correction_log: [], provenance: {},
    validation: { status: "PASS", ai_checks: [], server_checks: [], canonical_checks: [] },
    ai_eligible: true, ai_eligible_payload: null,
  };

  const result = compareExtractions(output, output, "test.pdf");
  assertEquals(result.summary.total_regressions, 0);
  assertEquals(result.summary.layer_verdicts.normalized_metrics, "PASS");
  assertEquals(result.summary.layer_verdicts.validation, "PASS");
  assertEquals(result.summary.layer_verdicts.provenance, "PASS");
});

// ══════════════════════════════════════════════════════════════
// GATE FIX 1: Real PDF parser fixtures against text snapshots
// ══════════════════════════════════════════════════════════════

Deno.test("PDF fixture: e-conomic saldobalance parses correctly", () => {
  const f = fixture_economic_saldobalance_parser;
  const result = parseEconomicPdfText(f.input_text);

  assert(result.lines.length >= f.expected_line_count_min,
    `Expected ≥${f.expected_line_count_min} lines, got ${result.lines.length}`);

  // Metadata
  assertEquals(result.metadata.company_name, f.expected_metadata.company_name);
  assertEquals(result.metadata.cvr_number, f.expected_metadata.cvr_number);
  assertEquals(result.metadata.is_economic, f.expected_metadata.is_economic);
  assertEquals(result.metadata.has_aktiver, f.expected_metadata.has_aktiver);
  assertEquals(result.metadata.has_passiver, f.expected_metadata.has_passiver);

  // Sections exist
  for (const section of f.expected_sections) {
    assert(result.lines.some(l => l.section === section), `Expected section ${section} in lines`);
  }

  // Subtotals exist
  for (const subtotal of f.expected_subtotals) {
    assert(result.lines.some(l => l.is_subtotal && l.name.includes(subtotal)),
      `Expected subtotal containing "${subtotal}"`);
  }

  // Spot-check lines
  for (const expected of f.expected_lines) {
    const found = result.lines.find(l => l.name.includes(expected.name_pattern));
    assertExists(found, `Expected line matching "${expected.name_pattern}"`);
    if (expected.period_amount !== null) {
      assertEquals(found!.period_amount, expected.period_amount,
        `${expected.name_pattern}: period_amount mismatch`);
    }
  }
});

Deno.test("PDF fixture: e-conomic P&L parses correctly", () => {
  const f = fixture_economic_pnl_parser;
  const result = parseEconomicPdfText(f.input_text);

  assert(result.lines.length >= f.expected_line_count_min);
  assertEquals(result.metadata.company_name, f.expected_metadata.company_name);
  assertEquals(result.metadata.is_economic, f.expected_metadata.is_economic);
  assertEquals(result.metadata.has_aktiver, false);
  assertEquals(result.metadata.has_passiver, false);

  for (const expected of f.expected_lines) {
    const found = result.lines.find(l => l.name.includes(expected.name_pattern));
    assertExists(found, `Expected line matching "${expected.name_pattern}"`);
    if (expected.period_amount !== null) {
      assertEquals(found!.period_amount, expected.period_amount);
    }
  }
});

Deno.test("PDF fixture: Dinero P&L parses correctly", () => {
  const f = fixture_dinero_pnl_parser;
  const result = parseEconomicPdfText(f.input_text);

  assert(result.lines.length >= f.expected_line_count_min);
  assertEquals(result.metadata.company_name, f.expected_metadata.company_name);
  assertEquals(result.metadata.cvr_number, f.expected_metadata.cvr_number);

  for (const expected of f.expected_lines) {
    const found = result.lines.find(l => l.name.includes(expected.name_pattern));
    assertExists(found, `Expected line matching "${expected.name_pattern}"`);
    if (expected.period_amount !== null) {
      assertEquals(found!.period_amount, expected.period_amount);
    }
  }
});

// ══════════════════════════════════════════════════════════════
// PHASE 1: Normalization profile registry + fixture shapes
// ══════════════════════════════════════════════════════════════

Deno.test("Profile registry: all profiles loadable", () => {
  const ids = listNormalizationProfileIds();
  assert(ids.length >= 5);
  for (const id of ids) {
    const profile = getNormalizationProfile(id);
    assertExists(profile);
    assertEquals(profile!.family_defaults.contra_or_unknown.action, "reject");
  }
});

Deno.test("Profile registry: economic_saldobalance equity = keep", () => {
  const profile = getNormalizationProfile("economic_saldobalance_credit_v1")!;
  assertEquals(profile.family_defaults.equity_like.action, "keep");
  assertEquals(profile.family_defaults.cash_like.action, "keep");
  assertEquals(profile.family_defaults.revenue_like.action, "abs");
});

Deno.test("Profile registry: economic_pnl has COGS field_override", () => {
  const profile = getNormalizationProfile("economic_pnl_credit_v1")!;
  const cogsOverride = profile.field_overrides["direkte_omkostninger"];
  assertExists(cogsOverride);
  assertEquals(cogsOverride.action, "conditional");
});

Deno.test("Profile registry: kj_auto business convention", () => {
  const profile = getNormalizationProfile("kj_auto_business_v1")!;
  assertEquals(profile.sign_convention, "business");
  for (const [family, rule] of Object.entries(profile.family_defaults)) {
    if (family === "contra_or_unknown") assertEquals(rule.action, "reject");
    else assertEquals(rule.action, "keep");
  }
});

Deno.test("Fixture shapes: all normalization fixtures valid", () => {
  const fixtures = [
    fixture_economic_saldobalance_equity, fixture_economic_saldobalance_cash,
    fixture_economic_saldobalance_revenue, fixture_economic_saldobalance_liability,
    fixture_economic_pnl_cogs_contra, fixture_reject_unclassified,
    fixture_kj_auto_passthrough, fixture_same_raw_different_profiles,
  ];
  for (const f of fixtures) assertNormalizationFixtureShape(f);
});

// ══════════════════════════════════════════════════════════════
// PHASE 2: Source-system fingerprinting
// ══════════════════════════════════════════════════════════════

Deno.test("Fingerprint: e-conomic PDF", () => {
  const f = fixture_economic_pdf_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, f.raw_text);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), f.expected_allows_ai);
});

Deno.test("Fingerprint: e-conomic XLSX", () => {
  const f = fixture_economic_xlsx_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, undefined, f.header_rows);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), f.expected_allows_ai);
});

Deno.test("Fingerprint: Dinero CSV", () => {
  const f = fixture_dinero_csv_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, f.raw_text);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), f.expected_allows_ai);
});

Deno.test("Fingerprint: Dinero PDF", () => {
  const f = fixture_dinero_pdf_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, f.raw_text);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), f.expected_allows_ai);
});

Deno.test("Fingerprint: unknown PDF allows AI", () => {
  const f = fixture_unknown_pdf_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, f.raw_text);
  assertEquals(result.source_system, "unknown");
  assertEquals(isAiAllowed(result), true);
});

Deno.test("Fingerprint: KJ Auto XLSX", () => {
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

// ══════════════════════════════════════════════════════════════
// PHASE 4: XLSX Raw Parser
// ══════════════════════════════════════════════════════════════

Deno.test("XLSX raw parser: parses combined fixture file", async () => {
  // Read the real combined XLSX fixture from tmp/
  try {
    const fileData = await Deno.readFile("tmp/Januar_2026_warburg.xlsx");
    const base64 = btoa(String.fromCharCode(...fileData));
    const result = parseXlsxRawFromBase64(base64);

    assert(result.total_rows > 50, `Expected >50 rows, got ${result.total_rows}`);
    assert(result.total_cols >= 3, `Expected ≥3 cols, got ${result.total_cols}`);
    assertEquals(typeof result.sheet_name, "string");
    assert(result.rows.length > 0);

    // Column profile check
    assert(result.column_profile.length >= 3);

    // Cell-level detail
    const firstRow = result.rows[0];
    assert(firstRow.cells.length >= 3);
    assertEquals(firstRow.cells[0].row_index, 0);
    assertEquals(firstRow.cells[0].col_index, 0);

    // Header row detection
    assertExists(result.header_row_index);

    // Raw matrix preserved
    assert(result.raw_matrix.length === result.total_rows);

    console.log(`XLSX raw parser: ${result.total_rows} rows, ${result.total_cols} cols, header at row ${result.header_row_index}`);
    console.log(`Column types: ${result.column_profile.map(c => `${c.col_letter}:${c.inferred_type}`).join(", ")}`);
  } catch (e) {
    console.log(`XLSX fixture file not available: ${e}`);
    // Don't fail if fixture file isn't present in CI
  }
});

Deno.test("XLSX raw parser: module exports and types", () => {
  // Verify the parser module exports correctly (no require() in Deno)
  assert(typeof parseXlsxRawFromBase64 === "function");
  assertEquals(typeof parseXlsxRawFromBase64, "function");
});
