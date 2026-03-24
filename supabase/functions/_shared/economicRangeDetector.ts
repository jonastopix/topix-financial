/**
 * Shared Economic-Style Account Range Detector
 *
 * Detects whether a Danish financial report follows the e-conomic account
 * numbering convention, distinguishing it from Dinero's convention:
 *
 *   e-conomic: payroll in 2200-2999, opex in 3000-3999
 *   Dinero:    COGS in 2000-2999, payroll in 3000-3999
 *
 * Three detection strategies (structural-first, parsed-line, raw-text fallback):
 *   1. Structural tokens from PdfStructuralPayload — highest robustness
 *   2. Parsed lines from parseEconomicPdfText() — robust against whitespace/formatting
 *   3. Raw regex on text — legacy fallback when parsed lines unavailable
 *
 * Used by:
 *   - sourceFingerprint.ts (unbranded e-conomic branch)
 *   - dkEconomicResultatopgoerelsePdfV1.ts (+20 detection signal)
 *   - dkDineroResultatopgoerelsePdfV1.ts (-30 anti-match penalty)
 */

import { parseEconomicPdfText, type PdfParsedLine } from "./pdfTextParser.ts";
import type { PdfStructuralPayload, PdfStructuralRow } from "./pdfStructuralTypes.ts";

export interface EconomicRangeDetectionResult {
  detected: boolean;
  method: "structural_tokens" | "parsed_lines" | "raw_regex" | "none";
  payroll_signal: boolean;
  opex_signal: boolean;
  evidence: string[];
}

// ── Payroll labels (match against account names in 2200-2999 range) ──
const PAYROLL_LABEL_RE = /løn|gage|personal|ferie/i;

// ── Opex labels (match against account names in 3000-3999 range) ──
const OPEX_LABEL_RE = /bil|transport|lokale|husleje|kontor|forsikring|salg|reklame|admin|vedlige/i;

/**
 * Detect economic-style account ranges from structural payload tokens.
 * Extracts account numbers from leftmost tokens and matches against labels.
 * Most robust strategy — immune to whitespace/formatting issues.
 */
function detectFromStructuralTokens(structural: PdfStructuralPayload): EconomicRangeDetectionResult {
  let payroll = false;
  let opex = false;
  const evidence: string[] = [];

  for (const page of structural.pages) {
    for (const row of page.rows) {
      // Find account number token: leftmost token that looks like a 4-digit number
      const labelTokens = row.tokens.filter(t => t.column_slot === null);
      if (labelTokens.length === 0) continue;

      // First token might be account number
      const firstToken = labelTokens[0];
      const acctMatch = firstToken.text.match(/^\s*(\d{4})\s*$/);
      if (!acctMatch) continue;

      const acctNum = parseInt(acctMatch[1], 10);
      // Remaining label tokens form the account name
      const labelText = labelTokens.slice(1).map(t => t.text).join(" ");

      // Payroll in 2200-2999
      if (acctNum >= 2200 && acctNum <= 2999 && PAYROLL_LABEL_RE.test(labelText)) {
        if (!payroll) {
          payroll = true;
          evidence.push(`Structural: payroll acct ${acctNum} "${labelText.trim()}"`);
        }
      }

      // Opex in 3000-3999
      if (acctNum >= 3000 && acctNum <= 3999 && OPEX_LABEL_RE.test(labelText)) {
        if (!opex) {
          opex = true;
          evidence.push(`Structural: opex acct ${acctNum} "${labelText.trim()}"`);
        }
      }

      if (payroll && opex) break;
    }
    if (payroll && opex) break;
  }

  return {
    detected: payroll && opex,
    method: (payroll || opex) ? "structural_tokens" : "none",
    payroll_signal: payroll,
    opex_signal: opex,
    evidence,
  };
}

/**
 * Detect economic-style account ranges from parsed lines.
 * Checks account_no field (robust against formatting) + name field.
 */
