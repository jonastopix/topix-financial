/**
 * Canonical Output Schema — Phase 3 Hardening
 * Single source of truth for all financial report normalization.
 */

// ── Statement Types ──
export type StatementType = "pnl" | "trial_balance" | "balance" | "combined" | "unknown";
export type PeriodBasis = "period" | "ytd" | "unknown";
export type ValidationStatus = "PASS" | "FAIL" | "UNSURE";
export type CheckResult = "PASS" | "FAIL" | "SKIP";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type CorrectionSource = "key_figure" | "line_item" | "derived_metric";

// ── Canonical Metrics (English names, all nullable) ──
export interface CanonicalMetrics {
  revenue: number | null;
  cogs: number | null;
  gross_profit: number | null;
  gross_margin_pct: number | null;
  payroll: number | null;
  payroll_related: number | null;
  other_staff_costs: number | null;
  sales_costs: number | null;
  facility_costs: number | null;
  admin_costs: number | null;
  vehicle_costs: number | null;
  ebitda: number | null;
  depreciation: number | null;
  ebit: number | null;
  financial_costs: number | null;
  extraordinary_items: number | null;
  ebt: number | null;
  net_result: number | null;
  assets_total: number | null;
  inventory: number | null;
  receivables_total: number | null;
  trade_receivables: number | null;
  unbilled_wip: number | null;
  cash: number | null;
  equity_total: number | null;
  equity_ratio_pct: number | null;
  related_party_net: number | null;
  provisions_total: number | null;
  current_liabilities: number | null;
  debt_total: number | null;
  vat_payable: number | null;
  liabilities_total: number | null;
}

// ── Correction Log Entry ──
export interface CorrectionLogEntry {
  field: string;
  source: CorrectionSource;
  raw_value: number | null;
  normalized_value: number | null;
  rule: string;
  reason: string;
  confidence: Confidence;
}

// ── Provenance Entry ──
export interface ProvenanceEntry {
  source_type: "ai_extraction" | "deterministic_template";
  label_match: string | null;
  report_type: string | null;
  confidence: Confidence;
  line_item_reference: string | null;
}

// ── Validation Check ──
export interface ValidationCheck {
  name: string;
  result: CheckResult;
  details: string;
}

// ── Raw Line (from AI extraction) ──
export interface RawLineEntry {
  name: string;
  period_amount: number | null;
  ytd_amount: number | null;
  raw_sign?: string;
  account_no?: string | null;
  class?: string;
}

// ── Normalized Line (mapped to canonical classes) ──
export interface NormalizedLineEntry {
  name: string;
  canonical_class: string | null;
  canonical_name: string | null;
  period_amount: number | null;
  ytd_amount: number | null;
  raw_sign: string | null;
  account_no: string | null;
}

// ── AI Eligible Payload (minimal, clean — what AI receives) ──
export interface AiEligiblePayload {
  input_type: "canonical";
  company_name: string | null;
  period_start: string | null;
  period_end: string | null;
  report_period_label: string | null;
  statement_type: StatementType;
  selected_period_basis: PeriodBasis;
  validation_status: "PASS";
  metrics: CanonicalMetrics;
}

// ── Full Canonical Output ──
export interface CanonicalOutput {
  template_id: string | null;
  statement_type: StatementType;
  company_name: string | null;
  cvr: string | null;
  period_start: string | null;
  period_end: string | null;
  report_period_label: string | null;
  extraction_method: string;

  raw_lines: RawLineEntry[];
  normalized_lines: NormalizedLineEntry[];

  selected_period_basis: PeriodBasis;

  metrics: CanonicalMetrics;
  correction_log: CorrectionLogEntry[];
  provenance: Record<string, ProvenanceEntry>;

  validation: {
    status: ValidationStatus;
    ai_checks: ValidationCheck[];
    server_checks: ValidationCheck[];
    canonical_checks: ValidationCheck[];
  };

  ai_eligible: boolean;
  ai_eligible_payload: AiEligiblePayload | null;
}
