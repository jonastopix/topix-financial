/**
 * src/lib/hjemmebane/tjeklisteLukket.ts
 *
 * Onboarding-tjeklistens «lukket» — i PROFILEN, ikke pr. enhed (de-tyve
 * nr. 14, 11/9). Målt i recon 10/9 (recon-opgaver-chat-tjekliste.md §3):
 * lukker et medlem boksen på telefonen, stod den åben på laptoppen, fordi
 * flaget lå i localStorage. Nøglen bor i profiles.notification_email_prefs
 * (jsonb) — ingen migration: feltet læses kun af fem mail-funktioner på
 * NAVNGIVNE nøgler (=== false), ingen itererer, og indstillingsfanens
 * fletPraeferencer bevarer ukendte nøgler. RLS: «Users can update own
 * profile» USING (auth.uid() = user_id), ingen kolonnebegrænsning.
 *
 * Rene funktioner, testet i __tests__/tjeklisteLukket.test.ts. Hooken
 * (hooks/useTjeklisteLukket.ts) gør I/O'et.
 *
 * «Et manglende tal er ikke nul» gælder ikke her: en manglende nøgle
 * BETYDER at medlemmet aldrig har lukket boksen — det er faktum, ikke et
 * hul. Derfor boolean, ikke boolean | null.
 */

export const TJEKLISTE_LUKKET_NOEGLE = "tjekliste_lukket";

/** Er boksen lukket ifølge profilens JSON? Kun `true` tæller — alt andet
    (mangler, null, "1", 1, ikke-objekt) er «ikke lukket». */
export function laesTjeklisteLukket(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return false;
  return (prefs as Record<string, unknown>)[TJEKLISTE_LUKKET_NOEGLE] === true;
}

/** Ny JSON med nøglen sat — resten af JSON'en bevares uændret (mail-
    præferencerne må ikke røres). Muterer ikke input; ikke-objekt → {}. */
export function skrivTjeklisteLukket(prefs: unknown, lukket: boolean): Record<string, unknown> {
  const o: Record<string, unknown> =
    prefs && typeof prefs === "object" && !Array.isArray(prefs) ? { ...(prefs as Record<string, unknown>) } : {};
  o[TJEKLISTE_LUKKET_NOEGLE] = lukket;
  return o;
}
