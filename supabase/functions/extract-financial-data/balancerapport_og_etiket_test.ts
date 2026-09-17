/**
 * De to nye formater (17/9-2026): e-conomics balancerapport som PDF (Warburgs månedsrapport) og «etiket;beløb»-CSV
 * (BR Rosets format). Syntetiske fixtures (_test_fixtures/balancerapportOgEtiketSyntetisk.ts), ingen kundedata.
 *
 * Kør: deno test --node-modules-dir=none --allow-read --allow-env supabase/functions/extract-financial-data/balancerapport_og_etiket_test.ts
 */
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectTemplate, tryDeterministicPdfExtraction, tryDeterministicCsvExtraction, trySemanticCsvExtraction, tryDeterministicPdfStructuralExtraction } from "../_shared/templateRegistry.ts";
import { buildCanonicalOutput, buildCanonicalFromSemantic } from "../_shared/canonicalEngine.ts";
import { detectSourceSystem, isAiAllowed } from "../_shared/sourceFingerprint.ts";
import { parseCsvRaw, buildCsvDetectionContext } from "../_shared/csvRawParser.ts";
import { dkEconomicBalancerapportPdfV1, laesBalancerapport, laesHoved } from "../_shared/templates/dkEconomicBalancerapportPdfV1.ts";
import { dkEtiketResultatBalanceCsvV1, laesEtiketter, normEtiket, tilTal, tolerant } from "../_shared/templates/dkEtiketResultatBalanceCsvV1.ts";
import { dkEconomicSaldobalancePdfV1 } from "../_shared/templates/dkEconomicSaldobalancePdfV1.ts";
import { dkEconomicResultatopgoerelsePdfV1 } from "../_shared/templates/dkEconomicResultatopgoerelsePdfV1.ts";
import { dkDineroResultatopgoerelsePdfV1 } from "../_shared/templates/dkDineroResultatopgoerelsePdfV1.ts";
import { dkGenericResultatopgoerelsePdfV1 } from "../_shared/templates/dkGenericResultatopgoerelsePdfV1.ts";
import { dkDineroResultatopgoerelseCsvV1 } from "../_shared/templates/dkDineroResultatopgoerelseCsvV1.ts";
import { ECONOMIC_SALDOBALANCE_PDF_TEXT, ECONOMIC_PNL_PDF_TEXT, DINERO_PNL_PDF_TEXT, DINERO_UNGARBEJDE_MAR_TEXT } from "../_test_fixtures/pdfParserFixtures.ts";
import { fixture_unbranded_jan2025_text, fixture_unbranded_jan2025_structural } from "../_test_fixtures/unbrandedEconomicPdfFixtures.ts";
import { REST_DINERO_CSV, REST_DINERO_PDF_TEXT, REST_GENERIC_PDF_TEXT } from "../_test_fixtures/skabelonerRestSyntetisk.ts";
import { BALANCERAPPORT_PDF_TEXT, BALANCERAPPORT_PDF_TEXT_BUSINESS, BALANCERAPPORT_FORVENTET, ETIKET_CSV_UTF8, ETIKET_CSV_KLIENT, ETIKET_FORVENTET } from "../_test_fixtures/balancerapportOgEtiketSyntetisk.ts";

const naer = (a: number | null | undefined, b: number, msg: string) => { assertExists(a, msg + " (null)"); assert(Math.abs((a as number) - b) < 0.01, `${msg}: ${a} ≠ ${b}`); };
const pctx = (t: string) => ({ fileName: "rapport.pdf", fileType: "pdf" as const, sheetNames: [], headerRows: [], rawText: t });
const PDFS = [dkEconomicSaldobalancePdfV1, dkEconomicResultatopgoerelsePdfV1, dkDineroResultatopgoerelsePdfV1, dkGenericResultatopgoerelsePdfV1];
const tjek = (can: any, navn: string) => can.validation.canonical_checks.find((c: any) => c.name === navn);
const fails = (can: any) => can.validation.canonical_checks.filter((c: any) => c.result === "FAIL").map((c: any) => `${c.name}: ${c.details}`);

// ═══════════════════════════ Balancerapport PDF ═══════════════════════════

