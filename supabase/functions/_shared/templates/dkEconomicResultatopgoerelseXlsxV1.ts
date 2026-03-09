/**
 * Template: DK_ECONOMIC_RESULTATOPGOERELSE_XLSX_V1
 * e-conomic Resultatopgørelse XLSX (P&L only)
 *
 * Detection: Label/section-based — "Resultatopgørelse" header + P&L subtotals + absence of balance sections
 * Extraction: Label-first, scans rows for Danish P&L subtotals
 * Sign normalization: Dynamic — infers convention from anchor lines (revenue/cost signs)
 * Column basis: SINGLE — period_amount only (no YTD split expected in standalone P&L XLSX)
 */

import type {
  TemplateEntry,
  DetectionContext,
  ExtractionContext,
  DeterministicExtractedData,
  ParserValidation,
  DeterministicMeta,
} from "../templateRegistry.ts";

// ── Sign normalization helpers ──

/** Revenue and cost lines → always positive in canonical output */
function absVal(val: number | null): number | null {
  return val != null ? Math.abs(val) : null;
}

/**
 * Flip sign — used in credit convention where profit subtotals are negative when profitable.
 */
function flipSign(val: number | null): number | null {
  return val != null ? -val : null;
}

// ── Danish number parsing ──

function parseDanishNumber(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/\./g, "").replace(",", ".").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

// ── Row scanning helpers ──

interface ParsedRow {
  label: string;
  value: number | null;
  rowIndex: number;
  isSubtotal: boolean;
  accountNo: string | null;
}

function normalizeLabel(val: any): string {
  return (val ?? "").toString().trim().toLowerCase();
}

/**
 * Scan XLSX rows and extract label + value pairs.
 * Detects which column holds the numeric value.
 */
function scanRows(rows: any[][]): ParsedRow[] {
  const result: ParsedRow[] = [];

  // Detect value column: find first row with a numeric value after header area
  let valueColIndex = -1;
  for (let i = 3; i < Math.min(rows.length, 50); i++) {
    const row = rows[i];
    if (!row) continue;
    for (let c = 1; c < (row.length || 0); c++) {
      const parsed = parseDanishNumber(row[c]);
      if (parsed !== null && parsed !== 0) {
        valueColIndex = c;
        break;
      }
    }
    if (valueColIndex >= 0) break;
  }

  if (valueColIndex < 0) valueColIndex = 2; // Fallback: column C

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const col0 = (row[0] ?? "").toString().trim();
    const col0AsNum = parseInt(col0, 10);
    let label: string;
    let accountNo: string | null = null;

    if (!isNaN(col0AsNum) && col0AsNum > 0) {
      accountNo = col0;
      label = normalizeLabel(row[1]);
    } else if (col0 !== "") {
      label = normalizeLabel(row[0]);
      const col1Label = normalizeLabel(row[1]);
      if (col1Label.length > label.length && col1Label.length > 3) {
        label = col1Label;
      }
    } else {
      label = normalizeLabel(row[1]);
    }

    if (!label) continue;

    const value = parseDanishNumber(row[valueColIndex]);

    const isSubtotal = /i\s*alt|dækningsbidrag|resultat/i.test(label);

    result.push({ label, value, rowIndex: i, isSubtotal, accountNo });
  }

  return result;
}

// ── Sign Convention Detection ──

type SignConvention = "business" | "credit" | "unknown";

/**
 * Infer sign convention from anchor lines:
 *   BUSINESS: revenue > 0, individual cost lines < 0
 *   CREDIT:   revenue < 0, individual cost lines > 0
 *   UNKNOWN:  ambiguous or missing anchors
 *
 * Strategy:
 *   1. Revenue anchor: "omsætning i alt" subtotal (reliable — always a subtotal)
 *   2. Cost anchor: individual lines (with accountNo) that appear AFTER "omsætning i alt"
 *      Reason: some files present cost subtotals as absolute (positive) even in business convention,
 *      but individual cost lines consistently show the raw sign.
 */
