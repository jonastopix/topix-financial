/**
 * Template: DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1
 * e-conomic Resultatopgørelse PDF (P&L only)
 *
 * Detection: "Resultatopgørelse" header + e-conomic footer + NO AKTIVER/PASSIVER
 * Extraction: Label-first, single-column numbers
 * Column basis: SINGLE — only period_amount (no År til dato split)
 * Sign normalization: Done in template (canonical engine receives "normal" convention values)
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

// ── Label Lookup Helpers ──

function findByLabel(
  lines: PdfParsedLine[],
  pattern: RegExp
): PdfParsedLine | null {
  return lines.find(
    (l) => pattern.test(l.name) && l.is_subtotal
  ) || null;
}

// ── Sign normalization helpers ──
// In resultatopgørelse: revenue is negative (credit convention), costs positive.
// We normalize: revenue → abs, costs → abs, profit/result → flipSign (neg credit = profit → pos).

function flipSign(val: number | null): number | null {
  return val != null ? -val : null;
}

function absVal(val: number | null): number | null {
  return val != null ? Math.abs(val) : null;
}

// ── Template Definition ──

export const dkEconomicResultatopgoerelsePdfV1: TemplateEntry = {
  template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1",
  label: "e-conomic Resultatopgørelse PDF (P&L only)",
  supported_file_types: ["pdf"],
  statement_type: "pnl",

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

    // ═══════════════════════════════════════════════════════════════
    // P&L METRICS — single column (period_amount)
    // ═══════════════════════════════════════════════════════════════

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
    // ── EBT line: fallback chain (template-local, e-conomic specific) ──
    // Priority 1: "resultat før skat" (standard e-conomic label)
    // Priority 2: "resultat før ekstraordinære poster" (variant without tax line)
    // Priority 3: "periodens resultat" (simplest e-conomic P&L variant)
    const ebtLine = findByLabel(lines, /resultat før skat/i)
      || findByLabel(lines, /resultat før ekstraordinære poster/i)
      || findByLabel(lines, /periodens resultat/i);

    // ── Net result line: fallback chain ──
    // Priority 1: "resultat efter skat" (standard)
    // Priority 2: "periodens resultat" — but ONLY if not already consumed as EBT above
    const periodenLineForNet = ebtLine?.name && /periodens resultat/i.test(ebtLine.name)
      ? null  // already used as EBT fallback, do not double-use
      : findByLabel(lines, /periodens resultat/i);
    const netResultLine = findByLabel(lines, /resultat efter skat/i)
      || periodenLineForNet;

    // ═══════════════════════════════════════════════════════════════
    // BUILD KEY FIGURES with sign normalization
    // In resultatopgørelse: revenue/profit are negative (credit), costs positive (debit)
    // ═══════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════
    // BUILD LINE ITEMS
    // ═══════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════
    // PARSER VALIDATION
    // ═══════════════════════════════════════════════════════════════

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

    // Check: Gross profit sum (revenue - cogs ≈ gross_profit)
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

    // No balance equation check (P&L only)
    checks.push({ name: "balance_equation", result: "SKIP", details: "P&L only — no balance data" });

    const hasFail = checks.some((c) => c.result === "FAIL");
    const parserStatus: "PASS" | "FAIL" = hasFail ? "FAIL" : "PASS";

    const validation: ParserValidation = { parser_status: parserStatus, checks };

    // ═══════════════════════════════════════════════════════════════
    // DETERMINISTIC METADATA
    // ═══════════════════════════════════════════════════════════════

    const deterministicMeta: DeterministicMeta = {
      template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1",
      parser_confidence: "HIGH",
      detection_score: 0, // Set by registry
      parser_validation_status: parserStatus,
      parser_validation_errors: checks.filter((c) => c.result === "FAIL").map((c) => c.details),
      raw_line_count: lines.length,
      normalized_line_count: lineItems.length,
      column_basis_rule: "single",
    };

    // ═══════════════════════════════════════════════════════════════
    // BUILD EXTRACTED DATA
    // ═══════════════════════════════════════════════════════════════

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
