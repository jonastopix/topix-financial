// saet-indgangs-prisniveau — rådgiveren sætter prisniveauet, og dag 0-mailen
// udløses i samme kald. Bucket A: authenticateUser + advisor-gate bag
// verify_jwt = true (supabase/config.toml). Body: { company_id, prisniveau_oere }.
//
// Dette er UDLØSER 2 fra docs/indgangen-design.md §19: «prisniveauet
// sættes MANUELT på en virksomhed der mangler det — mailen sendes i det
// øjeblik prisen gemmes». Den var beskrevet og ikke bygget; reconen 2/9
// fandt at rådgivermailens løfte («så sendes betalingsmailen automatisk»)
// kun kunne indfries med SQL.
//
// HVORFOR ÉN FUNKTION OG IKKE TO SKRIDT. Målt 2/9: company_betalingslink
// har samme politik-form som company_fornyelse, så en advisor-JWT KAN
// skrive prisen direkte fra fladen. Men send-indgangs-betalingsmail er
// Bucket B (authenticateServiceRole) og kan ikke kaldes fra browseren —
// et rådgiver-JWT får 403. Skrev fladen prisen selv, ville der findes en
// tilstand hvor prisen er sat og mailen aldrig gik. Derfor ét kald: pris
// og mail sammen. Logikken for mailen er den samme som Monday-grenen
// bruger: udloesIndgangsBetalingsmail i _shared/indgangsBetalingsmail.ts,
// som selv afgør om det bliver betalingsmailen (pris sat) eller
// rådgivermailen (pris mangler) — her er prisen lige sat, så det bliver
// dag 0.
//
// FORM: import-application — authenticateUser FØRST, derefter has_role mod
// callerClient (fladen er AdvisorRoute-guarded, men et gyldigt JWT kan
// ramme funktionen direkte), og først derefter service-role-klienten.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { INDGANGS_PRISPUNKTER_OERE } from "../_shared/indgangspris.ts";
import { udloesIndgangsBetalingsmail } from "../_shared/indgangsBetalingsmail.ts";

