// CVR-opslaget i ansøgningsformularen: nummeret tastes, og navn,
// stiftelsesår, branche, selskabsform og ansatte vises tilbage — «Nordic
// Byg ApS, stiftet 2019, 10–19 ansatte. Rigtigt?».
//
// KALDEREN HAR INGEN SESSION. Tokenet er legitimationen (verifyAnsoegnings-
// token, FØR alt andet) — så kun én med en åben ansøgning kan bruge vores
// CVR-kvote. verify_jwt = false som ansoegning-gem.
//
// KILDEN er husets eksisterende: DataCVR gennem hentDataCvrRaa
// (_shared/virksomhedsOprettelse.ts — nøgle, timeout og User-Agent ét
// sted, kildeværn cvrKilde.guard). Samme rå svar tolkes to gange:
// tolkDataCvrSvar (de syv felter virksomhedsrækken kender) og
// tolkCvrTilAnsoeger (de fire der vises). Personfelter (owners) læses
// aldrig og gemmes aldrig.
//
// KVOTEN: Start-planen (Jonas 18/9: 1.500 opslag/md., 99 kr./md.) — men
// den er stadig delt med berig-virksomheder og virksomhedsoprettelsen, og
// gratisplanens 25/dag gælder indtil nøglen er opgraderet. Derfor:
//   1. cvr_opslag_cache — ét opslag pr. CVR pr. CACHE_DAGE, uanset hvor
//      mange gange nummeret tastes. «findes ikke» caches én dag.
//   2. DAGSLOFT — flere end så mange rigtige opslag pr. dag herfra, og
//      svaret er «utilgængelig» uden at kalde. Formularen lader ansøgeren
//      fortsætte med nummeret som tastet; rådgiveren slår op bagefter.
//   3. Ansøgeren ser aldrig HVORFOR (kvote, nøgle, fejl) — kun logs gør.
//
// Svaret gemmes også på ansøgningen (cvr_opslag), så «gem» kan godkende
// bekræftelsen, og A's motor har opslaget uden at slå op igen.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { verifyAnsoegningstoken } from "../_shared/ansoegningToken.ts";
import { hentDataCvrRaa, udfaldAf } from "../_shared/virksomhedsOprettelse.ts";
import { tolkCvrTilAnsoeger } from "../_shared/cvrAnsoeger.ts";
import { type CvrVisning, cvrSaetning, normaliserCvr } from "../_shared/ansoegningSkema.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { cvrLoftBesked, type CvrLoftGrund } from "../_shared/cvrLoftBesked.ts";
import { kbhDato } from "../_shared/hverdage.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Et fundet CVR genbruges fra cachen i så mange dage. */
const CACHE_DAGE_FUNDET = 30;
/** «Findes ikke» genbruges én dag — en nystiftet virksomhed dukker op. */
const CACHE_DAGE_FINDES_IKKE = 1;
/**
 * Rigtige opslag pr. dag herfra (cache-misses). JONAS 18/9: den betalte
 * Start-plan (1.500/md.) — «fem om dagen holder ikke til et webinarhold».
 * 50 pr. dag er 1.500 pr. måned; loftet er et værn mod en bølge, ikke
 * kvoten. Sættes lavere med ANSOEGNING_CVR_DAGSLOFT så længe nøglen er på
 * gratisplanen (25/dag delt med berigelsen).
 */
/**
 * DAGSLOFTET, eksplicit (generalprøvens brist 6, 18/9). Regnestykket bag standarden:
 * DataCVR's betalte plan er 1.500 opslag pr. måned ≈ 50 pr. dag, og nøglen deles med
 * berig-virksomheder (MAKS_OPSLAG 20 pr. kørsel), import-application og monday-webhook.
 * 50 − 20 − 10 (reserve til import/Monday) = 20 til ansøgningerne. På GRATISPLANEN
 * (25 pr. dag) skal secret'en sættes til 5 — ellers æder ansøgningerne berigelsens kvote.
 * Secret'en ANSOEGNING_CVR_DAGSLOFT overstyrer altid (README: hvad Jonas bekræfter hos DataCVR).
 * Rammes loftet, får rådgiverne én klokke pr. dag (cvrLoftBesked) — ansøgeren fortsætter
 * med fallback-feltet.
 */
export const DAGSLOFT_STANDARD = 20;
const DAGSLOFT = Number(Deno.env.get("ANSOEGNING_CVR_DAGSLOFT") ?? String(DAGSLOFT_STANDARD));

/** Klokken til rådgiverne når loftet rammes — én pr. dag pr. grund (dedup på titlen). Kaster aldrig. */
async function meldLoftRamt(adminClient: SupabaseClient, grund: CvrLoftGrund): Promise<void> {
  try {
    const r = await skrivRaadgiverBesked(adminClient, cvrLoftBesked(grund, kbhDato(new Date()), DAGSLOFT));
    if (r.fejl.length > 0) console.error("[ansoegning-cvr] klokken om loftet fejlede:", r.fejl.join("; "));
  } catch (e) {
    console.error("[ansoegning-cvr] klokken om loftet kastede:", e);
  }
}

