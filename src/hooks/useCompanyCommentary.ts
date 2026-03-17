/**
 * useCompanyCommentary — fetches latest financial commentary per period for a company.
 *
 * Reads from financial_commentaries table.
 * Stale state is read directly from is_stale flag (backend-authoritative, no secondary frontend logic).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";

export interface Commentary {
  id: string;
  company_id: string;
  period_key: string;
  facts_id: string;
  basis_metrics_hash: string;
  basis_committed_at: string;
  basis_source_type: string;
  analysis: Record<string, unknown>;
  is_stale: boolean;
  generated_by: string;
  generated_at: string;
  created_at: string;
}

export function useCompanyCommentary(overrideCompanyId?: string) {
  const { user, companyId: authCompanyId } = useAuth();
  const companyId = overrideCompanyId ?? authCompanyId;

  return useQuery({
    queryKey: ["company-commentaries", companyId],
    queryFn: async () => {
      // Fetch all commentaries for the company, ordered by period + generated_at desc
      const { data, error } = await supabase
        .from("financial_commentaries")
        .select("*")
        .eq("company_id", companyId!)
        .order("period_key", { ascending: false })
        .order("generated_at", { ascending: false });

      if (error) throw error;

      // Deduplicate: keep only the latest commentary per period_key
      const latestByPeriod = new Map<string, Commentary>();
      for (const row of data || []) {
        if (!latestByPeriod.has(row.period_key)) {
          latestByPeriod.set(row.period_key, {
            ...row,
            analysis: (row.analysis as Record<string, unknown>) ?? {},
          } as Commentary);
        }
      }

      return Array.from(latestByPeriod.values());
    },
    enabled: !!user && !!companyId,
    staleTime: 2 * 60_000,
  });
}

/**
 * Generate a new commentary for a company + period via the server-controlled edge function.
 */
export async function generateCommentary(companyId: string, periodKey: string) {
  const { data, error } = await supabase.functions.invoke(
    "generate-financial-commentary",
    {
      body: { company_id: companyId, period_key: periodKey },
    }
  );

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data as Commentary;
}
