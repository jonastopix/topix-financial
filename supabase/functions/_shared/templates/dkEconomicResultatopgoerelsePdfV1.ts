/**
 * Template: DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1
 * e-conomic Resultatopgørelse PDF (P&L only)
 *
 * Detection: "Resultatopgørelse" header + e-conomic footer + NO AKTIVER/PASSIVER
 * Extraction: Label-first, single-column numbers
 * Column basis: SINGLE — only period_amount (no År til dato split)
 *
 * PHASE 5 MIGRATION:
 * - extractSemantic() consumes PdfStructuralPayload directly
 * - Emits SemanticExtractionResult with raw document signs preserved
 * - No flipSign/absVal — normalization is centralized
 * - Legacy extract() preserved as migration bridge
 *
 * AMBIGUITY: If AKTIVER/PASSIVER are present, score = 0 → Template A wins.
 * If absent, Template B scores ~80-90. Template A requires AKTIVER/PASSIVER → no overlap.
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
  parseEconomicPdfText,
  type PdfParsedLine,
} from "../pdfTextParser.ts";

import type {
  SemanticExtractionResult,
  SemanticMetricCandidate,
  SemanticLineItem,
} from "../semanticTypes.ts";

import type { MetricFamily } from "../normalizationProfiles.ts";
import type { PdfStructuralPayload } from "../pdfStructuralTypes.ts";
import { parseDanishNumber } from "../pdfTextParser.ts";

// ── Label Lookup Helpers ──

function findByLabel(
  lines: PdfParsedLine[],
  pattern: RegExp
): PdfParsedLine | null {
  return lines.find(
    (l) => pattern.test(l.name) && l.is_subtotal
  ) || null;
}

// ── Sign normalization helpers (LEGACY ONLY — used by extract(), NOT by extractSemantic) ──

function flipSign(val: number | null): number | null {
  return val != null ? -val : null;
}

function absVal(val: number | null): number | null {
  return val != null ? Math.abs(val) : null;
}

// ── Semantic field mapping: source_field_id → { pattern, family, canonical_hint } ──

const SEMANTIC_FIELD_MAP: Array<{
  source_field_id: string;
  pattern: RegExp;
  family: MetricFamily;
  canonical_hint: string;
  require_subtotal: boolean;
}> = [
  { source_field_id: "omsaetning", pattern: /omsætning\s*(i alt|ialt)/i, family: "revenue_like", canonical_hint: "revenue", require_subtotal: true },
  { source_field_id: "direkte_omkostninger", pattern: /vareforbrug|direkte omk/i, family: "cost_like", canonical_hint: "cogs", require_subtotal: true },
  { source_field_id: "daekningsbidrag", pattern: /dækningsbidrag/i, family: "profit_like", canonical_hint: "gross_profit", require_subtotal: true },
  { source_field_id: "loenninger", pattern: /lønninger\s*(mv\.?)?\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "payroll", require_subtotal: true },
  { source_field_id: "salgsomkostninger", pattern: /salgsomkostninger/i, family: "cost_like", canonical_hint: "sales_costs", require_subtotal: true },
  { source_field_id: "lokaleomkostninger", pattern: /lokaleomkostninger/i, family: "cost_like", canonical_hint: "facility_costs", require_subtotal: true },
  { source_field_id: "transportomkostninger", pattern: /^transportomkostninger\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "vehicle_costs", require_subtotal: true },
  { source_field_id: "administrationsomkostninger", pattern: /administration\b/i, family: "cost_like", canonical_hint: "admin_costs", require_subtotal: true },
  { source_field_id: "afskrivninger", pattern: /afskrivninger/i, family: "cost_like", canonical_hint: "depreciation", require_subtotal: true },
  { source_field_id: "resultat_foer_skat", pattern: /resultat før skat/i, family: "profit_like", canonical_hint: "ebt", require_subtotal: true },
  { source_field_id: "resultat_foer_ekstraordinaere", pattern: /resultat før ekstraordinære poster/i, family: "profit_like", canonical_hint: "ebt", require_subtotal: true },
  { source_field_id: "resultat_efter_skat", pattern: /resultat efter skat/i, family: "profit_like", canonical_hint: "net_result", require_subtotal: true },
  { source_field_id: "periodens_resultat", pattern: /periodens resultat/i, family: "profit_like", canonical_hint: "net_result", require_subtotal: true },
];

// ── Structural Payload → Semantic Extraction ──

function extractSemanticFromStructural(
  structural: PdfStructuralPayload,
  textContent: string,
): SemanticExtractionResult | null {
  // Parse text to get metadata (company name, CVR, period)
  const parsed = parseEconomicPdfText(textContent);
  const { lines, metadata } = parsed;

  if (lines.length < 3) return null;

  // Build metric candidates from parsed lines with RAW document signs
  const candidates: SemanticMetricCandidate[] = [];
  const lineItems: SemanticLineItem[] = [];

  // Track consumed source_field_ids to avoid double-emission
  const consumedFieldIds = new Set<string>();

  // EBT fallback chain
  const ebtFieldIds = ["resultat_foer_skat", "resultat_foer_ekstraordinaere", "periodens_resultat"];
  let ebtConsumed = false;

  for (const fieldDef of SEMANTIC_FIELD_MAP) {
    const match = lines.find(
      l => fieldDef.pattern.test(l.name) && (!fieldDef.require_subtotal || l.is_subtotal)
    );
    if (!match) continue;

    // EBT fallback chain: only emit first match as EBT
    if (ebtFieldIds.includes(fieldDef.source_field_id)) {
      if (ebtConsumed && fieldDef.canonical_hint === "ebt") continue;
      if (fieldDef.canonical_hint === "ebt") ebtConsumed = true;
    }

    // Net result: don't double-use periodens_resultat if already consumed as EBT
    if (fieldDef.source_field_id === "periodens_resultat" && consumedFieldIds.has("periodens_resultat")) {
      continue;
    }

    if (consumedFieldIds.has(fieldDef.source_field_id)) continue;
    consumedFieldIds.add(fieldDef.source_field_id);

    const rawValue = match.period_amount;

    candidates.push({
      source_field_id: fieldDef.source_field_id,
      normalization_family: fieldDef.family,
      raw_value: rawValue,
      raw_sign: rawValue === null ? "zero" : rawValue < 0 ? "negative" : rawValue > 0 ? "positive" : "zero",
      sign_convention: "credit",
      source_label: match.name,
      source_row_index: lines.indexOf(match),
      source_column_slot: null, // text-parsed, not structural-slot-based yet
      source_cell_address: null,
      basis: "period",
      confidence: "HIGH",
      evidence: [`Matched label pattern: ${fieldDef.pattern.source}`, `Subtotal: ${match.is_subtotal}`],
      proposed_canonical_target: fieldDef.canonical_hint,
    });
  }

  // Build line items for provenance
  for (const line of lines) {
    if (line.is_subtotal || line.account_no != null) {
      lineItems.push({
        source_field_id: line.account_no || line.name.toLowerCase().replace(/\s+/g, "_").slice(0, 40),
        source_label: line.name,
        raw_value: line.period_amount,
        basis: "period",
        account_no: line.account_no,
        source_row_index: lines.indexOf(line),
      });
    }
  }

  // Parser validation
  const checks: Array<{ name: string; result: "PASS" | "FAIL" | "SKIP"; details: string }> = [];
  const hasRevenue = candidates.some(c => c.source_field_id === "omsaetning");
  const hasEbt = candidates.some(c => c.proposed_canonical_target === "ebt");
  checks.push({ name: "revenue_present", result: hasRevenue ? "PASS" : "FAIL", details: hasRevenue ? "Revenue found" : "No revenue" });
  checks.push({ name: "ebt_present", result: hasEbt ? "PASS" : "FAIL", details: hasEbt ? "EBT found" : "No EBT" });

  return {
    source_system: "economic",
    document_type: "resultatopgoerelse",
    template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1",
    sign_convention: "credit",
    normalization_profile_id: "economic_pnl_credit_v1",
    company_name: metadata.company_name,
    cvr: metadata.cvr_number,
    period_start: metadata.period_start,
    period_end: metadata.period_end,
    report_period_label: metadata.report_period,
    metric_candidates: candidates,
    line_items: lineItems,
    basis_profile: { mode: "single", selected_period_basis: "period" },
    parser_validation: {
      parser_status: checks.some(c => c.result === "FAIL") ? "FAIL" : "PASS",
      checks,
    },
    _deterministic_meta: {
      template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1",
      parser_confidence: "HIGH",
      detection_score: 0, // Set by registry
      raw_line_count: lines.length,
      normalized_line_count: candidates.length,
      column_basis_rule: "single",
    },
  };
}

// ── Template Definition ──

export const dkEconomicResultatopgoerelsePdfV1: TemplateEntry & {
  extractSemantic?: (structural: PdfStructuralPayload, textContent: string) => SemanticExtractionResult | null;
} = {
  template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1",
  label: "e-conomic Resultatopgørelse PDF (P&L only)",
  supported_file_types: ["pdf"],
  statement_type: "pnl",

  // ── Phase 5: Semantic extraction from structural payload ──
  extractSemantic: extractSemanticFromStructural,

  detect(ctx: DetectionContext): number {
    const text = ctx.rawText;
    if (!text || text.length < 100) return 0;

    // CRITICAL: If AKTIVER or PASSIVER sections exist, this is NOT a pure P&L → score 0
    if (/\bAKTIVER\b/i.test(text) || /\bPASSIVER\b/i.test(text)) {
      return 0;
    }

    let score = 0;

    // Header: "Resultatopgørelse" (standalone, not inside "Saldobalance")
    if (/resultatopgørelse/i.test(text) && !/saldobalance/i.test(text)) score += 40;

    // Footer: e-conomic URL
    if (/secure\.e-conomic\.com/i.test(text)) score += 20;

    // Has P&L labels
    if (/omsætning/i.test(text)) score += 10;
    if (/dækningsbidrag/i.test(text)) score += 5;
    if (/resultat/i.test(text)) score += 5;

    // Max score: ~80
    return score;
  },

  // ── LEGACY extract() — migration bridge, still used when no structural payload ──
  extract(
    ctx: ExtractionContext
  ):
    | { success: true; data: DeterministicExtractedData }
    | { success: false; error: string } {
    const text = ctx.rawText;
    if (!text) return { success: false, error: "No PDF text content" };

    const parsed = parseEconomicPdfText(text);
    const { lines, metadata } = parsed;

    console.log(`[DK_ECONOMIC_PNL_PDF] Parsed ${lines.length} lines, PNL=${lines.filter(l => l.section === "PNL").length}, null=${lines.filter(l => l.section === null).length}`);
    console.log(`[DK_ECONOMIC_PNL_PDF] Subtotals: ${lines.filter(l => l.is_subtotal).map(l => `${l.section}:${l.name}`).join(", ")}`);

    if (lines.length < 3) {
      return {
        success: false,
        error: `Insufficient parsed lines: ${lines.length} (minimum 3)`,
      };
    }

    const omsaetningLine = findByLabel(lines, /omsætning\s*(i alt|ialt)/i);
    const vareforbrug1 = findByLabel(lines, /vareforbrug og fremmed arbejde/i);
    const vareforbrug2 = findByLabel(lines, /^vareforbrug$/i);
    const direkteOmkLine = vareforbrug1 || vareforbrug2 || findByLabel(lines, /vareforbrug/i);
    const dbLine = findByLabel(lines, /dækningsbidrag/i);
    const loenLine = findByLabel(lines, /lønninger\s*(mv\.?)?\s*(i alt|ialt)/i);
    const salgsLine = findByLabel(lines, /salgsomkostninger/i);
    const lokaleLine = findByLabel(lines, /lokaleomkostninger/i);
    const transportLine = findByLabel(lines, /^transportomkostninger\s*(i alt|ialt)/i);
    const adminLine = findByLabel(lines, /administration\b/i);
    const afskrLine = findByLabel(lines, /afskrivninger/i);
    const ebtLine = findByLabel(lines, /resultat før skat/i)
      || findByLabel(lines, /resultat før ekstraordinære poster/i)
      || findByLabel(lines, /periodens resultat/i);

    const periodenLineForNet = ebtLine?.name && /periodens resultat/i.test(ebtLine.name)
      ? null
      : findByLabel(lines, /periodens resultat/i);
    const netResultLine = findByLabel(lines, /resultat efter skat/i)
      || periodenLineForNet;

    // LEGACY: sign normalization in template (will be removed after Phase 5 cutover)
    const keyFigures: Record<string, number | null> = {
      omsaetning: absVal(omsaetningLine?.period_amount ?? null),
      direkte_omkostninger: absVal(direkteOmkLine?.period_amount ?? null),
      daekningsbidrag: flipSign(dbLine?.period_amount ?? null),
      loenninger: absVal(loenLine?.period_amount ?? null),
      salgsomkostninger: absVal(salgsLine?.period_amount ?? null),
      lokaleomkostninger: absVal(lokaleLine?.period_amount ?? null),
      transportomkostninger: absVal(transportLine?.period_amount ?? null),
      administrationsomkostninger: absVal(adminLine?.period_amount ?? null),
      afskrivninger: absVal(afskrLine?.period_amount ?? null),
      resultat_foer_skat: flipSign(ebtLine?.period_amount ?? null),
      resultat_efter_skat: flipSign(netResultLine?.period_amount ?? null),
    };

    const lineItems: DeterministicExtractedData["line_items"] = lines
      .filter((l) => l.is_subtotal || l.account_no != null)
      .map((l) => ({
        name: l.name,
        period_amount: l.period_amount,
        ytd_amount: l.ytd_amount,
        raw_sign:
          l.period_amount != null && l.period_amount < 0
            ? "MINUS"
            : "PLUS",
        account_no: l.account_no,
        class: mapPnlClass(l.name),
      }));

    const checks: ParserValidation["checks"] = [];
    if (keyFigures.omsaetning != null) {
      checks.push({ name: "revenue_present", result: "PASS", details: `Revenue: ${keyFigures.omsaetning}` });
    } else {
      checks.push({ name: "revenue_present", result: "FAIL", details: "No revenue found" });
    }
    if (keyFigures.resultat_foer_skat != null) {
      checks.push({ name: "ebt_present", result: "PASS", details: `EBT: ${keyFigures.resultat_foer_skat}` });
    } else {
      checks.push({ name: "ebt_present", result: "FAIL", details: "No EBT found" });
    }
    if (keyFigures.omsaetning != null && keyFigures.direkte_omkostninger != null && keyFigures.daekningsbidrag != null) {
      const expected = keyFigures.omsaetning - keyFigures.direkte_omkostninger;
      const diff = Math.abs(expected - keyFigures.daekningsbidrag);
      checks.push({ name: "gross_profit_sum", result: diff <= 2 ? "PASS" : "FAIL", details: `${keyFigures.omsaetning} - ${keyFigures.direkte_omkostninger} = ${expected.toFixed(2)}, DB = ${keyFigures.daekningsbidrag} (diff ${diff.toFixed(2)})` });
    } else {
      checks.push({ name: "gross_profit_sum", result: "SKIP", details: "Missing revenue, cogs or gross_profit" });
    }
    checks.push({ name: "balance_equation", result: "SKIP", details: "P&L only — no balance data" });

    const hasFail = checks.some((c) => c.result === "FAIL");
    const parserStatus: "PASS" | "FAIL" = hasFail ? "FAIL" : "PASS";
    const validation: ParserValidation = { parser_status: parserStatus, checks };

    const deterministicMeta: DeterministicMeta = {
      template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1",
      parser_confidence: "HIGH",
      detection_score: 0,
      parser_validation_status: parserStatus,
      parser_validation_errors: checks.filter((c) => c.result === "FAIL").map((c) => c.details),
      raw_line_count: lines.length,
      normalized_line_count: lineItems.length,
      column_basis_rule: "single",
    };

    const extractedData: DeterministicExtractedData = {
      report_type: "resultatopgørelse",
      company_name: metadata.company_name,
      cvr_number: metadata.cvr_number,
      period_start: metadata.period_start,
      period_end: metadata.period_end,
      report_period: metadata.report_period,
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
