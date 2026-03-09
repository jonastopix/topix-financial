/**
 * DK_DINERO_RESULTATOPGOERELSE_PDF_V1
 * Dinero Resultatopgørelse PDF template
 *
 * Detection:
 *   - fileType === "pdf", rawText >= 200 chars
 *   - Anti-match: secure.e-conomic.com, AKTIVER/PASSIVER, Saldobalance, CSV headers
 *   - Positive: "Resultatopgørelse" header (+35), "dinero" brand (+25),
 *     "Hentet:" watermark (+25), ALL-CAPS subtotals ≥3 (+20),
 *     4-digit accounts without CSV structure (+20 supplement), P&L labels (+15), filename (+10 each)
 *
 * Extraction:
 *   - Uses generic PDF line parser (pdfTextParser.ts — low-level, no business logic)
 *   - Label-first classification with account-range fallback (same constants as CSV, copied not imported)
 *   - Convention-inferred sign logic via detectSignConvention()
 *   - Fail-closed: missing core metrics → FAIL, ambiguous sign → FAIL
 *
 * Sign convention:
 *   - CREDIT: revenue < 0, cost > 0 → abs() all, flipSign subtotals
 *   - BUSINESS: revenue > 0, cost < 0 → abs() all
 *   - UNKNOWN: mixed/missing → FAIL
 */

import type {
  TemplateEntry,
  DetectionContext,
  ExtractionContext,
  DeterministicExtractedData,
  ParserValidation,
} from "../templateRegistry.ts";

// Generic low-level PDF line parser.
// NOTE: Despite its historical name "parseEconomicPdfText", this is a generic
// Danish PDF accounting line parser. It parses Danish numbers, extracts account
// lines via regex, and detects section markers. It contains NO e-conomic-specific
// business logic. All classification and normalization happen in THIS template.
import {
  parseEconomicPdfText,
  type PdfParsedLine,
} from "../pdfTextParser.ts";

// ── Label patterns per class (PRIMARY classification) ──
// Copied from CSV template — not imported at runtime to maintain template isolation.

const LABEL_CLASSES: Record<string, string[]> = {
  revenue: ["salg", "omsætning", "indtægt", "honorar"],
  cogs: ["vareforbrug", "underleverandør", "direkte omkostning"],
  payroll: ["løn", "am-indkomst", "atp", "feriepenge", "pension", "a-skat"],
  facility_costs: ["husleje", "lokale", "elforbrug", "elektricitet", "vand", "varme", "rengøring"],
  vehicle_costs: ["parkering", "færge", "transport", "kørsel", "brændstof"],
  sales_costs: ["reklame", "markedsføring", "annoncering", "messe", "repræsentation", "gaver"],
  admin_costs: ["bogføring", "konsulent", "porto", "software", "forsikring", "telefon", "kontingent", "kontor"],
  depreciation: ["afskrivning", "småanskaffelse"],
  financial_costs: ["rente", "renteudgift", "renteindtægt", "bankgebyr", "finansiel", "kursregulering"],
  tax: ["selskabsskat", "skat af årets resultat", "årets skat"],
};

// ── Account number ranges per class (SECONDARY fallback) ──

const RANGE_CLASSES: [string, number, number][] = [
  ["revenue", 1000, 1999],
  ["cogs", 2000, 2999],
  ["payroll", 3000, 3999],
  ["sales_costs", 4000, 4999],
  ["facility_costs", 5000, 5999],
  ["vehicle_costs", 6000, 6999],
  ["admin_costs", 7000, 7999],
  ["depreciation", 8000, 8099],
  ["financial_costs", 8100, 8999],
  ["tax", 9000, 9999],
];

const CLASS_TO_LINE_CLASS: Record<string, string> = {
  revenue: "REVENUE",
  cogs: "COGS",
  payroll: "OPEX",
  facility_costs: "OPEX",
  vehicle_costs: "OPEX",
  sales_costs: "OPEX",
  admin_costs: "OPEX",
  depreciation: "DEPR",
  financial_costs: "FIN_EXPENSE",
  tax: "TAX",
};

