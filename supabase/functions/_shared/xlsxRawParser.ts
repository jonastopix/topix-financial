/**
 * XLSX Raw Parser — Phase 4
 *
 * Structural spreadsheet parser producing cell-level model.
 * No business aliases, no sign normalization.
 * Parser remains structural only.
 */

import * as XLSX from "npm:xlsx@0.18.5";

// ── Types ──

export interface XlsxRawCell {
  sheet_name: string;
  cell_address: string;
  row_index: number;
  col_index: number;
  raw_value: any;
  formatted_value: string | null;
  value_type: "number" | "string" | "boolean" | "date" | "null" | "error";
  has_formula: boolean;
}

export interface XlsxRawRow {
  sheet_name: string;
  row_index: number;
  cells: XlsxRawCell[];
}

export interface XlsxColumnProfile {
  col_index: number;
  col_letter: string;
  header_value: string | null;
  inferred_type: "label" | "numeric" | "mixed" | "empty";
  sample_values: any[];
}

export interface XlsxParseResult {
  sheet_name: string;
  total_rows: number;
  total_cols: number;
  header_row_index: number | null;
  rows: XlsxRawRow[];
  column_profile: XlsxColumnProfile[];
  /** Raw cell matrix for quick access (row_index → col_index → raw_value) */
  raw_matrix: any[][];
}

// ── Column letter helper ──

function colLetter(colIndex: number): string {
  let letter = "";
  let n = colIndex;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

// ── Detect header row (heuristic: first row with ≥2 non-empty cells where at least one is text) ──

function detectHeaderRow(matrix: any[][], maxScan: number = 10): number | null {
  for (let r = 0; r < Math.min(matrix.length, maxScan); r++) {
    const row = matrix[r] || [];
    const nonEmpty = row.filter((v: any) => v != null && v.toString().trim() !== "");
    const textCells = nonEmpty.filter((v: any) => typeof v === "string");
    if (nonEmpty.length >= 2 && textCells.length >= 2) {
      return r;
    }
  }
  return null;
}

// ── Infer column type from sample values ──

function inferColumnType(values: any[]): XlsxColumnProfile["inferred_type"] {
  const nonNull = values.filter(v => v != null && v.toString().trim() !== "");
  if (nonNull.length === 0) return "empty";

  const numCount = nonNull.filter(v => typeof v === "number").length;
  const strCount = nonNull.filter(v => typeof v === "string").length;

  if (numCount > nonNull.length * 0.7) return "numeric";
  if (strCount > nonNull.length * 0.7) return "label";
  return "mixed";
}

// ── Value type detection ──

function detectValueType(val: any): XlsxRawCell["value_type"] {
  if (val === null || val === undefined) return "null";
  if (typeof val === "number") return "number";
  if (typeof val === "boolean") return "boolean";
  if (val instanceof Date) return "date";
  if (typeof val === "string") return "string";
  return "string";
}

// ── Main Parser ──

export function parseXlsxRaw(
  data: Uint8Array,
  options?: { sheetIndex?: number; maxRows?: number }
): XlsxParseResult {
  const workbook = XLSX.read(data, { type: "array", cellFormula: true, cellStyles: false });
  const sheetIndex = options?.sheetIndex ?? 0;
  const sheetName = workbook.SheetNames[sheetIndex];
  const sheet = workbook.Sheets[sheetName];

  // Get raw matrix
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const maxRows = options?.maxRows ?? rawMatrix.length;
  const trimmedMatrix = rawMatrix.slice(0, maxRows);

  // Determine dimensions
  const totalRows = trimmedMatrix.length;
  const totalCols = trimmedMatrix.reduce((max, row) => Math.max(max, (row || []).length), 0);

  // Detect header row
  const headerRowIndex = detectHeaderRow(trimmedMatrix);

  // Build rows with cell-level detail
  const rows: XlsxRawRow[] = [];

  // Check for formulas
  const formulaCells = new Set<string>();
  if (sheet["!formulae"]) {
    // SheetJS doesn't expose per-cell formula easily in all modes,
    // but we can check the cell objects
  }
  for (const cellAddr of Object.keys(sheet)) {
    if (cellAddr.startsWith("!")) continue;
    const cell = sheet[cellAddr];
    if (cell && cell.f) {
      formulaCells.add(cellAddr);
    }
  }

  for (let r = 0; r < totalRows; r++) {
    const rowData = trimmedMatrix[r] || [];
    const cells: XlsxRawCell[] = [];

    for (let c = 0; c < totalCols; c++) {
      const val = c < rowData.length ? rowData[c] : null;
      const addr = `${colLetter(c)}${r + 1}`;

      cells.push({
        sheet_name: sheetName,
        cell_address: addr,
        row_index: r,
        col_index: c,
        raw_value: val,
        formatted_value: val != null ? val.toString() : null,
        value_type: detectValueType(val),
        has_formula: formulaCells.has(addr),
      });
    }

    rows.push({ sheet_name: sheetName, row_index: r, cells });
  }

  // Build column profiles
  const columnProfile: XlsxColumnProfile[] = [];
  for (let c = 0; c < totalCols; c++) {
    const colValues = trimmedMatrix.map(row => (row || [])[c] ?? null);
    const headerValue = headerRowIndex != null ? (trimmedMatrix[headerRowIndex]?.[c]?.toString() ?? null) : null;
    const sampleStart = (headerRowIndex ?? 0) + 1;
    const sampleValues = colValues.slice(sampleStart, sampleStart + 20).filter(v => v != null);

    columnProfile.push({
      col_index: c,
      col_letter: colLetter(c),
      header_value: headerValue,
      inferred_type: inferColumnType(colValues.slice(sampleStart)),
      sample_values: sampleValues.slice(0, 5),
    });
  }

  return {
    sheet_name: sheetName,
    total_rows: totalRows,
    total_cols: totalCols,
    header_row_index: headerRowIndex,
    rows,
    column_profile: columnProfile,
    raw_matrix: trimmedMatrix,
  };
}

/**
 * Parse from base64-encoded Excel data.
 */
export function parseXlsxRawFromBase64(
  base64: string,
  options?: { sheetIndex?: number; maxRows?: number }
): XlsxParseResult {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return parseXlsxRaw(bytes, options);
}

// ── Build DetectionContext from XlsxParseResult (structural-only) ──

import type { DetectionContext } from "./templateRegistry.ts";

/**
 * Build a DetectionContext entirely from the structural XlsxParseResult contract.
 * Reconstructs headerRows from typed XlsxRawRow cells — does NOT use raw_matrix.
 */
export function buildXlsxDetectionContext(
  xlsxResult: XlsxParseResult,
  fileName: string
): DetectionContext {
  // Reconstruct headerRows from structural cell model
  const maxHeaderRows = Math.min(xlsxResult.rows.length, 200);
  const headerRows: any[][] = [];
  for (let r = 0; r < maxHeaderRows; r++) {
    const row = xlsxResult.rows[r];
    const rowValues: any[] = [];
    for (let c = 0; c < xlsxResult.total_cols; c++) {
      const cell = row.cells.find(cell => cell.col_index === c);
      rowValues.push(cell?.raw_value ?? null);
    }
    headerRows.push(rowValues);
  }

  return {
    fileName,
    fileType: fileName.toLowerCase().endsWith(".xls") && !fileName.toLowerCase().endsWith(".xlsx")
      ? "xls" : "xlsx",
    sheetNames: [xlsxResult.sheet_name],
    headerRows,
  };
}
