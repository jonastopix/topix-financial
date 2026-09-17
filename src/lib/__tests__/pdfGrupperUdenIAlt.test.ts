import { describe, expect, it } from "vitest";
import { buildCanonicalFromSemantic, buildCanonicalOutput } from "../../../supabase/functions/_shared/canonicalEngine.ts";
import { alleGrupper, bygGruppetrae, erSumAf, normGruppeLabel, type Gruppelinje } from "../../../supabase/functions/_shared/gruppetrae.ts";
import type { SemanticExtractionResult } from "../../../supabase/functions/_shared/semanticTypes.ts";
import type { PdfStructuralPayload } from "../../../supabase/functions/_shared/pdfStructuralTypes.ts";
import { KJ_FORM_FORVENTET, KJ_FORM_TEKST } from "../../../supabase/functions/_test_fixtures/saldobalancePdfGrupperSyntetisk.ts";
import { BRILLEVAERK_FORM_FORVENTET, brillevaerkFormen, bygStrukturel } from "../../../supabase/functions/_test_fixtures/pnlPdfBrillevaerkSyntetisk.ts";

/*
 * Grupper uden «i alt» (17/9-2026). To målte fejl samme aften:
 *   KJ AUTO (saldobalance-PDF): gruppenavne UDEN «i alt» → cost_lines_present FAIL «Revenue 1330860.74 but no cost
 *     lines found». Nu: grupperne som træ af filens egen opbygning (overskrift → konti → sumlinje).
 *   BRILLEVÆRK (PDF-resultatopgørelse): «Løn, gager og honorarer i alt» fanges ikke af /lønninger/; pension, personale,
 *     leasing og finansiering havde ingen matcher; «Vareforbrug Glas og Briller i alt» FØR «Omsætning i alt» må ikke
 *     tælle oven i vareforbruget efter. Fixtures syntetiske i begge filers form; skabelonerne hentes med variabel sti.
 */
type Udtraek = { success: true; data: { report_type: string; key_figures: Record<string, number | null>; line_items: unknown[]; validation: { checks: { name: string; result: string; details: string }[] } } } | { success: false; error: string };
const saldoSti = "../../../supabase/functions/_shared/templates/dkEconomicSaldobalancePdfV1.ts";
const saldo = (await import(/* @vite-ignore */ saldoSti)) as {
  dkEconomicSaldobalancePdfV1: { extract: (ctx: unknown) => Udtraek };
  linjerAfTekst: (t: string) => Record<"PNL" | "AKTIVER" | "PASSIVER", Gruppelinje[]>;
  gruppeNoegletal: (l: Record<"PNL" | "AKTIVER" | "PASSIVER", Gruppelinje[]>) => { kf: Record<string, number | null>; spor: string[]; fandtOmsaetning: boolean };
};
const pnlSti = "../../../supabase/functions/_shared/templates/dkEconomicResultatopgoerelsePdfV1.ts";
const pnl = (await import(/* @vite-ignore */ pnlSti)) as { dkEconomicResultatopgoerelsePdfV1: { extractSemantic: (s: PdfStructuralPayload | null, t: string) => SemanticExtractionResult | null } };
const naer = (m: object, f: Record<string, number>) => { const t = m as Record<string, number | null>; for (const [k, v] of Object.entries(f)) expect(t[k], k).toBeCloseTo(v, 2); };

