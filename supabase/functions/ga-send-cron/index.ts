// ga-send-cron — platformens afsendelse til Google Analytics 4 (Measurement Protocol).
// Udkast 21/9-2026 aften; samme form som meta-send-cron (#1069). Kører på minutterne
// 2,12,22,32,42,54 (migration 20260922011000 — de eneste ledige, se filhovedet dér).
//
// BESLUTTET (chatten 21/9, Jonas' fulde mandat; docs/tracking.md §1c/§1f/§1g) — hele
// designet og Googles citater står i _shared/gaSend.ts' filhoved: SELVSTÆNDIGT job
// (ansøgningens afsendelse er urørt), Bucket B, STRIKS-body, tørkørsel som standard,
// idempotent gennem sporet ga_haendelser (event_id unik — Google dedup'er IKKE selv),
// kun rækker med ga_client_id (= samtykke), kun inden for 72 timer, aldrig persondata.
//
// LÅSEN app_config.ga_send_aktiv (standard false) er bevisets: kørslen sender KUN med
// dry_run: false OG (låsen aktiv ELLER debug: true). «debug» rammer Googles
// valideringsserver, som ikke lander i rapporter — derfor tilladt uden lås.
//
// BODY (STRIKS): dry_run · nu · debug · ansoegning_id (kun den ene ansøgning — til beviset).
//
// KØRSLEN:
//   1. Låsen læses (app_config) — fail-closed: kan den ikke læses, er den lukket.
//   2. Kandidaterne: ansoegninger med ga_client_id sat og created_at ELLER indsendt_at
//      inden for 72 timer + lidt luft. KUN de elleve kolonner i RAEKKE_FELTER.
//   3. doem() pr. (ansøgning, art) → send eller sprunget med grund; sporet siger, hvad der
//      allerede er sendt eller afvist (maaForsoeges). Intet forsøgsloft — vinduet er loftet.
//   4. Tørkørsel: svaret bærer ville_sende (event_id, art, event_time, kan_joines) og
//      sprunget pr. grund. Ingen client_id, intet session_id i svaret.
//   5. Rigtig kørsel: én hændelse pr. kald, sekventielt inden for BUDGET_MS. Payloaden går
//      gennem findForbudteNoegler FØR afsendelsen (500 payload_afvist frem for et læk), og
//      sporet skrives efter hvert kald (upsert på event_id).
//   6. Alarm (princip 1): fejlede > 0 i en rigtig kørsel → én mail pr. døgn til driftModtager
//      + drift-klokke (reference_type "ga_haendelser"). Klokke-mail-udkastet skal have
//      «ga_haendelser» på SELVMAILENDE_REFERENCER, når begge er i drift (README).
//
// KASTER ALDRIG mod én hændelse. Vælter hele kørslen, er svaret 500 med grunden.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { sendManagedEmail } from "../_shared/managedEmail.ts";
import { driftModtager } from "../_shared/driftModtager.ts";
import { indgangsMailHtml } from "../_shared/indgangsMail.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { sendTilGa } from "../_shared/gaSendAfsendelse.ts";
import {
  ALARM_KLOKKE_TYPE, ALARM_MAIL_LABEL, alarmNoegle, alarmTekst, type AnsoegningTilGa, type Art, ARTER, bygPayload, doem,
  eventId, type FejletAfsendelse, findForbudteNoegler, GA_MEASUREMENT_ID, GA_SEND_LAAS_NOEGLE, GA_VINDUE_TIMER,
  kanJoines, laasErAktiv, maaForsoeges, senderRigtigt, type SporRaekke, type SprungetGrund,
} from "../_shared/gaSend.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[ga-send-cron]";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "nu", "debug", "ansoegning_id"] as const;
/** Tidsbudget under cron-timeouten (60 s); hvert Google-kald op til 8 s. */
export const BUDGET_MS = 45_000;
const SIDE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAEKKE_FELTER = "id, created_at, indsendt_at, ga_client_id, ga_session_id, kilde, utm_source, utm_medium, utm_campaign, utm_content, utm_term";

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Plan { event_id: string; ansoegning_id: string; art: Art; event_time: string; kan_joines: boolean; forsoeg: number }

