/**
 * Template: DK_ECONOMIC_SALDOBALANCE_PDF_V1
 * e-conomic Combined Saldobalance PDF (P&L + Balance)
 *
 * Detection: "Saldobalance for perioden" header + AKTIVER/PASSIVER sections + e-conomic footer
 * Extraction: Label-first with account-number fallback
 * Column basis: MIXED — P&L uses "Perioden", Balance uses "År til dato"
 * Sign normalization: Done in template (canonical engine receives "normal" convention values)
 *
 * AMBIGUITY: If AKTIVER/PASSIVER sections are present, this template scores high (≥90).
 * A future Template B (P&L only) gets -60 penalty when AKTIVER/PASSIVER found → no ambiguity.
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
  type PdfSection,
} from "../pdfTextParser.ts";

// ── Label-first Lookup Helpers ──

function findByLabel(
  lines: PdfParsedLine[],
  pattern: RegExp,
  section?: PdfSection
): PdfParsedLine | null {
  return lines.find(
    (l) =>
      pattern.test(l.name) &&
      l.is_subtotal &&
      (section === undefined || l.section === section)
  ) || null;
}

function findByLabelOrAccount(
  lines: PdfParsedLine[],
  labelPattern: RegExp,
  accountRange: [number, number],
  section?: PdfSection
): PdfParsedLine | null {
  // Strategy 1: Label match (primary)
  const byLabel = findByLabel(lines, labelPattern, section);
  if (byLabel) return byLabel;

  // Strategy 2: Account number range (fallback)
  const byAccount = lines.find((l) => {
    if (!l.account_no) return false;
    const acct = parseInt(l.account_no, 10);
    return (
      acct >= accountRange[0] &&
      acct <= accountRange[1] &&
      (section === undefined || l.section === section)
    );
  });
  if (byAccount) {
    console.log(
      `[DK_ECONOMIC_PDF] Using account fallback ${byAccount.account_no} for ${labelPattern.source}`
    );
  }
  return byAccount || null;
}

// ── Sign normalization helpers ──
// In saldobalance: negative = credit. For P&L: revenue/profit are credit (negative).
// We flip to "normal" convention: revenue positive, profit positive, etc.

function flipPnlSign(val: number | null): number | null {
  return val != null ? -val : null;
}

function absVal(val: number | null): number | null {
  return val != null ? Math.abs(val) : null;
}

// ── Template Definition ──

export const dkEconomicSaldobalancePdfV1: TemplateEntry = {
  template_id: "DK_ECONOMIC_SALDOBALANCE_PDF_V1",
  label: "e-conomic Saldobalance PDF (Combined P&L + Balance)",
  supported_file_types: ["pdf"],
  statement_type: "combined",

  detect(ctx: DetectionContext): number {
    const text = ctx.rawText;
    if (!text || text.length < 100) return 0;

    let score = 0;

    // Header: "Saldobalance for perioden ..."
    if (/saldobalance for perioden/i.test(text)) score += 40;

    // Footer: e-conomic URL
    if (/secure\.e-conomic\.com/i.test(text)) score += 20;

    // Column headers present
    if (/\bNr\b/i.test(text) && /\bNavn\b/i.test(text) && /Perioden|År til dato/i.test(text)) {
      score += 10;
    }

    // AKTIVER section present → combined report (Template A)
    if (/\bAKTIVER\b/i.test(text)) score += 15;
    if (/\bPASSIVER\b/i.test(text)) score += 15;

    // Max score: 100

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

    // Debug: show parsed lines summary
    console.log(`[DK_ECONOMIC_PDF] Parsed ${lines.length} lines, sections: PNL=${lines.filter(l=>l.section==="PNL").length}, AKTIVER=${lines.filter(l=>l.section==="AKTIVER").length}, PASSIVER=${lines.filter(l=>l.section==="PASSIVER").length}, null=${lines.filter(l=>l.section===null).length}`);
    console.log(`[DK_ECONOMIC_PDF] Subtotals: ${lines.filter(l=>l.is_subtotal).map(l=>`${l.section}:${l.name}`).join(", ")}`);

    if (lines.length < 5) {
      return {
        success: false,
        error: `Insufficient parsed lines: ${lines.length} (minimum 5)`,
      };
    }

    if (!metadata.has_resultatopgoerelse) {
      return {
        success: false,
        error: "No RESULTATOPGØRELSE section found",
      };
    }

    if (!metadata.has_aktiver && !metadata.has_passiver) {
      return {
        success: false,
        error: "No AKTIVER/PASSIVER sections found (not a combined report)",
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // P&L METRICS — from "Perioden" column (period_amount)
    // ═══════════════════════════════════════════════════════════════

    const omsaetningLine = findByLabel(lines, /omsætning\s*(i alt|ialt)/i, "PNL");
    const direkteOmkLine = findByLabel(lines, /direkte omkostninger\s*(i alt|ialt)/i, "PNL");
    const dbLine = findByLabel(lines, /dækningsbidrag/i, "PNL");
    const loenLine = findByLabel(lines, /lønninger\s*(i alt|ialt)/i, "PNL");
    const salgsLine = findByLabel(lines, /salgs.*(i alt|ialt)/i, "PNL");
    const adminLine = findByLabel(lines, /administrations.*(i alt|ialt)/i, "PNL");
    const afskrLine = findByLabel(lines, /afskrivninger\s*(i alt|ialt)/i, "PNL");
    const ebitdaLine = findByLabel(lines, /resultat før afskrivninger/i, "PNL");
    const ebtLine = findByLabel(lines, /resultat før skat/i, "PNL");
    const netResultLine = findByLabel(lines, /resultat efter skat/i, "PNL");

    // ═══════════════════════════════════════════════════════════════
    // BALANCE METRICS — from "År til dato" column (ytd_amount)
    // ═══════════════════════════════════════════════════════════════

    const aktiverLine = findByLabel(lines, /aktiver i alt/i);
    const passiverLine = findByLabel(lines, /passiver i alt/i);
    const egenkapitalLine = findByLabel(lines, /egenkapital i alt/i);

    // Cash: label-first, account fallback
    const cashLine =
      findByLabel(lines, /likvide beholdninger/i, "AKTIVER") ||
      findByLabelOrAccount(lines, /bankkonto|bank\b|kasse/i, [5800, 5899], "AKTIVER");

    // Debtors: label-first, account fallback
    const debitorLine =
      findByLabel(lines, /tilgodehavender\s*(i alt|ialt)/i, "AKTIVER") ||
      findByLabelOrAccount(lines, /debitorer/i, [5600, 5699], "AKTIVER");

    // Inventory
    const inventoryLine = findByLabel(lines, /varebeholdninger\s*(i alt|ialt)/i, "AKTIVER") ||
      findByLabel(lines, /varelager/i, "AKTIVER");

    // ═══════════════════════════════════════════════════════════════
    // BUILD KEY FIGURES with sign normalization
    // ═══════════════════════════════════════════════════════════════

    const keyFigures: Record<string, number | null> = {
      // P&L: from Perioden column, signs normalized
      omsaetning: absVal(omsaetningLine?.period_amount ?? null),
      direkte_omkostninger: absVal(direkteOmkLine?.period_amount ?? null),
      daekningsbidrag: flipPnlSign(dbLine?.period_amount ?? null),
      loenninger: absVal(loenLine?.period_amount ?? null),
      salgsomkostninger: absVal(salgsLine?.period_amount ?? null),
      administrationsomkostninger: absVal(adminLine?.period_amount ?? null),
      afskrivninger: absVal(afskrLine?.period_amount ?? null),
      resultat_foer_afskrivninger: flipPnlSign(ebitdaLine?.period_amount ?? null),
      resultat_foer_skat: flipPnlSign(ebtLine?.period_amount ?? null),
      arets_resultat: flipPnlSign(netResultLine?.period_amount ?? null),

      // Balance: from År til dato column, signs normalized
      aktiver_i_alt: absVal(aktiverLine?.ytd_amount ?? null),
      passiver_i_alt: absVal(passiverLine?.ytd_amount ?? null),
      egenkapital: flipPnlSign(egenkapitalLine?.ytd_amount ?? null),
      likvider: cashLine?.ytd_amount ?? null, // Keep sign (overdraft possible)
      debitorer: debitorLine?.ytd_amount ?? null, // Keep sign
      varelager: inventoryLine?.ytd_amount ?? null,
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
          l.section === "PNL"
            ? l.period_amount != null && l.period_amount < 0
              ? "MINUS"
              : "PLUS"
            : l.ytd_amount != null && l.ytd_amount < 0
              ? "MINUS"
              : "PLUS",
        account_no: l.account_no,
        class: mapSectionToClass(l.section, l.name),
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

    // Check: Balance totals
    if (keyFigures.aktiver_i_alt != null && keyFigures.passiver_i_alt != null) {
      const diff = Math.abs(keyFigures.aktiver_i_alt - keyFigures.passiver_i_alt);
      checks.push({
        name: "balance_equation",
        result: diff <= 2 ? "PASS" : "FAIL",
        details: `Assets ${keyFigures.aktiver_i_alt} vs Liabilities ${keyFigures.passiver_i_alt} (diff ${diff.toFixed(2)})`,
      });
    } else {
      checks.push({ name: "balance_equation", result: "SKIP", details: "Missing balance totals" });
    }

    // Check: EBT present
    if (keyFigures.resultat_foer_skat != null) {
      checks.push({ name: "ebt_present", result: "PASS", details: `EBT: ${keyFigures.resultat_foer_skat}` });
    } else {
      checks.push({ name: "ebt_present", result: "FAIL", details: "No EBT found" });
    }

    const hasFail = checks.some((c) => c.result === "FAIL");
    const parserStatus: "PASS" | "FAIL" = hasFail ? "FAIL" : "PASS";

    const validation: ParserValidation = { parser_status: parserStatus, checks };

    // ═══════════════════════════════════════════════════════════════
    // DETERMINISTIC METADATA
    // ═══════════════════════════════════════════════════════════════

    const pnlLines = lines.filter((l) => l.section === "PNL");
    const balanceLines = lines.filter((l) => l.section === "AKTIVER" || l.section === "PASSIVER");

    const deterministicMeta: DeterministicMeta = {
      template_id: "DK_ECONOMIC_SALDOBALANCE_PDF_V1",
      parser_confidence: "HIGH",
      detection_score: 0, // Set by registry
      parser_validation_status: parserStatus,
      parser_validation_errors: checks.filter((c) => c.result === "FAIL").map((c) => c.details),
      raw_line_count: lines.length,
      normalized_line_count: lineItems.length,
      column_basis_rule: "mixed",
    };

    // ═══════════════════════════════════════════════════════════════
    // BUILD EXTRACTED DATA
    // ═══════════════════════════════════════════════════════════════

    const extractedData: DeterministicExtractedData = {
      report_type: "combined",
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

// ── Helper: Map section to canonical class ──

function mapSectionToClass(section: PdfSection, name: string): string {
  if (section === "PNL") {
    if (/omsætning/i.test(name)) return "REVENUE";
    if (/vareforbrug|direkte omk/i.test(name)) return "COGS";
    if (/afskrivning/i.test(name)) return "DEPR";
    if (/rente.*indtægt|finansielle indtægt/i.test(name)) return "FIN_INCOME";
    if (/rente.*udgift|finansielle udgift|finansiering/i.test(name)) return "FIN_EXPENSE";
    return "OPEX";
  }
  if (section === "AKTIVER") return "ASSET";
  if (section === "PASSIVER") {
    if (/egenkapital|anpartskapital|aktiekapital|resultat/i.test(name)) return "EQUITY";
    return "LIABILITY";
  }
  return "UKLASSIFICERET";
}
