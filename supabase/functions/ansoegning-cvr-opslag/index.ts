// ansoegning-cvr-opslag — rådgiverens manuelle CVR-opslag for ÉN ansøgning
// (Jonas 22/9-2026 kl. 15:10: «Man burde kunne køre et CVR-opslag manuelt, hvis
// systemet ikke har gjort det automatisk.»).
//
// HVORFOR EN NY FUNCTION OG IKKE ansoegning-cvr. Formularens opslag legitimerer
// sig med ansøgerens token, og `verifyAnsoegningstoken` slår op med
// `.is("indsendt_at", null)` (_shared/ansoegningToken.ts:53) — den virker altså
// KUN på en kladde. De tre fra Monday er indsendte, så ansoegning-cvr kan slet
// ikke nå dem. Det er ikke en indstilling, det er en betingelse i opslaget.
//
// BUCKET A: authenticateUser FØRST, så advisor-gaten (has_role via
// callerClient), FØR service-role-klienten konstrueres — ordret samme form som
// ansoegning-handling. verify_jwt = true i config.toml.
//
// KILDEN ER HUSETS, IKKE EN NY. Opslaget går gennem `hentDataCvrRaa`
// (_shared/virksomhedsOprettelse.ts — nøgle, timeout og User-Agent ét sted,
// låst af cvrKilde.guard), rækken bygges af `cacheRaekkeAf` og gemmes med
// `gemICache` (_shared/cvrCache.ts), og cachen læses med den DELTE friskhed
// (`erFriskCache`, samme tal som formularen). Dagsloftet er det samme
// (_shared/cvrLoft.ts) — en knap må ikke kunne tømme kvoten.
//
// TO REGLER, DER IKKE KAN SES I ET SVAR:
//   1. ET TOMT ELLER FEJLET SVAR SKRIVER ALDRIG. `maaSkrives` (den spejlede
//      dom) kræver «fundet» MED visning. Ellers ville en nedetid hos DataCVR
//      slette et navn, der stod rigtigt — rådgiveren ville se felterne blive
//      tomme af at trykke på knappen, der skulle fylde dem.
//   2. `cvr_bekraeftet` RØRES ALDRIG. Feltet betyder «ANSØGEREN har sagt ja til,
//      at det er den rigtige virksomhed» (ansoegning-gem:283-286: kun når
//      ansøgeren svarer ja, og opslagets CVR er det, der står). Formularens
//      opslag sætter det til false, fordi ansøgeren kan bekræfte igen på næste
//      skærm. Det kan hun ikke på en INDSENDT ansøgning — et false her ville
//      slette en sand erklæring, og et true ville opfinde en. Vi slår nummeret
//      op; vi taler ikke på ansøgerens vegne.
//
// SVARET er husets rolige linje (`opslagsBesked`), aldrig en stacktrace og
// aldrig et kvote- eller nøgleinternt ord, rådgiveren ikke kan handle på.
//
// BODY (STRIKS, bodyFelter.guard): ansoegning_id. Alt andet afvises med 400.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { hentDataCvrRaa } from "../_shared/virksomhedsOprettelse.ts";
import { cacheRaekkeAf, erFriskCache, gemICache, type CvrCacheRaekke } from "../_shared/cvrCache.ts";
import { doemLoft, LOFT_NOEGLE, LOFT_SECRET, vaelgLoft } from "../_shared/cvrLoft.ts";
import { type CvrVisning, normaliserCvr } from "../_shared/ansoegningSkema.ts";
import { kanSlaaOp, type ManueltUdfald, maaSkrives, opslagsBesked } from "../_shared/cvrManueltOpslag.ts";

const LOG = "[ansoegning-cvr-opslag]";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["ansoegning_id"] as const;

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Dagens loft, læst som formularen gør det: app_config → secret → standard. Kaster aldrig. */
async function hentLoft(admin: SupabaseClient): Promise<number> {
  let fraConfig: unknown = null;
  try {
    const { data } = await admin.from("app_config").select("config_value").eq("config_key", LOFT_NOEGLE).maybeSingle();
    fraConfig = (data as { config_value?: unknown } | null)?.config_value ?? null;
  } catch (e) {
    console.error(`${LOG} kunne ikke læse loftet af app_config:`, e);
  }
  const svar = vaelgLoft(fraConfig, Deno.env.get(LOFT_SECRET));
  for (const a of svar.afvist) console.warn(`${LOG} loftet fra ${a.kilde} («${a.vaerdi}») sprunget over: ${a.grund}`);
  return svar.loft;
}

/** Rigtige opslag i dag = rækker i cachen fra i dag. Fail-closed: kan vi ikke tælle, slår vi ikke op. */
async function opslagIDag(admin: SupabaseClient): Promise<number> {
  const dagStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const { count, error } = await admin
    .from("cvr_opslag_cache")
    .select("cvr", { count: "exact", head: true })
    .gte("slaaet_op_at", dagStart);
  if (error) {
    console.error(`${LOG} dagstælling fejlede — fail-closed:`, error.message);
    return Number.MAX_SAFE_INTEGER;
  }
  return count ?? 0;
}

/** Den friske række i cachen, eller null. Samme friskhed som formularens (erFriskCache). */
async function fraCache(admin: SupabaseClient, cvr: string): Promise<CvrCacheRaekke | null> {
  const { data, error } = await admin
    .from("cvr_opslag_cache")
    .select("cvr, udfald, visning, slaaet_op_at, svar")
    .eq("cvr", cvr)
    .maybeSingle();
  if (error) {
    console.error(`${LOG} cache-opslag fejlede:`, error.message);
    return null;
  }
  if (!data) return null;
  const r = data as unknown as CvrCacheRaekke;
  return erFriskCache(r.udfald, r.slaaet_op_at) ? r : null;
}

