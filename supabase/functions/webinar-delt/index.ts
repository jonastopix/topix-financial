// webinar-delt — /webinar delt med en ekstern gennem et privat link (udkast 21/9-2026,
// recon-webinar-deling.md). Den OFFENTLIGE side: kalderen er en person UDEN session
// og uden konto, der kommer fra /delt/webinar?t=<token>.
//
// LEGITIMATIONEN ER TOKENET, verificeret af verifyDelingstoken
// (_shared/delingstokenAuth.ts) FØR enhver anden service-role-handling — samme
// klasse og invariant som aftale-underskrift (verifyAftaletoken). verify_jwt = false
// i config.toml, bevidst: gatewayen ville ellers afvise kaldet før koden kører.
//
// INGEN RÅ RÆKKER TIL BROWSEREN (Jonas 21/9, punkt 2): i dag henter rådgiverfladen
// hele webinar_tilmeldinger (mail, navn, by, enhed, fbclid, referrer) og regner selv.
// Her hentes rækkerne med service role, dommen regnes på serveren med de SPEJLEDE
// domme (webinarDashboard.ts, annoncepriser.ts — samme som fladens), og svaret er
// KUN det færdige dashboard + priserne. findForbudteNoegler går svaret igennem
// FØR det sendes; er en personfelt-nøgle med, svares 500 svar_afvist frem for at
// lække. Prøven på det faktiske svar-objekt: src/lib/__tests__/webinarDeling.test.ts.
//
// ÉT SVAR UDADTIL for ukendt, udløbet og lukket: 403 { error: "ukendt" } — grunden
// røbes ikke. For en KENDT deling står grunden i sporet (webinar_deling_spor:
// afvist_udloebet/_lukket), og hver VISNING logges (vist) med tidspunkt, IP og
// user-agent som aftale_spor (cf-connecting-ip, ellers x-forwarded-for,
// user-agent ≤ 512 tegn). Sporet er insert-only og kan ikke slettes — derfor
// (rettelse 21/9) SKRIVES ET UKENDT TOKEN ALDRIG I SPORET: uden rate-limit kunne
// en fremmed ellers fylde det med rækker, der aldrig kan fjernes. Et ukendt token
// (ugyldig form ELLER intet match) går kun i functionens log, med formen
// gyldig/ugyldig og aldrig tokenet.
//
// BODY (STRIKS, bodyFelter.guard): t (tokenet) · valg (periodevælgeren:
// daekning · 7dage · 30dage — samme tre som fladens). Alt andet afvises med 400.
// Periodevælgeren på den delte side er et nyt kald med et andet valg.
//
// HENTNINGEN FØLGER HOOKENES FORM: tilmeldingerne i tre forsøg (med udledte →
// med spor → uden spor) KUN på 42703, som src/hooks/webinarDashboard.ts; Meta-
// tabellerne «mangler» på 42P01 som src/hooks/annonceforbrug.ts. Kolonnelisterne
// her er de samme som fladens (låst af webinarDeling.guard).
//
// KASTER ALDRIG mod kalderen: vælter hentningen, er svaret 500 med grunden i loggen.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { verifyDelingstoken } from "../_shared/delingstokenAuth.ts";
import { afvisningAf, erTokenForm, erVindueValg, type SporHaendelse } from "../_shared/webinarDeling.ts";
import { bygDeltSvar, findForbudteNoegler } from "../_shared/webinarDelingSvar.ts";
import type { AnsoegerMail, Tilmelding } from "../_shared/webinarDashboard.ts";
import type { Annoncenavn, Forbrugsdag, HentningStatus } from "../_shared/annoncepriser.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[webinar-delt]";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["t", "valg"] as const;

// ── Kolonnerne — de samme som fladens (src/hooks/webinar.ts, src/lib/webinar/kolonner.ts; låst af webinarDeling.guard) ──
// Bedømmelsen (22/9-2026) hentes som TEKSTSTI — `interactions:raa->>interactionsSummary`
// — og aldrig som hele `raa`: den rå payload bærer alt, eWebinar ved om personen.
// Teksten forlader ALDRIG serveren; dommen (webinarDashboard.bedoemmelse) svarer
// kun med tal og andele, og findForbudteNoegler går svaret igennem som før.
export const GRUND_KOLONNER =
  "ewebinar_id, email, navn, webinar_id, webinar_titel, session_tid, session_type, registreret_at, state, sidste_action, attended, subscribed, set_procent, set_procent_kilde, interactions:raa->>interactionsSummary";
export const ANNONCESPOR_KOLONNER = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "origin", "first_origin", "referrer", "first_referrer", "widget_source",
  "by", "land", "enhed", "tidszone",
] as const;
export const UDLEDTE_KOLONNER = ["ad_id_udledt"] as const;
const DAG_KOLONNER = "ad_id, campaign_id, dato, valuta, forbrug_oere";
const ANNONCE_KOLONNER = "ad_id, campaign_id, navn, kampagne_navn";
const HENTNING_KOLONNER = "sidste_koersel, sidste_udfald, sidste_fejl, hentet_til";
const GRAENSE = 5000;

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Kalder { ip: string | null; user_agent: string | null }

