/**
 * XLSX Raw Fixture Shapes — Phase 1/4
 *
 * Expected structural shapes for XLSX raw parser output.
 * Used as regression gates before template migration.
 */

import type { XlsxParseResult } from "../_shared/xlsxRawParser.ts";

export interface XlsxRawFixture {
  fixture_id: string;
  description: string;
  source_file: string;
  expected_sheet_name_pattern: string;
  expected_min_rows: number;
  expected_min_cols: number;
  expected_header_row_present: boolean;
  expected_column_types: Array<{
    col_index: number;
    expected_type: "label" | "numeric" | "mixed" | "empty";
  }>;
  /** Spot-check specific cell values */
  expected_cells: Array<{
    row_index: number;
    col_index: number;
    expected_type: "number" | "string" | "null";
    expected_value_pattern?: string;
  }>;
}

// ── e-conomic Resultatopgørelse XLSX ──

export const fixture_economic_xlsx_shape: XlsxRawFixture = {
  fixture_id: "xlsx_raw_economic_pnl",
  description: "e-conomic Resultatopgørelse XLSX — header row + account/label/value columns",
  source_file: "resultatopgoerelse_jan2026.xlsx",
  expected_sheet_name_pattern: ".*",
  expected_min_rows: 20,
  expected_min_cols: 3,
  expected_header_row_present: true,
  expected_column_types: [
    { col_index: 0, expected_type: "mixed" },  // account numbers + labels
    { col_index: 1, expected_type: "label" },  // description text
    { col_index: 2, expected_type: "numeric" }, // period amount
  ],
  expected_cells: [],
};

// ── KJ Auto / Combined Balance PnL XLSX ──

export const fixture_combined_xlsx_shape: XlsxRawFixture = {
  fixture_id: "xlsx_raw_combined_balance_pnl",
  description: "Combined Balance/P&L XLSX — Nummer/Navn/Period columns",
  source_file: "Januar_2026_warburg.xlsx",
  expected_sheet_name_pattern: ".*",
  expected_min_rows: 50,
  expected_min_cols: 3,
  expected_header_row_present: true,
  expected_column_types: [
    { col_index: 0, expected_type: "numeric" }, // Nummer (account numbers)
    { col_index: 1, expected_type: "label" },   // Navn (label)
    { col_index: 2, expected_type: "numeric" }, // Period amount
  ],
  expected_cells: [
    { row_index: 4, col_index: 0, expected_type: "string", expected_value_pattern: "nummer" },
    { row_index: 4, col_index: 1, expected_type: "string", expected_value_pattern: "navn" },
  ],
};
