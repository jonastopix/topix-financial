/**
 * mamut_saldo_test.ts — DK_MAMUT_SALDO_XLSX_V1: Mamut/C5-saldolisten (ANLA GLAS' format, 17/9-2026).
 *
 * INGEN kundedata: fixturen er syntetisk (_test_fixtures/mamutSaldoSyntetisk.ts + mamut_saldo_syntetisk_v1.xlsx),
 * og de forventede tal regnes AF tabellen. Kørslen på ANLA's rigtige fil står i udkastets README.
 */

import { assert, assertEquals, assertAlmostEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dkMamutSaldoXlsxV1, fordelResultat, erMamutKolonner, saldoTekst, MAMUT_TEMPLATE_ID, MAMUT_PROFILE_ID, KONTROLSUM_TOLERANCE, type Konto } from "../_shared/templates/dkMamutSaldoXlsxV1.ts";
import { dkEconomicResultatopgoerelseXlsxV1 } from "../_shared/templates/dkEconomicResultatopgoerelseXlsxV1.ts";
import { dkEconomicSaldobalanceXlsxV1 } from "../_shared/templates/dkEconomicSaldobalanceXlsxV1.ts";
import { dkCombinedBalancePnlV1 } from "../_shared/templates/dkCombinedBalancePnlV1.ts";
import { detectTemplate } from "../_shared/templateRegistry.ts";
import { buildCanonicalFromSemantic } from "../_shared/canonicalEngine.ts";
import { getNormalizationProfile } from "../_shared/normalizationProfiles.ts";
import { detectSourceSystem, isAiAllowed } from "../_shared/sourceFingerprint.ts";
import { parseXlsxRawFromBase64, buildXlsxDetectionContext } from "../_shared/xlsxRawParser.ts";
import type { XlsxParseResult, XlsxRawCell, XlsxRawRow } from "../_shared/xlsxRawParser.ts";
import type { EnrichedProvenanceEntry } from "../_shared/semanticTypes.ts";
import { SYNTETISKE_KONTI, SYNTETISK_SALDO_TEKST, syntetiskeForventninger, syntetiskeRaekker } from "../_test_fixtures/mamutSaldoSyntetisk.ts";

const EPS = 0.01;
const prov = (canonical: { provenance: Record<string, unknown> }, key: string): EnrichedProvenanceEntry =>
  canonical.provenance[key] as unknown as EnrichedProvenanceEntry;

function celle(row: number, col: number, v: unknown): XlsxRawCell {
  return {
    sheet_name: "Ark1", cell_address: `${String.fromCharCode(65 + col)}${row + 1}`, row_index: row, col_index: col, raw_value: v,
    formatted_value: v == null ? null : String(v), value_type: typeof v === "number" ? "number" : v == null ? "null" : "string", has_formula: false,
  };
}
function afRaekker(raekker: unknown[][]): XlsxParseResult {
  const rows: XlsxRawRow[] = raekker.map((r, i) => ({ sheet_name: "Ark1", row_index: i, cells: r.map((v, c) => celle(i, c, v)).filter(c => c.raw_value != null) }));
  return { sheet_name: "Ark1", total_rows: rows.length, total_cols: 3, header_row_index: 1, rows, column_profile: [], raw_matrix: [] };
}
async function laesFixture(): Promise<XlsxParseResult> {
  const bytes = await Deno.readFile(new URL("../_test_fixtures/mamut_saldo_syntetisk_v1.xlsx", import.meta.url));
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return parseXlsxRawFromBase64(btoa(bin));
}
function koer(parsed: XlsxParseResult) {
  const semantic = dkMamutSaldoXlsxV1.extractSemanticFromXlsx(parsed);
  assertExists(semantic, "skabelonen afviste fixturen");
  return { semantic: semantic!, canonical: buildCanonicalFromSemantic(semantic!) };
}

