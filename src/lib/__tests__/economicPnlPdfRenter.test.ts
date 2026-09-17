import { describe, expect, it } from "vitest";
import { buildCanonicalFromSemantic } from "../../../supabase/functions/_shared/canonicalEngine.ts";
import type { SemanticExtractionResult } from "../../../supabase/functions/_shared/semanticTypes.ts";
import type { PdfStructuralPayload, PdfStructuralRow, PdfStructuralToken } from "../../../supabase/functions/_shared/pdfStructuralTypes.ts";

// Skabelonen hentes med en variabel sti: dens typeimport af templateRegistry.ts trækker
// npm:xlsx ind i tsc-programmet (TS2307) — vitest løser den fint ved kørsel.
const skabelonSti = "../../../supabase/functions/_shared/templates/dkEconomicResultatopgoerelsePdfV1.ts";
const { dkEconomicResultatopgoerelsePdfV1 } = (await import(/* @vite-ignore */ skabelonSti)) as {
  dkEconomicResultatopgoerelsePdfV1: { extractSemantic: (s: PdfStructuralPayload | null, t: string) => SemanticExtractionResult | null };
};

/*
 * A + A2 (18/9-2026) — e-conomics resultatopgørelse (PDF) uden «Resultat før skat».
 *
 * Målt 17/9 i Floren Engros' originale juni-2026-PDF (ikke gengivet her — alle
 * tal nedenfor er SYNTETISKE, kun opbygningen er Florens): kolonner «Perioden:
 * Faktisk · % · Året før · Difference» og «År til dato: …», forretningsformat
 * (omsætning positiv, omkostninger negative), grupperne «Lønninger i alt»,
 * «Salgs- og rejseomkostninger i alt», «Autodrift - gulpladebiler i alt»,
 * «Lokaleomkostninger i alt», «Administrationsomkostninger i alt», «Resultat
 * før afskrivninger», «Resultat før renter», «Renteindtægter i alt»,
 * «Renteudgifter i alt», «PERIODENS RESULTAT» — og INGEN «Resultat før skat».
 *
 * Før: (1) /administration\b/i ramte aldrig «Administrationsomkostninger i alt»
 * → admin_costs null; (2) «Resultat før renter» blev ebt (før renterne);
 * (3) renteindtægter/renteudgifter, «Salgs- og rejse…» og «Autodrift …» blev
 * ikke fanget. Nu: ebt = ebit − financial_costs + financial_income = periodens
 * resultat, og alle grupper når canonical.
 */

// ── Syntetisk strukturel fixture (slot 0 = «Faktisk» i Perioden, slot 4 = ÅTD) ──

type Raekke = { label: string; periode?: number | null; aatd?: number | null; subtotal?: boolean; konto?: string };

