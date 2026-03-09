/**
 * Template: DK_ECONOMIC_RESULTATOPGOERELSE_XLSX_V1
 * e-conomic Resultatopgørelse XLSX (P&L only)
 *
 * CAUTION: This template was implemented WITHOUT a reference fixture file.
 * First real e-conomic XLSX resultatopgørelse upload is the true acceptance test.
 * If detection or extraction fails on a real file, check:
 *   - Header row position (assumed row 0-2)
 *   - Value column index
 *   - Label spelling variations
 * Upgrade parser_confidence to HIGH after successful validation.
 *
 * Detection: Label/section-based — "Resultatopgørelse" header + P&L subtotals + absence of balance sections
 * Extraction: Label-first, scans rows for Danish P&L subtotals
 * Sign normalization: Done in template (canonical engine receives business-convention values)
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
// e-conomic P&L XLSX uses credit convention:
//   Revenue: negative (credit)
//   Costs: positive (debit)
//   Dækningsbidrag/EBT/Net result: negative when profitable (credit)

/** Revenue and cost lines → always positive in canonical output */
function absVal(val: number | null): number | null {
  return val != null ? Math.abs(val) : null;
}

/**
 * Dækningsbidrag, Resultat før skat, Resultat efter skat → flip sign
 * Reason: e-conomic uses credit convention where profit subtotals are negative.
 * Business convention: positive = profit, negative = loss.
 */
function flipSign(val: number | null): number | null {
  return val != null ? -val : null;
}

// ── Danish number parsing ──

function parseDanishNumber(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    // Danish format: "1.234,56" → remove dots, replace comma with dot
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

    // Try to find label — usually column 0 or 1
    // If column 0 is a number (account no), label is column 1
    const col0 = (row[0] ?? "").toString().trim();
    const col0AsNum = parseInt(col0, 10);
    let label: string;
    let accountNo: string | null = null;

    if (!isNaN(col0AsNum) && col0AsNum > 0) {
      accountNo = col0;
      label = normalizeLabel(row[1]);
    } else if (col0 !== "") {
      label = normalizeLabel(row[0]);
      // Check if row[1] has a longer label (sometimes col0 is just category header)
      const col1Label = normalizeLabel(row[1]);
      if (col1Label.length > label.length && col1Label.length > 3) {
        label = col1Label;
      }
    } else {
      label = normalizeLabel(row[1]);
    }

    if (!label) continue;

    const value = parseDanishNumber(row[valueColIndex]);

    // Detect subtotals: lines with "i alt", "ialt", "dækningsbidrag", "resultat"
    const isSubtotal = /i\s*alt|dækningsbidrag|resultat/i.test(label);

    result.push({ label, value, rowIndex: i, isSubtotal, accountNo });
  }

  return result;
}

// ── Label matchers for key figures ──

interface LabelMatch {
  key: string;
  pattern: RegExp;
  signRule: "abs" | "flipSign";
  reason: string;
}

