/**
 * Template: DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1
 * e-conomic Resultatopgørelse PDF (P&L only)
 *
 * Detection: "Resultatopgørelse" header + e-conomic footer + NO AKTIVER/PASSIVER
 * Extraction: Label-first, single-column numbers
 * Column basis: SINGLE — only period_amount (no År til dato split)
 *
 * PHASE 5 — STRUCTURAL-FIRST:
 * - extractSemantic() consumes PdfStructuralPayload directly as primary source
 * - Rows/tokens/column_slots from structural payload are the authoritative data
 * - Emits SemanticExtractionResult with raw document signs preserved
 * - No flipSign/absVal — normalization is centralized
 * - Legacy extract() preserved as migration bridge for reports without structural payload
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
  parseDanishNumber,
  type PdfParsedLine,
} from "../pdfTextParser.ts";

import type {
  SemanticExtractionResult,
  SemanticMetricCandidate,
  SemanticLineItem,
} from "../semanticTypes.ts";

import type { MetricFamily } from "../normalizationProfiles.ts";
import type { PdfStructuralPayload, PdfStructuralRow } from "../pdfStructuralTypes.ts";
import { detectEconomicAccountRanges } from "../economicRangeDetector.ts";

// ── Label Lookup Helpers (LEGACY ONLY) ──

function findByLabel(
  lines: PdfParsedLine[],
  pattern: RegExp,
  antiPattern?: RegExp
): PdfParsedLine | null {
  return lines.find(
    (l) => pattern.test(l.name) && l.is_subtotal && (!antiPattern || !antiPattern.test(l.name))
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
  anti_pattern?: RegExp;
  family: MetricFamily;
  canonical_hint: string;
  require_subtotal: boolean;
}> = [
  { source_field_id: "omsaetning", pattern: /omsætning\s*(i alt|ialt)/i, family: "revenue_like", canonical_hint: "revenue", require_subtotal: true },
  { source_field_id: "direkte_omkostninger", pattern: /vareforbrug|direkte omk/i, family: "cost_like", canonical_hint: "cogs", require_subtotal: false },
  // NOTE: daekningsbidrag intentionally omitted — gross_profit derived as revenue - cogs in canonical engine
  // BRILLEVÆRK (prod 17/9 21:59): «Løn, gager og honorarer i alt» — før pattern: /lønninger\s*(mv\.?)?\s*(i alt|ialt)/i (løn var tom)
  { source_field_id: "loenninger", pattern: /^(lønninger|løn,? gager( og honorarer)?|løn)\s*(mv\.?)?\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "payroll", require_subtotal: true },
  // BRILLEVÆRK: «Pensioner i alt» → payroll_related; «Sociale bidrag og personaleomkostninger i alt» / «Personaleomkostninger i alt» /
  // «Øvrige personaleudgifter i alt» → other_staff_costs. Den FØRSTE matchende række vinder (consumedFieldIds); rummer en
  // «Personaleomkostninger i alt» både løn og pension (den står EFTER dem), trækkes de fra igen i efterbehandlPersonale.
  { source_field_id: "pensioner_sociale", pattern: /^pensioner\s*(og sociale bidrag)?\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "payroll_related", require_subtotal: true },
  { source_field_id: "oevrige_personale", pattern: /^(sociale bidrag og personaleomkostninger|personaleomkostninger|øvrige personale(udgifter|omkostninger))\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "other_staff_costs", require_subtotal: true },
  // «Leasing i alt» → øvrige omkostninger, ikke autodrift: leasing af udstyr/inventar er ikke bildrift (afvejet 17/9 — README).
  { source_field_id: "oevrige_omkostninger", pattern: /^(leasing|andre eksterne omkostninger|øvrige omkostninger)\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "other_costs", require_subtotal: true },
  // A2 (18/9-2026): e-conomic kalder gruppen «Salgs- og rejseomkostninger i alt» (Floren Engros) — før pattern: /salgsomkostninger/i
  { source_field_id: "salgsomkostninger", pattern: /salgs.*omkostninger/i, family: "cost_like", canonical_hint: "sales_costs", require_subtotal: true },
  { source_field_id: "lokaleomkostninger", pattern: /lokaleomkostninger/i, family: "cost_like", canonical_hint: "facility_costs", require_subtotal: true },
  // A2 (18/9-2026): «Autodrift - gulpladebiler i alt» (Floren Engros: −15.721,14) — før pattern: /^transportomkostninger\s*(i alt|ialt)/i
  { source_field_id: "transportomkostninger", pattern: /^(transportomkostninger|autodrift).*(i alt|ialt)/i, family: "cost_like", canonical_hint: "vehicle_costs", require_subtotal: true },
  // A (18/9-2026): før stod her pattern: /administration\b/i — ordgrænsen efter «administration» rammer
  // ALDRIG e-conomics subtotal «Administrationsomkostninger i alt» (næste tegn er «s»), så admin_costs
  // var null for alle rapporter på skabelonen (prod 17/9 18:14: BRILLEVÆRK, Capture IT, Doggybed, Floren).
  { source_field_id: "administrationsomkostninger", pattern: /administration(s?omkostninger)?\b/i, family: "cost_like", canonical_hint: "admin_costs", require_subtotal: true },
  { source_field_id: "afskrivninger", pattern: /afskrivninger/i, anti_pattern: /resultat\s+før/i, family: "cost_like", canonical_hint: "depreciation", require_subtotal: true },
  // A2 (18/9-2026): finansielle poster — e-conomics månedsopgørelse har «Renteindtægter i alt» og «Renteudgifter i alt»
  // (Floren Engros 2026-06: +16.175,55 / −5.133,86). To nøgler: financial_costs og financial_income (canonicalTypes),
  // så motoren kan regne ebt = ebit − financial_costs + financial_income. Nettolinjen «Finansielle poster i alt» matches IKKE (fortegnet
  // afgør om den er indtægt eller udgift, og ABS-normaliseringen ville tabe det).
  { source_field_id: "renteindtaegter", pattern: /(renteindtægter|finansielle indtægter)\s*(i alt|ialt)/i, family: "revenue_like", canonical_hint: "financial_income", require_subtotal: true },
  { source_field_id: "renteudgifter", pattern: /(renteudgifter|finansielle (omkostninger|udgifter)|finansierings(udgifter|omkostninger))\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "financial_costs", require_subtotal: true },
  { source_field_id: "resultat_foer_skat", pattern: /resultat før skat/i, family: "profit_like", canonical_hint: "ebt", require_subtotal: true },
  { source_field_id: "resultat_foer_ekstraordinaere", pattern: /resultat før ekstraordinære poster/i, family: "profit_like", canonical_hint: "ebt", require_subtotal: true },
  // A2 (18/9-2026): «Resultat før renter» er ebit — før canonical_hint: "ebt" (Floren Engros 2026-06 fik −49.089,83 i stedet for −38.048,14).
  // ebt findes af motoren: egen linje > ebit ± finansielle poster > periodens/årets resultat > ebit alene (WARN ebt_before_interest).
  { source_field_id: "resultat_foer_renter", pattern: /resultat før renter/i, family: "profit_like", canonical_hint: "ebit", require_subtotal: true },
  { source_field_id: "resultat_efter_skat", pattern: /resultat efter skat/i, family: "profit_like", canonical_hint: "net_result", require_subtotal: true },
  { source_field_id: "periodens_resultat", pattern: /periodens resultat/i, family: "profit_like", canonical_hint: "net_result", require_subtotal: true },
  { source_field_id: "arets_resultat", pattern: /årets resultat/i, anti_pattern: /skat af/i, family: "profit_like", canonical_hint: "net_result", require_subtotal: true },
];

// ── Template-Level Structural Acceptance Rule ──

export interface StructuralAcceptanceResult {
  accepted: boolean;
  reason: string;
  slot0_row_count: number;
}

/**
 * Validates that the structural payload is sufficient for this PDF family.
 * This is the template-level gate — distinct from the parser-level validation.
 *
 * Rules for e-conomic-style P&L PDFs:
 * 1. Must have at least 1 column slot
 * 2. Slot 0 must exist consistently on ≥5 financial rows
 * 3. Multi-column PDFs are accepted — extraction always uses slot 0 (period column)
 *
 * Slot 0 = leftmost numeric column = current period ("Faktisk" / "Perioden").
 * This is correct for both single-column and multi-column Danish P&L PDFs because
 * the current period is always the first numeric column in this format class.
 */
