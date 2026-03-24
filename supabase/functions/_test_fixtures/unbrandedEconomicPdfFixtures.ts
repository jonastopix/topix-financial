/**
 * Unbranded e-conomic Resultatopgørelse PDF Fixtures
 *
 * Golden fixtures for the "unbranded e-conomic P&L PDF" document class.
 * These represent standard e-conomic resultatopgørelse PDFs WITHOUT the
 * `secure.e-conomic.com` footer URL — the class that previously fell
 * through to AI fallback due to insufficient detection scoring.
 *
 * Based on real Carma Studio uploads (Jan, Apr, Maj, Jun 2025).
 * Each fixture includes:
 *   - Raw text (as would be sent via fileContent)
 *   - Minimal structural payload (structural-first detection signal)
 *   - Expected fingerprint and template detection results
 *
 * These fixtures prove the CLASS, not a single company.
 * Account numbers, labels, and structure are standard e-conomic convention.
 */

import type { PdfStructuralPayload } from "../_shared/pdfStructuralTypes.ts";

// ── Helper: build a minimal structural payload for detection testing ──

function buildMinimalStructural(opts: {
  fileName: string;
  accountRows: Array<{ acctNo: string; label: string; value: number }>;
  subtotalRows: Array<{ label: string; value: number }>;
}): PdfStructuralPayload {
  let rowIndex = 0;
  const rows = [];

  // Header rows (non-financial)
  rows.push({
    row_index: rowIndex,
    row_group_id: `p1_r${rowIndex}`,
    y_position: 750,
    page: 1,
    tokens: [{ text: "Resultatopgørelse", x: 50, y: 750, width: 120, page: 1, column_slot: null, column_slot_confidence: "HIGH" as const }],
    is_header: true,
    is_subtotal: false,
  });
  rowIndex++;

  // Account rows with slot 0 values
  for (const ar of opts.accountRows) {
    rows.push({
      row_index: rowIndex,
      row_group_id: `p1_r${rowIndex}`,
      y_position: 700 - rowIndex * 15,
      page: 1,
      tokens: [
        { text: ar.acctNo, x: 50, y: 700 - rowIndex * 15, width: 30, page: 1, column_slot: null, column_slot_confidence: "HIGH" as const },
        { text: ar.label, x: 90, y: 700 - rowIndex * 15, width: 100, page: 1, column_slot: null, column_slot_confidence: "HIGH" as const },
        { text: formatDanishNumber(ar.value), x: 400, y: 700 - rowIndex * 15, width: 60, page: 1, column_slot: 0, column_slot_confidence: "HIGH" as const },
      ],
      is_header: false,
      is_subtotal: false,
    });
    rowIndex++;
  }

  // Subtotal rows
  for (const sr of opts.subtotalRows) {
    rows.push({
      row_index: rowIndex,
      row_group_id: `p1_r${rowIndex}`,
      y_position: 700 - rowIndex * 15,
      page: 1,
      tokens: [
        { text: sr.label, x: 50, y: 700 - rowIndex * 15, width: 150, page: 1, column_slot: null, column_slot_confidence: "HIGH" as const },
        { text: formatDanishNumber(sr.value), x: 400, y: 700 - rowIndex * 15, width: 60, page: 1, column_slot: 0, column_slot_confidence: "HIGH" as const },
      ],
      is_header: false,
      is_subtotal: true,
    });
    rowIndex++;
  }

  return {
    version: "1.0",
    pages: [{ page_number: 1, rows }],
    column_profile: {
      slot_count: 1,
      slot_labels: ["Perioden"],
      slot_x_ranges: [{ min: 380, max: 480 }],
      detection_method: "header_anchor",
      confidence: "HIGH",
    },
    metadata: {
      page_count: 1,
      total_token_count: rows.reduce((sum, r) => sum + r.tokens.length, 0),
      total_row_count: rows.length,
      content_hash: "fixture_hash_" + opts.fileName.replace(/\s/g, "_"),
      source_file_name: opts.fileName,
      extraction_timestamp: new Date().toISOString(),
    },
  };
}

