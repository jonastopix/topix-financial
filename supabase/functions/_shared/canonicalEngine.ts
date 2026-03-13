/**
 * Canonical Accounting Engine — Phase 3 Hardening + Phase 5 Semantic Path
 * Normalize → Validate → Provenance → Build AI Payload
 *
 * Phase 6+7 correction: strict separation between normalization and canonical layers.
 * - normalizeSemanticExtraction() outputs source_field_id-keyed values (NO canonical mapping)
 * - buildCanonicalFromSemantic() maps source_field_id → canonical key + derivations
 */

import type {
  CanonicalOutput,
  CanonicalMetrics,
  CorrectionLogEntry,
  ProvenanceEntry,
  ValidationCheck,
  ValidationStatus,
  StatementType,
  PeriodBasis,
  RawLineEntry,
  NormalizedLineEntry,
  AiEligiblePayload,
  Confidence,
} from "./canonicalTypes.ts";

import type {
  SemanticExtractionResult,
  SemanticMetricCandidate,
  EnrichedProvenanceEntry,
} from "./semanticTypes.ts";

import {
  getNormalizationProfile,
  type NormalizationProfile,
  type NormalizationRule,
  type MetricFamily,
} from "./normalizationProfiles.ts";

const TOLERANCE = 2;

// ── Danish key_figures → English canonical metrics mapping ──
const KF_TO_CANONICAL: Record<string, keyof CanonicalMetrics> = {
  omsaetning: "revenue",
  direkte_omkostninger: "cogs",
  daekningsbidrag: "gross_profit",
  loenninger: "payroll",
  marketing: "sales_costs",
  salgsomkostninger: "sales_costs",
  lokaler: "facility_costs",
  lokaleomkostninger: "facility_costs",
  admin: "admin_costs",
  administrationsomkostninger: "admin_costs",
  transportomkostninger: "vehicle_costs",
  afskrivninger: "depreciation",
  resultat_foer_afskrivninger: "ebitda",
  resultat_foer_skat: "ebt",
  resultat_foer_ekstraordinaere: "ebt",
  resultat_efter_skat: "net_result",
  arets_resultat: "net_result",
  periodens_resultat: "net_result",
  aktiver_i_alt: "assets_total",
  passiver_i_alt: "liabilities_total",
  egenkapital: "equity_total",
  bank_balance: "cash",
  likvider: "cash",
  debitorer: "trade_receivables",
  kreditorer: "current_liabilities",
  varelager: "inventory",
  gaeld_i_alt: "debt_total",
  hensaettelser: "provisions_total",
  tech_software: "admin_costs", // merged into admin
  finansielle_omkostninger: "financial_costs",
};

// Line item class → canonical metric name
const CLASS_TO_CANONICAL: Record<string, keyof CanonicalMetrics> = {
  REVENUE: "revenue",
  COGS: "cogs",
  OPEX: "admin_costs",
  DEPR: "depreciation",
  FIN_EXPENSE: "financial_costs",
  ASSET: "assets_total",
  LIABILITY: "liabilities_total",
  EQUITY: "equity_total",
};

// ── Detect statement type ──
export function detectStatementType(extractedData: any): StatementType {
  const rt = (extractedData?.report_type || "").toLowerCase();
  if (rt.includes("resultat")) return "pnl";
  if (rt.includes("saldobalance") || rt.includes("saldo")) return "trial_balance";
  if (rt.includes("balance")) return "balance";
  if (rt.includes("combined") || rt.includes("kombineret")) return "combined";
  // If we have both P&L and balance data, it's combined
  const kf = extractedData?.key_figures || {};
  if (kf.omsaetning != null && kf.aktiver_i_alt != null) return "combined";
  if (kf.omsaetning != null) return "pnl";
  if (kf.aktiver_i_alt != null) return "balance";
  return "unknown";
}

// ── Infer period basis from multiple core fields ──
export function inferPeriodBasis(kf: Record<string, any>): PeriodBasis {
  const coreFields = [
    { period: kf.omsaetning, ytd: kf.omsaetning_aar },
    { period: kf.daekningsbidrag, ytd: kf.daekningsbidrag_aar },
    { period: kf.resultat_foer_skat, ytd: kf.resultat_foer_skat_aar },
    { period: kf.resultat_efter_skat, ytd: kf.resultat_efter_skat_aar },
  ];

  let periodCount = 0;
  let ytdCount = 0;
  let inconsistentCount = 0;

  for (const { period, ytd } of coreFields) {
    if (period != null) periodCount++;
    if (ytd != null) ytdCount++;
    // YTD < period is impossible (for positive revenue/margin)
    if (period != null && ytd != null && Math.abs(ytd) < Math.abs(period) - TOLERANCE) {
      inconsistentCount++;
    }
  }

  if (inconsistentCount > 0) return "unknown";
  if (periodCount > 0 && ytdCount > 0) return "period";
  if (periodCount > 0) return "period";
  if (ytdCount > 0) return "ytd";
  return "unknown";
}

