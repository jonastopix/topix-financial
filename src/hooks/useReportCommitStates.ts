import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ReportCommitState {
  report_id: string;
  period_key: string | null;
  ownership_state: string | null;
  eligible: boolean;
  can_commit: boolean;
  state: string; // 'not_ready' | 'ready' | 'update_available' | 'blocked'
  state_reason: string | null;
}

export function useReportCommitStates(overrideCompanyId?: string) {
  const { user, companyId: authCompanyId } = useAuth();
  const companyId = overrideCompanyId ?? authCompanyId;

  return useQuery({
    queryKey: ["report-commit-states", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_report_commit_states", {
        p_company_id: companyId!,
      });
      if (error) throw error;

      // Build map keyed by report_id
      const map = new Map<string, ReportCommitState>();
      for (const row of (data as unknown as ReportCommitState[]) || []) {
        map.set(row.report_id, row);
      }
      return map;
    },
    enabled: !!user && !!companyId,
    staleTime: 30_000,
  });
}