describe("gruppetrae — overskrift, konti, sumlinje; nesting; kontonummer som skel", () => {
  it("normalisering og sum-af", () => {
    expect(normGruppeLabel(" Løn  i alt: ")).toBe("løn i alt");
    expect(erSumAf("løn", "løn i alt")).toBe(true); expect(erSumAf("løn", "løn")).toBe(true); expect(erSumAf("løn", "lønninger i alt")).toBe(false);
  });
  it("KJ-formen: Personaleudgifter rummer Løn i alt; Udlejning rummer indtægten og Personbil; Kapacitetsomkostninger rummer driftsgrupperne; konti er aldrig grupper", () => {
    const roots = bygGruppetrae(saldo.linjerAfTekst(KJ_FORM_TEKST).PNL);
    const kap = roots.find((g) => g.norm === "kapacitetsomkostninger")!;
    expect(kap.children.map((c) => c.norm)).toEqual(["salgsfremmende omk", "personaleudgifter", "administrationsomkostninger", "lokaleomkostninger", "udlejning af fast ejendom", "driftsmiddelomkostninger"]);
    expect(kap.children[1].children.map((c) => c.norm)).toEqual(["løn i alt"]);
    expect(kap.children[4].children.map((c) => [c.norm, c.value])).toEqual([["sekundære lejeindtægter", -20_000], ["personbil", 5_000]]);
    expect(roots.map((g) => g.norm)).toEqual(["nettoomsætning", "vareforbrug", "dækningsbidrag", "kapacitetsomkostninger", "resultat før renter", "renteudgifter", "resultat før ekstraordinære poster", "resultat"]);
    expect(alleGrupper(roots).some((g) => /^\d/.test(g.norm))).toBe(false);
  });
});

describe("saldobalance-PDF i KJ-formen (uden «i alt»)", () => {
  const ctx = { fileName: "syntetisk.pdf", fileType: "pdf" as const, sheetNames: [], headerRows: [], rawText: KJ_FORM_TEKST, rows: [] };
  const r = saldo.dkEconomicSaldobalancePdfV1.extract(ctx);
  it("alle grupper, indtægten i omkostningsafsnittet som other_operating_income, renter, resultatet, balancen — og kontrolsummen 0", () => {
    expect(r.success).toBe(true);
    if (!r.success) return;
    const c = buildCanonicalOutput(r.data, {}, "deterministic_template");
    naer(c.metrics, KJ_FORM_FORVENTET);
    expect(c.kontrolsum?.udaekket).toBe(0);
    expect(c.validation.status).toBe("PASS");
    expect(c.validation.canonical_checks.find((x) => x.name === "cost_lines_present")?.result).toBe("PASS");
    const spor = r.data.validation.checks.find((x) => x.name === "groups_from_tree")!;
    expect(spor.result).toBe("PASS");
    expect(spor.details).toContain("loenninger<-Personaleudgifter>Løn i alt");
    expect(spor.details).toContain("andre_driftsindtaegter<-Udlejning af fast ejendom");
    expect(spor.details).toContain("oevrige_omkostninger<-Driftsmiddelomkostninger");
  });
  it("«Resultat før renter» bruges kun som resultat når hverken «Resultat» eller «Resultat før skat» findes — og så med renterne lagt til", () => {
    const uden = KJ_FORM_TEKST.split("\n").filter((l) => !/^\s*Resultat før ekstraordinære poster|^\s*Resultat\s+-83/.test(l)).join("\n");
    const rr = saldo.dkEconomicSaldobalancePdfV1.extract({ ...ctx, rawText: uden });
    expect(rr.success).toBe(true);
    if (!rr.success) return;
    expect(rr.data.key_figures.resultat_foer_skat).toBeCloseTo(83_000, 2); // 85.000 − 2.000
    expect(rr.data.validation.checks.find((x) => x.name === "groups_from_tree")!.details).toMatch(/resultat_foer_skat<-Resultat før renter − finans/);
  });
  it("«… i alt»-formen (den gamle) læses stadig ens — samme fixture som før, nu gennem træet", () => {
    const iAlt = [
      "Saldobalance for perioden 01.01.26 - 31.01.26", "RESULTATOPGØRELSE",
      "1010 Salg af varer  -100.000,00  -100.000,00", "Omsætning i alt  -100.000,00  -100.000,00",
      "1310 Varekøb  40.000,00  40.000,00", "Direkte omkostninger i alt  40.000,00  40.000,00", "Dækningsbidrag  -60.000,00  -60.000,00",
      "2210 Løn  20.000,00  20.000,00", "Lønninger i alt  20.000,00  20.000,00",
      "3410 Husleje  8.000,00  8.000,00", "Lokaleomkostninger i alt  8.000,00  8.000,00",
      "3610 Kontorartikler  9.000,00  9.000,00", "Administrationsomkostninger i alt  9.000,00  9.000,00",
      "4410 Renteudgifter bank  1.500,00  1.500,00", "Renteudgifter i alt  1.500,00  1.500,00",
      "Resultat før skat  -21.500,00  -21.500,00",
      "AKTIVER", "5820 Bank  50.000,00  50.000,00", "Likvide beholdninger i alt  50.000,00  50.000,00", "AKTIVER I ALT  50.000,00",
      "PASSIVER", "6000 Egenkapital  -50.000,00  -50.000,00", "EGENKAPITAL I ALT  -50.000,00", "PASSIVER I ALT  -50.000,00",
    ].join("\n");
    const rr = saldo.dkEconomicSaldobalancePdfV1.extract({ ...ctx, rawText: iAlt });
    expect(rr.success).toBe(true);
    if (!rr.success) return;
    const c = buildCanonicalOutput(rr.data, {}, "deterministic_template");
    naer(c.metrics, { revenue: 100_000, cogs: 40_000, payroll: 20_000, facility_costs: 8_000, admin_costs: 9_000, financial_costs: 1_500, ebt: 21_500, cash: 50_000, assets_total: 50_000, equity_total: 50_000 });
    expect(c.kontrolsum?.udaekket).toBe(0);
  });
});