export function validateStructuralAcceptance(structural: PdfStructuralPayload): StructuralAcceptanceResult {
  // Rule 1: at least 1 column slot
  if (structural.column_profile.slot_count < 1) {
    return { accepted: false, reason: "No numeric column slots detected", slot0_row_count: 0 };
  }

  // Rule 2: slot 0 must appear on ≥5 rows
  let slot0Count = 0;
  for (const page of structural.pages) {
    for (const row of page.rows) {
      if (row.tokens.some(t => t.column_slot === 0)) {
        slot0Count++;
      }
    }
  }

  if (slot0Count < 5) {
    return {
      accepted: false,
      reason: `Slot 0 found on only ${slot0Count} rows (minimum 5)`,
      slot0_row_count: slot0Count,
    };
  }

  const slotCount = structural.column_profile.slot_count;
  const multiNote = slotCount > 1
    ? ` (multi-column: ${slotCount} slots, extracting slot 0 = period column only)`
    : "";

  return {
    accepted: true,
    reason: `Period column (slot 0) accepted${multiNote}`,
    slot0_row_count: slot0Count,
  };
}

// ── Structural Helpers ──

/**
 * Determine if a structural row is an "effective subtotal" for this PDF family.
 * In e-conomic PDFs, subtotal lines are:
 * - Explicitly marked via is_subtotal flag, OR
 * - ALL-CAPS label text (e.g., "SALGSOMKOSTNINGER", "ADMINISTRATION")
 */