function laesKalder(req: Request): Kalder {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ua = req.headers.get("user-agent")?.trim().slice(0, 512);
  return { ip: cf || xff || null, user_agent: ua || null };
}

/** Én sporrække. Kaster aldrig — et spor, der ikke kunne skrives, logges højt. */
async function skrivSpor(admin: SupabaseClient, delingId: string, haendelse: SporHaendelse, kalder: Kalder, detaljer: Record<string, unknown> | null = null): Promise<void> {
  const { error } = await admin.from("webinar_deling_spor").insert({ deling_id: delingId, haendelse, ip: kalder.ip, user_agent: kalder.user_agent, detaljer });
  if (error) console.error(`${LOG} SPOR IKKE SKREVET (${haendelse}) for deling ${delingId}:`, error.message);
}

const erUkendtKolonne = (fejl: { code?: string; message?: string } | null) =>
  !!fejl && (fejl.code === "42703" || (/does not exist/i.test(fejl.message ?? "") && /column/i.test(fejl.message ?? "")));
const erUkendtTabel = (fejl: { code?: string; message?: string } | null) =>
  !!fejl && (fejl.code === "42P01" || (/does not exist/i.test(fejl.message ?? "") && /relation/i.test(fejl.message ?? "")));

function somTilmelding(r: Record<string, unknown>): Tilmelding {
  const p = r.set_procent;
  return { ...(r as unknown as Tilmelding), set_procent: p === null || p === undefined ? null : Number(p) };
}

/** Tilmeldingerne i tre forsøg — hvert ét trin fattigere, og KUN på 42703 (hookens form). */
async function hentTilmeldinger(admin: SupabaseClient): Promise<{ raekker: Tilmelding[]; sporKolonnerFindes: boolean }> {
  const q = (kolonner: string) =>
    admin.from("webinar_tilmeldinger").select(kolonner).order("session_tid", { ascending: false, nullsFirst: false }).limit(GRAENSE);
  const medAlt = await q([GRUND_KOLONNER, ...ANNONCESPOR_KOLONNER, ...UDLEDTE_KOLONNER].join(", "));
  if (!medAlt.error) return { raekker: ((medAlt.data ?? []) as unknown as Record<string, unknown>[]).map(somTilmelding), sporKolonnerFindes: true };
  if (!erUkendtKolonne(medAlt.error)) throw new Error(`webinar_tilmeldinger: ${medAlt.error.message}`);
  const medSpor = await q([GRUND_KOLONNER, ...ANNONCESPOR_KOLONNER].join(", "));
  if (!medSpor.error) return { raekker: ((medSpor.data ?? []) as unknown as Record<string, unknown>[]).map(somTilmelding), sporKolonnerFindes: true };
  if (!erUkendtKolonne(medSpor.error)) throw new Error(`webinar_tilmeldinger: ${medSpor.error.message}`);
  const grund = await q(GRUND_KOLONNER);
  if (grund.error) throw new Error(`webinar_tilmeldinger: ${grund.error.message}`);
  return { raekker: ((grund.data ?? []) as unknown as Record<string, unknown>[]).map(somTilmelding), sporKolonnerFindes: false };
}

/** De indsendte ansøgninger + virksomhedens slutdato (fail-soft, som hooken). */
async function hentAnsoegere(admin: SupabaseClient): Promise<AnsoegerMail[]> {
  const res = await admin.from("ansoegninger").select("email, indsendt_at, trin, company_id").not("indsendt_at", "is", null).limit(GRAENSE);
  if (res.error) throw new Error(`ansoegninger: ${res.error.message}`);
  const raekker = ((res.data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      email: String(r.email ?? "").trim().toLowerCase(),
      indsendt_at: (r.indsendt_at as string | null) ?? null,
      trin: (r.trin as AnsoegerMail["trin"]) ?? "ny",
      company_id: (r.company_id as string | null) ?? null,
    }))
    .filter((a) => a.email !== "");
  const ids = [...new Set(raekker.map((r) => r.company_id).filter((id): id is string => !!id))];
  const slutdatoer = new Map<string, string | null>();
  if (ids.length > 0) {
    const vRes = await admin.from("companies").select("id, contract_end_date").in("id", ids);
    if (vRes.error) console.error(`${LOG} companies-opslag til «blev medlem» fejlede:`, vRes.error.message);
    for (const v of (vRes.data ?? []) as { id: string; contract_end_date: string | null }[]) slutdatoer.set(v.id, v.contract_end_date);
  }
  return raekker.map(({ company_id, ...r }) => ({ ...r, virksomhed_slutdato: company_id ? (slutdatoer.get(company_id) ?? null) : null }));
}

