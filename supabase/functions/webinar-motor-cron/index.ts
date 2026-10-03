// webinar-motor-cron — webinarmotorens efterarbejde (skive 3, 30/9-2026; docs/webinarmotor.md §7).
//
// BUCKET B: authenticateServiceRole FØRST bag verify_jwt = true. TØRKØRSEL SOM
// STANDARD og en LÅS (app_config['webinar_motor_aktiv'], fraværende = false,
// fail-closed) — samme form som webinar-mail-cron og meta-send-cron.
//
//   RIGTIG KØRSEL KRÆVER: dry_run: false OG (låsen ELLER `session_id` på en
//   INTERN session). Den interne prøve (D2.7) er den ene undtagelse og står
//   her: en prøvesession med husets egne adresser kan dømmes og give sine
//   Klaviyo-hændelser, uden at låsen — og dermed alle offentlige sessioner — tændes.
//
// HVAD DEN GØR (i den rækkefølge):
//   1. FREMMØDET. En session, der er slut (exitrummets slut + 5 min,
//      fremmoede.ts:sessionKlarTilDom), dømmes pr. tilmelding ud fra
//      BITMAPPEN (webinar_deltagelser.set_procent/foerste_ind_at) med
//      eWebinars ord (fremmoede.ts:fremmoedeDom): Watched/WatchedWebinar ·
//      Joined/Left · Missed/MissedWebinar, og set_procent på eWebinars skala.
//      Skrevet i webinar_tilmeldinger (kun fremad: fremmoedeRettelse; hver
//      UPDATE er vagtet på den state, den læste), så webinarDom.doemSetGrad,
//      /webinar, delingen og meta-send læser motorens rækker UÆNDRET.
//   2. KLAVIYO AD DEN EKSISTERENDE VEJ: graden efter (doemSetGrad) holdes op
//      mod den sidste grad, CRONEN SELV har dømt (webinar_motor_log art
//      «fremmoede_dom» — motorens hukommelse; webhooken havde eWebinars række
//      at sammenligne med, det har vi ikke), og afgoerOvergang → byggFremmoede
//      → sendHvisMail — de SAMME funktioner som ewebinar-webhook, unique_id
//      «P-<id>:<grad>». En afmeldt (webinar_afmeldinger eller «Unsubscribed»
//      på rækken, erAfmeldt) får INGEN hændelse. Fejlede afsendelser tager
//      klaviyo-gensend-cron som altid (sporet klaviyo_haendelser).
//      IDEMPOTENS: loggen skrives EFTER afsendelsen. Går kørslen ned imellem,
//      sendes samme unique_id igen — Klaviyo afviser dubletten (dokumenteret,
//      migration 20260919… klaviyo_haendelser).
//   3. SESSIONEN AFSLUTTES («afholdt», afsluttet_at) — KUN når ALLE dens
//      tilmeldinger er dømt i kørslen. Budgettet (fremmoede.ts) stopper før
//      jobbets timeout; resten tages næste kørsel.
//   4. OPBEVARINGEN af de rå pulser: webinar_pulser ældre end
//      PULS_OPBEVARING_DAGE (90 — begrundelsen står i fremmoede.ts) slettes,
//      KUN i den globale kørsel med låsen (aldrig i prøven). Aggregatet i
//      webinar_deltagelser bliver.
//
//   5. SVAR PÅ MAIL (skive 5, 3/10-2026; docs/webinarmotor.md §7.10) — et
//      ISOLERET pas EFTER fremmødet (_shared/webinarSvarMailKoersel.ts, dommen
//      webinarMotor/svarMail.ts): et besvaret spørgsmål med leveret IS NULL, hvor
//      seeren ikke har pulset i SVAR_MAIL_GAAET_SEK (180 s) eller sessionen er
//      slut, sendes på mail gennem Mailgun EU — én pr. spørgsmål (vagtet UPDATE
//      FØR afsendelsen). EGEN LÅS app_config.webinar_svar_mail_aktiv (fraværende
//      = false) og prøven til én adresse (`email`) uden låsen. Passet kaster
//      aldrig, rører aldrig fremmødedommen eller kørslens ok/fejl/status, og har
//      sin EGEN alarm (én pr. dansk time, driftModtager(), aldrig i tørkørslen).
//      Beviset: feltet `svar_mail` i svaret — kun den nye kode har det.
//
// BODY (STRIKS, bodyFelter.guard): dry_run · session_id · nu · email. `nu` flytter
// uret og er KUN tilladt i en tørkørsel; `email` er svarpassets prøve.
//
// BEVISET I SVARET: `motor: "boardroom-3"` — kun den nye kode kan svare med det.
// KASTER ALDRIG mod én tilmelding: fejler én, tælles den, og sessionen
// afsluttes ikke i denne kørsel.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { sessionTider } from "../_shared/webinarMotor/ur.ts";
import {
  budgetTilladerFremmoede,
  efterRettelse,
  fremmoedeDom,
  fremmoedeRettelse,
  PULS_OPBEVARING_DAGE,
  pulsGraenseMs,
  SENESTE_START_MS,
  sessionForGammel,
  sessionKlarTilDom,
  SET_PROCENT_KILDE_MOTOR,
} from "../_shared/webinarMotor/fremmoede.ts";
import { MOTOR_VERSION } from "../_shared/webinarMotor/svar.ts";
import { doemSetGrad, SET_GRAENSE_PROCENT, type SetGrad } from "../_shared/webinarDom.ts";
import { afgoerOvergang, byggFremmoede } from "../_shared/webinarHaendelser.ts";
import { erAfmeldt } from "../_shared/webinarAfmelding.ts";
import { sendHvisMail } from "../_shared/klaviyoAfsendelse.ts";
import { alarmerSvarMail, koerSvarMail, svarMailLaasAktiv } from "../_shared/webinarSvarMailKoersel.ts";
import { MAILGUN_SECRET } from "../_shared/mailgunAfsendelse.ts";
import { AFMELD_SECRET } from "../_shared/webinarAfmeldToken.ts";

