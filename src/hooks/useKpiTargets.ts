/**
 * useKpiTargets — fetches per-company KPI targets, merged with fallbacks.
 *
 * Returns a resolved map (DB value or KPI_FALLBACK_TARGETS) for every KPI_DEFS
 * key. setTargets writes the cache directly via setQueryData (no refetch), so
 * KPIs.tsx's saveTargets keeps its instant, round-trip-free optimistic update.
 *
 * kpiTargetsKey is the single source of the queryKey — shared between the
 * useQuery call and setQueryData so they always address the same cache entry.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KPI_DEFS } from "@/lib/kpiDefs";
import { KPI_FALLBACK_TARGETS } from "@/lib/appConfig";

export type ResolvedTargets = Record<string, { value: number; label: string }>;

export const kpiTargetsKey = (companyId: string | undefined) => ["kpi-targets", companyId] as const;

export function useKpiTargets(companyId: string | undefined): {
  targets: ResolvedTargets;
  isLoading: boolean;
  setTargets: (next: ResolvedTargets) => void;
} {
  const queryClient = useQueryClient();

  const { data: targets = {}, isLoading } = useQuery({
    queryKey: kpiTargetsKey(companyId),
    queryFn: async (): Promise<ResolvedTargets> => {
      const { data } = await supabase
        .from("kpi_targets")
        .select("kpi_key, target_value, target_label, lower_is_better")
        .eq("company_id", companyId!);

      const dbMap: Record<string, { target_value: number; target_label: string }> = {};
      (data || []).forEach((t) => {
        dbMap[t.kpi_key] = t;
      });

      // Resolve every KPI_DEFS key: DB value if present, else fallback.
      // Mirrors the previous getTarget() in KPIs.tsx exactly.
      const merged: ResolvedTargets = {};
      KPI_DEFS.forEach((def) => {
        const ut = dbMap[def.key];
        merged[def.key] = ut
          ? { value: Number(ut.target_value), label: ut.target_label }
          : (KPI_FALLBACK_TARGETS[def.key] || { value: 0, label: "—" });
      });
      return merged;
    },
    enabled: !!companyId,
  });

  const setTargets = (next: ResolvedTargets) => {
    queryClient.setQueryData(kpiTargetsKey(companyId), next);
  };

  return { targets, isLoading, setTargets };
}