function isEffectiveSubtotal(row: PdfStructuralRow): boolean {
  if (row.is_subtotal) return true;
  // Check if label tokens (non-numeric) are ALL-CAPS
  const labelTokens = row.tokens.filter(t => t.column_slot === null);
  if (labelTokens.length === 0) return false;
  const labelText = labelTokens.map(t => t.text).join(" ").trim();
  // ALL-CAPS detection: at least 3 alpha chars, all uppercase
  const alphaChars = labelText.replace(/[^a-zA-ZÆØÅæøå]/g, "");
  if (alphaChars.length < 3) return false;
  return alphaChars === alphaChars.toUpperCase();
}

/**
 * Normalize PDF label text by fixing common encoding issues.
 *
 * PDF fonts sometimes encode ligatures (e.g. "fi", "fl") as \u0000.
 * This helper replaces those null characters with "fi" — the most common
 * ligature in Danish financial labels.
 *
 * Examples:
 *   "\u0000nansielle"  → "finansielle"
 *   "Pro\u0000t"       → "Profit"
 *   "Normal text"      → "Normal text" (unchanged)
 *   "-629.400,25"      → "-629.400,25" (unchanged — numerics unaffected)
 *
 * SCOPE: Label text only. Must NEVER be applied to numeric token text.
 */
export function normalizePdfLabelText(text: string): string {
  return text.replace(/\u0000/g, "fi");
}

/**
 * Extract the label text from a structural row (all non-numeric tokens).
 * Applies ligature normalization to label text only.
 */
function getRowLabel(row: PdfStructuralRow): string {
  return normalizePdfLabelText(
    row.tokens
      .filter(t => t.column_slot === null)
      .map(t => t.text)
      .join(" ")
      .trim()
  );
}

/**
 * Extract the numeric value from column_slot 0 of a structural row.
 * Returns null if no token with column_slot 0 exists.
 */
function getSlot0Value(row: PdfStructuralRow): number | null {
  const numToken = row.tokens.find(t => t.column_slot === 0);
  if (!numToken) return null;
  return parseDanishNumber(numToken.text);
}

/**
 * Extract metadata from structural rows (company name, CVR, period).
 * Parses the first few rows of the first page.
 */
