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
import { hentDataCvrRaa } from "../_shared/virksomhedsOprettelse.ts";
import { cacheRaekkeAf, type CvrCacheRaekke, erFriskCache } from "../_shared/cvrCache.ts";
import { type CvrVisning, cvrSaetning, normaliserCvr } from "../_shared/ansoegningSkema.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { cvrLoftBesked, type CvrLoftGrund } from "../_shared/cvrLoftBesked.ts";
import { DAGSLOFT_STANDARD, doemLoft, LOFT_NOEGLE, LOFT_SECRET, vaelgLoft } from "../_shared/cvrLoft.ts";
import { kbhDato } from "../_shared/hverdage.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Rigtige opslag pr. dag herfra (cache-misses). JONAS 18/9: den betalte
 * Start-plan (1.500/md.) — «fem om dagen holder ikke til et webinarhold».
 * 50 pr. dag er 1.500 pr. måned; loftet er et værn mod en bølge, ikke
 * kvoten. Sættes lavere med ANSOEGNING_CVR_DAGSLOFT så længe nøglen er på
 * gratisplanen (25/dag delt med berigelsen).
 */
/**
 * DAGSLOFTET bor nu i _shared/cvrLoft.ts og læses PR. KALD (19/9, recon-boelgen-2 §3):
 * app_config['ansoegning_cvr_dagsloft'] → secret'en ANSOEGNING_CVR_DAGSLOFT →
 * DAGSLOFT_STANDARD. Jonas kan hæve det med én linje SQL uden en udrulning, og en
 * ubrugelig værdi (tastefejl) springes over med en log i stedet for at blive NaN og
 * slukke loftet lydløst — den gamle linje her var `Number(env ?? "20")`, og
 * `brugt >= NaN` er altid falsk.
 *
 * Standarden er uændret 20; regnestykket bag den står i cvrLoft.ts.
 */
export { DAGSLOFT_STANDARD };

/**
 * Dagens loft, læst af app_config med secret og standard som reserve. Kaster
 * aldrig: fejler opslaget, bruges secret/standard, så et databasenedbrud
 * ikke også lukker CVR-opslaget.
 */
async function hentLoft(adminClient: SupabaseClient): Promise<number> {
  let fraConfig: unknown = null;
  try {
    const { data, error } = await adminClient
      .from("app_config")
      .select("config_value")
      .eq("config_key", LOFT_NOEGLE)
      .maybeSingle();
    if (error) console.error("[ansoegning-cvr] app_config-opslag til dagsloftet fejlede:", error.message);
    else fraConfig = data?.config_value ?? null;
  } catch (e) {
    console.error("[ansoegning-cvr] app_config-opslag til dagsloftet kastede:", e);
  }
  const svar = vaelgLoft(fraConfig, Deno.env.get(LOFT_SECRET));
  for (const a of svar.afvist) {
    console.error(`[ansoegning-cvr] dagsloftet fra ${a.kilde} kunne ikke bruges («${a.vaerdi}»: ${a.grund}) — springer over`);
  }
  return svar.loft;
}

/** Klokken til rådgiverne — én pr. dag pr. grund (dedup på titlen). Kaster aldrig. */
async function meldLoft(adminClient: SupabaseClient, grund: CvrLoftGrund, loft: number, brugt = 0): Promise<void> {
  try {
    const r = await skrivRaadgiverBesked(adminClient, cvrLoftBesked(grund, kbhDato(new Date()), loft, brugt));
    if (r.fejl.length > 0) console.error("[ansoegning-cvr] klokken om loftet fejlede:", r.fejl.join("; "));
  } catch (e) {
    console.error("[ansoegning-cvr] klokken om loftet kastede:", e);
  }
}

type Svar =
  | { udfald: "fundet"; visning: CvrVisning; saetning: string }
  | { udfald: "findes_ikke" }
  | { udfald: "utilgaengelig" };

/** Rækken i cachen er den DELTE form (_shared/cvrCache.ts) — ikke en lokal kopi. */
type CacheRaekke = CvrCacheRaekke;

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
  // Friskheden bor i _shared/cvrCache.ts (22/9) — samme tal som rådgiverens
  // manuelle opslag læser, så de to aldrig kan blive uenige.
  return erFriskCache(data.udfald, data.slaaet_op_at) ? (data as CacheRaekke) : null;
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
    let loft = DAGSLOFT_STANDARD;
    let dom = doemLoft(0, loft);
    if (raekke) {
      svar = raekke.udfald === "fundet" && raekke.visning
        ? { udfald: "fundet", visning: raekke.visning, saetning: cvrSaetning(raekke.visning) }
        : { udfald: "findes_ikke" };
    } else if ((dom = doemLoft(await opslagIDag(adminClient), (loft = await hentLoft(adminClient)))).tilstand === "ramt") {
      console.warn(`[ansoegning-cvr] dagsloftet (${loft}) er nået — CVR ${cvr} ikke slået op`);
      svar = { udfald: "utilgaengelig" };
      await meldLoft(adminClient, "dagsloft", loft);
    } else {
      // ADVARSLEN FØR LOFTET (19/9): ved 80 % af dagens loft får rådgiverne én
      // klokke, mens der stadig er plads — en besked EFTER er en obduktion,
      // ikke en advarsel. Egen titel, så den ikke dedup'er mod stop-beskeden.
      if (dom.tilstand === "advarsel") await meldLoft(adminClient, "naermer_sig", loft, loft - dom.resterende);
      // ÉN rækkebygger for alle tre skrivere (19/9, _shared/cvrCache.ts): den rå
      // body læses ét sted, så en række skrevet af berigelsen eller af
      // aftaleudsendelsen har samme form som formularens — og ikke havner som
      // «fundet uden visning», hvilket ansøgeren ville se som «findes ikke».
      const bygget = cacheRaekkeAf(cvr, await hentDataCvrRaa(cvr));
      const udfald = bygget.udfald;
      const visning = bygget.raekke?.visning ?? null;

      if (udfald.udfald === "fundet" && visning) {
        raekke = bygget.raekke;
        svar = { udfald: "fundet", visning, saetning: cvrSaetning(visning) };
      } else if (udfald.udfald === "findes_ikke") {
        raekke = bygget.raekke;
        svar = { udfald: "findes_ikke" };
      } else {
        const grund = udfald.udfald === "fejl" ? ` — ${udfald.grund}` : "";
        console.warn(`[ansoegning-cvr] CVR ${cvr}: ${udfald.udfald}${grund}`);
        svar = { udfald: "utilgaengelig" };
        // DataCVR selv siger stop (429) → rådgiverne skal vide det; fejl/nøgle mangler er en anden sag (logget).
        if (udfald.udfald === "graense") await meldLoft(adminClient, "datacvr", loft);
      }

      if (raekke) {
        // Cachen bærer KUN de syv + visningens felter — aldrig den rå body.
        const { error } = await adminClient
          .from("cvr_opslag_cache")
          .upsert(raekke, { onConflict: "cvr" });
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
