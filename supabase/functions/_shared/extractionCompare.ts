/**
 * Extraction Comparison Utility — Phase 0 (Extended)
 *
 * Multi-layer comparison across:
 *   1) Raw structural extraction (PDF lines, XLSX cells)
 *   2) Semantic extraction result
 *   3) Normalized metric output
 *   4) Canonical output / validation status
 *   5) Provenance completeness
 */

import type { CanonicalOutput, CanonicalMetrics } from "./canonicalTypes.ts";
import type { SemanticExtractionResult, SemanticMetricCandidate } from "./semanticTypes.ts";
import type { PdfParseResult, PdfParsedLine } from "./pdfTextParser.ts";

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

// ── Layer 1: Raw Structural Diff ──

export interface RawStructuralDiff {
  layer: "raw_structural";
  old_line_count: number;
  new_line_count: number;
  line_count_diff: number;
  old_sections: string[];
  new_sections: string[];
  sections_changed: boolean;
  old_subtotal_count: number;
  new_subtotal_count: number;
  subtotal_names_diff: { added: string[]; removed: string[] };
}

// ── Layer 2: Semantic Diff ──

export interface SemanticDiff {
  layer: "semantic";
  old_candidate_count: number;
  new_candidate_count: number;
  old_source_system: string | null;
  new_source_system: string | null;
  old_profile_id: string | null;
  new_profile_id: string | null;
  candidates_gained: string[];
  candidates_lost: string[];
  raw_value_diffs: Array<{
    source_field_id: string;
    old_raw_value: number | null;
    new_raw_value: number | null;
    status: "match" | "diff" | "missing_old" | "missing_new";
  }>;
}

// ── Layer 3: Normalized Metric Diff ──

export interface NormalizedMetricDiff {
  layer: "normalized_metrics";
  diffs: MetricDiff[];
  total_compared: number;
  exact_matches: number;
  minor_diffs: number;
  major_diffs: number;
}

// ── Full Multi-Layer Result ──

export interface MultiLayerComparisonResult {
  source_file: string;
  timestamp: string;
  raw_structural: RawStructuralDiff | null;
  semantic: SemanticDiff | null;
  normalized_metrics: NormalizedMetricDiff;
  validation: ValidationDiff;
  provenance: ProvenanceDiff;
  summary: {
    total_regressions: number;
    regressions: string[];
    improvements: string[];
    layer_verdicts: Record<string, "PASS" | "FAIL" | "SKIP">;
  };
}

// ── Constants ──

const MINOR_THRESHOLD = 2;
const MAJOR_PCT_THRESHOLD = 1;

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

// ── Layer 1: Compare Raw Structural ──

export function compareRawStructural(
  oldLines: PdfParsedLine[] | null,
  newLines: PdfParsedLine[] | null
): RawStructuralDiff | null {
  if (!oldLines && !newLines) return null;

  const ol = oldLines || [];
  const nl = newLines || [];

  const oldSections = [...new Set(ol.map(l => l.section || "null"))];
  const newSections = [...new Set(nl.map(l => l.section || "null"))];

  const oldSubtotals = ol.filter(l => l.is_subtotal).map(l => l.name);
  const newSubtotals = nl.filter(l => l.is_subtotal).map(l => l.name);

  return {
    layer: "raw_structural",
    old_line_count: ol.length,
    new_line_count: nl.length,
    line_count_diff: nl.length - ol.length,
    old_sections: oldSections,
    new_sections: newSections,
    sections_changed: JSON.stringify(oldSections.sort()) !== JSON.stringify(newSections.sort()),
    old_subtotal_count: oldSubtotals.length,
    new_subtotal_count: newSubtotals.length,
    subtotal_names_diff: {
      added: newSubtotals.filter(n => !oldSubtotals.includes(n)),
      removed: oldSubtotals.filter(n => !newSubtotals.includes(n)),
    },
  };
}

// ── Layer 2: Compare Semantic ──

