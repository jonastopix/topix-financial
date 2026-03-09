/**
 * Template Registry — Phase 4 + 4b
 * Handles deterministic template detection with ambiguity rule and extraction routing.
 * Supports both Excel and PDF file types.
 */

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
  rawText?: string; // For PDF templates
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

// ── Detection Result ──

export interface DetectionResult {
  template: TemplateEntry;
  score: number;
}

// ── Template Registry ──

import { dkCombinedBalancePnlV1 } from "./templates/dkCombinedBalancePnlV1.ts";
import { dkEconomicSaldobalancePdfV1 } from "./templates/dkEconomicSaldobalancePdfV1.ts";
import { dkEconomicResultatopgoerelsePdfV1 } from "./templates/dkEconomicResultatopgoerelsePdfV1.ts";

const TEMPLATE_REGISTRY: TemplateEntry[] = [
  dkCombinedBalancePnlV1,
  dkEconomicSaldobalancePdfV1,
  dkEconomicResultatopgoerelsePdfV1,
];

// ── Detection with Ambiguity Rule ──

export function detectTemplate(ctx: DetectionContext): DetectionResult | null {
  const scores: { template: TemplateEntry; score: number }[] = [];

  for (const t of TEMPLATE_REGISTRY) {
    if (!t.supported_file_types.includes(ctx.fileType)) continue;
    const score = t.detect(ctx);
    if (score > 0) scores.push({ template: t, score });
  }

  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  if (!best || best.score < 80) return null;

  const secondBest = scores[1];
  if (secondBest && best.score - secondBest.score < 10) {
    console.log(`[Registry] Ambiguous detection: ${best.template.template_id}=${best.score}, ${secondBest.template.template_id}=${secondBest.score} (gap < 10)`);
    return null;
  }

  console.log(`[Registry] Template detected: ${best.template.template_id} (score ${best.score})`);
  return { template: best.template, score: best.score };
}

// ── Excel Extraction (Phase 4) ──

export async function tryDeterministicExtraction(
  excelBase64: string,
  fileName: string
): Promise<DeterministicExtractionResult> {
  let XLSX: any;
  try {
    XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
  } catch (e: any) {
    console.log("[Registry] XLSX dynamic import failed:", e.message);
    return { type: "no_match" };
  }

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
    console.error("[Registry] Excel parse error:", e.message);
    return { type: "no_match" };
  }

  const fileType: "xlsx" | "xls" = fileName.toLowerCase().endsWith(".xls") && !fileName.toLowerCase().endsWith(".xlsx")
    ? "xls" : "xlsx";

  const ctx: DetectionContext = {
    fileName, fileType, sheetNames,
    headerRows: rows.slice(0, 200),
  };

  return runDetectionAndExtraction(ctx, rows);
}

// ── PDF Extraction (Phase 4b) ──

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
