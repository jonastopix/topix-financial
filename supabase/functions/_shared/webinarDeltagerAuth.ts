/**
 * Deltagertokenet som legitimation — webinarmotorens auth-prædikat for seerens
 * functions (webinar-rum, webinar-puls; skive 1, 30/9-2026).
 *
 * SAMME KLASSE som laesAfmeldToken (webinarAfmeldToken.ts) og
 * verifyDelingstoken: kalderen er en seer UDEN konto og uden session.
 * Legitimationen er tokenet fra linket /w/<slug>?t=… — en HMAC-SHA256 over
 * tilmeldingens id og token_version (webinarMotor/token.ts). Registreret som
 * prædikat i scripts/check-edge-function-auth.ts. Kald den FØR enhver anden
 * service-role-handling.
 *
 * RÆKKEFØLGEN (spec §D2): form → HMAC regnet igen og sammenlignet i konstant
 * tid (INGEN databaseopslag for et forfalsket token) → rækken slået op →
 * token_version skal passe → rækken skal være platformens.
 *
 * SECRET'EN LÆSES KUN HER: WEBINAR_JOIN_SECRET (32 bytes, eget job) og, i en
 * rotationsperiode, WEBINAR_JOIN_SECRET_FORRIGE. Kildeværnet
 * webinarMotor.guard fælder et andet sted, der læser dem.
 *
 * LOGGER ALDRIG: webinar-puls kaldes ~33 gange i sekundet ved 500 seere, og
 * Supabases loft er 100 log-hændelser pr. 10 s pr. function. Grunden gives
 * tilbage; kalderen tæller. Svaret udadtil er ÉT for alt (403).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { laesDeltagertoken } from "./webinarMotor/token.ts";

export const JOIN_SECRET = "WEBINAR_JOIN_SECRET";
export const JOIN_SECRET_FORRIGE = "WEBINAR_JOIN_SECRET_FORRIGE";

/** Det, seerens functions må vide om tilmeldingen. Mailen læses til .ics'ens ATTENDEE og forlader aldrig serveren i et JSON-svar. */
export const DELTAGER_FELTER = "id, email, session_id, token_version, kilde_system, webinar_id, webinar_titel";

export interface Deltager {
  id: string;
  email: string;
  session_id: string;
  token_version: number;
  webinar_id: string;
  webinar_titel: string | null;
}

export type Deltagerdom =
  | { ok: true; deltager: Deltager }
  | { ok: false; grund: "ingen_secret" | "form" | "aftryk" | "ukendt" | "version" | "ikke_platform" | "opslag" };

/** Secret'en til at BYGGE et token (webinar-tilmeld). null = ikke sat op. */
export function joinSecret(): string | null {
  const s = (Deno.env.get(JOIN_SECRET) ?? "").trim();
  return s === "" ? null : s;
}

export async function verifyDeltagertoken(token: unknown, adminClient: SupabaseClient): Promise<Deltagerdom> {
  const dom = await laesDeltagertoken(Deno.env.get(JOIN_SECRET), Deno.env.get(JOIN_SECRET_FORRIGE), token);
  if (!dom.ok) return { ok: false, grund: dom.grund };
  const { data, error } = await adminClient
    .from("webinar_tilmeldinger")
    .select(DELTAGER_FELTER)
    .eq("id", dom.tilmeldingId)
    .maybeSingle();
  if (error) return { ok: false, grund: "opslag" };
  if (!data) return { ok: false, grund: "ukendt" };
  const r = data as Record<string, unknown>;
  if (r.kilde_system !== "platform" || typeof r.session_id !== "string") return { ok: false, grund: "ikke_platform" };
  if (r.token_version !== dom.version) return { ok: false, grund: "version" };
  return {
    ok: true,
    deltager: {
      id: r.id as string,
      email: r.email as string,
      session_id: r.session_id,
      token_version: r.token_version as number,
      webinar_id: r.webinar_id as string,
      webinar_titel: (r.webinar_titel as string | null) ?? null,
    },
  };
}
