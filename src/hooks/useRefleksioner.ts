/**
 * useRefleksioner — medlemmets egne refleksioner fra pulse_checkins (28/9-2026).
 *
 * KUN LÆSNING. Samme form som useCompanyFacts: queryFn'en KASTER
 * HentningsFejl med kildens navn («pulse_checkins» → «din refleksion» i
 * hentefejl.ts' KILDE_ORD), så fladen kan skelne tom fra fejlet, og Sentry
 * får fejlen gennem QueryCache.onError. RLS: medlemmet må læse virksomhedens
 * rækker («Members manage company checkins», 20260601120000).
 *
 * Nyeste øverst kommer fra databasen (period_key faldende) — og dommen
 * refleksioner.ts sorterer igen på samme nøgle, så fladen aldrig afhænger af
 * rækkefølgen i svaret.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HentningsFejl, kraevRaekker } from "@/lib/kraevRaekker";
import type { RefleksionRaekke } from "@/lib/hjemmebane/refleksioner";

export const REFLEKSIONER_KOLONNER = "period_key, went_well, biggest_challenge, help_needed, milestone_progress, created_at";

export function useRefleksioner(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["rapportering", "refleksioner", companyId],
    queryFn: async (): Promise<RefleksionRaekke[]> => {
      const svar = await supabase
        .from("pulse_checkins")
        .select(REFLEKSIONER_KOLONNER)
        .eq("company_id", companyId!)
        .order("period_key", { ascending: false });
      if (svar.error) throw new HentningsFejl("pulse_checkins", svar.error.message);
      return kraevRaekker<RefleksionRaekke>(svar as { data: RefleksionRaekke[] | null; error: { message: string } | null }, "pulse_checkins");
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}
