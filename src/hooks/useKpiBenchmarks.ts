/**
 * useKpiBenchmarks — fetches per-company KPI benchmarks, merged with fallbacks.
 *
 * Mirror of useKpiTargets: returns a resolved map (DB value or
 * KPI_DEFAULT_BENCHMARKS) for every KPI_DEFS key. setBenchmarks writes the cache
 * directly via setQueryData (no refetch), so KPIs.tsx's saveBenchmarks keeps its
 * instant, round-trip-free optimistic update.
 *
 * kpiBenchmarksKey is the single source of the queryKey — shared between the
 * useQuery call and setBenchmarks so they always address the same cache entry.
 *
 * Fejl er en fejl (rettet 7/9, recon-fallback-tal.md pkt. 1): hentningen
 * læses gennem kraevRaekker, som kaster med kildens navn — samme rettelse
 * som useKpiTargets. Fallback-fletningen er urørt: den er rigtig når
 * rækkerne bare er tomme. Ved fejl er benchmarks {} og isError sand.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KPI_DEFS } from "@/lib/kpiDefs";
import { KPI_DEFAULT_BENCHMARKS } from "@/lib/appConfig";
import { kraevRaekker } from "@/lib/kraevRaekker";

export type ResolvedBenchmarks = Record<string, { value: number; label: string; source: string }>;

export const kpiBenchmarksKey = (companyId: string | undefined) => ["kpi-benchmarks", companyId] as const;

export function useKpiBenchmarks(companyId: string | undefined): {
  benchmarks: ResolvedBenchmarks;
  isLoading: boolean;
  /** Hentningen af kpi_benchmarks fejlede — benchmarks er da {} (ingen fallback). */
  isError: boolean;
  setBenchmarks: (next: ResolvedBenchmarks) => void;
} {
  const queryClient = useQueryClient();

  const { data: benchmarks = {}, isLoading, isError } = useQuery({
    queryKey: kpiBenchmarksKey(companyId),
    queryFn: async (): Promise<ResolvedBenchmarks> => {
      const raekker = kraevRaekker(
        await supabase
          .from("kpi_benchmarks")
          .select("kpi_key, benchmark_value, benchmark_label, source_label")
          .eq("company_id", companyId!),
        "kpi_benchmarks",
      );

      const dbMap: Record<string, { benchmark_value: number; benchmark_label: string; source_label: string }> = {};
      raekker.forEach((b) => {
        dbMap[b.kpi_key] = b;
      });

      // Resolve every KPI_DEFS key: DB value if present, else fallback.
      // Mirrors the previous getBenchmark() in KPIs.tsx exactly.
      const merged: ResolvedBenchmarks = {};
      KPI_DEFS.forEach((def) => {
        const ub = dbMap[def.key];
        merged[def.key] = ub
          ? { value: Number(ub.benchmark_value), label: ub.benchmark_label, source: ub.source_label }
          : (KPI_DEFAULT_BENCHMARKS[def.key] || { value: 0, label: "—", source: "" });
      });
      return merged;
    },
    enabled: !!companyId,
  });

  const setBenchmarks = (next: ResolvedBenchmarks) => {
    queryClient.setQueryData(kpiBenchmarksKey(companyId), next);
  };

  return { benchmarks, isLoading, isError, setBenchmarks };
}
