import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn: saldobalance-XLSX finder kolonnerne selv (17/9-2026). Fire domme:
//   1. Skabelonen har ingen faste `VALUE_COL = 2` / `YTD_COL = 4` længere — kolonnerne kommer fra
//      findKolonner(matrix), og detect finder overskriftsrækken («Nr.»/«Navn») af indholdet.
//   2. findKolonner: gruppe-rækken bæres til højre, «Året før» springes over, fallback = de faste indeks med evidence.
//   3. Parser-tjekket balance_values_present fælder (FAIL) når balancekonti findes uden beløb; column_detection logger valget.
//   4. Fixturen har begge former (syntetiskeRaekkerFireKolonner), og både Deno-testen og vitest-testen kører dem.
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const SKABELON = "supabase/functions/_shared/templates/dkEconomicSaldobalanceXlsxV1.ts";
const FIXTURE = "supabase/functions/_test_fixtures/saldobalanceSyntetisk.ts";
const DENO_TEST = "supabase/functions/extract-financial-data/saldobalance_kolonner_test.ts";
const VITEST = "src/lib/__tests__/saldobalanceKolonner.test.ts";

/** Dom 1. */
export const ingenFasteIndeks = (k: string): boolean =>
  !/const VALUE_COL = 2;/.test(k) && !/const YTD_COL = 4;/.test(k) &&
  k.includes("const kolonner = findKolonner(matrix);") &&
  k.includes("const VALUE_COL = kolonner.valueCol;") &&
  k.includes("const YTD_COL = kolonner.ytdCol;") &&
  k.includes("if (row.row_index <= kolonner.headerRowIndex) continue;") &&
  k.includes("const overskrift = findOverskriftsRaekke(ctx.headerRows);") &&
  k.includes("for (let i = overskrift + 1; i < Math.min(ctx.headerRows.length, 100); i++) {");

/** Dom 2. */
export const kolonnedommen = (k: string): boolean =>
  k.includes("export const FAST_VALUE_COL = 2;") && k.includes("export const FAST_YTD_COL = 4;") &&
  k.includes("if (/perioden|år til dato/.test(g)) gruppe = g;") &&
  k.includes("const aaretFoer = /året før/.test(sub);") &&
  k.includes("if (aaretFoer) continue;") &&
  k.includes("if (valueCol < 0 && (/perioden/.test(sub) || /perioden/.test(gruppe))) { valueCol = c; continue; }") &&
  k.includes("if (ytdCol < 0 && (/år til dato/.test(sub) || /år til dato/.test(gruppe))) { ytdCol = c; }") &&
  k.includes("if (valueCol < 0 || ytdCol < 0) return fallback(") &&
  k.includes("evidence: [`fallback_fixed_columns:${FAST_VALUE_COL}/${FAST_YTD_COL}`, grund],");

/** Dom 3. */
export const balancetjekket = (k: string): boolean =>
  k.includes('name: "balance_values_present",') &&
  k.includes('result: balanceKonti === 0 ? "SKIP" as const : balanceKontiMedBeloeb > 0 ? "PASS" as const : "FAIL" as const,') &&
  k.includes("if (rawValue != null && rawValue !== 0) balanceKontiMedBeloeb++;") &&
  k.includes('name: "column_detection",');

/** Dom 4. */
export const beggeFormer = (f: string, d: string, v: string): boolean =>
  f.includes("export function syntetiskeRaekkerFireKolonner(): unknown[][] {") &&
  f.includes('["Nr.", "Navn", "Perioden", "År til dato"],') &&
  d.includes("syntetiskeRaekkerFireKolonner") && d.includes("assertEquals(seks.canonical.metrics, fire.canonical.metrics);") &&
  v.includes("syntetiskeRaekkerFireKolonner") && v.includes("expect(fire.canonical.metrics).toEqual(seks.canonical.metrics);");

describe("saldobalanceKolonner.guard — kolonnerne af filens egen overskrift", () => {
  const k = udenKommentarer(laes(SKABELON));
  const f = udenKommentarer(laes(FIXTURE));
  const d = udenKommentarer(laes(DENO_TEST));
  const v = udenKommentarer(laes(VITEST));
  it("dom 1: ingen faste indeks; overskriftsrækken findes af indholdet", () => { expect(ingenFasteIndeks(k)).toBe(true); });
  it("dom 2: kolonnedommen med «Året før»-spring og fallback i evidence", () => { expect(kolonnedommen(k)).toBe(true); });
  it("dom 3: balance_values_present fælder; column_detection logger", () => { expect(balancetjekket(k)).toBe(true); });
  it("dom 4: begge former i fixturen, Deno-testen og vitest-testen", () => { expect(beggeFormer(f, d, v)).toBe(true); });
  it("selvbevis: de faste indeks tilbage, «Året før» ikke sprunget over, eller FAIL blødt op til PASS, falder", () => {
    expect(ingenFasteIndeks(k.replace("const VALUE_COL = kolonner.valueCol;", "const VALUE_COL = 2;"))).toBe(false);
    expect(kolonnedommen(k.replace("if (aaretFoer) continue;", ""))).toBe(false);
    expect(balancetjekket(k.replace('balanceKontiMedBeloeb > 0 ? "PASS" as const : "FAIL" as const', '"PASS" as const'))).toBe(false);
    expect(beggeFormer(f.replace('["Nr.", "Navn", "Perioden", "År til dato"],', '["Nr.", "Navn", "Perioden", null, "År til dato"],'), d, v)).toBe(false);
  });
});