function extractStructuralMetadata(structural: PdfStructuralPayload): {
  company_name: string | null;
  cvr_number: string | null;
  period_start: string | null;
  period_end: string | null;
  report_period: string | null;
} {
  const firstPage = structural.pages[0];
  if (!firstPage || firstPage.rows.length < 2) {
    return { company_name: null, cvr_number: null, period_start: null, period_end: null, report_period: null };
  }

  let company_name: string | null = null;
  let cvr_number: string | null = null;
  let period_start: string | null = null;
  let period_end: string | null = null;
  let report_period: string | null = null;

  // Scan first 5 rows for metadata — scan individual tokens, not joined text,
  // to avoid noise from other tokens on the same row (e.g. "Hentet: ..." prefix).
  const scanRows = firstPage.rows.slice(0, 5);
  for (const row of scanRows) {
    for (const token of row.tokens) {
      // Company name + CVR: "SnowWaves ApS (CVR-nr. 39850850)"
      const cvrMatch = token.text.match(/(.+?)\s*\(CVR[\s\-.:nNrR]*\s*(\d{8})\)/i);
      if (cvrMatch && !company_name) {
        company_name = cvrMatch[1].trim();
        cvr_number = cvrMatch[2];
      }

      // Period: "Resultatopgørelse 01/01-2026 - 31/01-2026"
      const periodMatch = token.text.match(/(\d{2}\/\d{2}[-\s]*\d{4})\s*[-–]\s*(\d{2}\/\d{2}[-\s]*\d{4})/);
      if (periodMatch && !period_start) {
        period_start = periodMatch[1].replace(/\s/g, "");
        period_end = periodMatch[2].replace(/\s/g, "");
        report_period = `${period_start} - ${period_end}`;
      }
    }
  }

  return { company_name, cvr_number, period_start, period_end, report_period };
}

// ── Structural Payload → Semantic Extraction (PRIMARY PATH) ──

// ── Personaleomkostninger som BEHOLDER (17/9-2026) ──
// BRILLEVÆRK: «Løn, gager og honorarer i alt · Pensioner i alt · Sociale bidrag og personaleomkostninger … · Personaleomkostninger
// i alt». Er kandidaten til other_staff_costs en beholder der står EFTER løn og pension og er mindst lige så stor som dem
// tilsammen, trækkes løn og pension fra — ellers ville de tælle to gange. Står den før, eller er den mindre, er den en søskende
// («Sociale bidrag …») og røres ikke. Evidence siger hvad der skete.
function efterbehandlPersonale(candidates: SemanticMetricCandidate[]): void {
  const beholder = candidates.find(c => c.source_field_id === "oevrige_personale");
  if (!beholder || beholder.raw_value === null) return;
  const dele = candidates.filter(c => (c.source_field_id === "loenninger" || c.source_field_id === "pensioner_sociale") && c.raw_value !== null && (c.source_row_index ?? -1) < (beholder.source_row_index ?? -1));
  if (dele.length === 0) return;
  const sumDele = dele.reduce((s, c) => s + (c.raw_value as number), 0);
  if (Math.abs(beholder.raw_value) + 0.005 < Math.abs(sumDele) || Math.sign(beholder.raw_value) !== Math.sign(sumDele)) return;
  const foer = beholder.raw_value;
  beholder.raw_value = foer - sumDele;
  beholder.raw_sign = beholder.raw_value === 0 ? "zero" : beholder.raw_value < 0 ? "negative" : "positive";
  beholder.evidence.push(`container: ${foer} minus ${dele.map(c => `${c.source_field_id}(${c.raw_value})`).join(" + ")} = ${beholder.raw_value}`);
}