function formatDanishNumber(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-${formatted}` : formatted;
}

// ── Standard e-conomic account rows (shared across all months) ──

const STANDARD_ACCOUNT_ROWS = [
  { acctNo: "1010", label: "Varesalg m. moms", value: -254419.83 },
  { acctNo: "1300", label: "Vareforbrug", value: 198855.32 },
  { acctNo: "2200", label: "Løn & Gage", value: 50000.00 },
  { acctNo: "2210", label: "Feriepenge", value: 5000.00 },
  { acctNo: "2220", label: "ATP, Pension mv.", value: 8550.49 },
  { acctNo: "2230", label: "Andre personaleomk.", value: 10500.00 },
  { acctNo: "3100", label: "Biler & transport", value: 2500.00 },
  { acctNo: "3400", label: "Lokaleomkostninger", value: 3000.00 },
  { acctNo: "3600", label: "Administrationsomkostninger", value: 5000.00 },
  { acctNo: "4300", label: "Renteudgifter", value: 678.93 },
];

const STANDARD_SUBTOTAL_ROWS = [
  { label: "Omsætning i alt", value: -254419.83 },
  { label: "DIREKTE OMKOSTNINGER I ALT", value: 198855.32 },
  { label: "DÆKNINGSBIDRAG", value: -55564.51 },
  { label: "Lønninger i alt", value: 74050.49 },
  { label: "RESULTAT FØR AFSKRIVNINGER", value: -65810.23 },
  { label: "PERIODENS RESULTAT", value: -66489.16 },
];

// ── Raw text templates (no footer URL — this is the key differentiator) ──

function buildRawText(period: string, companyLine: string): string {
  return `${companyLine}
Resultatopgørelse
${period}

1010 Varesalg m. moms -254.419,83
Omsætning i alt -254.419,83
1300 Vareforbrug 198.855,32
DIREKTE OMKOSTNINGER I ALT 198.855,32
DÆKNINGSBIDRAG -55.564,51
2200 Løn & Gage 50.000,00
2210 Feriepenge 5.000,00
2220 ATP, Pension mv. 8.550,49
2230 Andre personaleomk. 10.500,00
Lønninger i alt 74.050,49
3100 Biler & transport 2.500,00
3400 Lokaleomkostninger 3.000,00
3600 Administrationsomkostninger 5.000,00
RESULTAT FØR AFSKRIVNINGER -65.810,23
4300 Renteudgifter 678,93
PERIODENS RESULTAT -66.489,16`;
}

// ══════════════════════════════════════════════════════════════
// FIXTURE: JANUAR 2025 (unbranded e-conomic P&L)
// ══════════════════════════════════════════════════════════════

export const fixture_unbranded_jan2025_text = buildRawText(
  "01/01-2025 - 31/01-2025",
  "Carma Studio ApS (CVR-nr. 12345678)"
);

export const fixture_unbranded_jan2025_structural = buildMinimalStructural({
  fileName: "JANUAR 2025.pdf",
  accountRows: STANDARD_ACCOUNT_ROWS,
  subtotalRows: STANDARD_SUBTOTAL_ROWS,
});

// ══════════════════════════════════════════════════════════════
// FIXTURE: APRIL 2025 (unbranded e-conomic P&L)
// ══════════════════════════════════════════════════════════════

export const fixture_unbranded_apr2025_text = buildRawText(
  "01/04-2025 - 30/04-2025",
  "Carma Studio ApS (CVR-nr. 12345678)"
);

export const fixture_unbranded_apr2025_structural = buildMinimalStructural({
  fileName: "APRIL 2025.pdf",
  accountRows: STANDARD_ACCOUNT_ROWS,
  subtotalRows: STANDARD_SUBTOTAL_ROWS,
});

// ══════════════════════════════════════════════════════════════
// FIXTURE: MAJ 2025 (unbranded e-conomic P&L)
// ══════════════════════════════════════════════════════════════

export const fixture_unbranded_maj2025_text = buildRawText(
  "01/05-2025 - 31/05-2025",
  "Carma Studio ApS (CVR-nr. 12345678)"
);

export const fixture_unbranded_maj2025_structural = buildMinimalStructural({
  fileName: "MAJ 2025.pdf",
  accountRows: STANDARD_ACCOUNT_ROWS,
  subtotalRows: STANDARD_SUBTOTAL_ROWS,
});

// ══════════════════════════════════════════════════════════════
// FIXTURE: JUNI 2025 (unbranded e-conomic P&L)
// ══════════════════════════════════════════════════════════════

export const fixture_unbranded_jun2025_text = buildRawText(
  "01/06-2025 - 30/06-2025",
  "Carma Studio ApS (CVR-nr. 12345678)"
);

export const fixture_unbranded_jun2025_structural = buildMinimalStructural({
  fileName: "JUNI 2025.pdf",
  accountRows: STANDARD_ACCOUNT_ROWS,
  subtotalRows: STANDARD_SUBTOTAL_ROWS,
});

// ══════════════════════════════════════════════════════════════
// EXPECTED RESULTS (shared — all months should produce identical results)
// ══════════════════════════════════════════════════════════════

export const EXPECTED_FINGERPRINT = {
  source_system: "economic" as const,
  document_type: "resultatopgoerelse" as const,
  confidence: "MEDIUM" as const,
  ai_allowed: false,
};

export const EXPECTED_TEMPLATE_ID = "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1";
export const EXPECTED_MIN_DETECTION_SCORE = 80;
