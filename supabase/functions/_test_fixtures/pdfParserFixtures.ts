/**
 * PDF Parser Output Fixtures — Phase 1
 *
 * Captured golden snapshots of parseEconomicPdfText() output
 * for real (sanitized) documents. These freeze the parser contract
 * and serve as regression gates before parser changes.
 */

import type { PdfParsedLine, PdfMetadata, PdfParseResult } from "../_shared/pdfTextParser.ts";

// ── Sanitized text samples (real structure, anonymized values) ──

export const ECONOMIC_SALDOBALANCE_PDF_TEXT = `1796416 - Sanitized ApS - CVR 12345678
Saldobalance for perioden 01.01.26 - 31.01.26

# Nr Navn Perioden År til dato

RESULTATOPGØRELSE

1000 Omsætning -1.500.000,00 -1.500.000,00
1200 Vareforbrug 600.000,00 600.000,00
Direkte omkostninger i alt 600.000,00 600.000,00
Dækningsbidrag -900.000,00 -900.000,00
2000 Lønninger 300.000,00 300.000,00
Lønninger i alt 300.000,00 300.000,00
2200 Salgsomkostninger 50.000,00 50.000,00
2400 Lokaleomkostninger 30.000,00 30.000,00
2600 Administrationsomkostninger 40.000,00 40.000,00
3000 Afskrivninger 20.000,00 20.000,00
Afskrivninger i alt 20.000,00 20.000,00
Resultat før skat -460.000,00 -460.000,00

AKTIVER

5600 Tilgodehavender 200.000,00 200.000,00
5800 Bankkonto -50.000,00 -50.000,00
AKTIVER I ALT
850.000,00

PASSIVER

8000 Egenkapital -350.000,00 -350.000,00
EGENKAPITAL I ALT
-350.000,00
8500 Kortfristet gæld -500.000,00 -500.000,00
PASSIVER I ALT
-850.000,00

https://secure.e-conomic.com`;

export const ECONOMIC_PNL_PDF_TEXT = `1796416 - Sanitized ApS - CVR 12345678
Resultatopgørelse 01/01-2026 - 31/01-2026

Omsætning i alt -1.200.000,00
Vareforbrug 480.000,00
Dækningsbidrag -720.000,00
Lønninger mv. i alt 250.000,00
Salgsomkostninger i alt 35.000,00
Lokaleomkostninger i alt 25.000,00
Administrationsomkostninger i alt 30.000,00
Afskrivninger i alt 15.000,00
Resultat før skat -365.000,00
Resultat efter skat -365.000,00

https://secure.e-conomic.com`;

export const DINERO_PNL_PDF_TEXT = `SnowWaves ApS (CVR-nr. 39850850)
Resultatopgørelse
01.01.2026 - 31.01.2026

Omsætning i alt -180.000,00
Direkte omkostninger i alt 45.000,00
Dækningsbidrag -135.000,00
Lønninger i alt 60.000,00
Resultat før skat -75.000,00
Periodens resultat -75.000,00

Dinero`;

// ── Expected parser output shapes ──

export interface ParserOutputFixture {
  fixture_id: string;
  input_text: string;
  expected_line_count_min: number;
  expected_sections: string[];
  expected_subtotals: string[];
  expected_metadata: Partial<PdfMetadata>;
  /** Spot-check specific lines */
  expected_lines: Array<{
    name_pattern: string;
    section: string | null;
    is_subtotal: boolean;
    period_amount: number | null;
    ytd_amount?: number | null;
  }>;
}

export const fixture_economic_saldobalance_parser: ParserOutputFixture = {
  fixture_id: "parser_economic_saldobalance",
  input_text: ECONOMIC_SALDOBALANCE_PDF_TEXT,
  expected_line_count_min: 10,
  expected_sections: ["PNL", "AKTIVER", "PASSIVER"],
  expected_subtotals: ["Dækningsbidrag", "Resultat før skat", "AKTIVER I ALT", "PASSIVER I ALT", "EGENKAPITAL I ALT"],
  expected_metadata: {
    company_name: "Sanitized ApS",
    cvr_number: "12345678",
    is_economic: true,
    has_resultatopgoerelse: true,
    has_aktiver: true,
    has_passiver: true,
  },
  expected_lines: [
    { name_pattern: "Omsætning", section: "PNL", is_subtotal: false, period_amount: -1500000 },
    { name_pattern: "Dækningsbidrag", section: "PNL", is_subtotal: true, period_amount: -900000 },
    { name_pattern: "Resultat før skat", section: "PNL", is_subtotal: true, period_amount: -460000 },
    { name_pattern: "Bankkonto", section: "AKTIVER", is_subtotal: false, period_amount: -50000 },
  ],
};

