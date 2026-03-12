/**
 * Test Fixture Infrastructure — Phase 1
 *
 * Fixture loaders, shape definitions, and assertion helpers
 * for all extraction layers (raw → semantic → normalized → canonical).
 *
 * Fixture directories:
 *   supabase/functions/_test_fixtures/
 *     pdf_binaries/          — real sanitized PDF files
 *     xlsx_raw/              — XLSX raw parse results
 *     semantic/              — SemanticExtractionResult snapshots
 *     canonical/             — CanonicalOutput golden snapshots
 *     normalization_profiles/ — profile-specific sign test cases
 */

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CanonicalOutput, CanonicalMetrics } from "../_shared/canonicalTypes.ts";
import type { SemanticExtractionResult, SemanticMetricCandidate } from "../_shared/semanticTypes.ts";
import type { NormalizationProfile, MetricFamily } from "../_shared/normalizationProfiles.ts";

// ── Fixture Shape: Canonical Golden Output ──

export interface CanonicalFixture {
  fixture_id: string;
  description: string;
  source_file: string;
  source_system: string;
  document_type: string;
  template_id: string;
  expected_metrics: Partial<CanonicalMetrics>;
  expected_validation_status: "PASS" | "FAIL" | "UNSURE";
  expected_statement_type: string;
  expected_period_basis: string;
  /** Fields that MUST have non-null provenance */
  expected_provenance_fields: string[];
}

// ── Fixture Shape: Normalization Profile Test Case ──

export interface NormalizationProfileFixture {
  fixture_id: string;
  description: string;
  profile_id: string;
  candidates: Array<{
    source_field_id: string;
    normalization_family: MetricFamily;
    raw_value: number;
    expected_normalized_value: number | null;
    expected_action: string;
    expected_rule_type: "family_default" | "field_override" | "conditional" | "reject";
  }>;
}

// ── Fixture Shape: Semantic Extraction Snapshot ──

export interface SemanticFixture {
  fixture_id: string;
  description: string;
  source_file: string;
  expected_source_system: string;
  expected_document_type: string;
  expected_template_id: string;
  expected_normalization_profile_id: string;
  expected_metric_candidate_count: number;
  /** Spot-check specific candidates */
  expected_candidates: Array<{
    source_field_id: string;
    normalization_family: MetricFamily;
    raw_value: number | null;
    proposed_canonical_target: string | null;
  }>;
}

// ── Fixture Shape: Source Fingerprint Test Case ──

export interface SourceFingerprintFixture {
  fixture_id: string;
  description: string;
  file_name: string;
  file_type: "pdf" | "xlsx" | "csv";
  /** Simulated text/header content for fingerprinting */
  raw_text?: string;
  header_rows?: any[][];
  expected_source_system: string;
  expected_allows_ai: boolean;
}

// ── Assertion Helpers ──

/**
 * Assert canonical metrics match expected values within tolerance.
 * Only checks fields present in expected (partial match).
 */
export function assertMetricsMatch(
  actual: CanonicalMetrics,
  expected: Partial<CanonicalMetrics>,
  tolerance: number = 2
): void {
  for (const [key, expectedVal] of Object.entries(expected)) {
    const actualVal = (actual as any)[key];
    if (expectedVal === null) {
      assertEquals(actualVal, null, `${key}: expected null, got ${actualVal}`);
    } else if (expectedVal !== undefined) {
      assert(actualVal != null, `${key}: expected ${expectedVal}, got null`);
      const diff = Math.abs(actualVal - expectedVal);
      assert(
        diff <= tolerance,
        `${key}: expected ${expectedVal}, got ${actualVal} (diff ${diff} > tolerance ${tolerance})`
      );
    }
  }
}

/**
 * Assert provenance completeness: every listed field must have non-null provenance.
 */
export function assertProvenanceComplete(
  provenance: Record<string, any>,
  requiredFields: string[]
): void {
  for (const field of requiredFields) {
    assert(
      provenance[field] != null,
      `Provenance missing for field: ${field}`
    );
  }
}

/**
 * Assert that a normalization profile fixture produces expected results.
 * This is a shape validator — actual normalization logic is tested separately.
 */
export function assertNormalizationFixtureShape(fixture: NormalizationProfileFixture): void {
  assert(fixture.profile_id.length > 0, "profile_id must be non-empty");
  assert(fixture.candidates.length > 0, "must have at least one candidate");
  for (const c of fixture.candidates) {
    assert(c.source_field_id.length > 0, "source_field_id must be non-empty");
    assert(
      ["abs", "negate", "keep", "conditional", "reject"].includes(c.expected_action),
      `Invalid expected_action: ${c.expected_action}`
    );
  }
}
