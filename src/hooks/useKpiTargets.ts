/**
 * useKpiTargets — fetches per-company KPI targets, merged with fallbacks.
 *
 * Returns a resolved map (DB value or KPI_FALLBACK_TARGETS) for every KPI_DEFS
 * key. setTargets writes the cache directly via setQueryData (no refetch), so
 * KPIs.tsx's saveTargets keeps its instant, round-trip-free optimistic update.
 *
 * Fejl er en fejl (rettet 7/9, recon-fallback-tal.md pkt. 1): hentningen
 * læses gennem kraevRaekker, som kaster med kildens navn. Før læste queryFn
 * kun `data`, så et fejlet kald blev til nul rækker, og HVER nøgle fik sit
 * fallback-mål — standardtal tegnet som virksomhedens egne, uden at isError
 * nogensinde blev sand. Fallback-fletningen er urørt: den er rigtig når
 * rækkerne bare er tomme (ingen mål sat). Ved fejl er data undefined, targets
 * {} og isError sand; den globale QueryCache.onError (#702) logger fejlen.
 *
 * kpiTargetsKey is the single source of the queryKey — shared between the
 * useQuery call and setQueryData so they always address the same cache entry.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KPI_DEFS } from "@/lib/kpiDefs";
import { KPI_FALLBACK_TARGETS } from "@/lib/appConfig";
import { kraevRaekker } from "@/lib/kraevRaekker";

export type ResolvedTargets = Record<string, { value: number; label: string }>;

export const kpiTargetsKey = (companyId: string | undefined) => ["kpi-targets", companyId] as const;

export function useKpiTargets(companyId: string | undefined): {
  targets: ResolvedTargets;
  isLoading: boolean;
  /** Hentningen af kpi_targets fejlede — targets er da {} (ingen fallback). */
  isError: boolean;
  setTargets: (next: ResolvedTargets) => void;
} {
  const queryClient = useQueryClient();

  const { data: targets = {}, isLoading, isError } = useQuery({
    queryKey: kpiTargetsKey(companyId),
    queryFn: async (): Promise<ResolvedTargets> => {
      const raekker = kraevRaekker(
        await supabase
          .from("kpi_targets")
          .select("kpi_key, target_value, target_label, lower_is_better")
          .eq("company_id", companyId!),
        "kpi_targets",
      );

      const dbMap: Record<string, { target_value: number; target_label: string }> = {};
      raekker.forEach((t) => {
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

  return { targets, isLoading, isError, setTargets };
}
