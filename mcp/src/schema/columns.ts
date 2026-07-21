/**
 * Canonical column constants, transcribed verbatim from RECON.md §3's
 * live-verified column lists (reconciled against information_schema, §7).
 *
 * Schema drift is a CONFIRMED pattern, not a one-off (§7): undocumented
 * SQL-editor ALTERs have landed columns in prod that never reached the repo's
 * migrations. The defence is to NEVER `select *` — every query names only known
 * columns. These constants are the single source of those names for Sprint 2's
 * three read tools; each list is the minimal set that its tool actually needs.
 */

/**
 * `companies` (RECON.md §3.1) — get_company_overview.
 * `status` is text DEFAULT 'active'. The committed-period figures come from
 * financial_report_facts, not from here.
 */
export const COMPANIES_COLUMNS = ["id", "name", "status"] as const;

/**
 * `financial_reports` (RECON.md §3.2) — get_parse_status.
 * `status` is the parse status (processing/processed/error). `company_id` is
 * NOT NULL and drives dbFor scoping; `deleted_at` drives the soft-delete filter
 * (deleted_at IS NULL). `validation_errors` is text[].
 */
export const FINANCIAL_REPORTS_COLUMNS = [
  "id",
  "company_id",
  "file_name",
  "report_type",
  "report_period",
  "status",
  "validation_status",
  "validation_errors",
  "uploaded_at",
  "processed_at",
  "manual_override_status",
  "deleted_at",
] as const;

/**
 * `financial_report_facts` (RECON.md §3.3) — get_company_overview (latest
 * committed period_key + committed-period count) and get_financial_metrics.
 * The KPI keys (revenue, gross_profit, …) live INSIDE the `metrics` jsonb, not
 * as columns. `company_id` drives dbFor scoping. UNIQUE(company_id, period_key).
 */
export const FINANCIAL_REPORT_FACTS_COLUMNS = [
  "company_id",
  "period_key",
  "period_label",
  "source_type",
  "committed_at",
  "metrics",
] as const;

/**
 * Narrow projection of financial_report_facts for get_company_overview: only the
 * tenant key and the period identity needed to compute the latest committed
 * period_key (= max(period_key), §3.3: YYYY-MM sorts chronologically) and the
 * committed-period count. Deliberately EXCLUDES `metrics` (the KPI jsonb) so the
 * cross-tenant scan stays tiny (Tool 1 design (1)). `committed_at` is excluded
 * too: the "latest by committed_at" alternative was rejected against real data
 * (Brick Works divergence), so it is dead weight here.
 */
export const COMPANY_OVERVIEW_FACTS_COLUMNS = [
  "company_id",
  "period_key",
] as const;

export type CompaniesColumn = (typeof COMPANIES_COLUMNS)[number];
export type FinancialReportsColumn = (typeof FINANCIAL_REPORTS_COLUMNS)[number];
export type FinancialReportFactsColumn =
  (typeof FINANCIAL_REPORT_FACTS_COLUMNS)[number];

/**
 * Builds a PostgREST select list from a column constant. Joining with "," (no
 * spaces) keeps the wire format exact. Tools call this instead of ever writing
 * a literal "*", so the "known columns only" rule cannot be forgotten.
 */
export function selectList(columns: readonly string[]): string {
  return columns.join(",");
}
