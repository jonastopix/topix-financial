// Notificerer trådens forfatter, når nogen svarer på opslaget.
// Søsterfunktion til notify-chat-reply — samme Bucket A-form.
//
// Rækkefølgen i kroppen:
//   1. CORS-preflight.
//   2. authenticateUser(req) — kalderens identitet.
//   3. Validér svarId som ikke-tom streng, ellers 400.
//   4. Slå svaret op med KALDERENS klient (RLS-gated). Findes det ikke,
//      eller er det ikke aktivt: { notificeret: false } med 200.
//   5. Slå tråden op — ikke aktiv: { notificeret: false }.
//   6. Self-guard: eget svar på egen tråd notificerer ikke.
//   7. FØRST derefter adminClient + writeNotification.
//
// MODTAGER-AFGRÆNSNINGEN ER BEVIDST: kun trådens forfatter, ikke alle
// der har svaret i tråden. Chat-mønstret (notify-chat-reply) notificerer
// hele virksomheden, men her er det tydeligst forfatteren, det angår.
// Deltager-notifikationer kan tilføjes senere, når der er trafik at
// måle på.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotification } from "../_shared/notificationWriter.ts";

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
  const { callerClient } = auth;

  // ── 3. Parse + validér input ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ugyldig JSON-body" }, 400);
  }

  const { svarId } = (body ?? {}) as { svarId?: unknown };
  if (typeof svarId !== "string" || svarId.trim() === "") {
    return jsonResponse({ error: "Ugyldig svarId" }, 400);
  }

  // ── 4. Svaret, med KALDERENS klient (RLS gater læsningen). Et
  //       manglende svar er IKKE en fejl: kaldet er en bivirkning af at
  //       have svaret, og må aldrig give en fejlskærm — derfor 200 med
  //       { notificeret: false } frem for 404/403. ──
  const { data: svar, error: svarErr } = await callerClient
    .from("community_svar")
    .select("traad_id, forfatter_id, status")
    .eq("id", svarId)
    .maybeSingle();

  if (svarErr) {
    console.error("[notify-community-svar] svar-opslag fejlede:", svarErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!svar || svar.status !== "aktiv") {
    return jsonResponse({ notificeret: false });
  }

  // ── 5. Tråden — skal også være aktiv. ──
  const { data: traad, error: traadErr } = await callerClient
    .from("community_traade")
    .select("id, forfatter_id, titel, status")
    .eq("id", svar.traad_id)
    .maybeSingle();

  if (traadErr) {
    console.error("[notify-community-svar] traad-opslag fejlede:", traadErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!traad || traad.status !== "aktiv") {
    return jsonResponse({ notificeret: false });
  }

  // ── 6. Self-guard: man notificeres ikke om sit eget svar på sin egen
  //       tråd — samme værn som notify-chat-replys .neq("user_id",
  //       callerId) (index.ts:58), her blot som direkte sammenligning,
  //       fordi modtageren er præcis én person. ──
  if (traad.forfatter_id === svar.forfatter_id) {
    return jsonResponse({ notificeret: false });
  }

  // ── 7. Service-role action — adminClient konstrueres FØRST nu, og
  //       bruges kun til writeNotification. ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const indsat = await writeNotification(adminClient, {
    user_id: traad.forfatter_id,
    type: "community_svar",
    /* priority "info" er BEVIDST: send-notification-email filtrerer til
       important/action_required (index.ts:149), så info når aldrig
       mailkøen. Et svar i community hører i appen, ikke i indbakken —
       kadenceloftet er to systemmails om ugen. */
    priority: "info",
    title: "Nyt svar på dit opslag",
    body: traad.titel,
    deep_link: `/community/${svar.traad_id}`,
    reference_type: "community_traad",
    reference_id: traad.id,
    /* Dedup pr. SVAR, ikke pr. tråd: hvert svar fortjener sin egen
       besked, men et gentaget kald for samme svar må ikke give to. */
    dedup_key: `community_svar:${svarId}`,
  });

  return jsonResponse({ notificeret: indsat });
});
