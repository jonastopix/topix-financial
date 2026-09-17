/**
 * saldobalance_kolonner_test.ts — kolonnerne findes af filens egen overskrift (17/9-2026).
 *
 * Målt i Jonas' filer 17/9 21:15: Brick Works' saldobalance har FIRE kolonner («Nr.» · «Navn» ·
 * «Perioden» · «År til dato», balancen i D), Fjeldgaardshops SEKS (gruppe-række «Perioden»/«År til dato»
 * over «Indeværende år…»/«Året før…»). De faste VALUE_COL = 2 / YTD_COL = 4 læste Brick Works' balance
 * som tom. Fixtures er SYNTETISKE (saldobalanceSyntetisk.ts) i BEGGE former — samme tal, samme forventning.
 *
 * Kør: deno test --node-modules-dir=none --allow-read --allow-env --allow-net supabase/functions/extract-financial-data/saldobalance_kolonner_test.ts
 */
import { assert, assertAlmostEquals, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dkEconomicSaldobalanceXlsxV1, FAST_VALUE_COL, FAST_YTD_COL, findKolonner, findOverskriftsRaekke } from "../_shared/templates/dkEconomicSaldobalanceXlsxV1.ts";
import { buildCanonicalFromSemantic } from "../_shared/canonicalEngine.ts";
import type { XlsxParseResult, XlsxRawCell, XlsxRawRow } from "../_shared/xlsxRawParser.ts";
import { syntetiskeBalanceForventninger, syntetiskeForventninger, syntetiskeRaekker, syntetiskeRaekkerFireKolonner } from "../_test_fixtures/saldobalanceSyntetisk.ts";

const EPS = 0.01;
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
function koer(raekker: unknown[][]) {
  const semantic = dkEconomicSaldobalanceXlsxV1.extractSemanticFromXlsx(afRaekker(raekker));
  assertExists(semantic, "skabelonen afviste fixturen");
  const canonical = buildCanonicalFromSemantic(semantic!);
  const tjek = (navn: string) => semantic!.parser_validation.checks.find(c => c.name === navn)!;
  return { semantic: semantic!, canonical, tjek };
}

Deno.test("findKolonner: seks kolonner (Fjeldgaardshop-formen) → periode 2, ÅTD 4; «Året før» springes over", () => {
  const k = findKolonner(syntetiskeRaekker());
  assertEquals([k.headerRowIndex, k.valueCol, k.ytdCol, k.metode], [5, 2, 4, "overskrift"]);
});
Deno.test("findKolonner: fire kolonner (Brick Works-formen) → periode 2, ÅTD 3 — ikke 4", () => {
  const k = findKolonner(syntetiskeRaekkerFireKolonner());
  assertEquals([k.headerRowIndex, k.valueCol, k.ytdCol, k.metode], [5, 2, 3, "overskrift"]);
});
Deno.test("findKolonner: overskriften på en anden række, og «Året før» FØR «Perioden»", () => {
  const r = [[], ["9999999 - X ApS - CVR 12345678"], ["Saldobalance for perioden 01.03.26 - 31.03.26"], ["", null, "Perioden", null, null, "År til dato"], ["Nr.", "Navn", "Året før", "Indeværende år", "", "Året før", "Indeværende år"]];
  const k = findKolonner(r);
  assertEquals([k.headerRowIndex, k.valueCol, k.ytdCol], [4, 3, 6]);
});
Deno.test("findKolonner: ukendt overskrift → de gamle faste indeks som sidste udvej, sagt i evidence", () => {
  const k = findKolonner([[], [], [], [], [], ["Nr.", "Navn", "Kolonne A", "Kolonne B"]]);
  assertEquals([k.valueCol, k.ytdCol, k.metode], [FAST_VALUE_COL, FAST_YTD_COL, "fast_indeks"]);
  assert(k.evidence[0].startsWith("fallback_fixed_columns:"));
  assertEquals(findOverskriftsRaekke([["a"], ["b"]]), -1);
});

Deno.test("begge former giver SAMME resultat og SAMME balance — og balancen er ikke tom", () => {
  const seks = koer(syntetiskeRaekker());
  const fire = koer(syntetiskeRaekkerFireKolonner());
  const f = syntetiskeForventninger();
  const b = syntetiskeBalanceForventninger();
  for (const form of [seks, fire]) {
    assertAlmostEquals(form.canonical.metrics.ebt!, f.ebt, EPS);
    assertAlmostEquals(form.canonical.metrics.revenue!, f.revenue, EPS);
    assertAlmostEquals(form.canonical.metrics.cash!, b.cash, EPS);
    assertAlmostEquals(form.canonical.metrics.trade_receivables!, b.trade_receivables, EPS);
    assertAlmostEquals(form.canonical.metrics.assets_total!, b.assets_total, EPS);
    assertEquals(form.tjek("balance_present").result, "PASS");
    assertEquals(form.tjek("balance_values_present").result, "PASS");
    assertEquals(form.tjek("balance_values_present").details, `${b.balanceKontiMedBeloeb} of ${b.balanceKonti} balance accounts carry a value in ytd col ${form === seks ? 4 : 3}`);
    assertEquals(form.tjek("pnl_coverage").result, "PASS");
    assertEquals(form.semantic.parser_validation.parser_status, "PASS");
  }
  assertEquals(seks.canonical.metrics, fire.canonical.metrics);
  assert(seks.tjek("column_detection").details.startsWith("Columns from header: period col 2, ytd col 4"));
  assert(fire.tjek("column_detection").details.startsWith("Columns from header: period col 2, ytd col 3"));
});

Deno.test("den fejl vi så: fire kolonner læst med faste indeks (ukendt overskrift) → balancen tom → balance_values_present FAIL, parser FAIL", () => {
  // Overskriften kan ikke genkendes → fallback 2/4; balancen står i kolonne 3 → ingen balancekonto får et beløb.
  const r = syntetiskeRaekkerFireKolonner();
  r[5] = ["Nr.", "Navn", "Beløb 1", "Beløb 2"];
  const { semantic, tjek } = koer(r);
  assertEquals(tjek("column_detection").details.startsWith("FALLBACK fixed columns"), true);
  assertEquals(tjek("balance_values_present").result, "FAIL");
  assert(tjek("balance_values_present").details.includes("NONE carry a value in ytd col 4"));
  assertEquals(semantic.parser_validation.parser_status, "FAIL");
  // Resultatet er stadig rigtigt — det var det Brick Works oplevede 17/9.
  assertAlmostEquals(buildCanonicalFromSemantic(semantic).metrics.ebt!, syntetiskeForventninger().ebt, EPS);
});

Deno.test("balance_values_present: SKIP uden balancekonti i filen", () => {
  const kunPnl = syntetiskeRaekker().filter((r, i) => i < 6 || (typeof r[0] === "number" && (r[0] as number) < 5000));
  const { tjek } = koer(kunPnl);
  assertEquals(tjek("balance_values_present").result, "SKIP");
});
