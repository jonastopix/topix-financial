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
//   6. Self-guard: eget svar på egen tråd notificerer ikke (medlemmets række).
//   7. FØRST derefter adminClient + writeNotification.
//   8. Rådgivernes KLOKKE (Jonas 21/9: klokke, ikke mail): når svarets
//      forfatter IKKE er rådgiver, ringer klokken gennem skrivRaadgiverBesked
//      — type community_svar, reference_type community_traad, reference_id =
//      trådens id (linket går til tråden), titlen med svarets forfatter og
//      trådens titel (communitySvarBesked.ts, spejl af communityOpslagBesked).
//      Én ULÆST klokke pr. tråd pr. rådgiver: writeren kaldes med
//      dedupKunUlaeste (kun ulæste rækker spærrer) — flere svar før læsning
//      samles i den ene, og efter læsning giver næste svar en ny.
//      Alt i try/catch efter trin 7: klokken må ALDRIG koste medlemmets
//      notifikation eller svaret. Medlemmets notifikation (trin 7) er URØRT.
//      Klokken ringer også ved et svar på egen tråd — det er stadig et svar.
//
// MODTAGER-AFGRÆNSNINGEN ER BEVIDST: kun trådens forfatter, ikke alle
// der har svaret i tråden. Chat-mønstret (notify-chat-reply) notificerer
// hele virksomheden, men her er det tydeligst forfatteren, det angår.
// Deltager-notifikationer kan tilføjes senere, når der er trafik at
// måle på.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotification } from "../_shared/notificationWriter.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { beskedVedSvar } from "../_shared/communitySvarBesked.ts";

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
  //       fordi modtageren er præcis én person. Gælder MEDLEMMETS række;
  //       rådgivernes klokke (trin 8) ringer stadig. ──
  const egetSvar = traad.forfatter_id === svar.forfatter_id;

  // ── 7. Service-role action — adminClient konstrueres FØRST nu, og
  //       bruges til writeNotification og klokken. ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const indsat = egetSvar ? false : await writeNotification(adminClient, {
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

  // ── 8. Rådgivernes klokke — efter trin 7, aldrig på bekostning af det ──
  try {
    const { data: roller, error: rolleFejl } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", svar.forfatter_id)
      .in("role", ["advisor", "admin"])
      .limit(1);
    if (rolleFejl) throw new Error(`user_roles-opslag fejlede: ${rolleFejl.message}`);
    const forfatterErRaadgiver = (roller ?? []).length > 0;

    // Svarets forfatter: navnet som feedet viser det (get_community_medlemmer — forfatteren har selv adgang og står i listen).
    const { data: medlemmer, error: medlemFejl } = await callerClient.rpc("get_community_medlemmer");
    if (medlemFejl) console.error("[notify-community-svar] get_community_medlemmer fejlede — klokken får «Et medlem»:", medlemFejl.message);
    const forfatter = ((medlemmer ?? []) as { user_id: string; navn: string | null }[]).find((m) => m.user_id === svar.forfatter_id);

    // Forfatterens virksomhed — ældste medlemskab først, som notify-community-opslag. Fejler opslaget: null, ikke stop.
    let companyId: string | null = null;
    const { data: medlemskab, error: medlemskabFejl } = await adminClient
      .from("company_members")
      .select("company_id")
      .eq("user_id", svar.forfatter_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (medlemskabFejl) console.error("[notify-community-svar] company_members-opslag fejlede — klokken får company_id null:", medlemskabFejl.message);
    else companyId = (medlemskab as { company_id?: string | null } | null)?.company_id ?? null;

    const besked = beskedVedSvar({
      traadId: traad.id,
      traadTitel: traad.titel,
      forfatterId: svar.forfatter_id,
      forfatterNavn: forfatter?.navn,
      forfatterErRaadgiver,
      companyId,
    });
    if (besked) {
      // Én ULÆST klokke pr. tråd pr. rådgiver (Jonas 21/9): dedup kun mod ulæste rækker — læst den, ringer næste svar igen.
      const klokke = await skrivRaadgiverBesked(adminClient, besked, { dedupKunUlaeste: true });
      console.log(
        `[notify-community-svar] klokken: ${klokke.skrevet} skrevet, ${klokke.fandtes} fandtes, ${klokke.raadgivere} rådgivere${klokke.fejl.length ? ` — fejl: ${klokke.fejl.join("; ")}` : ""}`,
      );
    } else {
      console.log(`[notify-community-svar] klokken: ingen besked (forfatteren er rådgiver)`);
    }
  } catch (err) {
    console.error("[notify-community-svar] klokken ringede ikke —", err instanceof Error ? err.message : String(err));
  }

  return jsonResponse({ notificeret: indsat });
});