const dkTal = (v: number): string => {
  const s = Math.abs(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return v < 0 ? `-${s}` : s;
};

function byg(raekker: Raekke[]): PdfStructuralPayload {
  const rows: PdfStructuralRow[] = raekker.map((r, i) => {
    const tokens: PdfStructuralToken[] = [];
    let x = 20;
    if (r.konto) { tokens.push({ text: r.konto, x, y: 800 - i * 12, width: 30, page: 1, column_slot: null, column_slot_confidence: "HIGH" }); x += 40; }
    tokens.push({ text: r.label, x, y: 800 - i * 12, width: 150, page: 1, column_slot: null, column_slot_confidence: "HIGH" });
    if (r.periode != null) tokens.push({ text: dkTal(r.periode), x: 300, y: 800 - i * 12, width: 60, page: 1, column_slot: 0, column_slot_confidence: "HIGH" });
    if (r.aatd != null) tokens.push({ text: dkTal(r.aatd), x: 600, y: 800 - i * 12, width: 60, page: 1, column_slot: 4, column_slot_confidence: "HIGH" });
    return { row_index: i, row_group_id: `p1_r${i}`, y_position: 800 - i * 12, page: 1, tokens, is_header: false, is_subtotal: r.subtotal === true };
  });
  return {
    version: "1.0",
    pages: [{ page_number: 1, rows }],
    column_profile: { slot_count: 8, slot_labels: ["Faktisk", "%", "Året før", "Difference", "Faktisk", "%", "Året før", "Difference"], slot_x_ranges: Array.from({ length: 8 }, (_, k) => ({ min: 280 + k * 60, max: 340 + k * 60 })), detection_method: "header_anchor", confidence: "HIGH" },
    metadata: { page_count: 1, total_token_count: rows.reduce((n, r) => n + r.tokens.length, 0), total_row_count: rows.length, content_hash: "0".repeat(64), source_file_name: "syntetisk.pdf", extraction_timestamp: "2026-09-18T00:00:00.000Z" },
  };
}

/** Florens opbygning, syntetiske tal, forretningsformat. Underskud før renter (−6.000), overskud efter (+5.000). */
const florensOpbygning = (fortegn: 1 | -1, medRenter = true, medPeriodensResultat = true, medResultatFoerSkat = false): Raekke[] => {
  const f = (v: number) => v * fortegn;
  const r: Raekke[] = [
    { label: "Syntetisk ApS (CVR-nr. 12345678)" },
    { label: "Resultatopgørelse 01/06-2026 - 30/06-2026" },
    { label: "RESULTATOPGØRELSE" },
    { label: "Omsætning" },
    { label: "Salg af varer", konto: "1010", periode: f(500_000), aatd: f(2_500_000) },
    { label: "Omsætning i alt", periode: f(500_000), aatd: f(2_500_000), subtotal: true },
    { label: "Direkte omkostninger" },
    { label: "Vareforbrug", konto: "1310", periode: f(-300_000), aatd: f(-1_500_000) },
    { label: "Direkte omkostninger i alt", periode: f(-300_000), aatd: f(-1_500_000), subtotal: true },
    { label: "Lønninger" },
    { label: "Lønninger", konto: "2210", periode: f(-100_000), aatd: f(-500_000) },
    { label: "Lønninger i alt", periode: f(-100_000), aatd: f(-500_000), subtotal: true },
    { label: "Salgs- og rejseomkostninger" },
    { label: "Rejseomkostninger", konto: "2750", periode: f(-1_000), aatd: f(-5_000) },
    { label: "Salgs- og rejseomkostninger i alt", periode: f(-1_000), aatd: f(-5_000), subtotal: true },
    { label: "Autodrift - gulpladebiler" },
    { label: "Brændstof", konto: "3110", periode: f(-15_000), aatd: f(-75_000) },
    { label: "Autodrift - gulpladebiler i alt", periode: f(-15_000), aatd: f(-75_000), subtotal: true },
    { label: "Lokaleomkostninger" },
    { label: "Husleje", konto: "3410", periode: f(-20_000), aatd: f(-100_000) },
    { label: "Lokaleomkostninger i alt", periode: f(-20_000), aatd: f(-100_000), subtotal: true },
    { label: "Administrationsomkostninger" },
    { label: "Kontorartikler", konto: "3610", periode: f(-70_000), aatd: f(-350_000) },
    { label: "Administrationsomkostninger i alt", periode: f(-70_000), aatd: f(-350_000), subtotal: true },
    { label: "Resultat før afskrivninger", periode: f(-6_000), aatd: f(-30_000), subtotal: true },
    { label: "Afskrivninger" },
    { label: "Resultat før renter", periode: f(-6_000), aatd: f(-30_000), subtotal: true },
  ];
  if (medRenter) {
    r.push(
      { label: "Renteindtægter" },
      { label: "Rente- & gebyrindtægt, debitorer", konto: "4360", periode: f(16_000), aatd: f(17_000) },
      { label: "Renteindtægter i alt", periode: f(16_000), aatd: f(17_000), subtotal: true },
      { label: "Renteudgifter" },
      { label: "Rente- & gebyrudgift, bank", konto: "4410", periode: f(-5_000), aatd: f(-16_000) },
      { label: "Renteudgifter i alt", periode: f(-5_000), aatd: f(-16_000), subtotal: true },
    );
  }
  if (medResultatFoerSkat) r.push({ label: "Resultat før skat", periode: f(medRenter ? 5_000 : -6_000), aatd: f(-29_000), subtotal: true });
  if (medPeriodensResultat) r.push({ label: "PERIODENS RESULTAT", periode: f(medRenter ? 5_000 : -6_000), aatd: f(-29_000), subtotal: true });
  return r;
};

const udtraek = (raekker: Raekke[]) => {
  const semantic = dkEconomicResultatopgoerelsePdfV1.extractSemantic(byg(raekker), "");
  expect(semantic).not.toBeNull();
  const canonical = buildCanonicalFromSemantic(semantic!);
  return { semantic: semantic!, canonical, m: canonical.metrics, kandidat: (id: string) => semantic!.metric_candidates.find((c) => c.source_field_id === id) };
};

describe("A: «Administrationsomkostninger i alt» fanges", () => {
  it("selvbevis: den gamle matcher /administration\\b/i rammer IKKE e-conomics subtotal (bug'en), den nye gør", () => {
    expect(/administration\b/i.test("Administrationsomkostninger i alt")).toBe(false);
    expect(/administration(s?omkostninger)?\b/i.test("Administrationsomkostninger i alt")).toBe(true);
    expect(/administration(s?omkostninger)?\b/i.test("Administration i alt")).toBe(true);
    expect(/administration(s?omkostninger)?\b/i.test("ADMINISTRATION")).toBe(true);
  });
  it("admin_costs = 70.000 fra subtotalen (før: null)", () => {
    const { m, kandidat } = udtraek(florensOpbygning(1));
    expect(kandidat("administrationsomkostninger")?.source_label).toBe("Administrationsomkostninger i alt");
    expect(m.admin_costs).toBe(70_000);
  });
});

describe("A2: renter, salgs- og rejseomkostninger, autodrift — og ebt = periodens resultat", () => {
  it("forretningsformat: alle grupper når canonical; ebt = ebit − renteudgifter + renteindtægter = 5.000 = PERIODENS RESULTAT; PASS uden advarsler", () => {
    const { m, canonical, kandidat, semantic } = udtraek(florensOpbygning(1));
    expect(kandidat("renteindtaegter")?.source_label).toBe("Renteindtægter i alt");
    expect(kandidat("renteudgifter")?.source_label).toBe("Renteudgifter i alt");
    expect(kandidat("resultat_foer_renter")?.proposed_canonical_target).toBe("ebit");
    expect(m).toMatchObject({ revenue: 500_000, cogs: 300_000, gross_profit: 200_000, payroll: 100_000, sales_costs: 1_000, vehicle_costs: 15_000, facility_costs: 20_000, admin_costs: 70_000, ebitda: -6_000, ebit: -6_000, financial_costs: 5_000, financial_income: 16_000, ebt: 5_000, net_result: 5_000 });
    const log = canonical.correction_log.find((c) => c.field === "ebt");
    expect(log?.rule).toBe("canonical_derivation");
    expect(log?.reason).toBe("ebt derived: ebit(-6000) - financial_costs(5000) + financial_income(16000) = 5000");
    expect(canonical.validation.status).toBe("PASS");
    expect(canonical.validation.canonical_checks.filter((c) => c.result === "WARN" || c.result === "FAIL")).toEqual([]);
    expect(semantic.parser_validation.checks.find((c) => c.name === "ebt_present")).toMatchObject({ result: "PASS", details: expect.stringContaining("derived") });
  });
  it("kreditformat (omsætning negativ, resultat negativt ved overskud): samme tal, samme fortegn", () => {
    const { m } = udtraek(florensOpbygning(-1));
    expect(m).toMatchObject({ revenue: 500_000, admin_costs: 70_000, vehicle_costs: 15_000, ebit: -6_000, financial_costs: 5_000, financial_income: 16_000, ebt: 5_000, net_result: 5_000 });
  });
  it("præcedens: en egen «Resultat før skat» vinder over afledningen", () => {
    const { m, canonical } = udtraek(florensOpbygning(1, true, true, true));
    expect(m.ebt).toBe(5_000);
    expect(canonical.correction_log.find((c) => c.field === "ebt")).toBeUndefined();
    expect((canonical.provenance.ebt as { source_label?: string } | undefined)?.source_label).toBe("Resultat før skat");
  });
  it("uden rentelinjer: ebt = PERIODENS RESULTAT (ebt_from_net_result), ingen advarsel", () => {
    const { m, canonical } = udtraek(florensOpbygning(1, false, true));
    expect(m.ebt).toBe(-6_000);
    expect(m.net_result).toBe(-6_000);
    expect(canonical.correction_log.find((c) => c.field === "ebt")?.rule).toBe("ebt_from_net_result");
    expect(canonical.validation.canonical_checks.find((c) => c.name === "ebt_before_interest")).toBeUndefined();
  });
  it("kun «Resultat før renter»: ebt = ebit som SIDSTE udvej, og WARN ebt_before_interest med tekst til medlemmet", () => {
    const { m, canonical } = udtraek(florensOpbygning(1, false, false));
    expect(m.ebt).toBe(-6_000);
    expect(canonical.correction_log.find((c) => c.field === "ebt")?.rule).toBe("ebt_from_ebit_no_financials");
    const warn = canonical.validation.canonical_checks.find((c) => c.name === "ebt_before_interest");
    expect(warn?.result).toBe("WARN");
    expect(warn?.felter).toEqual(["ebt"]);
    expect(warn?.tekst).toBe("Resultatet før skat er taget fra «Resultat før renter» (-6.000 kr.), fordi der ikke blev fundet renteindtægter eller renteudgifter. Står der finansielle poster i rapporten, er resultatet ikke det endelige.");
    expect(canonical.validation.status).toBe("PASS"); // WARN giver aldrig FAIL
  });
});

describe("A2: tekstvejen (uden strukturel payload) dømmer det samme", () => {
  const linje = (label: string, v: number, konto = "") => `${konto.padEnd(6)} ${label.padEnd(40)} ${dkTal(v).padStart(14)} ${"0,00".padStart(8)} ${dkTal(v * 5).padStart(14)}`;
  const tekst = [
    "Resultatopgørelse for perioden 01.06.26 - 30.06.26",
    "Syntetisk ApS (CVR-nr. 12345678)",
    "RESULTATOPGØRELSE",
    linje("Salg af varer", 500_000, "1010"), linje("Omsætning i alt", 500_000),
    linje("Vareforbrug", -300_000, "1310"), linje("Direkte omkostninger i alt", -300_000),
    linje("Lønninger", -100_000, "2210"), linje("Lønninger i alt", -100_000),
    linje("Salgs- og rejseomkostninger i alt", -1_000),
    linje("Autodrift - gulpladebiler i alt", -15_000),
    linje("Lokaleomkostninger i alt", -20_000),
    linje("Administrationsomkostninger i alt", -70_000),
    linje("Resultat før afskrivninger", -6_000),
    "       Afskrivninger",
    linje("Resultat før renter", -6_000),
    linje("Renteindtægter i alt", 16_000),
    linje("Renteudgifter i alt", -5_000),
    linje("PERIODENS RESULTAT", 5_000),
    "secure.e-conomic.com",
  ].join("\n");
  it("anti_pattern og konvention gælder også på tekstvejen: afskrivninger IKKE «Resultat før afskrivninger», resultat med rigtigt fortegn, ebt 5.000", () => {
    const semantic = dkEconomicResultatopgoerelsePdfV1.extractSemantic(null, tekst);
    expect(semantic).not.toBeNull();
    expect(semantic!.metric_candidates.find((c) => c.source_field_id === "afskrivninger")).toBeUndefined();
    const canonical = buildCanonicalFromSemantic(semantic!);
    expect(canonical.metrics).toMatchObject({ admin_costs: 70_000, vehicle_costs: 15_000, sales_costs: 1_000, ebit: -6_000, financial_costs: 5_000, financial_income: 16_000, ebt: 5_000, net_result: 5_000 });
    expect(canonical.validation.status).toBe("PASS");
  });
});
