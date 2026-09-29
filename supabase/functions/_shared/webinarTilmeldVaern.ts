/**
 * Værnet foran webinar-tilmeld — den offentlige indgang (skive 1, 30/9-2026).
 *
 * Kalderen er en besøgende på topix.dk UDEN konto; der findes intet token
 * endnu (tilmeldingen er det, der skaber det). Legitimationen er derfor ikke
 * en hemmelighed, men et sæt grænser — samme klasse som ansoegning-gem's
 * «opret» (honningfelt + IP-dagshash-loft). Registreret som prædikat
 * (verifyOffentligTilmelding) i scripts/check-edge-function-auth.ts; kaldes FØR
 * enhver service-role-skrivning.
 *
 *   1. Origin på tilladelseslisten (topix.dk, www.topix.dk, app.theboardroom.dk
 *      — sidstnævnte til reserveformularen /w/:slug/tilmeld, spec §D5). Et kald
 *      uden Origin (curl, en bot) afvises; beviset i drift sender Origin selv.
 *   2. Kroppen bærer KUN kendte felter — dømt i functionen selv med
 *      kendteFelter.ts FØR værnet (bodyFelter.guard læser index.ts), #1027.
 *   3. Honningfeltet «hjemmeside»: udfyldt = bot. Svaret er et «ok» uden token,
 *      så botten intet lærer, og intet skrives.
 *   4. Loftet: højst TILMELD_PR_IP_PR_TIME nye tilmeldinger pr. IP-dagshash pr.
 *      time og TILMELD_PR_TIME_I_ALT i alt. IP'en gemmes ALDRIG rå:
 *      sha256(ip + ":" + dato) skifter hver dag. Tællingen er FAIL-CLOSED.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

export const TILLADTE_ORIGINS = ["https://topix.dk", "https://www.topix.dk", "https://app.theboardroom.dk"] as const;

/** Som ansoegning-gem (Jonas 18/9): CGNAT og kontor-wifi deler én IP — 30, ikke 5. */
export const TILMELD_PR_IP_PR_TIME = 30;
/** En annoncebølge til 500 seere — loftet er alarmen i bunden, ikke en kvote. */
export const TILMELD_PR_TIME_I_ALT = 1000;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ipDagshash(req: Request, nuMs: number): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "ukendt";
  return await sha256Hex(`${ip}:${new Date(nuMs).toISOString().slice(0, 10)}`);
}

export function tilladtOrigin(req: Request): string | null {
  const o = (req.headers.get("origin") ?? "").trim();
  return (TILLADTE_ORIGINS as readonly string[]).includes(o) ? o : null;
}

async function antalSidsteTime(admin: SupabaseClient, ipHash: string | null, nuMs: number): Promise<number> {
  const siden = new Date(nuMs - 60 * 60 * 1000).toISOString();
  let q = admin.from("webinar_tilmeldinger").select("id", { count: "exact", head: true }).eq("kilde_system", "platform").gte("created_at", siden);
  if (ipHash) q = q.eq("ip_dagshash", ipHash);
  const { count, error } = await q;
  if (error) return Number.MAX_SAFE_INTEGER; // fail-closed: kan vi ikke tælle, tilmelder vi ikke
  return count ?? 0;
}

export type Vaerndom =
  | { ok: true; ipHash: string; honning: false }
  | { ok: true; ipHash: null; honning: true }
  | { ok: false; status: number; fejl: string };

/**
 * Dommen over et kald. `medLoft` = false for læsningen «sessioner» (ingen
 * skrivning, intet at begrænse ud over origin og felter).
 */
export async function verifyOffentligTilmelding(
  req: Request,
  body: Record<string, unknown> | null,
  admin: SupabaseClient,
  nuMs: number,
  medLoft: boolean,
): Promise<Vaerndom> {
  if (!tilladtOrigin(req)) return { ok: false, status: 403, fejl: "origin" };
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, fejl: "krop" };
  if (typeof body.hjemmeside === "string" && body.hjemmeside.trim() !== "") return { ok: true, ipHash: null, honning: true };
  const ipHash = await ipDagshash(req, nuMs);
  if (medLoft) {
    if ((await antalSidsteTime(admin, ipHash, nuMs)) >= TILMELD_PR_IP_PR_TIME) return { ok: false, status: 429, fejl: "loft_ip" };
    if ((await antalSidsteTime(admin, null, nuMs)) >= TILMELD_PR_TIME_I_ALT) return { ok: false, status: 429, fejl: "loft_i_alt" };
  }
  return { ok: true, ipHash, honning: false };
}
