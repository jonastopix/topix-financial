/**
 * saldobalance_fortegn_test.ts — e-conomics saldobalance-XLSX: resultatet er saldobalancens
 * egen sandhed (17/9-2026, recon-saldobalance-fortegn.md; Jonas: «den bedste løsning for det hele»).
 *
 * FORUDSÆTTER D (tjek 14–16 i runExtendedValidation; merged c055078a). Tjek 17 er
 * derived_sign_preserved.
 *
 * INGEN kundedata her: fixturen er syntetisk (_test_fixtures/saldobalanceSyntetisk.ts +
 * saldobalance_syntetisk_v1.xlsx), og de forventede tal regnes AF tabellen. Kørslen på de to
 * rigtige filer står i udkastets README (2025-10 → ebt +150.932,87; 2026-01 → +25.873,21).
 */

import { assert, assertEquals, assertAlmostEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dkEconomicSaldobalanceXlsxV1, fordelResultatkonti, KONTROLSUM_TOLERANCE } from "../_shared/templates/dkEconomicSaldobalanceXlsxV1.ts";
import { buildCanonicalFromSemantic, runExtendedValidation } from "../_shared/canonicalEngine.ts";
import { getNormalizationProfile } from "../_shared/normalizationProfiles.ts";
import { parseXlsxRawFromBase64 } from "../_shared/xlsxRawParser.ts";
import type { XlsxParseResult, XlsxRawCell, XlsxRawRow } from "../_shared/xlsxRawParser.ts";
import type { SemanticExtractionResult, EnrichedProvenanceEntry } from "../_shared/semanticTypes.ts";
import { SYNTETISKE_KONTI, syntetiskeForventninger, syntetiskeRaekker } from "../_test_fixtures/saldobalanceSyntetisk.ts";

const EPS = 0.01;
const prov = (canonical: { provenance: Record<string, unknown> }, key: string): EnrichedProvenanceEntry =>
  canonical.provenance[key] as unknown as EnrichedProvenanceEntry;
const tjek = (canonical: { validation: { canonical_checks: { name: string; result: string; details: string }[] } }, navn: string) =>
  canonical.validation.canonical_checks.find(c => c.name === navn)!;

// ── Fixture-bygger i xlsxRawParsers form (til de små, håndlavede tilfælde) ──
function celle(row: number, col: number, v: unknown): XlsxRawCell {
  return {
    sheet_name: "Sheet1", cell_address: `${String.fromCharCode(65 + col)}${row + 1}`, row_index: row, col_index: col, raw_value: v,
    formatted_value: v == null ? null : String(v), value_type: typeof v === "number" ? "number" : v == null ? "null" : "string", has_formula: false,
  };
}
function afRaekker(raekker: unknown[][]): XlsxParseResult {
  const rows: XlsxRawRow[] = raekker.map((r, i) => ({ sheet_name: "Sheet1", row_index: i, cells: r.map((v, c) => celle(i, c, v)).filter(c => c.raw_value != null) }));
  return { sheet_name: "Sheet1", total_rows: rows.length, total_cols: 7, header_row_index: 5, rows, column_profile: [], raw_matrix: [] };
}
type Linje = [nr: number, navn: string, periode: number, aatd?: number];
function saldobalance(linjer: Linje[], periode = "01.03.26 - 31.03.26"): XlsxParseResult {
  return afRaekker([
    [], ["9999999 - Testhuset ApS - CVR 12345678"], ["Rapporter > Regnskab >"], [`Saldobalance for perioden ${periode}`],
    ["", null, "Perioden", null, "År til dato"],
    ["Nr.", "Navn", `Indeværende år${periode}`, "Året før", "Indeværende år ÅTD", "Året før ÅTD", "Note"],
    ...linjer.map(([nr, navn, c, e]) => [nr, navn, c, null, e === undefined ? c : e, null, ""]),
  ]);
}
function koer(parsed: XlsxParseResult) {
  const semantic = dkEconomicSaldobalanceXlsxV1.extractSemanticFromXlsx(parsed);
  assertExists(semantic, "skabelonen afviste fixturen");
  return { semantic: semantic!, canonical: buildCanonicalFromSemantic(semantic!) };
}

