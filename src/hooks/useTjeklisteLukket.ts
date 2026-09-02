import { useCallback, useState } from "react";

/**
 * Onboarding-tjeklistens visningstilstand — pr. ENHED, i localStorage.
 * Bevidst: «lukket» er en visningspræference, ikke data. Hvad medlemmet HAR
 * gjort ligger i databasen (profiles, member_profiles, companies, …) og
 * krydses af på alle enheder; om boksen er foldet væk på denne skærm er
 * kun denne skærms sag. Samme mønster som AddToHomescreenPrompt
 * (`a2hs-dismissed-v1`) og AppLayouts `dismissed-announcement`.
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
  const [lukket, setLukketState] = useState<boolean>(() =>
    typeof window === "undefined" ? false : laesFlag(window.localStorage, TJEKLISTE_LUKKET_KEY),
  );
  const setLukket = useCallback((v: boolean) => {
    skrivFlag(window.localStorage, TJEKLISTE_LUKKET_KEY, v);
    // Hentes boksen frem igen, skal lykønskningen også kunne vises igen.
    if (!v) skrivFlag(window.localStorage, TJEKLISTE_FAERDIG_SET_KEY, false);
    setLukketState(v);
  }, []);
  return { lukket, setLukket };
}
