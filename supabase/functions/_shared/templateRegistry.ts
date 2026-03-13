/**
 * Template Registry — Phase 4 + 4b + 5 + 6 + 7
 * Handles deterministic template detection with ambiguity rule and extraction routing.
 * Supports Excel, PDF, and CSV file types.
 * Phase 5: Structural PDF extraction routing via extractSemantic().
 * Phase 6: Structural XLSX extraction routing via extractSemanticFromXlsx().
 * Phase 7: Structural CSV extraction routing via extractSemanticFromCsv().
 */

import * as XLSX from "npm:xlsx@0.18.5";
import type { PdfStructuralPayload } from "./pdfStructuralTypes.ts";
import type { SemanticExtractionResult } from "./semanticTypes.ts";
import type { XlsxParseResult } from "./xlsxRawParser.ts";
import type { CsvParseResult, CsvColumnProfile } from "./csvRawParser.ts";

// ── Discriminated Union for Extraction Results ──

export type DeterministicExtractionResult =
  | { type: "no_match" }
  | { type: "structural_fail"; template_id: string; error: string }
  | { type: "success"; template_id: string; confidence: number; extractedData: DeterministicExtractedData };

// ── Detection Context ──

export interface DetectionContext {
  fileName: string;
  fileType: "xlsx" | "xls" | "csv" | "pdf";
  sheetNames: string[];
  headerRows: any[][];
  rawText?: string; // For PDF templates (legacy)
  // CSV structural fields (Phase 7 — used by buildCsvDetectionContext)
  csvHeaders?: string[];
  csvDelimiter?: string;
  csvColumnProfile?: CsvColumnProfile[];
}

// ── Extraction Context ──

export interface ExtractionContext extends DetectionContext {
  rows: any[][];
}

// ── Parser Validation (passed to canonical engine) ──

export interface ParserValidation {
  parser_status: "PASS" | "FAIL";
  checks: Array<{
    name: string;
    result: "PASS" | "FAIL" | "SKIP";
    details: string;
  }>;
}

// ── Deterministic Metadata ──

export interface DeterministicMeta {
  template_id: string;
  parser_confidence: "HIGH" | "MEDIUM" | "LOW";
  detection_score: number;
  parser_validation_status: "PASS" | "FAIL";
  parser_validation_errors: string[];
  raw_line_count: number;
  normalized_line_count: number;
  column_basis_rule?: "single" | "mixed";
}

// ── Extracted Data Shape from Deterministic Templates ──

export interface DeterministicExtractedData {
  report_type: string;
  company_name: string | null;
  cvr_number?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  report_period?: string | null;
  key_figures: Record<string, number | null>;
  line_items: Array<{
    name: string;
    period_amount: number | null;
    ytd_amount: number | null;
    raw_sign: string | null;
    account_no: string | null;
    class?: string;
  }>;
  validation: ParserValidation;
  _deterministic_meta: DeterministicMeta;
}

// ── Template Entry Interface ──

export interface TemplateEntry {
  template_id: string;
  label: string;
  supported_file_types: ("xlsx" | "xls" | "csv" | "pdf")[];
  statement_type: "pnl" | "balance" | "combined" | "trial_balance";

  detect(ctx: DetectionContext): number;

  extract(ctx: ExtractionContext): { success: true; data: DeterministicExtractedData } | { success: false; error: string };
}

// ── Template with Semantic Extraction (Phase 5 — PDF) ──

export interface SemanticTemplateEntry extends TemplateEntry {
  extractSemantic: (structural: PdfStructuralPayload | null, textContent: string) => SemanticExtractionResult | null;
}

/** Type guard: does this template support PDF semantic extraction? */
export function hasSemanticExtraction(t: TemplateEntry): t is SemanticTemplateEntry {
  return typeof (t as any).extractSemantic === "function";
}

// ── Template with Semantic XLSX Extraction (Phase 6) ──

