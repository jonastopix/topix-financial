/**
 * Filnavnet vejer ikke — Dinero-CSV afgøres på indholdet (10/9-2026)
 *
 * BESKYTTER MOD: tre strandinger målt i prod 10/9 (Rezycl 23/8, Booking
 * Innovation 9/7 og 9/8). Filerne hed «Saldobalance.csv» og «Saldobalance maj
 * 26.csv», bar overskriften Konto;Kontonavn;Beløb (fingerprintet sagde dinero,
 * HIGH) — og skabelonen returnerede 0 fordi filnavnet indeholdt «balance».
 * Kilden blev afgjort af indholdet, skabelonen af navnet.
 *
 * Nu: et firecifret kontonummer + et beløb er en resultatlinje (skabelonens
 * egen model, RANGE_CLASSES 1000–9999 — samme regel extract() altid har brugt
 * til at springe balancekonti over). Filnavnet læses ikke.
 */

import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectTemplate,
  tryDeterministicCsvExtraction,
  trySemanticCsvExtraction,
  type DetectionContext,
} from "../_shared/templateRegistry.ts";
import { parseCsvRaw, buildCsvDetectionContext } from "../_shared/csvRawParser.ts";

const DINERO_ID = "DK_DINERO_RESULTATOPGOERELSE_V1";

// En Dinero-resultatopgørelse: bogføringens fortegn (omsætning negativ), ≥ 5 kendte labels.
const RESULTAT_LINJER = `1000;Salg af varer;-120.000,00
1100;Salg af ydelser;-30.000,00
2000;Vareforbrug;45.000,00
3000;Løn;38.000,00
3020;Arbejdsgiver ATP;198,00
4000;Markedsføring;4.500,00
5000;Husleje;8.000,00
7000;Bogføring og revision;3.200,00
7320;Køb af software;981,37
8100;Renteudgifter;250,00`;

// Balancekonti som en saldobalance også bærer — kontonumre der IKKE er firecifrede.
// Navnene er valgt så de RAMMER labels (a-skat → payroll, afskrivning → depreciation,
// rente → financial_costs): de må ikke tælle med.
const BALANCE_LINJER = `55000;Bankkonto;125.000,00
56000;Debitorer;40.000,00
57000;Akkumulerede afskrivninger;-15.000,00
71000;Egenkapital;-80.000,00
73000;Kreditorer;-22.000,00
76000;Skyldig moms;-9.500,00
77000;Skyldig A-skat;-6.200,00
77100;Skyldige renter;-400,00`;

const RESULTATOPGOERELSE_CSV = `﻿Konto;Kontonavn;Beløb\n${RESULTAT_LINJER}`;
const SALDOBALANCE_CSV = `﻿Konto;Kontonavn;Beløb\n${RESULTAT_LINJER}\n${BALANCE_LINJER}`;
const SALDOBALANCE_BALANCE_FOERST_CSV = `﻿Konto;Kontonavn;Beløb\n${BALANCE_LINJER}\n${RESULTAT_LINJER}`;
const REN_BALANCE_CSV = `﻿Konto;Kontonavn;Beløb\n${BALANCE_LINJER}`;

/** Den strukturelle vej — præcis som extract-financial-data kalder den. */
function strukturelKontekst(csv: string, fileName: string): DetectionContext {
  return buildCsvDetectionContext(parseCsvRaw(csv), fileName);
}

/** Den gamle tekstvej (rawText, ingen csvHeaders). */
function tekstKontekst(csv: string, fileName: string): DetectionContext {
  return { fileName, fileType: "csv", sheetNames: [], headerRows: [], rawText: csv };
}

const DE_TRE_FILNAVNE = ["Saldobalance.csv", "Saldobalance maj 26.csv", "Saldobalance.csv"];

Deno.test("Filnavnet — de tre strandede filnavne giver point i BEGGE detektionsveje", () => {
  for (const fileName of DE_TRE_FILNAVNE) {
    for (const [vej, ctx] of [
      ["strukturel", strukturelKontekst(SALDOBALANCE_CSV, fileName)],
      ["tekst", tekstKontekst(SALDOBALANCE_CSV, fileName)],
    ] as const) {
      const match = detectTemplate(ctx);
      assertExists(match, `${fileName} (${vej}): skal matche på indholdet`);
      assertEquals(match!.template.template_id, DINERO_ID, `${fileName} (${vej})`);
      assert(match!.score >= 80, `${fileName} (${vej}): score ${match!.score} < 80`);
    }
  }
});