/** Annonceforbruget — tre tilstande, som hooken: mangler (42P01) · tom · har. */
async function hentAnnonceforbrug(admin: SupabaseClient): Promise<{ dage: Forbrugsdag[]; annoncer: Annoncenavn[]; tilstand: "mangler" | "tom" | "har"; hentning: HentningStatus | null }> {
  const dagSvar = await admin.from("meta_annonce_dag").select(DAG_KOLONNER).order("dato", { ascending: false }).limit(GRAENSE);
  if (dagSvar.error) {
    if (erUkendtTabel(dagSvar.error)) return { dage: [], annoncer: [], tilstand: "mangler", hentning: null };
    throw new Error(`meta_annonce_dag: ${dagSvar.error.message}`);
  }
  const dage = ((dagSvar.data ?? []) as Record<string, unknown>[]).map((r) => ({
    ad_id: String(r.ad_id ?? ""), campaign_id: (r.campaign_id as string | null) ?? null, dato: String(r.dato ?? ""), valuta: String(r.valuta ?? ""),
    forbrug_oere: r.forbrug_oere === null || r.forbrug_oere === undefined ? 0 : Number(r.forbrug_oere),
  }));
  let annoncer: Annoncenavn[] = [];
  const navnSvar = await admin.from("meta_annonce").select(ANNONCE_KOLONNER).limit(GRAENSE);
  if (navnSvar.error) {
    if (!erUkendtTabel(navnSvar.error)) console.error(`${LOG} meta_annonce-opslag fejlede:`, navnSvar.error.message);
  } else {
    annoncer = ((navnSvar.data ?? []) as Record<string, unknown>[]).map((r) => ({
      ad_id: String(r.ad_id ?? ""), campaign_id: (r.campaign_id as string | null) ?? null, navn: (r.navn as string | null) ?? null, kampagne_navn: (r.kampagne_navn as string | null) ?? null,
    }));
  }
  let hentning: HentningStatus | null = null;
  const statusSvar = await admin.from("meta_hentning").select(HENTNING_KOLONNER).eq("art", "annoncer").maybeSingle();
  if (statusSvar.error) {
    if (!erUkendtTabel(statusSvar.error)) console.error(`${LOG} meta_hentning-opslag fejlede:`, statusSvar.error.message);
  } else if (statusSvar.data) {
    const r = statusSvar.data as Record<string, unknown>;
    hentning = { sidste_koersel: String(r.sidste_koersel ?? ""), sidste_udfald: String(r.sidste_udfald ?? ""), sidste_fejl: (r.sidste_fejl as string | null) ?? null, hentet_til: (r.hentet_til as string | null) ?? null };
  }
  return { dage, annoncer, tilstand: dage.length === 0 ? "tom" : "har", hentning };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let raaBody: Record<string, unknown> | null = null;
  try {
    raaBody = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "body_mangler" }, 400);
  }
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ error: "ukendte_felter", besked }, 400);
  }
  const valg = raaBody?.valg === undefined ? "daekning" : raaBody.valg;
  if (!erVindueValg(valg)) return json({ error: "valg_ugyldigt" }, 400);
  const nu = new Date();
  const kalder = laesKalder(req);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── 1. Legitimationen FØRST — før enhver anden service-role-handling. ──
  const dom = await verifyDelingstoken(raaBody?.t, admin, nu);
  if (dom.tilstand === "ukendt") {
    // ALDRIG i sporet (det kan ikke slettes) — kun i loggen, og aldrig tokenet selv.
    console.error(`${LOG} afvist: ukendt token (form ${erTokenForm(raaBody?.t) ? "gyldig" : "ugyldig"}) — intet spor`);
    return json({ error: "ukendt" }, 403);
  }
  if (dom.tilstand !== "aktiv") {
    await skrivSpor(admin, dom.raekke.id, afvisningAf(dom.tilstand), kalder);
    return json({ error: "ukendt" }, 403);
  }

  // ── 2. Visningen i sporet. ──
  await skrivSpor(admin, dom.raekke.id, "vist", kalder, { valg });

  // ── 3. Rækkerne (service role) → dommen på serveren → kun det færdige. ──
  try {
    const [tilmeldinger, ansoegninger, forbrug] = await Promise.all([hentTilmeldinger(admin), hentAnsoegere(admin), hentAnnonceforbrug(admin)]);
    const svar = bygDeltSvar({
      tilmeldinger: tilmeldinger.raekker, ansoegninger, sporKolonnerFindes: tilmeldinger.sporKolonnerFindes,
      dage: forbrug.dage, annoncer: forbrug.annoncer, tilstand: forbrug.tilstand, hentning: forbrug.hentning, valg,
    }, nu);
    const forbudte = findForbudteNoegler(svar);
    if (forbudte.length > 0) {
      console.error(`${LOG} SVAR AFVIST — personfelter i svaret:`, forbudte.slice(0, 10).join(", "));
      return json({ error: "svar_afvist" }, 500);
    }
    return json({ ok: true, udloeber_at: dom.raekke.udloeber_at, nu: nu.toISOString(), ...svar });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} hentningen væltede:`, grund);
    return json({ error: "hentning_fejlede" }, 500);
  }
});
