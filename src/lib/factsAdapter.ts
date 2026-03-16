/**
 * TEMPORARY COMPATIBILITY BRIDGE
 *
 * Maps canonical English facts metrics to the Danish-key Record<string, number>
 * format that existing UI components currently consume.
 *
 * Lifecycle: TEMPORARY — to be removed when components are migrated to consume
 * canonical English keys directly (Phase 1C+).
 *
 * DO NOT treat Danish-key remapping as the long-term target model.
 * This file exists solely to avoid a big-bang rewrite of all component internals
 * during the initial facts consumer cutover.
 */

/**
 * Mapping from canonical English metric keys (as stored in financial_report_facts.metrics)
 * to the Danish metric keys currently used by UI components.
 *
 * This must match the FULL key set that getEffectiveMetrics() / getEffectiveKeyFigures()
 * currently produce. Any key used by a consumer must be present here.
 */
const CANONICAL_TO_DANISH: Record<string, string> = {
  revenue: "omsaetning",
  gross_profit: "daekningsbidrag",
  payroll: "loenninger",
  cogs: "direkte_omkostninger",
  sales_costs: "salgsomkostninger",
  facility_costs: "lokaleomkostninger",
  admin_costs: "administrationsomkostninger",
  depreciation: "afskrivninger",
  ebt: "resultat_foer_skat",
  net_result: "resultat_efter_skat",
  assets_total: "aktiver_i_alt",
  equity_total: "egenkapital",
  cash: "bank_balance",
  trade_receivables: "debitorer",
  current_liabilities: "kreditorer",
};

/**
 * Convert canonical English metrics to Danish-key Record<string, number>.
 * Null values are dropped (matching getEffectiveKeyFigures() behavior).
 */
export function factsToDanishMetrics(
  metrics: Record<string, number | null> | null | undefined
): Record<string, number> {
  if (!metrics) return {};
  const out: Record<string, number> = {};
  for (const [canonicalKey, value] of Object.entries(metrics)) {
    if (value == null) continue;
    const danishKey = CANONICAL_TO_DANISH[canonicalKey];
    if (danishKey) {
      out[danishKey] = value;
    }
  }
  return out;
}

/**
 * Convert canonical English metrics to Danish-key Record<string, number | null>.
 * Preserves null values (matching getEffectiveMetrics() behavior).
 */
export function factsToDanishMetricsNullable(
  metrics: Record<string, number | null> | null | undefined
): Record<string, number | null> {
  if (!metrics) return {};
  const out: Record<string, number | null> = {};
  for (const [canonicalKey, value] of Object.entries(metrics)) {
    const danishKey = CANONICAL_TO_DANISH[canonicalKey];
    if (danishKey) {
      out[danishKey] = value ?? null;
    }
  }
  return out;
}