// ══════════════════════════════════════════════════════════════════
// 1. Detektion: Mamut vinder, e-conomic-XLSX'en får 0 (værnet), ingen tvetydighed
// ══════════════════════════════════════════════════════════════════
Deno.test("mamut: detektion — 95 til Mamut, 0 til e-conomic-XLSX (værnet), 0 til combined og saldobalance; registret vælger Mamut", async () => {
  const parsed = await laesFixture();
  const ctx = buildXlsxDetectionContext(parsed, "2026-03.xlsx");
  assertEquals(dkMamutSaldoXlsxV1.detect(ctx), 95);
  assertEquals(dkEconomicResultatopgoerelseXlsxV1.detect(ctx), 0, "række 2 er konto 999 «Resultatopgørelse» — før vandt e-conomic med 85");
  assertEquals(dkEconomicSaldobalanceXlsxV1.detect(ctx), 0);
  assertEquals(dkCombinedBalancePnlV1.detect(ctx), 0);
  const match = detectTemplate(ctx);
  assertExists(match);
  assertEquals(match!.template.template_id, MAMUT_TEMPLATE_ID);
  assertEquals(match!.score, 95);
  // Fingerprintet: kendt kilde «mamut» → AI er forbudt
  const fp = detectSourceSystem("2026-03.xlsx", "xlsx", undefined, ctx.headerRows.slice(0, 10));
  assertEquals(fp.source_system, "mamut");
  assertEquals(fp.document_type, "combined");
  assertEquals(isAiAllowed(fp), false);
});

Deno.test("mamut: detektion — uden «Saldo:» i række 0 eller uden de tre kolonner er den ikke Mamut; e-conomic-værnet rammer kun de tre kolonner", () => {
  const raekker = syntetiskeRaekker();
  const udenSaldo = afRaekker([["Kontoudtog marts", null, null], ...raekker.slice(1)]);
  assertEquals(dkMamutSaldoXlsxV1.detect(buildXlsxDetectionContext(udenSaldo, "x.xlsx")), 0);
  const andreKolonner = afRaekker([raekker[0], ["Nr.", "Navn", "Beløb"], ...raekker.slice(2)]);
  assertEquals(dkMamutSaldoXlsxV1.detect(buildXlsxDetectionContext(andreKolonner, "x.xlsx")), 0);
  assert(erMamutKolonner(["Kontonummer", "Kontonavn", "Beløb"]));
  assert(erMamutKolonner([" kontonummer ", "KONTONAVN", "beløb", null]));
  assert(!erMamutKolonner(["Kontonummer", "Kontonavn"]));
  assert(!erMamutKolonner(["Nr.", "Navn", "Beløb"]));
  assertEquals(saldoTekst(["Saldo: december saldo 2025"]), "december saldo 2025");
  assertEquals(saldoTekst(["SALDO :  x"]), "x");
  assertEquals(saldoTekst(["Saldobalance for perioden"]), null);
  assertEquals(saldoTekst(undefined), null);
});

