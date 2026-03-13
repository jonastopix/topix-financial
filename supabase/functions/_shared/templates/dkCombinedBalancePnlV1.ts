/**
 * Template: DK_COMBINED_BALANCE_PNL_V1
 * Danish Combined Balance/P&L reports (Saldobalance format)
 *
 * Phase 8: Added extractSemanticFromXlsx() — structural-first semantic path.
 * Sign convention: Dynamically detected (credit vs business).
 * Currently supported: credit convention only (proven by WARBURG fixture).
 * Business convention: detected but hard-fails (no verified fixture).
 *
 * Legacy detect() + extract() kept for backward compatibility but will not
 * be reached once semantic path is active for known KJ Auto sources.
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

import {
  detectReportTemplate,
  parseFinancialReport,
  type ParsedFinancialReport,
  type KPIMetrics,
  type NormalizedLine,
} from "../financialParser.ts";

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

// ── Sign Convention Detection ──

type SignConvention = "business" | "credit" | "unknown";

/**
 * Infer sign convention from anchor lines.
 * Uses the approved model (consistent with e-conomic XLSX):
 *   BUSINESS: revenue > 0, individual cost lines < 0
 *   CREDIT:   revenue < 0, individual cost lines > 0
 *   UNKNOWN:  ambiguous or missing anchors
 */
function detectSignConvention(
  rows: XlsxParseResult["rows"],
  valueColIndex: number,
): SignConvention {
  let revenueVal: number | null = null;
  let passedRevenue = false;
  const costLineValues: number[] = [];

  for (const row of rows) {
    // Extract label and account number
    let label = "";
    let accountNo: string | null = null;
    for (const cell of row.cells) {
      if (cell.col_index === valueColIndex) continue;
      const val = (cell.raw_value ?? "").toString().trim();
      if (!val) continue;
      const asNum = parseInt(val, 10);
      if (!isNaN(asNum) && asNum > 0 && cell.col_index === 0) {
        accountNo = val;
      } else if (val.length > label.length) {
        label = val;
      }
    }
    label = label.toLowerCase().trim();
    if (!label) continue;

    const valueCell = row.cells.find(c => c.col_index === valueColIndex);
    const rawValue = valueCell?.raw_value != null && typeof valueCell.raw_value === "number"
      ? valueCell.raw_value : parseDanishNumber(valueCell?.raw_value);
    if (rawValue == null || rawValue === 0) continue;

    // Revenue anchor — subtotal "omsætning ialt"
    if (revenueVal == null && /omsætning\s*(i\s*alt|ialt)$/i.test(label)) {
      revenueVal = rawValue;
      passedRevenue = true;
      continue;
    }

    // After revenue subtotal, collect individual cost lines (with accountNo, not subtotals)
    if (passedRevenue && accountNo != null && !/i\s*alt|dækningsbidrag|resultat/i.test(label)) {
      costLineValues.push(rawValue);
      if (costLineValues.length >= 3) break;
    }
  }

  const negativeCosts = costLineValues.filter(v => v < 0).length;
  const positiveCosts = costLineValues.filter(v => v > 0).length;
  const costSign = negativeCosts > positiveCosts ? "negative" : positiveCosts > negativeCosts ? "positive" : null;

  console.log(`[DK_COMBINED_PNL] Sign convention anchors: revenue=${revenueVal}, costLines=[${costLineValues.join(", ")}], costSign=${costSign}`);

  if (revenueVal != null && costSign != null) {
    if (revenueVal > 0 && costSign === "negative") return "business";
    if (revenueVal < 0 && costSign === "positive") return "credit";
  }

  return "unknown";
}

// ── Label matchers for KJ Auto combined P&L + Balance ──

interface CombinedLabelMatch {
  key: string;
  pattern: RegExp;
  family: MetricFamily;
}

