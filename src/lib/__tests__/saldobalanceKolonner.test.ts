import { describe, expect, it } from "vitest";
import { buildCanonicalFromSemantic } from "../../../supabase/functions/_shared/canonicalEngine.ts";
import type { SemanticExtractionResult } from "../../../supabase/functions/_shared/semanticTypes.ts";
import { syntetiskeBalanceForventninger, syntetiskeForventninger, syntetiskeRaekker, syntetiskeRaekkerFireKolonner } from "../../../supabase/functions/_test_fixtures/saldobalanceSyntetisk.ts";

/*
 * Saldobalance-XLSX finder kolonnerne selv (17/9-2026). Samme prøver som Deno-testen
 * saldobalance_kolonner_test.ts, kørt i CI (bun run test): fire kolonner (Brick Works-formen)
 * og seks (Fjeldgaardshop-formen) skal give samme resultat OG samme balance. Fixtures syntetiske.
 * Skabelonen hentes med variabel sti (typeimporten af templateRegistry trækker npm:xlsx ind i tsc).
 */
type Raa = { raw_value: unknown; col_index: number; row_index: number };
type Rows = { row_index: number; cells: Raa[] }[];
type Kolonnevalg = { headerRowIndex: number; valueCol: number; ytdCol: number; metode: string; evidence: string[] };
const skabelonSti = "../../../supabase/functions/_shared/templates/dkEconomicSaldobalanceXlsxV1.ts";
const mod = (await import(/* @vite-ignore */ skabelonSti)) as {
  dkEconomicSaldobalanceXlsxV1: { extractSemanticFromXlsx: (x: unknown) => SemanticExtractionResult | null };
  findKolonner: (m: unknown[][]) => Kolonnevalg;
  FAST_VALUE_COL: number; FAST_YTD_COL: number;
};

const afRaekker = (raekker: unknown[][]) => {
  const rows: Rows = raekker.map((r, i) => ({ sheet_name: "Sheet1", row_index: i, cells: r.map((v, c) => ({ sheet_name: "Sheet1", cell_address: `${String.fromCharCode(65 + c)}${i + 1}`, row_index: i, col_index: c, raw_value: v, formatted_value: v == null ? null : String(v), value_type: typeof v === "number" ? "number" : v == null ? "null" : "string", has_formula: false })).filter((c) => c.raw_value != null) }));
  return { sheet_name: "Sheet1", total_rows: rows.length, total_cols: 7, header_row_index: 5, rows, column_profile: [], raw_matrix: [] };
};
const koer = (raekker: unknown[][]) => {
  const semantic = mod.dkEconomicSaldobalanceXlsxV1.extractSemanticFromXlsx(afRaekker(raekker));
  expect(semantic).not.toBeNull();
  const tjek = (navn: string) => semantic!.parser_validation.checks.find((c) => c.name === navn)!;
  return { semantic: semantic!, canonical: buildCanonicalFromSemantic(semantic!), tjek };
};

describe("findKolonner", () => {
  it("seks kolonner → 2/4; fire kolonner → 2/3; «Året før» springes over; fallback siges", () => {
    expect(mod.findKolonner(syntetiskeRaekker())).toMatchObject({ headerRowIndex: 5, valueCol: 2, ytdCol: 4, metode: "overskrift" });
    expect(mod.findKolonner(syntetiskeRaekkerFireKolonner())).toMatchObject({ headerRowIndex: 5, valueCol: 2, ytdCol: 3, metode: "overskrift" });
    expect(mod.findKolonner([[], [], ["", null, "Perioden", null, null, "År til dato"], ["Nr.", "Navn", "Året før", "Indeværende år", "", "Året før", "Indeværende år"]])).toMatchObject({ headerRowIndex: 3, valueCol: 3, ytdCol: 6 });
    const f = mod.findKolonner([[], [], [], [], [], ["Nr.", "Navn", "Kolonne A", "Kolonne B"]]);
    expect(f).toMatchObject({ valueCol: mod.FAST_VALUE_COL, ytdCol: mod.FAST_YTD_COL, metode: "fast_indeks" });
    expect(f.evidence[0]).toMatch(/^fallback_fixed_columns:2\/4/);
  });
});

describe("begge former — samme resultat, samme balance", () => {
  const seks = koer(syntetiskeRaekker());
  const fire = koer(syntetiskeRaekkerFireKolonner());
  const f = syntetiskeForventninger();
  const b = syntetiskeBalanceForventninger();
  it("resultat og balance som tabellen siger, i begge former", () => {
    for (const form of [seks, fire]) {
      expect(form.canonical.metrics.ebt).toBeCloseTo(f.ebt, 2);
      expect(form.canonical.metrics.revenue).toBeCloseTo(f.revenue, 2);
      expect(form.canonical.metrics.cash).toBeCloseTo(b.cash, 2);
      expect(form.canonical.metrics.trade_receivables).toBeCloseTo(b.trade_receivables, 2);
      expect(form.canonical.metrics.assets_total).toBeCloseTo(b.assets_total, 2);
      expect(form.tjek("balance_present").result).toBe("PASS");
      expect(form.tjek("balance_values_present").result).toBe("PASS");
      expect(form.semantic.parser_validation.parser_status).toBe("PASS");
    }
    expect(fire.canonical.metrics).toEqual(seks.canonical.metrics);
    expect(fire.tjek("column_detection").details).toMatch(/^Columns from header: period col 2, ytd col 3/);
  });
  it("den fejl vi så (fire kolonner, faste indeks): balancen tom → balance_values_present FAIL — resultatet stadig rigtigt", () => {
    const r = syntetiskeRaekkerFireKolonner();
    r[5] = ["Nr.", "Navn", "Beløb 1", "Beløb 2"];
    const x = koer(r);
    expect(x.tjek("column_detection").details).toMatch(/^FALLBACK fixed columns/);
    expect(x.tjek("balance_values_present").result).toBe("FAIL");
    expect(x.semantic.parser_validation.parser_status).toBe("FAIL");
    expect(x.canonical.metrics.ebt).toBeCloseTo(f.ebt, 2);
    expect(x.canonical.metrics.cash).toBeNull();
  });
});