Deno.test("balancerapport: detektion — 90 til den nye, ≤ 30 til de andre PDF-skabeloner; 0 på alle eksisterende PDF-fixtures; fingerprint unknown (AI tilladt som før)", () => {
  const ctx = pctx(BALANCERAPPORT_PDF_TEXT);
  assertEquals(dkEconomicBalancerapportPdfV1.detect(ctx), 90);
  for (const t of PDFS) assert(t.detect(ctx) <= 30, `${t.template_id} scorer ${t.detect(ctx)} på balancerapporten`);
  assertEquals(detectTemplate(ctx)?.template.template_id, "DK_ECONOMIC_BALANCERAPPORT_PDF_V1");
  for (const [n, t] of [["saldobalance", ECONOMIC_SALDOBALANCE_PDF_TEXT], ["e-conomic P&L", ECONOMIC_PNL_PDF_TEXT], ["dinero", DINERO_PNL_PDF_TEXT], ["ungarbejde", DINERO_UNGARBEJDE_MAR_TEXT], ["unbranded", fixture_unbranded_jan2025_text], ["rest dinero", REST_DINERO_PDF_TEXT], ["rest generic", REST_GENERIC_PDF_TEXT]] as const) {
    assertEquals(dkEconomicBalancerapportPdfV1.detect(pctx(t)), 0, `scorer på ${n}`);
  }
  // Den unbranded e-conomic-P&L vælger stadig sin egen skabelon på strukturvejen
  const u = tryDeterministicPdfStructuralExtraction(fixture_unbranded_jan2025_structural, fixture_unbranded_jan2025_text, "u.pdf");
  assertEquals(u.type, "success"); if (u.type === "success") assertEquals(u.template_id, "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1");
  const fp = detectSourceSystem("rapport.pdf", "pdf", BALANCERAPPORT_PDF_TEXT);
  assertEquals(fp.source_system, "unknown"); assertEquals(isAiAllowed(fp), true);
});

Deno.test("balancerapport: sidehovedet — firma, periode (dd-mm-yyyy til dd-mm-yyyy) og «Månedsrapport juni 2026» → «Juni 2026»", () => {
  const h = laesHoved(BALANCERAPPORT_PDF_TEXT);
  assertEquals(h.company_name, "Testfirma Syntetisk ApS");
  assertEquals(h.period_start, "01-06-2026"); assertEquals(h.period_end, "30-06-2026");
  assertEquals(h.report_period_label, "Juni 2026");
});

Deno.test("balancerapport: kernen — grupperne, børne-«ialt» tælles ikke, ekstraordinære → øvrige, kontrolsum 0, balancen udstedes ikke", () => {
  const r = laesBalancerapport(BALANCERAPPORT_PDF_TEXT)!;
  assertExists(r);
  assertEquals(r.konvention, "credit");
  const k = Object.fromEntries(r.fordeling.kandidater.map((x) => [x.key, x.rawValue]));
  assertEquals(k.omsaetning, -900000); assertEquals(k.direkte_omkostninger, 300000); assertEquals(k.daekningsbidrag, -600000);
  assertEquals(k.loenninger, 250000); assertEquals(k.pensioner_sociale, 40000); assertEquals(k.oevrige_personale, 10000);
  assertEquals(k.autodrift, 45000, "forælderen «Autodrift ialt» — ikke 30.000 + 15.000 + 45.000");
  assertEquals(k.oevrige_omkostninger, 4000, "ekstraordinære poster → øvrige (kontrolsummen har ingen plads til extraordinary_items)");
  assertEquals(k.finansielle_indtaegter, -200); assertEquals(k.finansieringsudgifter, 1200);
  assertEquals(k.resultat_foer_skat, -145000); assertEquals(k.arets_resultat, -145000);
  assert(!("aktiver_i_alt" in k) && !("egenkapital" in k), "balancen (bevægelser) udstedes ikke");
  assertEquals(r.fordeling.kontrolsum.result, "PASS", r.fordeling.kontrolsum.details);
  assertEquals(r.fordeling.uafklarede.map((u) => u.label), ["autodrift vareauto ialt", "autodrift personauto ialt"], "børnene står som uafklarede — de er dækket af forælderen (gab 0)");
});

