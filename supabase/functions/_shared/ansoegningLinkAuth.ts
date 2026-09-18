/**
 * Ansøgerens link EFTER indsendelse — motorens auth-prædikat.
 *
 * SAMME MEKANISME SOM B's verifyAnsoegningstoken (ansoegningToken.ts) —
 * det ene token-mønster, aftalt 18/9 (Jonas D7): opslag med SERVICE ROLE på
 * token-lighed, INGEN SQL-funktion, INGEN SECURITY DEFINER; tabellen har
 * ingen politik for anon, så tokenet kan kun bruges gennem funktionerne.
 * Forskellen er FASEN: B's svarer kun for en KLADDE (indsendt_at IS NULL —
 * formularen); denne svarer kun for en INDSENDT ansøgning (status, «ikke
 * nu») og giver motorens fulde række, ikke formularens tolv svar. Hver
 * side af sømmen har sin egen gate på samme token; B's fil er B's.
 *
 * Ugyldigt uuid-format afvises FØR opslaget (ingen 22P02 i loggen). Svaret
 * røber intet om HVORFOR der er null. Registreret som prædikat i
 * scripts/check-edge-function-auth.ts (verifyAnsoegningslink). Kald den FØR
 * enhver anden service-role-handling.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { ANSOEGNING_KOLONNER, type AnsoegningRaekke } from "./ansoegningMotor.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifyAnsoegningslink(
  token: string,
  adminClient: SupabaseClient,
): Promise<AnsoegningRaekke | null> {
  const t = (token ?? "").trim();
  if (!UUID.test(t)) return null;
  const { data, error } = await adminClient
    .from("ansoegninger")
    .select(ANSOEGNING_KOLONNER)
    .eq("token", t)
    .not("indsendt_at", "is", null)
    .maybeSingle();
  if (error) {
    console.error("[verifyAnsoegningslink] opslag fejlede:", error.message);
    return null;
  }
  return (data as AnsoegningRaekke | null) ?? null;
}