export interface SemanticXlsxTemplateEntry extends TemplateEntry {
  extractSemanticFromXlsx: (xlsxResult: XlsxParseResult) => SemanticExtractionResult | null;
}

/** Type guard: does this template support XLSX semantic extraction? */
export function hasSemanticXlsxExtraction(t: TemplateEntry): t is SemanticXlsxTemplateEntry {
  return typeof (t as any).extractSemanticFromXlsx === "function";
}

// ── Template with Semantic CSV Extraction (Phase 7) ──

export interface SemanticCsvTemplateEntry extends TemplateEntry {
  extractSemanticFromCsv: (csvResult: CsvParseResult) => SemanticExtractionResult | null;
}

/** Type guard: does this template support CSV semantic extraction? */
export function hasSemanticCsvExtraction(t: TemplateEntry): t is SemanticCsvTemplateEntry {
  return typeof (t as any).extractSemanticFromCsv === "function";
}

// ── Detection Result ──

export interface DetectionResult {
  template: TemplateEntry;
  score: number;
}

// ── Template Registry ──

import { dkCombinedBalancePnlV1 } from "./templates/dkCombinedBalancePnlV1.ts";
import { dkEconomicSaldobalancePdfV1 } from "./templates/dkEconomicSaldobalancePdfV1.ts";
import { dkEconomicResultatopgoerelsePdfV1 } from "./templates/dkEconomicResultatopgoerelsePdfV1.ts";
import { dkEconomicResultatopgoerelseXlsxV1 } from "./templates/dkEconomicResultatopgoerelseXlsxV1.ts";
import { dkDineroResultatopgoerelseCsvV1 } from "./templates/dkDineroResultatopgoerelseCsvV1.ts";
import { dkDineroResultatopgoerelsePdfV1 } from "./templates/dkDineroResultatopgoerelsePdfV1.ts";

const TEMPLATE_REGISTRY: TemplateEntry[] = [
  dkCombinedBalancePnlV1,
  dkEconomicSaldobalancePdfV1,
  dkEconomicResultatopgoerelsePdfV1,
  dkEconomicResultatopgoerelseXlsxV1,
  dkDineroResultatopgoerelseCsvV1,
  dkDineroResultatopgoerelsePdfV1,
];

// ── Detection with Ambiguity Rule ──

export function detectTemplate(ctx: DetectionContext): DetectionResult | null {
  const scores: { template: TemplateEntry; score: number }[] = [];

  for (const t of TEMPLATE_REGISTRY) {
    if (!t.supported_file_types.includes(ctx.fileType)) continue;
    const score = t.detect(ctx);
    scores.push({ template: t, score });
  }

  const debugScores = scores
    .map(({ template, score }) => `${template.template_id}:${score}`)
    .join(", ");
  console.log(`[Registry] Detection scores (${ctx.fileType}): ${debugScores || "none"}`);

  const positiveScores = scores.filter((entry) => entry.score > 0);
  positiveScores.sort((a, b) => b.score - a.score);

  const best = positiveScores[0];
  if (!best || best.score < 80) return null;

  const secondBest = positiveScores[1];
  if (secondBest && best.score - secondBest.score < 10) {
    console.log(`[Registry] Ambiguous detection: ${best.template.template_id}=${best.score}, ${secondBest.template.template_id}=${secondBest.score} (gap < 10)`);
    return null;
  }

  console.log(`[Registry] Template detected: ${best.template.template_id} (score ${best.score})`);
  return { template: best.template, score: best.score };
}

// ── Structural PDF Extraction (Phase 5) ──

export type StructuralExtractionResult =
  | { type: "no_match" }
  | { type: "no_semantic_support" }
  | { type: "semantic_fail"; template_id: string; error: string }
  | { type: "success"; template_id: string; score: number; semantic: SemanticExtractionResult };

/**
 * Try structural-first extraction for a PDF using the validated structural payload.
 */
