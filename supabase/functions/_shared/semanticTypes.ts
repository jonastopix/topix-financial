/**
 * Semantic Extraction Types — Rev 7 Architecture
 *
 * Contracts for the semantic intermediate layer between
 * raw parsing and canonical normalization/mapping.
 */

import type { MetricFamily } from "./normalizationProfiles.ts";

// ── Source System ──

export type SourceSystem = "economic" | "dinero" | "kj_auto" | "unknown";
export type DocumentType = "resultatopgoerelse" | "saldobalance" | "combined" | "unknown";

// ── Semantic Metric Candidate ──

export interface SemanticMetricCandidate {
  // ── Source semantics (adapter-AUTHORITATIVE) ──
  source_field_id: string;
  normalization_family: MetricFamily;
  raw_value: number | null;
  raw_sign: "positive" | "negative" | "zero";
  sign_convention: "credit" | "business" | "unknown";
  source_label: string;
  source_row_index: number | null;
  source_column_slot: number | null;
  source_cell_address: string | null;
  basis: "period" | "ytd";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string[];

  // ── Advisory downstream hint (NOT used by normalization) ──
  proposed_canonical_target: string | null;
}

// ── Semantic Line Item (non-metric rows for provenance) ──

export interface SemanticLineItem {
  source_field_id: string;
  source_label: string;
  raw_value: number | null;
  basis: "period" | "ytd" | null;
  account_no: string | null;
  source_row_index: number | null;
}

// ── Basis Profile ──

export type BasisMode = "single" | "mixed";

export interface BasisProfile {
  mode: BasisMode;
  selected_period_basis: "period" | "ytd";
  metric_basis_map?: Record<string, "period" | "ytd">;
}

// ── Parser Validation (from adapter) ──

export interface AdapterParserValidation {
  parser_status: "PASS" | "FAIL";
  checks: Array<{
    name: string;
    result: "PASS" | "FAIL" | "SKIP";
    details: string;
  }>;
}

// ── Deterministic Metadata ──

export interface SemanticDeterministicMeta {
  template_id: string;
  parser_confidence: "HIGH" | "MEDIUM" | "LOW";
  detection_score: number;
  raw_line_count: number;
  normalized_line_count: number;
  column_basis_rule?: "single" | "mixed";
}

// ── Full Semantic Extraction Result ──

export interface SemanticExtractionResult {
  // ── Source identity (adapter-authoritative) ──
  source_system: SourceSystem;
  document_type: DocumentType;
  template_id: string;
  sign_convention: "credit" | "business" | "unknown";
  normalization_profile_id: string;

  // ── Metadata ──
  company_name: string | null;
  cvr: string | null;
  period_start: string | null;
  period_end: string | null;
  report_period_label: string | null;

  // ── Data ──
  metric_candidates: SemanticMetricCandidate[];
  line_items: SemanticLineItem[];
  basis_profile: BasisProfile;
  parser_validation: AdapterParserValidation;
  _deterministic_meta: SemanticDeterministicMeta;
}

// ── Enriched Provenance Entry (post-normalization) ──

export interface EnrichedProvenanceEntry {
  source_type: "deterministic_template" | "ai_extraction";
  source_system: SourceSystem | null;
  template_id: string | null;
  source_field_id: string | null;
  source_label: string | null;
  source_row_index: number | null;
  source_column_slot: number | null;
  source_cell_address: string | null;
  basis: "period" | "ytd" | null;
  raw_value: number | null;
  normalized_value: number | null;
  normalization_profile_id: string | null;
  normalization_family: string | null;
  normalization_rule_type: "family_default" | "field_override" | "conditional" | "reject" | null;
  normalization_action: string | null;
  canonical_metric: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

// ── Report Processing Status (machine-readable) ──

export type ReportProcessingStatusCode =
  | "extraction_success"
  | "ai_fallback_used"
  | "known_source_unsupported_variant"
  | "structural_parse_fail"
  | "basis_profile_fail"
  | "sign_normalization_fail"
  | "canonical_validation_fail"
  | "unknown_source";
