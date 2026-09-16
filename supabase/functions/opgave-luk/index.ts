// Opgave-modellens skrivevej: LUK (B2/B7). Fire klient-udfald: done,
// not_done, dropped (fra active) og dismissed (fra proposed) — "drop den"
// er et lige så pænt svar som "gjort" (B7). 'expired' er BEVIDST ikke et
// klientvalg: det er tavshedens udfald og hører til udløbs-cron'en (B8).
// Bucket A-form fra notify-community-svar — samme rækkefølge som
// opgave-accepter:
//   1. CORS  2. authenticateUser  3. validér input  4. opslag med
//   kalderens klient (RLS)  5. ejerskabs-tjek (user_id = caller)
//   6. motoren dømmer — reglerne gentages IKKE her  7. først derefter
//   service-role write med optimistisk lås på status.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { luk, type SlutUdfald } from "../_shared/opgaveEngine.ts";
import { OPGAVE_KOLONNER, radTilOpgave } from "../_shared/opgaveRad.ts";
// Fase 1 («Én plan», 16/9): når et skridt under et mål lukkes, rykker
// målets fremdrift — regnet af motoren, aldrig her.
import { maalFremdrift, TAELLENDE_SKRIDT } from "../_shared/maal.ts";

const KLIENT_UDFALD = ["done", "not_done", "dropped", "dismissed"] as const;

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

  const { opgaveId, udfald } = (body ?? {}) as { opgaveId?: unknown; udfald?: unknown };
  if (typeof opgaveId !== "string" || opgaveId.trim() === "") {
    return jsonResponse({ error: "Ugyldig opgaveId" }, 400);
  }
  if (typeof udfald !== "string" || !(KLIENT_UDFALD as readonly string[]).includes(udfald)) {
    return jsonResponse(
      { error: "Ugyldigt udfald — forventer done, not_done, dropped eller dismissed" },
      400,
    );
  }

  // ── 4. Opgaven, med KALDERENS klient (RLS gater company-medlemskab) ──
  // maal_id (fase 1) læses MED, uden om motorens Opgave-form: motoren
  // dømmer overgangen, målet er det der sker bagefter.
  const { data: rad, error: radErr } = await callerClient
    .from("company_actions")
    .select(`${OPGAVE_KOLONNER}, maal_id`)
    .eq("id", opgaveId)
    .maybeSingle();

  if (radErr) {
    console.error("[opgave-luk] opslag fejlede:", radErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!rad) {
    return jsonResponse({ error: "Opgaven findes ikke, eller du har ikke adgang til den" }, 404);
  }

  // ── 5. Ejerskab: user_id er medlemmet der ejer opgaven (design §7) ──
  if ((rad as Record<string, unknown>).user_id !== callerId) {
    return jsonResponse({ error: "Kun opgavens ejer kan lukke den (B1)" }, 403);
  }

  // ── 6. Motoren dømmer — den ene sandhed for overgange (dismissed kun
  //       fra proposed, done/not_done/dropped kun fra active) ──
  const opgave = radTilOpgave(rad as Record<string, unknown>);
  const resultat = luk(opgave, udfald as SlutUdfald, new Date());
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
      status: resultat.opgave.status,
      closed_at: resultat.opgave.closed_at!.toISOString(),
    })
    .eq("id", opgaveId)
    .eq("status", opgave.status) // optimistisk lås: kun hvis rækken stadig er i den tilstand motoren dømte ud fra
    .select(OPGAVE_KOLONNER)
    .maybeSingle();

  if (updErr) {
    console.error("[opgave-luk] skrivning fejlede:", updErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!opdateret) {
    return jsonResponse({ error: "Opgaven blev ændret i mellemtiden — genindlæs og prøv igen" }, 409);
  }

  // ── 8. Målets fremdrift (fase 1) — EFTER lukningen, og aldrig i vejen for
  //       den: skridtet ER lukket; fejler dette led, siges det i svaret og
  //       loggen, ikke med en 500. progress_updated_at sættes af triggeren
  //       milestone_progress_updated_at (20260407172908) når progress ændres.
  const maalId = (rad as Record<string, unknown>).maal_id;
  const maal = typeof maalId === "string" && maalId ? await rykMaalFremdrift(adminClient, maalId) : null;

  return jsonResponse({ ok: true, opgave: opdateret, maal });
});

type MaalFremdriftResultat =
  | { id: string; ok: true; progress: number; aendret: boolean }
  | { id: string; ok: false; aarsag: string };

/** Læser alle skridt under målet og målets nuværende fremdrift, lader
    motoren regne, og skriver KUN hvis tallet er et andet. Status røres ikke
    («nået» er et menneskes valg, fase 2). Kaster aldrig. */
async function rykMaalFremdrift(
  adminClient: SupabaseClient,
  maalId: string,
): Promise<MaalFremdriftResultat> {
  const praefiks = `[opgave-luk] fremdrift på mål ${maalId}`;
  try {
    const { data: skridt, error: skridtErr } = await adminClient
      .from("company_actions")
      .select("status")
      .eq("maal_id", maalId)
      .in("status", [...TAELLENDE_SKRIDT]);
    if (skridtErr) throw new Error(`skridt-opslag fejlede: ${skridtErr.message}`);

    const { data: raekke, error: maalErr } = await adminClient
      .from("milestones")
      .select("id, progress")
      .eq("id", maalId)
      .maybeSingle();
    if (maalErr) throw new Error(`mål-opslag fejlede: ${maalErr.message}`);
    if (!raekke) throw new Error("målet findes ikke (slettet — skridtets maal_id er sat til NULL af FK'en)");

    const nuvaerende = (raekke as { progress: number | null }).progress;
    const ny = maalFremdrift((skridt ?? []) as { status: string }[], nuvaerende);
    if (ny === (nuvaerende ?? 0)) {
      return { id: maalId, ok: true, progress: ny, aendret: false };
    }
    const { error: updErr } = await adminClient
      .from("milestones")
      .update({ progress: ny })
      .eq("id", maalId);
    if (updErr) throw new Error(`mål-skrivning fejlede: ${updErr.message}`);
    console.log(`${praefiks}: ${nuvaerende ?? 0} → ${ny} (${(skridt ?? []).length} tællende skridt)`);
    return { id: maalId, ok: true, progress: ny, aendret: true };
  } catch (err) {
    const aarsag = err instanceof Error ? err.message : String(err);
    console.error(`${praefiks}: rykkede ikke — ${aarsag}. Skridtet er lukket; fremdriften regnes igen ved næste lukning.`);
    return { id: maalId, ok: false, aarsag };
  }
}