export function tryDeterministicPdfStructuralExtraction(
  structural: PdfStructuralPayload,
  textContent: string,
  fileName: string,
): StructuralExtractionResult {
  const ctx: DetectionContext = {
    fileName,
    fileType: "pdf",
    sheetNames: [],
    headerRows: [],
    rawText: textContent,
  };

  const match = detectTemplate(ctx);
  if (!match) {
    console.log("[Registry] No template matched for structural extraction");
    return { type: "no_match" };
  }

  if (!hasSemanticExtraction(match.template)) {
    console.log(`[Registry] Template ${match.template.template_id} does not support semantic extraction`);
    return { type: "no_semantic_support" };
  }

  const semanticTemplate = match.template as SemanticTemplateEntry;
  const semantic = semanticTemplate.extractSemantic(structural, textContent);
  if (!semantic) {
    return {
      type: "semantic_fail",
      template_id: match.template.template_id,
      error: "extractSemantic returned null (structural acceptance or extraction failed)",
    };
  }

  semantic._deterministic_meta.detection_score = match.score;

  console.log(`[Registry] Structural semantic extraction successful: ${match.template.template_id}`);
  return {
    type: "success",
    template_id: match.template.template_id,
    score: match.score,
    semantic,
  };
}

// ── Semantic XLSX Extraction (Phase 6) ──

/**
 * Try semantic-first extraction for an XLSX file via XlsxParseResult.
 * Returns StructuralExtractionResult for uniform routing.
 */
export function trySemanticExcelExtraction(
  excelBase64: string,
  fileName: string
): StructuralExtractionResult {
  const { parseXlsxRawFromBase64, buildXlsxDetectionContext } = (() => {
    // Dynamic import workaround — these are in the same _shared folder
    // Using static import at top would create circular dependency
    const mod = require("./xlsxRawParser.ts");
    return mod;
  })();

  let xlsxResult: XlsxParseResult;
  try {
    xlsxResult = parseXlsxRawFromBase64(excelBase64);
  } catch (e: any) {
    console.error("[Registry] XLSX parse error for semantic path:", e?.message);
    return { type: "no_match" };
  }

  const ctx = buildXlsxDetectionContext(xlsxResult, fileName);
  const match = detectTemplate(ctx);
  if (!match) {
    console.log("[Registry] No template matched for XLSX semantic extraction");
    return { type: "no_match" };
  }

  if (!hasSemanticXlsxExtraction(match.template)) {
    console.log(`[Registry] Template ${match.template.template_id} does not support XLSX semantic extraction`);
    return { type: "no_semantic_support" };
  }

  const semanticTemplate = match.template as SemanticXlsxTemplateEntry;
  const semantic = semanticTemplate.extractSemanticFromXlsx(xlsxResult);
  if (!semantic) {
    return {
      type: "semantic_fail",
      template_id: match.template.template_id,
      error: "extractSemanticFromXlsx returned null",
    };
  }

  semantic._deterministic_meta.detection_score = match.score;

  console.log(`[Registry] XLSX semantic extraction successful: ${match.template.template_id}`);
  return {
    type: "success",
    template_id: match.template.template_id,
    score: match.score,
    semantic,
  };
}

// ── Semantic CSV Extraction (Phase 7) ──

/**
 * Try semantic-first extraction for a CSV file via CsvParseResult.
 * Returns StructuralExtractionResult for uniform routing.
 */
