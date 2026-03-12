/**
 * Extraction Comparison Utility — Phase 0
 * Diffs old vs new extraction output across all layers for safe cutover validation.
 *
 * Layers compared:
 *   1) Raw structural extraction
 *   2) Semantic extraction result (new architecture)
 *   3) Normalized metric output
 *   4) Canonical output / validation status
 *   5) Provenance completeness
 */

import type { CanonicalOutput, CanonicalMetrics } from "./canonicalTypes.ts";

// ── Diff Types ──

export interface MetricDiff {
  field: string;
  old_value: number | null;
  new_value: number | null;
  abs_diff: number | null;
  pct_diff: number | null;
  status: "match" | "minor" | "major" | "missing_old" | "missing_new" | "both_null";
}

export interface ValidationDiff {
  old_status: string;
  new_status: string;
  status_changed: boolean;
  old_check_count: number;
  new_check_count: number;
  old_errors: string[];
  new_errors: string[];
  new_errors_added: string[];
  old_errors_resolved: string[];
}

export interface ProvenanceDiff {
  old_fields_with_provenance: number;
  new_fields_with_provenance: number;
  fields_gained_provenance: string[];
  fields_lost_provenance: string[];
  new_has_normalization_profile: boolean;
  new_has_normalization_family: boolean;
}

export interface ExtractionComparisonResult {
  source_file: string;
  timestamp: string;
  metrics: MetricDiff[];
  validation: ValidationDiff;
  provenance: ProvenanceDiff;
  summary: {
    total_metrics_compared: number;
    exact_matches: number;
    minor_diffs: number;
    major_diffs: number;
    regressions: string[];
    improvements: string[];
  };
}

// ── Constants ──

const MINOR_THRESHOLD = 2;      // absolute diff ≤ 2 = minor (rounding)
const MAJOR_PCT_THRESHOLD = 1;  // >1% relative diff = major

// All canonical metric keys
const ALL_METRIC_KEYS: (keyof CanonicalMetrics)[] = [
  "revenue", "cogs", "gross_profit", "gross_margin_pct",
  "payroll", "payroll_related", "other_staff_costs",
  "sales_costs", "facility_costs", "admin_costs", "vehicle_costs",
  "ebitda", "depreciation", "ebit", "financial_costs",
  "extraordinary_items", "ebt", "net_result",
  "assets_total", "inventory", "receivables_total",
  "trade_receivables", "unbilled_wip", "cash",
  "equity_total", "equity_ratio_pct", "related_party_net",
  "provisions_total", "current_liabilities", "debt_total",
  "vat_payable", "liabilities_total",
];

// ── Metric comparison ──

function compareMetric(field: string, oldVal: number | null, newVal: number | null): MetricDiff {
  if (oldVal == null && newVal == null) {
    return { field, old_value: null, new_value: null, abs_diff: null, pct_diff: null, status: "both_null" };
  }
  if (oldVal == null) {
    return { field, old_value: null, new_value: newVal, abs_diff: null, pct_diff: null, status: "missing_old" };
  }
  if (newVal == null) {
    return { field, old_value: oldVal, new_value: null, abs_diff: null, pct_diff: null, status: "missing_new" };
  }

  const absDiff = Math.abs(newVal - oldVal);
  const avg = (Math.abs(oldVal) + Math.abs(newVal)) / 2;
  const pctDiff = avg === 0 ? (absDiff === 0 ? 0 : 100) : (absDiff / avg) * 100;

  let status: MetricDiff["status"];
  if (absDiff === 0) {
    status = "match";
  } else if (absDiff <= MINOR_THRESHOLD) {
    status = "minor";
  } else if (pctDiff > MAJOR_PCT_THRESHOLD) {
    status = "major";
  } else {
    status = "minor";
  }

  return {
    field,
    old_value: oldVal,
    new_value: newVal,
    abs_diff: Math.round(absDiff * 100) / 100,
    pct_diff: Math.round(pctDiff * 100) / 100,
    status,
  };
}

// ── Validation comparison ──

function compareValidation(oldOutput: CanonicalOutput, newOutput: CanonicalOutput): ValidationDiff {
  const oldErrors = oldOutput.validation?.canonical_checks
    ?.filter(c => c.result === "FAIL").map(c => c.name) || [];
  const newErrors = newOutput.validation?.canonical_checks
    ?.filter(c => c.result === "FAIL").map(c => c.name) || [];

  return {
    old_status: oldOutput.validation?.status || "unknown",
    new_status: newOutput.validation?.status || "unknown",
    status_changed: oldOutput.validation?.status !== newOutput.validation?.status,
    old_check_count: oldOutput.validation?.canonical_checks?.length || 0,
    new_check_count: newOutput.validation?.canonical_checks?.length || 0,
    old_errors: oldErrors,
    new_errors: newErrors,
    new_errors_added: newErrors.filter(e => !oldErrors.includes(e)),
    old_errors_resolved: oldErrors.filter(e => !newErrors.includes(e)),
  };
}

// ── Provenance comparison ──

function compareProvenance(oldOutput: CanonicalOutput, newOutput: CanonicalOutput): ProvenanceDiff {
  const oldKeys = Object.keys(oldOutput.provenance || {});
  const newKeys = Object.keys(newOutput.provenance || {});

  const newProvenanceEntries = Object.values(newOutput.provenance || {});
  const hasNormProfile = newProvenanceEntries.some((e: any) => e.normalization_profile_id != null);
  const hasNormFamily = newProvenanceEntries.some((e: any) => e.normalization_family != null);

  return {
    old_fields_with_provenance: oldKeys.length,
    new_fields_with_provenance: newKeys.length,
    fields_gained_provenance: newKeys.filter(k => !oldKeys.includes(k)),
    fields_lost_provenance: oldKeys.filter(k => !newKeys.includes(k)),
    new_has_normalization_profile: hasNormProfile,
    new_has_normalization_family: hasNormFamily,
  };
}

