/**
 * Template: DK_ECONOMIC_SALDOBALANCE_XLSX_V1
 * e-conomic detailed saldobalance XLSX — line items only, no subtotals.
 *
 * Structure:
 *   Row 1: empty
 *   Row 2: company name + CVR
 *   Row 3: "Rapporter > Regnskab > ..."
 *   Row 4: "Saldobalance for perioden DD.MM.YY - DD.MM.YY"
 *   Row 5: empty / "Perioden"
 *   Row 6: "Nr." / "Navn" / date-range columns
 *   Row 7+: line items (account_no, label, period, prev, ytd, ytd_prev)
 *
 * Sign convention: credit (revenue negative, costs positive).
 * Normalization profile: economic_saldobalance_credit_v1
 */

import type {
  TemplateEntry,
  SemanticXlsxTemplateEntry,
  DetectionContext,
  ExtractionContext,
  DeterministicExtractedData,
  ParserValidation,
  DeterministicMeta,
} from "../templateRegistry.ts";

import type { XlsxParseResult } from "../xlsxRawParser.ts";
import type {
  SemanticExtractionResult,
  SemanticMetricCandidate,
  SemanticLineItem,
} from "../semanticTypes.ts";
import type { MetricFamily } from "../normalizationProfiles.ts";

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

// ── Account range definitions ──

interface AccountRange {
  key: string;
  family: MetricFamily;
  min: number;
  max: number;
  /** How to convert raw credit-convention value to canonical sign */
  signRule: "negate" | "abs" | "keep";
}

const PNL_RANGES: AccountRange[] = [
  { key: "omsaetning", family: "revenue_like", min: 1000, max: 1299, signRule: "negate" },
  { key: "direkte_omkostninger", family: "cost_like", min: 1300, max: 1499, signRule: "abs" },
  { key: "loenninger", family: "cost_like", min: 2200, max: 2299, signRule: "abs" },
  { key: "salgsomkostninger", family: "cost_like", min: 2800, max: 2899, signRule: "abs" },
  { key: "lokaleomkostninger", family: "cost_like", min: 3400, max: 3599, signRule: "abs" },
  { key: "administrationsomkostninger", family: "cost_like", min: 3600, max: 3799, signRule: "abs" },
  { key: "finansieringsudgifter", family: "cost_like", min: 4400, max: 4499, signRule: "abs" },
  { key: "afskrivninger", family: "cost_like", min: 5100, max: 5200, signRule: "abs" },
];

const BALANCE_RANGES: AccountRange[] = [
  { key: "anlaegsaktiver", family: "asset_like", min: 5000, max: 5099, signRule: "abs" },
  { key: "varelager", family: "asset_like", min: 5500, max: 5599, signRule: "abs" },
  { key: "debitorer", family: "receivable_payable_like", min: 5600, max: 5699, signRule: "abs" },
  { key: "bank_balance", family: "cash_like", min: 5800, max: 5899, signRule: "keep" },
  { key: "egenkapital", family: "equity_like", min: 6100, max: 6199, signRule: "negate" },
  { key: "kreditorer", family: "receivable_payable_like", min: 6800, max: 6849, signRule: "negate" },
  { key: "moms_skat", family: "liability_like", min: 6900, max: 6999, signRule: "negate" },
];

const ALL_RANGES = [...PNL_RANGES, ...BALANCE_RANGES];

// ── Period parsing ──

const MONTH_NAMES = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

function parsePeriodFromRow4(text: string): { start: string | null; end: string | null; label: string | null } {
  // "Saldobalance for perioden DD.MM.YY - DD.MM.YY" or "DD.MM.YYYY - DD.MM.YYYY"
  const m = text.match(/(\d{2}\.\d{2}\.\d{2,4})\s*[-–]\s*(\d{2}\.\d{2}\.\d{2,4})/);
  if (!m) return { start: null, end: null, label: null };

  const normalize = (d: string): string => {
    const parts = d.split(".");
    if (parts[2].length === 2) parts[2] = (parseInt(parts[2], 10) < 50 ? "20" : "19") + parts[2];
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  };

  const start = normalize(m[1]);
  const end = normalize(m[2]);

  // Label from end date
  const endParts = end.split("-");
  const month = parseInt(endParts[1], 10);
  const label = month >= 1 && month <= 12 ? `${MONTH_NAMES[month - 1]} ${endParts[2]}` : null;

  return { start, end, label };
}

function extractCvr(text: string): string | null {
  const m = text.match(/\b(\d{8})\b/);
  return m ? m[1] : null;
}

