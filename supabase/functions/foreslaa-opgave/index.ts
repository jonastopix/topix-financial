// foreslaa-opgave — rådgiveren foreslår en opgave til medlemmet fra
// chatten. En ny PRODUCENT oven på opgave-modellens beviste skrivevej,
// ingen ny mekanik: source_type 'advisor', status 'proposed', 30 dages
// udløb (B10), proposed_by = rådgiveren. due_date sættes IKKE — B6:
// datoen vælges af den der forpligter sig, ved accept i "Dine aftaler".
//
// Bucket A-form fra opgave-accepter:
//   1. CORS-preflight.
//   2. authenticateUser(req) FØRST — før nogen service-role-handling.
//   3. Validér input (delt dom i _shared/foreslaaOpgaveValidering.ts).
//   4. Virksomheds- og samtale-opslag med KALDERENS klient (RLS-gated).
//      Samtalen er INPUT, ikke et gæt: en virksomhed kan have flere
//      samtaler — CompanyChatPanes dedup pr. company_id findes netop af
//      den grund — så serveren må ikke gætte hvilken. Klienten sidder
//      allerede i den rigtige.
//   5. Rolletjek: kalderen skal være rådgiver (admin arver via has_role).
//   6. FØRST derefter service-role: find medlemmet, skriv forslaget,
//      skriv systembeskeden i samtalen.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { beregnUdloeb } from "../_shared/opgaveUdloeb.ts";
import { normaliserBegrundelse, validerTitel } from "../_shared/foreslaaOpgaveValidering.ts";

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

  const { companyId, conversationId, titel, begrundelse } = (body ?? {}) as {
    companyId?: unknown;
    conversationId?: unknown;
    titel?: unknown;
    begrundelse?: unknown;
  };
  if (typeof companyId !== "string" || companyId.trim() === "") {
    return jsonResponse({ error: "Ugyldig companyId" }, 400);
  }
  if (typeof conversationId !== "string" || conversationId.trim() === "") {
    return jsonResponse({ error: "Ugyldig conversationId" }, 400);
  }
  const titelDom = validerTitel(titel);
  if (!titelDom.ok) {
    return jsonResponse({ error: titelDom.grund }, 400);
  }
  const context = normaliserBegrundelse(begrundelse);

  // ── 4. Virksomheden, med KALDERENS klient (RLS gater adgangen) ──
  const { data: virksomhed, error: virkErr } = await callerClient
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();
  if (virkErr) {
    console.error("[foreslaa-opgave] virksomheds-opslag fejlede:", virkErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!virksomhed) {
    return jsonResponse({ error: "Virksomheden findes ikke, eller du har ikke adgang til den" }, 404);
  }

  // Samtalen, med KALDERENS klient: RLS gater adgangen, og company-
  // tjekket sikrer at forslaget ikke kobles til den forkerte virksomhed
  // — rådgiveren må hverken skrive i en samtale uden adgang eller
  // krydse forslag og virksomhed.
  const { data: samtale, error: samtaleErr } = await callerClient
    .from("conversations")
    .select("id, company_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (samtaleErr) {
    console.error("[foreslaa-opgave] samtale-opslag fejlede:", samtaleErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!samtale) {
    return jsonResponse({ error: "Samtalen findes ikke, eller du har ikke adgang til den" }, 404);
  }
  if (samtale.company_id !== companyId) {
    return jsonResponse({ error: "Samtalen hører ikke til den virksomhed forslaget gælder" }, 403);
  }

  // ── 5. Rolletjek: kun rådgivere foreslår (admin arver via has_role) ──
  const { data: erRaadgiver, error: rolleErr } = await callerClient.rpc("has_role", {
    _user_id: callerId,
    _role: "advisor",
  });
  if (rolleErr || !erRaadgiver) {
    return jsonResponse({ error: "Kun rådgivere kan foreslå opgaver" }, 403);
  }

  // ── 6. Service-role — konstrueres FØRST nu ──
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Medlemmet (opgavens ejer, user_id per design §7) er den FØRST
  // OPRETTEDE company_members-række pr. virksomhed (created_at ASC):
  // role-kolonnen har ingen CHECK og kan ikke bruges som filter — samme
  // dom som run-company-agent og send-slack-report-notification
  // (PR #343/#345-lærdommen).
  const { data: medlem, error: medlemErr } = await adminClient
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (medlemErr) {
    console.error("[foreslaa-opgave] medlems-opslag fejlede:", medlemErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!medlem) {
    return jsonResponse({ error: "Virksomheden har intet medlem — forslaget ville ingen modtager have" }, 404);
  }

  // Forslaget. B10: udløbsfristen for kilden 'advisor' er 30 dage —
  // reglen bor i _shared/opgaveUdloeb.ts (spejl af opgaveEngine.ts) og
  // hardcodes ALDRIG her.
  const { data: opgave, error: opgaveErr } = await adminClient
    .from("company_actions")
    .insert({
      company_id: companyId,
      user_id: medlem.user_id,
      title: titelDom.titel,
      context,
      source_type: "advisor",
      status: "proposed",
      priority: "medium",
      proposed_by: callerId,
      expires_at: beregnUdloeb("advisor", new Date()).toISOString(),
    })
    .select("id")
    .single();
  if (opgaveErr) {
    console.error("[foreslaa-opgave] skrivning fejlede:", opgaveErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }

  // Systembesked i samtalen — sporet af forslaget, ikke selve forslaget.
  // message_type SKAL være 'system': beskeder uden for
  // ('user','system','ai') rammes ikke af mark_messages_read og bliver
  // evigt ulæste (chat-recon-2 §3, welcome/nudge-fælden).
  // awaiting_reply_from røres IKKE: medlemmet skylder ikke et chat-svar —
  // de skylder et ja/nej i "Dine aftaler" på forsiden.
  // Fejler beskeden, er opgaven stadig skrevet og kaldet ok — opgaven er
  // det vigtige, beskeden er sporet; fejlen logges og meldes i svaret
  // frem for at blive slugt eller vælte det hele.
  let beskedSkrevet = false;
  const { error: beskedErr } = await adminClient.from("messages").insert({
    conversation_id: samtale.id,
    sender_id: callerId,
    content: context
      ? `Forslag til en opgave: "${titelDom.titel}" — ${context}`
      : `Forslag til en opgave: "${titelDom.titel}"`,
    message_type: "system",
    context_type: "opgave_forslag",
    context_meta: { action_id: opgave.id, title: titelDom.titel },
  });
  if (beskedErr) {
    console.error("[foreslaa-opgave] besked fejlede:", beskedErr);
  } else {
    beskedSkrevet = true;
  }

  return jsonResponse({ ok: true, actionId: opgave.id, beskedSkrevet });
});