Deno.test("Filnavnet — samme indhold scorer ens uanset navn («Resultat.csv», «data_export.csv», «Saldobalance.csv»)", () => {
  const scores = ["Resultat.csv", "data_export.csv", "Saldobalance.csv", "BALANCE 2026.csv"].map((fn) => {
    const m = detectTemplate(strukturelKontekst(RESULTATOPGOERELSE_CSV, fn));
    assertExists(m, fn);
    return m!.score;
  });
  assertEquals(new Set(scores).size, 1, `Scorerne skal være ens: ${scores.join(", ")}`);
  assert(scores[0] >= 80);
});

Deno.test("Indholdet — en fil der FAKTISK kun er en balance (ingen firecifrede konti) når ikke 80", () => {
  for (const fileName of ["Balance.csv", "Resultatopgørelse.csv"]) {
    const s = detectTemplate(strukturelKontekst(REN_BALANCE_CSV, fileName));
    const t = detectTemplate(tekstKontekst(REN_BALANCE_CSV, fileName));
    assertEquals(s, null, `${fileName} (strukturel): en ren balance må ikke matche resultatskabelonen`);
    assertEquals(t, null, `${fileName} (tekst): en ren balance må ikke matche resultatskabelonen`);
  }
});

Deno.test("Indholdet — en saldobalance læses som sin resultatopgørelse: balancekonti springes over, tallene er de samme", () => {
  const ren = tryDeterministicCsvExtraction(RESULTATOPGOERELSE_CSV, "Resultat.csv");
  const saldo = tryDeterministicCsvExtraction(SALDOBALANCE_CSV, "Saldobalance.csv");
  assertEquals(ren.type, "success");
  assertEquals(saldo.type, "success");
  if (ren.type !== "success" || saldo.type !== "success") return;

  assertEquals(saldo.extractedData.key_figures, ren.extractedData.key_figures, "Balancekonti må ikke ændre et eneste nøgletal");
  assertEquals(saldo.extractedData.line_items.length, ren.extractedData.line_items.length, "Balancelinjer må ikke blive line_items");
  const skipped = saldo.extractedData.validation.checks.find((c) => c.name === "balance_lines_skipped");
  assertExists(skipped, "Antallet af oversprungne balancelinjer skal stå i parser_validation");
  assertEquals(skipped!.result, "PASS");
  assert(skipped!.details.startsWith("8 "), skipped!.details);
  // Kontrol: labels på balancekonti (a-skat, afskrivning, rente) lækkede ikke ind
  assertEquals(saldo.extractedData.key_figures.loenninger, 38198);
  assertEquals(saldo.extractedData.key_figures.afskrivninger, 0);
  assertEquals(saldo.extractedData.key_figures.finansielle_omkostninger, 250);
  // En ren resultatopgørelse får ingen balance-check
  assertEquals(ren.extractedData.validation.checks.some((c) => c.name === "balance_lines_skipped"), false);
});

Deno.test("Indholdet — den semantiske vej: saldobalance og resultatopgørelse giver samme kandidater", () => {
  const ren = trySemanticCsvExtraction(RESULTATOPGOERELSE_CSV, "Resultat.csv");
  const saldo = trySemanticCsvExtraction(SALDOBALANCE_CSV, "Saldobalance.csv");
  assertEquals(ren.type, "success");
  assertEquals(saldo.type, "success");
  if (ren.type !== "success" || saldo.type !== "success") return;
  const kandidater = (r: typeof ren) =>
    r.semantic.metric_candidates.map((c) => [c.source_field_id, c.raw_value]).sort();
  assertEquals(kandidater(saldo), kandidater(ren));
  assertEquals(saldo.semantic.line_items.length, ren.semantic.line_items.length);
  const skipped = saldo.semantic.parser_validation.checks.find((c) => c.name === "balance_lines_skipped");
  assertExists(skipped);
  assert(skipped!.details.startsWith("8 "));
});

Deno.test("Vinduet — balancekonti FØRST i filen må ikke skjule resultatlinjerne for detektionen", () => {
  const m = detectTemplate(strukturelKontekst(SALDOBALANCE_BALANCE_FOERST_CSV, "Saldobalance.csv"));
  assertExists(m, "Ti rækkers vindue ville have set otte balancelinjer og to resultatlinjer");
  assert(m!.score >= 80, `score ${m!.score}`);
});