const PNL_LABEL_MATCHERS: CombinedLabelMatch[] = [
  { key: "omsaetning", pattern: /omsætning\s*(i\s*alt|ialt)$/i, family: "revenue_like" },
  { key: "direkte_omkostninger", pattern: /^(vareforbrug|direkte\s*omkostninger)\s*(i\s*alt|ialt)?$/i, family: "cost_like" },
  { key: "daekningsbidrag", pattern: /dækningsbidrag/i, family: "profit_like" },
  { key: "loenninger", pattern: /lønninger\s*(mv\.?)?\s*(i\s*alt|ialt)$/i, family: "cost_like" },
  { key: "pensioner_sociale", pattern: /pensioner\s*&?\s*sociale\s*(bidrag)?\s*(i\s*alt|ialt)$/i, family: "cost_like" },
  { key: "oevrige_personale", pattern: /øvrige\s*personaleudgifter\s*(i\s*alt|ialt)$/i, family: "cost_like" },
  { key: "salgsomkostninger", pattern: /salgs(omkostninger|-\s*og\s*rejseomkostninger)\s*(i\s*alt|ialt)?$/i, family: "cost_like" },
  { key: "lokaleomkostninger", pattern: /lokaleomkostninger\s*(i\s*alt|ialt)?$/i, family: "cost_like" },
  { key: "administrationsomkostninger", pattern: /administrations(omkostninger)?\s*(i\s*alt|ialt)?$/i, family: "cost_like" },
  { key: "autodrift", pattern: /autodrift\s*(i\s*alt|ialt)?$/i, family: "cost_like" },
  { key: "resultat_foer_afskrivninger", pattern: /resultat\s*før\s*afskrivninger/i, family: "profit_like" },
  { key: "afskrivninger", pattern: /afskrivninger\s*(i\s*alt|ialt)?$/i, family: "cost_like" },
  { key: "indtjeningsbidrag", pattern: /(indtjeningsbidrag|resultat\s*før\s*(renter|finansielle\s*poster))/i, family: "profit_like" },
  { key: "finansieringsudgifter", pattern: /finansierings(udgifter|omkostninger)\s*(i\s*alt|ialt)?$/i, family: "cost_like" },
  { key: "ekstraordinaere_poster", pattern: /ekstraordinære\s*poster\s*(i\s*alt|ialt)?$/i, family: "cost_like" },
  { key: "resultat_foer_skat", pattern: /resultat\s*før\s*skat/i, family: "profit_like" },
  { key: "resultat_foer_ekstraordinaere", pattern: /resultat\s*før\s*ekstraordinære\s*poster/i, family: "profit_like" },
  { key: "arets_resultat", pattern: /(årets\s*resultat|resultat\s*efter\s*skat)/i, family: "profit_like" },
];

const BALANCE_LABEL_MATCHERS: CombinedLabelMatch[] = [
  { key: "varelager", pattern: /varebeholdninger\s*(i\s*alt|ialt)$/i, family: "asset_like" },
  { key: "debitorer", pattern: /tilgodehavender\s*fra\s*salg/i, family: "receivable_payable_like" },
  { key: "igangvaerende_arbejde", pattern: /igangværende\s*arbejde\s*manglende\s*fakturering/i, family: "receivable_payable_like" },
  { key: "tilgodehavender_i_alt", pattern: /tilgodehavender\s*(i\s*alt|ialt)$/i, family: "receivable_payable_like" },
  { key: "likvider", pattern: /likvide\s*beholdninger\s*(i\s*alt|ialt)$/i, family: "cash_like" },
  { key: "aktiver_i_alt", pattern: /^aktiver\s*(i\s*alt|ialt)$/i, family: "asset_like" },
  { key: "egenkapital", pattern: /egenkapital\s*(i\s*alt|ialt)$/i, family: "equity_like" },
  { key: "mellemregning", pattern: /mellemregning\s*(i\s*alt|ialt)$/i, family: "receivable_payable_like" },
  { key: "hensaettelser", pattern: /hensættelser\s*(i\s*alt|ialt)$/i, family: "liability_like" },
  { key: "kortfristet_gaeld", pattern: /kortfristet\s*gæld\s*(i\s*alt|ialt)$/i, family: "liability_like" },
  { key: "moms", pattern: /moms\s*(i\s*alt|ialt)$/i, family: "liability_like" },
  { key: "gaeld_i_alt", pattern: /gæld\s*(i\s*alt|ialt)$/i, family: "liability_like" },
  { key: "passiver_i_alt", pattern: /^passiver\s*(i\s*alt|ialt)$/i, family: "liability_like" },
];