const LABEL_MATCHERS: LabelMatch[] = [
  // Revenue — abs(): credit convention (negative) → positive
  { key: "omsaetning", pattern: /omsætning\s*(i\s*alt|ialt)$/i, signRule: "abs", reason: "Revenue is negative (credit) in e-conomic → abs() to business convention" },
  // COGS — abs(): debit (positive), keep positive
  { key: "direkte_omkostninger", pattern: /^(vareforbrug|direkte\s*omkostninger)\s*(i\s*alt|ialt)?$/i, signRule: "abs", reason: "Cost line, always positive" },
  // Dækningsbidrag — flipSign(): credit subtotal (negative when profitable) → positive
  { key: "daekningsbidrag", pattern: /dækningsbidrag/i, signRule: "flipSign", reason: "Profit subtotal: negative (credit) = profit → flipSign to positive" },
  // Payroll — abs(): debit cost
  { key: "loenninger", pattern: /lønninger\s*(mv\.?)?\s*(i\s*alt|ialt)$/i, signRule: "abs", reason: "Cost line, always positive" },
  // Pensions — abs(): debit cost
  { key: "pensioner_sociale", pattern: /pensioner\s*&?\s*sociale\s*(bidrag)?\s*(i\s*alt|ialt)$/i, signRule: "abs", reason: "Cost line, always positive" },
  // Other staff — abs()
  { key: "oevrige_personale", pattern: /øvrige\s*personaleudgifter\s*(i\s*alt|ialt)$/i, signRule: "abs", reason: "Cost line, always positive" },
  // Sales costs — abs(): debit cost
  { key: "salgsomkostninger", pattern: /salgs(omkostninger|-\s*og\s*rejseomkostninger)\s*(i\s*alt|ialt)?$/i, signRule: "abs", reason: "Cost line, always positive" },
  // Facility costs — abs(): debit cost
  { key: "lokaleomkostninger", pattern: /lokaleomkostninger\s*(i\s*alt|ialt)?$/i, signRule: "abs", reason: "Cost line, always positive" },
  // Transport/vehicle costs — abs(): debit cost
  { key: "transportomkostninger", pattern: /(transport|autodrift)\s*(omkostninger)?\s*(i\s*alt|ialt)?$/i, signRule: "abs", reason: "Cost line, always positive" },
  // Admin costs — abs(): debit cost
  { key: "administrationsomkostninger", pattern: /administrations(omkostninger)?\s*(i\s*alt|ialt)?$/i, signRule: "abs", reason: "Cost line, always positive" },
  // EBITDA — flipSign(): credit subtotal
  { key: "resultat_foer_afskrivninger", pattern: /resultat\s*før\s*afskrivninger/i, signRule: "flipSign", reason: "Profit subtotal: negative (credit) = profit → flipSign to positive" },
  // Depreciation — abs(): debit cost
  { key: "afskrivninger", pattern: /afskrivninger\s*(i\s*alt|ialt)?$/i, signRule: "abs", reason: "Cost line, always positive" },
  // EBIT — flipSign()
  { key: "indtjeningsbidrag", pattern: /(indtjeningsbidrag|resultat\s*før\s*(renter|finansielle\s*poster))/i, signRule: "flipSign", reason: "Profit subtotal → flipSign" },
  // Financial costs — abs()
  { key: "finansieringsudgifter", pattern: /finansierings(udgifter|omkostninger)\s*(i\s*alt|ialt)?$/i, signRule: "abs", reason: "Cost line, always positive" },
  // Extraordinary items — abs()
  { key: "ekstraordinaere_poster", pattern: /ekstraordinære\s*poster\s*(i\s*alt|ialt)?$/i, signRule: "abs", reason: "Cost line, always positive" },
  // EBT — flipSign(): credit subtotal (negative when profitable) → positive
  { key: "resultat_foer_skat", pattern: /resultat\s*før\s*skat/i, signRule: "flipSign", reason: "EBT: negative (credit) = profit → flipSign to positive" },
  // Net result — flipSign(): credit subtotal (negative when profitable) → positive
  { key: "arets_resultat", pattern: /(årets\s*resultat|resultat\s*efter\s*skat)/i, signRule: "flipSign", reason: "Net result: negative (credit) = profit → flipSign to positive" },
];

