// Opgave-modellens skrivevej: ACCEPT (B1/B3/B6). Medlemmet siger ja til
// et forslag og vælger selv datoen. Bucket A-form fra notify-community-svar.
//
// Rækkefølgen i kroppen:
//   1. CORS-preflight.
//   2. authenticateUser(req) — kalderens identitet.
//   3. Validér input: opgaveId + dato ("YYYY-MM-DD"), ellers 400.
//   4. Slå opgaven op med KALDERENS klient (RLS-gated: company-medlemskab).
//      Findes den ikke/ingen adgang: 404.
//   5. Ejerskabs-tjek: RLS'ens SELECT er company-scoped, men B1/§7 gør
//      user_id til ejeren — kun ejeren må forpligte sig. Ellers 403.
//   6. Motoren dømmer (opgaveEngine.accepter). Afvisning -> 409 med
//      motorens grund som forståelig besked. Reglerne gentages IKKE her.
//   7. FØRST derefter adminClient (service role) — skriver præcis de
//      felter motoren ændrede, med optimistisk lås på status så et
//      dobbeltklik eller en cron-race ikke overskriver en mellemkommen
//      overgang.
//   6b. MÅLET (Jonas 1/10-2026: «Det er heller ikke smart, at et skridt kan
//      have en deadline længere ude i fremtiden end selve målet.»): har
//      skridtet et maal_id, slås målet op (service role, efter ejerskabs-
//      tjekket) hos SAMME virksomhed. Et mål, der ikke er aktivt (parkeret/
//      nået), får ingen nye aktive skridt → 409 med samme tekst som
//      skridt-tilfoej. Den valgte dato dømmes med doemFristModMaal — samme
//      dom og samme svarkoder som skridt-tilfoej: 400 «efter_maalets_frist»
//      og «maalets_frist_passeret» (medlemmets valg), 500
//      «maalets_frist_ulaeselig» (vores data). `grund` i svaret er koden —
//      kun den nye kode svarer med den (beviset for udrulningen).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { accepter } from "../_shared/opgaveEngine.ts";
import { doemFristModMaal } from "../_shared/skridtForslag.ts";
import { OPGAVE_KOLONNER, radTilOpgave, tilDbDato, parseDatoInput } from "../_shared/opgaveRad.ts";

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

  const { opgaveId, dato } = (body ?? {}) as { opgaveId?: unknown; dato?: unknown };
  if (typeof opgaveId !== "string" || opgaveId.trim() === "") {
    return jsonResponse({ error: "Ugyldig opgaveId" }, 400);
  }
  const dueDate = parseDatoInput(dato);
  if (!dueDate) {
    return jsonResponse({ error: "Ugyldig dato — forventer YYYY-MM-DD" }, 400);
  }

  // ── 4. Opgaven, med KALDERENS klient (RLS gater company-medlemskab) ──
  const { data: rad, error: radErr } = await callerClient
    .from("company_actions")
    .select(`${OPGAVE_KOLONNER}, maal_id`)
    .eq("id", opgaveId)
    .maybeSingle();

  if (radErr) {
    console.error("[opgave-accepter] opslag fejlede:", radErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!rad) {
    return jsonResponse({ error: "Opgaven findes ikke, eller du har ikke adgang til den" }, 404);
  }

  // ── 5. Ejerskab: user_id er medlemmet der ejer opgaven (design §7) ──
  if ((rad as Record<string, unknown>).user_id !== callerId) {
    return jsonResponse({ error: "Kun opgavens ejer kan acceptere den (B1)" }, 403);
  }

  // ── 6. Motoren dømmer — den ene sandhed for overgange ──
  const opgave = radTilOpgave(rad as Record<string, unknown>);
  const nu = new Date();
  const resultat = accepter(opgave, dueDate, nu);
  if (!resultat.ok) {
    return jsonResponse({ error: resultat.grund }, 409);
  }

  // ── 7. Service-role — adminClient konstrueres FØRST nu ──
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 6b. Målet: aktivt, og fristen højst målets (Jonas 1/10-2026) ──
  const maalId = (rad as Record<string, unknown>).maal_id;
  if (typeof maalId === "string" && maalId !== "") {
    const { data: maal, error: maalErr } = await adminClient
      .from("milestones")
      .select("id, status, deadline")
      .eq("id", maalId)
      .eq("company_id", opgave.company_id)
      .maybeSingle();
    if (maalErr) {
      console.error("[opgave-accepter] mål-opslag fejlede:", maalErr);
      return jsonResponse({ error: "Intern fejl" }, 500);
    }
    if (!maal) {
      // FK'en (ON DELETE SET NULL) gør dette til en race med en sletning —
      // fail-closed: intet aktivt skridt under et mål, vi ikke kan se.
      console.error("[opgave-accepter] skridtets mål findes ikke:", maalId);
      return jsonResponse({ error: "Målet findes ikke hos denne virksomhed — genindlæs og prøv igen" }, 409);
    }
    if ((maal as { status: string }).status !== "active") {
      return jsonResponse({ error: "Målet er ikke aktivt — et skridt kan kun høre til et aktivt mål", grund: "maalet_ikke_aktivt" }, 409);
    }
    // dato er allerede valideret «YYYY-MM-DD» af parseDatoInput.
    const modMaal = doemFristModMaal(dato as string, (maal as { deadline: string | null }).deadline, nu);
    if (!modMaal.ok) {
      if (modMaal.kode === "maalets_frist_ulaeselig") {
        console.error("[opgave-accepter] målets frist kan ikke læses:", maalId);
        return jsonResponse({ error: modMaal.grund, grund: modMaal.kode }, 500);
      }
      return jsonResponse({ error: modMaal.grund, grund: modMaal.kode }, 400);
    }
  }

  // ── 8. Skrivningen ──

  const { data: opdateret, error: updErr } = await adminClient
    .from("company_actions")
    .update({
      status: resultat.opgave.status,
      accepted_at: resultat.opgave.accepted_at!.toISOString(),
      due_date: tilDbDato(resultat.opgave.due_date!),
    })
    .eq("id", opgaveId)
    .eq("status", opgave.status) // optimistisk lås: kun hvis rækken stadig er i den tilstand motoren dømte ud fra
    .select(OPGAVE_KOLONNER)
    .maybeSingle();

  if (updErr) {
    console.error("[opgave-accepter] skrivning fejlede:", updErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!opdateret) {
    return jsonResponse({ error: "Opgaven blev ændret i mellemtiden — genindlæs og prøv igen" }, 409);
  }

  return jsonResponse({ ok: true, opgave: opdateret });
});