export interface GaSendResultat {
  ok: boolean;
  dry_run: boolean;
  /** app_config.ga_send_aktiv som læst (fail-closed). */
  laas_aktiv: boolean;
  debug: boolean;
  /** dry_run: false OG (låsen ELLER debug). */
  sender_rigtigt: boolean;
  maalings_id: string;
  ansoegning_id: string | null;
  nu: string;
  kandidater: number;
  ville_sende: Plan[];
  sprunget: Record<SprungetGrund | "allerede_sendt" | "ugyldig", number>;
  sendt: number;
  fejlede: number;
  fejlede_liste: FejletAfsendelse[];
  /** Sendt, men ældre end 48 timer: tælles og kan ikke længere joines med besøget. */
  for_sent_til_join: number;
  udsat: number;
  /** ingen · toerkoersel · sendt · allerede_sendt_i_dag · fejlet: <grund>. */
  alarm: string;
  fejl: string[];
}

function tomt(a: { toer: boolean; laas: boolean; debug: boolean; id: string | null; nu: Date }): GaSendResultat {
  return {
    ok: true, dry_run: a.toer, laas_aktiv: a.laas, debug: a.debug,
    sender_rigtigt: senderRigtigt({ dryRun: a.toer, laasAktiv: a.laas, debug: a.debug }),
    maalings_id: GA_MEASUREMENT_ID, ansoegning_id: a.id, nu: a.nu.toISOString(), kandidater: 0, ville_sende: [],
    sprunget: { ingen_ga_client_id: 0, ikke_indsendt: 0, ingen_tidspunkt: 0, for_gammel: 0, allerede_sendt: 0, ugyldig: 0 },
    sendt: 0, fejlede: 0, fejlede_liste: [], for_sent_til_join: 0, udsat: 0, alarm: "ingen", fejl: [],
  };
}

/** Låsen — fail-closed. */
async function hentLaas(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.from("app_config").select("config_value").eq("config_key", GA_SEND_LAAS_NOEGLE).maybeSingle();
  if (error) { console.error(`${LOG} app_config (${GA_SEND_LAAS_NOEGLE}) kunne ikke læses — låsen er lukket:`, error.message); return false; }
  return laasErAktiv((data as { config_value?: unknown } | null)?.config_value ?? null);
}

/** Kandidaterne i vinduet (+ 1 dags luft; dommen afgør præcist), side for side. KUN de elleve kolonner. */
async function hentKandidater(admin: SupabaseClient, nu: Date, ansoegningId: string | null): Promise<AnsoegningTilGa[]> {
  if (ansoegningId) {
    const { data, error } = await admin.from("ansoegninger").select(RAEKKE_FELTER).eq("id", ansoegningId).maybeSingle();
    if (error) throw new Error(`ansoegninger: ${error.message}`);
    return data ? [data as unknown as AnsoegningTilGa] : [];
  }
  const fra = new Date(nu.getTime() - (GA_VINDUE_TIMER + 24) * 3_600_000).toISOString();
  const ud: AnsoegningTilGa[] = [];
  for (let start = 0; ; start += SIDE) {
    const { data, error } = await admin.from("ansoegninger").select(RAEKKE_FELTER)
      .or(`created_at.gte.${fra},indsendt_at.gte.${fra}`)
      .not("ga_client_id", "is", null)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(start, start + SIDE - 1);
    if (error) throw new Error(`ansoegninger: ${error.message}`);
    const rk = (data ?? []) as unknown as AnsoegningTilGa[];
    ud.push(...rk);
    if (rk.length < SIDE) return ud;
  }
}

