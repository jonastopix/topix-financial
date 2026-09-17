import { describe, expect, it } from "vitest";
import { buildCanonicalOutput } from "../../../supabase/functions/_shared/canonicalEngine.ts";

// Skabelonen hentes med en variabel sti (typeimporten af templateRegistry.ts trækker npm:xlsx ind i tsc — TS2307).
type Udtraek = { success: true; data: { report_type: string; key_figures: Record<string, number | null>; line_items: unknown[]; validation: unknown } } | { success: false; error: string };
const skabelonSti = "../../../supabase/functions/_shared/templates/dkEconomicSaldobalancePdfV1.ts";
const { dkEconomicSaldobalancePdfV1 } = (await import(/* @vite-ignore */ skabelonSti)) as { dkEconomicSaldobalancePdfV1: { extract: (ctx: unknown) => Udtraek } };

/*
 * A (18/9-2026) — e-conomic saldobalance (PDF): lokaleomkostninger, autodrift og
 * finansielle poster fanges. Prod 17/9 18:14: Topix.dk 2026-01 ebt 25.152,55 mod
 * regnet 29.146,05 — de ≈ 4.000 var lokaleomkostningerne, som skabelonen ikke
 * havde nogen matcher for. Tallene her er SYNTETISKE (kreditformat: omsætning og
 * overskud negative, omkostninger positive).
 */

const tekst = [
  "Saldobalance for perioden 01.01.26 - 31.01.26",
  "RESULTATOPGØRELSE",
  "1010 Salg af varer  -100.000,00  -100.000,00",
  "Omsætning i alt  -100.000,00  -100.000,00",
  "1310 Varekøb  40.000,00  40.000,00",
  "Direkte omkostninger i alt  40.000,00  40.000,00",
  "Dækningsbidrag  -60.000,00  -60.000,00",
  "2210 Løn  20.000,00  20.000,00",
  "Lønninger i alt  20.000,00  20.000,00",
  "3410 Husleje  8.000,00  8.000,00",
  "Lokaleomkostninger i alt  8.000,00  8.000,00",
  "3510 Brændstof  3.000,00  3.000,00",
  "Autodrift i alt  3.000,00  3.000,00",
  "3610 Kontorartikler  9.000,00  9.000,00",
  "Administrationsomkostninger i alt  9.000,00  9.000,00",
  "Resultat før afskrivninger  -20.000,00  -20.000,00",
  "4360 Renteindtægter bank  -500,00  -500,00",
  "Renteindtægter i alt  -500,00  -500,00",
  "4410 Renteudgifter bank  1.500,00  1.500,00",
  "Renteudgifter i alt  1.500,00  1.500,00",
  "Resultat før skat  -19.000,00  -19.000,00",
  "AKTIVER",
  "5820 Bank  50.000,00  50.000,00",
  "Likvide beholdninger i alt  50.000,00  50.000,00",
  "AKTIVER I ALT  50.000,00",
  "PASSIVER",
  "6000 Egenkapital  -30.000,00  -30.000,00",
  "EGENKAPITAL I ALT  -30.000,00",
  "PASSIVER I ALT  -50.000,00",
  "secure.e-conomic.com",
].join("\n");

const ctx = { fileName: "syntetisk.pdf", fileType: "pdf" as const, sheetNames: [], headerRows: [], rawText: tekst, rows: [] };

describe("A: saldobalance-PDF — grupperne der aldrig blev fanget", () => {
  const r = dkEconomicSaldobalancePdfV1.extract(ctx);
  it("key_figures: lokaleomkostninger 8.000, transportomkostninger (autodrift) 3.000, finansielle_indtaegter 500, finansielle_omkostninger 1.500 — ebt uændret 19.000", () => {
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.key_figures).toMatchObject({ omsaetning: 100_000, loenninger: 20_000, administrationsomkostninger: 9_000, lokaleomkostninger: 8_000, transportomkostninger: 3_000, finansielle_indtaegter: 500, finansielle_omkostninger: 1_500, resultat_foer_skat: 19_000 });
  });
  it("canonical: facility_costs, vehicle_costs, financial_costs, financial_income — og kontrolsummen lukker (ebt_reconciles PASS)", () => {
    if (!r.success) throw new Error("extract fejlede");
    const c = buildCanonicalOutput(r.data, {}, "deterministic_template");
    expect(c.metrics).toMatchObject({ revenue: 100_000, gross_profit: 60_000, payroll: 20_000, facility_costs: 8_000, vehicle_costs: 3_000, admin_costs: 9_000, financial_costs: 1_500, financial_income: 500, ebt: 19_000 });
    expect(c.validation.canonical_checks.find((x) => x.name === "ebt_reconciles")?.result).toBe("PASS");
  });
  it("autodrift-matcheren rammer ikke «Mobiltelefon i alt» (\\bbil)", () => {
    expect(/(autodrift|transport|\bbil(er|omk))[^\n]*(i alt|ialt)/i.test("Mobiltelefon i alt")).toBe(false);
    expect(/(autodrift|transport|\bbil(er|omk))[^\n]*(i alt|ialt)/i.test("Biler i alt")).toBe(true);
    expect(/(autodrift|transport|\bbil(er|omk))[^\n]*(i alt|ialt)/i.test("Autodrift - gulpladebiler i alt")).toBe(true);
  });
});
