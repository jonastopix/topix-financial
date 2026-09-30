/**
 * src/hooks/onlineTracking.ts
 *
 * Medlemmet slår HJERTESLAG i tabellen online_hjerteslag (30/9-2026;
 * migration 20260930120000_online_hjerteslag.sql; modellen og regnestykket i
 * src/lib/hjemmebane/online.ts). Erstatter Presence-kanalen fra 16/9, som
 * aldrig viste et navn. Kaldes i HbMemberShells TOPBLOK med aktiv = !!user &&
 * !isAdvisor — useAuth's RÅ isAdvisor, IKKE useViewMode.viewingAsMember: i
 * «Se som medlem» er rådgiveren stadig rådgiver og slår aldrig hjerteslag.
 *
 *   upsert { user_id }   — KUN egen række (RLS: user_id = auth.uid()).
 *                          Serveren sætter sidst_set = now() (trigger);
 *                          klienten sender ingen tid.
 *   ved montering        — straks, hvis fanen er synlig og det forrige slag
 *                          er ≥ ONLINE_MIN_AFSTAND_MS gammelt (skalSlaa;
 *                          skallen monteres pr. side, så sidste slag huskes
 *                          i modulet, ikke i komponenten).
 *   hvert ONLINE_HJERTESLAG_MS — kun mens document.visibilityState er
 *                          «visible»; bliver fanen synlig igen, slås der
 *                          straks (samme skalSlaa).
 *   stop ved afmontering — interval og lytter fjernes; rækken bliver
 *                          liggende og ældes ud af vinduet.
 *
 * FAIL-SOFT: et fejlet slag vises aldrig for medlemmet — ingen toast, ingen
 * kastet fejl, ingen log. Næste interval prøver igen; rådgiverens forside
 * viser husets fejltekst, hvis SIN hentning fejler.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ONLINE_HJERTESLAG_MS, ONLINE_TABEL, skalSlaa } from "@/lib/hjemmebane/online";

/** Tidspunktet for sidste forsøg — i modulet, så det overlever skallens afmontering. */
let sidsteSlagMs: number | null = null;

/** Ét hjerteslag: upsert af egen række. Kaster aldrig. */
export async function slaaHjerteslag(userId: string): Promise<void> {
  try {
    await (supabase.from(ONLINE_TABEL as never) as any).upsert({ user_id: userId }, { onConflict: "user_id" });
  } catch {
    // fail-soft: medlemmet skal ikke vide det
  }
}

export function useOnlineTracking(aktiv: boolean, userId: string | null | undefined): void {
  useEffect(() => {
    if (!aktiv || !userId) return;
    const slag = () => {
      const nuMs = Date.now();
      if (!skalSlaa({ synlig: document.visibilityState === "visible", nuMs, sidsteMs: sidsteSlagMs })) return;
      sidsteSlagMs = nuMs;
      void slaaHjerteslag(userId);
    };
    const vedSynlighed = () => {
      if (document.visibilityState === "visible") slag();
    };
    slag();
    const timer = window.setInterval(slag, ONLINE_HJERTESLAG_MS);
    document.addEventListener("visibilitychange", vedSynlighed);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", vedSynlighed);
    };
  }, [aktiv, userId]);
}