const ALL_LABEL_MATCHERS = [...PNL_LABEL_MATCHERS, ...BALANCE_LABEL_MATCHERS];

// ── Helper: Convert KPI metrics to key_figures format (legacy path) ──

function metricsToKeyFigures(metrics: KPIMetrics): Record<string, number | null> {
  return {
    omsaetning: metrics.revenue,
    direkte_omkostninger: metrics.cogs,
    daekningsbidrag: metrics.gross_profit,
    loenninger: metrics.payroll,
    pensioner_sociale: metrics.payroll_related,
    oevrige_personale: metrics.other_staff_costs,
    salgsomkostninger: metrics.sales_costs,
    lokaleomkostninger: metrics.facility_costs,
    administrationsomkostninger: metrics.admin_costs,
    autodrift: metrics.vehicle_costs,
    resultat_foer_afskrivninger: metrics.ebitda,
    afskrivninger: metrics.depreciation,
    indtjeningsbidrag: metrics.ebit,
    finansieringsudgifter: metrics.financial_costs,
    ekstraordinaere_poster: metrics.extraordinary_items,
    resultat_foer_skat: metrics.ebt,
    arets_resultat: metrics.net_result,
    aktiver_i_alt: metrics.assets_total,
    varelager: metrics.inventory,
    tilgodehavender_i_alt: metrics.receivables_total,
    debitorer: metrics.trade_receivables,
    igangvaerende_arbejde: metrics.unbilled_wip,
    likvider: metrics.cash,
    egenkapital: metrics.equity_total,
    mellemregning: metrics.related_party_net,
    hensaettelser: metrics.provisions_total,
    kortfristet_gaeld: metrics.current_liabilities,
    gaeld_i_alt: metrics.debt_total,
    moms: metrics.vat_payable,
    passiver_i_alt: metrics.liabilities_total,
  };
}

// ── Helper: Convert normalized lines to line_items format (legacy) ──

function mapLinesToLineItems(lines: NormalizedLine[]): DeterministicExtractedData["line_items"] {
  return lines.map((line) => ({
    name: line.label,
    period_amount: line.normalized_value,
    ytd_amount: null,
    raw_sign: line.raw_value != null && line.raw_value < 0 ? "MINUS" : "PLUS",
    account_no: line.account_no?.toString() ?? null,
    class: mapClassToCanonical(line.class),
  }));
}

function mapClassToCanonical(cls: string | null): string {
  if (!cls) return "UKLASSIFICERET";
  const mapping: Record<string, string> = {
    PNL_RESULT: "REVENUE",
    PNL_COST: "OPEX",
    ASSET: "ASSET",
    LIABILITY: "LIABILITY",
    CASH: "ASSET",
    RELATED_PARTY_NET: "LIABILITY",
  };
  return mapping[cls] || "UKLASSIFICERET";
}

function formatReportPeriod(periodEnd: string | null): string | null {
  if (!periodEnd) return null;
  const match = periodEnd.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return null;
  const monthNames = [
    "Januar", "Februar", "Marts", "April", "Maj", "Juni",
    "Juli", "August", "September", "Oktober", "November", "December"
  ];
  const month = parseInt(match[2], 10);
  if (month >= 1 && month <= 12) return `${monthNames[month - 1]} ${match[3]}`;
  return null;
}

// ── Template Definition ──