// ══════════════════════════════════════════════════════════════════
// 1. Den syntetiske XLSX-fil gennem xlsxRawParser → skabelon → motor
// ══════════════════════════════════════════════════════════════════
Deno.test("saldobalance: syntetisk xlsx — ebt = −Σ(1000–4999), kontrolsum, afskrivninger uden balance, andre driftsindtægter, øvrige", async () => {
  const bytes = await Deno.readFile(new URL("../_test_fixtures/saldobalance_syntetisk_v1.xlsx", import.meta.url));
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  const parsed = parseXlsxRawFromBase64(btoa(bin));
  const { semantic, canonical } = koer(parsed);
  const m = canonical.metrics;
  const f = syntetiskeForventninger();
  assertEquals(semantic.report_period_label, "Marts 2026", "header-rækkerne læses fra række 1–6 (området begynder i A1)");
  assertEquals(semantic.company_name, "Testhuset ApS");

  // Resultatet er saldobalancens egen sandhed: −Σ Perioden over alle resultatkonti (regnet af tabellen i testen, ikke skrevet af).
  const minusSum = -SYNTETISKE_KONTI.filter(([nr]) => nr >= 1000 && nr <= 4999).reduce((s, [, , c]) => s + c, 0);
  assertAlmostEquals(m.ebt!, minusSum, EPS);
  assertAlmostEquals(m.ebt!, f.ebt, EPS);
  assertAlmostEquals(m.ebt!, 96300, EPS, "regnet i hånden af tabellen: 198.500 − 117.700 + 15.500");

  // Grupperne: positiv del; kredit-netto (lokaler: lejeindtægt 30.000 > 14.500 udgifter) → 0 og indtægt 15.500
  assertAlmostEquals(m.revenue!, f.revenue, EPS);
  assertAlmostEquals(m.cogs!, f.cogs, EPS, "vareforbrug netto 60.000 − 5.000 lagerregulering");
  assertAlmostEquals(m.gross_profit!, f.gross_profit, EPS);
  assertAlmostEquals(m.payroll!, f.payroll, EPS);
  assertAlmostEquals(m.sales_costs!, f.sales_costs, EPS);
  assertEquals(m.facility_costs, 0, "lokalegruppen er netto en indtægt → omkostningen er 0");
  assertAlmostEquals(m.other_operating_income!, f.other_operating_income, EPS);
  assertAlmostEquals(m.other_operating_income!, 15500, EPS);
  assertAlmostEquals(m.admin_costs!, f.admin_costs, EPS);
  assertAlmostEquals(m.other_costs!, f.other_costs, EPS, "2770 + 3131 − 4210 = 3.000 + 700 − 100");
  assertAlmostEquals(m.other_costs!, 3600, EPS);
  assertAlmostEquals(m.financial_costs!, 900, EPS);

  // Afskrivninger: 5111 (120.000) og 5116 (−30.000) er BALANCE — tæller ikke; ingen resultatinterval → 0
  assertEquals(m.depreciation, 0);
  assertAlmostEquals(m.ebitda!, f.ebitda, EPS);
  assertAlmostEquals(m.ebit!, f.ebitda, EPS);
  assertAlmostEquals(m.ebt!, m.ebit! - m.financial_costs!, EPS, "ebt = ebit − finans, fordi alt er dækket");

  // Balancen som før (ÅTD-kolonnen)
  assertAlmostEquals(m.cash!, 80000, EPS);
  assertAlmostEquals(m.trade_receivables!, 45000, EPS);
  assertAlmostEquals(m.equity_total!, 150000, EPS);

  // Kontrolsummen (parser-tjek) og motorens tjek
  const coverage = semantic.parser_validation.checks.find(c => c.name === "pnl_coverage")!;
  assertEquals(coverage.result, "PASS", coverage.details);
  assert(coverage.details.includes(`All ${f.pnlKonti} P&L accounts assigned`), coverage.details);
  assertEquals(tjek(canonical, "gross_profit_sum").result, "PASS");
  assertEquals(tjek(canonical, "ebit_calculation").result, "PASS");
  assertEquals(tjek(canonical, "ebt_reconciles").result, "PASS", tjek(canonical, "ebt_reconciles").details);
  assertEquals(tjek(canonical, "derived_sign_preserved").result, "PASS");
  assertEquals(canonical.validation.status, "PASS");
  assertEquals(canonical.validation.canonical_checks.length, 17);
  assertEquals(canonical.validation.canonical_checks.slice(13).map(c => c.name), ["ebt_reconciles", "result_vs_revenue", "magnitude_plausibility", "derived_sign_preserved"]);

  // Provenance: resultatet er keep (var abs), indtægten er negate af en kredit-kandidat
  assertEquals(prov(canonical, "ebt").normalization_action, "keep");
  assertEquals(prov(canonical, "ebt").normalization_rule_type, "field_override");
  assertEquals(prov(canonical, "other_operating_income").normalization_action, "negate");
  assertEquals(canonical.correction_log.filter(e => e.rule === "field_override_abs").length, 0);
});