// ── Normalize key_figures to canonical metrics with correction log ──
//
// IMPORTANT:
// P&L/result fields are expected to arrive pre-normalized from DETERMINISTIC paths
// (deterministic Excel, deterministic PDF). Canonical engine must NOT flip these again.
//
// However, AI extraction is UNRELIABLE — the prompt instructs sign normalization
// but the model sometimes returns raw accounting signs (negative = profit in saldobalance).
// For AI-extracted saldobalancer, canonical engine KEEPS the safety-net flip.
//
// Only balance-specific fields that intentionally keep raw accounting sign
// (e.g. equity in some paths) may still require canonical normalization.
//
export function normalizeToCanonical(extractedData: any, extractionMethod?: string): {
  metrics: CanonicalMetrics;
  correction_log: CorrectionLogEntry[];
} {
  const kf = extractedData?.key_figures || {};
  const lineItems = Array.isArray(extractedData?.line_items) ? extractedData.line_items : [];
  const reportType = extractedData?.report_type || "";
  const isSaldobalance = reportType.toLowerCase().includes("saldo");
  const isDeterministic = extractionMethod === "deterministic_template";
  const corrections: CorrectionLogEntry[] = [];

  // Start with empty metrics
  const metrics: CanonicalMetrics = {
    revenue: null, cogs: null, gross_profit: null, gross_margin_pct: null,
    payroll: null, payroll_related: null, other_staff_costs: null,
    sales_costs: null, facility_costs: null, admin_costs: null, vehicle_costs: null,
    ebitda: null, depreciation: null, ebit: null, financial_costs: null,
    extraordinary_items: null, ebt: null, net_result: null,
    assets_total: null, inventory: null, receivables_total: null,
    trade_receivables: null, unbilled_wip: null, cash: null,
    equity_total: null, equity_ratio_pct: null, related_party_net: null,
    provisions_total: null, current_liabilities: null, debt_total: null,
    vat_payable: null, liabilities_total: null,
  };

  // Map key_figures → canonical, applying sign rules
  const revenueFields = ["omsaetning", "omsaetning_aar"];
  const alwaysPositiveExpenseFields = ["loenninger", "marketing", "lokaler", "admin", "tech_software", "afskrivninger"];
  const profitFields = ["daekningsbidrag", "daekningsbidrag_aar"];
  const resultatFields = ["resultat_foer_skat", "resultat_foer_skat_aar", "resultat_efter_skat", "resultat_efter_skat_aar"];
  const assetFields = ["aktiver_i_alt", "debitorer", "varelager"];
  const liabilityFields = ["passiver_i_alt", "kreditorer"];
  const cashFields = ["bank_balance", "likvider"];

  // Helper to log correction
  function correct(field: string, raw: number, normalized: number, rule: string, reason: string, confidence: Confidence = "HIGH") {
    corrections.push({ field, source: "key_figure", raw_value: raw, normalized_value: normalized, rule, reason, confidence });
  }

  // Process each key_figure
  for (const [dkField, value] of Object.entries(kf)) {
    if (value == null || typeof value !== "number") continue;

    const canonicalField = KF_TO_CANONICAL[dkField];
    if (!canonicalField) continue;

    let normalized = value;

    // Revenue: must be positive (safety net for all paths)
    if (revenueFields.includes(dkField) && value < 0) {
      normalized = Math.abs(value);
      correct(dkField, value, normalized, "revenue_must_be_positive",
        `Revenue flipped from ${value} to ${normalized}`, "HIGH");
    }

    // COGS: usually positive, but keep negative for deterministic contra-cost cases
    if (dkField === "direkte_omkostninger" && value < 0) {
      const revenueForCheck = typeof kf.omsaetning === "number" ? Math.abs(kf.omsaetning) : null;
      const grossProfitForCheck = typeof kf.daekningsbidrag === "number" ? kf.daekningsbidrag : null;

      const supportsContraCost =
        isDeterministic &&
        !isSaldobalance &&
        revenueForCheck != null &&
        grossProfitForCheck != null &&
        Math.abs((revenueForCheck - value) - grossProfitForCheck) <= TOLERANCE;

      if (!supportsContraCost) {
        normalized = Math.abs(value);
        correct(dkField, value, normalized, "expense_must_be_positive",
          `Expense ${dkField} flipped from ${value} to ${normalized}`, "HIGH");
      }
    }

    // Other expenses: must be positive (safety net for all paths)
    if (alwaysPositiveExpenseFields.includes(dkField) && value < 0) {
      normalized = Math.abs(value);
      correct(dkField, value, normalized, "expense_must_be_positive",
        `Expense ${dkField} flipped from ${value} to ${normalized}`, "HIGH");
    }

    // Gross profit in saldobalance: invert sign (AI safety net only)
    // Deterministic paths pre-normalize → skip
    if (profitFields.includes(dkField) && isSaldobalance && !isDeterministic && value < 0) {
      const expectedDB = (Math.abs(kf.omsaetning || 0)) - (Math.abs(kf.direkte_omkostninger || 0));
      if (Math.abs(Math.abs(value) - Math.abs(expectedDB)) <= TOLERANCE) {
        normalized = Math.abs(value);
        correct(dkField, value, normalized, "saldobalance_gross_profit_sign_inverted",
          `Saldobalance gross profit inverted (AI safety net, magnitude matched)`, "HIGH");
      }
    }

    // Resultat in saldobalance: conditional sign flip (AI safety net)
    if (resultatFields.includes(dkField) && isSaldobalance && !isDeterministic && value !== 0) {
      const absGP = Math.abs(kf.daekningsbidrag || kf.daekningsbidrag_aar || 0);
      const opexTotal = Math.abs(kf.loenninger || 0) + Math.abs(kf.marketing || kf.salgsomkostninger || 0) +
        Math.abs(kf.lokaler || kf.lokaleomkostninger || 0) +
        Math.abs(kf.admin || kf.administrationsomkostninger || 0) +
        Math.abs(kf.tech_software || 0) + Math.abs(kf.afskrivninger || 0);

      if (absGP > 0) {
        const expectedResult = absGP - opexTotal;
        const valueSignMatchesExpected = (value > 0) === (expectedResult > 0);

        if (valueSignMatchesExpected) {
          // AI already normalized to business convention — keep as-is
        } else {
          normalized = -value;
          correct(dkField, value, normalized, "saldobalance_result_sign_inverted",
            `Saldobalance result inverted (cross-validated): ${value} → ${normalized}`, "HIGH");
        }
      }
    }

    // Assets: must be positive
    if (assetFields.includes(dkField) && value < 0) {
      normalized = Math.abs(value);
      correct(dkField, value, normalized, "asset_must_be_positive",
        `Asset ${dkField} flipped from ${value} to ${normalized}`, "MEDIUM");
    }

    // Liabilities: must be positive
    if (liabilityFields.includes(dkField) && value < 0) {
      normalized = Math.abs(value);
      correct(dkField, value, normalized, "liability_must_be_positive",
        `Liability ${dkField} flipped from ${value} to ${normalized}`, "MEDIUM");
    }

    // Equity in saldobalance: CREDIT convention → negative = positive equity
    // Only apply for AI-extracted data — deterministic templates handle their own sign normalization
    if (dkField === "egenkapital" && isSaldobalance && !isDeterministic && value < 0) {
      normalized = Math.abs(value);
      correct(dkField, value, normalized, "saldobalance_equity_sign_inverted",
        `Saldobalance equity inverted: ${value} → ${normalized} (credit convention)`, "HIGH");
    }

    // tech_software merges into admin_costs
    if (dkField === "tech_software") {
      if (metrics.admin_costs != null) {
        const oldAdmin = metrics.admin_costs;
        metrics.admin_costs += normalized;
        corrections.push({
          field: "tech_software",
          source: "key_figure",
          raw_value: value,
          normalized_value: metrics.admin_costs,
          rule: "tech_software_merged_into_admin",
          reason: `tech_software (${normalized}) merged into admin_costs (${oldAdmin} → ${metrics.admin_costs})`,
          confidence: "HIGH",
        });
      } else {
        metrics[canonicalField] = (metrics[canonicalField] || 0) + normalized;
      }
      continue;
    }

    // Bank/cash: keep sign (overdraft allowed)
    // Equity: keep sign (negative equity possible)

    metrics[canonicalField] = normalized;
  }

  // Prefer explicit bank/likvider line-item sign over key_figures when available
  if (!isDeterministic && cashFields.some((f) => kf[f] != null)) {
    const bankLine = lineItems.find((li: any) => {
      const label = (li?.name || "").toString().toLowerCase();
      return label.includes("bank") || label.includes("likvid");
    });

    if (bankLine) {
      const lineVal = bankLine.period_amount ?? bankLine.ytd_amount;
      if (typeof lineVal === "number" && metrics.cash !== lineVal) {
        const prev = metrics.cash;
        metrics.cash = lineVal;
        corrections.push({
          field: "cash",
          source: "line_item",
          raw_value: prev,
          normalized_value: lineVal,
          rule: "cash_prefers_bank_line_sign",
          reason: `Cash overridden from key_figure (${prev}) to bank line (${lineVal}) to preserve raw sign`,
          confidence: "HIGH",
        });
      }
    }
  }

  // Derive calculated fields
  if (metrics.revenue != null && metrics.gross_profit != null && metrics.revenue !== 0) {
    metrics.gross_margin_pct = (metrics.gross_profit / metrics.revenue) * 100;
  }
  if (metrics.equity_total != null && metrics.assets_total != null && metrics.assets_total !== 0) {
    metrics.equity_ratio_pct = (metrics.equity_total / metrics.assets_total) * 100;
  }

  // Derive EBITDA if not present: gross_profit - opex
  if (metrics.ebitda == null && metrics.gross_profit != null) {
    const opex = (metrics.payroll || 0) + (metrics.sales_costs || 0) +
      (metrics.facility_costs || 0) + (metrics.admin_costs || 0);
    if (opex > 0) {
      metrics.ebitda = metrics.gross_profit - opex;
    }
  }

  // Derive EBIT if not present: ebitda - depreciation
  if (metrics.ebit == null && metrics.ebitda != null && metrics.depreciation != null) {
    metrics.ebit = metrics.ebitda - metrics.depreciation;
  }

  return { metrics, correction_log: corrections };
}

