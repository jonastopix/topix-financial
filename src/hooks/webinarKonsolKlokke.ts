/**
 * Værtskonsollens klokke-markering (skive 5, 3/10-2026; docs/webinarmotor.md §7.10).
 * Egen fil, så konsollens svar-hook (hooks/webinarKonsol.ts) stadig har ÉN skrivning
 * (webinarKonsol.guard dom 4).
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TYPE_WEBINAR_SPOERGSMAAL } from "@/lib/webinarMotor/klokke";

/**
 * Sessionens klokke er LÆST, når rådgiveren har konsollen åben (CTO 3/10, fund 3):
 * ved åbning og ved hver hentning af køen markeres egne ULÆSTE klokker af typen
 * webinar_spoergsmaal for sessionen. GATED af laeseMarkeringTilladt — en
 * tjenestekonto, der ser konsollen, markerer intet (tjenestekonto.guard dom 6).
 * Fail-soft: en fejl betyder kun, at klokken står ulæst.
 */
export function useMarkerKonsolKlokkeLaest(sessionId: string | undefined, opdateret: number) {
  const { user, laeseMarkeringTilladt } = useAuth();
  useEffect(() => {
    if (!laeseMarkeringTilladt || !user || !sessionId) return;
    void supabase.from("advisor_notifications").update({ read_at: new Date().toISOString() })
      .eq("advisor_id", user.id)
      .eq("type", TYPE_WEBINAR_SPOERGSMAAL)
      .eq("reference_id", sessionId)
      .is("read_at", null)
      .then(() => undefined, () => undefined);
  }, [laeseMarkeringTilladt, user, sessionId, opdateret]);
}

