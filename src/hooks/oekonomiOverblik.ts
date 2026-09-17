import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { HentningsFejl, kraevRaekke } from "@/lib/kraevRaekker";
import { laesOverblik, OEKONOMI_RPC, type Overblik } from "@/lib/oekonomi/overblik";

/**
 * Økonomioverblikket (Ø2, 18/9-2026): ÉT kald til RPC'en
 * public.hent_oekonomi_overblik() (SECURITY DEFINER; første sætning er
 * has_role(auth.uid(), 'partner') — alle andre får en exception), som
 * afleverer kontrakter (alle kolonner), betalinger fra company_traek ekskl.
 * moms og virksomheder som ét jsonb-objekt. Dommen regnes i browseren af
 * motoren (src/lib/oekonomi/omsaetning.ts via lib/oekonomi/overblik.ts
 * regnOverblik) — ingen SQL-periodisering.
 *
 * Ingen visning endnu (Ø3). kraevRaekke-mønstret (recon-tavse-fejl.md): en
 * RPC-fejl kaster med kildens navn; TanStack ser isError, ikke en tom
 * succes. Læsningen af svaret (laesOverblik) kaster på forkert form.
 *
 * Kun partnere kalder: `enabled` er isPartner — en rådgiver uden rollen
 * sender ikke engang kaldet (og fik ellers RPC'ens exception som fejl).
 */
export const OEKONOMI_OVERBLIK_QUERY_KEY = ["oekonomi", "overblik"] as const;
export { OEKONOMI_RPC };

export function useOekonomiOverblik() {
  const { user, isPartner } = useAuth();
  return useQuery({
    queryKey: OEKONOMI_OVERBLIK_QUERY_KEY,
    enabled: !!user && isPartner === true,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Overblik> => {
      const svar = await supabase.rpc(OEKONOMI_RPC);
      const json = kraevRaekke(svar, OEKONOMI_RPC);
      if (json === null) throw new HentningsFejl(OEKONOMI_RPC, "tomt svar");
      return laesOverblik(json);
    },
  });
}
