import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { buildGroupAggregates, type GroupCompanySummary, type GroupAggregates } from "@/lib/groupDashboardUtils";

// Re-export types for backward compatibility
export type { GroupCompanySummary, GroupAggregates };

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

  const aggregates = useMemo<GroupAggregates>(
    () => buildGroupAggregates(companies ?? []),
    [companies]
  );

  return {
    companies: companies ?? [],
    aggregates,
    isLoading,
    error,
    groupName,
    isGroupUser,
  };
}