for (const [navn, tekst] of [["kredit", BALANCERAPPORT_PDF_TEXT], ["forretningsfortegn", BALANCERAPPORT_PDF_TEXT_BUSINESS]] as const) {
  Deno.test(`balancerapport (${navn}): semantisk vej + legacy-vej giver samme canonical; motorens kontrolsum udaekket = 0; PASS; tjek 18 PASS`, () => {
    const sem = dkEconomicBalancerapportPdfV1.extractSemantic(null, tekst);
    assertExists(sem);
    assertEquals(sem!.sign_convention, navn === "kredit" ? "credit" : "business");
    assertEquals(sem!.parser_validation.parser_status, "PASS", JSON.stringify(sem!.parser_validation.checks));
    const can = buildCanonicalFromSemantic(sem!);
    for (const [key, v] of Object.entries(BALANCERAPPORT_FORVENTET)) naer((can.metrics as any)[key], v, `semantisk ${key}`);
    assertEquals(can.metrics.assets_total, null); assertEquals(can.metrics.extraordinary_items, null);
    assertEquals((can as any).kontrolsum?.udaekket, 0, "motorens kontrolsum (#973)");
    assertEquals(fails(can), []); assertEquals(can.validation.status, "PASS"); assertEquals(can.ai_eligible, true);
    // Kredit: alle kandidater er kredit-markerede → tjek 18 har ingen business-resultatlinje at dømme (SKIP). Business: PASS.
    assertEquals(tjek(can, "derived_sign_preserved").result, navn === "kredit" ? "SKIP" : "PASS");
    assertEquals(can.report_period_label, "Juni 2026");
    const leg = tryDeterministicPdfExtraction(tekst, "rapport.pdf");
    assertEquals(leg.type, "success", JSON.stringify(leg));
    if (leg.type !== "success") return;
    assertEquals(leg.template_id, "DK_ECONOMIC_BALANCERAPPORT_PDF_V1");
    const lc = buildCanonicalOutput(leg.extractedData, { deterministic: true, template_id: leg.template_id }, "deterministic_template");
    for (const [key, v] of Object.entries(BALANCERAPPORT_FORVENTET)) naer((lc.metrics as any)[key], v, `legacy ${key}`);
    assertEquals((lc as any).kontrolsum?.udaekket, 0); assertEquals(lc.validation.status, "PASS");
    assertEquals(leg.extractedData.report_period, "Juni 2026");
  });
}

Deno.test("balancerapport: en omkostningsgruppe hvis «ialt» er en kredit → 0 + andre driftsindtægter, kontrolsummen holder", () => {
  const t = BALANCERAPPORT_PDF_TEXT.replace("3598   Lokaleomkostninger ialt   30.000,00", "3598   Lokaleomkostninger ialt   -30.000,00")
    .replace("3998   Resultat før afskrivninger   -155.000,00", "3998   Resultat før afskrivninger   -215.000,00")
    .replace("4598   Indtjeningsbidrag   -150.000,00", "4598   Indtjeningsbidrag   -210.000,00")
    .replace("4798   Resultat før finansielle poster   -150.000,00", "4798   Resultat før finansielle poster   -210.000,00")
    .replace("5198   Resultat før ekstraordinære poster   -149.000,00", "5198   Resultat før ekstraordinære poster   -209.000,00")
    .replace("5298   Resultat før skat   -145.000,00", "5298   Resultat før skat   -205.000,00")
    .replace("5998   Årets resultat   -145.000,00", "5998   Årets resultat   -205.000,00");
  const can = buildCanonicalFromSemantic(dkEconomicBalancerapportPdfV1.extractSemantic(null, t)!);
  assertEquals(can.metrics.facility_costs, 0); naer(can.metrics.other_operating_income, 30000, "andre driftsindtægter");
  naer(can.metrics.ebt, 205000, "ebt"); assertEquals((can as any).kontrolsum?.udaekket, 0); assertEquals(can.validation.status, "PASS");
});

// ═══════════════════════════ etiket;beløb-CSV ═══════════════════════════

Deno.test("etiket-csv: hjælperne — tal i hele kroner (ganges ikke op), normEtiket, tolerant æ/ø/å", () => {
  assertEquals(tilTal("551.000"), 551000); assertEquals(tilTal("18000"), 18000); assertEquals(tilTal("-113.000"), -113000);
  assertEquals(tilTal("1.234,56"), 1234.56); assertEquals(tilTal("Juni"), null); assertEquals(tilTal(""), null);
  assertEquals(normEtiket("  Likvide beholdninger  "), "likvide beholdninger");
  assert(tolerant("^årets resultat$").test("�rets resultat")); assert(tolerant("^årets resultat$").test("årets resultat"));
  assert(tolerant("^(netto)?omsætning$").test("nettooms�tning")); assert(!tolerant("^årets resultat$").test("skat af årets resultat"));
});