function extractCompanyName(text: string): string | null {
  // Row 2 often: "ID - CompanyName CVR" or just "CompanyName CVR"
  const dashIdx = text.indexOf(" - ");
  const base = dashIdx >= 0 ? text.substring(dashIdx + 3) : text;
  // Strip trailing CVR
  return base.replace(/\s*\d{8}\s*$/, "").trim() || null;
}

// ── Template Definition ──

export const dkEconomicSaldobalanceXlsxV1: SemanticXlsxTemplateEntry = {
  template_id: "DK_ECONOMIC_SALDOBALANCE_XLSX_V1",
  label: "DK e-conomic Saldobalance XLSX (detailed, no subtotals)",
  supported_file_types: ["xlsx", "xls"],
  statement_type: "trial_balance",

  detect(ctx: DetectionContext): number {
    if (!ctx.headerRows || ctx.headerRows.length < 8) return 0;

    // Row 2 (index 1): company + CVR
    const row2 = (ctx.headerRows[1]?.[0] ?? "").toString();
    if (!row2 || !/\d{8}/.test(row2)) return 0;

    // Row 4 (index 3): "Saldobalance"
    const row4 = (ctx.headerRows[3]?.[0] ?? "").toString();
    if (!row4 || !/saldobalance/i.test(row4)) return 0;

    // Row 6 (index 5): "Nr." in col 0, "Navn" in col 1
    const row6 = ctx.headerRows[5];
    if (!row6 || row6.length < 3) return 0;
    const col0 = (row6[0] ?? "").toString().toLowerCase().trim();
    const col1 = (row6[1] ?? "").toString().toLowerCase().trim();
    if (col0 !== "nr." || col1 !== "navn") return 0;

    // Check for account numbers in 1000-9999 range
    let accountCount = 0;
    let hasSubtotalLikeRows = false;
    for (let i = 6; i < Math.min(ctx.headerRows.length, 100); i++) {
      const row = ctx.headerRows[i];
      if (!row) continue;
      const acctVal = row[0];
      const acctNum = typeof acctVal === "number" ? acctVal : parseInt((acctVal ?? "").toString(), 10);
      if (!isNaN(acctNum) && acctNum >= 1000 && acctNum <= 9999) {
        accountCount++;
      }
      // Subtotal detection: empty col[0] + non-empty col[1] with "i alt" pattern
      if (
        (acctVal == null || acctVal === "" || acctVal === 0) &&
        row[1] && /i\s*alt/i.test(row[1].toString())
      ) {
        hasSubtotalLikeRows = true;
      }
    }

    if (accountCount < 5) return 0;

    // This template handles NO-subtotal variant; if subtotals present, let combined template handle it
    if (hasSubtotalLikeRows) return 0;

    return 88;
  },

  // ── Legacy extract (stub — semantic path is primary) ──
  extract(_ctx: ExtractionContext) {
    return { success: false as const, error: "Use semantic extraction path" };
  },

  // ── Semantic XLSX Extraction ──
  extractSemanticFromXlsx(xlsxResult: XlsxParseResult): SemanticExtractionResult | null {
    if (xlsxResult.rows.length < 10) return null;

    const TEMPLATE_ID = "DK_ECONOMIC_SALDOBALANCE_XLSX_V1";
    const LOG_PREFIX = `[${TEMPLATE_ID}]`;

    // ── Parse metadata from header rows ──
    let companyName: string | null = null;
    let cvr: string | null = null;
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    let reportPeriodLabel: string | null = null;

    for (const row of xlsxResult.rows) {
      if (row.row_index > 5) break;
      const text = row.cells.map(c => (c.raw_value ?? "").toString()).join(" ").trim();
      if (!text) continue;

      if (row.row_index === 1) {
        companyName = extractCompanyName(text);
        cvr = extractCvr(text);
      }
      if (row.row_index === 3) {
        const period = parsePeriodFromRow4(text);
        periodStart = period.start;
        periodEnd = period.end;
        reportPeriodLabel = period.label;
      }
    }

    // Fallback for missing period metadata
    if (!reportPeriodLabel) {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const months = ["Januar","Februar","Marts","April","Maj","Juni",
        "Juli","August","September","Oktober","November","December"];
      reportPeriodLabel = `${months[prevMonth.getMonth()]} ${prevMonth.getFullYear()}`;
      console.warn(`${LOG_PREFIX} Could not parse period from row 4, using fallback: ${reportPeriodLabel}`);
    }
    if (!periodEnd) {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);
      const pad = (n: number) => String(n).padStart(2, "0");
      periodEnd = `${pad(lastDay.getDate())}-${pad(lastDay.getMonth() + 1)}-${lastDay.getFullYear()}`;
      periodStart = `01-${pad(lastDay.getMonth() + 1)}-${lastDay.getFullYear()}`;
    }

    // ── Identify value columns ──
    // Col 0 = Nr., Col 1 = Navn, Col 2 = period amount, Col 4 = YTD
    const VALUE_COL = 2;
    const YTD_COL = 4;

    // ── Aggregate line items by account ranges ──
    const sums: Record<string, number> = {};
    const lineItems: SemanticLineItem[] = [];
    let totalLineItems = 0;

    for (const row of xlsxResult.rows) {
      if (row.row_index < 6) continue; // Skip header rows

      // Get account number from col 0
      const acctCell = row.cells.find(c => c.col_index === 0);
      const acctRaw = acctCell?.raw_value;
      const acctNum = typeof acctRaw === "number" ? acctRaw : parseInt((acctRaw ?? "").toString(), 10);
      if (isNaN(acctNum) || acctNum < 1000 || acctNum > 9999) continue;

      // Get label from col 1
      const labelCell = row.cells.find(c => c.col_index === 1);
      const label = (labelCell?.raw_value ?? "").toString().trim();

      // P&L accounts use period column; balance accounts use YTD column
      const isBalanceAccount = acctNum >= 5000 && acctNum <= 9999;
      const colIndex = isBalanceAccount ? YTD_COL : VALUE_COL;
      const valueCell = row.cells.find(c => c.col_index === colIndex);
      const rawValue = valueCell?.raw_value != null
        ? (typeof valueCell.raw_value === "number" ? valueCell.raw_value : parseDanishNumber(valueCell.raw_value))
        : null;

      totalLineItems++;

      lineItems.push({
        source_field_id: `acct_${acctNum}`,
        source_label: `${acctNum} ${label}`,
        raw_value: rawValue,
        basis: isBalanceAccount ? "ytd" : "period",
        account_no: acctNum.toString(),
        source_row_index: row.row_index,
      });

      if (rawValue == null || rawValue === 0) continue;

      // Accumulate into matching ranges
      for (const range of ALL_RANGES) {
        if (acctNum >= range.min && acctNum <= range.max) {
          sums[range.key] = (sums[range.key] || 0) + rawValue;
          break;
        }
      }
    }

    console.log(`${LOG_PREFIX} Scanned ${totalLineItems} line items, aggregated keys: ${Object.keys(sums).join(", ")}`);

    if (totalLineItems < 5) {
      console.log(`${LOG_PREFIX} Too few line items (${totalLineItems}) → reject`);
      return null;
    }

    // ── Build metric candidates from aggregated sums ──
    const metricCandidates: SemanticMetricCandidate[] = [];

    for (const range of ALL_RANGES) {
      const rawSum = sums[range.key];
      if (rawSum == null) continue;

      metricCandidates.push({
        source_field_id: range.key,
        normalization_family: range.family,
        raw_value: rawSum,
        raw_sign: rawSum > 0 ? "positive" : rawSum < 0 ? "negative" : "zero",
        sign_convention: "credit",
        source_label: `aggregated:${range.key} (accounts ${range.min}-${range.max})`,
        source_row_index: null,
        source_column_slot: VALUE_COL,
        source_cell_address: null,
        basis: "period",
        confidence: "HIGH",
        evidence: [`account_range:${range.min}-${range.max}`, `sign_rule:${range.signRule}`],
        proposed_canonical_target: null,
      });
    }

    // ── Derived metrics ──
    const revenue = sums["omsaetning"] != null ? Math.abs(sums["omsaetning"]) : null;
    const cogs = sums["direkte_omkostninger"] != null ? Math.abs(sums["direkte_omkostninger"]) : null;

    if (revenue != null && cogs != null) {
      const grossProfit = revenue - cogs;
      metricCandidates.push({
        source_field_id: "daekningsbidrag",
        normalization_family: "profit_like",
        raw_value: grossProfit,
        raw_sign: grossProfit > 0 ? "positive" : grossProfit < 0 ? "negative" : "zero",
        sign_convention: "credit",
        source_label: "derived:gross_profit (revenue - cogs)",
        source_row_index: null,
        source_column_slot: null,
        source_cell_address: null,
        basis: "period",
        confidence: "MEDIUM",
        evidence: ["derived:revenue-cogs"],
        proposed_canonical_target: "gross_profit",
      });
    }

    // Approximate EBT: gross_profit - all cost buckets
    if (revenue != null) {
      const costKeys = ["direkte_omkostninger", "loenninger", "salgsomkostninger",
        "lokaleomkostninger", "administrationsomkostninger", "finansieringsudgifter", "afskrivninger"];
      let totalCosts = 0;
      for (const k of costKeys) {
        if (sums[k] != null) totalCosts += Math.abs(sums[k]);
      }
      const ebt = revenue - totalCosts;
      metricCandidates.push({
        source_field_id: "resultat_foer_skat",
        normalization_family: "profit_like",
        raw_value: ebt,
        raw_sign: ebt > 0 ? "positive" : ebt < 0 ? "negative" : "zero",
        sign_convention: "credit",
        source_label: "derived:ebt (revenue - sum_costs)",
        source_row_index: null,
        source_column_slot: null,
        source_cell_address: null,
        basis: "period",
        confidence: "LOW",
        evidence: ["derived:revenue-all_costs", "approximate"],
        proposed_canonical_target: "ebt",
      });
    }

    // Assets total
    const fixedAssets = sums["anlaegsaktiver"] != null ? Math.abs(sums["anlaegsaktiver"]) : 0;
    const inventory = sums["varelager"] != null ? Math.abs(sums["varelager"]) : 0;
    const receivables = sums["debitorer"] != null ? Math.abs(sums["debitorer"]) : 0;
    const cashRaw = sums["bank_balance"] ?? 0;
    const cashForAssets = cashRaw > 0 ? cashRaw : 0;

    if (fixedAssets + inventory + receivables + cashForAssets > 0) {
      const assetsTotal = fixedAssets + inventory + receivables + cashForAssets;
      metricCandidates.push({
        source_field_id: "aktiver_i_alt",
        normalization_family: "asset_like",
        raw_value: assetsTotal,
        raw_sign: "positive",
        sign_convention: "credit",
        source_label: "derived:assets_total",
        source_row_index: null,
        source_column_slot: null,
        source_cell_address: null,
        basis: "period",
        confidence: "MEDIUM",
        evidence: ["derived:fixed+inventory+receivables+cash"],
        proposed_canonical_target: "assets_total",
      });
    }

    console.log(`${LOG_PREFIX} Built ${metricCandidates.length} metric candidates`);

    if (metricCandidates.length < 3) {
      console.log(`${LOG_PREFIX} Too few metrics (${metricCandidates.length}) → reject`);
      return null;
    }

    // ── Validation checks ──
    const checks = [];
    const hasRevenue = sums["omsaetning"] != null;
    checks.push({ name: "revenue_present", result: hasRevenue ? "PASS" as const : "FAIL" as const, details: hasRevenue ? "Revenue accounts found" : "No revenue accounts" });
    const hasCosts = ["direkte_omkostninger", "loenninger", "administrationsomkostninger"].some(k => sums[k] != null);
    checks.push({ name: "costs_present", result: hasCosts ? "PASS" as const : "FAIL" as const, details: hasCosts ? "Cost accounts found" : "No cost accounts" });
    const hasBalance = ["egenkapital", "bank_balance", "debitorer"].some(k => sums[k] != null);
    checks.push({ name: "balance_present", result: hasBalance ? "PASS" as const : "FAIL" as const, details: hasBalance ? "Balance accounts found" : "No balance accounts" });
    checks.push({ name: "no_subtotals", result: "PASS" as const, details: "Line-item only format confirmed" });

    const parserStatus = checks.some(c => c.result === "FAIL") ? "FAIL" as const : "PASS" as const;

    const result: SemanticExtractionResult = {
      source_system: "economic",
      document_type: "saldobalance",
      template_id: TEMPLATE_ID,
      sign_convention: "credit",
      normalization_profile_id: "economic_saldobalance_credit_v1",
      company_name: companyName,
      cvr,
      period_start: periodStart,
      period_end: periodEnd,
      report_period_label: reportPeriodLabel,
      metric_candidates: metricCandidates,
      line_items: lineItems,
      basis_profile: { mode: "single", selected_period_basis: "period" },
      parser_validation: { parser_status: parserStatus, checks },
      _deterministic_meta: {
        template_id: TEMPLATE_ID,
        parser_confidence: parserStatus === "PASS" ? "HIGH" : "MEDIUM",
        detection_score: 0, // Set by registry
        raw_line_count: xlsxResult.rows.length,
        normalized_line_count: metricCandidates.length,
        column_basis_rule: "single",
      },
    };

    console.log(`${LOG_PREFIX} Extraction complete: ${metricCandidates.length} candidates from ${totalLineItems} line items`);
    return result;
  },
};