// ══════════════════════════════════════════════════════════════════
// 2. Den syntetiske xlsx gennem parser → skabelon → motor
// ══════════════════════════════════════════════════════════════════
Deno.test("mamut: syntetisk xlsx — grupperne fra sumkonto-navnene, øvrige, kredit-gruppe → indtægt, subtotalerne, kontrolsummen, fortegn og balance", async () => {
  const parsed = await laesFixture();
  const { semantic, canonical } = koer(parsed);
  const f = syntetiskeForventninger();
  const m = canonical.metrics;

  assertEquals(semantic.template_id, MAMUT_TEMPLATE_ID);
  assertEquals(semantic.source_system, "mamut");
  assertEquals(semantic.document_type, "combined");
  assertEquals(semantic.sign_convention, "business");
  assertEquals(semantic.normalization_profile_id, MAMUT_PROFILE_ID);
  assertExists(getNormalizationProfile(MAMUT_PROFILE_ID));
  // PERIODEN — som teksten står, intet afgjort:
  assertEquals(semantic.report_period_label, SYNTETISK_SALDO_TEKST);
  assertEquals(semantic.period_start, null);
  assertEquals(semantic.period_end, null);
  assertEquals(semantic.line_items.length, SYNTETISKE_KONTI.length, "én line item pr. konto — også sumkonti og balance");

  // Grupperne (forretningsformat: omkostninger negative → NEGATE → positive)
  assertAlmostEquals(m.revenue!, f.revenue, EPS);
  assertAlmostEquals(m.cogs!, f.cogs, EPS);
  assertAlmostEquals(m.payroll!, f.payroll, EPS);
  assertAlmostEquals(m.sales_costs!, f.sales_costs, EPS);
  assertAlmostEquals(m.vehicle_costs!, f.vehicle_costs, EPS);
  assertEquals(m.facility_costs, 0, "lokalegruppen er netto en kredit (+2.000) → 0");
  assertAlmostEquals(m.other_operating_income!, f.other_operating_income, EPS, "… og kreditten er andre driftsindtægter");
  assertAlmostEquals(m.admin_costs!, f.admin_costs, EPS);
  assertAlmostEquals(m.depreciation!, f.depreciation, EPS);
  assertAlmostEquals(m.financial_costs!, f.financial_costs, EPS);
  assertAlmostEquals(m.other_costs!, f.other_costs, EPS, "«Andre omk. I alt» (ukendt navn) → øvrige omkostninger");
  assertEquals(m.extraordinary_items, 0);

  // Subtotalerne som de står (KEEP): Dækningsbidrag 1 (ikke 2), ebitda, ebt, årets resultat (ikke «Skat af årets resultat»)
  assertAlmostEquals(m.gross_profit!, f.gross_profit, EPS);
  assertAlmostEquals(m.gross_profit!, 113000, EPS, "Dækningsbidrag 1 — IKKE Dækningsbidrag 2 (69.000)");
  assertAlmostEquals(m.ebitda!, f.ebitda, EPS);
  assertAlmostEquals(m.ebt!, f.ebt, EPS);
  assertAlmostEquals(m.net_result!, f.net_result, EPS);
  assertAlmostEquals(m.net_result!, 40200, EPS, "«Årets resultat» — ikke «Skat af årets resultat» (−11.000)");

  // Finansielle indtægter: kandidaten findes med eget fortegn; nøglen financial_income er vindue A's og
  // mappes først når den findes i SEMANTIC_TO_CANONICAL — indtil da springes den stille over.
  const fin = semantic.metric_candidates.find(c => c.source_field_id === "finansielle_indtaegter");
  assertExists(fin);
  assertEquals(fin!.raw_value, f.financial_income);
  assertEquals(fin!.normalization_family, "revenue_like");
  // (provenance er nøglet på canonical-nøglen; financial_income findes først med A's diff)
  const finProv = prov(canonical, "financial_income");
  if (finProv) assertEquals(finProv.normalized_value, f.financial_income, "KEEP — eget fortegn");
  assertEquals((canonical as any).kontrolsum?.udaekket, 0, "motorens kontrolsum (#973): omsætning − grupper + indtægter = resultat før skat");

  // Kontrolsummen: Σ detaljekonti før «Resultat før skat» = ebt (regnet af tabellen i testen)
  assertAlmostEquals(f.sumDetaljerFoerEbt, f.ebt, EPS);
  const coverage = semantic.parser_validation.checks.find(c => c.name === "pnl_coverage")!;
  assertEquals(coverage.result, "PASS", coverage.details);
  const sums = semantic.parser_validation.checks.find(c => c.name === "sum_rows_consistent")!;
  assertEquals(sums.result, "PASS", sums.details);
  assertEquals(semantic.parser_validation.parser_status, "PASS");

  // Balancen: aktiver positive, kredit → positive, kassekredit negativ
  assertAlmostEquals(m.assets_total!, f.assets_total, EPS);
  assertAlmostEquals(m.inventory!, f.inventory, EPS);
  assertAlmostEquals(m.receivables_total!, f.receivables_total, EPS);
  assertAlmostEquals(m.cash!, f.cash, EPS, "likvide midler −20.000: kassekredit beholder fortegn");
  assertAlmostEquals(m.equity_total!, f.equity_total, EPS, "egenkapital −119.200 (kredit) → +119.200");
  assertAlmostEquals(m.debt_total!, f.debt_total, EPS);
  assertAlmostEquals(m.liabilities_total!, f.liabilities_total, EPS);
  assertEquals(canonical.statement_type, "combined");

  // Provenance: omkostninger NEGATE, omsætning/subtotaler KEEP, egenkapital NEGATE — ingen abs
  assertEquals(prov(canonical, "revenue").normalization_action, "keep");
  assertEquals(prov(canonical, "cogs").normalization_action, "negate");
  assertEquals(prov(canonical, "ebt").normalization_action, "keep");
  assertEquals(prov(canonical, "equity_total").normalization_action, "negate");
  assertEquals(prov(canonical, "cash").normalization_action, "keep");
  assert(!Object.values(canonical.provenance).some((p: any) => p.normalization_action === "abs"), "ingen abs — fortegnet er tallet");
  // Kandidaternes mærkning (tjek 17): det der NEGATE'res er «credit», det der KEEP'es er «business» — og tjek 17 består.
  const konv = (id: string) => semantic.metric_candidates.find(c => c.source_field_id === id)!.sign_convention;
  assertEquals(konv("omsaetning"), "business");
  assertEquals(konv("direkte_omkostninger"), "credit");
  assertEquals(konv("oevrige_omkostninger"), "credit");
  assertEquals(konv("resultat_foer_skat"), "business");
  assertEquals(konv("egenkapital"), "credit");
  assertEquals(konv("gaeld_i_alt"), "credit");
  assertEquals(konv("aktiver_i_alt"), "business");
  assertEquals(konv("likvider"), "business");
  const tjek17 = canonical.validation.canonical_checks.find(c => c.name === "derived_sign_preserved");
  if (tjek17) assertEquals(tjek17.result, "PASS", tjek17.details);
  assertEquals(canonical.validation.status, "PASS", canonical.validation.canonical_checks.filter(c => c.result !== "PASS" && c.result !== "SKIP").map(c => `${c.name}: ${c.details}`).join(" | "));
});

