/**
 * webinarMotorHent — sessionen, webinaret og den frosne tidslinje, hentet ét
 * sted for webinar-rum og webinar-puls (skive 1, 30/9-2026).
 *
 * Deno-side (IO). Dommene er rene og bor i ./webinarMotor/.
 *
 * HUKOMMELSES-CACHE PR. ISOLAT (10 s): ved 500 seere kommer ~33 pulser i
 * sekundet, og hver skal kende sessionens ur. Sessionen og webinaret ændrer sig
 * ikke under en session (tidslinjen er FROSSET i snapshot'et), så ti sekunders
 * forsinkelse på en ændring koster intet — og sparer to opslag pr. puls.
 *
 * LOGGER ALDRIG (webinar-puls må ikke logge pr. kald). Fejl gives tilbage.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import type { SessionUr } from "./webinarMotor/ur.ts";
import { laesTidslinje, type Tidslinje } from "./webinarMotor/interaktioner.ts";
import { OFFENTLIG_LAAS_NOEGLE, offentligLaasAaben } from "./webinarMotor/tilmelding.ts";

export const CACHE_MS = 10_000;

export interface RumData {
  session: {
    id: string;
    webinar_id: string;
    starter_at: string;
    type: string;
    status: string;
    kapacitet: number | null;
    tidslinje_version: number | null;
    ics_sekvens: number;
  };
  webinar: {
    id: string;
    slug: string;
    titel: string;
    vaert_navn: string | null;
    vaert_billede: string | null;
    bunny_video_id: string | null;
    intro_video_id: string | null;
    varighed_sek: number;
    intro_sek: number;
    lobby_min: number;
    exitrum_min: number;
    status: string;
    tidslinje_version: number;
  };
  ur: SessionUr;
  tidslinje: Tidslinje | null;
}

const cache = new Map<string, { udloeberMs: number; data: RumData }>();

export const SESSION_FELTER = "id, webinar_id, starter_at, type, status, kapacitet, tidslinje_version, tidslinje_snapshot, ics_sekvens";
export const WEBINAR_FELTER = "id, slug, titel, vaert_navn, vaert_billede, bunny_video_id, intro_video_id, varighed_sek, intro_sek, lobby_min, exitrum_min, status, tidslinje_version";

export function urAf(session: RumData["session"], webinar: RumData["webinar"]): SessionUr {
  return {
    starterMs: Date.parse(session.starter_at),
    varighedSek: webinar.varighed_sek,
    introSek: webinar.intro_sek,
    lobbyMin: webinar.lobby_min,
    exitrumMin: webinar.exitrum_min,
    status: session.status,
  };
}

/** Sessionen + webinaret. `udenCache` bruges af webinar-rum, som kan fryse tidslinjen. */
export async function hentRumData(admin: SupabaseClient, sessionId: string, nuMs: number, udenCache = false): Promise<{ ok: true; data: RumData } | { ok: false; grund: string }> {
  const kendt = cache.get(sessionId);
  if (!udenCache && kendt && kendt.udloeberMs > nuMs) return { ok: true, data: kendt.data };
  const { data: s, error: sFejl } = await admin.from("webinar_sessioner").select(SESSION_FELTER).eq("id", sessionId).maybeSingle();
  if (sFejl) return { ok: false, grund: `session: ${sFejl.message}` };
  if (!s) return { ok: false, grund: "session_findes_ikke" };
  const { data: w, error: wFejl } = await admin.from("webinarer").select(WEBINAR_FELTER).eq("id", s.webinar_id).maybeSingle();
  if (wFejl) return { ok: false, grund: `webinar: ${wFejl.message}` };
  if (!w) return { ok: false, grund: "webinar_findes_ikke" };
  const session = s as unknown as RumData["session"] & { tidslinje_snapshot: unknown };
  const webinar = w as unknown as RumData["webinar"];
  const data: RumData = { session, webinar, ur: urAf(session, webinar), tidslinje: laesTidslinje(session.tidslinje_snapshot) };
  cache.set(sessionId, { udloeberMs: nuMs + CACHE_MS, data });
  return { ok: true, data };
}

/**
 * FRYS TIDSLINJEN ved første rum-kald efter lobby-åbning (skive 1; skive 2's
 * webinar-motor-cron overtager det ved statusskiftet planlagt → aaben).
 * Idempotent: skrives KUN, når snapshot'et stadig er null — to seere i samme
 * sekund giver ét snapshot. Den udgivne version (webinarer.tidslinje_version)
 * er det, der fryses; 0 = intet udgivet = en tom tidslinje.
 */
export async function frysTidslinje(admin: SupabaseClient, data: RumData): Promise<{ ok: true; tidslinje: Tidslinje | null } | { ok: false; grund: string }> {
  if (data.tidslinje) return { ok: true, tidslinje: data.tidslinje };
  const version = data.webinar.tidslinje_version;
  let interaktioner: unknown[] = [];
  if (version > 0) {
    const { data: rk, error } = await admin
      .from("webinar_interaktioner")
      .select("id, art, vis_fra_sek, vis_til_sek, placering, indhold, betingelse, udloeber_kilde")
      .eq("webinar_id", data.webinar.id)
      .eq("version", version);
    if (error) return { ok: false, grund: `interaktioner: ${error.message}` };
    interaktioner = rk ?? [];
  }
  const snapshot = { version, interaktioner };
  const { error: frysFejl } = await admin
    .from("webinar_sessioner")
    .update({ tidslinje_snapshot: snapshot, tidslinje_version: version })
    .eq("id", data.session.id)
    .is("tidslinje_snapshot", null);
  if (frysFejl) return { ok: false, grund: `frys: ${frysFejl.message}` };
  // Læs det, der FAKTISK står (en anden kan have frosset først).
  const { data: s, error } = await admin.from("webinar_sessioner").select("tidslinje_snapshot").eq("id", data.session.id).maybeSingle();
  if (error) return { ok: false, grund: `frys-laes: ${error.message}` };
  const tidslinje = laesTidslinje(s?.tidslinje_snapshot);
  cache.delete(data.session.id);
  return { ok: true, tidslinje };
}

const iRummetCache = new Map<string, { udloeberMs: number; antal: number }>();

/** Seere med en puls inden for de sidste `sek` sekunder — talt højst hvert 10. sekund pr. session. */
export async function antalIRummet(admin: SupabaseClient, sessionId: string, nuMs: number, sek: number): Promise<number | null> {
  const kendt = iRummetCache.get(sessionId);
  if (kendt && kendt.udloeberMs > nuMs) return kendt.antal;
  const siden = new Date(nuMs - sek * 1000).toISOString();
  const { count, error } = await admin
    .from("webinar_deltagelser")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .gt("sidste_puls_at", siden);
  if (error) return null;
  const antal = count ?? 0;
  iRummetCache.set(sessionId, { udloeberMs: nuMs + CACHE_MS, antal });
  return antal;
}

/**
 * Låsen foran de OFFENTLIGE sessioner (rådets fund 30/9, MELLEM):
 * app_config[OFFENTLIG_LAAS_NOEGLE]. FAIL-CLOSED: fraværende række, en fejl
 * eller en anden værdi end true/"true" = lukket. Ingen cache — den læses kun
 * ved «sessioner», «tilmeld», rummets «tilstand» og «gen_tilmeld», aldrig pr. puls.
 */
export async function hentOffentligLaas(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await admin.from("app_config").select("config_value").eq("config_key", OFFENTLIG_LAAS_NOEGLE).maybeSingle();
    if (error) return false;
    return offentligLaasAaben((data as { config_value?: unknown } | null)?.config_value);
  } catch {
    return false;
  }
}