async function hentSpor(admin: SupabaseClient, eventIds: string[]): Promise<Map<string, SporRaekke>> {
  const ud = new Map<string, SporRaekke>();
  for (let i = 0; i < eventIds.length; i += 500) {
    const { data, error } = await admin.from("ga_haendelser").select("event_id, udfald, forsoeg").in("event_id", eventIds.slice(i, i + 500));
    if (error) throw new Error(`ga_haendelser: ${error.message}`);
    for (const r of (data ?? []) as SporRaekke[]) ud.set(r.event_id, r);
  }
  return ud;
}

/** Alarmen: én mail pr. dansk døgn (loggen slås op først) + drift-klokke. */
async function skrivAlarm(admin: SupabaseClient, fejlede: readonly FejletAfsendelse[], nu: Date, r: GaSendResultat): Promise<void> {
  const noegle = alarmNoegle(nu);
  const tekst = alarmTekst(fejlede, nu);
  try {
    const { data: fandtes, error: opslagFejl } = await admin.from("email_send_log").select("message_id").eq("message_id", noegle).limit(1);
    if (opslagFejl) throw new Error(`email_send_log: ${opslagFejl.message}`);
    if ((fandtes ?? []).length > 0) {
      r.alarm = "allerede_sendt_i_dag";
    } else {
      const html = indgangsMailHtml({ eyebrow: "Drift · Google Analytics", overskrift: tekst.emne, afsnit: tekst.afsnit, blokke: tekst.blokke, hilsen: "The Boardroom" });
      const res = await sendManagedEmail({
        adminClient: admin,
        // Driftsalarmen går til driftModtager — ét sted (driftModtager.ts), ikke til rådgiveradressen.
        to: driftModtager(),
        subject: tekst.emne, html, text: tekst.tekst, label: ALARM_MAIL_LABEL, idempotencyKey: noegle,
        metadata: { fejlede: fejlede.length, nu: nu.toISOString() },
      });
      r.alarm = res.sent ? "sendt" : `fejlet: ${res.reason}`;
      if (res.sent === false) console.error(`${LOG} alarmmailen blev ikke sendt: ${res.reason}`);
    }
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    r.alarm = `fejlet: ${grund}`;
    r.fejl.push(`alarm: ${grund}`);
    console.error(`${LOG} alarmmailen kastede:`, grund);
  }
  const skrevet = await skrivRaadgiverBesked(admin, { type: ALARM_KLOKKE_TYPE, title: tekst.titel, body: tekst.tekst.slice(0, 2000), reference_type: "ga_haendelser", reference_id: null });
  if (skrevet.fejl.length > 0) r.fejl.push(`alarm_klokke: ${skrevet.fejl.join("; ")}`);
}

