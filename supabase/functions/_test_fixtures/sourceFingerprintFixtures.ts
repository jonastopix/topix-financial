/**
 * Source Fingerprint Fixtures — Phase 1/2 + Cutover
 *
 * Test cases for detectSourceSystem() — verifying that known sources
 * are identified correctly and AI fallback is gated.
 *
 * Includes false-positive protection tests for combined_dk.
 */

import type { SourceFingerprintFixture } from "./fixtureHelpers.ts";

export const fixture_economic_pdf_fingerprint: SourceFingerprintFixture = {
  fixture_id: "fp_economic_pdf",
  description: "e-conomic PDF detected via footer URL",
  file_name: "saldobalance_okt_2025.pdf",
  file_type: "pdf",
  raw_text: "Saldobalance for perioden 01-10-2025 til 31-10-2025\nOmsætning\n-1.500.000,00\nhttps://secure.e-conomic.com",
  expected_source_system: "economic",
  expected_allows_ai: false,
};

export const fixture_economic_xlsx_fingerprint: SourceFingerprintFixture = {
  fixture_id: "fp_economic_xlsx",
  description: "e-conomic XLSX detected via header structure",
  file_name: "resultatopgoerelse_jan2026.xlsx",
  file_type: "xlsx",
  header_rows: [
    ["Resultatopgørelse"],
    ["Firma ApS"],
    ["Periode: 01-01-2026 til 31-01-2026"],
    [],
    ["Konto", "Tekst", "Perioden", "År til dato"],
  ],
  expected_source_system: "economic",
  expected_allows_ai: false,
};

export const fixture_dinero_csv_fingerprint: SourceFingerprintFixture = {
  fixture_id: "fp_dinero_csv",
  description: "Dinero CSV detected via header columns",
  file_name: "resultatopgoerelse_export.csv",
  file_type: "csv",
  raw_text: "Konto;Kontonavn;Beløb\n1506;Events;-36.750,00\n",
  expected_source_system: "dinero",
  expected_allows_ai: false,
};

export const fixture_dinero_pdf_fingerprint: SourceFingerprintFixture = {
  fixture_id: "fp_dinero_pdf",
  description: "Dinero PDF detected via branding",
  file_name: "resultat_dinero.pdf",
  file_type: "pdf",
  raw_text: "Resultatopgørelse\nDinero\nOmsætning  150.000,00\nResultat  25.000,00",
  expected_source_system: "dinero",
  expected_allows_ai: false,
};

export const fixture_unknown_pdf_fingerprint: SourceFingerprintFixture = {
  fixture_id: "fp_unknown_pdf",
  description: "Unknown PDF — AI fallback allowed",
  file_name: "random_report.pdf",
  file_type: "pdf",
  raw_text: "Some Random Company\nFinancial Report\nRevenue: 500.000\nExpenses: 300.000",
  expected_source_system: "unknown",
  expected_allows_ai: true,
};

// ── Combined DK family: positive match (structural, company-agnostic) ──

export const fixture_combined_dk_xlsx_fingerprint: SourceFingerprintFixture = {
  fixture_id: "fp_combined_dk_xlsx_kjauto",
  description: "KJ Auto XLSX detected as combined_dk via structural pattern (Nummer/Navn/Balance)",
  file_name: "Januar_2026.xlsx",
  file_type: "xlsx",
  header_rows: [
    ["KJ Automobiler ApS"],
    ["Balance og resultatopgørelse"],
    [],
    [],
    ["Nummer", "Navn", "01-01-2026 til 31-01-2026"],
  ],
  expected_source_system: "combined_dk",
  expected_allows_ai: false,
};

export const fixture_combined_dk_xlsx_warburg: SourceFingerprintFixture = {
  fixture_id: "fp_combined_dk_xlsx_warburg",
  description: "Warburg XLSX detected as combined_dk via same structural pattern",
  file_name: "Januar_2026_warburg.xlsx",
  file_type: "xlsx",
  header_rows: [
    ["Warburg VVS & Kloak ekspres ApS"],
    ["Balance"],
    ["Udskrevet 19-02-2026 09:35 (alle tal i kr.)"],
    [],
    ["Nummer", "Navn", "01-01-2026 til 31-01-2026"],
  ],
  expected_source_system: "combined_dk",
  expected_allows_ai: false,
};

// ── False-positive protection: files that must NOT match combined_dk ──

export const fixture_not_combined_dk_economic_xlsx: SourceFingerprintFixture = {
  fixture_id: "fp_not_combined_dk_economic_xlsx",
  description: "e-conomic XLSX must NOT fingerprint as combined_dk (has Konto/Tekst, not Nummer/Navn)",
  file_name: "resultatopgoerelse_jan2026.xlsx",
  file_type: "xlsx",
  header_rows: [
    ["Resultatopgørelse"],
    ["Firma ApS"],
    ["Periode: 01-01-2026 til 31-01-2026"],
    [],
    ["Konto", "Tekst", "Perioden", "År til dato"],
  ],
  expected_source_system: "economic",
  expected_allows_ai: false,
};

export const fixture_not_combined_dk_generic_xlsx: SourceFingerprintFixture = {
  fixture_id: "fp_not_combined_dk_generic_xlsx",
  description: "Generic XLSX with Nummer column but no 'Balance' in row 1 must NOT match combined_dk",
  file_name: "generic_report.xlsx",
  file_type: "xlsx",
  header_rows: [
    ["Company Name"],
    ["Resultatopgørelse"],
    ["Period info"],
    [],
    ["Nummer", "Navn", "Beløb"],
  ],
  expected_source_system: "unknown",
  expected_allows_ai: true,
};

export const fixture_not_combined_dk_no_period_col: SourceFingerprintFixture = {
  fixture_id: "fp_not_combined_dk_no_period_col",
  description: "XLSX with Balance + Nummer/Navn but missing period column must NOT match combined_dk",
  file_name: "partial_balance.xlsx",
  file_type: "xlsx",
  header_rows: [
    ["Some Company"],
    ["Balance"],
    [],
    [],
    ["Nummer", "Navn"],
  ],
  expected_source_system: "unknown",
  expected_allows_ai: true,
};

// Legacy alias for backward compat in existing test imports
export const fixture_kj_auto_xlsx_fingerprint = fixture_combined_dk_xlsx_fingerprint;
