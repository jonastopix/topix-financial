import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";
import { laesTjeklisteLukket, skrivTjeklisteLukket } from "@/lib/hjemmebane/tjeklisteLukket";

/**
 * Onboarding-tjeklistens visningstilstand — «lukket» FØLGER MEDLEMMET
 * (de-tyve nr. 14, 11/9). Før 11/9 lå flaget kun i localStorage pr. enhed
 * (filhovedet dengang: «kun denne skærms sag»); målt 10/9 betød det at et
 * medlem der lukkede boksen på telefonen, fik den igen på laptoppen — og
 * det er præcis de 17 uden tal, vi har brugt to dage på at få i gang.
 *
 * Sandheden bor nu i profiles.notification_email_prefs.tjekliste_lukket
 * (lib/hjemmebane/tjeklisteLukket — hvorfor det felt, og hvorfor ingen
 * migration). localStorage er STADIG med, men som cache: den svarer
 * synkront i første render (ingen blink på en enhed der har set svaret
 * før), og profilen overtrumfer så snart den er hentet. På en NY enhed
 * kan boksen derfor vises kort første gang, indtil profilen svarer — én
 * gang; derefter husker enheden det. Fejler hentningen, gælder enheden.
 *
 * Skrivning: enheden først (synkront), profilen bagefter som læs-flet-
 * skriv, så mail-præferencerne i samme JSON aldrig overskrives med et
 * forældet billede. Fejler skrivningen, står det i konsollen med label,
 * og enheden husker det stadig — næste lukning prøver igen.
 *
 * De to andre flag er uændrede og bevidst lokale: TJEKLISTE_FAERDIG_SET_KEY
 * (lykønskningen set, localStorage) og VELKOMST_UDSAT_KEY («Se senere»,
 * sessionStorage — pr. fane). Rådgivere henter og skriver intet (samme
 * gate som useOnboardingTjekliste: tjeklisten er medlemmets).
 */

export const TJEKLISTE_LUKKET_KEY = "tbr.tjekliste-lukket";
/** Lykønskningen vises én gang — derefter er boksen væk, indtil menuen henter den frem. */
export const TJEKLISTE_FAERDIG_SET_KEY = "tbr.tjekliste-faerdig-set";
/** «Se senere» på velkomsten holder overlejringen lukket i denne fane/session — ikke pr. enhed. */
export const VELKOMST_UDSAT_KEY = "tbr.velkomst-udsat";

export function laesFlag(storage: Storage, key: string): boolean {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function skrivFlag(storage: Storage, key: string, vaerdi: boolean): void {
  try {
    if (vaerdi) storage.setItem(key, "1");
    else storage.removeItem(key);
  } catch {
    /* privat vindue / blokeret storage — boksen virker stadig, den husker bare ikke */
  }
}

/** Lukket-tilstanden, delt mellem skallen (sidebar-punktet) og boksen. */
export function useTjeklisteLukket(): { lukket: boolean; setLukket: (v: boolean) => void } {
  const { user, isAdvisor } = useAuth();
  const userId = !isAdvisor && user ? user.id : null;
  const [lukket, setLukketState] = useState<boolean>(() =>
    typeof window === "undefined" ? false : laesFlag(window.localStorage, TJEKLISTE_LUKKET_KEY),
  );
  // Har medlemmet klikket på DENNE enhed siden hentningen begyndte, vinder
  // klikket over det profilen svarede før klikket.
  const lokaltAendret = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let aktiv = true;
    lokaltAendret.current = false;
    supabase
      .from("profiles")
      .select("notification_email_prefs")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!aktiv || lokaltAendret.current) return;
        if (error) {
          console.warn("[tjekliste-lukket] profilen kunne ikke hentes — enheden gælder:", error.message);
          return;
        }
        const fraProfil = laesTjeklisteLukket(data?.notification_email_prefs);
        skrivFlag(window.localStorage, TJEKLISTE_LUKKET_KEY, fraProfil);
        setLukketState(fraProfil);
      });
    return () => {
      aktiv = false;
    };
  }, [userId]);

  const setLukket = useCallback(
    (v: boolean) => {
      lokaltAendret.current = true;
      skrivFlag(window.localStorage, TJEKLISTE_LUKKET_KEY, v);
      // Hentes boksen frem igen, skal lykønskningen også kunne vises igen.
      if (!v) skrivFlag(window.localStorage, TJEKLISTE_FAERDIG_SET_KEY, false);
      setLukketState(v);
      if (!userId) return;
      void (async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("notification_email_prefs")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) {
          console.warn("[tjekliste-lukket] profilen kunne ikke læses før skrivning — enheden husker det:", error.message);
          return;
        }
        const { error: skrivFejl, data: skrevet } = await supabase
          .from("profiles")
          .update({ notification_email_prefs: skrivTjeklisteLukket(data?.notification_email_prefs, v) as Json })
          .eq("user_id", userId)
          .select("user_id");
        if (skrivFejl || !skrevet || skrevet.length === 0) {
          console.warn("[tjekliste-lukket] profilen blev ikke opdateret — enheden husker det:", skrivFejl?.message ?? "nul rækker");
        }
      })();
    },
    [userId],
  );

  return { lukket, setLukket };
}