function detectSignConvention(parsedRows: ParsedRow[]): SignConvention {
  let revenueVal: number | null = null;
  let passedRevenue = false;
  let costLineValues: number[] = [];

  for (const row of parsedRows) {
    if (row.value == null || row.value === 0) continue;

    // Revenue anchor — subtotal "omsætning i alt"
    if (revenueVal == null && row.isSubtotal && /omsætning\s*(i\s*alt|ialt)$/i.test(row.label)) {
      revenueVal = row.value;
      passedRevenue = true;
      continue;
    }

    // After revenue subtotal, collect individual cost lines (lines with accountNo, not subtotals)
    if (passedRevenue && !row.isSubtotal && row.accountNo != null && row.value !== 0) {
      costLineValues.push(row.value);
      if (costLineValues.length >= 3) break; // 3 samples is enough
    }
  }

  // Determine cost sign from individual lines
  const negativeCosts = costLineValues.filter(v => v < 0).length;
  const positiveCosts = costLineValues.filter(v => v > 0).length;
  const costSign = negativeCosts > positiveCosts ? "negative" : positiveCosts > negativeCosts ? "positive" : null;

  console.log(`[DK_ECONOMIC_PNL_XLSX] Sign convention anchors: revenue=${revenueVal}, costLines=[${costLineValues.join(", ")}], costSign=${costSign}`);

  if (revenueVal != null && costSign != null) {
    // BUSINESS: revenue positive, individual costs negative
    if (revenueVal > 0 && costSign === "negative") return "business";
    // CREDIT: revenue negative, individual costs positive
    if (revenueVal < 0 && costSign === "positive") return "credit";
  }

  return "unknown";
}

// ── Label matchers for key figures ──

interface LabelMatch {
  key: string;
  pattern: RegExp;
  signRule: "abs" | "flipSign" | "keep";
  isProfitSubtotal: boolean; // true = sign rule depends on convention
  reason: string;
}

