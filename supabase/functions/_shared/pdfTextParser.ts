/**
 * Generic PDF Text Parser for Danish accounting reports.
 *
 * Despite its historical function name "parseEconomicPdfText", this is a
 * GENERIC low-level line parser. It handles:
 *   - Danish number parsing (1.234,56 → 1234.56)
 *   - Account line extraction via regex (4-digit account numbers + amounts)
 *   - Section marker detection (RESULTATOPGØRELSE, AKTIVER, PASSIVER)
 *   - Metadata extraction (company name, CVR, period)
 *
 * It contains NO e-conomic-specific business logic. All classification,
 * sign normalization, and metric derivation happen in the individual templates
 * that consume this parser's output.
 *
 * The is_economic flag in metadata is informational only — templates decide
 * independently whether to use it.
 */

// ── Danish Number Parsing ──

/** Parse Danish number: "." = thousands, "," = decimal. Returns null if unparseable. */
export function parseDanishNumber(str: string): number | null {
  if (!str) return null;
  let cleaned = str.trim();
  if (cleaned === "" || cleaned === "-") return null;

  // Remove thousand separators (dots)
  cleaned = cleaned.replace(/\./g, "");
  // Replace decimal comma with dot
  cleaned = cleaned.replace(",", ".");

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ── Types ──

export type PdfSection = "PNL" | "AKTIVER" | "PASSIVER" | null;

export interface PdfParsedLine {
  account_no: string | null;
  name: string;
  period_amount: number | null;
  ytd_amount: number | null;
  is_subtotal: boolean;
  section: PdfSection;
}

export interface PdfMetadata {
  company_name: string | null;
  cvr_number: string | null;
  period_start: string | null;
  period_end: string | null;
  report_period: string | null;
  is_economic: boolean;
  has_resultatopgoerelse: boolean;
  has_aktiver: boolean;
  has_passiver: boolean;
}

export interface PdfParseResult {
  lines: PdfParsedLine[];
  metadata: PdfMetadata;
}

// ── Regex patterns ──

const DK_NUM_PATTERN = /-?[\d.]+,\d{2}/g;
const MONTH_NAMES = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

// ── Subtotal detection ──

function isSubtotalName(name: string): boolean {
  return /i alt|total|dækningsbidrag|resultat/i.test(name);
}

// ── Main Parser ──

export function parseEconomicPdfText(text: string): PdfParseResult {
  const lines: PdfParsedLine[] = [];
  const textLines = text.split("\n");

  let currentSection: PdfSection = null;
  let pendingTotalLabel: string | null = null;
  let pendingTotalSection: PdfSection = null;

  // Metadata
  let companyName: string | null = null;
  let cvrNumber: string | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let reportPeriod: string | null = null;
  let isEconomic = false;
  let hasResultatopgoerelse = false;
  let hasAktiver = false;
  let hasPassiver = false;

  let prDateMatched = false; // explicit flag for point-in-time "pr." dates

  for (const rawLine of textLines) {
    const line = rawLine.trim();
    if (!line) continue;

    // ── Skip fetch/export timestamps (never a report date) ──
    if (/^Hentet:/i.test(line)) continue;

    // ── e-conomic footer ──
    if (line.includes("secure.e-conomic.com")) {
      isEconomic = true;
      continue;
    }

    // ── Company/CVR from header ──
    // Pattern 1: "1796416 - Topix.dk ApS - CVR 45281736"
    const companyMatch = line.match(/\d+\s*-\s*(.+?)\s*-\s*CVR\s*(\d{8})/);
    if (companyMatch && !companyName) {
      companyName = companyMatch[1].trim();
      cvrNumber = companyMatch[2];
      continue;
    }
    // Pattern 2: "SnowWaves ApS (CVR-nr. 39850850)" — strip timestamp prefix if present
    const companyMatch2 = line.match(/(?:^|\s{2,})([A-ZÆØÅa-zæøå][\w\s&.]+(?:ApS|A\/S|I\/S|IVS|K\/S|P\/S|Holding|Group|Invest))\s*\(CVR[\s\-.:nNrR]*\s*(\d{8})\)/i);
    if (companyMatch2 && !companyName) {
      companyName = companyMatch2[1].trim();
      cvrNumber = companyMatch2[2];
      continue;
    }
    // Pattern 3: Standalone CVR line (e.g. "CVR: 12345678" or "CVR-nr.: 12345678")
    // Common in Dinero PDFs where company name and CVR are on separate lines
    if (!cvrNumber) {
      const cvrOnlyMatch = line.match(/^\s*CVR[\s\-.:nNrR]*\s*(\d{8})\s*$/i);
      if (cvrOnlyMatch) {
        cvrNumber = cvrOnlyMatch[1];
        continue;
      }
    }
    // Pattern 3b: Company name on early lines (lines 1-5) — entity suffix without CVR on same line
    // Only if we haven't found company name yet and this is an early line (heuristic: short, has entity suffix)
    if (!companyName && !line.match(/\d{4}\s/) && !line.match(DK_NUM_PATTERN)) {
      const entityMatch = line.match(/^([A-ZÆØÅa-zæøå][\w\s&.]+(?:ApS|A\/S|I\/S|IVS|K\/S|P\/S|Holding|Group|Invest))\s*$/i);
      if (entityMatch && line.length < 80) {
        companyName = entityMatch[1].trim();
        continue;
      }
    }

    // ── Period from header ──
    // Pattern 1: "Saldobalance for perioden 01.04.25 - 30.04.25" (dot-separated)
    const periodMatch = line.match(
      /(?:Saldobalance|Resultatopg).+?(\d{2})\.(\d{2})\.(\d{2,4})\s*-\s*(\d{2})\.(\d{2})\.(\d{2,4})/i
    );
    if (periodMatch && !periodStart) {
      const [, , m1, y1, , m2, y2] = periodMatch;
      const fullY1 = y1.length === 2 ? (parseInt(y1) >= 50 ? "19" : "20") + y1 : y1;
      const fullY2 = y2.length === 2 ? (parseInt(y2) >= 50 ? "19" : "20") + y2 : y2;
      periodStart = `${periodMatch[1]}-${m1}-${fullY1}`;
      periodEnd = `${periodMatch[4]}-${m2}-${fullY2}`;
      const monthIdx = parseInt(m2, 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        reportPeriod = `${MONTH_NAMES[monthIdx]} ${fullY2}`;
      }
      // Also set section marker if this line contains "Resultatopg"
      if (/RESULTATOPG/i.test(line)) {
        currentSection = "PNL";
        hasResultatopgoerelse = true;
      }
      continue;
    }
    // Pattern 2: "Resultatopgørelse 01/01-2026 - 31/12-2026" (slash/dash-separated)
    const periodMatch2 = line.match(
      /(?:Saldobalance|Resultatopg).+?(\d{2})\/(\d{2})-(\d{4})\s*-\s*(\d{2})\/(\d{2})-(\d{4})/i
    );
    if (periodMatch2 && !periodStart) {
      const [, d1, m1, y1, d2, m2, y2] = periodMatch2;
      periodStart = `${d1}-${m1}-${y1}`;
      periodEnd = `${d2}-${m2}-${y2}`;
      const monthIdx = parseInt(m2, 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        reportPeriod = `${MONTH_NAMES[monthIdx]} ${y2}`;
      }
      // Also set section marker if this line contains "Resultatopg"
      if (/RESULTATOPG/i.test(line)) {
        currentSection = "PNL";
        hasResultatopgoerelse = true;
      }
      continue;
    }

    // ── Section markers ──
    if (/RESULTATOPG/i.test(line) && !/i alt/i.test(line)) {
      currentSection = "PNL";
      hasResultatopgoerelse = true;
      continue;
    }
    if (/^#?\s*AKTIVER\b/i.test(line) && !/i alt/i.test(line) && !/anlæg|omsætning/i.test(line)) {
      currentSection = "AKTIVER";
      hasAktiver = true;
      continue;
    }
    if (/^#?\s*PASSIVER\b/i.test(line) && !/i alt/i.test(line)) {
      currentSection = "PASSIVER";
      hasPassiver = true;
      continue;
    }

    // ── Standalone total labels: "AKTIVER I ALT", "PASSIVER I ALT", etc. ──
    if (/^#?\s*(AKTIVER I ALT|PASSIVER I ALT|GÆLD I ALT|EGENKAPITAL I ALT)/i.test(line)) {
      const labelMatch = line.match(/(AKTIVER I ALT|PASSIVER I ALT|GÆLD I ALT|EGENKAPITAL I ALT)/i);
      if (labelMatch) {
        // Check if numbers are on this line
        const nums = line.match(DK_NUM_PATTERN);
        if (nums && nums.length >= 1) {
          const periodVal = parseDanishNumber(nums[0]);
          const ytdVal = nums.length >= 2 ? parseDanishNumber(nums[1]) : null;
          lines.push({
            account_no: null,
            name: labelMatch[1],
            period_amount: periodVal,
            ytd_amount: ytdVal,
            is_subtotal: true,
            section: currentSection,
          });
        } else {
          // Numbers on next line(s)
          pendingTotalLabel = labelMatch[1];
          pendingTotalSection = currentSection;
        }
      }
      continue;
    }

    // ── Skip non-data lines ──
    // Skip separator lines (only dashes/pipes/spaces, no letters)
    if (/^\|[\s|-]*\|/.test(line) && !/[a-zA-ZæøåÆØÅ]/.test(line.replace(/[-|\s.]/g, ""))) continue;
    if (/^#\s*(Nr|Navn|Perioden|År)/i.test(line)) continue;
    if (/^\|\s*Nr\.?\s*\|/i.test(line)) continue;

    // ── Pending total: capture numbers from next line ──
    if (pendingTotalLabel) {
      const nums = line.match(DK_NUM_PATTERN);
      if (nums && nums.length >= 1) {
        const periodVal = parseDanishNumber(nums[0]);
        const ytdVal = nums.length >= 2 ? parseDanishNumber(nums[1]) : null;
        lines.push({
          account_no: null,
          name: pendingTotalLabel,
          period_amount: periodVal,
          ytd_amount: ytdVal,
          is_subtotal: true,
          section: pendingTotalSection,
        });
        pendingTotalLabel = null;
        pendingTotalSection = null;
        continue;
      }
      // If no numbers found, discard pending label
      pendingTotalLabel = null;
      pendingTotalSection = null;
    }

    // ── Markdown table row: | acct | name | period | ytd | ──
    const tableMatch = line.match(
      /^\|\s*(\d{4})?\s*\|\s*(.+?)\s*\|\s*(-?[\d.,]+)\s*\|\s*(-?[\d.,]+)\s*\|?\s*$/
    );
    if (tableMatch) {
      const accountNo = tableMatch[1] || null;
      const name = tableMatch[2].trim();
      const periodVal = parseDanishNumber(tableMatch[3]);
      const ytdVal = parseDanishNumber(tableMatch[4]);

      if (name && (periodVal !== null || ytdVal !== null)) {
        lines.push({
          account_no: accountNo,
          name,
          period_amount: periodVal,
          ytd_amount: ytdVal,
          is_subtotal: !accountNo || isSubtotalName(name),
          section: currentSection,
        });
      }
      continue;
    }

    // ── Raw text with numbers ──
    const nums = line.match(DK_NUM_PATTERN);
    if (nums && nums.length >= 1) {
      const accountMatch = line.match(/^\s*(\d{4})\s+/);
      const accountNo = accountMatch ? accountMatch[1] : null;

      // Extract name: between account number and first number
      let name = line;
      if (accountNo) name = name.replace(/^\s*\d{4}\s+/, "");
      const firstNumIdx = name.search(/-?[\d.]+,\d{2}/);
      if (firstNumIdx > 0) name = name.substring(0, firstNumIdx).trim();
      // Remove markdown/pipe artifacts
      name = name.replace(/^\|?\s*/, "").replace(/\s*\|?\s*$/, "").trim();

      if (name && name.length > 1) {
        const periodVal = parseDanishNumber(nums[0]);
        const ytdVal = nums.length >= 2 ? parseDanishNumber(nums[1]) : null;
        // Subtotal detection: lines with account numbers are detail lines.
        // Lines WITHOUT account numbers: use name-based detection only.
        // Missing account number does NOT imply subtotal — Dinero PDFs often lack account numbers.
        const subtotal = isSubtotalName(name);
        lines.push({
          account_no: accountNo,
          name,
          period_amount: periodVal,
          ytd_amount: ytdVal,
          is_subtotal: subtotal,
          section: currentSection,
        });
      }
    }
  }

  return {
    lines,
    metadata: {
      company_name: companyName,
      cvr_number: cvrNumber,
      period_start: periodStart,
      period_end: periodEnd,
      report_period: reportPeriod,
      is_economic: isEconomic,
      has_resultatopgoerelse: hasResultatopgoerelse,
      has_aktiver: hasAktiver,
      has_passiver: hasPassiver,
    },
  };
}
