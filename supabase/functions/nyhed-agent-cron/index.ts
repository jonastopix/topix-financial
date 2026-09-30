// nyhed-agent-cron — nyhedsagenten, skive 1 (30/9-2026; docs/agentarkitektur.md
// §1.2 og §4.2). Én gang om ugen (migration 20260930171000_nyhedsagent_cron.sql,
// mandag morgen): henter de offentlige feeds i KILDER, dedupper på URL-aftryk,
// lader LLM'en vurdere det nye (score + hvem + handling) og skriver ugens 3–5
// vigtigste som ÉT UDKAST til et community-opslag i nyhed_udkast. Klokken
// «nyhed_udkast_klar» ringer hos rådgiverne (MORGEN-mailen). INTET publiceres
// her: opslaget oprettes KUN af en rådgivers klik på /nyheder, gennem husets
// egen community-skrivevej (nyhed-udkast-afgoer + opret_community_traad som
// rådgiveren). Niveau N1, permanent (arkitekturen §4.2).
//
// SAMME FORM SOM certifikat-klokke og klokke-mail-cron: Bucket B —
// authenticateServiceRole FØRST bag verify_jwt = true; TØRKØRSEL SOM STANDARD —
// uden body hentes, dømmes og vurderes der (også LLM-kaldet, så udkastet kan
// læses i svaret), men intet skrives i nyhed_emne/nyhed_udkast og ingen klokke
// ringer. Rigtig skrivning kræver { "dry_run": false } OG låsen
// app_config['nyhedsagent_aktiv'] = true. Ukendte felter afvises
// (kendteFelter.ts). «nu» (ISO) flytter uret; «uden_llm: true» springer
// LLM-kaldene over (kun hentning og dedup — gratis).
//
// SPORET: hver kørsel — også tørkørslen — skriver én række i
// nyhed_agent_koersel (tællinger, feedstatus, tokens, stopgrund, svaret).
//
// LLM-VEJEN er husets eksisterende: Lovable AI Gateway
// (https://ai.gateway.lovable.dev/v1/chat/completions) med LOVABLE_API_KEY og
// MODEL «google/gemini-2.5-flash» — ordret run-company-agents (index.ts:16,
// :1102, :1267). Ingen ny nøgle. Struktureret output via tool_choice (som
// generate-budget-scenarios), og svaret dømmes af nyhedAgent.ts — LLM'en
// skriver aldrig udad.
//
// INGEN PERSONDATA til LLM'en: cronen læser INGEN medlemstabel. Modellen får
// kun feedets egne felter under korte id'er (n1, n2 …).
//
// BEVISET (CLAUDE.md): svaret bærer `nyhed_agent: "skive-1"`.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { aiGatewayFetch } from "../_shared/aiGatewayFetch.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import {
  byggDokument,
  FEED_TIMEOUT_MS,
  type FeedEmne,
  type Kandidat,
  KILDER,
  KLOKKE_REFERENCE_TYPE,
  KLOKKE_TITEL,
  klokkeTekst,
  LAAS_NOEGLE,
  LLM_TIMEOUT_MS,
  type LlmEmne,
  maaStarteLlmKald,
  MAKS_TEGN_PR_KALD,
  MAKS_TIL_VURDERING,
  MIN_SCORE,
  NYHED_AGENT_SKIVE,
  parseFeed,
  SYSTEM_UDKAST,
  SYSTEM_VURDERING,
  TYPE_NYHED_UDKAST_KLAR,
  type Udkast,
  udvaelgIVindue,
  ugeNoegle,
  VAERKTOEJ_UDKAST,
  VAERKTOEJ_VURDERING,
  vaelgTilUdkast,
  validerUdkast,
  validerVurderinger,
  type Vurdering,
  VURDERING_PR_KALD,
  vurderingsBesked,
} from "../_shared/nyhedAgent.ts";

const LOG = "[nyhed-agent-cron]";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Samme gateway og samme model som run-company-agent (nyhedAgent.guard dom 3 holder dem ens). */
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "nu", "uden_llm"] as const;

const UA = "TheBoardroom-nyhedsagent/1 (+https://app.theboardroom.dk)";
const LIVE_STATUSSER = ["kladde", "publiceres", "godkendt"];

interface KildeStatus { kilde: string; http: number | null; emner: number; fejl: string | null }
interface LlmSpor { kald: number; afvist_svar: number; input_tokens: number; output_tokens: number; fejl: string[] }