const LABEL_MATCHERS: LabelMatch[] = [
  // Revenue — abs(): always positive
  { key: "omsaetning", pattern: /omsætning\s*(i\s*alt|ialt)$/i, signRule: "abs", isProfitSubtotal: false, reason: "Revenue → abs()" },
  // COGS — keep raw sign (can be contra-cost in business convention)
  { key: "direkte_omkostninger", pattern: /^(vareforbrug|direkte\s*omkostninger)\s*(i\s*alt|ialt)?$/i, signRule: "keep", isProfitSubtotal: false, reason: "COGS → keep raw sign" },
  // Dækningsbidrag — profit subtotal (convention-dependent)
  { key: "daekningsbidrag", pattern: /dækningsbidrag/i, signRule: "flipSign", isProfitSubtotal: true, reason: "Profit subtotal (convention-dependent)" },
  // Payroll — abs()
  { key: "loenninger", pattern: /lønninger\s*(mv\.?)?\s*(i\s*alt|ialt)$/i, signRule: "abs", isProfitSubtotal: false, reason: "Cost → abs()" },
  // Pensions — abs()
  { key: "pensioner_sociale", pattern: /pensioner\s*&?\s*sociale\s*(bidrag)?\s*(i\s*alt|ialt)$/i, signRule: "abs", isProfitSubtotal: false, reason: "Cost → abs()" },
  // Other staff — abs()
  { key: "oevrige_personale", pattern: /øvrige\s*personaleudgifter\s*(i\s*alt|ialt)$/i, signRule: "abs", isProfitSubtotal: false, reason: "Cost → abs()" },
  // Sales costs — abs()
  { key: "salgsomkostninger", pattern: /salgs(omkostninger|-\s*og\s*rejseomkostninger)\s*(i\s*alt|ialt)?$/i, signRule: "abs", isProfitSubtotal: false, reason: "Cost → abs()" },
  // Facility costs — abs()
  { key: "lokaleomkostninger", pattern: /lokaleomkostninger\s*(i\s*alt|ialt)?$/i, signRule: "abs", isProfitSubtotal: false, reason: "Cost → abs()" },
  // Transport/vehicle costs — abs()
  { key: "transportomkostninger", pattern: /(transport|autodrift)\s*(omkostninger)?\s*(i\s*alt|ialt)?$/i, signRule: "abs", isProfitSubtotal: false, reason: "Cost → abs()" },
  // Admin costs — abs()
  { key: "administrationsomkostninger", pattern: /administrations(omkostninger)?\s*(i\s*alt|ialt)?$/i, signRule: "abs", isProfitSubtotal: false, reason: "Cost → abs()" },
  // EBITDA — profit subtotal (convention-dependent)
  { key: "resultat_foer_afskrivninger", pattern: /resultat\s*før\s*afskrivninger/i, signRule: "flipSign", isProfitSubtotal: true, reason: "Profit subtotal (convention-dependent)" },
  // Depreciation — abs()
  { key: "afskrivninger", pattern: /afskrivninger\s*(i\s*alt|ialt)?$/i, signRule: "abs", isProfitSubtotal: false, reason: "Cost → abs()" },
  // EBIT — profit subtotal (convention-dependent)
  { key: "indtjeningsbidrag", pattern: /(indtjeningsbidrag|resultat\s*før\s*(renter|finansielle\s*poster))/i, signRule: "flipSign", isProfitSubtotal: true, reason: "Profit subtotal (convention-dependent)" },
  // Financial costs — abs()
  { key: "finansieringsudgifter", pattern: /finansierings(udgifter|omkostninger)\s*(i\s*alt|ialt)?$/i, signRule: "abs", isProfitSubtotal: false, reason: "Cost → abs()" },
  // Extraordinary items — abs()
  { key: "ekstraordinaere_poster", pattern: /ekstraordinære\s*poster\s*(i\s*alt|ialt)?$/i, signRule: "abs", isProfitSubtotal: false, reason: "Cost → abs()" },
  // EBT — profit subtotal (convention-dependent)
  { key: "resultat_foer_skat", pattern: /resultat\s*før\s*skat/i, signRule: "flipSign", isProfitSubtotal: true, reason: "Profit subtotal (convention-dependent)" },
  // Net result — profit subtotal (convention-dependent)
  { key: "arets_resultat", pattern: /(årets\s*resultat|resultat\s*efter\s*skat)/i, signRule: "flipSign", isProfitSubtotal: true, reason: "Profit subtotal (convention-dependent)" },
];

function applySignRule(value: number | null, rule: "abs" | "flipSign" | "keep"): number | null {
  if (value == null) return null;
  if (rule === "abs") return Math.abs(value);
  if (rule === "flipSign") return -value;
  return value;
}

/**
 * Get effective sign rule for a matcher given the detected convention.
 * - CREDIT convention: profit subtotals use flipSign (default)
 * - BUSINESS convention: profit subtotals use abs (already correct sign)
 * - UNKNOWN: profit subtotals use abs (safer — don't blindly flip)
 */
function getEffectiveSignRule(matcher: LabelMatch, convention: SignConvention): "abs" | "flipSign" | "keep" {
  if (!matcher.isProfitSubtotal) return matcher.signRule;
  // Profit subtotals: convention-dependent
  if (convention === "credit") return "flipSign";
  // business or unknown → abs (don't flip what might already be correct)
  return "abs";
}

// ── Template Definition ──