function applySignRule(value: number | null, rule: "abs" | "flipSign"): number | null {
  if (value == null) return null;
  return rule === "abs" ? Math.abs(value) : -value;
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

    // ── +40: Header contains "Resultatopgørelse" (NOT "Saldobalance"/"Balance" as title) ──
    const headerText = ctx.headerRows
      .slice(0, 3)
      .map((r) => (r || []).map((c: any) => (c ?? "").toString()).join(" "))
      .join(" ")
      .toLowerCase();

    if (/resultatopgørelse/.test(headerText) && !/saldobalance/.test(headerText)) {
      // Check that "Balance" in header is NOT a standalone title (row[1] = "Balance" is the combined template)
      const row1Text = (ctx.headerRows[1] || []).map((c: any) => (c ?? "").toString()).join(" ").trim().toLowerCase();
      if (row1Text === "balance" || row1Text.startsWith("balance")) {
        // This is the combined template format — score 0
        return 0;
      }
      score += 40;
    } else {
      return 0; // No "Resultatopgørelse" in header → definitely not this template
    }

    // ── +20: Absence of "AKTIVER" and "PASSIVER" in all rows ──
    if (!/\baktiver\b/.test(allText) && !/\bpassiver\b/.test(allText)) {
      score += 20;
    } else {
      // Balance sections present → NOT a pure P&L
      return 0;
    }

    // ── +15: P&L subtotals present (at least 2 of: Omsætning, Dækningsbidrag, Resultat) ──
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

    // ── Parse metadata from header rows ──
    const companyName = (ctx.rows[0]?.[0] ?? "").toString().trim() || null;

    // Try to find period from header rows (e.g. "01-01-2026 til 31-01-2026")
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    let reportPeriod: string | null = null;

    for (let i = 0; i < Math.min(5, ctx.rows.length); i++) {
      const rowText = (ctx.rows[i] || []).map((c: any) => (c ?? "").toString()).join(" ");
      const periodMatch = rowText.match(/(\d{2}-\d{2}-\d{4})\s*til\s*(\d{2}-\d{2}-\d{4})/);
      if (periodMatch) {
        periodStart = periodMatch[1];
        periodEnd = periodMatch[2];
        break;
      }
      // Also try "01.01.2026 - 31.01.2026" format
      const periodMatch2 = rowText.match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
      if (periodMatch2) {
        periodStart = periodMatch2[1].replace(/\./g, "-");
        periodEnd = periodMatch2[2].replace(/\./g, "-");
        break;
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

    // ── Extract key figures by label matching ──
    const keyFigures: Record<string, number | null> = {};
    const matchedLabels: string[] = [];
    const unmatchedSubtotals: string[] = [];

    for (const row of parsedRows) {
      if (!row.isSubtotal) continue;

      let matched = false;
      for (const matcher of LABEL_MATCHERS) {
        if (matcher.pattern.test(row.label)) {
          // Only take the first match for each key (subtotals appear once)
          if (!(matcher.key in keyFigures)) {
            keyFigures[matcher.key] = applySignRule(row.value, matcher.signRule);
            matchedLabels.push(`${matcher.key}=${keyFigures[matcher.key]} (${row.label}, rule=${matcher.signRule})`);
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

    // Check: EBITDA calculation (compute when possible, not default SKIP)
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

    // Check: EBIT calculation (compute when possible)
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

    // Balance checks — always SKIP for P&L
    checks.push({ name: "balance_equation", result: "SKIP", details: "P&L only — no balance data" });

    const hasFail = checks.some((c) => c.result === "FAIL");
    const parserStatus: "PASS" | "FAIL" = hasFail ? "FAIL" : "PASS";

    const validation: ParserValidation = { parser_status: parserStatus, checks };

    // ── Deterministic metadata ──
    const deterministicMeta: DeterministicMeta = {
      template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_XLSX_V1",
      // MEDIUM until validated against real e-conomic XLSX P&L fixture
      // Upgrade to HIGH after successful validation
      parser_confidence: "MEDIUM",
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
      cvr_number: null, // XLSX P&L typically doesn't contain CVR
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

// ── Helper: Map P&L line name to canonical class ──

function mapPnlClass(name: string): string {
  if (/omsætning/i.test(name)) return "REVENUE";
  if (/vareforbrug|direkte omk|variable omk/i.test(name)) return "COGS";
  if (/afskrivning/i.test(name)) return "DEPR";
  if (/rente.*indtægt|finansielle indtægt/i.test(name)) return "FIN_INCOME";
  if (/rente.*udgift|finansielle udgift|finansiering/i.test(name)) return "FIN_EXPENSE";
  return "OPEX";
}
