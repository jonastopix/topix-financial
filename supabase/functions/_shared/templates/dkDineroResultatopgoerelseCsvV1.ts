/**
 * DK_DINERO_RESULTATOPGOERELSE_V1
 * Dinero Resultatopgørelse CSV template
 *
 * - Semicolon-separated CSV with header: Konto;Kontonavn;Beløb
 * - Bookkeeping sign convention (revenue negative/credit, expenses positive/debit)
 * - Label-first classification with account-range fallback
 * - Ambiguity detection: lines matching 2+ classes → unclassified + logged
 * - Conservative metric derivation (no sum-all-lines shortcuts)
 *
 * Phase 7: Added extractSemanticFromCsv() — structural-first semantic path.
 */

import type {
  TemplateEntry,
  SemanticCsvTemplateEntry,
  DetectionContext,
  ExtractionContext,
  DeterministicExtractedData,
  ParserValidation,
} from "../templateRegistry.ts";
import type { CsvParseResult } from "../csvRawParser.ts";
import type {
  SemanticExtractionResult,
  SemanticMetricCandidate,
  SemanticLineItem,
} from "../semanticTypes.ts";
import type { MetricFamily } from "../normalizationProfiles.ts";

// ── Label patterns per class (PRIMARY classification) ──

const LABEL_CLASSES: Record<string, string[]> = {
  revenue: ["salg", "omsætning", "indtægt", "honorar"],
  cogs: ["vareforbrug", "direkte omkostning"],
  payroll: ["løn", "am-indkomst", "atp", "feriepenge", "pension", "a-skat"],
  facility_costs: ["husleje", "lokale", "elforbrug", "elektricitet", "vand", "varme", "rengøring"],
  vehicle_costs: ["parkering", "færge", "transport", "kørsel", "brændstof"],
  sales_costs: ["reklame", "markedsføring", "annoncering", "messe", "repræsentation", "gaver"],
  admin_costs: ["bogføring", "konsulent", "porto", "software", "forsikring", "telefon", "kontingent", "kontor", "fremmed arbejde", "underleverandør"],
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

// ── Canonical class → line_items class constant ──

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

// ── Class → normalization family mapping ──

const CLASS_TO_FAMILY: Record<string, MetricFamily> = {
  revenue: "revenue_like",
  cogs: "cost_like",
  payroll: "cost_like",
  facility_costs: "cost_like",
  vehicle_costs: "cost_like",
  sales_costs: "cost_like",
  admin_costs: "cost_like",
  depreciation: "cost_like",
  financial_costs: "cost_like",
  tax: "cost_like",
};

// ── Class → semantic source_field_id mapping ──

const CLASS_TO_FIELD_ID: Record<string, string> = {
  revenue: "omsaetning",
  cogs: "direkte_omkostninger",
  payroll: "loenninger",
  facility_costs: "lokaleomkostninger",
  vehicle_costs: "transportomkostninger",
  sales_costs: "salgsomkostninger",
  admin_costs: "administrationsomkostninger",
  depreciation: "afskrivninger",
  financial_costs: "finansielle_omkostninger",
  tax: "skat",
};

// ── Parse Danish number format ──

function parseDanishAmount(s: string): number | null {
  if (!s || s.trim() === "") return null;
  // Remove thousand separators (dots), replace decimal comma with dot
  const cleaned = s.trim().replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ── Classify a single line ──

interface ClassifiedLine {
  kontonr: number | null;
  kontonavn: string;
  rawAmount: number;
  cls: string;
  method: "label" | "range" | "unclassified";
  ambiguous: boolean;
  matchedClasses?: string[];
}

function classifyLine(kontonavn: string, kontonr: number | null): {
  cls: string;
  method: "label" | "range" | "unclassified";
  ambiguous: boolean;
  matchedClasses?: string[];
} {
  const label = kontonavn.toLowerCase().trim();

  // Primary: label matching — find ALL matching classes
  const matchedClasses: string[] = [];
  for (const [cls, patterns] of Object.entries(LABEL_CLASSES)) {
    for (const pattern of patterns) {
      if (label.includes(pattern)) {
        if (!matchedClasses.includes(cls)) matchedClasses.push(cls);
        break; // Don't double-count same class from multiple patterns
      }
    }
  }

  if (matchedClasses.length > 1) {
    console.log(
      `[Dinero] AMBIGUOUS label match for "${kontonavn}": ${matchedClasses.join(", ")} → unclassified`
    );
    return { cls: "unclassified", method: "unclassified", ambiguous: true, matchedClasses };
  }

  if (matchedClasses.length === 1) {
    return { cls: matchedClasses[0], method: "label", ambiguous: false };
  }

  // Secondary: range fallback
  if (kontonr != null) {
    for (const [cls, min, max] of RANGE_CLASSES) {
      if (kontonr >= min && kontonr <= max) {
        return { cls, method: "range", ambiguous: false };
      }
    }
  }

  return { cls: "unclassified", method: "unclassified", ambiguous: false };
}

// ── Template ──

export const dkDineroResultatopgoerelseCsvV1: SemanticCsvTemplateEntry = {
  template_id: "DK_DINERO_RESULTATOPGOERELSE_V1",
  label: "Dinero Resultatopgørelse CSV",
  supported_file_types: ["csv"],
  statement_type: "pnl",

  detect(ctx: DetectionContext): number {
    if (ctx.fileType !== "csv") return 0;

    let score = 0;

    // ── Structural CSV detection (preferred when csvHeaders available) ──
    if (ctx.csvHeaders && ctx.csvHeaders.length > 0) {
      // Hard requirement: headers must match exactly
      const headersMatch =
        ctx.csvHeaders.length >= 3 &&
        ctx.csvHeaders[0]?.trim() === "Konto" &&
        ctx.csvHeaders[1]?.trim() === "Kontonavn" &&
        ctx.csvHeaders[2]?.trim() === "Beløb";
      if (!headersMatch) return 0;
      score += 40;

      // Delimiter evidence
      if (ctx.csvDelimiter === ";") score += 10;

      // Filename
      const fn = ctx.fileName.toLowerCase();
      if (fn.includes("resultat")) score += 20;
      if (fn.includes("balance")) return 0;
      score += 10; // Passed anti-match

      // Label recognition from structural headerRows (built from CsvParseResult rows)
      let recognizedCount = 0;
      for (const row of (ctx.headerRows || [])) {
        const kontonavn = ((row[1] ?? "") as string).toLowerCase().trim();
        if (!kontonavn) continue;
        for (const patterns of Object.values(LABEL_CLASSES)) {
          if (patterns.some((p) => kontonavn.includes(p))) {
            recognizedCount++;
            break;
          }
        }
      }
      if (recognizedCount >= 5) score += 15;

      return score;
    }

    // ── Legacy raw-text detection (for non-migrated callers) ──
    const text = ctx.rawText;
    if (!text) return 0;

    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, ""));

    // Hard requirement: header must match exactly
    const headerLine = lines[0]?.trim();
    if (headerLine !== "Konto;Kontonavn;Beløb") return 0;
    score += 40;

    // Semicolon separator in >= 3 data lines
    const semiLines = lines.slice(1).filter((l) => l.includes(";")).length;
    if (semiLines >= 3) score += 10;

    // Filename: must contain "resultat" (case-insensitive)
    const fn = ctx.fileName.toLowerCase();
    if (fn.includes("resultat")) score += 20;

    // Filename: must NOT contain "balance" or "saldobalance" (anti-match)
    if (fn.includes("balance")) return 0;
    score += 10; // Passed anti-match

    // Label recognition: 5+ lines with known Danish accounting labels
    let recognizedCount = 0;
    for (const line of lines.slice(1)) {
      const parts = line.split(";");
      if (parts.length < 3) continue;
      const kontonavn = parts[1]?.toLowerCase().trim() || "";
      for (const patterns of Object.values(LABEL_CLASSES)) {
        if (patterns.some((p) => kontonavn.includes(p))) {
          recognizedCount++;
          break;
        }
      }
    }
    if (recognizedCount >= 5) score += 15;

    return score;
  },

  extract(
    ctx: ExtractionContext
  ): { success: true; data: DeterministicExtractedData } | { success: false; error: string } {
    const text = ctx.rawText;
    if (!text) return { success: false, error: "No CSV text content" };

    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, ""));

    // Skip header
    const dataLines = lines.slice(1).filter((l) => l.trim().length > 0);

    // Parse and classify each line
    const classified: ClassifiedLine[] = [];
    let ambiguousCount = 0;

    for (const line of dataLines) {
      const parts = line.split(";");
      if (parts.length < 3) continue;

      const kontonrStr = parts[0]?.trim() || "";
      const kontonavn = parts[1]?.trim() || "";
      const amountStr = parts[2]?.trim() || "";

      const kontonr = /^\d{4}$/.test(kontonrStr) ? parseInt(kontonrStr) : null;
      const rawAmount = parseDanishAmount(amountStr);

      if (kontonr == null || rawAmount == null) continue;

      const classification = classifyLine(kontonavn, kontonr);
      if (classification.ambiguous) ambiguousCount++;

      classified.push({
        kontonr,
        kontonavn,
        rawAmount,
        ...classification,
      });
    }

    console.log(
      `[Dinero] Parsed ${classified.length} lines, ${ambiguousCount} ambiguous`
    );

    // Structural fail: less than 3 valid account lines
    if (classified.length < 3) {
      return { success: false, error: `Only ${classified.length} valid lines (minimum 3)` };
    }

    // ── Sign convention check ──
    const revenueLines = classified.filter((l) => l.cls === "revenue");
    const nonZeroRevenue = revenueLines.filter((l) => l.rawAmount !== 0);
    let signConventionOk = true;

    if (nonZeroRevenue.length > 0) {
      const hasNegativeRevenue = nonZeroRevenue.some((l) => l.rawAmount < 0);
      if (!hasNegativeRevenue) {
        signConventionOk = false;
        console.log("[Dinero] Sign convention FAIL: no negative revenue found");
      }
    }
    // If all revenue is 0, skip convention check (no revenue this period)

    // ── Aggregate metrics by class ──
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};

    for (const line of classified) {
      if (line.cls === "unclassified") continue;
      sums[line.cls] = (sums[line.cls] || 0) + line.rawAmount;
      counts[line.cls] = (counts[line.cls] || 0) + 1;
    }

    // Track which ambiguous lines could have affected specific classes
    const ambiguousClasses = new Set<string>();
    for (const line of classified) {
      if (line.ambiguous && line.matchedClasses) {
        for (const c of line.matchedClasses) ambiguousClasses.add(c);
      }
    }

    // Track defaulted-to-zero fields and their reason
    const defaultedFields: { field: string; reason: "absent" | "ambiguous_conflict" }[] = [];

    // Revenue: abs() to normalize from credit (negative) to positive
    const revenue = sums.revenue != null ? Math.abs(sums.revenue) : null;
    const cogs = sums.cogs != null ? Math.abs(sums.cogs) : null;
    const payroll = sums.payroll != null ? Math.abs(sums.payroll) : null;
    const salesCosts = sums.sales_costs != null ? Math.abs(sums.sales_costs) : null;
    const facilityCosts = sums.facility_costs != null ? Math.abs(sums.facility_costs) : null;
    const vehicleCosts = sums.vehicle_costs != null ? Math.abs(sums.vehicle_costs) : null;
    const adminCosts = sums.admin_costs != null ? Math.abs(sums.admin_costs) : null;

    // ── Depreciation: default 0 ONLY if truly absent, null if ambiguous ──
    let depreciation: number | null;
    let depreciationUnsure = false;
    if (counts.depreciation != null && counts.depreciation > 0) {
      depreciation = Math.abs(sums.depreciation);
    } else if (ambiguousClasses.has("depreciation")) {
      depreciation = null;
      depreciationUnsure = true;
      console.log("[Dinero] WARNING: depreciation ambiguous → null (not defaulted)");
    } else {
      depreciation = 0;
      defaultedFields.push({ field: "depreciation", reason: "absent" });
      console.log("[Dinero] depreciation missing → assumed 0 (no matching lines, no ambiguity)");
    }

    // ── Financial costs: default 0 ONLY if truly absent, null if ambiguous ──
    let financialCosts: number | null;
    let financialCostsUnsure = false;
    if (counts.financial_costs != null && counts.financial_costs > 0) {
      financialCosts = Math.abs(sums.financial_costs);
    } else if (ambiguousClasses.has("financial_costs")) {
      financialCosts = null;
      financialCostsUnsure = true;
      console.log("[Dinero] WARNING: financial_costs ambiguous → null (not defaulted)");
    } else {
      financialCosts = 0;
      defaultedFields.push({ field: "financial_costs", reason: "absent" });
      console.log("[Dinero] financial_costs missing → assumed 0 (no matching lines, no ambiguity)");
    }

    // Tax: null if no lines matched (acceptable — net_result = ebt)
    const tax =
      counts.tax != null && counts.tax > 0 ? Math.abs(sums.tax) : null;

    // ── Conservative metric derivation ──
    const grossProfit = revenue != null && cogs != null ? revenue - cogs : null;

    const opex =
      (payroll || 0) +
      (salesCosts || 0) +
      (facilityCosts || 0) +
      (vehicleCosts || 0) +
      (adminCosts || 0);
    const ebitda = grossProfit != null ? grossProfit - opex : null;

    const ebit =
      ebitda != null && depreciation != null ? ebitda - depreciation : null;

    // EBT: only derivable if ebit and financialCosts are both known
    const ebt =
      ebit != null && financialCosts != null ? ebit - financialCosts : null;

    // net_result: null if ebt null; ebt if tax null (acceptable); ebt - tax if both known
    let netResult: number | null = null;
    if (ebt != null) {
      netResult = tax != null ? ebt - tax : ebt;
    }

    // ── Build key_figures (Danish names for canonical engine mapping) ──
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

    // ── Build line_items ──
    const lineItems = classified.map((line) => ({
      name: line.kontonavn,
      period_amount:
        line.cls === "revenue" ? Math.abs(line.rawAmount) : Math.abs(line.rawAmount),
      ytd_amount: null as number | null,
      raw_sign: line.rawAmount < 0 ? "MINUS" : line.rawAmount > 0 ? "PLUS" : "ZERO",
      account_no: line.kontonr?.toString() || null,
      class: CLASS_TO_LINE_CLASS[line.cls] || "UKLASSIFICERET",
    }));

    // ── Validation checks ──
    const checks: ParserValidation["checks"] = [];

    // 1. Revenue present
    checks.push({
      name: "revenue_present",
      result: revenue != null && revenue > 0 ? "PASS" : "FAIL",
      details:
        revenue != null
          ? `Revenue: ${revenue.toFixed(2)}`
          : "No revenue lines found",
    });

    // 2. Sign convention
    checks.push({
      name: "sign_convention",
      result: signConventionOk ? "PASS" : "FAIL",
      details: signConventionOk
        ? "Bookkeeping convention confirmed (negative revenue)"
        : "Sign convention unclear: no negative revenue found",
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
      checks.push({
        name: "gross_profit_sum",
        result: "SKIP",
        details: "Missing revenue or cogs",
      });
    }

    // 4. Depreciation status
    checks.push({
      name: "depreciation_present",
      result: depreciationUnsure ? "FAIL" : "PASS",
      details: depreciationUnsure
        ? "UNSURE: depreciation ambiguous due to label conflict → null (not defaulted)"
        : depreciation === 0 && defaultedFields.some(f => f.field === "depreciation")
          ? "assumed 0 — no depreciation lines found, no ambiguity"
          : `Depreciation: ${depreciation?.toFixed(2)}`,
    });

    // 5. Financial costs status
    checks.push({
      name: "financial_costs_present",
      result: financialCostsUnsure ? "FAIL" : "PASS",
      details: financialCostsUnsure
        ? "UNSURE: financial_costs ambiguous due to label conflict → null (not defaulted)"
        : financialCosts === 0 && defaultedFields.some(f => f.field === "financial_costs")
          ? "assumed 0 — no financial cost lines found, no ambiguity"
          : `Financial costs: ${financialCosts?.toFixed(2)}`,
    });

    // 6. EBT present
    checks.push({
      name: "ebt_present",
      result: ebt != null ? "PASS" : "FAIL",
      details:
        ebt != null
          ? `EBT: ${ebt.toFixed(2)}`
          : "EBT is null (upstream dependency missing due to ambiguity)",
    });

    // 7. Ambiguous lines — warning, not blocking unless affecting core derived metrics
    const ambiguityAffectsCore = depreciationUnsure || financialCostsUnsure;
    checks.push({
      name: "ambiguous_lines",
      result: ambiguityAffectsCore ? "FAIL" : (ambiguousCount > 0 ? "PASS" : "PASS"),
      details:
        ambiguousCount === 0
          ? "No ambiguous label matches"
          : ambiguityAffectsCore
            ? `${ambiguousCount} ambiguous lines affecting core metrics (depreciation/financial_costs) → FAIL`
            : `${ambiguousCount} ambiguous lines (non-core only) → accepted`,
    });

    // 8. Defaulted fields summary
    if (defaultedFields.length > 0) {
      checks.push({
        name: "defaulted_fields",
        result: "PASS",
        details: defaultedFields.map(f => `${f.field}: ${f.reason}`).join("; "),
      });
    }

    const parserStatus =
      checks.some((c) => c.result === "FAIL") ? "FAIL" : "PASS";
    const parserErrors = checks
      .filter((c) => c.result === "FAIL")
      .map((c) => `${c.name}: ${c.details}`);

    const validation: ParserValidation = {
      parser_status: parserStatus as "PASS" | "FAIL",
      checks,
    };

    // ── Build output ──
    const data: DeterministicExtractedData = {
      report_type: "resultatopgørelse",
      company_name: null, // Not available in Dinero CSV
      cvr_number: null,
      period_start: null,
      period_end: null,
      report_period: null,
      key_figures: keyFigures,
      line_items: lineItems,
      validation,
      _deterministic_meta: {
        template_id: "DK_DINERO_RESULTATOPGOERELSE_V1",
        parser_confidence: parserStatus === "PASS" ? "HIGH" : "MEDIUM",
        detection_score: 0, // Set by registry
        parser_validation_status: parserStatus as "PASS" | "FAIL",
        parser_validation_errors: parserErrors,
        raw_line_count: classified.length,
        normalized_line_count: classified.filter((l) => l.cls !== "unclassified").length,
        column_basis_rule: "single",
      },
    };

    return { success: true, data };
  },

  // ── Phase 7: Semantic CSV Extraction (structural-first) ──
  extractSemanticFromCsv(csvResult: CsvParseResult): SemanticExtractionResult | null {
    // Consume CsvParseResult only — no raw csvText parsing
    if (csvResult.total_rows < 3) return null;

    // Verify expected structure: 3 columns (Konto, Kontonavn, Beløb)
    if (csvResult.headers.length < 3) {
      console.log("[Dinero Semantic CSV] Insufficient columns → reject");
      return null;
    }

    // ── Parse and classify each row from structural model ──
    const classified: ClassifiedLine[] = [];
    let ambiguousCount = 0;

    for (const row of csvResult.rows) {
      if (row.cells.length < 3) continue;

      const kontonrStr = row.cells[0].raw_value.trim();
      const kontonavn = row.cells[1].raw_value.trim();
      const amountStr = row.cells[2].raw_value.trim();

      const kontonr = /^\d{4}$/.test(kontonrStr) ? parseInt(kontonrStr) : null;
      const rawAmount = parseDanishAmount(amountStr);

      if (kontonr == null || rawAmount == null) continue;

      const classification = classifyLine(kontonavn, kontonr);
      if (classification.ambiguous) ambiguousCount++;

      classified.push({
        kontonr,
        kontonavn,
        rawAmount,
        ...classification,
      });
    }

    console.log(`[Dinero Semantic CSV] Parsed ${classified.length} lines, ${ambiguousCount} ambiguous`);

    if (classified.length < 3) {
      console.log("[Dinero Semantic CSV] Insufficient valid lines → reject");
      return null;
    }

    // ── Aggregate raw sums per class — preserving document signs ──
    // No Math.abs(), no sign transformation — raw document convention
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};

    for (const line of classified) {
      if (line.cls === "unclassified") continue;
      sums[line.cls] = (sums[line.cls] || 0) + line.rawAmount;
      counts[line.cls] = (counts[line.cls] || 0) + 1;
    }

    // ── Sign convention evidence ──
    const revenueLines = classified.filter((l) => l.cls === "revenue");
    const nonZeroRevenue = revenueLines.filter((l) => l.rawAmount !== 0);
    const hasNegativeRevenue = nonZeroRevenue.some((l) => l.rawAmount < 0);

    // ── Build SemanticMetricCandidates (one per classified class) ──
    const metricCandidates: SemanticMetricCandidate[] = [];

    for (const [cls, rawSum] of Object.entries(sums)) {
      const fieldId = CLASS_TO_FIELD_ID[cls];
      const family = CLASS_TO_FAMILY[cls];
      if (!fieldId || !family) continue;

      // Raw value preserves document sign convention (negative revenue, positive costs)
      metricCandidates.push({
        source_field_id: fieldId,
        normalization_family: family,
        raw_value: rawSum,
        raw_sign: rawSum < 0 ? "negative" : rawSum > 0 ? "positive" : "zero",
        sign_convention: "credit",
        source_label: `${cls} (aggregated ${counts[cls]} lines)`,
        source_row_index: null,
        source_column_slot: 2, // Beløb column
        source_cell_address: null,
        basis: "period",
        confidence: ambiguousCount > 0 ? "MEDIUM" : "HIGH",
        evidence: [`${counts[cls]} lines classified as ${cls}`],
        proposed_canonical_target: null, // Advisory only, NOT used
      });
    }

    // ── Default-zero candidates for absent non-ambiguous fields ──
    // Matches legacy behavior: if no lines classified as depreciation/financial_costs
    // AND no ambiguity affecting those classes, emit raw_value=0 so derivations work.
    const ambiguousClasses = new Set<string>();
    for (const line of classified) {
      if (line.ambiguous && line.matchedClasses) {
        for (const c of line.matchedClasses) ambiguousClasses.add(c);
      }
    }

    const defaultZeroClasses = ["depreciation", "financial_costs"];
    for (const cls of defaultZeroClasses) {
      if (counts[cls] == null && !ambiguousClasses.has(cls)) {
        const fieldId = CLASS_TO_FIELD_ID[cls];
        const family = CLASS_TO_FAMILY[cls];
        if (fieldId && family) {
          metricCandidates.push({
            source_field_id: fieldId,
            normalization_family: family,
            raw_value: 0,
            raw_sign: "zero",
            sign_convention: "credit",
            source_label: `${cls} (defaulted to 0 — no matching lines, no ambiguity)`,
            source_row_index: null,
            source_column_slot: null,
            source_cell_address: null,
            basis: "period",
            confidence: "HIGH",
            evidence: [`${cls} absent, no ambiguity → default 0`],
            proposed_canonical_target: null,
          });
        }
      }
    }

    // ── Build SemanticLineItems ──
    const lineItems: SemanticLineItem[] = classified.map((line) => ({
      source_field_id: `acct_${line.kontonr}`,
      source_label: line.kontonavn,
      raw_value: line.rawAmount, // Document sign preserved
      basis: "period" as const,
      account_no: line.kontonr?.toString() || null,
      source_row_index: null,
    }));

    // ── Validation checks ──
    const checks: SemanticExtractionResult["parser_validation"]["checks"] = [];

    checks.push({
      name: "revenue_present",
      result: sums.revenue != null ? "PASS" : "FAIL",
      details: sums.revenue != null ? `Revenue raw sum: ${sums.revenue}` : "No revenue lines",
    });

    checks.push({
      name: "sign_convention",
      result: hasNegativeRevenue ? "PASS" : nonZeroRevenue.length === 0 ? "SKIP" : "FAIL",
      details: hasNegativeRevenue
        ? "Credit convention confirmed (negative revenue)"
        : nonZeroRevenue.length === 0
          ? "No non-zero revenue lines"
          : "No negative revenue found — unexpected for Dinero credit convention",
    });

    checks.push({
      name: "minimum_classes",
      result: Object.keys(sums).length >= 3 ? "PASS" : "FAIL",
      details: `${Object.keys(sums).length} classes found`,
    });

    const parserStatus = checks.some(c => c.result === "FAIL") ? "FAIL" as const : "PASS" as const;

    return {
      source_system: "dinero",
      document_type: "resultatopgoerelse",
      template_id: "DK_DINERO_RESULTATOPGOERELSE_V1",
      sign_convention: "credit",
      normalization_profile_id: "dinero_pnl_credit_v1",

      company_name: null,
      cvr: null,
      period_start: null,
      period_end: null,
      report_period_label: null,

      metric_candidates: metricCandidates,
      line_items: lineItems,
      basis_profile: {
        mode: "single",
        selected_period_basis: "period",
      },
      parser_validation: {
        parser_status: parserStatus,
        checks,
      },
      _deterministic_meta: {
        template_id: "DK_DINERO_RESULTATOPGOERELSE_V1",
        parser_confidence: parserStatus === "PASS" ? "HIGH" : "MEDIUM",
        detection_score: 0, // Set by registry
        raw_line_count: classified.length,
        normalized_line_count: classified.filter(l => l.cls !== "unclassified").length,
        column_basis_rule: "single",
      },
    };
  },
};
