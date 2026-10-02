/**
 * src/hooks/tilGode.ts — data til forsidens «Til gode» (forside v3, docs/forside-v3.md §2). ÉN læsning af
 * virksomhedens række (kontrakt, abonnement og de to retter); dommen er den rene sessionerTilGode
 * (lib/hjemmebane/tilGode — samme regel som create-free-intro-booking booker efter). Fejl → [] og intet kort
 * (fail-soft: kortet er en påmindelse, ikke en adgangsdom; bookingsiden dømmer selv).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sessionerTilGode, type TilGodeKilde } from "@/lib/hjemmebane/tilGode";
import type { SessionRaadgiver } from "@/lib/sessionRet";

export function useSessionerTilGode(companyId: string | null | undefined): SessionRaadgiver[] {
  const q = useQuery({
    queryKey: ["forside", "til-gode", companyId ?? null],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<TilGodeKilde | null> => {
      // jonas_session_used_at/jonas_session_tilbudt_at står ikke i alle generationer af types.ts — utypet som Book session.
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("contract_end_date, subscription_status, subscription_current_period_end, intro_session_used_at, jonas_session_used_at, jonas_session_tilbudt_at")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw new Error(`companies: ${error.message}`);
      return (data as TilGodeKilde | null) ?? null;
    },
  });
  return q.data ? sessionerTilGode(q.data, new Date()) : [];
}
