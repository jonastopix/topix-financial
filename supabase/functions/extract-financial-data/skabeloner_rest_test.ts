/**
 * «De tre sidste skabeloner» (17/9-2026): Dinero CSV (begge veje), Dinero PDF, generic PDF via
 * kontogrupper.ts — og XLSX-P&L + combined via subtotalGrupper.ts. Syntetiske fixtures
 * (_test_fixtures/skabelonerRestSyntetisk.ts), ingen kundedata.
 *
 * Kør: deno test --node-modules-dir=none --allow-read --allow-env supabase/functions/extract-financial-data/skabeloner_rest_test.ts
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectTemplate, tryDeterministicCsvExtraction, tryDeterministicPdfExtraction } from "../_shared/templateRegistry.ts";
import { buildCanonicalOutput, buildCanonicalFromSemantic, runExtendedValidation, AFLEDTE_RESULTATLINJER } from "../_shared/canonicalEngine.ts";
import { parseCsvRaw } from "../_shared/csvRawParser.ts";
import { dkDineroResultatopgoerelseCsvV1 } from "../_shared/templates/dkDineroResultatopgoerelseCsvV1.ts";
import { dkEconomicResultatopgoerelseXlsxV1 } from "../_shared/templates/dkEconomicResultatopgoerelseXlsxV1.ts";
import { dkCombinedBalancePnlV1 } from "../_shared/templates/dkCombinedBalancePnlV1.ts";
import { fordelKontogrupper, keyFiguresAf, kontrolsumTjek } from "../_shared/kontogrupper.ts";
import { fordelSubtotaler, type GruppeRaekke } from "../_shared/subtotalGrupper.ts";
import type { XlsxParseResult, XlsxRawRow, XlsxRawCell, XlsxColumnProfile } from "../_shared/xlsxRawParser.ts";
import {
  REST_DINERO_CSV, REST_DINERO_PDF_TEXT, REST_GENERIC_PDF_TEXT,
  REST_XLSX_PNL_ROWS, REST_XLSX_PNL_ROWS_UKENDT_GRUPPE, REST_XLSX_PNL_ROWS_BUSINESS, REST_COMBINED_ROWS,
} from "../_test_fixtures/skabelonerRestSyntetisk.ts";

const naer = (a: number | null | undefined, b: number, msg: string) => {
  assertExists(a, msg + " (null)");
  assert(Math.abs((a as number) - b) < 0.01, `${msg}: ${a} ≠ ${b}`);
};

// ── XLSX-fixturebygger (samme som phase4_e2e_test.ts) ──
function byg(rows: any[][], sheetName = "Sheet1"): XlsxParseResult {
  const totalCols = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);
  const col = (c: number) => String.fromCharCode(65 + c);
  const xlsxRows: XlsxRawRow[] = rows.map((rowData, r) => {
    const cells: XlsxRawCell[] = [];
    for (let c = 0; c < totalCols; c++) {
      const val = c < (rowData || []).length ? rowData[c] : null;
      cells.push({
        sheet_name: sheetName, cell_address: `${col(c)}${r + 1}`, row_index: r, col_index: c, raw_value: val,
        formatted_value: val != null ? val.toString() : null,
        value_type: val == null ? "null" : typeof val === "number" ? "number" : "string", has_formula: false,
      });
    }
    return { sheet_name: sheetName, row_index: r, cells };
  });
  let headerRowIndex: number | null = null;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const ne = (rows[r] || []).filter((v: any) => v != null && v.toString().trim() !== "");
    if (ne.length >= 2 && ne.filter((v: any) => typeof v === "string").length >= 2) { headerRowIndex = r; break; }
  }
  const column_profile: XlsxColumnProfile[] = [];
  for (let c = 0; c < totalCols; c++) {
    const vals = rows.map((r) => (r || [])[c]).filter((v) => v != null && v.toString().trim() !== "");
    const nums = vals.filter((v) => typeof v === "number").length;
    const headerVal = headerRowIndex != null ? (rows[headerRowIndex] || [])[c] : null;
    column_profile.push({
      col_index: c, col_letter: col(c), header_value: headerVal != null ? headerVal.toString() : null,
      inferred_type: vals.length > 0 && nums / vals.length >= 0.6 ? "numeric" : vals.length > 0 ? "text" : "empty",
      non_empty_count: vals.length, numeric_count: nums, sample_values: vals.slice(0, 3).map((v) => v.toString()),
    } as XlsxColumnProfile);
  }
  return { sheet_name: sheetName, total_rows: rows.length, total_cols: totalCols, header_row_index: headerRowIndex, rows: xlsxRows, column_profile, raw_matrix: rows };
}

// ═══════════════════════════ kontogrupper.ts (ren) ═══════════════════════════

Deno.test("kontogrupper: kredit-netto i en omkostningsklasse → 0 + andre driftsindtægter; uklassificeret → øvrige; kontrolsum 0", () => {
  const f = fordelKontogrupper([
    { cls: "revenue", rawAmount: -600000 },
    { cls: "cogs", rawAmount: 200000 },
    { cls: "facility_costs", rawAmount: 40000 },
    { cls: "facility_costs", rawAmount: -55000 },
    { cls: "unclassified", rawAmount: 4000, ambiguous: true },
    { cls: "financial_costs", rawAmount: -3000 },
    { cls: "financial_costs", rawAmount: 500 },
    { cls: "tax", rawAmount: 12000 },
  ], "CREDIT");
  naer(f.revenue, 600000, "revenue");
  naer(f.omkostninger.cogs, 200000, "cogs");
  assertEquals(f.omkostninger.facility_costs, 0, "kredit-netto-gruppen udstedes som 0");
  naer(f.andreDriftsindtaegter, 15000, "andre driftsindtægter");
  naer(f.omkostninger.other_costs, 4000, "uklassificeret → øvrige");
  assertEquals(f.omkostninger.financial_costs, 0);
  naer(f.finansielleIndtaegter, 2500, "finansielle indtægter");
  naer(f.skat, 12000, "skat");
  naer(f.ebt, 600000 - 200000 - 4000 + 15000 + 2500, "ebt");
  naer(f.netResult, f.ebt! - 12000, "net");
  assertEquals(f.kontrolsum.afvigelse, 0, "kontrolsummen er 0 pr. konstruktion");
  assertEquals(kontrolsumTjek(f).result, "PASS");
  assertEquals(f.kreditKlasser, ["facility_costs", "financial_costs"]);
  const kf = keyFiguresAf(f);
  assertEquals(kf.lokaleomkostninger, 0);
  naer(kf.andre_driftsindtaegter, 15000, "kf andre");
  naer(kf.finansielle_indtaegter, 2500, "kf fin");
  naer(kf.oevrige_omkostninger, 4000, "kf øvrige");
});

Deno.test("kontogrupper: forretningsfortegn beholdes; uden vareforbrug er ebt null og kontrolsummen SKIP", () => {
  const f = fordelKontogrupper([
    { cls: "revenue", rawAmount: 1000 },
    { cls: "cogs", rawAmount: -400 },
    { cls: "payroll", rawAmount: -100 },
  ], "BUSINESS");
  naer(f.ebt, 500, "ebt business");
  assertEquals(f.kontrolsum.afvigelse, 0);
  const g = fordelKontogrupper([{ cls: "revenue", rawAmount: -1000 }, { cls: "payroll", rawAmount: 100 }], "CREDIT");
  assertEquals(g.ebt, null);
  assertEquals(kontrolsumTjek(g).result, "SKIP");
});

// ═══════════════════════════ Dinero CSV — begge veje ═══════════════════════════

Deno.test("Dinero CSV legacy: kredit-netto lokaler → 0 + andre driftsindtægter, tvetydig linje → øvrige, renter netto → finansielle indtægter, pnl_coverage PASS", () => {
  const r = tryDeterministicCsvExtraction(REST_DINERO_CSV, "Resultat.csv");
  assertEquals(r.type, "success");
  if (r.type !== "success") return;
  const kf = r.extractedData.key_figures as Record<string, number | null>;
  naer(kf.omsaetning, 600000, "omsætning");
  naer(kf.direkte_omkostninger, 200000, "vareforbrug");
  assertEquals(kf.lokaleomkostninger, 0, "lokaler er en kredit-netto → 0");
  naer(kf.andre_driftsindtaegter, 15000, "andre driftsindtægter");
  naer(kf.oevrige_omkostninger, 4000, "tvetydig linje → øvrige (før: sprunget over)");
  assertEquals(kf.finansielle_omkostninger, 0);
  naer(kf.finansielle_indtaegter, 2500, "finansielle indtægter");
  naer(kf.resultat_foer_skat, 228500, "ebt");
  naer(kf.resultat_efter_skat, 216500, "net");
  const cov = r.extractedData.validation.checks.find((c: any) => c.name === "pnl_coverage");
  assertExists(cov); assertEquals(cov!.result, "PASS");
  assertEquals(r.extractedData._deterministic_meta.normalized_line_count, 13, "alle 13 linjer tæller");
  const canonical = buildCanonicalOutput(r.extractedData, { deterministic: true, template_id: "DK_DINERO_RESULTATOPGOERELSE_V1" }, "deterministic_template");
  naer(canonical.metrics.other_costs, 4000, "canonical other_costs");
  naer(canonical.metrics.other_operating_income, 15000, "canonical other_operating_income");
  naer(canonical.metrics.financial_income, 2500, "canonical financial_income");
  naer(canonical.metrics.ebt, 228500, "canonical ebt");
  assertEquals(canonical.metrics.facility_costs, 0);
});

Deno.test("Dinero CSV semantisk: samme tal som legacy (nul drift) og ingen FAIL i motoren", () => {
  const csv = parseCsvRaw(REST_DINERO_CSV);
  const sem = dkDineroResultatopgoerelseCsvV1.extractSemanticFromCsv!(csv);
  assertExists(sem);
  const ids = sem!.metric_candidates.map((c) => c.source_field_id);
  assert(ids.includes("oevrige_omkostninger") && ids.includes("andre_driftsindtaegter") && ids.includes("finansielle_indtaegter"), `kandidater: ${ids.join(",")}`);
  const lokaler = sem!.metric_candidates.find((c) => c.source_field_id === "lokaleomkostninger")!;
  assertEquals(lokaler.raw_value, 0); assertEquals(lokaler.sign_convention, "business");
  const oms = sem!.metric_candidates.find((c) => c.source_field_id === "omsaetning")!;
  assertEquals(oms.raw_value, -600000, "omsætningen udstedes som rå kredit-netto"); assertEquals(oms.sign_convention, "credit");
  const can = buildCanonicalFromSemantic(sem!);
  naer(can.metrics.revenue, 600000, "revenue");
  naer(can.metrics.cogs, 200000, "cogs");
  assertEquals(can.metrics.facility_costs, 0);
  naer(can.metrics.other_costs, 4000, "other_costs");
  naer(can.metrics.other_operating_income, 15000, "other_operating_income");
  naer(can.metrics.financial_income, 2500, "financial_income");
  assertEquals(can.metrics.financial_costs, 0);
  naer(can.metrics.ebt, 228500, "ebt");
  naer(can.metrics.net_result, 216500, "net_result");
  const fails = can.validation.canonical_checks.filter((c) => c.result === "FAIL").map((c) => `${c.name}: ${c.details}`);
  assertEquals(fails, [], "ingen FAIL i motoren (tjek 18 inkl.)");
  const t18d = can.validation.canonical_checks.find((c) => c.name === "derived_sign_preserved");
  assertEquals(t18d?.result, "PASS", "resultat_efter_skat (afledt, business) beholder fortegnet");
  // Nul drift mod legacy-vejen
  const leg = tryDeterministicCsvExtraction(REST_DINERO_CSV, "Resultat.csv");
  if (leg.type !== "success") throw new Error("legacy");
  const legCan = buildCanonicalOutput(leg.extractedData, {}, "deterministic_template");
  for (const k of ["revenue", "cogs", "gross_profit", "payroll", "sales_costs", "facility_costs", "admin_costs", "other_costs", "other_operating_income", "depreciation", "financial_costs", "financial_income", "ebitda", "ebit", "ebt", "net_result"] as const) {
    const a = legCan.metrics[k], b = can.metrics[k];
    assert(a != null && b != null && Math.abs(a - b) < 0.01, `${k}: legacy=${a} semantic=${b}`);
  }
});

// ═══════════════════════════ Dinero PDF + generic PDF ═══════════════════════════

for (const [navn, tekst, templateId] of [
  ["Dinero PDF", REST_DINERO_PDF_TEXT, "DK_DINERO_RESULTATOPGOERELSE_PDF_V1"],
  ["generic PDF", REST_GENERIC_PDF_TEXT, "DK_GENERIC_RESULTATOPGOERELSE_PDF_V1"],
] as const) {
  Deno.test(`${navn}: kredit-netto lokaler → andre driftsindtægter, linje uden klasse → øvrige, renter netto → finansielle indtægter, ebt = filens egen linje`, () => {
    const ctx = { fileName: "resultat.pdf", fileType: "pdf" as const, rawText: tekst, rows: [], sheetNames: [], headerRows: [] };
    const m = detectTemplate(ctx);
    assertExists(m, "skabelon fundet");
    assertEquals(m!.template.template_id, templateId);
    const r = tryDeterministicPdfExtraction(tekst, "resultat.pdf");
    assertEquals(r.type, "success", JSON.stringify(r));
    if (r.type !== "success") return;
    const kf = r.extractedData.key_figures as Record<string, number | null>;
    naer(kf.omsaetning, 600000, "omsætning");
    assertEquals(kf.lokaleomkostninger, 0, "lokaler kredit-netto → 0");
    naer(kf.andre_driftsindtaegter, 15000, "andre driftsindtægter");
    naer(kf.oevrige_omkostninger, 4000, "«Diverse poster» → øvrige");
    naer(kf.finansielle_indtaegter, 2500, "finansielle indtægter");
    assertEquals(kf.finansielle_omkostninger, 0);
    naer(kf.resultat_foer_skat, 228500, "ebt = filens egen RESULTAT FØR SKAT (−228.500 i kredit)");
    naer(kf.resultat_efter_skat, 216500, "net");
    const cov = r.extractedData.validation.checks.find((c: any) => c.name === "pnl_coverage");
    assertEquals(cov?.result, "PASS", JSON.stringify(cov));
    const can = buildCanonicalOutput(r.extractedData, { deterministic: true, template_id: templateId }, "deterministic_template");
    naer(can.metrics.other_costs, 4000, "other_costs");
    naer(can.metrics.other_operating_income, 15000, "other_operating_income");
    naer(can.metrics.financial_income, 2500, "financial_income");
    naer(can.metrics.ebt, 228500, "ebt");
  });
}

// ═══════════════════════════ subtotalGrupper.ts (ren) ═══════════════════════════

const rk = (label: string, rawValue: number, rowIndex: number, key: string | null, family: any): GruppeRaekke =>
  ({ label, rawValue, rowIndex, cellAddress: null, key, family, evidence: key ? [`label_match:${key}`] : [] });

Deno.test("subtotalGrupper: forældre-subtotal tælles ikke når resultatlinjen allerede stemmer; ukendt blad bevises af resultatlinjen", () => {
  const base = [
    rk("omsætning i alt", -1000, 1, "omsaetning", "revenue_like"),
    rk("lønninger i alt", 300, 2, "loenninger", "cost_like"),
    rk("pensioner i alt", 50, 3, "pensioner_sociale", "cost_like"),
    rk("personaleomkostninger i alt", 350, 4, null, null), // forælder
    rk("resultat før skat", -650, 9, "resultat_foer_skat", "profit_like"),
  ];
  const a = fordelSubtotaler(base, "credit", "last");
  assertEquals(a.kontrolsum.result, "PASS");
  assert(!a.kandidater.some((k) => k.key === "oevrige_omkostninger"), "forælderen må ikke blive øvrige");
  assertEquals(a.uafklarede.length, 1);
  // Nu mangler 100 (et ukendt blad)
  const b = fordelSubtotaler([...base.slice(0, 4), rk("konsulentydelser i alt", 100, 5, null, null), rk("resultat før skat", -550, 9, "resultat_foer_skat", "profit_like")], "credit", "last");
  assertEquals(b.kontrolsum.result, "PASS", b.kontrolsum.details);
  const oev = b.kandidater.find((k) => k.key === "oevrige_omkostninger")!;
  assertEquals(oev.rawValue, 100, "bladet der lukker gabet alene → øvrige");
  assert(oev.evidence.some((e) => e.startsWith("proven_by_result_line")));
  assertEquals(b.uafklarede.map((u) => u.label), ["personaleomkostninger i alt"]);
  // Og et gab ingen ukendt række lukker → SKIP med tallet
  const c = fordelSubtotaler([...base.slice(0, 4), rk("resultat før skat", -500, 9, "resultat_foer_skat", "profit_like")], "credit", "last");
  assertEquals(c.kontrolsum.result, "SKIP");
  assert(c.kontrolsum.details.includes("gap -150.00"), c.kontrolsum.details);
});

Deno.test("subtotalGrupper: kredit-netto gruppe → 0 + andre driftsindtægter (business-markeret); finansielle indtægter og øvrige lægges sammen", () => {
  const f = fordelSubtotaler([
    rk("omsætning i alt", 1000, 1, "omsaetning", "revenue_like"),
    rk("lokaleomkostninger i alt", 20, 2, "lokaleomkostninger", "cost_like"), // business: positiv omkostning = kredit
    rk("fremmed arbejde i alt", -30, 3, "oevrige_omkostninger", "cost_like"),
    rk("andre eksterne omkostninger i alt", -6, 4, "oevrige_omkostninger", "cost_like"),
    rk("renteindtægter i alt", 2, 5, "finansielle_indtaegter", "revenue_like"),
    rk("renteindtægter i alt", 3, 6, "finansielle_indtaegter", "revenue_like"),
    rk("resultat før skat", 989, 9, "resultat_foer_skat", "profit_like"),
  ], "business", "first");
  const lok = f.kandidater.find((k) => k.key === "lokaleomkostninger")!;
  assertEquals(lok.rawValue, 0);
  const andre = f.kandidater.find((k) => k.key === "andre_driftsindtaegter")!;
  assertEquals(andre.rawValue, 20); assertEquals(andre.signConvention, "business");
  assertEquals(f.kandidater.find((k) => k.key === "oevrige_omkostninger")!.rawValue, -36);
  assertEquals(f.kandidater.find((k) => k.key === "finansielle_indtaegter")!.rawValue, 5);
  assertEquals(f.kontrolsum.result, "PASS", f.kontrolsum.details);
});

// ═══════════════════════════ XLSX-P&L (kredit) ═══════════════════════════

Deno.test("XLSX P&L semantisk: fremmed arbejde + andre eksterne → other_costs, renteindtægter → financial_income, lokaler kredit-netto → other_operating_income, forælder ikke talt, pnl_coverage PASS", () => {
  const sem = dkEconomicResultatopgoerelseXlsxV1.extractSemanticFromXlsx!(byg(REST_XLSX_PNL_ROWS));
  assertExists(sem);
  assertEquals(sem!.sign_convention, "credit");
  const can = buildCanonicalFromSemantic(sem!);
  naer(can.metrics.revenue, 600000, "revenue");
  naer(can.metrics.cogs, 200000, "cogs");
  naer(can.metrics.other_costs, 36000, "other_costs = fremmed arbejde 30.000 + andre eksterne 6.000 (ikke forælderen 150.000)");
  naer(can.metrics.financial_income, 2500, "financial_income");
  naer(can.metrics.financial_costs, 1000, "financial_costs via «Renteudgifter i alt»");
  assertEquals(can.metrics.facility_costs, 0, "lokaler kredit-netto → 0");
  naer(can.metrics.other_operating_income, 15000, "other_operating_income");
  naer(can.metrics.ebt, 195500, "ebt = filens egen linje");
  const cov = sem!.parser_validation.checks.find((c) => c.name === "pnl_coverage");
  assertEquals(cov?.result, "PASS", JSON.stringify(cov));
  const fails = can.validation.canonical_checks.filter((c) => c.result === "FAIL").map((c) => `${c.name}: ${c.details}`);
  assertEquals(fails, [], "ingen FAIL i motoren");
});

Deno.test("XLSX P&L semantisk: en gruppe ingen matcher kender bevises af filens resultatlinje → other_costs", () => {
  const sem = dkEconomicResultatopgoerelseXlsxV1.extractSemanticFromXlsx!(byg(REST_XLSX_PNL_ROWS_UKENDT_GRUPPE));
  assertExists(sem);
  const can = buildCanonicalFromSemantic(sem!);
  naer(can.metrics.other_costs, 36000, "«Konsulentydelser i alt» 30.000 bevist af resultatlinjen + andre eksterne 6.000");
  naer(can.metrics.ebt, 195500, "ebt");
  const cov = sem!.parser_validation.checks.find((c) => c.name === "pnl_coverage");
  assertEquals(cov?.result, "PASS", JSON.stringify(cov));
  assert(cov!.details.includes("konsulentydelser i alt"), cov!.details);
});

// ═══════════════════════════ Combined (business) ═══════════════════════════

Deno.test("Combined semantisk (forretningsfortegn): underleverandører + andre eksterne → other_costs, finansielle indtægter → financial_income, lokaler kredit-netto → other_operating_income, balancen urørt", () => {
  const sem = dkCombinedBalancePnlV1.extractSemanticFromXlsx!(byg(REST_COMBINED_ROWS));
  assertExists(sem);
  assertEquals(sem!.sign_convention, "business");
  const can = buildCanonicalFromSemantic(sem!);
  naer(can.metrics.revenue, 600000, "revenue");
  naer(can.metrics.other_costs, 36000, "other_costs");
  naer(can.metrics.financial_income, 2500, "financial_income");
  naer(can.metrics.financial_costs, 1000, "financial_costs via «Finansielle omkostninger i alt»");
  assertEquals(can.metrics.facility_costs, 0);
  naer(can.metrics.other_operating_income, 15000, "other_operating_income");
  naer(can.metrics.ebt, 195500, "ebt");
  naer(can.metrics.assets_total, 300000, "aktiver");
  naer(can.metrics.equity_total, 150000, "egenkapital");
  const cov = sem!.parser_validation.checks.find((c) => c.name === "pnl_coverage");
  assertEquals(cov?.result, "PASS", JSON.stringify(cov));
  const fails = can.validation.canonical_checks.filter((c) => c.result === "FAIL").map((c) => `${c.name}: ${c.details}`);
  assertEquals(fails, [], "ingen FAIL i motoren (tjek 18 indsnævret til resultatlinjerne)");
  assertEquals(can.validation.canonical_checks.find((c) => c.name === "derived_sign_preserved")?.result, "PASS");
});

// ═══════════════════════════ Tjek 18 (derived_sign_preserved) — indsnævret til resultatlinjerne ═══════════════════════════

const spor = (id: string, konv: "credit" | "business", raw: number, norm: number) =>
  ({ source_field_id: id, sign_convention: konv, raw_value: raw, normalized_value: norm, rule_type: "family_default", action: "negate" });
const t18 = (r: ReturnType<typeof runExtendedValidation>) => r.canonical_checks.find((c) => c.name === "derived_sign_preserved")!;

Deno.test("tjek 18 (a): C's saldobalance med vendt resultat → FAIL som før — fejlen tjekket blev bygget til", () => {
  const semantic = {
    source_system: "economic", document_type: "saldobalance", template_id: "TEST_FLIP", sign_convention: "credit",
    normalization_profile_id: "combined_dk_credit_v1",
    company_name: "Test", cvr: null, period_start: null, period_end: null, report_period_label: "Marts 2026",
    metric_candidates: [
      { source_field_id: "omsaetning", normalization_family: "revenue_like", raw_value: -100000, raw_sign: "negative", sign_convention: "credit",
        source_label: "t", source_row_index: null, source_column_slot: null, source_cell_address: null, basis: "period", confidence: "HIGH", evidence: [], proposed_canonical_target: null },
      { source_field_id: "resultat_foer_skat", normalization_family: "profit_like", raw_value: -30000, raw_sign: "negative", sign_convention: "business",
        source_label: "derived", source_row_index: null, source_column_slot: null, source_cell_address: null, basis: "period", confidence: "LOW", evidence: [], proposed_canonical_target: "ebt" },
    ],
    line_items: [],
    basis_profile: { mode: "single", selected_period_basis: "period" },
    parser_validation: { parser_status: "PASS", checks: [] },
    _deterministic_meta: { template_id: "TEST_FLIP", parser_confidence: "HIGH", detection_score: 0, raw_line_count: 0, normalized_line_count: 2, column_basis_rule: "single" },
  } as any;
  const can = buildCanonicalFromSemantic(semantic);
  assertEquals(can.metrics.ebt, 30000, "profilen vendte underskuddet til overskud — det tjekket skal se");
  const t = can.validation.canonical_checks.find((c) => c.name === "derived_sign_preserved")!;
  assertEquals(t.result, "FAIL");
  assert(t.details.includes("resultat_foer_skat: -30000 → 30000"), t.details);
  assertEquals(can.validation.status, "FAIL");
});

Deno.test("tjek 18 (b): business-XLSX med normale omkostninger → PASS gennem XLSX-P&L og combined (fejlede før: −200.000 → 200.000 læst som vendt resultat)", () => {
  const semX = dkEconomicResultatopgoerelseXlsxV1.extractSemanticFromXlsx!(byg(REST_XLSX_PNL_ROWS_BUSINESS));
  assertExists(semX);
  assertEquals(semX!.sign_convention, "business");
  const canX = buildCanonicalFromSemantic(semX!);
  naer(canX.metrics.revenue, 600000, "revenue");
  naer(canX.metrics.payroll, 150000, "løn positiv (profilens ABS)");
  naer(canX.metrics.ebt, 195500, "ebt");
  const tX = canX.validation.canonical_checks.find((c) => c.name === "derived_sign_preserved")!;
  assertEquals(tX.result, "PASS", tX.details);
  assertEquals(canX.validation.canonical_checks.filter((c) => c.result === "FAIL").map((c) => c.name), [], "ingen FAIL");
  assertEquals(canX.validation.status, "PASS");
  assertEquals(canX.ai_eligible, true, "ai_eligible må ikke falde på en normal business-fil");
  const semC = dkCombinedBalancePnlV1.extractSemanticFromXlsx!(byg(REST_COMBINED_ROWS));
  const canC = buildCanonicalFromSemantic(semC!);
  assertEquals(canC.validation.canonical_checks.find((c) => c.name === "derived_sign_preserved")!.result, "PASS");
  assertEquals(canC.validation.status, "PASS");
});

Deno.test("tjek 18 (c): en business-fil hvor RESULTATET vendes → FAIL — for hver af de fire resultatlinjer; en vendt omkostning eller indtægt → ikke FAIL", () => {
  const m = { revenue: 100, ebt: 10 } as any;
  assertEquals([...AFLEDTE_RESULTATLINJER], ["resultat_foer_skat", "daekningsbidrag", "ebitda", "resultat_efter_skat"]);
  for (const id of AFLEDTE_RESULTATLINJER) {
    const r = runExtendedValidation({ key_figures: {} }, m, "period", "pnl", [], [spor("loenninger", "business", -150000, 150000), spor(id, "business", -5000, 5000)]);
    assertEquals(t18(r).result, "FAIL", id);
    assert(t18(r).details.includes(`${id}: -5000 → 5000`), t18(r).details);
    assert(!t18(r).details.includes("loenninger"), "omkostningen nævnes ikke — den er ikke dommens sag");
  }
  // Kun omkostninger/indtægter vendt (filens konvention business) → ingen resultatlinje at dømme → SKIP, aldrig FAIL
  const kun = runExtendedValidation({ key_figures: {} }, m, "period", "pnl", [], [spor("loenninger", "business", -150000, 150000), spor("andre_driftsindtaegter", "business", 15000, -15000)]);
  assertEquals(t18(kun).result, "SKIP");
  // Resultatlinje der beholder fortegnet + vendt omkostning → PASS
  const ok = runExtendedValidation({ key_figures: {} }, m, "period", "pnl", [], [spor("loenninger", "business", -150000, 150000), { ...spor("resultat_foer_skat", "business", -5000, -5000), action: "keep" }]);
  assertEquals(t18(ok).result, "PASS");
  // Kredit-markeret resultatlinje der vendes → ikke dømt (den SKAL vendes)
  const kredit = runExtendedValidation({ key_figures: {} }, m, "period", "pnl", [], [spor("resultat_foer_skat", "credit", 5000, -5000)]);
  assertEquals(t18(kredit).result, "SKIP");
});