function extractSemanticFromStructural(
  structural: PdfStructuralPayload | null,
  textContent: string,
): SemanticExtractionResult | null {
  // ── STRUCTURAL-FIRST PATH (mandatory when structural exists) ──
  if (structural) {
    // Template-level acceptance gate
    const acceptance = validateStructuralAcceptance(structural);
    if (!acceptance.accepted) {
      console.warn(`[DK_ECONOMIC_PNL_PDF] Structural acceptance failed: ${acceptance.reason}`);
      return null;
    }

    console.log(`[DK_ECONOMIC_PNL_PDF] Structural-first extraction: ${acceptance.slot0_row_count} rows with slot 0`);

    // Extract metadata from structural tokens
    const metadata = extractStructuralMetadata(structural);

    // Flatten all rows across pages
    const allRows: PdfStructuralRow[] = [];
    for (const page of structural.pages) {
      for (const row of page.rows) {
        allRows.push(row);
      }
    }

    // Build metric candidates from structural rows
    const candidates: SemanticMetricCandidate[] = [];
    const lineItems: SemanticLineItem[] = [];
    const consumedFieldIds = new Set<string>();

    // EBT fallback chain
    // A2 (18/9-2026): «Resultat før renter» er ikke længere en ebt-kilde (den er ebit) — før: [..., "resultat_foer_renter", ...]
    const ebtFieldIds = ["resultat_foer_skat", "resultat_foer_ekstraordinaere", "periodens_resultat", "arets_resultat"];
    let ebtConsumed = false;

    // Narrow allowlist for label-text numeric fallback
    // Only these result-line fields may use label-text extraction when slot 0 is missing
    const LABEL_FALLBACK_ALLOWLIST = new Set([
      "resultat_foer_skat",
      "resultat_foer_ekstraordinaere",
      "resultat_foer_renter",
      "periodens_resultat",
      "arets_resultat",
      "resultat_efter_skat",
    ]);

    // FIX B: Detect sign convention from revenue value.
    // Credit convention: revenue negative. Business/algebraic: revenue positive.
    // We need this to know whether profit_like values need sign alignment.
    let detectedConvention: "credit" | "business" = "credit"; // safe default

    // Pre-scan: find revenue to detect convention before main loop
    for (const row of allRows) {
      const rl = getRowLabel(row);
      if (/omsætning\s*(i alt|ialt)/i.test(rl) && isEffectiveSubtotal(row)) {
        const revVal = getSlot0Value(row);
        if (revVal !== null) {
          detectedConvention = revVal >= 0 ? "business" : "credit";
          console.log(`[DK_ECONOMIC_PNL_PDF] Detected sign convention: ${detectedConvention} (revenue raw = ${revVal})`);
          break;
        }
      }
    }

    for (const fieldDef of SEMANTIC_FIELD_MAP) {
      // FIX A: Find ALL matching rows, then prefer first with usable slot0 value
      const matchingRows: Array<{idx: number, row: PdfStructuralRow}> = [];
      for (let ri = 0; ri < allRows.length; ri++) {
        const row = allRows[ri];
        const rl = getRowLabel(row);
        if (!fieldDef.pattern.test(rl)) continue;
        if (fieldDef.anti_pattern && fieldDef.anti_pattern.test(rl)) continue;
        if (fieldDef.require_subtotal && !isEffectiveSubtotal(row)) continue;
        matchingRows.push({ idx: ri, row });
      }

      if (matchingRows.length === 0) continue;

      // Prefer first match that has a usable slot0 value over first regex-only match
      const withSlot0 = matchingRows.find(m => getSlot0Value(m.row) !== null);
      let best = withSlot0 || matchingRows[0];
      // Vareforbrug (17/9-2026): undergrupper FØR «Omsætning i alt» ligger inde i omsætningen (BRILLEVÆRK: «Vareforbrug Glas og
      // Briller i alt», «Vareforbrug Linser i alt» før «Omsætning i alt»; «Vareforbrug øvrigt i alt» efter). Grupper inde i grupper
      // lukker indefra og ud, så den YDERSTE total er den SIDSTE vareforbrug-subtotal mellem omsætningstotalen og dækningsbidraget
      // (Resultat_6-golden: «VAREFORBRUG» 141.587,59 og dernæst «VAREFORBRUG OG FREMMED ARBEJDE» 141.587,59 — den sidste, ikke summen).
      if (fieldDef.source_field_id === "direkte_omkostninger") {
        const omsIdx = candidates.find(c => c.source_field_id === "omsaetning")?.source_row_index ?? -1;
        const dbIdx = allRows.findIndex((r, i) => i > omsIdx && isEffectiveSubtotal(r) && /dækningsbidrag/i.test(getRowLabel(r)));
        const efter = matchingRows.filter(m => m.idx > omsIdx && (dbIdx < 0 || m.idx < dbIdx) && getSlot0Value(m.row) !== null && isEffectiveSubtotal(m.row));
        const total = efter.find(m => /^(vareforbrug|direkte omkostninger)\s*(i alt|ialt)$/i.test(getRowLabel(m.row)));
        if (total) best = total;
        else if (efter.length > 0) best = efter[efter.length - 1];
      }
      const matchIdx = best.idx;
      const matchRow = best.row;
      const label = getRowLabel(matchRow);

      // Try slot 0 first (always wins)
      let rawValue = getSlot0Value(matchRow);
      let extractionMethod = "slot0";

      // Narrow label-text fallback: only for allowlisted result fields, only when slot 0 is null
      if (rawValue === null && LABEL_FALLBACK_ALLOWLIST.has(fieldDef.source_field_id)) {
        const fullRowText = matchRow.tokens.map(t => t.text).join(" ");
        const danishNumMatch = fullRowText.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/);
        if (danishNumMatch) {
          rawValue = parseDanishNumber(danishNumMatch[0]);
          extractionMethod = "label_text_fallback";
          console.log(`[DK_ECONOMIC_PNL_PDF] Label-text fallback for ${fieldDef.source_field_id}: "${danishNumMatch[0]}" → ${rawValue}`);
        }
      }

      // Skip if still no value
      if (rawValue === null) continue;

      // FIX B: For profit_like fields in business convention, negate raw value
      // so the credit-convention normalizer (NEGATE) restores the correct business sign.
      // In credit convention, profit_like values are already in credit sign → no flip needed.
      if (fieldDef.family === "profit_like" && rawValue !== null && detectedConvention === "business") {
        console.log(`[DK_ECONOMIC_PNL_PDF] Business-convention sign flip for profit_like field ${fieldDef.source_field_id}: ${rawValue} → ${-rawValue}`);
        rawValue = -rawValue;
      }

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

      candidates.push({
        source_field_id: fieldDef.source_field_id,
        normalization_family: fieldDef.family,
        raw_value: rawValue,
        raw_sign: rawValue === null ? "zero" : rawValue < 0 ? "negative" : rawValue > 0 ? "positive" : "zero",
        sign_convention: "credit",
        source_label: label,
        source_row_index: matchIdx,
        source_column_slot: extractionMethod === "slot0" ? 0 : null,
        source_cell_address: null,
        basis: "period",
        confidence: extractionMethod === "slot0" ? "HIGH" : "MEDIUM",
        evidence: [
          `Structural row ${matchRow.row_group_id}`,
          `Matched label pattern: ${fieldDef.pattern.source}`,
          `Effective subtotal: ${isEffectiveSubtotal(matchRow)}`,
          `Extraction method: ${extractionMethod}`,
          `Value: ${rawValue}`,
        ],
        proposed_canonical_target: fieldDef.canonical_hint,
      });
    }

    efterbehandlPersonale(candidates);

    // Build line items for provenance from all rows with values
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const label = getRowLabel(row);
      const value = getSlot0Value(row);
      if (value !== null || isEffectiveSubtotal(row)) {
        lineItems.push({
          source_field_id: label.toLowerCase().replace(/\s+/g, "_").slice(0, 40),
          source_label: label,
          raw_value: value,
          basis: "period",
          account_no: null,
          source_row_index: i,
        });
      }
    }

    // Parser validation
    const checks: Array<{ name: string; result: "PASS" | "FAIL" | "SKIP"; details: string }> = [];
    const hasRevenue = candidates.some(c => c.source_field_id === "omsaetning");
    const hasEbt = candidates.some(c => c.proposed_canonical_target === "ebt");
    // A2: uden egen «Resultat før skat» afleder motoren ebt af ebit ± finansielle poster eller periodens/årets resultat.
    const ebtKanAfledes = candidates.some(c => c.proposed_canonical_target === "ebit" || c.proposed_canonical_target === "net_result");
    checks.push({
      name: "revenue_present",
      result: hasRevenue ? "PASS" : "FAIL",
      details: hasRevenue ? "Revenue found via structural row" : "No revenue found",
    });
    checks.push({
      name: "ebt_present",
      result: hasEbt || ebtKanAfledes ? "PASS" : "FAIL",
      details: hasEbt ? "EBT found via structural row" : ebtKanAfledes ? "No «Resultat før skat» row — EBT derived by canonical engine from ebit/financial items or net result" : "No EBT found",
    });
    checks.push({
      name: "structural_acceptance",
      result: "PASS",
      details: acceptance.reason,
    });

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
        raw_line_count: allRows.length,
        normalized_line_count: candidates.length,
        column_basis_rule: "single",
      },
    };
  }

  // ── LEGACY FALLBACK (only when structural payload is absent) ──
  console.log("[DK_ECONOMIC_PNL_PDF][LEGACY] No structural payload, using text-based fallback");

  const parsed = parseEconomicPdfText(textContent);
  const { lines, metadata } = parsed;

  if (lines.length < 3) return null;

  const candidates: SemanticMetricCandidate[] = [];
  const lineItems: SemanticLineItem[] = [];
  const consumedFieldIds = new Set<string>();
  // A2 (18/9-2026): «Resultat før renter» er ikke længere en ebt-kilde (den er ebit) — før: [..., "resultat_foer_renter", ...]
    const ebtFieldIds = ["resultat_foer_skat", "resultat_foer_ekstraordinaere", "periodens_resultat", "arets_resultat"];
  let ebtConsumed = false;

  // A2 (18/9-2026): tekstvejen fik samme to regler som den strukturelle vej — anti_pattern
  // (før matchede «afskrivninger» «Resultat før afskrivninger») og konventionen (før gik
  // profit_like i forretningsformat gennem NEGATE og vendte fortegnet: Floren Engros' −49.089,83 blev +49.089,83).
  let legacyConvention: "credit" | "business" = "credit";
  const legacyRevenue = lines.find(l => /omsætning\s*(i alt|ialt)/i.test(l.name) && l.is_subtotal && l.period_amount !== null);
  if (legacyRevenue && legacyRevenue.period_amount !== null) {
    legacyConvention = legacyRevenue.period_amount >= 0 ? "business" : "credit";
  }

  for (const fieldDef of SEMANTIC_FIELD_MAP) {
    let match = lines.find(
      l => fieldDef.pattern.test(l.name) && (!fieldDef.anti_pattern || !fieldDef.anti_pattern.test(l.name)) && (!fieldDef.require_subtotal || l.is_subtotal)
    );
    // Vareforbrug (17/9-2026): kun subtotaler EFTER omsætningstotalen — undergrupper før den ligger inde i omsætningen (samme regel som strukturvejen).
    if (fieldDef.source_field_id === "direkte_omkostninger") {
      const omsLinje = candidates.find(c => c.source_field_id === "omsaetning");
      const omsIdx = omsLinje?.source_row_index ?? -1;
      const dbIdx = lines.findIndex((l, i) => i > omsIdx && l.is_subtotal && /dækningsbidrag/i.test(l.name));
      const efter = lines.filter((l, i) => i > omsIdx && (dbIdx < 0 || i < dbIdx) && l.is_subtotal && l.period_amount !== null && fieldDef.pattern.test(l.name));
      const total = efter.find(l => /^(vareforbrug|direkte omkostninger)\s*(i alt|ialt)$/i.test(l.name));
      if (total) match = total; else if (efter.length > 0) match = efter[efter.length - 1];
    }
    if (!match) continue;

    if (ebtFieldIds.includes(fieldDef.source_field_id)) {
      if (ebtConsumed && fieldDef.canonical_hint === "ebt") continue;
      if (fieldDef.canonical_hint === "ebt") ebtConsumed = true;
    }

    if (fieldDef.source_field_id === "periodens_resultat" && consumedFieldIds.has("periodens_resultat")) continue;
    if (consumedFieldIds.has(fieldDef.source_field_id)) continue;
    consumedFieldIds.add(fieldDef.source_field_id);

    let rawValue = match.period_amount;
    if (fieldDef.family === "profit_like" && rawValue !== null && legacyConvention === "business") {
      rawValue = -rawValue; // same rule as FIX B on the structural path
    }
    candidates.push({
      source_field_id: fieldDef.source_field_id,
      normalization_family: fieldDef.family,
      raw_value: rawValue,
      raw_sign: rawValue === null ? "zero" : rawValue < 0 ? "negative" : rawValue > 0 ? "positive" : "zero",
      sign_convention: "credit",
      source_label: match.name,
      source_row_index: lines.indexOf(match),
      source_column_slot: null,
      source_cell_address: null,
      basis: "period",
      confidence: "HIGH",
      evidence: [`[LEGACY] Matched label pattern: ${fieldDef.pattern.source}`, `Subtotal: ${match.is_subtotal}`, `Convention: ${legacyConvention}`],
      proposed_canonical_target: fieldDef.canonical_hint,
    });
  }

  efterbehandlPersonale(candidates);

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

  const checks: Array<{ name: string; result: "PASS" | "FAIL" | "SKIP"; details: string }> = [];
  const hasRevenue = candidates.some(c => c.source_field_id === "omsaetning");
  const hasEbt = candidates.some(c => c.proposed_canonical_target === "ebt");
  checks.push({ name: "revenue_present", result: hasRevenue ? "PASS" : "FAIL", details: hasRevenue ? "Revenue found" : "No revenue" });
  const ebtKanAfledes = candidates.some(c => c.proposed_canonical_target === "ebit" || c.proposed_canonical_target === "net_result");
  checks.push({ name: "ebt_present", result: hasEbt || ebtKanAfledes ? "PASS" : "FAIL", details: hasEbt ? "EBT found" : ebtKanAfledes ? "EBT derived by canonical engine" : "No EBT" });

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
      detection_score: 0,
      raw_line_count: lines.length,
      normalized_line_count: candidates.length,
      column_basis_rule: "single",
    },
  };
}