// ══════════════════════════════════════════════════════════════════
// 3. Fortegn: et underskud bliver et underskud; ANLA-formen (negativ finansiel indtægt) bærer sit fortegn
// ══════════════════════════════════════════════════════════════════
Deno.test("mamut: underskud beholdes negativt, og en negativ «finansiel indtægt» (ANLA) er en finansiel omkostning — kontrolsummen (#973) i nul", () => {
  const raekker: unknown[][] = [
    ["Saldo: december saldo 2025"], ["Kontonummer", "Kontonavn", "Beløb"],
    [999, "Resultatopgørelse", 0], [1010, "Salg", 100000], [1499, "Omsætning I alt", 100000],
    [2010, "Varekøb", -60000], [2699, "Variable omkostninger I alt", -60000], [2700, "Dækningsbidrag 1", 40000],
    [3010, "Løn", -50000], [3998, "Løn I alt", -50000], [3999, "Dækningsbidrag 2", -10000],
    [4399, "Resultat før afskrivninger", -10000],
    [4610, "Kursregulering", -7000], [4699, "Finansielle indtægter I alt", -7000],
    [4710, "Renter", -3000], [4799, "Finansielle udgifter I alt", -3000],
    [4940, "Resultat før skat", -20000], [4999, "Årets resultat", -20000],
    [5000, "Balance", 0], [6910, "Bank", -5000], [6950, "Likvide midler I alt", -5000], [6999, "Aktiver I alt", -5000],
    [7494, "Egenkapital i alt", 5000], [8999, "Passiver I alt", 5000],
  ];
  const { semantic, canonical } = koer(afRaekker(raekker));
  assertAlmostEquals(canonical.metrics.ebt!, -20000, EPS, "underskud er negativt — ingen abs");
  assertAlmostEquals(canonical.metrics.net_result!, -20000, EPS);
  assertAlmostEquals(canonical.metrics.payroll!, 50000, EPS);
  // 17/9 (aften): en NEGATIV «finansiel indtægt» er en udgift → finansieringsudgifter (−3.000 + −7.000), ingen indtægtskandidat.
  // Før blev den udstedt med eget fortegn, og motorens kontrolsum lagde |−7.000| TIL → udaekket −14.000 (ANLA: −146.829).
  assertEquals(semantic.metric_candidates.find(c => c.source_field_id === "finansielle_indtaegter"), undefined, "ingen finansiel indtægt — gruppen er en udgift");
  const finOmk = semantic.metric_candidates.find(c => c.source_field_id === "finansieringsudgifter")!;
  assertEquals(finOmk.raw_value, -10000, "finansielle udgifter −3.000 + negativ «indtægt» −7.000");
  assertAlmostEquals(canonical.metrics.financial_costs!, 10000, EPS);
  assertEquals(canonical.metrics.financial_income ?? null, null);
  assertEquals(semantic.parser_validation.checks.find(c => c.name === "pnl_coverage")!.result, "PASS");
  assertEquals((canonical as any).kontrolsum?.udaekket, 0, "motorens kontrolsum (#973) går i nul: −20.000 = 100.000 − 60.000 − 50.000 − 10.000");
  assertAlmostEquals(canonical.metrics.equity_total!, -5000, EPS, "negativ egenkapital (debet) → −5.000 efter NEGATE");
});