const LOG = "[webinar-motor-cron]";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "session_id", "nu", "email"] as const;

/** Låsen. Fraværende = false — som webinar_mail_aktiv. */
export const LAAS_NOEGLE = "webinar_motor_aktiv";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BUNDT = 100;

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface SessionDom {
  session_id: string;
  intern: boolean;
  tilmeldte: number;
  moedt: number;
  set_75: number;
  rettet: number;
  overgange: { deltog: number; moedte_ikke: number; ingen: number };
  klaviyo_sendt: number;
  klaviyo_ikke_sendt: number;
  afmeldte_uden_haendelse: number;
  afsluttet: boolean;
}

export interface MotorResultat {
  motor: string;
  ok: boolean;
  dry_run: boolean;
  laas_aktiv: boolean;
  /** dry_run: false OG (låsen ELLER session_id på en intern session). */
  sender_rigtigt: boolean;
  nu: string;
  session_id: string | null;
  sessioner_aabne: number;
  /** Klar til dom (slut + margin) og inden for vinduet. */
  klar: number;
  ikke_klar: number;
  /** Ældre end DOM_VINDUE_DAGE og stadig ikke afholdt — et driftsfund. */
  for_gammel: number;
  sessioner: SessionDom[];
  /** Tilmeldinger, budgettet ikke nåede — næste kørsel. */
  udsat: number;
  budget: { seneste_start_ms: number; stoppet_af_budget: boolean; forloebet_ved_stop_ms: number | null };
  pulser: { opbevaring_dage: number; graense: string; at_slette: number | null; slettet: number | null };
  fejl: string[];
}

function tal(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function bundter<T>(liste: readonly T[]): T[][] {
  const ud: T[][] = [];
  for (let i = 0; i < liste.length; i += BUNDT) ud.push(liste.slice(i, i + BUNDT));
  return ud;
}

async function laasErAktiv(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await admin.from("app_config").select("config_value").eq("config_key", LAAS_NOEGLE).maybeSingle();
    const v = (data as { config_value?: unknown } | null)?.config_value;
    return v === true || v === "true";
  } catch (e) {
    console.error(`${LOG} kunne ikke læse låsen — fail-closed:`, e);
    return false;
  }
}

interface Tilmelding {
  id: string;
  ewebinar_id: string;
  email: string;
  webinar_id: string | null;
  webinar_titel: string | null;
  session_tid: string | null;
  state: string | null;
  sidste_action: string | null;
  subscribed: string | null;
  set_procent: number | string | null;
}

