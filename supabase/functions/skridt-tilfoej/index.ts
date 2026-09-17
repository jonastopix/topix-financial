// skridt-tilfoej — MEDLEMMET tilføjer selv et skridt under et af sine
// aktive mål («Dine mål»). «Én plan pr. virksomhed», 17/9-2026.
//
// JONAS 17/9 (ordret: «ja») til chattens forslag: en knap «Tilføj skridt»
// under hvert af medlemmets aktive mål; skridtet oprettes som AKTIVT med det
// samme (medlemmets eget — intet forslag at acceptere); titel mindst 3 tegn;
// dubletkontrollen gælder; rådgiveren ser det i Planen med mærket
// «medlemmets eget», og det tæller i fremdriften. Baggrund, Jonas 16/9
// (ordret): «Nej. Vi er rådgivere, men det er medlemmernes virksomheder.»
//
// FRISTEN — JONAS 17/9 (ordret: «1») til STOP-rapporten: fristen er
// OBLIGATORISK. Det første «ja» sagde «frist valgfri»; men B3 («Ingen opgave
// uden dato», docs/opgave-model-design.md §B3) står i databasen som CHECK'en
// company_actions_active_requires_due_date, og motorens udskyd afviser en
// aktiv opgave uden due_date. Så «frist valgfri» er blevet «frist
// FORESLÅET»: formularen foreslår i dag + 14 dage (dansk tid), datoen kan
// ændres men ikke tømmes, ingen dato før i dag. Dommen er
// _shared/skridtForslag.ts doemFrist — samme kode som fladen bruger.
//
// Bucket A-form fra foreslaa-opgave:
//   1. CORS-preflight.
//   2. authenticateUser(req) FØRST — før nogen service-role-handling.
//   3. Validér input: companyId, maalId, titel (validerSkridtTitel: 3–200
//      tegn), dueDate (doemFrist) — 400 med klar tekst.
//   4. Medlemskab med KALDERENS klient: kalderen skal have en
//      company_members-række hos virksomheden (RLS gater; en rådgiver der
//      OGSÅ er medlem afvises ikke — rådgiverens egen vej er foreslaa-opgave).
//   5. FØRST derefter service-role: målet findes hos SAMME virksomhed og er
//      aktivt (404/409 — samme tekster som foreslaa-opgave).
//   6. Dubletkontrollen: doemSkrivning med skriveren «medlem» (kun
//      dubletkontrol — som rådgiveren, valg A) og målets id (afvist under
//      samme mål kommer aldrig igen, fase 5). 409 med klar tekst.
//   7. Insert: status 'active', source_type 'manual' (constrainten
//      company_actions_source_type_check kender den — den gamle
//      Milestones-sides værdi for medlemmets egne opgaver), maal_id,
//      user_id = kalderen, proposed_by = kalderen, accepted_at = nu,
//      due_date fra body. Svar { ok, actionId }.
//
// Målets gemte progress røres IKKE her: fladerne regner fremdriften af
// skridtene (planen.ts/maalFremdrift), og opgave-luk skriver den ved næste
// lukning («fremdriften regnes igen ved næste lukning», opgave-luk §8).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { validerSkridtTitel } from "../_shared/foreslaaOpgaveValidering.ts";
import { doemFrist, doemSkrivning, SKRIVE_SELECT_KOLONNER, skriveFilter } from "../_shared/skridtForslag.ts";

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

  const { companyId, maalId, titel, dueDate } = (body ?? {}) as {
    companyId?: unknown;
    maalId?: unknown;
    titel?: unknown;
    /** PÅKRÆVET (Jonas 17/9: «1»): «YYYY-MM-DD», ikke før i dag i dansk tid. */
    dueDate?: unknown;
  };
  if (typeof companyId !== "string" || companyId.trim() === "") {
    return jsonResponse({ error: "Ugyldig companyId" }, 400);
  }
  if (typeof maalId !== "string" || maalId.trim() === "") {
    return jsonResponse({ error: "Ugyldig maalId — et skridt hører til et mål" }, 400);
  }
  const titelDom = validerSkridtTitel(titel);
  if (!titelDom.ok) {
    return jsonResponse({ error: titelDom.grund }, 400);
  }
  const nu = new Date();
  const fristDom = doemFrist(dueDate, nu);
  if (!fristDom.ok) {
    return jsonResponse({ error: fristDom.grund }, 400);
  }

  // ── 4. Medlemskab, med KALDERENS klient (RLS gater adgangen) ──
  const { data: medlemskab, error: medlemErr } = await callerClient
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (medlemErr) {
    console.error("[skridt-tilfoej] medlemskabs-opslag fejlede:", medlemErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!medlemskab) {
    return jsonResponse({ error: "Du er ikke medlem af den virksomhed — kun medlemmet tilføjer skridt til sin egen plan" }, 403);
  }

  // ── 5. Service-role — konstrueres FØRST nu ──
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Målet: findes hos SAMME virksomhed og er aktivt (parkerede og nåede mål
  // får ingen skridt). Et mål fra en anden virksomhed ser ud som «findes
  // ikke» (404), aldrig som et link på tværs. Samme tekster som foreslaa-opgave.
  const { data: maal, error: maalErr } = await adminClient
    .from("milestones")
    .select("id, status")
    .eq("id", maalId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (maalErr) {
    console.error("[skridt-tilfoej] mål-opslag fejlede:", maalErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!maal) {
    return jsonResponse({ error: "Målet findes ikke hos denne virksomhed" }, 404);
  }
  if ((maal as { status: string }).status !== "active") {
    return jsonResponse({ error: "Målet er ikke aktivt — et skridt kan kun høre til et aktivt mål" }, 409);
  }

  // ── 6. Dubletkontrollen FØR insert — skriveren er medlemmet ──
  const { data: eksisterende, error: eksErr } = await adminClient
    .from("company_actions")
    .select(SKRIVE_SELECT_KOLONNER)
    .eq("company_id", companyId)
    .or(skriveFilter(nu, maalId));
  if (eksErr) {
    console.error("[skridt-tilfoej] company_actions-opslag fejlede:", eksErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  const dom = doemSkrivning(titelDom.titel, eksisterende ?? [], nu, { skriver: "medlem", maalId });
  if (!dom.ok) {
    // For «medlem» giver dommen aldrig forslag_venter (som rådgiveren, valg A)
    // — grenen står kun så typen er udtømt.
    return jsonResponse(
      dom.grund === "gentagelse"
        ? dom.aarsag === "afvist_i_maalet"
          ? { error: "Du har afvist et forslag med samme titel under dette mål — skriv skridtet anderledes", grund: "afvist_i_maalet", status: dom.status, created_at: dom.created_at }
          : { error: "Et skridt med samme titel findes allerede fra de seneste 30 dage — skriv det anderledes, eller brug det der er", grund: "gentagelse", status: dom.status, created_at: dom.created_at }
        : { error: "Skridtet blev holdt tilbage", grund: dom.grund },
      409,
    );
  }

  // ── 7. Insert — aktivt fra start, medlemmets eget ──
  const { data: opgave, error: opgaveErr } = await adminClient
    .from("company_actions")
    .insert({
      company_id: companyId,
      user_id: callerId,
      title: titelDom.titel,
      context: null,
      source_type: "manual",
      status: "active",
      priority: "medium",
      proposed_by: callerId,
      accepted_at: nu.toISOString(),
      due_date: fristDom.dato,
      maal_id: maalId,
    })
    .select("id")
    .single();
  if (opgaveErr) {
    console.error("[skridt-tilfoej] skrivning fejlede:", opgaveErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }

  return jsonResponse({ ok: true, actionId: opgave.id });
});
