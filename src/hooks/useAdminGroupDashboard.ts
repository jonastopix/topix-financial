import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { buildGroupAggregates, type GroupCompanySummary, type GroupAggregates } from "@/lib/groupDashboardUtils";

export function useAdminGroupDashboard(groupId: string | undefined) {
  const { user, isAdmin } = useAuth();

  const { data: companies, isLoading, error } = useQuery({
    queryKey: ["admin-group-financial-summary", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_group_financial_summary_for_admin" as any,
        { p_group_id: groupId }
      );
      if (error) throw error;
      return (data as unknown as GroupCompanySummary[]) || [];
    },
    enabled: !!user && isAdmin && !!groupId,
    staleTime: 60_000,
  });

  // Fetch group name via the admin list RPC (lightweight)
  const { data: groupData } = useQuery({
    queryKey: ["admin-group-name", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("name")
        .eq("id", groupId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && isAdmin && !!groupId,
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
