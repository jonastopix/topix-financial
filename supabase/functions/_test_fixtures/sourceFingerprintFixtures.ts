/**
 * Source Fingerprint Fixtures — Phase 1/2
 *
 * Test cases for detectSourceSystem() — verifying that known sources
 * are identified correctly and AI fallback is gated.
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

export const fixture_kj_auto_xlsx_fingerprint: SourceFingerprintFixture = {
  fixture_id: "fp_kj_auto_xlsx",
  description: "KJ Auto XLSX detected via company/header pattern",
  file_name: "Januar_2026.xlsx",
  file_type: "xlsx",
  header_rows: [
    ["KJ Automobiler ApS"],
    ["Balance og resultatopgørelse"],
    [],
    [],
    ["Nummer", "Navn", "01-01-2026 til 31-01-2026"],
  ],
  expected_source_system: "kj_auto",
  expected_allows_ai: false,
};
