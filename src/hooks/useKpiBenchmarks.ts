/**
 * useKpiBenchmarks — fetches per-company KPI benchmarks. Ingen fallback.
 *
 * Mirror of useKpiTargets: returns a map for the KPI_DEFS keys that HAVE a
 * row in kpi_benchmarks. setBenchmarks writes the cache directly via
 * setQueryData (no refetch), so NoegletalView's saveAdvanced keeps its
 * instant, round-trip-free optimistic update.
 *
 * ET BENCHMARK ER NOGET VIRKSOMHEDEN HAR (Jonas 13/9): indtil da fik en nøgle
 * uden række husets KPI_DEFAULT_BENCHMARKS (appConfig) — seks tal for alle
 * virksomheder, source «Estimat, The Boardroom» — og kortet på /kpis skrev
 * «branche 150K» ved siden af en omsætning på 1,4 mio. «Det er jo
 * virksomheder i vidt forskellige størrelser»: seks faste tal siger intet
 * til nogen. Samme klasse som fallback-målene, der røg i kort 40 (#832).
 *
 * FORMEN (som lib/kpiMaal): kortet indeholder KUN de nøgler der har en række
 * i databasen. En nøgle uden benchmark er FRAVÆRENDE — ikke 0 med en etiket.
 * Så kan aftagerne skelne:
 *   «intet benchmark»    → `benchmarks[key]` er undefined
 *   «benchmark er nul»   → `benchmarks[key]` er { value: 0, … }
 * Aftagerne (deriveKpiMetrics, NoegletalViews kort og panel) læser allerede
 * `benchmarks[key] ?? …` og tegner intet ved value ≤ 0.
 *
 * kpiBenchmarksKey is the single source of the queryKey — shared between the
 * useQuery call and setBenchmarks so they always address the same cache entry.
 *
 * Fejl er en fejl (rettet 7/9, recon-fallback-tal.md pkt. 1): hentningen
 * læses gennem kraevRaekker, som kaster med kildens navn — samme rettelse
 * som useKpiTargets. Ved fejl er benchmarks {} og isError sand.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KPI_DEFS } from "@/lib/kpiDefs";
import { kraevRaekker } from "@/lib/kraevRaekker";

/** Kun nøgler med et virksomhedssat benchmark er til stede — opslag kan give undefined. */
export type ResolvedBenchmarks = Record<string, { value: number; label: string; source: string }>;

export const kpiBenchmarksKey = (companyId: string | undefined) => ["kpi-benchmarks", companyId] as const;

export function useKpiBenchmarks(companyId: string | undefined): {
  benchmarks: ResolvedBenchmarks;
  isLoading: boolean;
  /** Hentningen af kpi_benchmarks fejlede — benchmarks er da {}. */
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

      const dbMap = new Map(raekker.map((b) => [b.kpi_key, b]));

      // Én post pr. KPI_DEFS-nøgle der HAR en række. Nøgler uden række
      // udelades — intet benchmark, og fladerne tegner intet. Rækker for
      // ukendte nøgler ignoreres.
      const merged: ResolvedBenchmarks = {};
      KPI_DEFS.forEach((def) => {
        const ub = dbMap.get(def.key);
        if (ub) merged[def.key] = { value: Number(ub.benchmark_value), label: ub.benchmark_label, source: ub.source_label };
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
