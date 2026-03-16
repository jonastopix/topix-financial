import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { buildGroupAggregates, type GroupCompanySummary, type GroupAggregates } from "@/lib/groupDashboardUtils";

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

  const aggregates = useMemo<GroupAggregates>(
    () => buildGroupAggregates(companies ?? []),
    [companies]
  );

  return {
    companies: companies ?? [],
    aggregates,
    isLoading,
    error,
    groupName: groupData?.name ?? null,
  };
}