describe("PDF-resultatopgørelse i BRILLEVÆRK-formen", () => {
  it("løn/pension/personale/leasing/finansiering fanges; vareforbrug kun EFTER «Omsætning i alt»; kontrolsum 0", () => {
    const s = pnl.dkEconomicResultatopgoerelsePdfV1.extractSemantic(bygStrukturel(brillevaerkFormen(true)), "")!;
    const c = buildCanonicalFromSemantic(s);
    naer(c.metrics, BRILLEVAERK_FORM_FORVENTET);
    expect(c.kontrolsum?.udaekket).toBe(0);
    expect(c.validation.status).toBe("PASS");
    const cogs = s.metric_candidates.find((x) => x.source_field_id === "direkte_omkostninger")!;
    expect(cogs.source_label).toBe("Vareforbrug øvrigt i alt");
    expect(s.metric_candidates.find((x) => x.source_field_id === "oevrige_personale")!.source_label).toBe("Sociale bidrag og personaleomkostninger i alt");
  });
  it("kun beholderen «Personaleomkostninger i alt» efter løn og pension: løn og pension trækkes fra — ingen dobbelttælling", () => {
    const s = pnl.dkEconomicResultatopgoerelsePdfV1.extractSemantic(bygStrukturel(brillevaerkFormen(false)), "")!;
    const c = buildCanonicalFromSemantic(s);
    naer(c.metrics, BRILLEVAERK_FORM_FORVENTET);
    const beholder = s.metric_candidates.find((x) => x.source_field_id === "oevrige_personale")!;
    expect(beholder.source_label).toBe("Personaleomkostninger i alt");
    expect(beholder.raw_value).toBe(1_200);
    expect(beholder.evidence.join(" ")).toMatch(/container: 22700 minus loenninger\(20000\) \+ pensioner_sociale\(1500\) = 1200/);
    expect(c.kontrolsum?.udaekket).toBe(0);
  });
  it("selvbevis: den gamle løn-matcher rammer ikke «Løn, gager og honorarer i alt»; den nye gør", () => {
    expect(/lønninger\s*(mv\.?)?\s*(i alt|ialt)/i.test("Løn, gager og honorarer i alt")).toBe(false);
    expect(/^(lønninger|løn,? gager( og honorarer)?|løn)\s*(mv\.?)?\s*(i alt|ialt)/i.test("Løn, gager og honorarer i alt")).toBe(true);
    expect(/^(lønninger|løn,? gager( og honorarer)?|løn)\s*(mv\.?)?\s*(i alt|ialt)/i.test("Lønninger mv. i alt")).toBe(true);
  });
});