export const dkCombinedBalancePnlV1: SemanticXlsxTemplateEntry = {
  template_id: "DK_COMBINED_BALANCE_PNL_V1",
  label: "DK Combined Balance/P&L (Saldobalance)",
  supported_file_types: ["xlsx", "xls"],
  statement_type: "combined",

  detect(ctx: DetectionContext): number {
    if (!ctx.headerRows || ctx.headerRows.length < 6) return 0;

    const toNum = (v: any): number | null => {
      if (typeof v === "number") return v;
      if (typeof v === "string") { const n = Number(v.replace(/\s/g, "")); return isNaN(n) ? null : n; }
      return null;
    };

    const row1 = ctx.headerRows[0]?.[0];
    if (!row1 || typeof row1 !== "string" || row1.trim() === "") return 0;

    const row2 = ctx.headerRows[1]?.[0];
    if (!row2 || typeof row2 !== "string" || !row2.toLowerCase().includes("balance")) return 0;

    const row5 = ctx.headerRows[4];
    if (!row5 || row5.length < 3) return 0;
    const hasNummer = row5[0]?.toString().toLowerCase().includes("nummer");
    const hasNavn = row5[1]?.toString().toLowerCase().includes("navn");
    const hasPeriod = row5[2] && row5[2].toString().trim() !== "";
    if (!hasNummer || !hasNavn || !hasPeriod) return 0;

    let hasPnL = false;
    let hasBalance = false;
    for (let i = 5; i < ctx.headerRows.length; i++) {
      const accountNo = toNum(ctx.headerRows[i]?.[0]);
      if (accountNo !== null) {
        if (accountNo >= 998 && accountNo < 6000) hasPnL = true;
        if (accountNo >= 6000) hasBalance = true;
      }
    }

    if (hasPnL && hasBalance) return 92;
    if (hasPnL || hasBalance) return 85;
    return 75;
  },

  // ── Legacy extract() — kept for backward compatibility ──
  extract(ctx: ExtractionContext): { success: true; data: DeterministicExtractedData } | { success: false; error: string } {
    let parsed: ParsedFinancialReport;
    try {
      parsed = parseFinancialReport(ctx.rows);
    } catch (e: any) {
      return { success: false, error: `Parse error: ${e.message}` };
    }

    if (parsed.template_id === "UNKNOWN") {
      return { success: false, error: "Template not recognized by parser" };
    }

    const parserValidation: ParserValidation = {
      parser_status: parsed.validation.validation_status,
      checks: parsed.validation.validation_errors.map((e) => ({
        name: "parser_validation",
        result: "FAIL" as const,
        details: e,
      })),
    };

    if (parsed.validation.validation_status === "PASS") {
      parserValidation.checks = [
        { name: "balance_check", result: "PASS", details: "Parser balance validation passed" },
        { name: "sign_consistency", result: "PASS", details: "Parser sign normalization complete" },
      ];
    }

    const deterministicMeta: DeterministicMeta = {
      template_id: parsed.template_id,
      parser_confidence: parsed.validation.confidence,
      detection_score: 92,
      parser_validation_status: parsed.validation.validation_status,
      parser_validation_errors: parsed.validation.validation_errors,
      raw_line_count: parsed.raw_lines.length,
      normalized_line_count: parsed.normalized_lines.length,
    };

    const extractedData: DeterministicExtractedData = {
      report_type: "combined",
      company_name: parsed.company_name,
      period_start: parsed.period_start,
      period_end: parsed.period_end,
      report_period: formatReportPeriod(parsed.period_end),
      key_figures: metricsToKeyFigures(parsed.metrics),
      line_items: mapLinesToLineItems(parsed.normalized_lines),
      validation: parserValidation,
      _deterministic_meta: deterministicMeta,
    };

    return { success: true, data: extractedData };
  },

  // ── Phase 8: Semantic XLSX Extraction ──
  extractSemanticFromXlsx(xlsxResult: XlsxParseResult): SemanticExtractionResult | null {
    if (xlsxResult.rows.length < 10) return null;

    // ── Identify value column (column 2+ with numeric data, skip Nummer/Navn) ──
    const numericCols = xlsxResult.column_profile.filter(cp => cp.col_index >= 2 && cp.inferred_type === "numeric");
    let valueColIndex: number;

    if (numericCols.length === 0) {
      console.log("[DK_COMBINED_PNL_SEMANTIC] No numeric column found (col 2+) → reject");
      return null;
    } else if (numericCols.length === 1) {
      valueColIndex = numericCols[0].col_index;
    } else {
      // For combined files: first numeric column (col 2+) is typically the period amount
      const firstNumCol = numericCols[0];
      const hasData = xlsxResult.rows.slice(5, 25).some(row => {
        const cell = row.cells.find(c => c.col_index === firstNumCol.col_index);
        return cell?.raw_value != null && typeof cell.raw_value === "number" && cell.raw_value !== 0;
      });
      if (hasData) {
        valueColIndex = firstNumCol.col_index;
      } else {
        console.log("[DK_COMBINED_PNL_SEMANTIC] No data in first numeric column (col 2+) → reject");
        return null;
      }
    }
    console.log(`[DK_COMBINED_PNL_SEMANTIC] Accepted value column index: ${valueColIndex}`);

    // ── Extract metadata from header rows ──
    let companyName: string | null = null;
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    let reportPeriodLabel: string | null = null;

    for (let i = 0; i < Math.min(5, xlsxResult.rows.length); i++) {
      const row = xlsxResult.rows[i];
      const rowText = row.cells.map(c => (c.raw_value ?? "").toString()).join(" ").trim();
      if (!rowText) continue;

      // Row 0: company name
      if (i === 0 && rowText.length > 2) {
        companyName = rowText;
      }

      // Row 2: period info "Udskrevet ... (alle tal i kr.)" — skip
      // Row 4: header row "Nummer Navn 01-01-2026 til 31-01-2026"
      if (i === 4) {
        // Extract period from header column text
        const periodCell = row.cells.find(c => c.col_index >= 2 && c.raw_value != null);
        if (periodCell) {
          const periodText = periodCell.raw_value.toString();
          const periodMatch = periodText.match(/(\d{2}-\d{2}-\d{4})\s*til\s*(\d{2}-\d{2}-\d{4})/);
          if (periodMatch) {
            periodStart = periodMatch[1];
            periodEnd = periodMatch[2];
          }
        }
      }
    }

    if (periodEnd) {
      const match = periodEnd.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (match) {
        const monthNames = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];
        const month = parseInt(match[2], 10);
        if (month >= 1 && month <= 12) reportPeriodLabel = `${monthNames[month - 1]} ${match[3]}`;
      }
    }

    // ── Detect sign convention dynamically ──
    const detectedConvention = detectSignConvention(xlsxResult.rows, valueColIndex);
    console.log(`[DK_COMBINED_PNL_SEMANTIC] Detected sign convention: ${detectedConvention}`);

    // ── Convention gating ──
    if (detectedConvention === "unknown") {
      console.error("[DK_COMBINED_PNL_SEMANTIC] Sign convention UNKNOWN → reject (fail loud)");
      return null;
    }

    if (detectedConvention === "business") {
      console.error("[DK_COMBINED_PNL_SEMANTIC] Business convention detected but NOT YET SUPPORTED — no verified fixture. Hard fail.");
      return null;
    }

    // Only credit convention proceeds
    const signConvention: "credit" | "business" = "credit";
    const normalizationProfileId = "kj_auto_combined_credit_v1";
    console.log(`[DK_COMBINED_PNL_SEMANTIC] Convention: ${signConvention}, profile: ${normalizationProfileId}`);

    // ── Scan all rows for metric candidates and line items ──
    const metricCandidates: SemanticMetricCandidate[] = [];
    const lineItems: SemanticLineItem[] = [];
    const matchedKeys = new Set<string>();

    for (const row of xlsxResult.rows) {
      let label = "";
      let accountNo: string | null = null;
      for (const cell of row.cells) {
        if (cell.col_index === valueColIndex) continue;
        const val = (cell.raw_value ?? "").toString().trim();
        if (!val) continue;
        const asNum = parseInt(val, 10);
        if (!isNaN(asNum) && asNum > 0 && cell.col_index === 0) {
          accountNo = val;
        } else if (val.length > label.length) {
          label = val;
        }
      }
      label = label.toLowerCase().trim();
      if (!label) continue;

      const valueCell = row.cells.find(c => c.col_index === valueColIndex);
      const rawValue = valueCell?.raw_value != null && typeof valueCell.raw_value === "number"
        ? valueCell.raw_value : parseDanishNumber(valueCell?.raw_value);

      // Always add as line item for provenance
      lineItems.push({
        source_field_id: `row_${row.row_index}`,
        source_label: label,
        raw_value: rawValue,
        basis: "period",
        account_no: accountNo,
        source_row_index: row.row_index,
      });

      // Check subtotal pattern
      const isSubtotal = /i\s*alt|dækningsbidrag|resultat/i.test(label);
      if (!isSubtotal) continue;

      // Match against label matchers
      for (const matcher of ALL_LABEL_MATCHERS) {
        if (!matcher.pattern.test(label)) continue;
        if (matchedKeys.has(matcher.key)) break; // First match wins per key

        matchedKeys.add(matcher.key);
        metricCandidates.push({
          source_field_id: matcher.key,
          normalization_family: matcher.family,
          raw_value: rawValue,
          raw_sign: rawValue != null ? (rawValue > 0 ? "positive" : rawValue < 0 ? "negative" : "zero") : "zero",
          sign_convention: signConvention,
          source_label: label,
          source_row_index: row.row_index,
          source_column_slot: valueColIndex,
          source_cell_address: valueCell?.cell_address ?? null,
          basis: "period",
          confidence: "HIGH",
          evidence: [`label_match:${matcher.key}`, `pattern:${matcher.pattern.source}`],
          proposed_canonical_target: null,
        });
        break;
      }
    }

    console.log(`[DK_COMBINED_PNL_SEMANTIC] Matched ${metricCandidates.length} metric candidates (keys: ${[...matchedKeys].join(", ")})`);

    if (metricCandidates.length < 3) {
      console.log(`[DK_COMBINED_PNL_SEMANTIC] Only ${metricCandidates.length} metrics matched → reject`);
      return null;
    }

    // ── EBT fallback: resultat_foer_ekstraordinaere → resultat_foer_skat ──
    if (!matchedKeys.has("resultat_foer_skat") && matchedKeys.has("resultat_foer_ekstraordinaere")) {
      const ebtFallback = metricCandidates.find(c => c.source_field_id === "resultat_foer_ekstraordinaere");
      if (ebtFallback) {
        metricCandidates.push({
          ...ebtFallback,
          source_field_id: "resultat_foer_skat",
          evidence: [...ebtFallback.evidence, "ebt_fallback"],
        });
        matchedKeys.add("resultat_foer_skat");
      }
    }

    // ── Build validation ──
    const checks = [];
    const hasRevenue = matchedKeys.has("omsaetning");
    checks.push({ name: "revenue_present", result: hasRevenue ? "PASS" as const : "FAIL" as const, details: hasRevenue ? "Revenue found" : "No revenue" });
    const hasEbt = matchedKeys.has("resultat_foer_skat");
    checks.push({ name: "ebt_present", result: hasEbt ? "PASS" as const : "FAIL" as const, details: hasEbt ? "EBT found" : "No EBT" });
    const hasAssets = matchedKeys.has("aktiver_i_alt");
    checks.push({ name: "assets_present", result: hasAssets ? "PASS" as const : "FAIL" as const, details: hasAssets ? "Assets total found" : "No assets total" });
    checks.push({ name: "sign_convention_detected", result: "PASS" as const, details: `Convention: ${signConvention}` });
    const parserStatus = checks.some(c => c.result === "FAIL") ? "FAIL" as const : "PASS" as const;

    const result: SemanticExtractionResult = {
      source_system: "kj_auto",
      document_type: "combined",
      template_id: "DK_COMBINED_BALANCE_PNL_V1",
      sign_convention: signConvention,
      normalization_profile_id: normalizationProfileId,
      company_name: companyName,
      cvr: null,
      period_start: periodStart,
      period_end: periodEnd,
      report_period_label: reportPeriodLabel,
      metric_candidates: metricCandidates,
      line_items: lineItems,
      basis_profile: { mode: "single", selected_period_basis: "period" },
      parser_validation: { parser_status: parserStatus, checks },
      _deterministic_meta: {
        template_id: "DK_COMBINED_BALANCE_PNL_V1",
        parser_confidence: parserStatus === "PASS" ? "HIGH" : "MEDIUM",
        detection_score: 0, // Set by registry
        raw_line_count: xlsxResult.rows.length,
        normalized_line_count: metricCandidates.length,
        column_basis_rule: "single",
      },
    };

    console.log(`[DK_COMBINED_PNL_SEMANTIC] Extracted ${metricCandidates.length} candidates from ${xlsxResult.rows.length} rows`);
    return result;
  },
};
