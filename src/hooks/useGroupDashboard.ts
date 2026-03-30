import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { buildGroupAggregates, type GroupCompanySummary, type GroupAggregates } from "@/lib/groupDashboardUtils";

// Re-export types for backward compatibility
export type { GroupCompanySummary, GroupAggregates };

const DANISH_MONTHS = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

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

  const { data: historicalData } = useQuery({
    queryKey: ["group-historical", user?.id],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAgoKey = sixMonthsAgo.toISOString().slice(0, 7);

      const { data: groupIdData } = await supabase.rpc("user_group_id" as any);
      const { data: groupCos } = await supabase
        .from("group_companies" as any)
        .select("company_id")
        .eq("group_id", groupIdData);

      const companyIds = (groupCos || []).map((r: any) => r.company_id);
      if (companyIds.length === 0) return [];

      const { data: facts } = await supabase
        .from("financial_report_facts")
        .select("company_id, period_key, metrics")
        .in("company_id", companyIds)
        .gte("period_key", sixMonthsAgoKey)
        .order("period_key", { ascending: true });

      const byPeriod = new Map<string, { revenue: number; ebt: number; cash: number }>();
      for (const f of (facts || []) as any[]) {
        const m = f.metrics || {};
        const e = byPeriod.get(f.period_key) || { revenue: 0, ebt: 0, cash: 0 };
        byPeriod.set(f.period_key, {
          revenue: e.revenue + (Number(m.revenue) || 0),
          ebt: e.ebt + (Number(m.ebt) || 0),
          cash: e.cash + (Number(m.cash) || 0),
        });
      }

      return [...byPeriod.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => {
          const [year, month] = key.split("-");
          return {
            period_key: key,
            label: `${DANISH_MONTHS[parseInt(month, 10) - 1]} ${year.slice(2)}`,
            ...val,
          };
        });
    },
    enabled: !!user && isGroupUser,
    staleTime: 5 * 60_000,
  });

  const aggregates = useMemo<GroupAggregates>(
    () => buildGroupAggregates(companies ?? []),
    [companies]
  );

  return {
    companies: companies ?? [],
    aggregates,
    historicalData: historicalData ?? [],
    isLoading,
    error,
    groupName,
    isGroupUser,
  };
}
