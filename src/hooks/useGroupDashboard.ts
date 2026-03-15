import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";

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

export function useGroupDashboard() {
  const { user, isGroupUser, groupName } = useAuth();

  const { data: companies, isLoading, error } = useQuery({
    queryKey: ["group-financial-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_my_group_financial_summary" as any
      );
      if (error) throw error;
      return (data as unknown as GroupCompanySummary[]) || [];
    },
    enabled: !!user && isGroupUser,
    staleTime: 60_000,
  });

  const aggregates = useMemo<GroupAggregates>(() => {
    if (!companies || companies.length === 0) {
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
  }, [companies]);

  return {
    companies: companies ?? [],
    aggregates,
    isLoading,
    error,
    groupName,
    isGroupUser,
  };
}
