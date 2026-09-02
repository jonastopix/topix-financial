/**
 * Betalingstoken som legitimation — indgangens auth-prædikat.
 *
 * HVORFOR DEN FINDES: kalderen af opret-indgangs-checkout er /betal — en
 * person UDEN Supabase-session, for de har ikke en konto endnu. Målt 2/9:
 * Bucket A afviser en anon-nøgle (ingen sub-claim), og ingen eksisterende
 * bruger-funktion kan tage imod en sessionsløs kalder. Legitimationen
 * ligger derfor i KALDET, ikke i en session — samme klasse som
 * verifyWebhookRequest (auth-hook), Stripe-signaturen og Monday-HMAC'en:
 * noget kalderen bærer, som kun den rigtige kalder kan have. Tokenet er
 * 122 bits (uuid, gen_random_uuid) og kan ikke gættes.
 *
 * DOMMEN LIGGER I SQL. public.hent_betalingsdata_til_checkout(uuid) er
 * SECURITY DEFINER med EXECUTE kun til service_role, og den returnerer
 * KUN når betaling er tilladt: kendt token, pris sat, mail kendt, frist
 * ikke overskredet, ikke allerede betalt. NULL = må ikke betale, uanset
 * grund — grunden røbes ikke, hverken her eller til kalderen. Denne
 * funktion tilføjer ingen logik: den kalder, og den svarer.
 *
 * Er registreret som gyldigt prædikat i scripts/check-edge-function-auth.ts.
 * Kald den FØR enhver anden service-role-handling — samme invariant som
 * for husets øvrige prædikater.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

export interface Betalingsdata {
  company_id: string;
  virksomhed: string;
  kontakt_email: string;
  prisniveau_oere: number;
}

export async function verifyBetalingstoken(
  token: string,
  adminClient: SupabaseClient,
): Promise<Betalingsdata | null> {
  const { data, error } = await adminClient.rpc("hent_betalingsdata_til_checkout", {
    betalingstoken: token,
  });
  if (error) {
    // Også et ugyldigt uuid-format ender her (22P02) — det er "ikke
    // tilladt", ikke en serverfejl der skal op til kalderen.
    console.error("[verifyBetalingstoken] hent_betalingsdata_til_checkout fejlede:", error);
    return null;
  }
  if (data === null || data === undefined) return null;
  return data as Betalingsdata;
}