// ══════════════════════════════════════════════════════════════════
// 4. fordelResultat — ren funktion
// ══════════════════════════════════════════════════════════════════
Deno.test("mamut: fordelResultat — grupper lukkes af «I alt», subtotaler lukker intet, konti efter ebt holdes ude, hængende → øvrige, inkonsistente sumkonti fanges", () => {
  const k = (nr: number, navn: string, beloeb: number): Konto => ({ nr, navn, beloeb, raekke: nr });
  const f = fordelResultat([
    k(999, "Resultatopgørelse", 0), k(1010, "Salg", 100), k(1499, "Omsætning I alt", 100),
    k(2010, "Varekøb", -40), k(2699, "Variable omkostninger I alt", -40), k(2700, "Dækningsbidrag 1", 60),
    k(4900, "Løst gebyr", -5), // hængende: ingen «I alt» før resultat før skat
    k(4940, "Resultat før skat", 55),
    k(4950, "Skat af årets resultat", -10), k(4998, "Skatter i alt", -10), k(4999, "Årets resultat", 45),
    k(5000, "Balance", 0), k(6999, "Aktiver I alt", 1),
  ]);
  assertEquals(f.grupper.map(g => [g.nr, g.key, g.sum, g.regnet]), [[1499, "omsaetning", 100, 100], [2699, "direkte_omkostninger", -40, -40], [4998, null, -10, -10]]);
  assertEquals(f.subtotaler, { daekningsbidrag: 60, resultat_foer_skat: 55, arets_resultat: 45 });
  assertEquals(f.ebtNr, 4940);
  assertEquals(f.haengende.map(x => x.nr), [4900]);
  assertAlmostEquals(f.sumFoerEbt, 55, EPS, "konto 999 (0) og 4900 (−5) tæller med; skat efter ebt gør ikke");
  assertEquals(f.inkonsistente, []);
  const skaev = fordelResultat([k(1010, "Salg", 100), k(1499, "Omsætning I alt", 90)]);
  assertEquals(skaev.inkonsistente.map(g => g.nr), [1499]);
  assert(KONTROLSUM_TOLERANCE === 1);
});

Deno.test("mamut: kontrolsummen fælder når en detaljekonto mangler mod «Resultat før skat»", () => {
  const raekker: unknown[][] = [
    ["Saldo: x"], ["Kontonummer", "Kontonavn", "Beløb"],
    [1010, "Salg", 100000], [1499, "Omsætning I alt", 100000], [2010, "Varekøb", -60000], [2699, "Variable omkostninger I alt", -60000],
    [2700, "Dækningsbidrag 1", 40000], [4940, "Resultat før skat", 35000], [4999, "Årets resultat", 35000], [5000, "Balance", 0], [6999, "Aktiver I alt", 1],
  ];
  const { semantic } = koer(afRaekker(raekker));
  const coverage = semantic.parser_validation.checks.find(c => c.name === "pnl_coverage")!;
  assertEquals(coverage.result, "FAIL");
  assert(coverage.details.includes("diff 5000.00"), coverage.details);
  assertEquals(semantic.parser_validation.parser_status, "FAIL");
});