function detectFromParsedLines(lines: PdfParsedLine[]): EconomicRangeDetectionResult {
  let payroll = false;
  let opex = false;
  const evidence: string[] = [];

  for (const line of lines) {
    if (!line.account_no) continue;
    const acctNum = parseInt(line.account_no, 10);
    if (isNaN(acctNum)) continue;

    // Payroll in 2200-2999
    if (acctNum >= 2200 && acctNum <= 2999 && PAYROLL_LABEL_RE.test(line.name)) {
      if (!payroll) {
        payroll = true;
        evidence.push(`Payroll signal: acct ${line.account_no} "${line.name}"`);
      }
    }

    // Opex in 3000-3999
    if (acctNum >= 3000 && acctNum <= 3999 && OPEX_LABEL_RE.test(line.name)) {
      if (!opex) {
        opex = true;
        evidence.push(`Opex signal: acct ${line.account_no} "${line.name}"`);
      }
    }

    if (payroll && opex) break;
  }

  return {
    detected: payroll && opex,
    method: (payroll || opex) ? "parsed_lines" : "none",
    payroll_signal: payroll,
    opex_signal: opex,
    evidence,
  };
}

/**
 * Detect economic-style account ranges from raw text (regex fallback).
 * Original logic — kept for cases where parsing fails entirely.
 */
function detectFromRawText(text: string): EconomicRangeDetectionResult {
  const payroll = /^\s*2[2-9]\d{2}\s+\S.*(?:løn|gage|personal|ferie)/im.test(text);
  const opex = /^\s*3\d{3}\s+\S.*(?:bil|transport|lokale|husleje|kontor|forsikring|salg|reklame|admin|vedlige)/im.test(text);

  const evidence: string[] = [];
  if (payroll) evidence.push("Raw regex: payroll pattern in 2200-range");
  if (opex) evidence.push("Raw regex: opex pattern in 3000-range");

  return {
    detected: payroll && opex,
    method: (payroll || opex) ? "raw_regex" : "none",
    payroll_signal: payroll,
    opex_signal: opex,
    evidence,
  };
}

/**
 * Main detection entry point.
 *
 * Strategy: structural-first → parsed-line → raw regex fallback.
 *
 * @param rawText - The raw PDF text content
 * @param parsedLines - Optional pre-parsed lines (avoids re-parsing)
 * @param structural - Optional structural payload (highest priority)
 */
export function detectEconomicAccountRanges(
  rawText: string,
  parsedLines?: PdfParsedLine[],
  structural?: PdfStructuralPayload,
): EconomicRangeDetectionResult {
  // Strategy 0: Structural tokens (most robust — immune to text formatting)
  if (structural) {
    const structResult = detectFromStructuralTokens(structural);
    if (structResult.detected) {
      console.log(`[EconomicRangeDetect] structural_tokens: payroll=${structResult.payroll_signal}, opex=${structResult.opex_signal} → DETECTED`);
      return structResult;
    }
    // Partial match from structural — continue to parsed lines
    if (structResult.payroll_signal || structResult.opex_signal) {
      console.log(`[EconomicRangeDetect] structural_tokens partial: payroll=${structResult.payroll_signal}, opex=${structResult.opex_signal} → trying parsed lines`);
    }
  }

  // Strategy 1: Parsed lines (robust against whitespace/formatting)
  const lines = parsedLines ?? parseEconomicPdfText(rawText).lines;

  if (lines.length > 0) {
    const result = detectFromParsedLines(lines);
    if (result.detected) {
      console.log(`[EconomicRangeDetect] parsed_lines: payroll=${result.payroll_signal}, opex=${result.opex_signal} → DETECTED`);
      return result;
    }

    // Partial match from parsed lines — try raw regex to fill gap
    if (result.payroll_signal || result.opex_signal) {
      console.log(`[EconomicRangeDetect] parsed_lines partial: payroll=${result.payroll_signal}, opex=${result.opex_signal} → trying raw fallback`);
    }
  }

  // Strategy 2: Raw regex fallback
  const rawResult = detectFromRawText(rawText);
  if (rawResult.detected) {
    console.log(`[EconomicRangeDetect] raw_regex: payroll=${rawResult.payroll_signal}, opex=${rawResult.opex_signal} → DETECTED`);
  } else {
    console.log(`[EconomicRangeDetect] no match: payroll=${rawResult.payroll_signal}, opex=${rawResult.opex_signal}`);
  }
  return rawResult;
}