export const dkEconomicResultatopgoerelseXlsxV1: TemplateEntry = {
  template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_XLSX_V1",
  label: "e-conomic Resultatopgørelse XLSX (P&L only)",
  supported_file_types: ["xlsx", "xls"],
  statement_type: "pnl",

  detect(ctx: DetectionContext): number {
    if (!ctx.headerRows || ctx.headerRows.length < 3) return 0;

    let score = 0;
    const allText = ctx.headerRows
      .slice(0, Math.min(ctx.headerRows.length, 200))
      .map((r) => (r || []).map((c: any) => (c ?? "").toString()).join(" "))
      .join("\n")
      .toLowerCase();

    // ── +40: Header contains "Resultatopgørelse" (scan rows 0-5) ──
    const headerText = ctx.headerRows
      .slice(0, 6)
      .map((r) => (r || []).map((c: any) => (c ?? "").toString()).join(" "))
      .join(" ")
      .toLowerCase();

    if (/resultatopgørelse/.test(headerText) && !/saldobalance/.test(headerText)) {
      // Check that "Balance" in header is NOT a standalone title (combined template)
      const row1Text = (ctx.headerRows[1] || []).map((c: any) => (c ?? "").toString()).join(" ").trim().toLowerCase();
      if (row1Text === "balance" || row1Text.startsWith("balance")) {
        return 0;
      }
      score += 40;
    } else {
      return 0;
    }

    // ── +20: Absence of "AKTIVER" and "PASSIVER" ──
    if (!/\baktiver\b/.test(allText) && !/\bpassiver\b/.test(allText)) {
      score += 20;
    } else {
      return 0;
    }

    // ── +15: P&L subtotals present ──
    let subtotalCount = 0;
    if (/omsætning/.test(allText)) subtotalCount++;
    if (/dækningsbidrag/.test(allText)) subtotalCount++;
    if (/resultat/.test(allText)) subtotalCount++;
    if (subtotalCount >= 2) score += 15;

    // ── +10: Absence of balance-totals ──
    if (!/aktiver\s*i\s*alt/.test(allText) && !/passiver\s*i\s*alt/.test(allText) && !/egenkapital/.test(allText)) {
      score += 10;
    }

    // ── +5: e-conomic reference ──
    if (/e-conomic/.test(allText)) score += 5;

    return score; // Max ~90
  },

  extract(
    ctx: ExtractionContext
  ):
    | { success: true; data: DeterministicExtractedData }
    | { success: false; error: string } {
    if (!ctx.rows || ctx.rows.length < 5) {
      return { success: false, error: "Insufficient rows for extraction" };
    }

    // ── Parse metadata from header rows (0-5) ──
    let companyName: string | null = null;
    let cvrNumber: string | null = null;
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    let reportPeriod: string | null = null;

    for (let i = 0; i < Math.min(6, ctx.rows.length); i++) {
      const rowText = (ctx.rows[i] || []).map((c: any) => (c ?? "").toString()).join(" ").trim();
      if (!rowText) continue;

      // CVR extraction: "CVR 45281736" or "CVR-nr. 45281736"
      if (!cvrNumber) {
        const cvrMatch = rowText.match(/CVR[\s-]*(?:nr\.?\s*)?(\d{8})/i);
        if (cvrMatch) {
          cvrNumber = cvrMatch[1];
          continue; // CVR line is not company name
        }
      }

      // Period extraction: support both 2-digit and 4-digit years
      // Pattern 1: "01-01-2026 til 31-01-2026"
      const periodMatch1 = rowText.match(/(\d{2}-\d{2}-\d{4})\s*til\s*(\d{2}-\d{2}-\d{4})/);
      if (periodMatch1) {
        periodStart = periodMatch1[1];
        periodEnd = periodMatch1[2];
        continue;
      }
      // Pattern 2: "01.12.25 - 31.12.25" or "01.12.2025 - 31.12.2025"
      const periodMatch2 = rowText.match(/(\d{2}\.\d{2}\.\d{2,4})\s*-\s*(\d{2}\.\d{2}\.\d{2,4})/);
      if (periodMatch2) {
        periodStart = normalizeDateStr(periodMatch2[1]);
        periodEnd = normalizeDateStr(periodMatch2[2]);
        continue;
      }

      // Company name extraction:
      // Skip lines that are clearly not company names
      if (/^(nr\.|nummer|navn|perioden|resultatopgørelse|rapporter)/i.test(rowText)) continue;
      if (/cvr/i.test(rowText)) continue;
      if (rowText.length < 3) continue;

      if (!companyName) {
        // Strip leading numeric ID: "1796416 - Topix.dk ApS" → "Topix.dk ApS"
        const stripped = rowText.replace(/^\d+\s*[-–]\s*/, "").trim();
        // Only use stripped version if remainder looks like a name (> 2 chars, not just numbers)
        if (stripped.length > 2 && !/^\d+$/.test(stripped)) {
          companyName = stripped;
        } else if (rowText.length > 2) {
          companyName = rowText;
        }
      }
    }

    // Format report_period from periodEnd
    if (periodEnd) {
      const match = periodEnd.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (match) {
        const monthNames = [
          "Januar", "Februar", "Marts", "April", "Maj", "Juni",
          "Juli", "August", "September", "Oktober", "November", "December",
        ];
        const month = parseInt(match[2], 10);
        if (month >= 1 && month <= 12) {
          reportPeriod = `${monthNames[month - 1]} ${match[3]}`;
        }
      }
    }

    // ── Scan rows for label + value pairs ──
    const parsedRows = scanRows(ctx.rows);
    console.log(`[DK_ECONOMIC_PNL_XLSX] Scanned ${parsedRows.length} rows, subtotals: ${parsedRows.filter(r => r.isSubtotal).length}`);

    // ── Detect sign convention from anchor lines ──
    const convention = detectSignConvention(parsedRows);
    console.log(`[DK_ECONOMIC_PNL_XLSX] Detected sign convention: ${convention}`);

    // ── Extract key figures by label matching ──
    const keyFigures: Record<string, number | null> = {};
    const matchedLabels: string[] = [];
    const unmatchedSubtotals: string[] = [];

    for (const row of parsedRows) {
      if (!row.isSubtotal) continue;

      let matched = false;
      for (const matcher of LABEL_MATCHERS) {
        if (matcher.pattern.test(row.label)) {
          if (!(matcher.key in keyFigures)) {
            const effectiveRule = getEffectiveSignRule(matcher, convention);
            keyFigures[matcher.key] = applySignRule(row.value, effectiveRule);
            matchedLabels.push(`${matcher.key}=${keyFigures[matcher.key]} (${row.label}, rule=${effectiveRule}, convention=${convention})`);
          }
          matched = true;
          break;
        }
      }
      if (!matched) {
        unmatchedSubtotals.push(row.label);
      }
    }

    console.log(`[DK_ECONOMIC_PNL_XLSX] Matched: ${matchedLabels.join(", ")}`);
    if (unmatchedSubtotals.length > 0) {
      console.log(`[DK_ECONOMIC_PNL_XLSX] Unmatched subtotals: ${unmatchedSubtotals.join(", ")}`);
    }

    // ── Fail-closed: require minimum 3 parsed subtotals ──
    const parsedSubtotalCount = Object.keys(keyFigures).length;
    if (parsedSubtotalCount < 3) {
      return {
        success: false,
        error: `Only ${parsedSubtotalCount} subtotals matched (minimum 3 required). Unmatched: ${unmatchedSubtotals.join(", ")}`,
      };
    }

    // ── Build line items ──
    const lineItems: DeterministicExtractedData["line_items"] = parsedRows
      .filter((r) => r.isSubtotal || r.accountNo != null)
      .map((r) => ({
        name: r.label,
        period_amount: r.value,
        ytd_amount: null,
        raw_sign: r.value != null && r.value < 0 ? "MINUS" : "PLUS",
        account_no: r.accountNo,
        class: mapPnlClass(r.label),
      }));

    // ── Parser validation ──
    const checks: ParserValidation["checks"] = [];

    // Check: Revenue extracted
    if (keyFigures.omsaetning != null) {
      checks.push({ name: "revenue_present", result: "PASS", details: `Revenue: ${keyFigures.omsaetning}` });
    } else {
      checks.push({ name: "revenue_present", result: "FAIL", details: "No revenue found" });
    }

    // Check: EBT present
    if (keyFigures.resultat_foer_skat != null) {
      checks.push({ name: "ebt_present", result: "PASS", details: `EBT: ${keyFigures.resultat_foer_skat}` });
    } else {
      checks.push({ name: "ebt_present", result: "FAIL", details: "No EBT found" });
    }

    // Check: Gross profit sum
    if (keyFigures.omsaetning != null && keyFigures.direkte_omkostninger != null && keyFigures.daekningsbidrag != null) {
      const expected = keyFigures.omsaetning - keyFigures.direkte_omkostninger;
      const diff = Math.abs(expected - keyFigures.daekningsbidrag);
      checks.push({
        name: "gross_profit_sum",
        result: diff <= 2 ? "PASS" : "FAIL",
        details: `${keyFigures.omsaetning} - ${keyFigures.direkte_omkostninger} = ${expected.toFixed(2)}, DB = ${keyFigures.daekningsbidrag} (diff ${diff.toFixed(2)})`,
      });
    } else {
      checks.push({ name: "gross_profit_sum", result: "SKIP", details: "Missing revenue, cogs or gross_profit" });
    }

    // Check: EBITDA calculation
    if (keyFigures.daekningsbidrag != null && keyFigures.loenninger != null) {
      const opexSum = (keyFigures.loenninger ?? 0) +
        (keyFigures.pensioner_sociale ?? 0) +
        (keyFigures.oevrige_personale ?? 0) +
        (keyFigures.salgsomkostninger ?? 0) +
        (keyFigures.lokaleomkostninger ?? 0) +
        (keyFigures.administrationsomkostninger ?? 0) +
        (keyFigures.transportomkostninger ?? 0);
      const expectedEbitda = keyFigures.daekningsbidrag - opexSum;

      if (keyFigures.resultat_foer_afskrivninger != null) {
        const diff = Math.abs(expectedEbitda - keyFigures.resultat_foer_afskrivninger);
        checks.push({
          name: "ebitda_calculation",
          result: diff <= 2 ? "PASS" : "FAIL",
          details: `DB(${keyFigures.daekningsbidrag}) - OPEX(${opexSum.toFixed(2)}) = ${expectedEbitda.toFixed(2)}, reported EBITDA = ${keyFigures.resultat_foer_afskrivninger} (diff ${diff.toFixed(2)})`,
        });
      } else {
        checks.push({
          name: "ebitda_calculation",
          result: "PASS",
          details: `Computed EBITDA: ${expectedEbitda.toFixed(2)} (no reported EBITDA to compare)`,
        });
      }
    } else {
      checks.push({ name: "ebitda_calculation", result: "SKIP", details: "Missing gross_profit or payroll" });
    }

    // Check: EBIT calculation
    if (keyFigures.resultat_foer_afskrivninger != null && keyFigures.afskrivninger != null) {
      const expectedEbit = keyFigures.resultat_foer_afskrivninger - keyFigures.afskrivninger;
      if (keyFigures.indtjeningsbidrag != null) {
        const diff = Math.abs(expectedEbit - keyFigures.indtjeningsbidrag);
        checks.push({
          name: "ebit_calculation",
          result: diff <= 2 ? "PASS" : "FAIL",
          details: `EBITDA(${keyFigures.resultat_foer_afskrivninger}) - Depr(${keyFigures.afskrivninger}) = ${expectedEbit.toFixed(2)}, EBIT = ${keyFigures.indtjeningsbidrag} (diff ${diff.toFixed(2)})`,
        });
      } else {
        checks.push({
          name: "ebit_calculation",
          result: "PASS",
          details: `Computed EBIT: ${expectedEbit.toFixed(2)} (no reported EBIT to compare)`,
        });
      }
    } else {
      checks.push({ name: "ebit_calculation", result: "SKIP", details: "Missing EBITDA or depreciation" });
    }

    // Check: Result consistency
    if (keyFigures.resultat_foer_skat != null && keyFigures.daekningsbidrag != null) {
      const sensible = keyFigures.resultat_foer_skat <= keyFigures.daekningsbidrag + 2;
      checks.push({
        name: "result_consistency",
        result: sensible ? "PASS" : "FAIL",
        details: `EBT(${keyFigures.resultat_foer_skat}) ${sensible ? "≤" : ">"} gross_profit(${keyFigures.daekningsbidrag})`,
      });
    } else {
      checks.push({ name: "result_consistency", result: "SKIP", details: "Missing EBT or gross_profit" });
    }

    // Check: Impossible margin
    if (keyFigures.omsaetning != null && keyFigures.daekningsbidrag != null && keyFigures.omsaetning !== 0) {
      const marginPct = (keyFigures.daekningsbidrag / keyFigures.omsaetning) * 100;
      checks.push({
        name: "impossible_margin_check",
        result: marginPct >= -100 && marginPct <= 100 ? "PASS" : "FAIL",
        details: `Gross margin: ${marginPct.toFixed(1)}%`,
      });
    } else {
      checks.push({ name: "impossible_margin_check", result: "SKIP", details: "Missing data for margin" });
    }

    // Check: Sign convention confidence
    if (convention === "unknown") {
      checks.push({
        name: "sign_convention",
        result: "FAIL",
        details: "Could not determine sign convention from anchor lines — profit subtotals may be incorrect",
      });
    } else {
      checks.push({
        name: "sign_convention",
        result: "PASS",
        details: `Detected ${convention} convention`,
      });
    }

    // Balance checks — always SKIP for P&L
    checks.push({ name: "balance_equation", result: "SKIP", details: "P&L only — no balance data" });

    const hasFail = checks.some((c) => c.result === "FAIL");
    const parserStatus: "PASS" | "FAIL" = hasFail ? "FAIL" : "PASS";

    const validation: ParserValidation = { parser_status: parserStatus, checks };

    // ── Confidence: HIGH only when all conditions met ──
    const confidenceIsHigh = parserStatus === "PASS" && convention !== "unknown" && parsedSubtotalCount >= 5;
    const parserConfidence = confidenceIsHigh ? "HIGH" : "MEDIUM";

    // ── Deterministic metadata ──
    const deterministicMeta: DeterministicMeta = {
      template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_XLSX_V1",
      parser_confidence: parserConfidence as "HIGH" | "MEDIUM" | "LOW",
      detection_score: 0, // Set by registry
      parser_validation_status: parserStatus,
      parser_validation_errors: checks.filter((c) => c.result === "FAIL").map((c) => c.details),
      raw_line_count: parsedRows.length,
      normalized_line_count: lineItems.length,
      column_basis_rule: "single",
    };

    // ── Build extracted data ──
    const extractedData: DeterministicExtractedData = {
      report_type: "resultatopgørelse",
      company_name: companyName,
      cvr_number: cvrNumber,
      period_start: periodStart,
      period_end: periodEnd,
      report_period: reportPeriod,
      key_figures: keyFigures,
      line_items: lineItems,
      validation,
      _deterministic_meta: deterministicMeta,
    };

    return { success: true, data: extractedData };
  },
};

// ── Helper: Normalize date string (2-digit year → 4-digit) ──

function normalizeDateStr(dateStr: string): string {
  // "01.12.25" → "01-12-2025", "01.12.2025" → "01-12-2025"
  const parts = dateStr.split(".");
  if (parts.length === 3) {
    const [dd, mm, yy] = parts;
    const year = yy.length === 2 ? "20" + yy : yy;
    return `${dd}-${mm}-${year}`;
  }
  return dateStr.replace(/\./g, "-");
}

// ── Helper: Map P&L line name to canonical class ──

function mapPnlClass(name: string): string {
  if (/omsætning/i.test(name)) return "REVENUE";
  if (/vareforbrug|direkte omk|variable omk/i.test(name)) return "COGS";
  if (/afskrivning/i.test(name)) return "DEPR";
  if (/rente.*indtægt|finansielle indtægt/i.test(name)) return "FIN_INCOME";
  if (/rente.*udgift|finansielle udgift|finansiering/i.test(name)) return "FIN_EXPENSE";
  return "OPEX";
}
