// ansoegning-handling — rådgiverens handlinger på en ansøgning (18/9-2026).
// Bucket A: authenticateUser FØRST, så advisor-gaten (has_role via
// callerClient), FØR service-role-klienten konstrueres — samme form som
// saet-indgangs-prisniveau.
//
// Body: { ansoegning_id, handling, begrundelse?, lukkeaarsag?, aftale_url?, pris_oere? }
//   handling ∈ MENNESKE_HANDLINGER: tal_med_dem · afvis · afholdt · tilbud ·
//   afslag · underskrevet · luk (kræver lukkeaarsag) · genaabn ·
//   saet_pause (kræver pause_til «YYYY-MM-DD» efter i dag — sætter ELLER
//   flytter pausen; tilladt fra ethvert åbent trin).
//   afvis/afslag tager valgfrit afslagsgrund ∈ niche · for_tidligt · andet
//   (niche og for_tidligt planlægger afslagsmailen; andet giver ingen mail).
//   Ventelisten sættes IKKE her — fladen kalder C's venteliste-handling
//   «saet» lige efter (kræver trin = lukket), og afslagsmailen (dag 0 i køen)
//   læser pladsen når den sendes.
//   tilbud kræver aftale_url (C's /aftale?token=… eller en PDF) og sætter
//   pris_oere hvis den gives (bliver prisniveau_oere ved underskrift).
// Dommen (afgoerOvergang), trappen (rykkerkoe) og konverteringen
// (underskrevet → virksomheden med samme id → det eksisterende
// betalingsforløb) ligger i _shared/ansoegningMotor.ts. Denne fil er kun
// auth, validering og svar. Svar: 200 { ok, fra, til, planlagt, annulleret,
// company_id? } · 400 ugyldigt · 401/403 auth · 404 ukendt · 409 ikke
// tilladt fra trinnet (dommens grund ordret) · 500.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { AFSLAGSGRUNDE, LUKKEAARSAGER, MENNESKE_HANDLINGER, type Afslagsgrund, type Handling, type Lukkeaarsag } from "../_shared/ansoegningTrin.ts";
import { hentAnsoegning, udfoerOvergang } from "../_shared/ansoegningMotor.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Body → Handling; null ved ugyldig form. Kun menneskets handlinger — systemets kan ikke kaldes herfra. */
export function laesHandling(body: Record<string, unknown>): Handling | null {
  const art = typeof body.handling === "string" ? body.handling : "";
  if (!MENNESKE_HANDLINGER.includes(art as Handling["art"])) return null;
  if (art === "luk") {
    const aarsag = typeof body.lukkeaarsag === "string" ? body.lukkeaarsag : "";
    if (!(LUKKEAARSAGER as readonly string[]).includes(aarsag)) return null;
    return { art: "luk", aarsag: aarsag as Lukkeaarsag };
  }
  if (art === "afvis" || art === "afslag") {
    const grund = typeof body.afslagsgrund === "string" ? body.afslagsgrund : null;
    if (grund !== null && !(AFSLAGSGRUNDE as readonly string[]).includes(grund)) return null;
    return { art, ...(grund ? { grund: grund as Afslagsgrund } : {}) } as Handling;
  }
  if (art === "saet_pause") {
    const til = typeof body.pause_til === "string" ? body.pause_til.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(til) || Number.isNaN(Date.parse(`${til}T00:00:00Z`))) return null;
    // Efter i dag (dansk dato): en pause der slutter i dag eller før er ingen pause.
    const iDag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
    if (til <= iDag) return null;
    return { art: "saet_pause", til };
  }
  return { art } as Handling;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Kun POST" }, 405);

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId: userId, callerClient } = auth;

  const { data: erRaadgiver, error: rolleErr } = await callerClient.rpc("has_role", { _user_id: userId, _role: "advisor" });
  if (rolleErr || erRaadgiver !== true) return json({ error: "Kun rådgivere" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON" }, 400);
  }
  const ansoegningId = typeof body.ansoegning_id === "string" ? body.ansoegning_id : "";
  if (!UUID.test(ansoegningId)) return json({ error: "ansoegning_id mangler eller er ugyldigt" }, 400);
  const handling = laesHandling(body);
  if (!handling) return json({ error: "Ukendt handling (lukkeaarsag mangler ved luk, eller pause_til mangler/er ikke efter i dag ved saet_pause)" }, 400);
  const begrundelse = typeof body.begrundelse === "string" ? body.begrundelse.trim().slice(0, 2000) || null : null;
  const aftaleUrl = typeof body.aftale_url === "string" && /^https:\/\//.test(body.aftale_url.trim()) ? body.aftale_url.trim() : null;
  const prisOere = typeof body.pris_oere === "number" && Number.isInteger(body.pris_oere) && body.pris_oere > 0 ? body.pris_oere : null;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ansoegning = await hentAnsoegning(admin, ansoegningId);
  if (!ansoegning) return json({ error: "Ansøgningen findes ikke" }, 404);

  // Prisen sættes FØR overgangen (et almindeligt felt — rådgiveren må også sætte den fra fladen).
  if (prisOere !== null && handling.art === "tilbud") {
    const { error } = await admin.from("ansoegninger").update({ pris_oere: prisOere }).eq("id", ansoegningId);
    if (error) return json({ error: `Kunne ikke sætte prisen: ${error.message}` }, 500);
    ansoegning.pris_oere = prisOere;
  }

  const nu = new Date();
  const res = await udfoerOvergang(admin, { ansoegning, handling, via: "raadgiver", truffetAf: userId, begrundelse, nu, aftaleUrl });
  if (res.ok === false) return json({ error: res.grund }, res.status);

  console.log(`[ansoegning-handling] ${handling.art} på ${ansoegningId} af ${userId}: ${res.fra} → ${res.til} (${res.planlagt} planlagt, ${res.annulleret} annulleret)`);
  return json({
    ok: true,
    fra: res.fra,
    til: res.til,
    planlagt: res.planlagt,
    annulleret: res.annulleret,
    ...(res.konvertering && res.konvertering.ok ? { company_id: res.konvertering.company_id, genbrugt: res.konvertering.genbrugt, mail: res.konvertering.mail } : {}),
  });
});
