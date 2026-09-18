/**
 * Ansøgningstoken som legitimation — formularens auth-prædikat (FØR indsendelse).
 *
 * SAMME KLASSE SOM verifyBetalingstoken (betalingstokenAuth.ts) og A's
 * verifyAnsoegningslink (ansoegningLinkAuth.ts): kalderen er en besøgende
 * UDEN session — de har ingen konto, og skal ikke have en for at ansøge.
 * Legitimationen ligger i KALDET: tokenet er 122 bits (gen_random_uuid,
 * dannet af databasen) og bæres i URL'en (/ansoeg?t=…), i localStorage og i
 * påmindelsesmailen. Kun den der har det, kan læse og skrive ansøgningen.
 *
 * ÉT MØNSTER MED A (18/9, A's STOP D7): INGEN SQL-FUNKTION, INGEN SECURITY
 * DEFINER. Opslaget sker med service role på token-lighed, og tabellen har
 * ingen politik for anon, så tokenet kan kun bruges herigennem. Dette
 * prædikat svarer KUN for en ÅBEN ansøgning (indsendt_at IS NULL); A's
 * verifyAnsoegningslink svarer KUN for en INDSENDT. Hver side af sømmen har
 * sin egen gate på samme token. Efter indsendelse er tokenet dødt her: en
 * indsendt ansøgning kan hverken læses eller ændres fra formularen.
 *
 * Ugyldigt uuid-format afvises FØR opslaget, så et 22P02 aldrig når loggen
 * som «fejl». null = må ikke røres, uanset grund — grunden røbes ikke.
 *
 * Er registreret som gyldigt prædikat i scripts/check-edge-function-auth.ts
 * (udkastets diff). Kald den FØR enhver anden service-role-handling — samme
 * invariant som husets øvrige prædikater. Oprettelsen (handling «opret») er
 * den eneste vej uden token; den er begrænset i ansoegning-gem.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { type AnsoegningsSvar, FELTER } from "./ansoegningSkema.ts";

export interface AnsoegningTilGem {
  id: string;
  svar: AnsoegningsSvar;
  /** Det CVR-opslag der sidst blev vist, som cvr-funktionen gemte det. */
  cvr_opslag: Record<string, unknown> | null;
  cvr_bekraeftet: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** De kolonner formularen må se: id, opslaget, bekræftelsen og de tolv svar. Aldrig anbefalingen, trinnet eller beslutningerne (A's felter). */
const KOLONNER = ["id", "cvr_opslag", "cvr_bekraeftet", ...FELTER].join(", ");

export async function verifyAnsoegningstoken(
  token: string,
  adminClient: SupabaseClient,
): Promise<AnsoegningTilGem | null> {
  const t = (token ?? "").trim();
  if (!UUID.test(t)) return null;
  const { data, error } = await adminClient
    .from("ansoegninger")
    .select(KOLONNER)
    .eq("token", t)
    .is("indsendt_at", null)
    .maybeSingle();
  if (error) {
    console.error("[verifyAnsoegningstoken] opslag fejlede:", error.message);
    return null;
  }
  if (!data) return null;
  const raekke = data as unknown as Record<string, unknown>;
  const svar: Record<string, unknown> = {};
  for (const f of FELTER) svar[f] = raekke[f] ?? null;
  return {
    id: String(raekke.id),
    svar: svar as unknown as AnsoegningsSvar,
    cvr_opslag: (raekke.cvr_opslag as Record<string, unknown> | null) ?? null,
    cvr_bekraeftet: raekke.cvr_bekraeftet === true,
  };
}
