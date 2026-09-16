/**
 * src/hooks/onlineTracking.ts
 *
 * Medlemmet tracker sig selv på den private Presence-kanal ONLINE_KANAL
 * (16/9, plan-online-realtime.md §2; migration 20260917100000_online_presence.sql:
 * INSERT-politikken «Medlemmer tracker sig i online-medlemmer»). Kaldes i
 * HbMemberShells TOPBLOK med aktiv = !!user && !isAdvisor — useAuth's RÅ
 * isAdvisor, IKKE useViewMode.viewingAsMember: i «Se som medlem» er
 * rådgiveren stadig rådgiver og tracker aldrig.
 *
 *   private: true            — politikkerne på realtime.messages håndhæves
 *                              («instantiate the Realtime Channel with the
 *                              config option private: true»).
 *   presence.key = user.id   — flere faner fra samme bruger = én nøgle
 *                              («This key should be unique among clients»).
 *   presence.enabled = true  — NØDVENDIG for en klient der kun tracker:
 *                              realtime-js 2.97 sender ellers join'et med
 *                              presence: { enabled: false } (RealtimeChannel.js
 *                              :126-128 — enabled kun hvis der er en
 *                              presence-lytter ELLER config.presence.enabled).
 *   track() KUN ved SUBSCRIBED — «Presence calls per client: 5 per 30
 *                              seconds»; ingen track ved rutevalg, fokus eller
 *                              visibilitychange. En genforbindelse fyrer
 *                              SUBSCRIBED igen — det er den ene gentagelse.
 *   untrack + removeChannel  — i cleanup (logout, skallen unmountes).
 *                              Ved lukket fane når cleanup ikke altid at
 *                              køre; så kommer «leave» af den tabte
 *                              forbindelse (heartbeat 25 s).
 *
 * Medlemmet får ingen SELECT-politik og modtager intet — det lytter ikke.
 * Fejl (join afvist, politik mangler) logges ikke til medlemmet og viser
 * ingen toast: medlemmet skal ikke vide det; rådgiverens forside viser
 * husets kanalfejl-tekst.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ONLINE_KANAL } from "@/lib/hjemmebane/online";

export function useOnlineTracking(aktiv: boolean, userId: string | null | undefined): void {
  useEffect(() => {
    if (!aktiv || !userId) return;
    const channel = supabase.channel(ONLINE_KANAL, {
      config: { private: true, presence: { key: userId, enabled: true } },
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ online_at: new Date().toISOString() });
      }
    });
    return () => {
      void channel.untrack().finally(() => {
        void supabase.removeChannel(channel);
      });
    };
  }, [aktiv, userId]);
}
