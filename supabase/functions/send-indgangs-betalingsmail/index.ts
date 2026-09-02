// Dag 0 — indgangens betalingsmail, HTTP-indgangen. Bucket B:
// authenticateServiceRole bag verify_jwt = true (supabase/config.toml).
// Body: { company_id }.
//
// Logikken ligger i _shared/indgangsBetalingsmail.ts og deles med
// monday-webhook, som kalder den i samme proces ved «Godkendt» — et
// HTTP-kald hertil kan ikke bære edge-runtimens sb_secret-nøgle gennem
// verify_jwt-gaten (se filhovedet dér). Denne indgang er til
// prissætningen (§19, udløser 2) og til manuelle kald med service-role-
// JWT'en (fx fra SQL editoren via vault-nøglen).
//
// Svaret er det delte modul's status + body, uændret: { skipped, status }
// ved intet at gøre, { sent, mail, ... } ved succes, 4xx/5xx ved fejl.
// Stemplet betalingsmail_sendt_at sættes KUN når enqueue lykkedes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { udloesIndgangsBetalingsmail } from "../_shared/indgangsBetalingsmail.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  try {
    const body = await req.json().catch(() => null);
    const companyId = typeof body?.company_id === "string" ? body.company_id.trim() : "";
    if (!UUID_RE.test(companyId)) {
      return jsonResponse({ error: "Manglende eller ugyldigt company_id" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const resultat = await udloesIndgangsBetalingsmail(companyId, adminClient);
    return jsonResponse(resultat.body, resultat.status);
  } catch (err) {
    console.error("[send-indgangs-betalingsmail] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
