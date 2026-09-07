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
import { kraevRaekker } from "@/lib/kraevRaekker";
import { fletKpiMaal, type ResolvedTargets } from "@/lib/kpiMaal";

/** Re-eksport: fletningen og typen bor i lib/kpiMaal (7/9) — én ren
    funktion for begge hentninger. useVirksomhed importerer typen herfra. */
export type { ResolvedTargets };

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

      // DB-værdi hvis den findes (kilde «aftalt»), ellers fallback (kilde
      // «standard») — fletningen er én ren funktion (lib/kpiMaal, 7/9), så
      // oprindelsen følger med til fladerne, som mærker standardmål.
      return fletKpiMaal(raekker);
    },
    enabled: !!companyId,
  });

  const setTargets = (next: ResolvedTargets) => {
    queryClient.setQueryData(kpiTargetsKey(companyId), next);
  };

  return { targets, isLoading, isError, setTargets };
}