type Svar =
  | { udfald: "fundet"; visning: CvrVisning; saetning: string }
  | { udfald: "findes_ikke" }
  | { udfald: "utilgaengelig" };

interface CacheRaekke {
  cvr: string;
  udfald: "fundet" | "findes_ikke";
  visning: CvrVisning | null;
  slaaet_op_at: string;
}

async function fraCache(adminClient: SupabaseClient, cvr: string): Promise<CacheRaekke | null> {
  const { data, error } = await adminClient
    .from("cvr_opslag_cache")
    .select("cvr, udfald, visning, slaaet_op_at")
    .eq("cvr", cvr)
    .maybeSingle();
  if (error) {
    console.error("[ansoegning-cvr] cache-opslag fejlede:", error);
    return null;
  }
  if (!data) return null;
  const alderDage = (Date.now() - new Date(data.slaaet_op_at).getTime()) / 86_400_000;
  const graense = data.udfald === "fundet" ? CACHE_DAGE_FUNDET : CACHE_DAGE_FINDES_IKKE;
  return alderDage <= graense ? (data as CacheRaekke) : null;
}

async function opslagIDag(adminClient: SupabaseClient): Promise<number> {
  const dagStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const { count, error } = await adminClient
    .from("cvr_opslag_cache")
    .select("cvr", { count: "exact", head: true })
    .gte("slaaet_op_at", dagStart);
  if (error) {
    console.error("[ansoegning-cvr] dagstælling fejlede:", error);
    return Number.MAX_SAFE_INTEGER; // fail-closed: kan vi ikke tælle, slår vi ikke op
  }
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Kun POST" }, 405);

  try {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) return jsonResponse({ error: "Manglende token" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── Legitimation FØRST ─────────────────────────────────────────────
    const ansoegning = await verifyAnsoegningstoken(token, adminClient);
    if (!ansoegning) return jsonResponse({ error: "Ukendt eller lukket ansøgning" }, 404);

    const cvr = normaliserCvr(typeof body?.cvr === "string" ? body.cvr : "");
    if (!/^\d{8}$/.test(cvr)) return jsonResponse({ error: "Et CVR-nummer har otte cifre." }, 400);

    // ── Cache, ellers ét rigtigt opslag under dagsloftet ───────────────
    let raekke = await fraCache(adminClient, cvr);
    let svar: Svar;
    if (raekke) {
      svar = raekke.udfald === "fundet" && raekke.visning
        ? { udfald: "fundet", visning: raekke.visning, saetning: cvrSaetning(raekke.visning) }
        : { udfald: "findes_ikke" };
    } else if ((await opslagIDag(adminClient)) >= DAGSLOFT) {
      console.warn(`[ansoegning-cvr] dagsloftet (${DAGSLOFT}) er nået — CVR ${cvr} ikke slået op`);
      svar = { udfald: "utilgaengelig" };
      await meldLoftRamt(adminClient, "dagsloft");
    } else {
      const raa = await hentDataCvrRaa(cvr);
      const udfald = udfaldAf(raa);
      const visning = raa.slags === "svar" && udfald.udfald === "fundet" ? tolkCvrTilAnsoeger(raa.body) : null;

      if (udfald.udfald === "fundet" && visning) {
        raekke = { cvr, udfald: "fundet", visning, slaaet_op_at: new Date().toISOString() };
        svar = { udfald: "fundet", visning, saetning: cvrSaetning(visning) };
      } else if (udfald.udfald === "findes_ikke") {
        raekke = { cvr, udfald: "findes_ikke", visning: null, slaaet_op_at: new Date().toISOString() };
        svar = { udfald: "findes_ikke" };
      } else {
        const grund = udfald.udfald === "fejl" ? ` — ${udfald.grund}` : "";
        console.warn(`[ansoegning-cvr] CVR ${cvr}: ${udfald.udfald}${grund}`);
        svar = { udfald: "utilgaengelig" };
        // DataCVR selv siger stop (429) → rådgiverne skal vide det; fejl/nøgle mangler er en anden sag (logget).
        if (udfald.udfald === "graense") await meldLoftRamt(adminClient, "datacvr");
      }

      if (raekke) {
        // Cachen bærer KUN de syv + visningens felter — aldrig den rå body.
        const { error } = await adminClient
          .from("cvr_opslag_cache")
          .upsert({ ...raekke, svar: udfald.udfald === "fundet" ? udfald.svar : null }, { onConflict: "cvr" });
        if (error) console.error("[ansoegning-cvr] cache-skrivning fejlede:", error);
      }
    }

    // ── Opslaget på ansøgningen, så «gem» kan godkende bekræftelsen ────
    if (svar.udfald === "fundet") {
      const { error } = await adminClient
        .from("ansoegninger")
        .update({ cvr, cvr_opslag: { cvr, ...svar.visning }, cvr_bekraeftet: false })
        .eq("id", ansoegning.id);
      if (error) console.error("[ansoegning-cvr] kunne ikke gemme opslaget på ansøgningen:", error);
    }

    return jsonResponse(svar);
  } catch (err) {
    console.error("[ansoegning-cvr] uventet fejl:", err);
    return jsonResponse({ error: "Uventet fejl" }, 500);
  }
});