export function trySemanticCsvExtraction(
  csvText: string,
  fileName: string
): StructuralExtractionResult {
  const { parseCsvRaw, buildCsvDetectionContext } = (() => {
    const mod = require("./csvRawParser.ts");
    return mod;
  })();

  const csvResult: CsvParseResult = parseCsvRaw(csvText);

  const ctx = buildCsvDetectionContext(csvResult, fileName);
  const match = detectTemplate(ctx);
  if (!match) {
    console.log("[Registry] No template matched for CSV semantic extraction");
    return { type: "no_match" };
  }

  if (!hasSemanticCsvExtraction(match.template)) {
    console.log(`[Registry] Template ${match.template.template_id} does not support CSV semantic extraction`);
    return { type: "no_semantic_support" };
  }

  const semanticTemplate = match.template as SemanticCsvTemplateEntry;
  const semantic = semanticTemplate.extractSemanticFromCsv(csvResult);
  if (!semantic) {
    return {
      type: "semantic_fail",
      template_id: match.template.template_id,
      error: "extractSemanticFromCsv returned null",
    };
  }

  semantic._deterministic_meta.detection_score = match.score;

  console.log(`[Registry] CSV semantic extraction successful: ${match.template.template_id}`);
  return {
    type: "success",
    template_id: match.template.template_id,
    score: match.score,
    semantic,
  };
}

// ── Excel Extraction (Phase 4 — legacy) ──

export async function tryDeterministicExtraction(
  excelBase64: string,
  fileName: string
): Promise<DeterministicExtractionResult> {

  let rows: any[][];
  let sheetNames: string[];

  try {
    const binaryString = atob(excelBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const workbook = XLSX.read(bytes, { type: "array" });
    sheetNames = workbook.SheetNames;
    const worksheet = workbook.Sheets[sheetNames[0]];
    rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });
    console.log(`[Registry] Parsed ${rows.length} rows from sheet "${sheetNames[0]}"`);
  } catch (e: any) {
    const message = e?.message || "Unknown Excel parse error";
    console.error("[Registry] Excel parse error:", message);
    return { type: "structural_fail", template_id: "EXCEL_PARSE", error: message };
  }

  const fileType: "xlsx" | "xls" = fileName.toLowerCase().endsWith(".xls") && !fileName.toLowerCase().endsWith(".xlsx")
    ? "xls" : "xlsx";

  const ctx: DetectionContext = {
    fileName, fileType, sheetNames,
    headerRows: rows.slice(0, 200),
  };

  return runDetectionAndExtraction(ctx, rows);
}

// ── PDF Extraction (Phase 4b — legacy text path) ──

export function tryDeterministicPdfExtraction(
  textContent: string,
  fileName: string
): DeterministicExtractionResult {
  if (!textContent || textContent.length < 50) {
    console.log("[Registry] PDF text too short for deterministic extraction");
    return { type: "no_match" };
  }

  const ctx: DetectionContext = {
    fileName,
    fileType: "pdf",
    sheetNames: [],
    headerRows: [],
    rawText: textContent,
  };

  return runDetectionAndExtraction(ctx, []);
}

// ── CSV Extraction (Phase 5 — legacy) ──

export function tryDeterministicCsvExtraction(
  csvText: string,
  fileName: string
): DeterministicExtractionResult {
  if (!csvText || csvText.length < 20) {
    console.log("[Registry] CSV text too short for deterministic extraction");
    return { type: "no_match" };
  }

  const ctx: DetectionContext = {
    fileName,
    fileType: "csv",
    sheetNames: [],
    headerRows: [],
    rawText: csvText,
  };

  return runDetectionAndExtraction(ctx, []);
}

// ── Shared Detection + Extraction Logic ──

function runDetectionAndExtraction(
  ctx: DetectionContext,
  rows: any[][]
): DeterministicExtractionResult {
  const match = detectTemplate(ctx);
  if (!match) {
    console.log("[Registry] No template matched confidently → AI fallback");
    return { type: "no_match" };
  }

  const extractionCtx: ExtractionContext = { ...ctx, rows };
  const result = match.template.extract(extractionCtx);

  if (!result.success) {
    console.log(`[Registry] Template ${match.template.template_id} structural failure: ${result.error}`);
    return { type: "structural_fail", template_id: match.template.template_id, error: result.error };
  }

  // Set detection score in meta
  result.data._deterministic_meta.detection_score = match.score;

  console.log(`[Registry] Template ${match.template.template_id} extraction successful`);
  return {
    type: "success",
    template_id: match.template.template_id,
    confidence: match.score,
    extractedData: result.data,
  };
}
