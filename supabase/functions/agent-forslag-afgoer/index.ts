// agent-forslag-afgoer — rådgiverens afgørelse af et agent-forslag
// (design §7.4: afgørelser er tilstandsovergange og dømmes ét sted,
// server-side — klient-RLS på agent_proposals er bevidst læse-only).
//
// Bucket A-form (bunny-content-admin-forbilledet, PR #267-269-porten):
//   1. authenticateUser FØRST — verify_jwt = true i config.toml, gatewayen
//      bærer signaturtjekket.
//   2. Advisor-gate via callerClient.rpc("has_role") — et medlem afvises
//      med 403 FØR nogen service-role-klient konstrueres.
//   3. Target-ressourcen læses med KALDERENS klient (RLS-gated: advisors
//      har SELECT på agent_proposals/agent_runs) — først derefter adminClient.
//
// Rækkefølgen ved godkendelse er bindende (motorens kontrakt):
//   UDFØR skrivningen FØRST, afgør rækken BAGEFTER. Fejler skrivningen,
//   forbliver rækken 'proposed' og fejlen returneres. Begge skrivemål er
//   idempotente (agentSkriveveje.ts), så en gentagelse er ufarlig — et
//   'approved' uden udført skrivning er ikke.
//
// decided_by er ALTID kalderens auth.uid() — aldrig fra request-body
// (samme princip som run-company-agents company_id-tvangsoverskrivning).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { skrivSessionPrep, skrivUgensFokus } from "../_shared/agentSkriveveje.ts";
import {
  afgoerelsesPatch,
  kanAfgoeres,
  skrivegrundlag,
  UNDERSTOETTEDE_SKRIVEVEJE,
  validerInput,
  validerKategori,
  type Afgoerelse,
} from "../_shared/forslagEngine.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  // ── 1. CORS-preflight ──
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 2. Auth (Bucket A) — FØR alt andet ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // ── 3. Advisor-gate — afgørelser er rådgiver-only ──
  const { data: isAdvisor, error: roleError } = await callerClient.rpc("has_role", {
    _user_id: callerId,
    _role: "advisor",
  });
  if (roleError || !isAdvisor) {
    return jsonResponse({ error: "Forbidden — advisor role required" }, 403);
  }

  // ── 4. Parse + validér input (motoren dømmer formen) ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ugyldig JSON-body" }, 400);
  }
  const { proposal_id, decision, reason, edited_args, decision_category } = (body ?? {}) as {
    proposal_id?: unknown;
    decision?: unknown;
    reason?: unknown;
    edited_args?: unknown;
    decision_category?: unknown;
  };

  if (typeof proposal_id !== "string" || !UUID_RE.test(proposal_id)) {
    return jsonResponse({ error: "Ugyldig proposal_id (skal være UUID)" }, 400);
  }
  const inputDom = validerInput(decision, reason, edited_args);
  if (!inputDom.ok) {
    return jsonResponse({ error: inputDom.grund }, 400);
  }
  const afgoerelse = decision as Afgoerelse;

  // Kategorien (design §4.4): den tællelige dom — påkrævet ved reject,
  // afvist ved approve/approve_edited. decision_reason forbliver det
  // menneskelige fritekst-spor og er fortsat påkrævet ved reject
  // (validerInput ovenfor).
  const kategoriDom = validerKategori(afgoerelse, decision_category);
  if (!kategoriDom.ok) {
    return jsonResponse({ error: kategoriDom.grund }, 400);
  }

  // ── 5. Forslaget + kørslen, med KALDERENS klient (RLS: advisor-SELECT) ──
  const { data: forslag, error: forslagErr } = await callerClient
    .from("agent_proposals")
    .select("id, run_id, company_id, position, tool, args, status")
    .eq("id", proposal_id)
    .maybeSingle();
  if (forslagErr) {
    console.error("[agent-forslag-afgoer] opslag fejlede:", forslagErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!forslag) {
    return jsonResponse({ error: "Forslaget findes ikke, eller du har ikke adgang til det" }, 404);
  }

  // ── 6. Tilstandsdommen: kun 'proposed' kan afgøres — ærlig fejl ellers ──
  const tilstandsDom = kanAfgoeres(forslag.status);
  if (!tilstandsDom.ok) {
    return jsonResponse({ error: tilstandsDom.grund, status: forslag.status }, 409);
  }

  // Kørslen bærer trigger + period_key, som skrivevejene skal bruge.
  const { data: koersel, error: koerselErr } = await callerClient
    .from("agent_runs")
    .select("trigger, period_key")
    .eq("id", forslag.run_id)
    .maybeSingle();
  if (koerselErr || !koersel) {
    console.error("[agent-forslag-afgoer] kørsels-opslag fejlede:", koerselErr);
    return jsonResponse({ error: "Forslagets kørsel kunne ikke slås op" }, 500);
  }

  // ── 7. FØRST nu service role — skrivningen og afgørelsen ──
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (afgoerelse !== "reject") {
      // Kun de idempotente skriveveje kan godkendes i dag — resten afvises
      // ærligt indtil deres gentagelses-semantik er besluttet (design §7.4).
      if (!UNDERSTOETTEDE_SKRIVEVEJE.has(forslag.tool)) {
        return jsonResponse(
          {
            error: `unsupported_tool: '${forslag.tool}' kan endnu ikke godkendes — kun ${[...UNDERSTOETTEDE_SKRIVEVEJE].join(", ")}. Forslaget kan forkastes.`,
          },
          422,
        );
      }

      // Skrivegrundlaget: approve_edited = rådgiverens version, approve =
      // agentens original. company_id TVANGSOVERSKRIVES fra forslags-rækken —
      // hverken agentens args eller rådgiverens edited_args kan pege på en
      // anden virksomhed.
      const grundlag = skrivegrundlag(
        afgoerelse,
        (forslag.args ?? {}) as Record<string, unknown>,
        edited_args as Record<string, unknown> | undefined,
      );
      const skriveArgs = { ...grundlag, company_id: forslag.company_id };

      // ── 7a. UDFØR skrivningen FØRST (delt vej, agentSkriveveje.ts) ──
      const skriveResultat =
        forslag.tool === "update_weekly_focus"
          ? await skrivUgensFokus(adminClient, skriveArgs as any, koersel.trigger)
          : await skrivSessionPrep(adminClient, skriveArgs as any, koersel.period_key);

      if (skriveResultat.ok !== true) {
        // Fx no_conversation: rækken forbliver 'proposed', fejlen er ærlig.
        return jsonResponse(
          { error: `Skrivningen kunne ikke udføres (${(skriveResultat as { reason?: string }).reason ?? "ukendt"}) — forslaget står stadig som 'proposed'` },
          409,
        );
      }
    }

    // ── 7b. Afgør rækken BAGEFTER — optimistisk lås på status ──
    const patch = afgoerelsesPatch(
      afgoerelse,
      callerId,
      new Date(),
      typeof reason === "string" ? reason : undefined,
      edited_args as Record<string, unknown> | undefined,
      typeof decision_category === "string" ? decision_category : undefined,
    );
    const { data: opdateret, error: patchErr } = await adminClient
      .from("agent_proposals")
      .update(patch)
      .eq("id", forslag.id)
      .eq("status", "proposed")
      .select("id, status")
      .maybeSingle();
    if (patchErr) throw new Error(patchErr.message);
    if (!opdateret) {
      // En anden afgørelse kom først. Ved godkendelse ER skrivningen udført,
      // men målene er idempotente — gentagelsen er ufarlig; kun rækkens dom
      // står ved den førstes. Ærlig konflikt, aldrig stiltiende succes.
      return jsonResponse(
        { error: "Forslaget blev afgjort af en anden imens — afgørelsen er ikke gemt" },
        409,
      );
    }

    return jsonResponse({
      ok: true,
      proposal_id: forslag.id,
      status: opdateret.status,
      applied: afgoerelse !== "reject",
    });
  } catch (err) {
    // Uanset om det var skrivningen (7a) eller afgørelses-patchen (7b) der
    // kastede: rækken står stadig som 'proposed', og en gentagelse er
    // ufarlig (idempotente mål). Aldrig et 'approved' uden udført skrivning.
    console.error("[agent-forslag-afgoer] fejl:", err);
    return jsonResponse(
      { error: `Afgørelsen kunne ikke gennemføres — forslaget står stadig som 'proposed': ${err instanceof Error ? err.message : String(err)}` },
      500,
    );
  }
});