for (const [navn, csv] of [["utf-8", ETIKET_CSV_UTF8], ["klientens (æ/ø/å tabt)", ETIKET_CSV_KLIENT]] as const) {
  Deno.test(`etiket-csv (${navn}): detektion 90, Dinero 0, registret vælger den; semantisk vej PASS, kontrolsum 0, alle grupper, balancen, perioden «Juni 2026»`, () => {
    const parsed = parseCsvRaw(csv);
    const ctx = buildCsvDetectionContext(parsed, "Juni_2026.csv");
    assertEquals(dkEtiketResultatBalanceCsvV1.detect(ctx), 90);
    assertEquals(dkDineroResultatopgoerelseCsvV1.detect(ctx), 0);
    assertEquals(detectTemplate(ctx)?.template.template_id, "DK_ETIKET_RESULTAT_BALANCE_CSV_V1");
    const r = trySemanticCsvExtraction(csv, "Juni_2026.csv");
    assertEquals(r.type, "success", JSON.stringify(r));
    if (r.type !== "success") return;
    assertEquals(r.semantic.parser_validation.parser_status, "PASS", JSON.stringify(r.semantic.parser_validation.checks));
    assertEquals(r.semantic.parser_validation.checks.find((c) => c.name === "fixed_costs_sum")?.result, "PASS");
    assertEquals(r.semantic.report_period_label, "Juni 2026"); assertEquals(r.semantic.period_start, "2026-06-01"); assertEquals(r.semantic.period_end, "2026-06-30");
    const can = buildCanonicalFromSemantic(r.semantic);
    for (const [key, v] of Object.entries(ETIKET_FORVENTET)) naer((can.metrics as any)[key], v, `${key}`);
    assertEquals((can as any).kontrolsum?.udaekket, 0, "motorens kontrolsum (#973)");
    assertEquals(fails(can), []); assertEquals(can.validation.status, "PASS"); assertEquals(can.ai_eligible, true);
    assertEquals(tjek(can, "derived_sign_preserved").result, "PASS");
    assertEquals(can.report_period_label, "Juni 2026");
    const fp = detectSourceSystem("Juni_2026.csv", "csv", csv); assertEquals(fp.source_system, "unknown");
  });
}

Deno.test("etiket-csv: legacy-vejen (headerRows tom, rawText) giver samme tal", () => {
  const leg = tryDeterministicCsvExtraction(ETIKET_CSV_KLIENT, "Juni_2026.csv");
  assertEquals(leg.type, "success", JSON.stringify(leg));
  if (leg.type !== "success") return;
  assertEquals(leg.template_id, "DK_ETIKET_RESULTAT_BALANCE_CSV_V1");
  const lc = buildCanonicalOutput(leg.extractedData, { deterministic: true, template_id: leg.template_id }, "deterministic_template");
  for (const key of ["revenue", "cogs", "payroll", "other_costs", "vehicle_costs", "ebt", "net_result", "assets_total", "equity_total"] as const) naer(lc.metrics[key], (ETIKET_FORVENTET as any)[key], `legacy ${key}`);
  assertEquals((lc as any).kontrolsum?.udaekket, 0); assertEquals(leg.extractedData.report_period, "Juni 2026");
});

Deno.test("etiket-csv: kernen — en P&L-etiket uden matcher tæller i øvrige (ingen linje tabes); uden år er perioden null; Dinero-CSV scorer 0", () => {
  const rows = (t: string) => parseCsvRaw(t).rows;
  const l = laesEtiketter(rows(ETIKET_CSV_UTF8.replace("Produktionsomkostninger;2.000", "Rejseomkostninger;2.000")), "");
  assertEquals(l.vaerdier.oevrige_omkostninger, 20000); assert(l.oevrigeFra.some((x) => x.startsWith("Rejseomkostninger")));
  assertEquals(l.afvigelse, 0);
  const u = laesEtiketter(rows(ETIKET_CSV_UTF8.replace("Balance 2026;", "Balance;")), "Juni.csv");
  assertEquals(u.aar, null);
  const sem = dkEtiketResultatBalanceCsvV1.extractSemanticFromCsv!(parseCsvRaw(ETIKET_CSV_UTF8.replace("Balance 2026;", "Balance;")))!;
  assertEquals(sem.report_period_label, null, "uden år: ingen etiket — index.ts falder tilbage på filnavnet");
  assertEquals(dkEtiketResultatBalanceCsvV1.detect(buildCsvDetectionContext(parseCsvRaw(REST_DINERO_CSV), "r.csv")), 0);
});
