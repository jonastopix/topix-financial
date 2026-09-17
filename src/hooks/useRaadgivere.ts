import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { raadgiverOpslag } from "@/lib/hjemmebane/ansigter";

/** Rådgiverne (get_all_advisor_profiles — security definer, medlemmer må
    kalde den) som opslag pr. user_id. SAMME nøgle som forsidens hentning
    (BoardroomView, PR 4 — låst af forsideAnsigter.guard), så cachen deles:
    eventsiden og admin-editoren henter ikke igen når forsiden har. */
export function useRaadgivere(enabled = true) {
  return useQuery({
    queryKey: ["boardroom", "raadgivere"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => raadgiverOpslag(kraevRaekker(await supabase.rpc("get_all_advisor_profiles" as any), "get_all_advisor_profiles") as any[]),
    staleTime: 10 * 60 * 1000,
    enabled,
  });
}