// ══════════════════════════════════════════════════════════════════
// 2. Et underskud beholdes negativt — og kontrolsummen holder også der
// ══════════════════════════════════════════════════════════════════
Deno.test("saldobalance: underskud → ebt negativt (før: +), øvrige og indtægt i regnestykket", () => {
  const { semantic, canonical } = koer(saldobalance([
    [1010, "Salg", -100000],
    [1310, "Vareforbrug", 60000],
    [2210, "Løn", 80000],
    [2770, "Rejser", 2500],
    [3401, "Lejeindtægt", -4000],
    [3410, "Husleje", 1000],
    [3610, "Kontor", 20000],
    [5810, "Bank", 0, 5000],
    [6110, "Egenkapital", 0, 1000],
  ]));
  // −Σ = −(−100000 + 60000 + 80000 + 2500 − 4000 + 1000 + 20000) = −59.500
  assertEquals(semantic.metric_candidates.find(c => c.source_field_id === "resultat_foer_skat")!.raw_value, -59500);
  assertEquals(canonical.metrics.ebt, -59500);
  assertEquals(canonical.metrics.facility_costs, 0);
  assertEquals(canonical.metrics.other_operating_income, 3000);
  assertEquals(canonical.metrics.other_costs, 2500);
  assertEquals(canonical.metrics.ebitda, 40000 - (80000 + 2500 + 0 + 20000) + 3000);
  assertEquals(canonical.metrics.ebt, canonical.metrics.ebit, "uden finans og afskrivninger er ebt = ebit");
  assertEquals(semantic.parser_validation.checks.find(c => c.name === "pnl_coverage")!.result, "PASS");
  assertEquals(tjek(canonical, "ebt_reconciles").result, "PASS");
  assertEquals(tjek(canonical, "derived_sign_preserved").result, "PASS");
});

// ══════════════════════════════════════════════════════════════════
// 3. Fordelingen som ren funktion — grænser, positiv del, indtægt, kontrolsum
// ══════════════════════════════════════════════════════════════════
Deno.test("fordelResultatkonti: hver konto i præcis én gruppe; 5000+ ignoreres; afvigelsen er 0", () => {
  const f = fordelResultatkonti([
    { nr: 1000, navn: "første", periode: -1000 },
    { nr: 1299, navn: "sidste omsætning", periode: -500 },
    { nr: 1300, navn: "første cogs", periode: 200 },
    { nr: 2199, navn: "øvrig (før løn)", periode: 50 },
    { nr: 2200, navn: "løn", periode: 300 },
    { nr: 3599, navn: "lokaler sidste", periode: -900 },
    { nr: 4499, navn: "finans sidste", periode: 10 },
    { nr: 4999, navn: "sidste resultatkonto", periode: 40 },
    { nr: 5000, navn: "balance", periode: 99999 },
  ]);
  assertEquals(f.netto.omsaetning, -1500);
  assertEquals(f.revenue, 1500);
  assertEquals(f.konti.oevrige_omkostninger, [2199, 4999]);
  assertEquals(f.omkostninger.oevrige_omkostninger, 90);
  assertEquals(f.omkostninger.lokaleomkostninger, 0);
  assertEquals(f.andreDriftsindtaegter, 900);
  assertEquals(f.ebt, -(-1000 - 500 + 200 + 50 + 300 - 900 + 10 + 40));
  assertEquals(f.udenGruppe, []);
  assert(Math.abs(f.afvigelse) <= KONTROLSUM_TOLERANCE);
  assert(Math.abs(f.afvigelse) < 1e-9);
});

Deno.test("fordelResultatkonti: to kredit-grupper lægges sammen i indtægten; en gruppe der netto er 0 er omkostning 0", () => {
  const f = fordelResultatkonti([
    { nr: 1010, navn: "salg", periode: -10 },
    { nr: 3401, navn: "leje", periode: -30 },
    { nr: 4210, navn: "renteindtægt (øvrig)", periode: -5 },
    { nr: 2210, navn: "løn", periode: 7 },
    { nr: 2220, navn: "refusion", periode: -7 },
  ]);
  assertEquals(f.andreDriftsindtaegter, 35);
  assertEquals(f.omkostninger.loenninger, 0);
  assertEquals(f.omkostninger.lokaleomkostninger, 0);
  assertEquals(f.omkostninger.oevrige_omkostninger, 0);
  assertEquals(f.ebt, 45);
  assert(Math.abs(f.afvigelse) < 1e-9);
});

