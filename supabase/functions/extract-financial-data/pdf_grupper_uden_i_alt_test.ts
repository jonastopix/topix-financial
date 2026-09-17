/**
 * pdf_grupper_uden_i_alt_test.ts — grupper uden «i alt» i saldobalance-PDF (KJ AUTO-formen) og de nye gruppenavne i
 * PDF-resultatopgørelsen (BRILLEVÆRK-formen), 17/9-2026. Fixtures syntetiske. Samme prøver som vitest-testen.
 * Kør: deno test --node-modules-dir=none --allow-read --allow-env --allow-net supabase/functions/extract-financial-data/pdf_grupper_uden_i_alt_test.ts
 */
import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dkEconomicSaldobalancePdfV1, linjerAfTekst } from "../_shared/templates/dkEconomicSaldobalancePdfV1.ts";
import { dkEconomicResultatopgoerelsePdfV1 } from "../_shared/templates/dkEconomicResultatopgoerelsePdfV1.ts";
import { buildCanonicalFromSemantic, buildCanonicalOutput } from "../_shared/canonicalEngine.ts";
import { bygGruppetrae } from "../_shared/gruppetrae.ts";
import { KJ_FORM_FORVENTET, KJ_FORM_TEKST } from "../_test_fixtures/saldobalancePdfGrupperSyntetisk.ts";
import { BRILLEVAERK_FORM_FORVENTET, brillevaerkFormen, bygStrukturel } from "../_test_fixtures/pnlPdfBrillevaerkSyntetisk.ts";

const naer = (m: Record<string, number | null>, f: Record<string, number>) => { for (const [k, v] of Object.entries(f)) assertAlmostEquals(m[k] as number, v, 0.01, k); };

Deno.test("gruppetræ: KJ-formen — nesting og rodgrupper", () => {
  const roots = bygGruppetrae(linjerAfTekst(KJ_FORM_TEKST).PNL);
  assertEquals(roots.map((g) => g.norm), ["nettoomsætning", "vareforbrug", "dækningsbidrag", "kapacitetsomkostninger", "resultat før renter", "renteudgifter", "resultat før ekstraordinære poster", "resultat"]);
  const kap = roots[3];
  assertEquals(kap.children.length, 6);
  assertEquals(kap.children[1].children.map((c) => c.norm), ["løn i alt"]);
});

Deno.test("saldobalance-PDF, KJ-formen: alle grupper, indtægt i omkostningsafsnittet, renter, resultat, balance — kontrolsum 0, PASS", () => {
  const r = dkEconomicSaldobalancePdfV1.extract({ fileName: "syntetisk.pdf", fileType: "pdf", sheetNames: [], headerRows: [], rawText: KJ_FORM_TEKST, rows: [] });
  assert(r.success, "extract fejlede");
  const c = buildCanonicalOutput(r.data, {}, "deterministic_template");
  naer(c.metrics as unknown as Record<string, number | null>, KJ_FORM_FORVENTET);
  assertEquals(c.kontrolsum?.udaekket, 0);
  assertEquals(c.validation.status, "PASS");
  assertEquals(c.validation.canonical_checks.find((x) => x.name === "cost_lines_present")?.result, "PASS");
});

Deno.test("PDF-resultatopgørelse, BRILLEVÆRK-formen: begge personale-varianter → samme tal, kontrolsum 0", () => {
  for (const med of [true, false]) {
    const s = dkEconomicResultatopgoerelsePdfV1.extractSemantic(bygStrukturel(brillevaerkFormen(med)), "");
    assert(s, "extractSemantic gav null");
    const c = buildCanonicalFromSemantic(s);
    naer(c.metrics as unknown as Record<string, number | null>, BRILLEVAERK_FORM_FORVENTET);
    assertEquals(c.kontrolsum?.udaekket, 0);
    assertEquals(c.validation.status, "PASS");
    assertEquals(s.metric_candidates.find((x) => x.source_field_id === "direkte_omkostninger")?.source_label, "Vareforbrug øvrigt i alt");
  }
});
