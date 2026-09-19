// venteliste-handling — rådgiverens tre handlinger på ventelisten (UDKAST
// 18/9-2026). Bucket A: authenticateUser → has_role advisor FØR service role
// — samme form som ansoegning-handling. Body:
//   { handling: "saet",   ansoegning_id, company_id, hvorfor? }  afvist ansøgning → køen for en konkret virksomhed
//   { handling: "fjern",  venteplads_id }                        ud af køen (kun «venter»)
//   { handling: "tilbyd", company_id }                           MENNESKET TRYKKER: første i køen får tilbuddet og 7 dage
//
// «tilbyd» er det eneste sted et menneske starter køen. Derefter kører den
// selv (ansoegning-rykker-cron: dag 3 rykker, dag 7 udløb → næste;
// ansoegning-link: ja/nej). Ingen mail går af sig selv før dette tryk.
//
// «saet» kræver at ansøgningen er LUKKET (trin 'lukket') — ventelisten er et
// nej på nichen, ikke en parkering af en levende ansøgning (dertil er «ikke
// nu»/pausen). Virksomheden skal findes; pladsen er ledig når fornyelses-
// dommen siger det (forsiden), ikke når rækken sættes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { hentAnsoegning } from "../_shared/ansoegningMotor.ts";
import { fjernFraVenteliste, saetPaaVenteliste, tilbydPladsen } from "../_shared/venteliste.ts";

const LOG = "[venteliste-handling]";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Kun POST" }, 405);

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;
  const { data: erAdvisor, error: rolleFejl } = await callerClient.rpc("has_role", { _user_id: callerId, _role: "advisor" });
  if (rolleFejl || !erAdvisor) return json({ error: "Forbidden — advisor role required" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON" }, 400);
  }
  const handling = body.handling;
  if (handling !== "saet" && handling !== "fjern" && handling !== "tilbyd") return json({ error: "Ukendt handling" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nu = new Date();

  try {
    if (handling === "saet") {
      const ansoegningId = typeof body.ansoegning_id === "string" ? body.ansoegning_id.trim() : "";
      const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
      const hvorfor = typeof body.hvorfor === "string" ? body.hvorfor.trim().slice(0, 500) || null : null;
      // «Tidligst»-dato (18/9): dansk dato «YYYY-MM-DD», valgfri — pladsen må først tilbydes den dag.
      const tidligstRaa = typeof body.tidligst_tilbud_at === "string" ? body.tidligst_tilbud_at.trim() : "";
      if (tidligstRaa && !/^\d{4}-\d{2}-\d{2}$/.test(tidligstRaa)) return json({ error: "tidligst_tilbud_at skal være «YYYY-MM-DD»" }, 400);
      const tidligstTilbudAt = tidligstRaa || null;
      if (!UUID_RE.test(ansoegningId) || !UUID_RE.test(companyId)) return json({ error: "ansoegning_id og company_id skal være uuid" }, 400);
      const a = await hentAnsoegning(admin, ansoegningId);
      if (!a) return json({ error: "Ukendt ansøgning" }, 404);
      if (a.trin !== "lukket") return json({ error: "ansoegning_ikke_lukket", trin: a.trin }, 409);
      const { data: c } = await admin.from("companies").select("id, name").eq("id", companyId).maybeSingle();
      if (!c) return json({ error: "Ukendt virksomhed" }, 404);
      const r = await saetPaaVenteliste(admin, { ansoegningId, companyId, hvorfor, satAf: callerId, tidligstTilbudAt });
      console.log(`${LOG} saet: ansøgning ${ansoegningId} → kø for ${companyId} (${c.name}) af ${callerId}: ${r.udfald}`);
      return json({ ok: true, ...r, virksomhed: c.name }, r.udfald === "staar_allerede" ? 409 : 200);
    }
    if (handling === "fjern") {
      const id = typeof body.venteplads_id === "string" ? body.venteplads_id.trim() : "";
      if (!UUID_RE.test(id)) return json({ error: "venteplads_id skal være uuid" }, 400);
      const fjernet = await fjernFraVenteliste(admin, id, nu);
      console.log(`${LOG} fjern: ${id} af ${callerId}: ${fjernet ? "trukket" : "ingen ventende række"}`);
      return json({ ok: true, fjernet }, fjernet ? 200 : 409);
    }
    // tilbyd
    const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
    if (!UUID_RE.test(companyId)) return json({ error: "company_id skal være uuid" }, 400);
    const r = await tilbydPladsen(admin, companyId, nu, 1);
    console.log(`${LOG} tilbyd: ${companyId} af ${callerId}: ${r.udfald}`);
    return json({ ok: r.udfald === "tilbudt", ...r }, r.udfald === "tilbudt" ? 200 : 409);
  } catch (e) {
    console.error(`${LOG} fejl:`, e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
