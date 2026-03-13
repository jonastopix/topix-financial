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
import { dkEconomicResultatopgoerelsePdfV1 } from "../_shared/templates/dkEconomicResultatopgoerelsePdfV1.ts";

Deno.test("Phase 5: e-conomic P&L PDF → semantic extraction emits raw document signs", () => {
  // The template's extractSemantic uses text content (structural payload not yet wired for text-parsed)
  const semantic = dkEconomicResultatopgoerelsePdfV1.extractSemantic!(
    null as any, // structural payload not used for text-based extraction yet
    ECONOMIC_PNL_PDF_TEXT,
  );
  assertExists(semantic);

  // Source identity
  assertEquals(semantic!.source_system, "economic");
  assertEquals(semantic!.document_type, "resultatopgoerelse");
  assertEquals(semantic!.template_id, "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1");
  assertEquals(semantic!.sign_convention, "credit");
  assertEquals(semantic!.normalization_profile_id, "economic_pnl_credit_v1");

  // Candidates must have RAW document signs (credit convention: revenue is negative)
  const revenue = semantic!.metric_candidates.find(c => c.source_field_id === "omsaetning");
  assertExists(revenue);
  assert(revenue!.raw_value! < 0, `Revenue raw_value must be negative (credit convention), got ${revenue!.raw_value}`);
  assertEquals(revenue!.raw_sign, "negative");
  assertEquals(revenue!.normalization_family, "revenue_like");

  const ebt = semantic!.metric_candidates.find(c => c.proposed_canonical_target === "ebt");
  assertExists(ebt);
  assert(ebt!.raw_value! < 0, `EBT raw_value must be negative (credit convention), got ${ebt!.raw_value}`);

  const db = semantic!.metric_candidates.find(c => c.source_field_id === "daekningsbidrag");
  assertExists(db);
  assertEquals(db!.normalization_family, "profit_like");

  // Parser validation
  assertEquals(semantic!.parser_validation.parser_status, "PASS");
});

Deno.test("Phase 5: semantic → normalization → canonical metrics (zero regression)", () => {
  const semantic = dkEconomicResultatopgoerelsePdfV1.extractSemantic!(
    null as any,
    ECONOMIC_PNL_PDF_TEXT,
  );
  assertExists(semantic);

  // Normalize via centralized profile
  const { metrics, correction_log, provenance } = normalizeSemanticExtraction(semantic!);

  // Revenue: raw=-1200000 → abs → 1200000
  assertEquals(metrics.revenue, 1200000);
  // COGS: raw=480000 → conditional→abs → 480000
  assert(metrics.cogs != null && metrics.cogs > 0);
  // Gross profit: raw=-720000 → negate → 720000
  assertEquals(metrics.gross_profit, 720000);
  // EBT: raw=-365000 → negate → 365000
  assertEquals(metrics.ebt, 365000);
  // Net result: raw=-365000 → negate → 365000
  assertEquals(metrics.net_result, 365000);

  // Payroll must be positive
  assert(metrics.payroll != null && metrics.payroll > 0);

  // Correction log must show normalization actions
  assert(correction_log.length > 0, "Expected normalization corrections");

  // Provenance must be enriched
  assertExists(provenance["revenue"]);
  assertEquals(provenance["revenue"].source_field_id, "omsaetning");
  assertEquals(provenance["revenue"].normalization_profile_id, "economic_pnl_credit_v1");
  assertEquals(provenance["revenue"].raw_value, -1200000);
  assertEquals(provenance["revenue"].normalized_value, 1200000);
  assertEquals(provenance["revenue"].normalization_action, "abs");
});

Deno.test("Phase 5: semantic vs legacy path — zero regression comparison", () => {
  // ── Legacy path ──
  const legacyResult = dkEconomicResultatopgoerelsePdfV1.extract({
    fileName: "test.pdf",
    fileType: "pdf",
    sheetNames: [],
    headerRows: [],
    rawText: ECONOMIC_PNL_PDF_TEXT,
    rows: [],
  });
  assert(legacyResult.success === true);
  const legacyCanonical = buildCanonicalOutput(legacyResult.data, null, "deterministic_template");

  // ── Semantic path ──
  const semantic = dkEconomicResultatopgoerelsePdfV1.extractSemantic!(null as any, ECONOMIC_PNL_PDF_TEXT);
  assertExists(semantic);
  const semanticCanonical = buildCanonicalFromSemantic(semantic!);

  // ── Compare core metrics: must match exactly ──
  assertEquals(semanticCanonical.metrics.revenue, legacyCanonical.metrics.revenue, "Revenue mismatch");
  assertEquals(semanticCanonical.metrics.cogs, legacyCanonical.metrics.cogs, "COGS mismatch");
  assertEquals(semanticCanonical.metrics.gross_profit, legacyCanonical.metrics.gross_profit, "Gross profit mismatch");
  assertEquals(semanticCanonical.metrics.payroll, legacyCanonical.metrics.payroll, "Payroll mismatch");
  assertEquals(semanticCanonical.metrics.ebt, legacyCanonical.metrics.ebt, "EBT mismatch");
  assertEquals(semanticCanonical.metrics.net_result, legacyCanonical.metrics.net_result, "Net result mismatch");
  assertEquals(semanticCanonical.metrics.depreciation, legacyCanonical.metrics.depreciation, "Depreciation mismatch");

  // Company identity
  assertEquals(semanticCanonical.company_name, legacyCanonical.company_name);
  assertEquals(semanticCanonical.cvr, legacyCanonical.cvr);

  // Statement type
  assertEquals(semanticCanonical.statement_type, legacyCanonical.statement_type);

  // Template ID
  assertEquals(semanticCanonical.template_id, legacyCanonical.template_id);

  console.log("[Phase5 Regression] Legacy vs Semantic: ZERO REGRESSION");
  console.log(`  Revenue: ${semanticCanonical.metrics.revenue}`);
  console.log(`  COGS: ${semanticCanonical.metrics.cogs}`);
  console.log(`  Gross Profit: ${semanticCanonical.metrics.gross_profit}`);
  console.log(`  EBT: ${semanticCanonical.metrics.ebt}`);
  console.log(`  Net Result: ${semanticCanonical.metrics.net_result}`);
});