export function compareSemantic(
  oldSemantic: SemanticExtractionResult | null,
  newSemantic: SemanticExtractionResult | null
): SemanticDiff | null {
  if (!oldSemantic && !newSemantic) return null;

  const oldCandidates = oldSemantic?.metric_candidates || [];
  const newCandidates = newSemantic?.metric_candidates || [];

  const oldIds = oldCandidates.map(c => c.source_field_id);
  const newIds = newCandidates.map(c => c.source_field_id);

  const rawValueDiffs = [...new Set([...oldIds, ...newIds])].map(id => {
    const oldC = oldCandidates.find(c => c.source_field_id === id);
    const newC = newCandidates.find(c => c.source_field_id === id);
    if (!oldC) return { source_field_id: id, old_raw_value: null, new_raw_value: newC?.raw_value ?? null, status: "missing_old" as const };
    if (!newC) return { source_field_id: id, old_raw_value: oldC.raw_value, new_raw_value: null, status: "missing_new" as const };
    return {
      source_field_id: id,
      old_raw_value: oldC.raw_value,
      new_raw_value: newC.raw_value,
      status: oldC.raw_value === newC.raw_value ? "match" as const : "diff" as const,
    };
  });

  return {
    layer: "semantic",
    old_candidate_count: oldCandidates.length,
    new_candidate_count: newCandidates.length,
    old_source_system: oldSemantic?.source_system || null,
    new_source_system: newSemantic?.source_system || null,
    old_profile_id: oldSemantic?.normalization_profile_id || null,
    new_profile_id: newSemantic?.normalization_profile_id || null,
    candidates_gained: newIds.filter(id => !oldIds.includes(id)),
    candidates_lost: oldIds.filter(id => !newIds.includes(id)),
    raw_value_diffs: rawValueDiffs,
  };
}

// ── Layer 3: Compare Normalized Metrics ──

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
  if (absDiff === 0) status = "match";
  else if (absDiff <= MINOR_THRESHOLD) status = "minor";
  else if (pctDiff > MAJOR_PCT_THRESHOLD) status = "major";
  else status = "minor";

  return {
    field, old_value: oldVal, new_value: newVal,
    abs_diff: Math.round(absDiff * 100) / 100,
    pct_diff: Math.round(pctDiff * 100) / 100,
    status,
  };
}

export function compareNormalizedMetrics(
  oldMetrics: CanonicalMetrics | null,
  newMetrics: CanonicalMetrics | null
): NormalizedMetricDiff {
  const om = oldMetrics || ({} as CanonicalMetrics);
  const nm = newMetrics || ({} as CanonicalMetrics);
  const diffs = ALL_METRIC_KEYS.map(key => compareMetric(key, om[key] ?? null, nm[key] ?? null));
  const nonNull = diffs.filter(d => d.status !== "both_null");

  return {
    layer: "normalized_metrics",
    diffs,
    total_compared: nonNull.length,
    exact_matches: diffs.filter(d => d.status === "match" || d.status === "both_null").length,
    minor_diffs: diffs.filter(d => d.status === "minor").length,
    major_diffs: diffs.filter(d => d.status === "major").length,
  };
}

// ── Layer 4+5: Validation + Provenance (from original) ──

function compareValidation(oldOutput: CanonicalOutput, newOutput: CanonicalOutput): ValidationDiff {
  const oldErrors = oldOutput.validation?.canonical_checks?.filter(c => c.result === "FAIL").map(c => c.name) || [];
  const newErrors = newOutput.validation?.canonical_checks?.filter(c => c.result === "FAIL").map(c => c.name) || [];
  return {
    old_status: oldOutput.validation?.status || "unknown",
    new_status: newOutput.validation?.status || "unknown",
    status_changed: oldOutput.validation?.status !== newOutput.validation?.status,
    old_check_count: oldOutput.validation?.canonical_checks?.length || 0,
    new_check_count: newOutput.validation?.canonical_checks?.length || 0,
    old_errors: oldErrors, new_errors: newErrors,
    new_errors_added: newErrors.filter(e => !oldErrors.includes(e)),
    old_errors_resolved: oldErrors.filter(e => !newErrors.includes(e)),
  };
}