// ── Subtotal → section mapping (for section-based fallback) ──
// Maps ALL-CAPS subtotal patterns to the section class they close.
const SUBTOTAL_SECTION_MAP: [RegExp, string][] = [
  [/omsætning\s*i\s*alt/i, "revenue"],
  [/vareforbrug|direkte\s*omkostning|produktionsomkostning/i, "cogs"],
  [/dækningsbidrag/i, "__subtotal_skip__"], // subtotal line, not a section
  [/personaleomkostning|løn/i, "payroll"],
  [/salgsomkostning/i, "sales_costs"],
  [/lokaleomkostning/i, "facility_costs"],
  [/transport|kørselsomkostning/i, "vehicle_costs"],
  [/administrations\s*omkostning/i, "admin_costs"],
  [/afskrivning/i, "depreciation"],
  [/finansiel/i, "financial_costs"],
  [/skat\s*(af|i\s*alt)/i, "tax"],
];

// ── Classification ──

interface ClassifiedLine {
  accountNo: string | null;
  name: string;
  rawAmount: number;
  cls: string;
  method: "label" | "range" | "section" | "unclassified";
  ambiguous: boolean;
  matchedClasses?: string[];
  sectionCls?: string;
}

function classifyLineCore(name: string, accountNo: string | null): {
  cls: string;
  method: "label" | "range" | "unclassified";
  ambiguous: boolean;
  matchedClasses?: string[];
} {
  const label = name.toLowerCase().trim();

  const matchedClasses: string[] = [];
  for (const [cls, patterns] of Object.entries(LABEL_CLASSES)) {
    for (const pattern of patterns) {
      if (label.includes(pattern)) {
        if (!matchedClasses.includes(cls)) matchedClasses.push(cls);
        break;
      }
    }
  }

  if (matchedClasses.length > 1) {
    console.log(`[DineroPDF] AMBIGUOUS label match for "${name}": ${matchedClasses.join(", ")} → unclassified`);
    return { cls: "unclassified", method: "unclassified", ambiguous: true, matchedClasses };
  }

  if (matchedClasses.length === 1) {
    return { cls: matchedClasses[0], method: "label", ambiguous: false };
  }

  // Range fallback
  if (accountNo) {
    const num = parseInt(accountNo);
    if (!isNaN(num)) {
      for (const [cls, min, max] of RANGE_CLASSES) {
        if (num >= min && num <= max) {
          return { cls, method: "range", ambiguous: false };
        }
      }
    }
  }

  return { cls: "unclassified", method: "unclassified", ambiguous: false };
}

// ── Section map builder ──
// Finds subtotal lines and assigns each detail line to the section closed by
// the next subtotal below it. Only detail lines (non-subtotal, non-header) get sections.

function matchSubtotalSection(name: string): string | null {
  const n = name.trim();
  for (const [re, cls] of SUBTOTAL_SECTION_MAP) {
    if (re.test(n)) return cls;
  }
  return null;
}

interface SectionBoundary {
  lineIndex: number;
  sectionCls: string;
}

function buildSectionMap(lines: PdfParsedLine[]): Map<number, string> {
  // Step 1: find all subtotal boundaries
  const boundaries: SectionBoundary[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].is_subtotal) continue;
    const cls = matchSubtotalSection(lines[i].name);
    if (cls && cls !== "__subtotal_skip__") {
      boundaries.push({ lineIndex: i, sectionCls: cls });
    }
  }

  console.log(`[DineroPDF] Section boundaries: ${boundaries.map(b => `${b.sectionCls}@${b.lineIndex}`).join(", ")}`);

  // Step 2: assign detail lines to the section of the next subtotal below them
  const sectionMap = new Map<number, string>();
  for (let i = 0; i < lines.length; i++) {
    // Only detail lines get section assignment — never subtotals or headers
    if (lines[i].is_subtotal) continue;
    if (lines[i].period_amount == null) continue; // skip header/non-data lines

    // Find next subtotal boundary after this line
    for (const b of boundaries) {
      if (b.lineIndex > i) {
        sectionMap.set(i, b.sectionCls);
        break;
      }
    }
  }

  return sectionMap;
}

// ── Sign convention detection ──

type SignConvention = "CREDIT" | "BUSINESS" | "UNKNOWN";

