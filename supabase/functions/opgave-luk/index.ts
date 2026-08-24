// Opgave-modellens skrivevej: LUK (B2/B7). Fire klient-udfald: done,
// not_done, dropped (fra active) og dismissed (fra proposed) — "drop den"
// er et lige så pænt svar som "gjort" (B7). 'expired' er BEVIDST ikke et
// klientvalg: det er tavshedens udfald og hører til udløbs-cron'en (B8).
// Bucket A-form fra notify-community-svar — samme rækkefølge som
// opgave-accepter:
//   1. CORS  2. authenticateUser  3. validér input  4. opslag med
//   kalderens klient (RLS)  5. ejerskabs-tjek (user_id = caller)
//   6. motoren dømmer — reglerne gentages IKKE her  7. først derefter
//   service-role write med optimistisk lås på status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { luk, type SlutUdfald } from "../_shared/opgaveEngine.ts";
import { OPGAVE_KOLONNER, radTilOpgave } from "../_shared/opgaveRad.ts";

const KLIENT_UDFALD = ["done", "not_done", "dropped", "dismissed"] as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // ── 1. CORS-preflight ──
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 2. Auth (Bucket A) — MUST precede any service-role construction ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // ── 3. Parse + validér input ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ugyldig JSON-body" }, 400);
  }

  const { opgaveId, udfald } = (body ?? {}) as { opgaveId?: unknown; udfald?: unknown };
  if (typeof opgaveId !== "string" || opgaveId.trim() === "") {
    return jsonResponse({ error: "Ugyldig opgaveId" }, 400);
  }
  if (typeof udfald !== "string" || !(KLIENT_UDFALD as readonly string[]).includes(udfald)) {
    return jsonResponse(
      { error: "Ugyldigt udfald — forventer done, not_done, dropped eller dismissed" },
      400,
    );
  }

  // ── 4. Opgaven, med KALDERENS klient (RLS gater company-medlemskab) ──
  const { data: rad, error: radErr } = await callerClient
    .from("company_actions")
    .select(OPGAVE_KOLONNER)
    .eq("id", opgaveId)
    .maybeSingle();

  if (radErr) {
    console.error("[opgave-luk] opslag fejlede:", radErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!rad) {
    return jsonResponse({ error: "Opgaven findes ikke, eller du har ikke adgang til den" }, 404);
  }

  // ── 5. Ejerskab: user_id er medlemmet der ejer opgaven (design §7) ──
  if ((rad as Record<string, unknown>).user_id !== callerId) {
    return jsonResponse({ error: "Kun opgavens ejer kan lukke den (B1)" }, 403);
  }

  // ── 6. Motoren dømmer — den ene sandhed for overgange (dismissed kun
  //       fra proposed, done/not_done/dropped kun fra active) ──
  const opgave = radTilOpgave(rad as Record<string, unknown>);
  const resultat = luk(opgave, udfald as SlutUdfald, new Date());
  if (!resultat.ok) {
    return jsonResponse({ error: resultat.grund }, 409);
  }

  // ── 7. Service-role write — adminClient konstrueres FØRST nu ──
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: opdateret, error: updErr } = await adminClient
    .from("company_actions")
    .update({
      status: resultat.opgave.status,
      closed_at: resultat.opgave.closed_at!.toISOString(),
    })
    .eq("id", opgaveId)
    .eq("status", opgave.status) // optimistisk lås: kun hvis rækken stadig er i den tilstand motoren dømte ud fra
    .select(OPGAVE_KOLONNER)
    .maybeSingle();

  if (updErr) {
    console.error("[opgave-luk] skrivning fejlede:", updErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!opdateret) {
    return jsonResponse({ error: "Opgaven blev ændret i mellemtiden — genindlæs og prøv igen" }, 409);
  }

  return jsonResponse({ ok: true, opgave: opdateret });
});