export const fixture_economic_pnl_parser: ParserOutputFixture = {
  fixture_id: "parser_economic_pnl",
  input_text: ECONOMIC_PNL_PDF_TEXT,
  expected_line_count_min: 8,
  expected_sections: ["PNL"],
  expected_subtotals: ["Dækningsbidrag", "Resultat før skat"],
  expected_metadata: {
    company_name: "Sanitized ApS",
    cvr_number: "12345678",
    is_economic: true,
    has_resultatopgoerelse: true,
    has_aktiver: false,
    has_passiver: false,
  },
  expected_lines: [
    { name_pattern: "Omsætning", section: null, is_subtotal: true, period_amount: -1200000 },
    { name_pattern: "Dækningsbidrag", section: null, is_subtotal: true, period_amount: -720000 },
    { name_pattern: "Resultat før skat", section: null, is_subtotal: true, period_amount: -365000 },
  ],
};

export const fixture_dinero_pnl_parser: ParserOutputFixture = {
  fixture_id: "parser_dinero_pnl",
  input_text: DINERO_PNL_PDF_TEXT,
  expected_line_count_min: 5,
  expected_sections: [],  // Dinero has no section markers
  expected_subtotals: ["Dækningsbidrag", "Resultat før skat"],
  expected_metadata: {
    company_name: "SnowWaves ApS",
    cvr_number: "39850850",
    has_resultatopgoerelse: false, // Dinero doesn't trigger section markers
    has_aktiver: false,
    has_passiver: false,
  },
  expected_lines: [
    { name_pattern: "Omsætning", section: null, is_subtotal: true, period_amount: -180000 },
    { name_pattern: "Dækningsbidrag", section: null, is_subtotal: true, period_amount: -135000 },
    { name_pattern: "Resultat før skat", section: null, is_subtotal: true, period_amount: -75000 },
  ],
};

// ── Dinero-eksport med TRAILING WHITESPACE (UNGARBEJDE.DK ApS, CVR 32075479) ──
//
// Reproducerer Oles faktiske prod-tekst 1:1 fra app.theboardroom.dk-uploadet
// (FileUploadZone.extractTextFromFile bygger teksten hasEOL-baseret, hvilket
// efterlader ÉT trailing mellemrum efter hvert beløb). Det trailing mellemrum
// brækkede $-anchoren i generic-templatens ALL-CAPS-subtotal-regex, så +20-signalet
// ikke fyrede → detect=75 < 80 → no_match → AI-fallback læste salg/admin forkert.
//
// VIGTIGT: byg ALTID via withTrailingSpace() — en rå template-literal ville få
// editor/lint til at strippe de afsluttende mellemrum og dermed maskere bug-betingelsen.
function withTrailingSpace(lines: string[]): string {
  return lines.map((l) => l + " ").join("\n");
}

export const DINERO_UNGARBEJDE_MAR_TEXT = withTrailingSpace([
  "--- Side 1 ---",
  "Hentet: 01/06-2026 Kl. 07.08   UNGARBEJDE.DK ApS (CVR-nr. 32075479)",
  "Resultatopgørelse 01/03-2026 - 31/03-2026",
  "Omsætning",
  "Salg af varer/ydelser m/moms   -92.113,67",
  "OMSÆTNING I ALT   -92.113,67",
  "Variable omkostninger",
  "Valutakursdifferencer, import   34,94",
  "VAREFORBRUG   34,94",
  "VAREFORBRUG OG FREMMED ARBEJDE   34,94",
  "DÆKNINGSBIDRAG I ALT   -92.078,73",
  "Salgsfremmende omkostninger",
  "Annoncer og reklame   10.016,44",
  "SALGSOMKOSTNINGER   10.016,44",
  "Administration",
  "Porto og gebyrer   794,56",
  "Internet og webhotel   17.625,00",
  "Køb af software   835,82",
  "ADMINISTRATION   19.255,38",
  "RESULTAT FØR SKAT   -62.806,91",
  "RESULTAT EFTER SKAT   -62.806,91",
]);

export const DINERO_UNGARBEJDE_APR_TEXT = withTrailingSpace([
  "--- Side 1 ---",
  "Hentet: 01/06-2026 Kl. 07.09   UNGARBEJDE.DK ApS (CVR-nr. 32075479)",
  "Resultatopgørelse 01/04-2026 - 30/04-2026",
  "Omsætning",
  "Salg af varer/ydelser m/moms   -91.601,52",
  "OMSÆTNING I ALT   -91.601,52",
  "Variable omkostninger",
  "Valutakursdifferencer, import   14,68",
  "VAREFORBRUG   14,68",
  "VAREFORBRUG OG FREMMED ARBEJDE   14,68",
  "DÆKNINGSBIDRAG I ALT   -91.586,84",
  "Personaleomkostninger",
  "Mad under kursus/møder mv., fuldt fradrag   43,60",
  "LØNNINGER MV. I ALT   43,60",
  "Salgsfremmende omkostninger",
  "Annoncer og reklame   7.815,51",
  "SALGSOMKOSTNINGER   7.815,51",
  "Administration",
  "Konsulentbistand   40.000,00",
  "Porto og gebyrer   59,81",
  "Internet og webhotel   24.845,50",
  "Køb af software   826,49",
  "ADMINISTRATION   65.731,80",
  "RESULTAT FØR SKAT   -17.995,93",
  "RESULTAT EFTER SKAT   -17.995,93",
]);