export async function koerGaSend(
  admin: SupabaseClient,
  a: { toerKoersel: boolean; nu: Date; debug: boolean; ansoegningId: string | null; startMs: number },
): Promise<{ status: number; resultat: GaSendResultat }> {
  const laas = await hentLaas(admin);
  const r = tomt({ toer: a.toerKoersel, laas, debug: a.debug, id: a.ansoegningId, nu: a.nu });

  const kandidater = await hentKandidater(admin, a.nu, a.ansoegningId);
  r.kandidater = kandidater.length;
  const alleIds = kandidater.flatMap((k) => ARTER.map((art) => eventId(k.id, art)));
  const spor = await hentSpor(admin, alleIds);

  const planer: { plan: Plan; raekke: AnsoegningTilGa; tid: Date }[] = [];
  for (const k of kandidater) {
    for (const art of ARTER) {
      const d = doem(k, art, a.nu);
      if (!d.ok) { r.sprunget[d.grund]++; continue; }
      const id = eventId(k.id, art);
      const m = maaForsoeges(spor.get(id) ?? null);
      if (!m.ok) { r.sprunget[m.grund]++; continue; }
      planer.push({ plan: { event_id: id, ansoegning_id: k.id, art, event_time: d.tid.toISOString(), kan_joines: kanJoines(d.tid, a.nu), forsoeg: (spor.get(id)?.forsoeg ?? 0) + 1 }, raekke: k, tid: d.tid });
    }
  }
  r.ville_sende = planer.map((p) => p.plan);

  if (!r.sender_rigtigt) return { status: 200, resultat: r };

  for (const p of planer) {
    if (Date.now() - a.startMs > BUDGET_MS) { r.udsat++; continue; }
    const payload = bygPayload(p.raekke, p.plan.art, p.tid);
    const forbudte = findForbudteNoegler(payload);
    if (forbudte.length > 0) {
      console.error(`${LOG} PAYLOAD AFVIST — persondata i det, der skulle sendes:`, forbudte.join(", "));
      r.ok = false; r.fejl.push(`payload_afvist: ${forbudte.join(", ")}`);
      return { status: 500, resultat: r };
    }
    const svar = await sendTilGa(payload, a.debug);
    const { error } = await admin.from("ga_haendelser").upsert({
      event_id: p.plan.event_id, ansoegning_id: p.plan.ansoegning_id, art: p.plan.art, event_time: p.plan.event_time,
      udfald: svar.udfald, forsoeg: p.plan.forsoeg, sidste_forsoeg_at: a.nu.toISOString(), sendt_at: svar.udfald === "sendt" ? a.nu.toISOString() : null,
      status: svar.status, validering: svar.validering, svar: svar.svar, fejl: svar.fejl, debug: a.debug, varighed_ms: svar.varighed_ms,
    }, { onConflict: "event_id" });
    if (error) { r.fejl.push(`spor ${p.plan.event_id}: ${error.message}`); console.error(`${LOG} SPOR IKKE SKREVET for ${p.plan.event_id}:`, error.message); }
    if (svar.udfald === "sendt") {
      r.sendt++;
      if (!p.plan.kan_joines) r.for_sent_til_join++;
    } else {
      r.fejlede++;
      r.fejlede_liste.push({ event_id: p.plan.event_id, udfald: svar.udfald, fejl: svar.fejl, forsoeg: p.plan.forsoeg });
    }
  }

  if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);
  r.ok = r.fejl.length === 0;
  return { status: r.ok ? 200 : 500, resultat: r };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;
  const startMs = Date.now();

  let raaBody: Record<string, unknown> | null = null;
  try { raaBody = (await req.json()) as Record<string, unknown>; } catch { /* ingen body = tørkørsel */ }
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ ok: false, fejl: [besked] }, 400);
  }
  const toerKoersel = raaBody?.dry_run !== false;
  let nu = new Date();
  if (typeof raaBody?.nu === "string") {
    const t = new Date(raaBody.nu);
    if (Number.isNaN(t.getTime())) return json({ ok: false, fejl: [`«nu» er ikke en dato: ${raaBody.nu}`] }, 400);
    nu = t;
  }
  if (raaBody?.debug !== undefined && typeof raaBody.debug !== "boolean") {
    return json({ ok: false, fejl: ["«debug» skal være true eller false (true = Googles valideringsserver, som ikke lander i rapporter)"] }, 400);
  }
  const debug = raaBody?.debug === true;
  let ansoegningId: string | null = null;
  if (raaBody?.ansoegning_id !== undefined && raaBody?.ansoegning_id !== null) {
    if (typeof raaBody.ansoegning_id !== "string" || !UUID.test(raaBody.ansoegning_id)) return json({ ok: false, fejl: ["«ansoegning_id» skal være en uuid"] }, 400);
    ansoegningId = raaBody.ansoegning_id;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let svar: { status: number; resultat: GaSendResultat };
  try {
    svar = await koerGaSend(admin, { toerKoersel, nu, debug, ansoegningId, startMs });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, grund);
    return json({ ok: false, dry_run: toerKoersel, nu: nu.toISOString(), fejl: [grund] }, 500);
  }
  console.log(`${LOG} Summary:`, JSON.stringify({ ...svar.resultat, ville_sende: svar.resultat.ville_sende.length, fejlede_liste: svar.resultat.fejlede_liste.length }));
  return json(svar.resultat, svar.status);
});