function compareProvenance(oldOutput: CanonicalOutput, newOutput: CanonicalOutput): ProvenanceDiff {
  const oldKeys = Object.keys(oldOutput.provenance || {});
  const newKeys = Object.keys(newOutput.provenance || {});
  const newEntries = Object.values(newOutput.provenance || {});
  return {
    old_fields_with_provenance: oldKeys.length,
    new_fields_with_provenance: newKeys.length,
    fields_gained_provenance: newKeys.filter(k => !oldKeys.includes(k)),
    fields_lost_provenance: oldKeys.filter(k => !newKeys.includes(k)),
    new_has_normalization_profile: newEntries.some((e: any) => e.normalization_profile_id != null),
    new_has_normalization_family: newEntries.some((e: any) => e.normalization_family != null),
  };
}

// ── Main: Multi-layer comparison ──

export function compareExtractions(
  oldOutput: CanonicalOutput,
  newOutput: CanonicalOutput,
  sourceFile: string = "unknown",
  options?: {
    oldRawLines?: PdfParsedLine[];
    newRawLines?: PdfParsedLine[];
    oldSemantic?: SemanticExtractionResult;
    newSemantic?: SemanticExtractionResult;
  }
): MultiLayerComparisonResult {
  const raw = compareRawStructural(options?.oldRawLines || null, options?.newRawLines || null);
  const semantic = compareSemantic(options?.oldSemantic || null, options?.newSemantic || null);
  const normalized = compareNormalizedMetrics(oldOutput?.metrics || null, newOutput?.metrics || null);
  const validation = compareValidation(oldOutput, newOutput);
  const provenance = compareProvenance(oldOutput, newOutput);

  // Aggregate regressions
  const regressions: string[] = [];
  const improvements: string[] = [];
  const layerVerdicts: Record<string, "PASS" | "FAIL" | "SKIP"> = {};

  // Raw structural verdict
  if (raw) {
    if (raw.subtotal_names_diff.removed.length > 0) {
      regressions.push(`Raw: lost subtotals: ${raw.subtotal_names_diff.removed.join(", ")}`);
    }
    layerVerdicts.raw_structural = raw.subtotal_names_diff.removed.length > 0 ? "FAIL" : "PASS";
  } else {
    layerVerdicts.raw_structural = "SKIP";
  }

  // Semantic verdict
  if (semantic) {
    for (const d of semantic.raw_value_diffs) {
      if (d.status === "missing_new") regressions.push(`Semantic: lost candidate ${d.source_field_id}`);
      if (d.status === "diff") regressions.push(`Semantic: raw_value changed for ${d.source_field_id}: ${d.old_raw_value} → ${d.new_raw_value}`);
    }
    layerVerdicts.semantic = semantic.candidates_lost.length > 0 ? "FAIL" : "PASS";
  } else {
    layerVerdicts.semantic = "SKIP";
  }

  // Normalized metrics verdict
  for (const d of normalized.diffs) {
    if (d.status === "missing_new") regressions.push(`Metric: ${d.field} was ${d.old_value}, now null`);
    if (d.status === "missing_old") improvements.push(`Metric: ${d.field} was null, now ${d.new_value}`);
    if (d.status === "major") regressions.push(`Metric: ${d.field} ${d.old_value} → ${d.new_value} (${d.pct_diff}%)`);
  }
  layerVerdicts.normalized_metrics = normalized.major_diffs > 0 ? "FAIL" : "PASS";

  // Validation verdict
  if (validation.status_changed) {
    if (validation.new_status === "FAIL" && validation.old_status === "PASS") {
      regressions.push(`Validation: ${validation.old_status} → ${validation.new_status}`);
    } else if (validation.new_status === "PASS" && validation.old_status === "FAIL") {
      improvements.push(`Validation: ${validation.old_status} → ${validation.new_status}`);
    }
  }
  for (const e of validation.new_errors_added) regressions.push(`Validation: new error ${e}`);
  for (const e of validation.old_errors_resolved) improvements.push(`Validation: resolved ${e}`);
  layerVerdicts.validation = validation.new_errors_added.length > 0 ? "FAIL" : "PASS";

  // Provenance verdict
  layerVerdicts.provenance = provenance.fields_lost_provenance.length > 0 ? "FAIL" : "PASS";
  if (provenance.fields_lost_provenance.length > 0) {
    regressions.push(`Provenance: lost for ${provenance.fields_lost_provenance.join(", ")}`);
  }

  return {
    source_file: sourceFile,
    timestamp: new Date().toISOString(),
    raw_structural: raw,
    semantic,
    normalized_metrics: normalized,
    validation,
    provenance,
    summary: {
      total_regressions: regressions.length,
      regressions,
      improvements,
      layer_verdicts: layerVerdicts,
    },
  };
}