const LOG = "[saet-indgangs-prisniveau]";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 1. Auth (Bucket A) FØR alt andet, derefter advisor-gaten ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  const { data: callerIsAdvisor, error: callerRoleError } = await callerClient.rpc("has_role", {
    _user_id: callerId,
    _role: "advisor",
  });
  if (callerRoleError || !callerIsAdvisor) {
    console.warn(`${LOG} caller not advisor`, { callerId });
    return jsonResponse({ error: "Forbidden — advisor role required" }, 403);
  }

  try {
    // ── 2. Input: company_id som uuid, prisniveau_oere som ét af kataloget ──
    const body = await req.json().catch(() => null);
    const companyId = typeof body?.company_id === "string" ? body.company_id.trim() : "";
    if (!UUID_RE.test(companyId)) {
      return jsonResponse({ error: "Manglende eller ugyldigt company_id" }, 400);
    }

    const prisniveauOere = Number(body?.prisniveau_oere);
    const kendte = INDGANGS_PRISPUNKTER_OERE as readonly number[];
    if (!Number.isInteger(prisniveauOere) || !kendte.includes(prisniveauOere)) {
      // Aldrig nærmeste-match: kataloget i Stripe har præcis seks priser
      // (nyt_<kr>_<model> for de to niveauer). Et beløb udenfor har ingen
      // pris at sende nogen hen til, og betalingssiden ville vise
      // «Der gik noget galt» for evigt.
      return jsonResponse(
        {
          error: "ukendt_prisniveau",
          detalje:
            `prisniveau_oere ${String(body?.prisniveau_oere)} findes ikke i kataloget. ` +
            `Kendte: ${kendte.map((p) => `${p} (${p / 100} kr.)`).join(", ")}.`,
          kendte_prisniveauer_oere: [...kendte],
        },
        400,
      );
    }

    // ── 3. Service-role-klient og linkrækken ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: link, error: linkErr } = await adminClient
      .from("company_betalingslink")
      .select("company_id, prisniveau_oere, betalingsmail_sendt_at")
      .eq("company_id", companyId)
      .maybeSingle();
    if (linkErr) {
      console.error(`${LOG} company_betalingslink-opslag fejlede for ${companyId}:`, linkErr);
      throw new Error("Kunne ikke læse company_betalingslink");
    }
    if (!link) {
      // Ingen række = virksomheden er ikke i indgangen (oprettet ad en
      // anden vej, eller Monday-grenen nåede aldrig linkrækken).
      return jsonResponse({ error: "ingen_betalingslink", company_id: companyId }, 404);
    }

    if (link.prisniveau_oere !== null) {
      // Prisen ÆNDRES IKKE her. Er dag 0-mailen sendt, har medlemmet fået
      // et beløb at forholde sig til, og linket i mailen læser prisen live
      // fra rækken (hent_betalingstilbud) — en ændring bagefter ville gøre
      // linket til en anden aftale end den de læste, uden at nogen mail
      // fortæller dem det. Og er mailen IKKE sendt, men prisen sat, er det
      // en tilstand der ikke skal overskrives i tavshed. Skal prisen rettes,
      // er det en samtale, ikke et klik.
      return jsonResponse(
        {
          error: "prisniveau_allerede_sat",
          company_id: companyId,
          prisniveau_oere: link.prisniveau_oere,
          betalingsmail_sendt_at: link.betalingsmail_sendt_at,
        },
        409,
      );
    }

    // ── 4. Skriv prisen med guard: kun hvis den stadig er null ──
    const nu = new Date().toISOString();
    const { data: skrevet, error: skrivErr } = await adminClient
      .from("company_betalingslink")
      .update({ prisniveau_oere: prisniveauOere, updated_at: nu })
      .eq("company_id", companyId)
      .is("prisniveau_oere", null)
      .select("company_id");
    if (skrivErr) {
      console.error(`${LOG} prisskrivning fejlede for ${companyId}:`, skrivErr);
      throw new Error("Kunne ikke skrive prisniveau");
    }
    if (!skrevet || skrevet.length === 0) {
      // Nul rækker uden fejl = nogen nåede det først mellem opslag og
      // skrivning. Ikke vores pris der gælder — svar som i trin 3.
      console.warn(`${LOG} prisniveau blev sat af en anden imens for ${companyId}`);
      return jsonResponse({ error: "prisniveau_allerede_sat", company_id: companyId }, 409);
    }

    // ── 5. Dag 0 — samme modul som Monday-grenen. Prisen er sat, så
    //       motoren lander i klar_til_mail (medmindre virksomheden er
    //       betalt eller mailen allerede er sendt — så svarer modulet
    //       skipped, og det er ikke en fejl). ──
    let dag0: { status: number; body: Record<string, unknown> };
    try {
      dag0 = await udloesIndgangsBetalingsmail(companyId, adminClient);
    } catch (mailErr) {
      dag0 = { status: 500, body: { error: mailErr instanceof Error ? mailErr.message : String(mailErr) } };
    }

    if (dag0.status !== 200) {
      // Prisen ER skrevet og rulles IKKE tilbage. Den er rigtig, og
      // medlemmet skal have den. At fjerne prisen igen ville sætte
      // virksomheden tilbage i «afventer_pris», og næste kald til
      // udloesIndgangsBetalingsmail (fx et gentaget «Godkendt» fra Monday)
      // ville sende en NY rådgivermail om at prisen mangler — en løkke
      // frem for en fejl der kan ses. Med prisen stående er tilstanden
      // klar_til_mail: synlig, og mailen kan udløses igen via
      // send-indgangs-betalingsmail uden at prisen skal sættes igen.
      console.error(
        `${LOG} PRIS GEMT, MAIL FEJLEDE for company ${companyId}: prisniveau_oere=${prisniveauOere}, dag0 status ${dag0.status}:`,
        JSON.stringify(dag0.body),
      );
      return jsonResponse({
        ok: true,
        company_id: companyId,
        prisniveau_oere: prisniveauOere,
        mail_fejlede: true,
        mail: dag0.body,
      });
    }

    // ── 6. Succes ──
    const mailGik = dag0.body.sent === true;
    console.log(
      `${LOG} company ${companyId}: prisniveau_oere=${prisniveauOere} sat af ${callerId}; dag 0 ${mailGik ? `sendt til ${String(dag0.body.til ?? "?")}` : `ikke sendt (${String(dag0.body.status ?? dag0.body.reason ?? "skipped")})`}`,
    );
    return jsonResponse({
      ok: true,
      company_id: companyId,
      prisniveau_oere: prisniveauOere,
      mail: mailGik ? "dag0" : "skipped",
      ...(mailGik ? {} : { mail_svar: dag0.body }),
    });
  } catch (err) {
    console.error(`${LOG} Error:`, err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
