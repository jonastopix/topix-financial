// webinar-deling — rådgiverens forvaltning af private links til /webinar (udkast
// 21/9-2026, recon-webinar-deling.md). Bucket A:
//   1. authenticateUser FØRST — verify_jwt = true i config.toml.
//   2. Rådgiver-gate via callerClient.rpc("has_role", advisor) — et medlem afvises
//      med 403 FØR service-role-klienten konstrueres (klaviyo-motor-mønstret).
//   3. FØRST derefter service role: opret · forlaeng · luk.
//
// TRE HANDLINGER (body.handling), STRIKS body (handling · navn · dage · id):
//   opret     navn (1–80 tegn) + dage (standard 90, højst 365) → ny række med
//             SHA-256-aftrykket af et nyt 256-bit token; svaret bærer tokenet og
//             linket — DEN ENESTE GANG tokenet findes uden for modtagerens link
//             (delingstokenAuth.ts siger hvorfor det ikke gemmes).
//   forlaeng  id + dage → udløbet flyttes `dage` frem fra det seneste af nu og
//             det gamle udløb. En lukket deling kan ikke forlænges (409).
//   luk       id → lukket_at = nu (idempotent).
// Hver handling står i sporet (webinar_deling_spor: oprettet · forlaenget · lukket)
// med rådgiverens id i detaljer, IP og user-agent — som visningerne.
//
// Listen (navn, udløb, sidst set, antal visninger) læses IKKE her: rådgiverne har
// SELECT gennem RLS på webinar_delinger og webinar_deling_spor, og fladen udleder
// tallene af sporet (src/lib/webinar/deling.ts delingsOversigt).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { APP_URL } from "../_shared/ansoegningMail.ts";
import { delingsAftryk } from "../_shared/delingstokenAuth.ts";
import {
  delingsUrl, erDageGyldige, forlaengetUdloeb, rensNavn, type SporHaendelse, STANDARD_DAGE, tilBase64Url, TOKEN_BYTES, udloebEfter,
} from "../_shared/webinarDeling.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[webinar-deling]";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["handling", "navn", "dage", "id"] as const;
const HANDLINGER = ["opret", "forlaeng", "luk"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Kalder { ip: string | null; user_agent: string | null }
function laesKalder(req: Request): Kalder {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ua = req.headers.get("user-agent")?.trim().slice(0, 512);
  return { ip: cf || xff || null, user_agent: ua || null };
}

async function skrivSpor(admin: SupabaseClient, delingId: string, haendelse: SporHaendelse, kalder: Kalder, detaljer: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from("webinar_deling_spor").insert({ deling_id: delingId, haendelse, ip: kalder.ip, user_agent: kalder.user_agent, detaljer });
  if (error) console.error(`${LOG} SPOR IKKE SKREVET (${haendelse}) for deling ${delingId}:`, error.message);
}

/** Et nyt token: 32 bytes fra crypto, base64url (43 tegn). Findes kun i svaret og i linket. */
function nytToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return tilBase64Url(bytes);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 1. Kalderen — FØRST. ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // ── 2. Rådgiver-gaten gennem kalderens egen klient (RLS/has_role), før service role. ──
  const { data: erRaadgiver, error: rolleFejl } = await callerClient.rpc("has_role", { _user_id: callerId, _role: "advisor" });
  if (rolleFejl || erRaadgiver !== true) return json({ error: "kun_raadgivere" }, 403);

  let raaBody: Record<string, unknown> | null = null;
  try {
    raaBody = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "body_mangler" }, 400);
  }
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ error: "ukendte_felter", besked }, 400);
  }
  const handling = raaBody?.handling;
  if (typeof handling !== "string" || !(HANDLINGER as readonly string[]).includes(handling)) return json({ error: "handling_ugyldig" }, 400);
  const nu = new Date();
  const kalder = laesKalder(req);

  // ── 3. Service role — først nu. ──
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    if (handling === "opret") {
      const navn = rensNavn(raaBody?.navn);
      if (navn === null) return json({ error: "navn_ugyldigt" }, 400);
      const dage = raaBody?.dage === undefined ? STANDARD_DAGE : raaBody.dage;
      if (!erDageGyldige(dage)) return json({ error: "dage_ugyldige" }, 400);
      const token = nytToken();
      const aftryk = await delingsAftryk(token);
      const udloeberAt = udloebEfter(nu, dage);
      const { data, error } = await admin.from("webinar_delinger")
        .insert({ navn, token_aftryk: aftryk, oprettet_af: callerId, udloeber_at: udloeberAt })
        .select("id").single();
      if (error || !data) throw new Error(`webinar_delinger insert: ${error?.message ?? "intet id"}`);
      const id = String((data as { id: string }).id);
      await skrivSpor(admin, id, "oprettet", kalder, { af: callerId, dage, udloeber_at: udloeberAt });
      console.log(`${LOG} oprettet ${id} («${navn}», ${dage} dage) af ${callerId}`);
      // Tokenet står KUN her — én gang. Aftrykket er det eneste, basen har.
      return json({ ok: true, id, navn, token, url: delingsUrl(APP_URL, token), udloeber_at: udloeberAt });
    }

    const id = raaBody?.id;
    if (typeof id !== "string" || !UUID.test(id)) return json({ error: "id_ugyldigt" }, 400);
    const { data: raekke, error: hentFejl } = await admin.from("webinar_delinger").select("id, udloeber_at, lukket_at").eq("id", id).maybeSingle();
    if (hentFejl) throw new Error(`webinar_delinger: ${hentFejl.message}`);
    if (!raekke) return json({ error: "findes_ikke" }, 404);
    const r = raekke as { id: string; udloeber_at: string; lukket_at: string | null };

    if (handling === "forlaeng") {
      const dage = raaBody?.dage === undefined ? STANDARD_DAGE : raaBody.dage;
      if (!erDageGyldige(dage)) return json({ error: "dage_ugyldige" }, 400);
      if (r.lukket_at !== null) return json({ error: "lukket" }, 409);
      const til = forlaengetUdloeb(r.udloeber_at, dage, nu);
      const { error } = await admin.from("webinar_delinger").update({ udloeber_at: til }).eq("id", id);
      if (error) throw new Error(`webinar_delinger update: ${error.message}`);
      await skrivSpor(admin, id, "forlaenget", kalder, { af: callerId, dage, fra: r.udloeber_at, til });
      return json({ ok: true, id, udloeber_at: til });
    }

    // luk — idempotent.
    if (r.lukket_at === null) {
      const { error } = await admin.from("webinar_delinger").update({ lukket_at: nu.toISOString() }).eq("id", id).is("lukket_at", null);
      if (error) throw new Error(`webinar_delinger luk: ${error.message}`);
      await skrivSpor(admin, id, "lukket", kalder, { af: callerId });
    }
    return json({ ok: true, id, lukket_at: r.lukket_at ?? nu.toISOString() });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} ${handling} væltede:`, grund);
    return json({ error: "fejl", grund }, 500);
  }
});
