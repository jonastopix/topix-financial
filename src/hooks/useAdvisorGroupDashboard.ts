import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { buildGroupAggregates, type GroupCompanySummary, type GroupAggregates } from "@/lib/groupDashboardUtils";

const DANISH_MONTHS = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

export function useAdvisorGroupDashboard(groupId: string | undefined) {
  const { user, isAdvisor } = useAuth();

  const { data: companies, isLoading, error } = useQuery({
    queryKey: ["advisor-group-financial-summary", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_group_financial_summary_for_advisor" as any,
        { p_group_id: groupId }
      );
      if (error) throw error;
      return (data as unknown as GroupCompanySummary[]) || [];
    },
    enabled: !!user && isAdvisor && !!groupId,
    staleTime: 60_000,
  });

  // Fetch group name
  const { data: groupData } = useQuery({
    queryKey: ["advisor-group-name", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("name")
        .eq("id", groupId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && isAdvisor && !!groupId,
    staleTime: 60_000,
  });

  const { data: historicalData } = useQuery({
    queryKey: ["advisor-group-historical", groupId],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAgoKey = sixMonthsAgo.toISOString().slice(0, 7);

      const { data: groupCos } = await supabase
        .from("group_companies" as any)
        .select("company_id")
        .eq("group_id", groupId);

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
    enabled: !!user && isAdvisor && !!groupId,
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
    groupName: groupData?.name ?? null,
  };
}
