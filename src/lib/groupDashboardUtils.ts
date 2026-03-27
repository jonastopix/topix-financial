/**
 * Shared types and transformation logic for group dashboards.
 * Used by both member (useGroupDashboard) and advisor (useAdvisorGroupDashboard) hooks.
 */

export interface GroupCompanySummary {
  company_id: string;
  company_name: string;
  logo_url: string | null;
  has_report: boolean;
  has_verified_metrics: boolean;
  latest_report_id: string | null;
  effective_period_label: string | null;
  effective_period_key: string | null;
  revenue: number | null;
  gross_profit: number | null;
  ebt: number | null;
  cash: number | null;
  missing_current_period: boolean;
  has_pulse?: boolean;
}

export interface GroupAggregates {
  totalRevenue: number;
  totalGrossProfit: number;
  totalEbt: number;
  totalCash: number;
  companiesWithMetrics: number;
  companiesTotal: number;
  companiesMissingPeriod: number;
}

/**
 * Pure transformer: builds aggregate KPIs from a list of company summaries.
 * Single source of truth for both member and advisor dashboard hooks.
 */
export function buildGroupAggregates(companies: GroupCompanySummary[]): GroupAggregates {
  if (companies.length === 0) {
    return {
      totalRevenue: 0,
      totalGrossProfit: 0,
      totalEbt: 0,
      totalCash: 0,
      companiesWithMetrics: 0,
      companiesTotal: 0,
      companiesMissingPeriod: 0,
    };
  }

  let totalRevenue = 0;
  let totalGrossProfit = 0;
  let totalEbt = 0;
  let totalCash = 0;
  let companiesWithMetrics = 0;
  let companiesMissingPeriod = 0;

  for (const c of companies) {
    if (c.has_verified_metrics) {
      companiesWithMetrics++;
      totalRevenue += c.revenue ?? 0;
      totalGrossProfit += c.gross_profit ?? 0;
      totalEbt += c.ebt ?? 0;
      totalCash += c.cash ?? 0;
    }
    if (c.missing_current_period) {
      companiesMissingPeriod++;
    }
  }

  return {
    totalRevenue,
    totalGrossProfit,
    totalEbt,
    totalCash,
    companiesWithMetrics,
    companiesTotal: companies.length,
    companiesMissingPeriod,
  };
}