// ── Build raw_lines from extractedData ──
export function buildRawLines(extractedData: any): RawLineEntry[] {
  const items = extractedData?.line_items;
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => ({
    name: item.name || "",
    period_amount: item.period_amount ?? null,
    ytd_amount: item.ytd_amount ?? null,
    raw_sign: item.raw_sign || null,
    account_no: item.account_no || null,
    class: item.class || null,
  }));
}

// ── Build normalized_lines from raw_lines ──
export function buildNormalizedLines(rawLines: RawLineEntry[]): NormalizedLineEntry[] {
  return rawLines.map((line) => {
    const cls = line.class || null;
    const canonicalName = cls ? (CLASS_TO_CANONICAL[cls] || null) : null;
    return {
      name: line.name,
      canonical_class: cls,
      canonical_name: canonicalName || null,
      period_amount: line.period_amount,
      ytd_amount: line.ytd_amount,
      raw_sign: line.raw_sign || null,
      account_no: line.account_no || null,
    };
  });
}

// ── Build provenance ──
export function buildProvenance(
  extractedData: any,
  metrics: CanonicalMetrics,
  extractionMethod: string
): Record<string, ProvenanceEntry> {
  const provenance: Record<string, ProvenanceEntry> = {};
  const kf = extractedData?.key_figures || {};
  const lineItems = extractedData?.line_items || [];
  const sourceType = extractionMethod === "deterministic_template" ? "deterministic_template" as const : "ai_extraction" as const;
  const reportType = extractedData?.report_type || null;

  // For each non-null metric, find its provenance
  for (const [canonicalKey, value] of Object.entries(metrics)) {
    if (value == null) continue;

    // Find which Danish key maps to this canonical key
    let matchedLabel: string | null = null;
    let lineRef: string | null = null;

    for (const [dkKey, cKey] of Object.entries(KF_TO_CANONICAL)) {
      if (cKey === canonicalKey && kf[dkKey] != null) {
        matchedLabel = dkKey;
        break;
      }
    }

    // Try to find a matching line_item
    if (lineItems.length > 0 && matchedLabel) {
      const idx = lineItems.findIndex((li: any) =>
        li.name?.toLowerCase().includes(matchedLabel!.replace(/_/g, " ").replace("ae", "æ"))
      );
      if (idx >= 0) lineRef = `line_items[${idx}]`;
    }

    provenance[canonicalKey] = {
      source_type: sourceType,
      label_match: matchedLabel,
      report_type: reportType,
      confidence: matchedLabel ? "HIGH" : "MEDIUM",
      line_item_reference: lineRef,
    };
  }

  return provenance;
}