// ── Main comparison function ──

export function compareExtractions(
  oldOutput: CanonicalOutput,
  newOutput: CanonicalOutput,
  sourceFile: string = "unknown"
): ExtractionComparisonResult {
  // Compare all metrics
  const metricDiffs = ALL_METRIC_KEYS.map(key =>
    compareMetric(key, oldOutput.metrics?.[key] ?? null, newOutput.metrics?.[key] ?? null)
  );

  const validation = compareValidation(oldOutput, newOutput);
  const provenance = compareProvenance(oldOutput, newOutput);

  // Summary
  const nonNull = metricDiffs.filter(d => d.status !== "both_null");
  const exactMatches = metricDiffs.filter(d => d.status === "match" || d.status === "both_null").length;
  const minorDiffs = metricDiffs.filter(d => d.status === "minor").length;
  const majorDiffs = metricDiffs.filter(d => d.status === "major").length;

  // Regressions: metric was present and is now missing, or validation got worse
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const d of metricDiffs) {
    if (d.status === "missing_new") regressions.push(`${d.field}: was ${d.old_value}, now null`);
    if (d.status === "missing_old") improvements.push(`${d.field}: was null, now ${d.new_value}`);
    if (d.status === "major") regressions.push(`${d.field}: ${d.old_value} → ${d.new_value} (${d.pct_diff}%)`);
  }

  if (validation.status_changed) {
    if (validation.new_status === "FAIL" && validation.old_status === "PASS") {
      regressions.push(`Validation regressed: ${validation.old_status} → ${validation.new_status}`);
    }
    if (validation.new_status === "PASS" && validation.old_status === "FAIL") {
      improvements.push(`Validation improved: ${validation.old_status} → ${validation.new_status}`);
    }
  }

  for (const e of validation.new_errors_added) {
    regressions.push(`New validation error: ${e}`);
  }
  for (const e of validation.old_errors_resolved) {
    improvements.push(`Resolved validation error: ${e}`);
  }

  return {
    source_file: sourceFile,
    timestamp: new Date().toISOString(),
    metrics: metricDiffs,
    validation,
    provenance,
    summary: {
      total_metrics_compared: nonNull.length,
      exact_matches: exactMatches,
      minor_diffs: minorDiffs,
      major_diffs: majorDiffs,
      regressions,
      improvements,
    },
  };
}

// ── Human-readable diff output ──

export function formatComparisonReport(result: ExtractionComparisonResult): string {
  const lines: string[] = [];
  lines.push(`═══ Extraction Comparison: ${result.source_file} ═══`);
  lines.push(`Timestamp: ${result.timestamp}`);
  lines.push("");

  // Metrics summary
  lines.push(`── Metrics (${result.summary.total_metrics_compared} compared) ──`);
  lines.push(`  Exact matches: ${result.summary.exact_matches}`);
  lines.push(`  Minor diffs:   ${result.summary.minor_diffs}`);
  lines.push(`  Major diffs:   ${result.summary.major_diffs}`);
  lines.push("");

  // Show non-match metrics
  const interesting = result.metrics.filter(d => d.status !== "match" && d.status !== "both_null");
  if (interesting.length > 0) {
    lines.push("── Metric Details ──");
    for (const d of interesting) {
      const label = `  ${d.field.padEnd(24)}`;
      if (d.status === "missing_new") {
        lines.push(`${label} REGRESSION: ${d.old_value} → null`);
      } else if (d.status === "missing_old") {
        lines.push(`${label} NEW:        null → ${d.new_value}`);
      } else {
        lines.push(`${label} ${d.status.toUpperCase().padEnd(6)} ${d.old_value} → ${d.new_value} (Δ${d.abs_diff}, ${d.pct_diff}%)`);
      }
    }
    lines.push("");
  }

  // Validation
  lines.push("── Validation ──");
  lines.push(`  Status: ${result.validation.old_status} → ${result.validation.new_status}${result.validation.status_changed ? " ⚠️ CHANGED" : ""}`);
  if (result.validation.new_errors_added.length > 0) {
    lines.push(`  New errors: ${result.validation.new_errors_added.join(", ")}`);
  }
  if (result.validation.old_errors_resolved.length > 0) {
    lines.push(`  Resolved:   ${result.validation.old_errors_resolved.join(", ")}`);
  }
  lines.push("");

  // Provenance
  lines.push("── Provenance ──");
  lines.push(`  Old fields: ${result.provenance.old_fields_with_provenance}`);
  lines.push(`  New fields: ${result.provenance.new_fields_with_provenance}`);
  lines.push(`  Has normalization profile: ${result.provenance.new_has_normalization_profile}`);
  lines.push(`  Has normalization family:  ${result.provenance.new_has_normalization_family}`);
  lines.push("");

  // Summary
  if (result.summary.regressions.length > 0) {
    lines.push("── ⚠️ Regressions ──");
    for (const r of result.summary.regressions) lines.push(`  ❌ ${r}`);
    lines.push("");
  }
  if (result.summary.improvements.length > 0) {
    lines.push("── ✅ Improvements ──");
    for (const i of result.summary.improvements) lines.push(`  ✅ ${i}`);
    lines.push("");
  }

  const verdict = result.summary.regressions.length === 0 ? "✅ PASS — Zero regressions" : "❌ FAIL — Regressions detected";
  lines.push(`═══ Verdict: ${verdict} ═══`);

  return lines.join("\n");
}
