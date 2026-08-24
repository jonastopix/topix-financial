// Opgave-modellens skrivevej: UDSKYDELSE ("ikke endnu", B7/B11). Første
// udskydelse er automatisk nu+14 dage (en medsendt dato IGNORERES af
// motoren), anden kræver at medlemmet vælger datoen, tredje afvises.
// Bucket A-form fra notify-community-svar — samme rækkefølge som
// opgave-accepter:
//   1. CORS  2. authenticateUser  3. validér input  4. opslag med
//   kalderens klient (RLS)  5. ejerskabs-tjek (user_id = caller)
//   6. motoren dømmer — reglerne gentages IKKE her  7. først derefter
//   service-role write med optimistisk lås (status + deferral_count).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { udskyd } from "../_shared/opgaveEngine.ts";
import { OPGAVE_KOLONNER, radTilOpgave, tilDbDato, parseDatoInput } from "../_shared/opgaveRad.ts";

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

  // ── 3. Parse + validér input. dato er VALGFRI (kun anden udskydelse
  //       bruger den) — men er den med, skal den være gyldig. ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ugyldig JSON-body" }, 400);
  }

  const { opgaveId, dato } = (body ?? {}) as { opgaveId?: unknown; dato?: unknown };
  if (typeof opgaveId !== "string" || opgaveId.trim() === "") {
    return jsonResponse({ error: "Ugyldig opgaveId" }, 400);
  }
  let nyDato: Date | undefined;
  if (dato !== undefined && dato !== null) {
    const parsed = parseDatoInput(dato);
    if (!parsed) {
      return jsonResponse({ error: "Ugyldig dato — forventer YYYY-MM-DD" }, 400);
    }
    nyDato = parsed;
  }

  // ── 4. Opgaven, med KALDERENS klient (RLS gater company-medlemskab) ──
  const { data: rad, error: radErr } = await callerClient
    .from("company_actions")
    .select(OPGAVE_KOLONNER)
    .eq("id", opgaveId)
    .maybeSingle();

  if (radErr) {
    console.error("[opgave-udskyd] opslag fejlede:", radErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!rad) {
    return jsonResponse({ error: "Opgaven findes ikke, eller du har ikke adgang til den" }, 404);
  }

  // ── 5. Ejerskab: user_id er medlemmet der ejer opgaven (design §7) ──
  if ((rad as Record<string, unknown>).user_id !== callerId) {
    return jsonResponse({ error: "Kun opgavens ejer kan udskyde den (B1)" }, 403);
  }

  // ── 6. Motoren dømmer — den ene sandhed for overgange ──
  const opgave = radTilOpgave(rad as Record<string, unknown>);
  const resultat = udskyd(opgave, new Date(), nyDato);
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
      due_date: tilDbDato(resultat.opgave.due_date!),
      deferral_count: resultat.opgave.deferral_count,
    })
    .eq("id", opgaveId)
    // Optimistisk lås: både tilstanden og tælleren skal stå som motoren
    // dømte ud fra — to samtidige udskydelser må ikke begge tælle som
    // "første gang".
    .eq("status", opgave.status)
    .eq("deferral_count", opgave.deferral_count)
    .select(OPGAVE_KOLONNER)
    .maybeSingle();

  if (updErr) {
    console.error("[opgave-udskyd] skrivning fejlede:", updErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!opdateret) {
    return jsonResponse({ error: "Opgaven blev ændret i mellemtiden — genindlæs og prøv igen" }, 409);
  }

  return jsonResponse({ ok: true, opgave: opdateret });
});