/** Dom over én session. Returnerer, om ALLE tilmeldinger blev dømt (så må sessionen afsluttes). */
async function doemSession(a: {
  admin: SupabaseClient;
  session: { id: string; intern: boolean; starter_at: string };
  nu: Date;
  senderRigtigt: boolean;
  startMs: number;
  r: MotorResultat;
}): Promise<SessionDom> {
  const { admin, session, nu, r } = a;
  const ud: SessionDom = {
    session_id: session.id, intern: session.intern, tilmeldte: 0, moedt: 0, set_75: 0, rettet: 0,
    overgange: { deltog: 0, moedte_ikke: 0, ingen: 0 }, klaviyo_sendt: 0, klaviyo_ikke_sendt: 0, afmeldte_uden_haendelse: 0, afsluttet: false,
  };
  let alleDoemt = true;

  const { data: tRaa, error: tFejl } = await admin
    .from("webinar_tilmeldinger")
    .select("id, ewebinar_id, email, webinar_id, webinar_titel, session_tid, state, sidste_action, subscribed, set_procent")
    .eq("kilde_system", "platform")
    .eq("session_id", session.id)
    .order("id", { ascending: true });
  if (tFejl) { r.fejl.push(`tilmeldinger (${session.id}): ${tFejl.message}`); return ud; }
  const tilmeldinger = (tRaa ?? []) as Tilmelding[];
  ud.tilmeldte = tilmeldinger.length;

  const { data: dRaa, error: dFejl } = await admin
    .from("webinar_deltagelser")
    .select("tilmelding_id, foerste_ind_at, set_procent")
    .eq("session_id", session.id);
  if (dFejl) { r.fejl.push(`deltagelser (${session.id}): ${dFejl.message}`); return ud; }
  const deltagelser = new Map<string, { foerste_ind_at: string | null; set_procent: number | string | null }>();
  for (const d of dRaa ?? []) deltagelser.set(d.tilmelding_id as string, { foerste_ind_at: (d.foerste_ind_at as string | null) ?? null, set_procent: d.set_procent as number | null });

  // Motorens hukommelse: den seneste grad, cronen selv har dømt pr. tilmelding.
  const { data: lRaa, error: lFejl } = await admin
    .from("webinar_motor_log")
    .select("tilmelding_id, data, tid")
    .eq("session_id", session.id)
    .eq("art", "fremmoede_dom")
    .order("tid", { ascending: true });
  if (lFejl) { r.fejl.push(`loggen (${session.id}): ${lFejl.message}`); return ud; }
  const sidsteGrad = new Map<string, SetGrad>();
  for (const l of lRaa ?? []) {
    const g = (l.data as { grad?: unknown } | null)?.grad;
    if (typeof g === "string") sidsteGrad.set(l.tilmelding_id as string, g as SetGrad);
  }

  // Husets egne afmeldinger (webinar_afmeldinger) — mailen er nøglen, begge lower.
  const afmeldte = new Set<string>();
  for (const b of bundter([...new Set(tilmeldinger.map((t) => t.email.trim().toLowerCase()))])) {
    const { data, error } = await admin.from("webinar_afmeldinger").select("email").in("email", b);
    if (error) { r.fejl.push(`afmeldinger: ${error.message}`); return ud; }
    for (const x of data ?? []) afmeldte.add((x.email as string).trim().toLowerCase());
  }

  const nuIso = nu.toISOString();
  for (const t of tilmeldinger) {
    // BUDGETTET: en ny tilmelding startes kun, hvis dens værste forløb når at slutte.
    const forloebet = Date.now() - a.startMs;
    if (r.budget.stoppet_af_budget || !budgetTilladerFremmoede(forloebet)) {
      if (!r.budget.stoppet_af_budget) { r.budget.stoppet_af_budget = true; r.budget.forloebet_ved_stop_ms = forloebet; }
      r.udsat++;
      alleDoemt = false;
      continue;
    }

    const d = deltagelser.get(t.id) ?? null;
    const f = fremmoedeDom(d, t);
    const ret = fremmoedeRettelse(t, f);
    const efter = efterRettelse(t, ret);
    const procentEfter = tal(efter.set_procent);
    const gradEfter = doemSetGrad({ set_procent: procentEfter, state: efter.state, session_tid: t.session_tid }, nu);
    if (gradEfter === "set" || gradEfter === "delvist") ud.moedt++;
    if (procentEfter !== null && procentEfter >= SET_GRAENSE_PROCENT) ud.set_75++;
    const gradFoer = sidsteGrad.get(t.id) ?? null;
    const afmeldt = afmeldte.has(t.email.trim().toLowerCase()) || erAfmeldt(t);
    const overgang = gradFoer === gradEfter ? "ingen" : afmeldt ? "ingen" : afgoerOvergang(gradFoer, gradEfter);
    if (gradFoer !== gradEfter) ud.overgange[overgang]++;
    if (afmeldt && gradFoer !== gradEfter) ud.afmeldte_uden_haendelse++;
    if (ret) ud.rettet++;

    // TØRKØRSEL (eller låst): tallene er regnet, intet skrives, intet sendes.
    if (!a.senderRigtigt) continue;

    // 1. Rækken — vagtet på den state, vi læste: en anden skriver vinder, og vi tager den næste kørsel.
    if (ret) {
      const saet: Record<string, unknown> = { ...ret, sidste_haendelse_at: nuIso };
      if (ret.set_procent !== undefined) saet.set_procent_kilde = SET_PROCENT_KILDE_MOTOR;
      let q = admin.from("webinar_tilmeldinger").update(saet).eq("id", t.id);
      q = t.state === null ? q.is("state", null) : q.eq("state", t.state);
      const { data: rk, error } = await q.select("id");
      if (error || !rk || rk.length !== 1) {
        r.fejl.push(`tilmelding ${t.id}: ${error?.message ?? `ramte ${rk?.length ?? 0} rækker (ændret imens)`}`);
        alleDoemt = false;
        continue;
      }
    }

    // 2. Klaviyo — kun ved en ny grad, og ad den eksisterende vej.
    if (gradFoer === gradEfter) continue;
    let klaviyo: string | null = null;
    const haendelse = byggFremmoede(overgang, {
      ewebinarId: t.ewebinar_id,
      email: t.email,
      grad: gradEfter,
      setProcent: procentEfter,
      webinarId: t.webinar_id,
      webinarTitel: t.webinar_titel,
      sessionTid: t.session_tid,
      tid: nu,
    });
    if (haendelse) {
      const s = await sendHvisMail(admin, haendelse);
      klaviyo = s.spor.udfald;
      if (s.sendt) ud.klaviyo_sendt++; else ud.klaviyo_ikke_sendt++;
    }

    // 3. Hukommelsen — EFTER afsendelsen. Aldrig mail eller navn i data (spec §C2).
    const { error: logFejl } = await admin.from("webinar_motor_log").insert({
      kilde: "cron",
      art: "fremmoede_dom",
      tilmelding_id: t.id,
      session_id: session.id,
      data: { grad: gradEfter, grad_foer: gradFoer, set_procent: procentEfter, overgang, klaviyo, afmeldt, motor: MOTOR_VERSION },
    });
    if (logFejl) {
      r.fejl.push(`loggen for ${t.id}: ${logFejl.message}`);
      alleDoemt = false;
    }
  }

  // 4. Sessionen er afholdt — kun når ALLE er dømt, og kun i en rigtig kørsel.
  if (a.senderRigtigt && alleDoemt) {
    const { data: s, error } = await admin
      .from("webinar_sessioner")
      .update({ status: "afholdt", afsluttet_at: nuIso })
      .eq("id", session.id)
      .in("status", ["planlagt", "aaben"])
      .select("id");
    if (error) {
      r.fejl.push(`sessionen ${session.id} kunne ikke afsluttes: ${error.message}`);
    } else if ((s ?? []).length === 1) {
      ud.afsluttet = true;
      const { error: lf } = await admin.from("webinar_motor_log").insert({
        kilde: "cron", art: "session_afsluttet", session_id: session.id,
        data: { tilmeldt: ud.tilmeldte, moedt: ud.moedt, set_75: ud.set_75, intern: session.intern, motor: MOTOR_VERSION },
      });
      if (lf) r.fejl.push(`loggen (session_afsluttet ${session.id}): ${lf.message}`);
    }
  }
  return ud;
}

