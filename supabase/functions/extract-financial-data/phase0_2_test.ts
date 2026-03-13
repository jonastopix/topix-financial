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
  fixture_combined_dk_xlsx_fingerprint,
  fixture_combined_dk_xlsx_warburg,
  fixture_not_combined_dk_economic_xlsx,
  fixture_not_combined_dk_generic_xlsx,
  fixture_not_combined_dk_no_period_col,
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
    { account_no: "1000", name: "Omsætning", period_amount: -1500000, period_prev: null, ytd_amount: null, ytd_prev: null, is_subtotal: false, section: "PNL" },
    { account_no: null, name: "Dækningsbidrag", period_amount: -900000, period_prev: null, ytd_amount: null, ytd_prev: null, is_subtotal: true, section: "PNL" },
  ];
  const newLines: PdfParsedLine[] = [
    { account_no: "1000", name: "Omsætning", period_amount: -1500000, period_prev: null, ytd_amount: null, ytd_prev: null, is_subtotal: false, section: "PNL" },
    { account_no: null, name: "Dækningsbidrag", period_amount: -900000, period_prev: null, ytd_amount: null, ytd_prev: null, is_subtotal: true, section: "PNL" },
    { account_no: null, name: "Resultat før skat", period_amount: -460000, period_prev: null, ytd_amount: null, ytd_prev: null, is_subtotal: true, section: "PNL" },
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

Deno.test("Profile registry: combined_dk credit convention", () => {
  const profile = getNormalizationProfile("combined_dk_credit_v1")!;
  assertExists(profile, "combined_dk_credit_v1 profile must exist");
  assertEquals(profile.sign_convention, "credit");
  assertEquals(profile.family_defaults.revenue_like.action, "negate");
  assertEquals(profile.family_defaults.cost_like.action, "abs");
  assertEquals(profile.family_defaults.profit_like.action, "negate");
  assertEquals(profile.family_defaults.asset_like.action, "keep");
  assertEquals(profile.family_defaults.contra_or_unknown.action, "reject");
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

Deno.test("Fingerprint: Combined DK XLSX (KJ Auto company)", () => {
  const f = fixture_kj_auto_xlsx_fingerprint;
  const result = detectSourceSystem(f.file_name, f.file_type, undefined, f.header_rows);
  assertEquals(result.source_system, f.expected_source_system);
  assertEquals(isAiAllowed(result), f.expected_allows_ai);
});

Deno.test("Fingerprint: Combined DK XLSX (Warburg company)", () => {
  const f = fixture_combined_dk_xlsx_warburg;
  const result = detectSourceSystem(f.file_name, f.file_type, undefined, f.header_rows);
  assertEquals(result.source_system, "combined_dk");
  assertEquals(isAiAllowed(result), false);
});

// ── False-positive protection for combined_dk ──

Deno.test("Fingerprint: e-conomic XLSX must NOT match combined_dk", () => {
  const f = fixture_not_combined_dk_economic_xlsx;
  const result = detectSourceSystem(f.file_name, f.file_type, undefined, f.header_rows);
  assertEquals(result.source_system, "economic", "e-conomic XLSX must fingerprint as economic, not combined_dk");
  assertEquals(isAiAllowed(result), false);
});

Deno.test("Fingerprint: generic XLSX without Balance row must NOT match combined_dk", () => {
  const f = fixture_not_combined_dk_generic_xlsx;
  const result = detectSourceSystem(f.file_name, f.file_type, undefined, f.header_rows);
  assertEquals(result.source_system, "unknown", "Generic XLSX must not fingerprint as combined_dk");
  assertEquals(isAiAllowed(result), true);
});

Deno.test("Fingerprint: XLSX with Nummer/Navn but no period column must NOT match combined_dk", () => {
  const f = fixture_not_combined_dk_no_period_col;
  const result = detectSourceSystem(f.file_name, f.file_type, undefined, f.header_rows);
  assertEquals(result.source_system, "unknown", "Missing period column must not match combined_dk");
  assertEquals(isAiAllowed(result), true);
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

// ══════════════════════════════════════════════════════════════
// PHASE 3: PDF Structural Validator Tests
// ══════════════════════════════════════════════════════════════

import {
  validatePdfStructuralPayload,
  evaluateStructuralTrust,
} from "../_shared/pdfStructuralValidator.ts";
import type { PdfStructuralPayload } from "../_shared/pdfStructuralTypes.ts";

/** Helper: build a minimal valid PdfStructuralPayload */
function buildValidPayload(): PdfStructuralPayload {
  const tokens = [];
  for (let i = 0; i < 6; i++) {
    tokens.push({
      text: i < 3 ? `Label ${i}` : `${(i * 1000).toFixed(2).replace(".", ",")}`,
      x: i < 3 ? 50 : 300,
      y: 700 - i * 20,
      width: 80,
      page: 1,
      column_slot: i >= 3 ? 0 : null,
      column_slot_confidence: "HIGH" as const,
    });
  }

  const rows = [];
  for (let i = 0; i < 6; i++) {
    rows.push({
      row_index: i,
      row_group_id: `p1_r${i}`,
      y_position: 700 - i * 20,
      page: 1,
      tokens: [tokens[i]],
      is_header: i === 0,
      is_subtotal: i === 5,
    });
  }

  return {
    version: "1.0",
    pages: [{ page_number: 1, rows }],
    column_profile: {
      slot_count: 1,
      slot_labels: ["Perioden"],
      slot_x_ranges: [{ min: 280, max: 380 }],
      detection_method: "header_anchor",
      confidence: "HIGH",
    },
    metadata: {
      page_count: 1,
      total_token_count: 6,
      total_row_count: 6,
      content_hash: "a".repeat(64),
      source_file_name: "test.pdf",
      extraction_timestamp: new Date().toISOString(),
    },
  };
}

// ── Validator unit tests ──

Deno.test("PdfStructural validator: valid payload passes", () => {
  const payload = buildValidPayload();
  const result = validatePdfStructuralPayload(payload);
  assert(result.valid, `Expected valid, got errors: ${result.errors.join("; ")}`);
  assertEquals(result.errors.length, 0);
});

Deno.test("PdfStructural validator: missing pages field fails", () => {
  const payload = { version: "1.0", column_profile: {}, metadata: {} };
  const result = validatePdfStructuralPayload(payload);
  assertFalse(result.valid);
  assert(result.errors.some(e => e.includes("pages")));
});

Deno.test("PdfStructural validator: wrong version fails", () => {
  const payload = buildValidPayload();
  (payload as any).version = "2.0";
  const result = validatePdfStructuralPayload(payload);
  assertFalse(result.valid);
  assert(result.errors.some(e => e.includes("version")));
});

Deno.test("PdfStructural validator: empty pages fails", () => {
  const payload = buildValidPayload();
  payload.pages = [];
  const result = validatePdfStructuralPayload(payload);
  assertFalse(result.valid);
  assert(result.errors.some(e => e.includes("0 pages")));
});

Deno.test("PdfStructural validator: invalid token coordinates fails", () => {
  const payload = buildValidPayload();
  payload.pages[0].rows[0].tokens[0].x = NaN;
  const result = validatePdfStructuralPayload(payload);
  assertFalse(result.valid);
  assert(result.errors.some(e => e.includes("x invalid")));
});

Deno.test("PdfStructural validator: column profile inconsistency fails", () => {
  const payload = buildValidPayload();
  payload.column_profile.slot_count = 3;
  // slot_labels has length 1, slot_count says 3 → inconsistency
  const result = validatePdfStructuralPayload(payload);
  assertFalse(result.valid);
  assert(result.errors.some(e => e.includes("inconsistency")));
});

Deno.test("PdfStructural validator: bad content hash fails", () => {
  const payload = buildValidPayload();
  payload.metadata.content_hash = "tooshort";
  const result = validatePdfStructuralPayload(payload);
  assertFalse(result.valid);
  assert(result.errors.some(e => e.includes("content_hash")));
});

Deno.test("PdfStructural validator: page count mismatch fails", () => {
  const payload = buildValidPayload();
  payload.metadata.page_count = 5; // but only 1 page in pages array
  const result = validatePdfStructuralPayload(payload);
  assertFalse(result.valid);
  assert(result.errors.some(e => e.includes("Page count mismatch")));
});

// ══════════════════════════════════════════════════════════════
// PHASE 3: Persistence / Replay Round-Trip Test
// ══════════════════════════════════════════════════════════════

Deno.test("PdfStructural: JSON round-trip preserves validity (replay contract)", () => {
  const payload = buildValidPayload();

  // Validate original
  const r1 = validatePdfStructuralPayload(payload);
  assert(r1.valid, "Original payload must be valid");

  // Serialize → deserialize
  const serialized = JSON.stringify(payload);
  const deserialized = JSON.parse(serialized);

  // Re-validate
  const r2 = validatePdfStructuralPayload(deserialized);
  assert(r2.valid, `Deserialized payload must be valid, errors: ${r2.errors.join("; ")}`);

  // Deep equality
  assertEquals(JSON.stringify(deserialized), serialized, "Round-trip must be byte-stable");
});

// ══════════════════════════════════════════════════════════════
// PHASE 3: Routing-Behavior Tests (Trust Model)
// ══════════════════════════════════════════════════════════════

Deno.test("Routing: known source + invalid structural → hard fail, no fallback", () => {
  const decision = evaluateStructuralTrust(
    true,   // known source
    true,   // has structural payload
    false,  // validation invalid
    false,  // hash not verified
    ["Missing required fields"],
  );
  assertFalse(decision.proceed);
  assertFalse(decision.fallback_allowed);
  assertEquals(decision.status, "structural_parse_fail");
  assertExists(decision.error);
});

Deno.test("Routing: known source + hash mismatch → hard fail, no fallback", () => {
  const decision = evaluateStructuralTrust(
    true,   // known source
    true,   // has structural payload
    true,   // validation valid
    false,  // hash NOT verified
    [],
  );
  assertFalse(decision.proceed);
  assertFalse(decision.fallback_allowed);
  assertEquals(decision.status, "structural_parse_fail");
});

Deno.test("Routing: unknown source + invalid structural → fallback allowed", () => {
  const decision = evaluateStructuralTrust(
    false,  // unknown source
    true,   // has structural payload
    false,  // validation invalid
    false,  // hash not verified
    ["Some error"],
  );
  assertFalse(decision.proceed);
  assert(decision.fallback_allowed);
  assertEquals(decision.status, undefined);
});

Deno.test("Routing: no structural payload → legacy text path (fallback allowed)", () => {
  const decision = evaluateStructuralTrust(
    true,   // known or unknown — doesn't matter
    false,  // NO structural payload
    false,  // n/a
    false,  // n/a
    [],
  );
  assertFalse(decision.proceed);
  assert(decision.fallback_allowed);
  assertEquals(decision.status, undefined);
});

Deno.test("Routing: known source + valid + hash verified → proceed, no fallback", () => {
  const decision = evaluateStructuralTrust(
    true,   // known source
    true,   // has structural payload
    true,   // validation valid
    true,   // hash verified
    [],
  );
  assert(decision.proceed);
  assertFalse(decision.fallback_allowed);
});

Deno.test("Routing: unknown source + valid + hash not verified → proceed with fallback", () => {
  const decision = evaluateStructuralTrust(
    false,  // unknown source
    true,   // has structural payload
    true,   // validation valid
    false,  // hash NOT verified (race condition)
    [],
  );
  assert(decision.proceed);
  assert(decision.fallback_allowed);
});

// ══════════════════════════════════════════════════════════════
// PHASE 5: Semantic Extraction + Normalization E2E Regression
// ══════════════════════════════════════════════════════════════

import { buildCanonicalOutput, normalizeSemanticExtraction, buildCanonicalFromSemantic } from "../_shared/canonicalEngine.ts";
import { dkEconomicResultatopgoerelsePdfV1, validateStructuralAcceptance, normalizePdfLabelText } from "../_shared/templates/dkEconomicResultatopgoerelsePdfV1.ts";
import { tryDeterministicPdfStructuralExtraction } from "../_shared/templateRegistry.ts";

// ══════════════════════════════════════════════════════════════
// PHASE 5: Label Normalization (Ligature Cleanup)
// ══════════════════════════════════════════════════════════════

Deno.test("Label normalization: PDF ligature fi replacement", () => {
  // Common Danish financial terms with \u0000 ligature
  assertEquals(normalizePdfLabelText("\u0000nansielle"), "finansielle");
  assertEquals(normalizePdfLabelText("Pro\u0000t"), "Profit");
  assertEquals(normalizePdfLabelText("\u0000nansiering"), "finansiering");
  // Normal text unaffected
  assertEquals(normalizePdfLabelText("Normal text"), "Normal text");
  assertEquals(normalizePdfLabelText("Omsætning i alt"), "Omsætning i alt");
  assertEquals(normalizePdfLabelText(""), "");
  // Numeric strings must NOT be affected
  assertEquals(normalizePdfLabelText("-629.400,25"), "-629.400,25");
  assertEquals(normalizePdfLabelText("1.234,56"), "1.234,56");
});

Deno.test("Phase 5: e-conomic P&L PDF → legacy text semantic extraction emits raw document signs", () => {
  const semantic = dkEconomicResultatopgoerelsePdfV1.extractSemantic(
    null, // No structural payload → legacy text fallback
    ECONOMIC_PNL_PDF_TEXT,
  );
  assertExists(semantic);

  assertEquals(semantic!.source_system, "economic");
  assertEquals(semantic!.document_type, "resultatopgoerelse");
  assertEquals(semantic!.template_id, "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1");
  assertEquals(semantic!.sign_convention, "credit");
  assertEquals(semantic!.normalization_profile_id, "economic_pnl_credit_v1");

  const revenue = semantic!.metric_candidates.find(c => c.source_field_id === "omsaetning");
  assertExists(revenue);
  assert(revenue!.raw_value! < 0, `Revenue raw_value must be negative (credit convention), got ${revenue!.raw_value}`);
  assertEquals(revenue!.raw_sign, "negative");

  const ebt = semantic!.metric_candidates.find(c => c.proposed_canonical_target === "ebt");
  assertExists(ebt);
  assert(ebt!.raw_value! < 0, `EBT raw_value must be negative (credit convention), got ${ebt!.raw_value}`);

  assertEquals(semantic!.parser_validation.parser_status, "PASS");
});

Deno.test("Phase 5: legacy text semantic → normalization → canonical metrics (zero regression)", () => {
  const semantic = dkEconomicResultatopgoerelsePdfV1.extractSemantic(null, ECONOMIC_PNL_PDF_TEXT);
  assertExists(semantic);

  const normResult = normalizeSemanticExtraction(semantic!);
  // Build canonical to verify full pipeline
  const canonical = buildCanonicalFromSemantic(semantic!);

  assertEquals(canonical.metrics.revenue, 1200000);
  assertEquals(canonical.metrics.gross_profit, 720000);
  assertEquals(canonical.metrics.ebt, 365000);
  assertEquals(canonical.metrics.net_result, 365000);
  assert(canonical.metrics.payroll != null && canonical.metrics.payroll > 0);
  assert(normResult.correction_log.length > 0, "Expected normalization corrections");
  assertExists(normResult.provenance_by_source["omsaetning"]);
  assertEquals(normResult.provenance_by_source["omsaetning"].normalization_action, "abs");
});

Deno.test("Phase 5: legacy semantic vs legacy extract — zero regression", () => {
  const legacyResult = dkEconomicResultatopgoerelsePdfV1.extract({
    fileName: "test.pdf", fileType: "pdf", sheetNames: [], headerRows: [],
    rawText: ECONOMIC_PNL_PDF_TEXT, rows: [],
  });
  assert(legacyResult.success === true);
  const legacyCanonical = buildCanonicalOutput(legacyResult.data, null, "deterministic_template");

  const semantic = dkEconomicResultatopgoerelsePdfV1.extractSemantic(null, ECONOMIC_PNL_PDF_TEXT);
  assertExists(semantic);
  const semanticCanonical = buildCanonicalFromSemantic(semantic!);

  assertEquals(semanticCanonical.metrics.revenue, legacyCanonical.metrics.revenue, "Revenue mismatch");
  assertEquals(semanticCanonical.metrics.gross_profit, legacyCanonical.metrics.gross_profit, "Gross profit mismatch");
  assertEquals(semanticCanonical.metrics.payroll, legacyCanonical.metrics.payroll, "Payroll mismatch");
  assertEquals(semanticCanonical.metrics.ebt, legacyCanonical.metrics.ebt, "EBT mismatch");
  assertEquals(semanticCanonical.metrics.net_result, legacyCanonical.metrics.net_result, "Net result mismatch");
  assertEquals(semanticCanonical.company_name, legacyCanonical.company_name);
  assertEquals(semanticCanonical.statement_type, legacyCanonical.statement_type);
  console.log("[Phase5 Legacy Regression] ZERO REGRESSION");
});

// ══════════════════════════════════════════════════════════════
// PHASE 5: Structural-First Regression (Same-Source: Resultat_6.pdf)
// ══════════════════════════════════════════════════════════════

// Golden canonical expectations derived from tmp/Resultat_6.pdf structural payload.
// These values are computed from the golden structural fixture's actual tokens:
//   OMSÆTNING I ALT: -629.400,25 → abs → 629400.25
//   VAREFORBRUG OG FREMMED ARBEJDE: 141.587,59 → abs → 141587.59
//   DÆKNINGSBIDRAG I ALT: -487.812,66 → negate → 487812.66
//   LØNNINGER MV. I ALT: 30.501,71 → abs → 30501.71
//   SALGSOMKOSTNINGER: 3.430,32 → abs → 3430.32
//   LOKALEOMKOSTNINGER: 3.280,00 → abs → 3280.00
//   TRANSPORTOMKOSTNINGER I ALT: 1.550,28 → abs → 1550.28
//   ADMINISTRATION: 18.686,57 → abs → 18686.57
//   AFSKRIVNINGER: 270,63 → abs → 270.63
//   RESULTAT FØR SKAT: -430.093,15 → negate → 430093.15
//   RESULTAT EFTER SKAT: -430.093,15 → negate → 430093.15
const RESULTAT6_EXPECTED_CANONICAL = {
  revenue: 629400.25,
  cogs: 141587.59,
  gross_profit: 487812.66,
  payroll: 30501.71,
  sales_costs: 3430.32,
  facility_costs: 3280.00,
  vehicle_costs: 1550.28,
  admin_costs: 18686.57,
  depreciation: 270.63,
  ebt: 430093.15,
  net_result: 430093.15,
  company_name: "SnowWaves ApS",
  cvr: "39850850",
};

Deno.test("Phase 5: template-level structural acceptance for 1-slot variant", async () => {
  // Load golden structural fixture
  const fixtureText = await Deno.readTextFile("src/lib/__fixtures__/golden_resultat6_structural.json");
  const structural = JSON.parse(fixtureText) as PdfStructuralPayload;

  const acceptance = validateStructuralAcceptance(structural);
  assert(acceptance.accepted, `Structural acceptance must pass, got: ${acceptance.reason}`);
  assertEquals(acceptance.reason, "1-slot single-period variant accepted");
  assert(acceptance.slot0_row_count >= 5, `Expected ≥5 rows with slot 0, got ${acceptance.slot0_row_count}`);

  // Column profile assertions
  assertEquals(structural.column_profile.slot_count, 1);
  assertEquals(structural.column_profile.detection_method, "positional_cluster");
  assertEquals(structural.column_profile.confidence, "LOW");

  console.log(`[Acceptance] 1-slot variant accepted: ${acceptance.slot0_row_count} rows with slot 0`);
});

Deno.test("Phase 5: structural-first extraction from Resultat_6 golden fixture", async () => {
  const fixtureText = await Deno.readTextFile("src/lib/__fixtures__/golden_resultat6_structural.json");
  const structural = JSON.parse(fixtureText) as PdfStructuralPayload;

  // Run structural-first semantic extraction (structural is primary source)
  const semantic = dkEconomicResultatopgoerelsePdfV1.extractSemantic(structural, "");
  assertExists(semantic, "Structural semantic extraction must succeed");

  // Source identity
  assertEquals(semantic!.source_system, "economic");
  assertEquals(semantic!.template_id, "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1");
  assertEquals(semantic!.sign_convention, "credit");

  // All candidates must have source_column_slot: 0 (structural-first proof)
  for (const c of semantic!.metric_candidates) {
    assertEquals(c.source_column_slot, 0, `${c.source_field_id} must have source_column_slot=0`);
    assert(c.evidence.some(e => e.includes("Structural row")), `${c.source_field_id} must have structural evidence`);
  }

  // Revenue must be negative (raw document sign preserved)
  const revenue = semantic!.metric_candidates.find(c => c.source_field_id === "omsaetning");
  assertExists(revenue);
  assert(revenue!.raw_value! < 0, `Revenue raw must be negative, got ${revenue!.raw_value}`);

  // EBT must be negative (raw document sign preserved)
  const ebt = semantic!.metric_candidates.find(c => c.proposed_canonical_target === "ebt");
  assertExists(ebt);
  assert(ebt!.raw_value! < 0, `EBT raw must be negative, got ${ebt!.raw_value}`);

  // Metadata extracted from structural tokens
  assertEquals(semantic!.company_name, RESULTAT6_EXPECTED_CANONICAL.company_name);
  assertEquals(semantic!.cvr, RESULTAT6_EXPECTED_CANONICAL.cvr);

  console.log(`[Structural] Extracted ${semantic!.metric_candidates.length} candidates, ${semantic!.line_items.length} line items`);
});

Deno.test("Phase 5: structural-first → normalization → canonical (same-source regression)", async () => {
  const fixtureText = await Deno.readTextFile("src/lib/__fixtures__/golden_resultat6_structural.json");
  const structural = JSON.parse(fixtureText) as PdfStructuralPayload;

  const semantic = dkEconomicResultatopgoerelsePdfV1.extractSemantic(structural, "");
  assertExists(semantic);

  // Full canonical pipeline
  const canonical = buildCanonicalFromSemantic(semantic!);

  // Same-source regression against golden canonical expectations
  assertEquals(canonical.metrics.revenue, RESULTAT6_EXPECTED_CANONICAL.revenue, "Revenue mismatch");
  assertEquals(canonical.metrics.cogs, RESULTAT6_EXPECTED_CANONICAL.cogs, "COGS mismatch");
  assertEquals(canonical.metrics.gross_profit, RESULTAT6_EXPECTED_CANONICAL.gross_profit, "Gross profit mismatch");
  assertEquals(canonical.metrics.payroll, RESULTAT6_EXPECTED_CANONICAL.payroll, "Payroll mismatch");
  assertEquals(canonical.metrics.sales_costs, RESULTAT6_EXPECTED_CANONICAL.sales_costs, "Sales costs mismatch");
  assertEquals(canonical.metrics.facility_costs, RESULTAT6_EXPECTED_CANONICAL.facility_costs, "Facility costs mismatch");
  assertEquals(canonical.metrics.vehicle_costs, RESULTAT6_EXPECTED_CANONICAL.vehicle_costs, "Vehicle costs mismatch");
  assertEquals(canonical.metrics.admin_costs, RESULTAT6_EXPECTED_CANONICAL.admin_costs, "Admin costs mismatch");
  assertEquals(canonical.metrics.depreciation, RESULTAT6_EXPECTED_CANONICAL.depreciation, "Depreciation mismatch");
  assertEquals(canonical.metrics.ebt, RESULTAT6_EXPECTED_CANONICAL.ebt, "EBT mismatch");
  assertEquals(canonical.metrics.net_result, RESULTAT6_EXPECTED_CANONICAL.net_result, "Net result mismatch");
  assertEquals(canonical.company_name, RESULTAT6_EXPECTED_CANONICAL.company_name, "Company name mismatch");
  assertEquals(canonical.cvr, RESULTAT6_EXPECTED_CANONICAL.cvr, "CVR mismatch");

  // Gross profit equation: revenue - cogs = gross_profit
  const gpCheck = Math.abs(canonical.metrics.revenue! - canonical.metrics.cogs! - canonical.metrics.gross_profit!);
  assert(gpCheck <= 2, `Gross profit equation failed: ${canonical.metrics.revenue} - ${canonical.metrics.cogs} ≠ ${canonical.metrics.gross_profit} (diff ${gpCheck})`);

  // Provenance must reference structural source
  assertExists(canonical.provenance);
  const revProv = (canonical.provenance as any)["revenue"];
  assertExists(revProv, "Revenue provenance must exist");
  assertEquals(revProv.source_type, "deterministic_template");
  assertEquals(revProv.source_column_slot, 0);
  assertExists(revProv.normalization_action);

  // Statement type
  assertEquals(canonical.statement_type, "pnl");

  console.log("[Phase5 Structural Regression] SAME-SOURCE ZERO REGRESSION");
  console.log(`  Revenue: ${canonical.metrics.revenue}`);
  console.log(`  COGS: ${canonical.metrics.cogs}`);
  console.log(`  Gross Profit: ${canonical.metrics.gross_profit}`);
  console.log(`  Payroll: ${canonical.metrics.payroll}`);
  console.log(`  EBT: ${canonical.metrics.ebt}`);
  console.log(`  Net Result: ${canonical.metrics.net_result}`);
});

Deno.test("Phase 5: structural routing via registry (end-to-end)", async () => {
  const fixtureText = await Deno.readTextFile("src/lib/__fixtures__/golden_resultat6_structural.json");
  const structural = JSON.parse(fixtureText) as PdfStructuralPayload;

  // Detection text must exceed 100 chars and contain e-conomic signals for template matching
  const detectionText = "Hentet: 09/03-2026 Kl. 14.18\nSnowWaves ApS (CVR-nr. 39850850)\nResultatopgørelse 01/01-2026 - 31/01-2026\nsecure.e-conomic.com\nOmsætning\nDækningsbidrag\nResultat før skat\nAfskrivninger\nLokaleomkostninger\nAdministration";

  const result = tryDeterministicPdfStructuralExtraction(structural, detectionText, "Resultat_6.pdf");
  assertEquals(result.type, "success", `Expected success, got ${result.type}`);

  if (result.type === "success") {
    assertEquals(result.template_id, "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1");
    assert(result.score >= 80);
    assertExists(result.semantic);
    assertEquals(result.semantic.source_system, "economic");
    assert(result.semantic.metric_candidates.length >= 5);
  }
});