export interface NyhedResultat {
  ok: boolean;
  nyhed_agent: typeof NYHED_AGENT_SKIVE;
  dry_run: boolean;
  laas_aktiv: boolean;
  /** dry_run: false OG låsen. */
  skriver: boolean;
  uden_llm: boolean;
  nu: string;
  uge: string;
  kilder: KildeStatus[];
  hentet: number;
  i_vindue: number;
  uden_dato: number;
  nye: number;
  vurderet: number;
  relevante: number;
  udkast: { titel: string; punkter: { overskrift: string; kilde: string; url: string; score: number }[]; tekst: string } | null;
  udkast_id: string | null;
  udkast_fejl: string[];
  klokke: { skrevet: number; fandtes: number; fejl: string[] } | null;
  llm: LlmSpor & { model: string };
  stop_grund: string | null;
  varighed_ms: number;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function dele<T>(xs: readonly T[], n: number): T[][] {
  const ud: T[][] = [];
  for (let i = 0; i < xs.length; i += n) ud.push(xs.slice(i, i + n));
  return ud;
}

async function hentKilde(k: (typeof KILDER)[number]): Promise<{ status: KildeStatus; emner: FeedEmne[] }> {
  try {
    const res = await aiGatewayFetch(k.url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.1" } }, { timeoutMs: FEED_TIMEOUT_MS, retries: 1 });
    const xml = await res.text();
    if (!res.ok) return { status: { kilde: k.noegle, http: res.status, emner: 0, fejl: `HTTP ${res.status}` }, emner: [] };
    const emner = parseFeed(xml, k.noegle);
    return { status: { kilde: k.noegle, http: res.status, emner: emner.length, fejl: emner.length === 0 ? "ingen emner i feedet" : null }, emner };
  } catch (err) {
    return { status: { kilde: k.noegle, http: null, emner: 0, fejl: err instanceof Error ? err.message : String(err) }, emner: [] };
  }
}

/** Ét tvunget værktøjskald til gatewayen. Svarer værktøjets argumenter (parset) eller en fejl. Kaster aldrig. */
async function kaldLlm(system: string, bruger: string, vaerktoej: typeof VAERKTOEJ_VURDERING | typeof VAERKTOEJ_UDKAST, spor: LlmSpor): Promise<unknown | null> {
  spor.kald++;
  try {
    const res = await aiGatewayFetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")!}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: bruger }],
        tools: [vaerktoej],
        tool_choice: { type: "function", function: { name: vaerktoej.function.name } },
      }),
    }, { timeoutMs: LLM_TIMEOUT_MS, retries: 0 });
    if (!res.ok) {
      spor.fejl.push(`gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const svar = await res.json();
    spor.input_tokens += Number(svar?.usage?.prompt_tokens ?? 0) || 0;
    spor.output_tokens += Number(svar?.usage?.completion_tokens ?? 0) || 0;
    const args = svar?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (typeof args !== "string") {
      spor.fejl.push("intet værktøjskald i svaret");
      return null;
    }
    return JSON.parse(args);
  } catch (err) {
    spor.fejl.push(err instanceof Error ? err.message : String(err));
    return null;
  }
}

interface EmneRaekke {
  id: string | null;
  url_hash: string;
  kilde: string;
  titel: string;
  url: string;
  resume: string;
  udgivet_at: string | null;
  score: number | null;
  relevant: boolean | null;
  hvem: string | null;
  handling: string | null;
  begrundelse: string | null;
  vurderet_at: string | null;
  brugt_i_udkast_id: string | null;
}

export async function koerNyhedsagent(admin: SupabaseClient, a: { toerKoersel: boolean; nu: Date; udenLlm: boolean; start: number }): Promise<NyhedResultat> {
  const { data: laas } = await admin.from("app_config").select("config_value").eq("config_key", LAAS_NOEGLE).maybeSingle();
  const laasAktiv = (laas as { config_value?: unknown } | null)?.config_value === true;
  const skriver = !a.toerKoersel && laasAktiv;
  const uge = ugeNoegle(a.nu);
  const spor: LlmSpor = { kald: 0, afvist_svar: 0, input_tokens: 0, output_tokens: 0, fejl: [] };
  const r: NyhedResultat = {
    ok: true, nyhed_agent: NYHED_AGENT_SKIVE, dry_run: a.toerKoersel, laas_aktiv: laasAktiv, skriver, uden_llm: a.udenLlm,
    nu: a.nu.toISOString(), uge, kilder: [], hentet: 0, i_vindue: 0, uden_dato: 0, nye: 0, vurderet: 0, relevante: 0,
    udkast: null, udkast_id: null, udkast_fejl: [], klokke: null, llm: { ...spor, model: MODEL }, stop_grund: null, varighed_ms: 0,
  };
  const forloebet = () => Date.now() - a.start;

  // 1. Feeds — parallelt, hver med sin timeout.
  const hentet = await Promise.all(KILDER.map(hentKilde));
  r.kilder = hentet.map((h) => h.status);
  const alle = hentet.flatMap((h) => h.emner);
  r.hentet = alle.length;
  const vindue = udvaelgIVindue(alle, a.nu);
  r.i_vindue = vindue.valgt.length;
  r.uden_dato = vindue.uden_dato;

  // 2. Dedup på URL-aftrykket mod nyhed_emne.
  const raekker: EmneRaekke[] = [];
  for (const e of vindue.valgt) {
    raekker.push({ id: null, url_hash: await sha256Hex(e.url), kilde: e.kilde, titel: e.titel, url: e.url, resume: e.resume, udgivet_at: e.udgivet,
      score: null, relevant: null, hvem: null, handling: null, begrundelse: null, vurderet_at: null, brugt_i_udkast_id: null });
  }
  const kendte = new Map<string, EmneRaekke>();
  for (const del of dele(raekker.map((x) => x.url_hash), 200)) {
    const { data, error } = await admin.from("nyhed_emne")
      .select("id, url_hash, kilde, titel, url, resume, udgivet_at, score, relevant, hvem, handling, begrundelse, vurderet_at, brugt_i_udkast_id")
      .in("url_hash", del);
    if (error) throw new Error(`nyhed_emne: ${error.message}`);
    for (const x of (data ?? []) as EmneRaekke[]) kendte.set(x.url_hash, x);
  }
  const emner = raekker.map((x) => kendte.get(x.url_hash) ?? x);
  const nye = emner.filter((x) => x.id === null);
  r.nye = nye.length;
  if (skriver && nye.length > 0) {
    const { data, error } = await admin.from("nyhed_emne")
      .upsert(nye.map(({ id: _id, score: _s, relevant: _r, hvem: _h, handling: _ha, begrundelse: _b, vurderet_at: _v, brugt_i_udkast_id: _u, ...felter }) => felter), { onConflict: "url_hash", ignoreDuplicates: true })
      .select("id, url_hash");
    if (error) throw new Error(`nyhed_emne insert: ${error.message}`);
    const idPr = new Map(((data ?? []) as { id: string; url_hash: string }[]).map((x) => [x.url_hash, x.id]));
    for (const x of nye) x.id = idPr.get(x.url_hash) ?? null;
  }

  // 3. Findes ugens udkast allerede? Så vurderes der stadig, men der skrives intet nyt udkast.
  const { data: live, error: liveFejl } = await admin.from("nyhed_udkast").select("id, status").eq("uge", uge).in("status", LIVE_STATUSSER).limit(1);
  if (liveFejl) throw new Error(`nyhed_udkast: ${liveFejl.message}`);
  const udkastFindes = (live ?? []).length > 0;

  if (a.udenLlm) {
    r.stop_grund = "uden_llm";
    r.llm = { ...spor, model: MODEL };
    return r;
  }

  // 4. Vurdering af det uvurderede (nyeste først), i kald á VURDERING_PR_KALD, under loftet.
  const tilVurdering = emner.filter((x) => x.vurderet_at === null).slice(0, MAKS_TIL_VURDERING);
  const nyeVurderinger = new Map<string, Vurdering>();
  for (const del of dele(tilVurdering, VURDERING_PR_KALD)) {
    if (!maaStarteLlmKald(forloebet(), spor.kald)) { r.stop_grund = "loft_eller_tid_under_vurdering"; break; }
    const llmEmner: LlmEmne[] = del.map((x, i) => ({ id: `n${i + 1}`, kilde: KILDER.find((k) => k.noegle === x.kilde)?.navn ?? x.kilde, titel: x.titel, resume: x.resume, dato: x.udgivet_at }));
    const besked = vurderingsBesked(llmEmner);
    if (besked.length > MAKS_TEGN_PR_KALD) { r.stop_grund = "for_mange_tegn"; break; }
    const svar = await kaldLlm(SYSTEM_VURDERING, besked, VAERKTOEJ_VURDERING, spor);
    const dom = validerVurderinger(svar, llmEmner.map((e) => e.id));
    spor.afvist_svar += dom.afvist;
    for (const v of dom.vurderinger) nyeVurderinger.set(del[Number(v.id.slice(1)) - 1].url_hash, v);
  }
  r.vurderet = nyeVurderinger.size;
  const vurderetAt = new Date().toISOString();
  for (const x of emner) {
    const v = nyeVurderinger.get(x.url_hash);
    if (!v) continue;
    Object.assign(x, { score: v.score, relevant: v.relevant, hvem: v.hvem, handling: v.handling, begrundelse: v.begrundelse, vurderet_at: vurderetAt });
    if (skriver && x.id) {
      const { error } = await admin.from("nyhed_emne")
        .update({ score: v.score, relevant: v.relevant, hvem: v.hvem, handling: v.handling, begrundelse: v.begrundelse, vurderet_at: vurderetAt, model: MODEL })
        .eq("id", x.id).is("vurderet_at", null);
      if (error) spor.fejl.push(`vurdering gemt: ${error.message}`);
    }
  }

  // 5. Udvælgelsen: vurderet, relevant, score ≥ MIN_SCORE, ikke brugt før.
  const kandidater: Kandidat[] = emner
    .filter((x) => x.vurderet_at !== null && x.brugt_i_udkast_id === null && x.score !== null && x.relevant !== null)
    .map((x) => ({ emne_id: x.id ?? x.url_hash, kilde: x.kilde, titel: x.titel, url: x.url, resume: x.resume, udgivet: x.udgivet_at,
      score: x.score!, relevant: x.relevant!, hvem: x.hvem ?? "", handling: x.handling ?? "", begrundelse: x.begrundelse ?? "" }));
  const { valgt, nok } = vaelgTilUdkast(kandidater);
  r.relevante = kandidater.filter((k) => k.relevant && k.score >= MIN_SCORE).length;
  if (udkastFindes) { r.stop_grund = r.stop_grund ?? "udkast_findes_for_ugen"; r.llm = { ...spor, model: MODEL }; return r; }
  if (!nok) { r.stop_grund = r.stop_grund ?? "for_faa_relevante"; r.llm = { ...spor, model: MODEL }; return r; }

  // 6. Udkastet: ét kald, ét nyt forsøg ved et afvist svar — under loftet.
  const kortId = valgt.map((k, i) => ({ id: `n${i + 1}`, k }));
  const llmValgte = kortId.map(({ id, k }) => ({ id, kilde: KILDER.find((x) => x.noegle === k.kilde)?.navn ?? k.kilde, titel: k.titel, resume: k.resume, dato: k.udgivet, hvem: k.hvem, handling: k.handling }));
  let udkast: Udkast | null = null;
  for (let forsoeg = 0; forsoeg < 2 && !udkast; forsoeg++) {
    if (!maaStarteLlmKald(forloebet(), spor.kald)) { r.stop_grund = "loft_eller_tid_under_udkast"; break; }
    const besked = JSON.stringify({ nyheder: llmValgte, tidligere_afvist: r.udkast_fejl.length > 0 ? r.udkast_fejl : undefined });
    const svar = await kaldLlm(SYSTEM_UDKAST, besked, VAERKTOEJ_UDKAST, spor);
    const dom = validerUdkast(svar, llmValgte);
    if (dom.ok) udkast = dom.udkast;
    else r.udkast_fejl = dom.fejl;
  }
  r.llm = { ...spor, model: MODEL };
  if (!udkast) { r.stop_grund = r.stop_grund ?? "udkast_afvist_af_dommen"; return r; }

  const pr = new Map(kortId.map(({ id, k }) => [id, { navn: KILDER.find((x) => x.noegle === k.kilde)?.navn ?? k.kilde, titel: k.titel, url: k.url }]));
  const doc = byggDokument(udkast, pr);
  const brugte = udkast.punkter.map((p) => kortId.find((x) => x.id === p.id)!.k);
  r.udkast = {
    titel: udkast.titel,
    punkter: udkast.punkter.map((p) => { const k = kortId.find((x) => x.id === p.id)!.k; return { overskrift: p.overskrift, kilde: k.kilde, url: k.url, score: k.score }; }),
    tekst: doc.content.map((b) => b.content.map((t) => t.text).join("")).join("\n"),
  };
  if (!skriver) { r.stop_grund = r.stop_grund ?? (a.toerKoersel ? "toerkoersel" : "laas_slukket"); return r; }

  // 7. Skriv udkastet (den delvist unikke regel på uge er dommeren mod to samtidige kørsler), marker emnerne, ring klokken.
  const kilderJson = brugte.map((k) => ({ emne_id: k.emne_id, kilde: k.kilde, titel: k.titel, url: k.url, score: k.score, hvem: k.hvem, handling: k.handling, begrundelse: k.begrundelse }));
  const { data: ny, error: nyFejl } = await admin.from("nyhed_udkast")
    .insert({ uge, titel: udkast.titel, indhold_json: doc, kilder: kilderJson, status: "kladde", model: MODEL })
    .select("id").single();
  if (nyFejl) throw new Error(`nyhed_udkast insert: ${nyFejl.message}`);
  const udkastId = (ny as { id: string }).id;
  r.udkast_id = udkastId;
  const emneIds = brugte.map((k) => k.emne_id).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (emneIds.length > 0) {
    const { error } = await admin.from("nyhed_emne").update({ brugt_i_udkast_id: udkastId }).in("id", emneIds).is("brugt_i_udkast_id", null);
    if (error) spor.fejl.push(`emner markeret: ${error.message}`);
  }
  const klokke = await skrivRaadgiverBesked(admin, {
    type: TYPE_NYHED_UDKAST_KLAR,
    title: KLOKKE_TITEL,
    body: klokkeTekst(brugte.length, brugte.map((k) => KILDER.find((x) => x.noegle === k.kilde)?.navn ?? k.kilde)),
    reference_type: KLOKKE_REFERENCE_TYPE,
    reference_id: udkastId,
  });
  r.klokke = { skrevet: klokke.skrevet, fandtes: klokke.fandtes, fejl: klokke.fejl };
  r.llm = { ...spor, model: MODEL };
  return r;
}

async function skrivSpor(admin: SupabaseClient, r: NyhedResultat | null, a: { toerKoersel: boolean; startet: Date; fejl: string | null }): Promise<void> {
  const { error } = await admin.from("nyhed_agent_koersel").insert({
    startet_at: a.startet.toISOString(),
    sluttet_at: new Date().toISOString(),
    dry_run: a.toerKoersel,
    skriver: r?.skriver ?? false,
    status: a.fejl ? "fejl" : "ok",
    stop_grund: a.fejl ?? r?.stop_grund ?? null,
    uge: r?.uge ?? null,
    hentet: r?.hentet ?? 0,
    nye: r?.nye ?? 0,
    vurderet: r?.vurderet ?? 0,
    relevante: r?.relevante ?? 0,
    llm_kald: r?.llm.kald ?? 0,
    input_tokens: r?.llm.input_tokens ?? 0,
    output_tokens: r?.llm.output_tokens ?? 0,
    model: MODEL,
    kilder: r?.kilder ?? [],
    udkast_id: r?.udkast_id ?? null,
    svar: r ?? { fejl: a.fejl },
  });
  if (error) console.error(`${LOG} sporet blev ikke skrevet:`, error.message);
}

const json = (krop: unknown, status = 200) => new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  const start = Date.now();
  const startet = new Date(start);
  let raaBody: Record<string, unknown> | null = null;
  try {
    raaBody = (await req.json()) as Record<string, unknown>;
  } catch {
    /* ingen body = tørkørsel */
  }
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ ok: false, nyhed_agent: NYHED_AGENT_SKIVE, fejl: besked }, 400);
  }
  const toerKoersel = raaBody?.dry_run !== false;
  const udenLlm = raaBody?.uden_llm === true;
  let nu = new Date();
  if (typeof raaBody?.nu === "string") {
    const t = new Date(raaBody.nu);
    if (Number.isNaN(t.getTime())) return json({ ok: false, nyhed_agent: NYHED_AGENT_SKIVE, fejl: `«nu» er ikke en dato: ${raaBody.nu}` }, 400);
    nu = t;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let resultat: NyhedResultat;
  try {
    resultat = await koerNyhedsagent(admin, { toerKoersel, nu, udenLlm, start });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, grund);
    await skrivSpor(admin, null, { toerKoersel, startet, fejl: grund });
    return json({ ok: false, nyhed_agent: NYHED_AGENT_SKIVE, dry_run: toerKoersel, fejl: grund }, 500);
  }
  resultat.varighed_ms = Date.now() - start;
  await skrivSpor(admin, resultat, { toerKoersel, startet, fejl: null });
  console.log(`${LOG} ${resultat.skriver ? "SKRIVER" : "TØRKØRSEL"} — uge ${resultat.uge}, hentet ${resultat.hentet}, nye ${resultat.nye}, vurderet ${resultat.vurderet}, udkast ${resultat.udkast_id ?? (resultat.udkast ? "(kun i svaret)" : "intet")}, stop ${resultat.stop_grund ?? "—"}, LLM-kald ${resultat.llm.kald}`);
  return json(resultat);
});
