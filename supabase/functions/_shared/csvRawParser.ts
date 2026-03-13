/**
 * CSV Raw Parser — Phase 7
 *
 * Structural CSV parser producing typed row/cell/column model.
 * No business logic, no sign normalization.
 * Parser remains structural only.
 */

import type { DetectionContext } from "./templateRegistry.ts";

// ── Types ──

export interface CsvRawCell {
  row_index: number;
  col_index: number;
  raw_value: string;
}

export interface CsvRawRow {
  row_index: number;
  cells: CsvRawCell[];
}

export interface CsvColumnProfile {
  col_index: number;
  header_value: string | null;
  inferred_type: "label" | "numeric" | "mixed" | "empty";
}

export interface CsvParseResult {
  delimiter: string;
  total_rows: number;
  total_cols: number;
  header_row_index: number | null;
  headers: string[];
  rows: CsvRawRow[];
  column_profile: CsvColumnProfile[];
}

// ── Delimiter detection ──

function detectDelimiter(lines: string[]): string {
  // Count semicolons vs commas in first 5 non-empty lines
  let semiCount = 0;
  let commaCount = 0;
  const sample = lines.slice(0, 5).filter(l => l.trim().length > 0);
  for (const line of sample) {
    semiCount += (line.match(/;/g) || []).length;
    commaCount += (line.match(/,/g) || []).length;
  }
  return semiCount >= commaCount ? ";" : ",";
}

// ── Infer column type from sample values ──

function inferCsvColumnType(values: string[]): CsvColumnProfile["inferred_type"] {
  const nonEmpty = values.filter(v => v.trim() !== "");
  if (nonEmpty.length === 0) return "empty";

  // Danish numeric: digits, dots (thousands), commas (decimal), minus
  const numericPattern = /^-?\d[\d.]*,?\d*$/;
  let numCount = 0;
  let strCount = 0;
  for (const v of nonEmpty) {
    const cleaned = v.trim();
    if (numericPattern.test(cleaned) || /^-?\d+$/.test(cleaned)) {
      numCount++;
    } else {
      strCount++;
    }
  }

  if (numCount > nonEmpty.length * 0.7) return "numeric";
  if (strCount > nonEmpty.length * 0.7) return "label";
  return "mixed";
}

// ── Main Parser ──

export function parseCsvRaw(csvText: string): CsvParseResult {
  // Strip BOM
  const cleaned = csvText.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length === 0) {
    return {
      delimiter: ";",
      total_rows: 0,
      total_cols: 0,
      header_row_index: null,
      headers: [],
      rows: [],
      column_profile: [],
    };
  }

  const delimiter = detectDelimiter(lines);

  // Parse all lines into string arrays
  const allFields: string[][] = lines.map(line => line.split(delimiter));
  const totalCols = allFields.reduce((max, f) => Math.max(max, f.length), 0);

  // Header detection: first row is header if it has ≥2 non-empty text cells
  const firstRow = allFields[0] || [];
  const firstRowNonEmpty = firstRow.filter(v => v.trim().length > 0);
  const firstRowTextCells = firstRowNonEmpty.filter(v => !/^-?\d[\d.]*,?\d*$/.test(v.trim()));
  const headerRowIndex = (firstRowNonEmpty.length >= 2 && firstRowTextCells.length >= 2) ? 0 : null;

  const headers = headerRowIndex != null
    ? firstRow.map(v => v.trim())
    : [];

  // Build typed rows
  const dataStartIndex = headerRowIndex != null ? 1 : 0;
  const rows: CsvRawRow[] = [];
  for (let r = dataStartIndex; r < allFields.length; r++) {
    const fields = allFields[r];
    const cells: CsvRawCell[] = [];
    for (let c = 0; c < totalCols; c++) {
      cells.push({
        row_index: r,
        col_index: c,
        raw_value: (fields[c] ?? "").trim(),
      });
    }
    rows.push({ row_index: r, cells });
  }

  // Build column profiles
  const columnProfile: CsvColumnProfile[] = [];
  for (let c = 0; c < totalCols; c++) {
    const sampleValues = rows.slice(0, 20).map(row => row.cells[c]?.raw_value ?? "");
    columnProfile.push({
      col_index: c,
      header_value: headers[c] ?? null,
      inferred_type: inferCsvColumnType(sampleValues),
    });
  }

  return {
    delimiter,
    total_rows: rows.length,
    total_cols: totalCols,
    header_row_index: headerRowIndex,
    headers,
    rows,
    column_profile: columnProfile,
  };
}

// ── Build DetectionContext from CsvParseResult (structural-only) ──

export function buildCsvDetectionContext(
  csvResult: CsvParseResult,
  fileName: string
): DetectionContext {
  // Build headerRows from structural cells for backward-compatible detection
  const headerRows: any[][] = csvResult.rows.slice(0, 10).map(row =>
    row.cells.map(cell => cell.raw_value)
  );

  return {
    fileName,
    fileType: "csv",
    sheetNames: [],
    headerRows,
    // rawText is NOT set — detection must work from structural evidence only
    // CSV detection context provides structured fields instead:
    csvHeaders: csvResult.headers,
    csvDelimiter: csvResult.delimiter,
    csvColumnProfile: csvResult.column_profile,
  } as DetectionContext & {
    csvHeaders: string[];
    csvDelimiter: string;
    csvColumnProfile: CsvColumnProfile[];
  };
}
