// nyhed-udkast-afgoer — rådgiverens klik på et nyhedsudkast (nyhedsagenten
// skive 1, 30/9-2026). Tilstandsovergangene dømmes ÉT sted
// (_shared/nyhedAgent.ts: afgoerOvergang); klient-RLS på nyhed_udkast er
// bevidst læse-only for rådgivere.
//
// Bucket A-form (agent-forslag-afgoer-forbilledet):
//   1. authenticateUser FØRST — verify_jwt = true i config.toml.
//   2. Rådgiver-gate via callerClient.rpc("has_role") — et medlem afvises med
//      403, FØR nogen service-role-klient konstrueres.
//   3. Udkastet (og ved «publiceret» tråden) læses med KALDERENS klient
//      (RLS: rådgivere har SELECT) — først derefter adminClient til skrivningen.
//
// PUBLICERINGEN ER RÅDGIVERENS, IKKE DENNE FUNCTIONS: tråden oprettes af
// rådgiverens egen browser gennem husets eksisterende skrivevej
// (opret_community_traad som rådgiveren, derefter notify-community-naevnelse og
// notify-community-opslag — src/lib/nyheder/nyhederApi.ts). Denne function
// kender ikke skrivevejen; den dømmer kun rækkefølgen:
//   tag         kladde → publiceres   FØR tråden oprettes (to rådgivere kan ikke
//                                     publicere samme uge to gange)
//   publiceret  publiceres → godkendt EFTER tråden er oprettet; tråden skal findes,
//                                     og kalderen skal være dens forfatter
//   slip        publiceres → kladde   hvis oprettelsen fejlede (eller fanen blev
//                                     lukket — en anden kan slippe efter 10 min)
//   afvis       kladde → afvist
// Hver skrivning er guardet på den nuværende status, så et kapløb rammer nul
// rækker (409) i stedet for at overskrive.
//
// afgjort_af er ALTID kalderens auth.uid() — aldrig fra body'en.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { afgoerOvergang, dokumentTekst, HANDLINGER, type Handling, type Status } from "../_shared/nyhedAgent.ts";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["handling", "udkast_id", "traad_id", "grund"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (krop: unknown, status = 200) => new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 1. Auth (Bucket A) — FØR alt andet ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // ── 2. Rådgiver-gate ──
  const { data: erRaadgiver, error: rolleFejl } = await callerClient.rpc("has_role", { _user_id: callerId, _role: "advisor" });
  if (rolleFejl || !erRaadgiver) return json({ error: "Forbidden — advisor role required" }, 403);

  // ── 3. Body ──
  let body: Record<string, unknown> | null = null;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Ugyldig JSON-body" }, 400);
  }
  const ukendte = ukendteFelter(body, KENDTE_FELTER);
  if (ukendte.length > 0) return json({ error: ukendteFelterBesked(ukendte, KENDTE_FELTER) }, 400);
  const handling = body?.handling;
  const udkastId = body?.udkast_id;
  if (typeof handling !== "string" || !(HANDLINGER as readonly string[]).includes(handling)) return json({ error: `Ukendt handling — én af ${HANDLINGER.join(", ")}` }, 400);
  if (typeof udkastId !== "string" || !UUID_RE.test(udkastId)) return json({ error: "Ugyldig udkast_id (skal være UUID)" }, 400);
  const traadId = body?.traad_id;
  if (handling === "publiceret" && (typeof traadId !== "string" || !UUID_RE.test(traadId))) return json({ error: "publiceret kræver traad_id (UUID)" }, 400);
  const grund = typeof body?.grund === "string" ? body.grund.trim().slice(0, 500) : null;

  // ── 4. Udkastet med KALDERENS klient (RLS) ──
  const { data: udkast, error: udkastFejl } = await callerClient
    .from("nyhed_udkast")
    .select("id, titel, indhold_json, status, afgjort_af, afgjort_at")
    .eq("id", udkastId)
    .maybeSingle();
  if (udkastFejl) return json({ error: `nyhed_udkast: ${udkastFejl.message}` }, 500);
  if (!udkast) return json({ error: "Udkastet findes ikke" }, 404);
  const u = udkast as { id: string; titel: string; indhold_json: unknown; status: Status; afgjort_af: string | null; afgjort_at: string | null };

  const nu = new Date();
  const dom = afgoerOvergang(u, handling as Handling, callerId, nu);
  if (!dom.ok) return json({ error: dom.fejl, status: u.status }, dom.http);

  // ── 5. Ved «publiceret»: tråden skal findes, og kalderen skal have skrevet den ──
  let patch: Record<string, unknown>;
  switch (handling as Handling) {
    case "tag":
      patch = { status: dom.til, afgjort_af: callerId, afgjort_at: nu.toISOString() };
      break;
    case "slip":
      patch = { status: dom.til, afgjort_af: null, afgjort_at: null };
      break;
    case "afvis":
      patch = { status: dom.til, afgjort_af: callerId, afgjort_at: nu.toISOString(), afvist_grund: grund };
      break;
    case "publiceret": {
      const { data: traad, error: traadFejl } = await callerClient
        .from("community_traade")
        .select("id, forfatter_id, titel, indhold_json")
        .eq("id", traadId as string)
        .maybeSingle();
      if (traadFejl) return json({ error: `community_traade: ${traadFejl.message}` }, 500);
      const t = traad as { id: string; forfatter_id: string; titel: string; indhold_json: unknown } | null;
      if (!t) return json({ error: "Tråden findes ikke" }, 404);
      if (t.forfatter_id !== callerId) return json({ error: "Tråden er ikke skrevet af dig" }, 403);
      // «Godkendt uændret» (arkitekturen §1.3 pkt. 1): samme titel og samme tekst i dokumentorden.
      const uaendret = t.titel.trim() === u.titel.trim() && dokumentTekst(t.indhold_json) === dokumentTekst(u.indhold_json);
      patch = { status: dom.til, traad_id: t.id, afgjort_at: nu.toISOString(), uaendret };
      break;
    }
  }

  // ── 6. Skrivningen — service role, guardet på den status, dommen så ──
  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let opdatering = adminClient
    .from("nyhed_udkast")
    .update({ ...patch, updated_at: nu.toISOString() })
    .eq("id", u.id)
    .eq("status", u.status);
  // «publiceret» kun for den, der TOG udkastet — også hvis det er sluppet og taget af en anden imellem læsning og skrivning.
  if (handling === "publiceret") opdatering = opdatering.eq("afgjort_af", callerId);
  const { data: skrevet, error: skrivFejl } = await opdatering.select("id, status, traad_id, uaendret");
  if (skrivFejl) return json({ error: `nyhed_udkast: ${skrivFejl.message}` }, 500);
  if (!skrevet || skrevet.length === 0) return json({ error: "Udkastet blev ændret af en anden imens — hent siden igen" }, 409);
  return json({ ok: true, udkast: skrevet[0] });
});