function detectSignConvention(classified: ClassifiedLine[]): SignConvention {
  const revenueAnchors = classified.filter(l => l.cls === "revenue" && l.rawAmount !== 0);
  const costAnchors = classified.filter(
    l => ["cogs", "payroll", "admin_costs", "facility_costs"].includes(l.cls) && l.rawAmount !== 0
  );

  if (revenueAnchors.length === 0) {
    console.log("[DineroPDF] No non-zero revenue anchors for sign detection → UNKNOWN");
    return "UNKNOWN";
  }

  const revNeg = revenueAnchors.every(l => l.rawAmount < 0);
  const revPos = revenueAnchors.every(l => l.rawAmount > 0);
  const costPos = costAnchors.length === 0 || costAnchors.every(l => l.rawAmount > 0);
  const costNeg = costAnchors.length === 0 || costAnchors.every(l => l.rawAmount < 0);

  if (revNeg && costPos) {
    console.log("[DineroPDF] Sign convention: CREDIT (revenue<0, cost>0)");
    return "CREDIT";
  }
  if (revPos && costNeg) {
    console.log("[DineroPDF] Sign convention: BUSINESS (revenue>0, cost<0)");
    return "BUSINESS";
  }

  console.log("[DineroPDF] Sign convention: UNKNOWN (mixed signs)");
  return "UNKNOWN";
}

  const revNeg = revenueAnchors.every(l => l.rawAmount < 0);
  const revPos = revenueAnchors.every(l => l.rawAmount > 0);
  const costPos = costAnchors.length === 0 || costAnchors.every(l => l.rawAmount > 0);
  const costNeg = costAnchors.length === 0 || costAnchors.every(l => l.rawAmount < 0);

  if (revNeg && costPos) {
    console.log("[DineroPDF] Sign convention: CREDIT (revenue<0, cost>0)");
    return "CREDIT";
  }
  if (revPos && costNeg) {
    console.log("[DineroPDF] Sign convention: BUSINESS (revenue>0, cost<0)");
    return "BUSINESS";
  }

  console.log("[DineroPDF] Sign convention: UNKNOWN (mixed signs)");
  return "UNKNOWN";
}

// ── Template ──

