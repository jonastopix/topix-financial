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
//                                     være skrevet af den, der TOG udkastet, efter
//                                     «tag», og ikke høre til et andet udkast
//                                     (traadKanKnyttes). Efter 10 min må en anden
//                                     rådgiver «markere som publiceret».
//   slip        publiceres → kladde   hvis oprettelsen fejlede (eller fanen blev
//                                     lukket — en anden kan slippe efter 10 min).
//                                     AFVISES med 409 + traad_id, hvis forsøget
//                                     FIK oprettet en tråd (traadFraForsoeget) —
//                                     ellers gav «Frigiv» + ny publicering en tråd
//                                     til og notifikationer til alle igen.
//   afvis       kladde → afvist
// Hver skrivning er guardet på den nuværende status, så et kapløb rammer nul
// rækker (409) i stedet for at overskrive.
//
// afgjort_af er ALTID kalderens auth.uid() — aldrig fra body'en.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import {
  afgoerOvergang,
  dokumentTekst,
  HANDLINGER,
  type Handling,
  type Status,
  traadFraForsoeget,
  traadKanKnyttes,
  type TraadSpor,
} from "../_shared/nyhedAgent.ts";

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
    .select("id, titel, indhold_json, kilder, status, afgjort_af, afgjort_at")
    .eq("id", udkastId)
    .maybeSingle();
  if (udkastFejl) return json({ error: `nyhed_udkast: ${udkastFejl.message}` }, 500);
  if (!udkast) return json({ error: "Udkastet findes ikke" }, 404);
  const u = udkast as { id: string; titel: string; indhold_json: unknown; kilder: unknown; status: Status; afgjort_af: string | null; afgjort_at: string | null };

  const nu = new Date();
  const dom = afgoerOvergang(u, handling as Handling, callerId, nu);
  if (!dom.ok) return json({ error: dom.fejl, status: u.status }, dom.http);

  // ── 5. Ved «publiceret»: tråden skal findes, og kalderen skal have skrevet den ──
  let patch: Record<string, unknown>;
  switch (handling as Handling) {
    case "tag":
      patch = { status: dom.til, afgjort_af: callerId, afgjort_at: nu.toISOString() };
      break;
    case "slip": {
      // Fik forsøget oprettet en tråd? Så må udkastet ikke frigives (ny tråd + nye notifikationer).
      if (u.afgjort_af && u.afgjort_at) {
        const { data: traade, error: traadeFejl } = await callerClient
          .from("community_traade")
          .select("id, forfatter_id, titel, created_at, indhold_json")
          .eq("forfatter_id", u.afgjort_af)
          .gte("created_at", u.afgjort_at)
          .order("created_at", { ascending: false })
          .limit(20);
        if (traadeFejl) return json({ error: `community_traade: ${traadeFejl.message}` }, 500);
        const liste = (traade ?? []) as TraadSpor[];
        let andre = new Set<string>();
        if (liste.length > 0) {
          const { data: knyttet, error: knyttetFejl } = await callerClient
            .from("nyhed_udkast")
            .select("id, traad_id")
            .in("traad_id", liste.map((t) => t.id))
            .neq("id", u.id);
          if (knyttetFejl) return json({ error: `nyhed_udkast: ${knyttetFejl.message}` }, 500);
          andre = new Set(((knyttet ?? []) as { traad_id: string }[]).map((x) => x.traad_id));
        }
        const kildeUrls = Array.isArray(u.kilder) ? (u.kilder as { url?: unknown }[]).map((k) => k?.url).filter((x): x is string => typeof x === "string") : [];
        const fundet = traadFraForsoeget({ id: u.id, titel: u.titel, afgjort_af: u.afgjort_af, afgjort_at: u.afgjort_at, kildeUrls }, liste, andre);
        if (fundet) {
          return json({
            error: "Tråden blev oprettet — udkastet kan ikke frigives. Markér det som publiceret.",
            status: u.status,
            traad_id: fundet,
            kode: "traad_findes",
          }, 409);
        }
      }
      patch = { status: dom.til, afgjort_af: null, afgjort_at: null };
      break;
    }
    case "afvis":
      patch = { status: dom.til, afgjort_af: callerId, afgjort_at: nu.toISOString(), afvist_grund: grund };
      break;
    case "publiceret": {
      const { data: traad, error: traadFejl } = await callerClient
        .from("community_traade")
        .select("id, forfatter_id, titel, created_at, indhold_json")
        .eq("id", traadId as string)
        .maybeSingle();
      if (traadFejl) return json({ error: `community_traade: ${traadFejl.message}` }, 500);
      const t = traad as TraadSpor | null;
      if (!t) return json({ error: "Tråden findes ikke" }, 404);
      const { data: andetUdkast, error: andetFejl } = await callerClient
        .from("nyhed_udkast")
        .select("id")
        .eq("traad_id", t.id)
        .neq("id", u.id)
        .limit(1);
      if (andetFejl) return json({ error: `nyhed_udkast: ${andetFejl.message}` }, 500);
      const afvist = traadKanKnyttes(u, t, (andetUdkast ?? []).length > 0);
      if (afvist) return json({ error: afvist.fejl }, afvist.http);
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
  // «publiceret» og «slip» kun på det tag, dommen så — også hvis det er sluppet og taget af en anden imellem læsning og skrivning.
  if (handling === "publiceret" || handling === "slip") opdatering = opdatering.eq("afgjort_af", u.afgjort_af as string);
  const { data: skrevet, error: skrivFejl } = await opdatering.select("id, status, traad_id, uaendret");
  if (skrivFejl) return json({ error: `nyhed_udkast: ${skrivFejl.message}` }, 500);
  if (!skrevet || skrevet.length === 0) return json({ error: "Udkastet blev ændret af en anden imens — hent siden igen" }, 409);
  return json({ ok: true, udkast: skrevet[0] });
});
