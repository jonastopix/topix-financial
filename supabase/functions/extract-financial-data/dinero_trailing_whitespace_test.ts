/**
 * Regression: Dinero-eksport med trailing whitespace
 *
 * BESKYTTER MOD: bug #2 (UNGARBEJDE.DK / Ole) hvor Dinero-PDF-eksportens
 * trailing mellemrum efter beløb brækkede $-anchoren i generic-templatens
 * ALL-CAPS-subtotal-regex. Resultat: detect=75 < 80 → no_match → AI-fallback
 * læste salg/admin forkert.
 *
 * Efter fixet (\s* før $ i dkGenericResultatopgoerelsePdfV1.detect()):
 * generic scorer >= 80, vinder, og den deterministiske extractor læser
 * salg/admin korrekt for begge Oles faktiske måneder.
 */

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectTemplate,
  tryDeterministicPdfExtraction,
  type DetectionContext,
} from "../_shared/templateRegistry.ts";
import {
  DINERO_UNGARBEJDE_MAR_TEXT,
  DINERO_UNGARBEJDE_APR_TEXT,
} from "../_test_fixtures/pdfParserFixtures.ts";

const GENERIC_ID = "DK_GENERIC_RESULTATOPGOERELSE_PDF_V1";

interface Case {
  label: string;
  text: string;
  fileName: string;
  salgsomkostninger: number;
  administrationsomkostninger: number;
}

const CASES: Case[] = [
  {
    label: "Marts 2026",
    text: DINERO_UNGARBEJDE_MAR_TEXT,
    fileName: "1780290706846-Mar.pdf",
    salgsomkostninger: 10016.44,
    administrationsomkostninger: 19255.38,
  },
  {
    label: "April 2026",
    text: DINERO_UNGARBEJDE_APR_TEXT,
    fileName: "1780290705584-Apr.pdf",
    salgsomkostninger: 7815.51,
    administrationsomkostninger: 65731.8,
  },
];

for (const c of CASES) {
  Deno.test(
    `Dinero-eksport med trailing whitespace (${c.label}) vælger generic template og læser salg/admin korrekt`,
    () => {
      const ctx: DetectionContext = {
        fileName: c.fileName,
        fileType: "pdf",
        sheetNames: [],
        headerRows: [],
        rawText: c.text,
      };

      // 1) Detektion: generic skal vinde med score >= 80
      const match = detectTemplate(ctx);
      assert(match !== null, `${c.label}: forventede et template-match, fik no_match`);
      assertEquals(
        match!.template.template_id,
        GENERIC_ID,
        `${c.label}: forkert template valgt`,
      );
      assert(
        match!.score >= 80,
        `${c.label}: generic score ${match!.score} skal være >= 80`,
      );

      // 2) Ekstraktion: salg/admin skal læses korrekt
      const result = tryDeterministicPdfExtraction(c.text, c.fileName);
      assertEquals(result.type, "success", `${c.label}: ekstraktion fejlede (${result.type})`);
      if (result.type !== "success") return;

      const kf = result.extractedData.key_figures;
      assertEquals(
        kf.salgsomkostninger,
        c.salgsomkostninger,
        `${c.label}: salgsomkostninger forkert`,
      );
      assertEquals(
        kf.administrationsomkostninger,
        c.administrationsomkostninger,
        `${c.label}: administrationsomkostninger forkert`,
      );
    },
  );
}
