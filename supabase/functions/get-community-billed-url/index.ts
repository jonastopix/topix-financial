// Signerer en kortlivet URL for et community-billede, EFTER at databasens
// adgangsdom har sagt ja.
//
// Bucket A — rækkefølgen i kroppen er afgørende:
//   1. CORS-preflight.
//   2. authenticateUser(req) — kalderens identitet; service-role er IKKE
//      konstrueret endnu.
//   3. Inputvalidering: sti skal være en ikke-tom streng.
//   4. public.maa_se_community_billede(_user_id, _sti) kaldes med
//      KALDERENS klient (JWT-scoped, anon key) — dommen er porten, og
//      service-role må ikke være konstrueret endnu. Falsk → 403.
//   5. FØRST nu konstrueres adminClient, og den bruges KUN til
//      createSignedUrl mod bucketen 'community-billeder' (privat, ingen
//      SELECT-policy — service-role behøver ingen, jf. 20260812100000).
//
// Logning: stien logges ALDRIG i klartekst sammen med bruger-id — der er
// intet trunkerings-mønster i huset at spejle (get-chat-attachment-url
// logger kun fejlobjekter), så her logges kun udfaldet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

/** 3600 s og ikke chat-attachments' 600: et community-opslag læses i ro,
    ofte med flere billeder, og et kortere vindue ville give flere
    genhentninger uden at forbedre sikkerheden nævneværdigt — stien er
    allerede gated af dommen. */
export const SIGNED_URL_TTL_SEC = 3600;

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

  const { sti } = (body ?? {}) as { sti?: unknown };
  if (typeof sti !== "string" || sti.trim() === "") {
    return jsonResponse({ error: "Ugyldig sti" }, 400);
  }

  // ── 4. Adgangsdommen via KALDERENS klient — service-role er bevidst
  //       ikke konstrueret endnu. Funktionen er fail-closed (20260812110000):
  //       falsk uden community-adgang, og falsk når stien ikke optræder i
  //       et aktivt dokument. ──
  const { data: maaSe, error: domErr } = await callerClient.rpc(
    "maa_se_community_billede",
    { _user_id: callerId, _sti: sti },
  );

  if (domErr) {
    console.error("[get-community-billed-url] adgangsdom fejlede:", domErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (maaSe !== true) {
    // "Findes ikke" og "må ikke ses" skelnes bevidst ikke — det ville
    // lække eksistensinfo til uautoriserede kaldere.
    return jsonResponse({ error: "Ingen adgang til billedet" }, 403);
  }

  // ── 5. Service-role action — sign the URL. adminClient is a SEPARATE
  //       client object, constructed only after authz has passed. ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: signed, error: signErr } = await adminClient
    .storage.from("community-billeder")
    .createSignedUrl(sti, SIGNED_URL_TTL_SEC);

  if (signErr || !signed?.signedUrl) {
    console.error("[get-community-billed-url] createSignedUrl fejlede:", signErr);
    return jsonResponse({ error: "Signering fejlede" }, 500);
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString();
  return jsonResponse({ url: signed.signedUrl, expiresAt });
});