export interface OpslagSvar {
  ok: boolean;
  udfald: ManueltUdfald;
  besked: string;
  /** De fire felter, fladen tegner — kun ved «fundet». */
  visning: CvrVisning | null;
  /** Blev ansøgningens cvr_opslag skrevet? false ved alt andet end «fundet». */
  skrevet: boolean;
  /** Kom svaret fra cachen frem for et rigtigt opslag? */
  fra_cache: boolean;
}

const svarMed = (udfald: ManueltUdfald, ekstra: Partial<OpslagSvar> = {}): OpslagSvar => ({
  ok: udfald === "fundet",
  udfald,
  besked: opslagsBesked(udfald, ekstra.visning?.navn ?? null),
  visning: ekstra.visning ?? null,
  skrevet: ekstra.skrevet ?? false,
  fra_cache: ekstra.fra_cache ?? false,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Kun POST" }, 405);

  // ── 1. Kalderen FØRST, så rollen — begge FØR service role. ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId: userId, callerClient } = auth;
  const { data: erRaadgiver, error: rolleErr } = await callerClient.rpc("has_role", { _user_id: userId, _role: "advisor" });
  if (rolleErr || erRaadgiver !== true) return json({ error: "Kun rådgivere" }, 403);

  let raaBody: Record<string, unknown>;
  try {
    raaBody = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Ugyldig JSON" }, 400);
  }
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ error: "ukendte_felter", besked }, 400);
  }
  const ansoegningId = typeof raaBody.ansoegning_id === "string" ? raaBody.ansoegning_id : "";
  if (!UUID.test(ansoegningId)) return json({ error: "ansoegning_id mangler eller er ugyldigt" }, 400);

  // ── 2. Service role — først nu. ──
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: raekke, error: laesErr } = await admin
    .from("ansoegninger")
    .select("id, cvr, cvr_opslag")
    .eq("id", ansoegningId)
    .maybeSingle();
  if (laesErr) {
    console.error(`${LOG} kunne ikke læse ansøgningen:`, laesErr.message);
    return json({ error: "Ansøgningen kunne ikke læses" }, 500);
  }
  if (!raekke) return json(svarMed("ukendt_ansoegning"), 404);

  const cvr = normaliserCvr(typeof raekke.cvr === "string" ? raekke.cvr : "");
  if (!kanSlaaOp(cvr)) {
    console.log(`${LOG} ${ansoegningId}: intet CVR på otte cifre («${raekke.cvr ?? ""}») — intet opslag`);
    return json(svarMed("intet_cvr"));
  }

  // ── 3. Cachen først — et opslag, huset lige har lavet, købes ikke igen. ──
  const fresk = await fraCache(admin, cvr);
  let visning: CvrVisning | null = null;
  let udfald: ManueltUdfald;
  let fraCachen = false;

  if (fresk) {
    fraCachen = true;
    visning = fresk.udfald === "fundet" ? (fresk.visning ?? null) : null;
    udfald = fresk.udfald === "fundet" && visning ? "fundet" : "findes_ikke";
  } else {
    // ── 4. Dagsloftet — samme kvote som formularens. ──
    const loft = await hentLoft(admin);
    const dom = doemLoft(await opslagIDag(admin), loft);
    if (dom.tilstand === "ramt") {
      console.warn(`${LOG} dagsloftet (${loft}) er nået — CVR ${cvr} ikke slået op`);
      return json(svarMed("dagsloft"));
    }
    // ── 5. Ét rigtigt opslag, gennem husets ene kilde. ──
    const bygget = cacheRaekkeAf(cvr, await hentDataCvrRaa(cvr));
    await gemICache(admin, bygget.raekke);
    if (bygget.udfald.udfald === "fundet") {
      visning = bygget.raekke?.visning ?? null;
      udfald = visning ? "fundet" : "utilgaengelig";
    } else if (bygget.udfald.udfald === "findes_ikke") {
      udfald = "findes_ikke";
    } else {
      const grund = bygget.udfald.udfald === "fejl" ? ` — ${bygget.udfald.grund}` : "";
      console.warn(`${LOG} CVR ${cvr}: ${bygget.udfald.udfald}${grund}`);
      udfald = "utilgaengelig";
    }
  }

  // ── 6. Skrivningen — KUN «fundet» med visning, og ALDRIG cvr_bekraeftet. ──
  let skrevet = false;
  if (maaSkrives(udfald, visning !== null)) {
    const { error: skrivErr } = await admin
      .from("ansoegninger")
      .update({ cvr_opslag: { cvr, ...(visning as CvrVisning) } })
      .eq("id", ansoegningId);
    if (skrivErr) {
      console.error(`${LOG} kunne ikke gemme opslaget på ${ansoegningId}:`, skrivErr.message);
      return json(svarMed("utilgaengelig", { visning, fra_cache: fraCachen }));
    }
    skrevet = true;
    console.log(`${LOG} ${ansoegningId}: CVR ${cvr} → «${visning?.navn ?? "?"}»${fraCachen ? " (fra cachen)" : ""}`);
  }

  return json(svarMed(udfald, { visning, skrevet, fra_cache: fraCachen }));
});