// ── Human-readable report ──

export function formatComparisonReport(result: MultiLayerComparisonResult): string {
  const lines: string[] = [];
  lines.push(`═══ Multi-Layer Comparison: ${result.source_file} ═══`);
  lines.push(`Timestamp: ${result.timestamp}`);
  lines.push("");

  // Layer verdicts
  lines.push("── Layer Verdicts ──");
  for (const [layer, verdict] of Object.entries(result.summary.layer_verdicts)) {
    const icon = verdict === "PASS" ? "✅" : verdict === "FAIL" ? "❌" : "⏭️";
    lines.push(`  ${icon} ${layer}: ${verdict}`);
  }
  lines.push("");

  // Raw structural
  if (result.raw_structural) {
    const r = result.raw_structural;
    lines.push("── Raw Structural ──");
    lines.push(`  Lines: ${r.old_line_count} → ${r.new_line_count} (${r.line_count_diff >= 0 ? "+" : ""}${r.line_count_diff})`);
    lines.push(`  Subtotals: ${r.old_subtotal_count} → ${r.new_subtotal_count}`);
    if (r.subtotal_names_diff.added.length) lines.push(`  Added: ${r.subtotal_names_diff.added.join(", ")}`);
    if (r.subtotal_names_diff.removed.length) lines.push(`  Removed: ${r.subtotal_names_diff.removed.join(", ")}`);
    lines.push("");
  }

  // Normalized metrics
  const m = result.normalized_metrics;
  lines.push(`── Normalized Metrics (${m.total_compared} compared) ──`);
  lines.push(`  Exact: ${m.exact_matches} | Minor: ${m.minor_diffs} | Major: ${m.major_diffs}`);
  const interesting = m.diffs.filter(d => d.status !== "match" && d.status !== "both_null");
  for (const d of interesting) {
    const label = `  ${d.field.padEnd(24)}`;
    if (d.status === "missing_new") lines.push(`${label} ❌ ${d.old_value} → null`);
    else if (d.status === "missing_old") lines.push(`${label} ✅ null → ${d.new_value}`);
    else lines.push(`${label} ${d.status.toUpperCase().padEnd(6)} ${d.old_value} → ${d.new_value} (Δ${d.abs_diff})`);
  }
  lines.push("");

  // Summary
  if (result.summary.regressions.length > 0) {
    lines.push("── ⚠️ Regressions ──");
    for (const r of result.summary.regressions) lines.push(`  ❌ ${r}`);
    lines.push("");
  }

  const verdict = result.summary.total_regressions === 0 ? "✅ PASS — Zero regressions" : "❌ FAIL — Regressions detected";
  lines.push(`═══ Verdict: ${verdict} ═══`);
  return lines.join("\n");
}