// ── Extended Validation (12 checks) ──
export function runExtendedValidation(
  extractedData: any,
  metrics: CanonicalMetrics,
  periodBasis: PeriodBasis,
  statementType: StatementType,
  aiChecks: ValidationCheck[]
): { status: ValidationStatus; canonical_checks: ValidationCheck[]; errors: string[] } {
  const checks: ValidationCheck[] = [];
  const errors: string[] = [];
  const kf = extractedData?.key_figures || {};

  // 1. required_fields_present
  const coreFields = ["revenue", "ebt"];
  const missing = coreFields.filter(f => (metrics as any)[f] == null);
  if (missing.length > 0) {
    checks.push({ name: "required_fields_present", result: "FAIL", details: `Missing: ${missing.join(", ")}` });
    errors.push(`Missing core fields: ${missing.join(", ")}`);
  } else {
    checks.push({ name: "required_fields_present", result: "PASS", details: "Core fields present" });
  }

  // 2. numeric_values_only
  const nonNumeric = Object.entries(metrics).filter(([_, v]) => v != null && typeof v !== "number").map(([k]) => k);
  if (nonNumeric.length > 0) {
    checks.push({ name: "numeric_values_only", result: "FAIL", details: `Non-numeric: ${nonNumeric.join(", ")}` });
    errors.push(`Non-numeric values: ${nonNumeric.join(", ")}`);
  } else {
    checks.push({ name: "numeric_values_only", result: "PASS", details: "All values numeric" });
  }

  // 3. gross_profit_sum
  if (metrics.revenue != null && metrics.cogs != null && metrics.gross_profit != null) {
    const expected = metrics.revenue - metrics.cogs;
    const diff = Math.abs(expected - metrics.gross_profit);
    const pass = diff <= TOLERANCE;
    checks.push({
      name: "gross_profit_sum", result: pass ? "PASS" : "FAIL",
      details: pass ? `OK: ${metrics.revenue} - ${metrics.cogs} ≈ ${metrics.gross_profit}` :
        `MISMATCH: ${expected.toFixed(2)} ≠ ${metrics.gross_profit}`,
    });
    if (!pass) errors.push(`Gross profit mismatch: expected ${expected.toFixed(2)}, got ${metrics.gross_profit}`);
  } else {
    checks.push({ name: "gross_profit_sum", result: "SKIP", details: "Missing revenue, cogs or gross_profit" });
  }

  // 4. ebitda_calculation
  if (metrics.gross_profit != null) {
    const opex = (metrics.payroll || 0) + (metrics.sales_costs || 0) + (metrics.facility_costs || 0) + (metrics.admin_costs || 0);
    if (opex > 0) {
      const expectedEbitda = metrics.gross_profit - opex;
      checks.push({ name: "ebitda_calculation", result: "PASS", details: `Computed EBITDA: ${expectedEbitda.toFixed(2)}` });
    } else {
      checks.push({ name: "ebitda_calculation", result: "SKIP", details: "No opex data" });
    }
  } else {
    checks.push({ name: "ebitda_calculation", result: "SKIP", details: "Missing gross_profit" });
  }

  // 5. ebit_calculation
  if (metrics.ebitda != null && metrics.depreciation != null) {
    const expectedEbit = metrics.ebitda - metrics.depreciation;
    if (metrics.ebit != null) {
      const diff = Math.abs(expectedEbit - metrics.ebit);
      checks.push({
        name: "ebit_calculation", result: diff <= TOLERANCE ? "PASS" : "FAIL",
        details: `EBITDA(${metrics.ebitda}) - Depr(${metrics.depreciation}) = ${expectedEbit.toFixed(2)}, EBIT = ${metrics.ebit}`,
      });
    } else {
      checks.push({ name: "ebit_calculation", result: "PASS", details: `Computed EBIT: ${expectedEbit.toFixed(2)}` });
    }
  } else {
    checks.push({ name: "ebit_calculation", result: "SKIP", details: "Missing ebitda or depreciation" });
  }

  // 6. result_consistency
  if (metrics.ebt != null && metrics.gross_profit != null && statementType === "pnl") {
    const sensible = metrics.ebt <= metrics.gross_profit + TOLERANCE;
    checks.push({
      name: "result_consistency", result: sensible ? "PASS" : "FAIL",
      details: sensible ? `EBT (${metrics.ebt}) ≤ gross_profit (${metrics.gross_profit})`
        : `EBT (${metrics.ebt}) > gross_profit (${metrics.gross_profit})`,
    });
    if (!sensible) errors.push("EBT > gross_profit — possible sign error");
  } else {
    checks.push({ name: "result_consistency", result: "SKIP", details: "Not P&L or missing data" });
  }

  // 7. balance_equation
  if (metrics.assets_total != null && metrics.liabilities_total != null) {
    const diff = Math.abs(metrics.assets_total - metrics.liabilities_total);
    const pass = diff <= TOLERANCE;
    checks.push({
      name: "balance_equation", result: pass ? "PASS" : "FAIL",
      details: pass ? `Assets (${metrics.assets_total}) ≈ Liabilities (${metrics.liabilities_total})`
        : `Assets (${metrics.assets_total}) ≠ Liabilities (${metrics.liabilities_total}), diff ${diff.toFixed(2)}`,
    });
    if (!pass) errors.push("Balance equation mismatch");
  } else {
    checks.push({ name: "balance_equation", result: "SKIP", details: "Missing balance data" });
  }

  // 8. period_consistency
  if (kf.omsaetning != null && kf.omsaetning_aar != null) {
    const consistent = kf.omsaetning_aar >= kf.omsaetning - TOLERANCE;
    checks.push({
      name: "period_consistency", result: consistent ? "PASS" : "FAIL",
      details: consistent ? `YTD (${kf.omsaetning_aar}) ≥ period (${kf.omsaetning})` :
        `YTD (${kf.omsaetning_aar}) < period (${kf.omsaetning})`,
    });
    if (!consistent) errors.push("Period consistency: YTD < period");
  } else {
    checks.push({ name: "period_consistency", result: "SKIP", details: "Only one set of figures" });
  }

  // 9. mixed_period_columns_detected
  if (periodBasis === "unknown") {
    checks.push({ name: "mixed_period_columns_detected", result: "FAIL", details: "Period basis could not be determined — possible mixing of period/YTD" });
    errors.push("Mixed period columns detected");
  } else {
    checks.push({ name: "mixed_period_columns_detected", result: "PASS", details: `Period basis: ${periodBasis}` });
  }

  // 10. suspicious_sign_pattern
  const metricValues = Object.values(metrics).filter((v): v is number => v != null && typeof v === "number");
  const negativeCount = metricValues.filter(v => v < 0).length;
  if (metricValues.length > 0 && negativeCount / metricValues.length > 0.5) {
    checks.push({ name: "suspicious_sign_pattern", result: "FAIL", details: `${negativeCount}/${metricValues.length} metrics negative (>50%)` });
    errors.push("Suspicious sign pattern: majority of metrics negative");
  } else {
    checks.push({
      name: "suspicious_sign_pattern", result: "PASS",
      details: metricValues.length > 0 ? `${negativeCount}/${metricValues.length} negative` : "No metrics",
    });
  }

  // 11. impossible_margin_check
  if (metrics.gross_margin_pct != null) {
    const hasContraCogs = metrics.cogs != null && metrics.cogs < 0 && metrics.revenue != null && metrics.revenue > 0;
    const outsideStandardRange = metrics.gross_margin_pct > 100 || metrics.gross_margin_pct < -100;

    if (outsideStandardRange && !hasContraCogs) {
      checks.push({ name: "impossible_margin_check", result: "FAIL", details: `Gross margin ${metrics.gross_margin_pct.toFixed(1)}% outside ±100%` });
      errors.push(`Impossible gross margin: ${metrics.gross_margin_pct.toFixed(1)}%`);
    } else {
      checks.push({
        name: "impossible_margin_check",
        result: "PASS",
        details: hasContraCogs
          ? `Gross margin ${metrics.gross_margin_pct.toFixed(1)}% allowed due to negative COGS (contra-cost)`
          : `Gross margin ${metrics.gross_margin_pct.toFixed(1)}%`,
      });
    }
  } else {
    checks.push({ name: "impossible_margin_check", result: "SKIP", details: "No gross margin data" });
  }

  // 12. missing_core_totals
  if (statementType === "balance" || statementType === "trial_balance") {
    if (metrics.assets_total == null && metrics.liabilities_total == null) {
      checks.push({ name: "missing_core_totals", result: "FAIL", details: "Balance report without assets_total AND liabilities_total" });
      errors.push("Balance report missing core totals");
    } else {
      checks.push({ name: "missing_core_totals", result: "PASS", details: "Core balance totals present" });
    }
  } else if (statementType === "pnl" && metrics.revenue == null) {
    checks.push({ name: "missing_core_totals", result: "FAIL", details: "P&L report without revenue" });
    errors.push("P&L missing revenue");
  } else {
    checks.push({ name: "missing_core_totals", result: "PASS", details: "Core totals present for statement type" });
  }

  // ── Derive final status ──
  const hasCanonicalFail = checks.some(c => c.result === "FAIL");
  const hasAiFail = aiChecks.some(c => c.result === "FAIL");
  const allSkip = checks.every(c => c.result === "SKIP");

  let status: ValidationStatus;
  if (hasCanonicalFail || hasAiFail) {
    status = "FAIL";
  } else if (allSkip) {
    status = "UNSURE";
  } else {
    status = "PASS";
  }

  return { status, canonical_checks: checks, errors };
}

