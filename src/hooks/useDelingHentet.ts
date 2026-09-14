import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TJEKLISTE_QUERY_KEY } from "@/hooks/useOnboardingTjekliste";

/**
 * Stemplet for tjeklistens «Fortæl det videre» (14/9 aften, delingens del 2):
 * profiles.deling_hentet_at = now() FØRSTE gang medlemmet henter en PNG på
 * /deling (KreativFuldskaerm.onHentet). Handling, ikke besøg — som
 * velkomstvideo_set_at (useOnboardingTjekliste.markerVelkomstSet), og
 * samme skrivemønster: profiles er nøglet på user_id, self-only RLS.
 *
 * KUN NÅR TOM (`.is("deling_hentet_at", null)`): kolonnen betyder «første
 * gang», ikke «senest». Er den allerede sat, rammer opdateringen nul
 * rækker — det er FORVENTET her, ikke fælden fra FornyelsesSektion:134
 * (dér var nul rækker en tavs fejl). Derfor kastes der ikke på nul rækker;
 * en RLS-fejl kommer som `error` og logges. Kaldet må aldrig vælte filen:
 * KreativFuldskaerm har allerede vist «PNG hentet».
 *
 * Rådgivere stempler intet (tjeklisten er medlemmets — samme gate som
 * useOnboardingTjekliste og useTjeklisteLukket).
 */
export function useMarkerDelingHentet(): () => Promise<void> {
  const { user, isAdvisor } = useAuth();
  const queryClient = useQueryClient();
  const userId = !isAdvisor && user ? user.id : null;

  return useCallback(async () => {
    if (!userId) return;
    // deling_hentet_at er ikke i de genererede typer endnu (migration
    // 20260914220000) — samme `as any` som velkomstvideo_set_at-stemplet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("profiles") as any)
      .update({ deling_hentet_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("deling_hentet_at", null)
      .select("user_id");
    if (error) {
      console.warn("[useDelingHentet] deling_hentet_at kunne ikke skrives — PNG'en er hentet, punktet krydses ikke af:", error.message);
      return;
    }
    if (!data || data.length === 0) return; // allerede stemplet — intet at genindlæse
    await queryClient.invalidateQueries({ queryKey: [TJEKLISTE_QUERY_KEY, userId] });
  }, [userId, queryClient]);
}