// ══════════════════════════════════════════════════════════════════
// 4. Afskrivninger: balancens 51xx/52xx tæller aldrig — også når de har tal i periodekolonnen
// ══════════════════════════════════════════════════════════════════
Deno.test("saldobalance: 5100–5200 med tal er balance — depreciation 0, ebt uændret", () => {
  const { canonical } = koer(saldobalance([
    [1010, "Salg", -50000],
    [1310, "Vareforbrug", 10000],
    [5111, "Indretning, anskaffelse primo", 372000, 372000],
    [5116, "Indretning, afskrivning primo", -57000, -57000],
    [5810, "Bank", 0, 5000],
  ]));
  assertEquals(canonical.metrics.depreciation, 0);
  assertEquals(canonical.metrics.ebt, 40000);
  // Uden en eneste driftspost afleder motoren ikke ebitda/ebit (opex-gaten står) — ebt er stadig saldobalancens.
  assertEquals(canonical.metrics.ebitda, null);
});

// ══════════════════════════════════════════════════════════════════
// 5. Tjek 17 fælder når en forretningskonventions-kandidat vendes af en profil
// ══════════════════════════════════════════════════════════════════
Deno.test("derived_sign_preserved: en business-kandidat der skifter fortegn under normalisering → FAIL med reglens navn", () => {
  const semantic: SemanticExtractionResult = {
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
  };
  const canonical = buildCanonicalFromSemantic(semantic);
  assertEquals(canonical.metrics.ebt, 30000, "profilen vendte tallet — det er det tjekket skal se");
  const t17 = tjek(canonical, "derived_sign_preserved");
  assertEquals(t17.result, "FAIL");
  assert(t17.details.includes("resultat_foer_skat: -30000 → 30000 via family_default/negate"), t17.details);
  assertEquals(canonical.validation.status, "FAIL");
  const direkte = runExtendedValidation({ key_figures: {} }, canonical.metrics, "period", "trial_balance", [], [
    { source_field_id: "resultat_foer_skat", sign_convention: "business", raw_value: -30000, normalized_value: 30000, rule_type: "family_default", action: "negate" },
  ]);
  assert(direkte.errors.some(e => e.startsWith("Derived sign flipped by normalization: resultat_foer_skat: -30000 → 30000 via family_default/negate")), direkte.errors.join(" | "));
});

Deno.test("derived_sign_preserved: uden fortegnsspor (den gamle vej) → SKIP; kun kredit-kandidater → SKIP", () => {
  const tom = { revenue: 100, ebt: 10 } as any;
  assertEquals(runExtendedValidation({ key_figures: {} }, tom, "period", "pnl", []).canonical_checks.find(c => c.name === "derived_sign_preserved")!.result, "SKIP");
  assertEquals(runExtendedValidation({ key_figures: {} }, tom, "period", "pnl", [], [
    { source_field_id: "omsaetning", sign_convention: "credit", raw_value: -100, normalized_value: 100, rule_type: "family_default", action: "abs" },
  ]).canonical_checks.find(c => c.name === "derived_sign_preserved")!.result, "SKIP");
});

// ══════════════════════════════════════════════════════════════════
// 6. Profilen
// ══════════════════════════════════════════════════════════════════
Deno.test("profil economic_saldobalance_credit_v1: afledte resultatlinjer keep, revenue_like negate, cost_like abs (grupperne er allerede positive)", () => {
  const p = getNormalizationProfile("economic_saldobalance_credit_v1")!;
  for (const id of ["daekningsbidrag", "resultat_foer_skat", "ebitda", "resultat_efter_skat"]) {
    assertEquals(p.field_overrides[id]?.action, "keep", `${id} skal være keep`);
  }
  assertEquals(p.family_defaults.revenue_like.action, "negate");
  assertEquals(p.family_defaults.cost_like.action, "abs");
  assertEquals(p.family_defaults.profit_like.action, "negate");
});

// En omsætningsgruppe der netto er DEBET bliver negativ omsætning og fældes af anker-tjekket — ikke skjult af abs.
Deno.test("saldobalance: omsætningsgruppen netto debet → revenue negativ → suspicious_sign_pattern FAIL (ikke skjult)", () => {
  const { canonical } = koer(saldobalance([
    [1010, "Salg", -1000],
    [1210, "Kreditnotaer", 5000],
    [1310, "Vareforbrug", 100],
    [5810, "Bank", 0, 5000],
    [6110, "Egenkapital", 0, 1000],
  ]));
  assertEquals(canonical.metrics.revenue, -4000);
  assertEquals(tjek(canonical, "suspicious_sign_pattern").result, "FAIL");
  assertEquals(canonical.metrics.ebt, -(-1000 + 5000 + 100));
});