async function koer(a: { admin: SupabaseClient; toerKoersel: boolean; laas: boolean; sessionId: string | null; nu: Date; startMs: number }): Promise<MotorResultat> {
  const nuMs = a.nu.getTime();
  const r: MotorResultat = {
    motor: MOTOR_VERSION, ok: true, dry_run: a.toerKoersel, laas_aktiv: a.laas, sender_rigtigt: false,
    nu: a.nu.toISOString(), session_id: a.sessionId, sessioner_aabne: 0, klar: 0, ikke_klar: 0, for_gammel: 0,
    sessioner: [], udsat: 0,
    budget: { seneste_start_ms: SENESTE_START_MS, stoppet_af_budget: false, forloebet_ved_stop_ms: null },
    pulser: { opbevaring_dage: PULS_OPBEVARING_DAGE, graense: new Date(pulsGraenseMs(nuMs)).toISOString(), at_slette: null, slettet: null },
    fejl: [],
  };

  // 1. De sessioner, der er begyndt og ikke afholdt/aflyst.
  let q = a.admin
    .from("webinar_sessioner")
    .select("id, webinar_id, starter_at, status, intern")
    .in("status", ["planlagt", "aaben"])
    .lte("starter_at", a.nu.toISOString());
  if (a.sessionId) q = q.eq("id", a.sessionId);
  const { data: sRaa, error: sFejl } = await q.order("starter_at", { ascending: true }).limit(200);
  if (sFejl) throw new Error(`webinar_sessioner: ${sFejl.message}`);
  const sessioner = (sRaa ?? []) as Array<{ id: string; webinar_id: string; starter_at: string; status: string; intern: boolean | null }>;
  r.sessioner_aabne = sessioner.length;

  // Prøven: session_id på en INTERN session åbner uden låsen (D2.7).
  const proeveIntern = a.sessionId !== null && sessioner.length === 1 && sessioner[0].intern === true;
  r.sender_rigtigt = !a.toerKoersel && (a.laas || proeveIntern);

  const webinarIds = [...new Set(sessioner.map((s) => s.webinar_id))];
  const webinarer = new Map<string, { varighed_sek: number; intro_sek: number; lobby_min: number; exitrum_min: number }>();
  if (webinarIds.length > 0) {
    const { data, error } = await a.admin.from("webinarer").select("id, varighed_sek, intro_sek, lobby_min, exitrum_min").in("id", webinarIds);
    if (error) throw new Error(`webinarer: ${error.message}`);
    for (const w of data ?? []) webinarer.set(w.id as string, w as { varighed_sek: number; intro_sek: number; lobby_min: number; exitrum_min: number });
  }

  for (const s of sessioner) {
    const w = webinarer.get(s.webinar_id);
    const starterMs = Date.parse(s.starter_at);
    if (!w || !Number.isFinite(starterMs)) { r.fejl.push(`sessionen ${s.id}: webinaret mangler`); continue; }
    if (sessionForGammel(starterMs, nuMs)) { r.for_gammel++; continue; }
    const tider = sessionTider({ starterMs, varighedSek: w.varighed_sek, introSek: w.intro_sek, lobbyMin: w.lobby_min, exitrumMin: w.exitrum_min });
    if (!sessionKlarTilDom(tider.exitrumSlutMs, nuMs)) { r.ikke_klar++; continue; }
    r.klar++;
    r.sessioner.push(await doemSession({ admin: a.admin, session: { id: s.id, intern: s.intern === true, starter_at: s.starter_at }, nu: a.nu, senderRigtigt: r.sender_rigtigt, startMs: a.startMs, r }));
  }

  // 2. OPBEVARINGEN — kun den globale kørsel (ikke prøven på én session), og kun med låsen.
  if (a.sessionId === null) {
    const graense = r.pulser.graense;
    if (!a.toerKoersel && a.laas) {
      const { count, error } = await a.admin.from("webinar_pulser").delete({ count: "exact" }).lt("modtaget_at", graense);
      if (error) r.fejl.push(`opbevaringen: ${error.message}`); else r.pulser.slettet = count ?? 0;
    } else {
      const { count, error } = await a.admin.from("webinar_pulser").select("id", { count: "exact", head: true }).lt("modtaget_at", graense);
      if (error) r.fejl.push(`opbevaringen (tælling): ${error.message}`); else r.pulser.at_slette = count ?? 0;
    }
  }

  r.ok = r.fejl.length === 0;
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startMs = Date.now();

  const auth = await authenticateServiceRole(req);
  if (auth instanceof Response) return auth;

  // En tom body er en tørkørsel — kald_edge sender altid '{}'.
  const raaBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ motor: MOTOR_VERSION, error: "ukendte_felter", besked }, 400);
  }

  const toerKoersel = raaBody.dry_run !== false;
  const sessionRaa = typeof raaBody.session_id === "string" ? raaBody.session_id.trim().toLowerCase() : null;
  if (sessionRaa !== null && !UUID.test(sessionRaa)) return json({ motor: MOTOR_VERSION, error: "session_id" }, 400);
  const harNu = typeof raaBody.nu === "string" && Number.isFinite(Date.parse(raaBody.nu));
  // `nu` flytter uret — kun i en tørkørsel: en rigtig dom på et falsk ur skriver en falsk sandhed.
  if (harNu && !toerKoersel) return json({ motor: MOTOR_VERSION, error: "nu_kun_i_toerkoersel" }, 400);
  const nu = harNu ? new Date(raaBody.nu as string) : new Date();
  // Svarpassets prøve til ÉN adresse (som webinar-mail-cron): sender uden låsen, kun dertil.
  if (raaBody.email !== undefined && !(typeof raaBody.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raaBody.email.trim()))) {
    return json({ motor: MOTOR_VERSION, error: "email" }, 400);
  }
  const proeveEmail = typeof raaBody.email === "string" ? raaBody.email.trim().toLowerCase() : null;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const laas = await laasErAktiv(admin);

  let r: MotorResultat | null = null;
  let vaeltet: string | null = null;
  try {
    r = await koer({ admin, toerKoersel, laas, sessionId: sessionRaa, nu, startMs });
    const doemte = r.sessioner.reduce((n, s) => n + s.tilmeldte, 0);
    console.log(`${LOG} ${r.dry_run ? "TØRKØRSEL" : r.sender_rigtigt ? "SKRIVER" : "LÅST"} — sessioner klar ${r.klar} (ikke klar ${r.ikke_klar}, for gamle ${r.for_gammel}), tilmeldinger ${doemte}, udsat ${r.udsat}, afsluttet ${r.sessioner.filter((s) => s.afsluttet).length}, pulser ${r.pulser.slettet ?? r.pulser.at_slette ?? "-"}, fejl ${r.fejl.length}`);
  } catch (err) {
    vaeltet = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, vaeltet);
  }

  // 5. SVAR PÅ MAIL — ISOLERET: efter fremmødet, egen lås, kaster aldrig, rører
  //    aldrig `r` (fremmødets ok/fejl/status); dets fejl står kun i svar_mail.fejl.
  const svarLaas = await svarMailLaasAktiv(admin);
  const svarMail = await koerSvarMail(admin, {
    toerKoersel, laas: svarLaas, proeveEmail, nu, startMs,
    mailgunNoegle: Deno.env.get(MAILGUN_SECRET),
    afmeldSecret: Deno.env.get(AFMELD_SECRET),
    afmeldBasis: `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/webinar-afmeld`,
  });
  // Alarmen på RIGTIG tid (body'ens `nu` flytter kun dommens ur) — og aldrig i tørkørslen (skalSvarMailAlarmere).
  await alarmerSvarMail(admin, svarMail, new Date());
  console.log(`${LOG} svar_mail ${svarMail.sender_rigtigt ? (svarMail.proeve ? "PRØVE" : "SENDER") : "TØR/LÅST"} — kandidater ${svarMail.kandidater}, skal ${svarMail.skal_sendes}, sendt ${svarMail.sendt}, sprunget ${svarMail.sprunget}, taget_imens ${svarMail.taget_imens}, fejlede ${svarMail.fejlede}, ukendte ${svarMail.ukendte}, udsat ${svarMail.udsat}, alarm ${svarMail.alarm}`);

  if (r === null) return json({ motor: MOTOR_VERSION, ok: false, dry_run: toerKoersel, nu: nu.toISOString(), fejl: [vaeltet], svar_mail: svarMail }, 500);
  return json({ ...r, svar_mail: svarMail });
});