// ── Account-Range Structure Detection (global, not customer-specific) ──

/**
 * Detects e-conomic-style account numbering convention in PDF text.
 *
 * e-conomic convention:
 * - 1000-1999: Revenue
 * - 1300/2000-range: COGS / vareforbrug
 * - 2200-2999: Payroll (løn, gage, personal)
 * - 3000-3999: Opex (biler, lokale, salg, admin, forsikring)
 * - 4300-4400: Financial costs (rente, finans)
 *
 * Dinero convention (different):
 * - 2000-2999: COGS
 * - 3000-3999: Payroll
 * - 4000-4999: Sales costs
 *
 * Key differentiator: payroll in 2200-range (e-conomic) vs 3000-range (Dinero).
 *
 * @deprecated Use detectEconomicAccountRanges from economicRangeDetector.ts
 */
export function hasEconomicStyleAccountRanges(text: string): boolean {
  return detectEconomicAccountRanges(text).detected;
}

// ── Template Definition ──

export const dkEconomicResultatopgoerelsePdfV1: TemplateEntry & {
  extractSemantic: (structural: PdfStructuralPayload | null, textContent: string) => SemanticExtractionResult | null;
} = {
  template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1",
  label: "e-conomic Resultatopgørelse PDF (P&L only)",
  supported_file_types: ["pdf"],
  statement_type: "pnl",

  // ── Phase 5: Semantic extraction from structural payload (primary) or text (legacy fallback) ──
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

    // e-conomic-style account-range structure signal:
    // STRUCTURAL-FIRST: when structural payload is available, use structural tokens
    // for account range detection — immune to raw text formatting issues.
    const rangeResult = detectEconomicAccountRanges(text, undefined, ctx.structuralPayload);
    if (rangeResult.detected) {
      score += 20;
      console.log(`[DK_ECONOMIC_PNL_PDF] Economic range signal: +20 (${rangeResult.method}, ${rangeResult.evidence.join("; ")})`);
    }

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
    const adminLine = findByLabel(lines, /administration(s?omkostninger)?\b/i); // A: før /administration\b/i
    const renteindtLine = findByLabel(lines, /(renteindtægter|finansielle indtægter)\s*(i alt|ialt)/i);
    const renteudgLine = findByLabel(lines, /(renteudgifter|finansielle (omkostninger|udgifter)|finansieringsudgifter)\s*(i alt|ialt)/i);
    const afskrLine = findByLabel(lines, /afskrivninger/i, /resultat\s+før/i);
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
      finansielle_indtaegter: absVal(renteindtLine?.period_amount ?? null),
      finansielle_omkostninger: absVal(renteudgLine?.period_amount ?? null),
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