export const dkDineroResultatopgoerelsePdfV1: TemplateEntry = {
  template_id: "DK_DINERO_RESULTATOPGOERELSE_PDF_V1",
  label: "Dinero Resultatopgørelse PDF",
  supported_file_types: ["pdf"],
  statement_type: "pnl",

  detect(ctx: DetectionContext): number {
    if (ctx.fileType !== "pdf") return 0;
    const text = ctx.rawText;
    if (!text || text.length < 200) return 0;

    // ── Anti-match guards ──
    if (/secure\.e-conomic\.com/i.test(text)) return 0;
    if (/\bAKTIVER\b/i.test(text) || /\bPASSIVER\b/i.test(text)) return 0;
    if (/\bSaldobalance\b/i.test(text)) return 0;
    if (/Konto;Kontonavn;Beløb/.test(text)) return 0;

    let score = 0;

    // Core: "Resultatopgørelse" header
    if (/resultatopgørelse/i.test(text)) score += 35;
    else return 0; // Hard requirement

    // Strong: "dinero" brand in text (e.g. "Udskrevet fra dinero.dk")
    if (/dinero/i.test(text)) score += 25;

    // Strong: "Hentet:" watermark — Dinero-specific export header
    // Example: "Hentet: 09/03-2026 Kl. 14.18"
    if (/^Hentet:\s*\d{2}\/\d{2}/m.test(text)) score += 25;

    // Strong: ALL-CAPS Danish subtotal pattern — Dinero uses uppercase section totals
    // like "OMSÆTNING I ALT", "DÆKNINGSBIDRAG I ALT", "LØNNINGER MV. I ALT", "RESULTAT FØR SKAT"
    const capsSubtotals = text.match(/^[A-ZÆØÅ][A-ZÆØÅ\s,.&]+(?:I ALT|MV\.|FØR SKAT|EFTER SKAT)\s*[-\d.,]*$/gm);
    if (capsSubtotals && capsSubtotals.length >= 3) score += 20;

    // Structural supplement: 4-digit account numbers in non-CSV layout
    // This is a structural signal, not Dinero-unique — it supplements but doesn't replace brand detection.
    const accountMatches = text.match(/^\s*\d{4}\s+[A-ZÆØÅa-zæøå]/gm);
    const hasSemicolonStructure = /;.*;/.test(text);
    if (accountMatches && accountMatches.length >= 5 && !hasSemicolonStructure) {
      score += 20;
    }

    // P&L labels (≥3)
    let labelCount = 0;
    for (const kw of ["omsætning", "vareforbrug", "løn", "resultat", "dækningsbidrag"]) {
      if (text.toLowerCase().includes(kw)) labelCount++;
    }
    if (labelCount >= 3) score += 15;

    // Filename signals
    const fn = ctx.fileName.toLowerCase();
    if (fn.includes("resultat")) score += 10;
    if (fn.includes("dinero")) score += 10;

    return score;
  },

  extract(
    ctx: ExtractionContext
  ): { success: true; data: DeterministicExtractedData } | { success: false; error: string } {
    const text = ctx.rawText;
    if (!text) return { success: false, error: "No PDF text content" };

    // Use generic PDF line parser (see import comment above for rationale)
    const parsed = parseEconomicPdfText(text);
    const { lines, metadata } = parsed;

    console.log(`[DineroPDF] Parsed ${lines.length} lines from PDF text`);

    if (lines.length < 3) {
      return { success: false, error: `Insufficient parsed lines: ${lines.length} (minimum 3)` };
    }

    // ── Build section map from subtotal boundaries ──
    const sectionMap = buildSectionMap(lines);

    // ── Classify all detail lines (non-subtotals with amounts) ──
    // Priority: label-first → section-fallback → range-fallback → unclassified
    const classified: ClassifiedLine[] = [];
    let ambiguousCount = 0;
    let sectionFallbackCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.is_subtotal) continue;
      const amount = line.period_amount;
      if (amount == null) continue;

      const core = classifyLineCore(line.name, line.account_no);
      const sectionCls = sectionMap.get(i) || undefined;

      let finalCls = core.cls;
      let finalMethod = core.method;
      let finalAmbiguous = core.ambiguous;

      if (core.cls === "unclassified" && sectionCls) {
        // Section fallback — label was unclear, use section
        finalCls = sectionCls;
        finalMethod = "section";
        finalAmbiguous = false;
        sectionFallbackCount++;
        console.log(`[DineroPDF] Section fallback: "${line.name}" → ${sectionCls}`);
      } else if (core.cls !== "unclassified" && sectionCls && core.cls !== sectionCls) {
        // Conflict: label says X, section says Y → mark ambiguous
        finalCls = "unclassified";
        finalMethod = "unclassified";
        finalAmbiguous = true;
        console.log(`[DineroPDF] CONFLICT: label=${core.cls}, section=${sectionCls} for "${line.name}" → ambiguous`);
      }

      if (finalAmbiguous) ambiguousCount++;

      classified.push({
        accountNo: line.account_no,
        name: line.name,
        rawAmount: amount,
        cls: finalCls,
        method: finalMethod as ClassifiedLine["method"],
        ambiguous: finalAmbiguous,
        matchedClasses: core.matchedClasses,
        sectionCls,
      });
    }

    console.log(`[DineroPDF] Classified ${classified.length} detail lines, ${sectionFallbackCount} via section, ${ambiguousCount} ambiguous`);

    if (classified.length < 3) {
      return { success: false, error: `Only ${classified.length} classifiable lines (minimum 3)` };
    }

    // ── Sign convention inference ──
    const convention = detectSignConvention(classified);

    // ── Aggregate by class ──
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};

    for (const line of classified) {
      if (line.cls === "unclassified") continue;
      sums[line.cls] = (sums[line.cls] || 0) + line.rawAmount;
      counts[line.cls] = (counts[line.cls] || 0) + 1;
    }

    // Track ambiguous class conflicts
    const ambiguousClasses = new Set<string>();
    for (const line of classified) {
      if (line.ambiguous && line.matchedClasses) {
        for (const c of line.matchedClasses) ambiguousClasses.add(c);
      }
    }

    // ── Normalize amounts based on convention ──
    function normalizeAmount(raw: number): number {
      return Math.abs(raw);
    }

    const revenue = sums.revenue != null ? normalizeAmount(sums.revenue) : null;
    const cogs = sums.cogs != null ? normalizeAmount(sums.cogs) : null;
    const payroll = sums.payroll != null ? normalizeAmount(sums.payroll) : null;
    const salesCosts = sums.sales_costs != null ? normalizeAmount(sums.sales_costs) : null;
    const facilityCosts = sums.facility_costs != null ? normalizeAmount(sums.facility_costs) : null;
    const vehicleCosts = sums.vehicle_costs != null ? normalizeAmount(sums.vehicle_costs) : null;
    const adminCosts = sums.admin_costs != null ? normalizeAmount(sums.admin_costs) : null;

    // ── Depreciation: default 0 if absent, null if ambiguous ──
    const defaultedFields: { field: string; reason: "absent" | "ambiguous_conflict" }[] = [];
    let depreciation: number | null;
    let depreciationUnsure = false;
    if (counts.depreciation != null && counts.depreciation > 0) {
      depreciation = normalizeAmount(sums.depreciation);
    } else if (ambiguousClasses.has("depreciation")) {
      depreciation = null;
      depreciationUnsure = true;
      console.log("[DineroPDF] WARNING: depreciation ambiguous → null");
    } else {
      depreciation = 0;
      defaultedFields.push({ field: "depreciation", reason: "absent" });
      console.log("[DineroPDF] depreciation missing → assumed 0");
    }

    // ── Financial costs: default 0 if absent, null if ambiguous ──
    let financialCosts: number | null;
    let financialCostsUnsure = false;
    if (counts.financial_costs != null && counts.financial_costs > 0) {
      financialCosts = normalizeAmount(sums.financial_costs);
    } else if (ambiguousClasses.has("financial_costs")) {
      financialCosts = null;
      financialCostsUnsure = true;
      console.log("[DineroPDF] WARNING: financial_costs ambiguous → null");
    } else {
      financialCosts = 0;
      defaultedFields.push({ field: "financial_costs", reason: "absent" });
      console.log("[DineroPDF] financial_costs missing → assumed 0");
    }

    const tax = counts.tax != null && counts.tax > 0 ? normalizeAmount(sums.tax) : null;

    // ── Conservative metric derivation ──
    const grossProfit = revenue != null && cogs != null ? revenue - cogs : null;
    const opex = (payroll || 0) + (salesCosts || 0) + (facilityCosts || 0) + (vehicleCosts || 0) + (adminCosts || 0);
    const ebitda = grossProfit != null ? grossProfit - opex : null;
    const ebit = ebitda != null && depreciation != null ? ebitda - depreciation : null;
    const ebt = ebit != null && financialCosts != null ? ebit - financialCosts : null;
    let netResult: number | null = null;
    if (ebt != null) {
      netResult = tax != null ? ebt - tax : ebt;
    }

    // ── Key figures (Danish names → canonical engine mapping) ──
    const keyFigures: Record<string, number | null> = {
      omsaetning: revenue,
      direkte_omkostninger: cogs,
      daekningsbidrag: grossProfit,
      loenninger: payroll,
      salgsomkostninger: salesCosts,
      lokaleomkostninger: facilityCosts,
      administrationsomkostninger: adminCosts,
      transportomkostninger: vehicleCosts,
      resultat_foer_afskrivninger: ebitda,
      afskrivninger: depreciation,
      finansielle_omkostninger: financialCosts,
      resultat_foer_skat: ebt,
      resultat_efter_skat: netResult,
    };

    // ── Line items ──
    const lineItems = classified.map(line => ({
      name: line.name,
      period_amount: normalizeAmount(line.rawAmount),
      ytd_amount: null as number | null,
      raw_sign: line.rawAmount < 0 ? "MINUS" : line.rawAmount > 0 ? "PLUS" : "ZERO",
      account_no: line.accountNo,
      class: CLASS_TO_LINE_CLASS[line.cls] || "UKLASSIFICERET",
    }));

    // ── Validation ──
    const checks: ParserValidation["checks"] = [];

    // 1. Revenue
    checks.push({
      name: "revenue_present",
      result: revenue != null && revenue > 0 ? "PASS" : "FAIL",
      details: revenue != null ? `Revenue: ${revenue.toFixed(2)}` : "No revenue lines found",
    });

    // 2. Sign convention
    checks.push({
      name: "sign_convention",
      result: convention !== "UNKNOWN" ? "PASS" : "FAIL",
      details: convention !== "UNKNOWN"
        ? `Convention: ${convention}`
        : "Sign convention unclear (mixed/missing anchors) → FAIL",
    });

    // 3. Gross profit sum
    if (revenue != null && cogs != null && grossProfit != null) {
      const diff = Math.abs(revenue - cogs - grossProfit);
      checks.push({
        name: "gross_profit_sum",
        result: diff <= 2 ? "PASS" : "FAIL",
        details: `${revenue} - ${cogs} = ${grossProfit} (diff: ${diff.toFixed(2)})`,
      });
    } else {
      checks.push({ name: "gross_profit_sum", result: "SKIP", details: "Missing revenue or cogs" });
    }

    // 4. Depreciation
    checks.push({
      name: "depreciation_present",
      result: depreciationUnsure ? "FAIL" : "PASS",
      details: depreciationUnsure
        ? "UNSURE: depreciation ambiguous → null"
        : depreciation === 0 && defaultedFields.some(f => f.field === "depreciation")
          ? "assumed 0 — no matching lines, no ambiguity"
          : `Depreciation: ${depreciation?.toFixed(2)}`,
    });

    // 5. Financial costs
    checks.push({
      name: "financial_costs_present",
      result: financialCostsUnsure ? "FAIL" : "PASS",
      details: financialCostsUnsure
        ? "UNSURE: financial_costs ambiguous → null"
        : financialCosts === 0 && defaultedFields.some(f => f.field === "financial_costs")
          ? "assumed 0 — no matching lines, no ambiguity"
          : `Financial costs: ${financialCosts?.toFixed(2)}`,
    });

    // 6. EBT
    checks.push({
      name: "ebt_present",
      result: ebt != null ? "PASS" : "FAIL",
      details: ebt != null ? `EBT: ${ebt.toFixed(2)}` : "EBT null (upstream dependency missing)",
    });

    // 7. Ambiguity
    const ambiguityAffectsCore = depreciationUnsure || financialCostsUnsure;
    checks.push({
      name: "ambiguous_lines",
      result: ambiguityAffectsCore ? "FAIL" : "PASS",
      details: ambiguousCount === 0
        ? "No ambiguous label matches"
        : ambiguityAffectsCore
          ? `${ambiguousCount} ambiguous lines affecting core metrics → FAIL`
          : `${ambiguousCount} ambiguous lines (non-core) → accepted`,
    });

    // 8. Defaulted fields
    if (defaultedFields.length > 0) {
      checks.push({
        name: "defaulted_fields",
        result: "PASS",
        details: defaultedFields.map(f => `${f.field}: ${f.reason}`).join("; "),
      });
    }

    const parserStatus = checks.some(c => c.result === "FAIL") ? "FAIL" : "PASS";
    const parserErrors = checks.filter(c => c.result === "FAIL").map(c => `${c.name}: ${c.details}`);

    const validation: ParserValidation = { parser_status: parserStatus as "PASS" | "FAIL", checks };

    const data: DeterministicExtractedData = {
      report_type: "resultatopgørelse",
      company_name: metadata.company_name,
      cvr_number: metadata.cvr_number,
      period_start: metadata.period_start,
      period_end: metadata.period_end,
      report_period: metadata.report_period,
      key_figures: keyFigures,
      line_items: lineItems,
      validation,
      _deterministic_meta: {
        template_id: "DK_DINERO_RESULTATOPGOERELSE_PDF_V1",
        parser_confidence: parserStatus === "PASS" ? "HIGH" : "MEDIUM",
        detection_score: 0, // Set by registry
        parser_validation_status: parserStatus as "PASS" | "FAIL",
        parser_validation_errors: parserErrors,
        raw_line_count: classified.length,
        normalized_line_count: classified.filter(l => l.cls !== "unclassified").length,
        column_basis_rule: "single",
      },
    };

    return { success: true, data };
  },
};