// ── Compute ai_eligible (per statement_type) ──
export function computeAiEligible(
  metrics: CanonicalMetrics,
  validationStatus: ValidationStatus,
  statementType: StatementType,
  periodBasis: PeriodBasis
): boolean {
  if (validationStatus !== "PASS") return false;
  if (statementType === "unknown") return false;
  if (periodBasis === "unknown") return false;

  switch (statementType) {
    case "pnl":
      return metrics.revenue != null && metrics.ebt != null;
    case "combined":
      return metrics.revenue != null && metrics.ebt != null && metrics.assets_total != null;
    case "balance":
    case "trial_balance":
      return false;
    default:
      return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 5: Semantic Normalization Path
// Phase 6+7 correction: strict layer separation
// ══════════════════════════════════════════════════════════════════════════════

/** Danish source_field_id → canonical metric key mapping */
const SEMANTIC_TO_CANONICAL: Record<string, keyof CanonicalMetrics> = {
  // P&L fields
  omsaetning: "revenue",
  direkte_omkostninger: "cogs",
  daekningsbidrag: "gross_profit",
  loenninger: "payroll",
  pensioner_sociale: "payroll_related",
  oevrige_personale: "other_staff_costs",
  salgsomkostninger: "sales_costs",
  lokaleomkostninger: "facility_costs",
  administrationsomkostninger: "admin_costs",
  transportomkostninger: "vehicle_costs",
  autodrift: "vehicle_costs",
  afskrivninger: "depreciation",
  resultat_foer_afskrivninger: "ebitda",
  indtjeningsbidrag: "ebit",
  finansieringsudgifter: "financial_costs",
  finansielle_omkostninger: "financial_costs",
  ekstraordinaere_poster: "extraordinary_items",
  resultat_foer_skat: "ebt",
  resultat_foer_ekstraordinaere: "ebt",
  arets_resultat: "net_result",
  resultat_efter_skat: "net_result",
  periodens_resultat: "net_result",
  // Balance-sheet fields
  aktiver_i_alt: "assets_total",
  varelager: "inventory",
  tilgodehavender_i_alt: "receivables_total",
  debitorer: "trade_receivables",
  igangvaerende_arbejde: "unbilled_wip",
  likvider: "cash",
  egenkapital: "equity_total",
  mellemregning: "related_party_net",
  hensaettelser: "provisions_total",
  kortfristet_gaeld: "current_liabilities",
  gaeld_i_alt: "debt_total",
  moms: "vat_payable",
  passiver_i_alt: "liabilities_total",
};

/**
 * Apply a normalization rule to a raw value.
 * This is the centralized normalization — NO sign logic in templates.
 */
function applyNormalizationRule(
  rawValue: number | null,
  rule: NormalizationRule,
  _candidate: SemanticMetricCandidate,
): { normalized: number | null; action_applied: string } {
  if (rawValue == null) return { normalized: null, action_applied: "null_passthrough" };

  switch (rule.action) {
    case "abs":
      return { normalized: Math.abs(rawValue), action_applied: "abs" };
    case "negate":
      return { normalized: -rawValue, action_applied: "negate" };
    case "keep":
      return { normalized: rawValue, action_applied: "keep" };
    case "conditional":
      // For conditional rules, apply fallback action
      if (rule.condition) {
        switch (rule.condition.fallback_action) {
          case "abs": return { normalized: Math.abs(rawValue), action_applied: "conditional→abs" };
          case "negate": return { normalized: -rawValue, action_applied: "conditional→negate" };
          case "keep": return { normalized: rawValue, action_applied: "conditional→keep" };
        }
      }
      return { normalized: rawValue, action_applied: "conditional→keep" };
    case "reject":
      return { normalized: null, action_applied: "rejected" };
    default:
      return { normalized: rawValue, action_applied: "unknown_keep" };
  }
}

/**
 * Normalization result keyed by source_field_id (NOT canonical keys).
 * This is the output contract of the normalization layer.
 */
export interface NormalizationResult {
  /** Normalized values keyed by source_field_id */
  normalized_by_source: Record<string, number | null>;
  /** Correction log entries keyed by source_field_id */
  correction_log: CorrectionLogEntry[];
  /** Enriched provenance keyed by source_field_id (preserves full source-semantic trail) */
  provenance_by_source: Record<string, EnrichedProvenanceEntry>;
}

/**
 * Normalize a SemanticExtractionResult using centralized profiles.
 *
 * LAYER CONTRACT (Phase 6+7 corrected):
 * - Outputs values keyed by source_field_id (NOT canonical keys)
 * - Does NOT map to canonical keys — that is buildCanonicalFromSemantic()'s job
 * - Applies ONLY profile-driven sign normalization
 * - No derivations, no canonical mapping
 */
export function normalizeSemanticExtraction(semantic: SemanticExtractionResult): NormalizationResult {
  const profile = getNormalizationProfile(semantic.normalization_profile_id);
  if (!profile) {
    throw new Error(`Normalization profile not found: ${semantic.normalization_profile_id}`);
  }

  const normalizedBySource: Record<string, number | null> = {};
  const corrections: CorrectionLogEntry[] = [];
  const provenanceBySource: Record<string, EnrichedProvenanceEntry> = {};

  for (const candidate of semantic.metric_candidates) {
    // Determine normalization rule: field_override takes precedence over family_default
    const fieldOverride = profile.field_overrides[candidate.source_field_id];
    const familyDefault = profile.family_defaults[candidate.normalization_family];
    const rule = fieldOverride || familyDefault;
    const ruleType = fieldOverride ? "field_override" : "family_default";

    if (!rule) continue;

    const { normalized, action_applied } = applyNormalizationRule(
      candidate.raw_value, rule, candidate
    );

    if (action_applied === "rejected") {
      corrections.push({
        field: candidate.source_field_id,
        source: "semantic_candidate",
        raw_value: candidate.raw_value,
        normalized_value: null,
        rule: "normalization_rejected",
        reason: `${candidate.source_field_id} rejected by ${ruleType}: ${rule.description}`,
        confidence: "HIGH",
      });
      continue;
    }

    // Log correction if value changed
    if (normalized !== candidate.raw_value) {
      corrections.push({
        field: candidate.source_field_id,
        source: "semantic_candidate",
        raw_value: candidate.raw_value,
        normalized_value: normalized,
        rule: `${ruleType}_${action_applied}`,
        reason: `${candidate.source_field_id}: ${candidate.raw_value} → ${normalized} via ${action_applied} (${rule.description})`,
        confidence: candidate.confidence,
      });
    }

    // Store by source_field_id — NOT canonical key
    // If multiple candidates share same source_field_id, last one wins (deterministic: templates emit one per field)
    normalizedBySource[candidate.source_field_id] = normalized;

    // Build enriched provenance keyed by source_field_id
    provenanceBySource[candidate.source_field_id] = {
      source_type: "deterministic_template",
      source_system: semantic.source_system,
      template_id: semantic.template_id,
      source_field_id: candidate.source_field_id,
      source_label: candidate.source_label,
      source_row_index: candidate.source_row_index,
      source_column_slot: candidate.source_column_slot,
      source_cell_address: candidate.source_cell_address,
      basis: candidate.basis,
      raw_value: candidate.raw_value,
      normalized_value: normalized,
      normalization_profile_id: semantic.normalization_profile_id,
      normalization_family: candidate.normalization_family,
      normalization_rule_type: ruleType as any,
      normalization_action: action_applied,
      canonical_metric: null, // Set later by canonical layer
      confidence: candidate.confidence,
    };
  }

  return {
    normalized_by_source: normalizedBySource,
    correction_log: corrections,
    provenance_by_source: provenanceBySource,
  };
}

/**
 * Build full CanonicalOutput from a SemanticExtractionResult.
 *
 * LAYER CONTRACT (Phase 6+7 corrected):
 * 1. Calls normalizeSemanticExtraction() → source_field_id-keyed values
 * 2. Maps source_field_id → canonical metric key via SEMANTIC_TO_CANONICAL
 * 3. Applies all derivations (gross_profit, ebitda, ebit, ebt, ratios)
 * 4. Re-keys provenance from source_field_id to canonical key
 * 5. Runs canonical validation
 */
export function buildCanonicalFromSemantic(semantic: SemanticExtractionResult): CanonicalOutput {
  const normResult = normalizeSemanticExtraction(semantic);

  // ── Step 1: Initialize empty canonical metrics ──
  const metrics: CanonicalMetrics = {
    revenue: null, cogs: null, gross_profit: null, gross_margin_pct: null,
    payroll: null, payroll_related: null, other_staff_costs: null,
    sales_costs: null, facility_costs: null, admin_costs: null, vehicle_costs: null,
    ebitda: null, depreciation: null, ebit: null, financial_costs: null,
    extraordinary_items: null, ebt: null, net_result: null,
    assets_total: null, inventory: null, receivables_total: null,
    trade_receivables: null, unbilled_wip: null, cash: null,
    equity_total: null, equity_ratio_pct: null, related_party_net: null,
    provisions_total: null, current_liabilities: null, debt_total: null,
    vat_payable: null, liabilities_total: null,
  };

  // ── Step 2: Map source_field_id → canonical key ──
  // Tracks which source_field_id mapped to which canonical key for provenance re-keying
  const canonicalProvenance: Record<string, EnrichedProvenanceEntry> = {};
  const correction_log = [...normResult.correction_log];

  // ── Deterministic conflict precedence ──
  // When multiple source_field_id values map to the same canonical key,
  // this map defines which source_field_id wins (first listed = highest priority).
  // Expected conflicts (declared here) are resolved deterministically with traceability.
  // Unexpected conflicts (not declared) cause a hard fail.
  const CANONICAL_PRECEDENCE: Record<string, string[]> = {
    ebt: ["resultat_foer_skat", "resultat_foer_ekstraordinaere", "periodens_resultat"],
    net_result: ["arets_resultat", "resultat_efter_skat", "periodens_resultat"],
    vehicle_costs: ["autodrift", "transportomkostninger"],
    financial_costs: ["finansieringsudgifter", "finansielle_omkostninger"],
  };

  const canonicalSourceMap: Record<string, string> = {}; // canonical_key → winning source_field_id

  for (const [sourceFieldId, normalizedValue] of Object.entries(normResult.normalized_by_source)) {
    const canonicalKey = SEMANTIC_TO_CANONICAL[sourceFieldId];
    if (!canonicalKey) continue;

    const existingSourceId = canonicalSourceMap[canonicalKey];
    if (existingSourceId != null && metrics[canonicalKey] != null) {
      // Conflict: two source_field_id values map to the same canonical key
      if (normalizedValue == null) continue; // null does not overwrite non-null

      const precedenceList = CANONICAL_PRECEDENCE[canonicalKey];
      if (!precedenceList) {
        // UNEXPECTED conflict — hard fail
        throw new Error(
          `[CanonicalEngine] UNEXPECTED canonical conflict on "${canonicalKey}": ` +
          `${existingSourceId}=${metrics[canonicalKey]} vs ${sourceFieldId}=${normalizedValue}. ` +
          `No precedence rule defined. This indicates a template or mapping bug.`
        );
      }

      // EXPECTED conflict — resolve via precedence, take the one with lowest index
      const existingPriority = precedenceList.indexOf(existingSourceId);
      const newPriority = precedenceList.indexOf(sourceFieldId);

      // If both are in the list, lower index wins. If one is missing from list, the listed one wins.
      const existingRank = existingPriority >= 0 ? existingPriority : Infinity;
      const newRank = newPriority >= 0 ? newPriority : Infinity;

      const winnerIsExisting = existingRank <= newRank;
      const winnerId = winnerIsExisting ? existingSourceId : sourceFieldId;
      const loserId = winnerIsExisting ? sourceFieldId : existingSourceId;
      const winnerValue = winnerIsExisting ? metrics[canonicalKey] : normalizedValue;
      const loserValue = winnerIsExisting ? normalizedValue : metrics[canonicalKey];

      // Record machine-readable traceability in correction_log
      correction_log.push({
        field: canonicalKey,
        source: "semantic_candidate",
        raw_value: loserValue,
        normalized_value: winnerValue,
        rule: "canonical_precedence",
        reason: JSON.stringify({
          canonical_metric: canonicalKey,
          winning_source_field_id: winnerId,
          losing_source_field_id: loserId,
          precedence_rule: precedenceList,
          winning_value: winnerValue,
          losing_value: loserValue,
        }),
        confidence: "HIGH",
      });

      if (winnerIsExisting) continue; // Keep existing, skip new
    }

    metrics[canonicalKey] = normalizedValue;
    canonicalSourceMap[canonicalKey] = sourceFieldId;

    // Re-key provenance: copy source provenance to canonical key, set canonical_metric
    const sourceProv = normResult.provenance_by_source[sourceFieldId];
    if (sourceProv) {
      canonicalProvenance[canonicalKey] = {
        ...sourceProv,
        canonical_metric: canonicalKey,
      };
    }
  }

  // ── Step 3: Canonical derivations (explicit, transparent) ──

  // gross_profit = revenue - cogs (when null but both inputs present)
  if (metrics.gross_profit == null && metrics.revenue != null && metrics.cogs != null) {
    metrics.gross_profit = metrics.revenue - metrics.cogs;
    correction_log.push({
      field: "gross_profit",
      source: "derived_metric",
      raw_value: null,
      normalized_value: metrics.gross_profit,
      rule: "canonical_derivation",
      reason: `gross_profit derived: revenue(${metrics.revenue}) - cogs(${metrics.cogs}) = ${metrics.gross_profit}`,
      confidence: "HIGH",
    });
  }

  // gross_margin_pct = (gross_profit / revenue) * 100
  if (metrics.revenue != null && metrics.gross_profit != null && metrics.revenue !== 0) {
    metrics.gross_margin_pct = (metrics.gross_profit / metrics.revenue) * 100;
  }

  // equity_ratio_pct = (equity_total / assets_total) * 100
  if (metrics.equity_total != null && metrics.assets_total != null && metrics.assets_total !== 0) {
    metrics.equity_ratio_pct = (metrics.equity_total / metrics.assets_total) * 100;
  }

  // ebitda = gross_profit - (payroll + sales_costs + facility_costs + vehicle_costs + admin_costs)
  // Only when ebitda is null and gross_profit is present
  if (metrics.ebitda == null && metrics.gross_profit != null) {
    const opexComponents = [
      metrics.payroll,
      metrics.sales_costs,
      metrics.facility_costs,
      metrics.vehicle_costs,
      metrics.admin_costs,
    ];
    const opexSum = opexComponents.reduce((sum: number, v) => sum + (v || 0), 0 as number);
    if (opexSum > 0) {
      metrics.ebitda = metrics.gross_profit! - opexSum;
      correction_log.push({
        field: "ebitda",
        source: "derived_metric",
        raw_value: null,
        normalized_value: metrics.ebitda,
        rule: "canonical_derivation",
        reason: `ebitda derived: gross_profit(${metrics.gross_profit}) - (payroll(${metrics.payroll || 0}) + sales(${metrics.sales_costs || 0}) + facility(${metrics.facility_costs || 0}) + admin(${metrics.admin_costs || 0})) = ${metrics.ebitda}`,
        confidence: "HIGH",
      });
    }
  }

  // ebit = ebitda - depreciation
  if (metrics.ebit == null && metrics.ebitda != null && metrics.depreciation != null) {
    metrics.ebit = metrics.ebitda - metrics.depreciation;
    correction_log.push({
      field: "ebit",
      source: "derived_metric",
      raw_value: null,
      normalized_value: metrics.ebit,
      rule: "canonical_derivation",
      reason: `ebit derived: ebitda(${metrics.ebitda}) - depreciation(${metrics.depreciation}) = ${metrics.ebit}`,
      confidence: "HIGH",
    });
  }

  // ebt = ebit - financial_costs (when null but both inputs present)
  if (metrics.ebt == null && metrics.ebit != null && metrics.financial_costs != null) {
    metrics.ebt = metrics.ebit - metrics.financial_costs;
    correction_log.push({
      field: "ebt",
      source: "derived_metric",
      raw_value: null,
      normalized_value: metrics.ebt,
      rule: "canonical_derivation",
      reason: `ebt derived: ebit(${metrics.ebit}) - financial_costs(${metrics.financial_costs}) = ${metrics.ebt}`,
      confidence: "HIGH",
    });
  }

  // ── Phase 6b: Family-safe net_result = ebt derivation ──
  // Only fires when:
  // 1) net_result is null (no source candidate provided it)
  // 2) ebt is present
  // 3) normalization_profile_id is in explicit allowlist
  // 4) no semantic candidate with source_field_id indicating tax exists
  const NET_RESULT_FROM_EBT_PROFILES = new Set([
    "dinero_pnl_credit_v1",
    "economic_pnl_credit_v1",
    "economic_pnl_business_v1",
  ]);

  if (
    metrics.net_result == null &&
    metrics.ebt != null &&
    NET_RESULT_FROM_EBT_PROFILES.has(semantic.normalization_profile_id) &&
    !semantic.metric_candidates.some(c => /skat|tax/i.test(c.source_field_id))
  ) {
    metrics.net_result = metrics.ebt;
    correction_log.push({
      field: "net_result",
      source: "derived_metric",
      raw_value: null,
      normalized_value: metrics.net_result,
      rule: "family_safe_derivation",
      reason: `net_result derived from ebt(${metrics.ebt}) — profile ${semantic.normalization_profile_id} approved, no tax candidate present`,
      confidence: "HIGH",
    });
  }

  // ── Step 4: Build raw/normalized lines from semantic line_items ──
  const statementType = detectStatementType({ report_type: semantic.document_type === "resultatopgoerelse" ? "resultatopgørelse" : semantic.document_type });
  const periodBasis = semantic.basis_profile.selected_period_basis;

  const rawLines: RawLineEntry[] = semantic.line_items.map(li => ({
    name: li.source_label,
    period_amount: li.raw_value,
    ytd_amount: null,
    raw_sign: li.raw_value != null && li.raw_value < 0 ? "MINUS" : "PLUS",
    account_no: li.account_no,
    class: undefined,
  }));

  const normalizedLines = buildNormalizedLines(rawLines);

  // ── Step 5: Validation ──
  const aiChecks: ValidationCheck[] = semantic.parser_validation.checks.map(c => ({
    name: c.name, result: c.result, details: c.details,
  }));
  aiChecks.unshift({
    name: "deterministic_parser_status",
    result: semantic.parser_validation.parser_status === "PASS" ? "PASS" : "FAIL",
    details: `Semantic parser reported: ${semantic.parser_validation.parser_status}`,
  });

  const { status, canonical_checks, errors } = runExtendedValidation(
    { key_figures: {}, report_type: semantic.document_type }, metrics, periodBasis, statementType, aiChecks
  );

  const aiEligible = computeAiEligible(metrics, status, statementType, periodBasis);

  const output: CanonicalOutput = {
    template_id: semantic.template_id,
    statement_type: statementType,
    company_name: semantic.company_name,
    cvr: semantic.cvr,
    period_start: semantic.period_start,
    period_end: semantic.period_end,
    report_period_label: semantic.report_period_label,
    extraction_method: "deterministic_template",
    raw_lines: rawLines,
    normalized_lines: normalizedLines,
    selected_period_basis: periodBasis,
    metrics,
    correction_log,
    provenance: canonicalProvenance as any,
    validation: {
      status,
      ai_checks: aiChecks,
      server_checks: [],
      canonical_checks,
    },
    ai_eligible: aiEligible,
    ai_eligible_payload: null,
    deterministic_meta: semantic._deterministic_meta as any,
  };

  output.ai_eligible_payload = buildAiEligiblePayload(output);
  return output;
}

// ── Build AI Eligible Payload (minimal, clean) ──
export function buildAiEligiblePayload(canonical: CanonicalOutput): AiEligiblePayload | null {
  if (!canonical.ai_eligible) return null;
  return {
    input_type: "canonical",
    company_name: canonical.company_name,
    period_start: canonical.period_start,
    period_end: canonical.period_end,
    report_period_label: canonical.report_period_label,
    statement_type: canonical.statement_type,
    selected_period_basis: canonical.selected_period_basis,
    validation_status: "PASS",
    metrics: canonical.metrics,
  };
}

// ── Main: Build full canonical output ──
export function buildCanonicalOutput(
  extractedData: any,
  rawAiOutput: any,
  extractionMethod: string
): CanonicalOutput {
  const kf = extractedData?.key_figures || {};
  const statementType = detectStatementType(extractedData);
  const periodBasis = inferPeriodBasis(kf);

  // Normalize (pass extractionMethod for conditional sign handling)
  const { metrics, correction_log } = normalizeToCanonical(extractedData, extractionMethod);

  // Raw and normalized lines
  const rawLines = buildRawLines(extractedData);
  const normalizedLines = buildNormalizedLines(rawLines);

  // Provenance
  const provenance = buildProvenance(extractedData, metrics, extractionMethod);

  // AI checks from extraction
  const aiChecks: ValidationCheck[] = (extractedData?.validation?.checks || []).map((c: any) => ({
    name: c.name || "unknown",
    result: c.result || "SKIP",
    details: c.details || "",
  }));

  // Add parser_status as first AI check if present (deterministic path)
  if (extractedData?.validation?.parser_status) {
    aiChecks.unshift({
      name: "deterministic_parser_status",
      result: extractedData.validation.parser_status === "PASS" ? "PASS" : "FAIL",
      details: `Parser reported: ${extractedData.validation.parser_status}`,
    });
  }

  // Extended validation (12 checks)
  const { status, canonical_checks, errors } = runExtendedValidation(
    extractedData, metrics, periodBasis, statementType, aiChecks
  );

  // Extract deterministic metadata if present
  const deterministicMeta = extractedData?._deterministic_meta || null;

  // AI eligibility — golden fixture verified for DK_ECONOMIC_SALDOBALANCE_PDF_V1
  const aiEligible = computeAiEligible(metrics, status, statementType, periodBasis);

  // Build output (without payload yet)
  const output: CanonicalOutput = {
    template_id: deterministicMeta?.template_id || null,
    statement_type: statementType,
    company_name: extractedData?.company_name || null,
    cvr: extractedData?.cvr_number || null,
    period_start: extractedData?.period_start || null,
    period_end: extractedData?.period_end || null,
    report_period_label: extractedData?.report_period || null,
    extraction_method: extractionMethod,
    raw_lines: rawLines,
    normalized_lines: normalizedLines,
    selected_period_basis: periodBasis,
    metrics,
    correction_log,
    provenance,
    validation: {
      status,
      ai_checks: aiChecks,
      server_checks: [],
      canonical_checks,
    },
    ai_eligible: aiEligible,
    ai_eligible_payload: null,
    deterministic_meta: deterministicMeta,
  };

  output.ai_eligible_payload = buildAiEligiblePayload(output);

  return output;
}
