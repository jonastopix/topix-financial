/**
 * Template: DK_COMBINED_BALANCE_PNL_V1
 * Danish Combined Balance/P&L reports (Saldobalance format)
 * 
 * This template wraps the existing financialParser.ts and adapts output
 * to the registry interface. The extract() function returns success: true
 * as long as parsing is structurally successful — canonical engine handles validation.
 */

import type {
  TemplateEntry,
  DetectionContext,
  ExtractionContext,
  DeterministicExtractedData,
  ParserValidation,
  DeterministicMeta,
} from "../templateRegistry.ts";

import {
  detectReportTemplate,
  parseFinancialReport,
  type ParsedFinancialReport,
  type KPIMetrics,
  type NormalizedLine,
} from "../financialParser.ts";

// ── Helper: Convert KPI metrics to key_figures format ──

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

// ── Helper: Convert normalized lines to line_items format ──

function mapLinesToLineItems(lines: NormalizedLine[]): DeterministicExtractedData["line_items"] {
  return lines.map((line) => ({
    name: line.label,
    period_amount: line.normalized_value,
    ytd_amount: null, // Parser doesn't track YTD separately yet
    raw_sign: line.raw_value != null && line.raw_value < 0 ? "MINUS" : "PLUS",
    account_no: line.account_no?.toString() ?? null,
    class: mapClassToCanonical(line.class),
  }));
}

// ── Helper: Map parser class to canonical class ──

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

// ── Helper: Format date to report_period ──

function formatReportPeriod(periodEnd: string | null): string | null {
  if (!periodEnd) return null;
  
  // Expected format: "DD-MM-YYYY"
  const match = periodEnd.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return null;
  
  const monthNames = [
    "Januar", "Februar", "Marts", "April", "Maj", "Juni",
    "Juli", "August", "September", "Oktober", "November", "December"
  ];
  
  const month = parseInt(match[2], 10);
  const year = match[3];
  
  if (month >= 1 && month <= 12) {
    return `${monthNames[month - 1]} ${year}`;
  }
  
  return null;
}

// ── Template Definition ──

export const dkCombinedBalancePnlV1: TemplateEntry = {
  template_id: "DK_COMBINED_BALANCE_PNL_V1",
  label: "DK Combined Balance/P&L (Saldobalance)",
  supported_file_types: ["xlsx", "xls"],
  statement_type: "combined",  // CORRECTED: Not "saldobalance"

  detect(ctx: DetectionContext): number {
    // Delegate to existing financialParser detection
    if (!ctx.headerRows || ctx.headerRows.length < 6) return 0;
    
    const template = detectReportTemplate(ctx.headerRows);
    
    if (template === "DK_COMBINED_BALANCE_PNL_V1") {
      // High confidence detection
      return 92;
    }
    
    return 0;
  },

  extract(ctx: ExtractionContext): { success: true; data: DeterministicExtractedData } | { success: false; error: string } {
    let parsed: ParsedFinancialReport;
    
    try {
      parsed = parseFinancialReport(ctx.rows);
    } catch (e: any) {
      return { success: false, error: `Parse error: ${e.message}` };
    }

    // STRUCTURAL failure: template not recognized
    if (parsed.template_id === "UNKNOWN") {
      return { success: false, error: "Template not recognized by parser" };
    }

    // SUCCESS: Parser could read the structure
    // Even if parser validation failed, we return success: true
    // Canonical engine is the SOLE validation authority

    // Build parser validation to pass to canonical engine
    const parserValidation: ParserValidation = {
      parser_status: parsed.validation.validation_status,
      checks: parsed.validation.validation_errors.map((e) => ({
        name: "parser_validation",
        result: "FAIL" as const,
        details: e,
      })),
    };

    // Add PASS checks if validation passed
    if (parsed.validation.validation_status === "PASS") {
      parserValidation.checks = [
        { name: "balance_check", result: "PASS", details: "Parser balance validation passed" },
        { name: "sign_consistency", result: "PASS", details: "Parser sign normalization complete" },
      ];
    }

    // Build deterministic metadata
    const deterministicMeta: DeterministicMeta = {
      template_id: parsed.template_id,
      parser_confidence: parsed.validation.confidence,
      detection_score: 92,
      parser_validation_status: parsed.validation.validation_status,
      parser_validation_errors: parsed.validation.validation_errors,
      raw_line_count: parsed.raw_lines.length,
      normalized_line_count: parsed.normalized_lines.length,
    };

    // Build extracted data
    const extractedData: DeterministicExtractedData = {
      report_type: "combined",  // CORRECTED: Not "saldobalance"
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
};
