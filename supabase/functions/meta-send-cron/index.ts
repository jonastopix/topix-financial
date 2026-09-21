// meta-send-cron — platformens afsendelse til Metas Conversions API (udkast 21/9-2026
// aften, HASTER: webinar 22/9 kl. 09). Hvert 5. minut på minutterne 3,8,13,18,23,28,
// 38,43,48,53,58 (migration 20260921235500 — :33 er meta-annoncer/-vagt kl. 03/04).
//
// BESLUTTET (Jonas 21/9 aften) — hele designet står i _shared/metaSend.ts' filhoved:
// SELVSTÆNDIGT job (ansøgningens afsendelse er urørt), Bucket B, STRIKS-body,
// tørkørsel som standard, idempotent gennem sporet meta_haendelser (event_id unik),
// kun hændelser inden for Metas 7-dagesvindue, aldrig persondata i payloaden.
//
// LÅSEN app_config.meta_send_aktiv (standard false) — besluttet af Jonas 21/9-2026:
// ingen jurist; låsen er bevisets, ikke juraens. Kørslen sender for alvor KUN med
// dry_run: false OG (låsen aktiv ELLER en test_event_code i body). I aften: først én
// hændelse med test_event_code + ansoegning_id → Metas Test events; står den rigtigt,
// slås låsen til med én SQL (README), og cronen sender resten fra samme aften.
// BEMÆRK Metas ord: «Events sent with test_event_code are not dropped. They flow into
// Events Manager and are used for targeting and ads measurement purposes.» — beviset er
// en RIGTIG hændelse og står i sporet som sendt (med koden), så den aldrig sendes igen.
//
// BODY (STRIKS): dry_run · nu · test_event_code · ansoegning_id (kun den ene ansøgning —
// til beviset). Alt andet afvises med 400.
//
// KØRSLEN:
//   1. Låsen læses (app_config) — fail-closed: kan den ikke læses, er den lukket.
//   2. Kandidaterne: ansoegninger med created_at ELLER indsendt_at inden for 7 dage +
//      lidt luft, KUN kolonnerne id, created_at, indsendt_at, fbclid, landing, user_agent.
//      Dommen (doem) siger pr. (ansøgning, started/submitted): send, eller sprunget over
//      med grund. Sporet siger, hvad der allerede er sendt eller ugyldigt (maaForsoeges) —
//      intet forsøgsloft: ingen_noegle/fejl/timeout prøves igen ved hver kørsel, til «for_gammel».
//   3. Tørkørsel: svaret bærer ville_sende (event_id, art, event_time, fbc-præfiks —
//      aldrig user agent eller fbclid i klartekst) og sprunget pr. grund.
//   4. Rigtig kørsel: én hændelse pr. kald (sendTilMeta), sekventielt inden for
//      BUDGET_MS; sporet skrives FØR svaret (upsert på event_id: udfald, forsoeg,
//      status, svar, fejl, test_event_code, sendt_at). Payloaden går gennem
//      findForbudteNoegler før afsendelsen — 500 svar_afvist frem for et læk.
//   5. Alarm (princip 1): fejlede > 0 i en rigtig kørsel → én mail pr. døgn til
//      driftModtager (email_send_log slås op først) + drift-klokke (skrivRaadgiverBesked,
//      reference_type "meta_haendelser"). Klokke-mail-udkastet skal have
//      «meta_haendelser» på SELVMAILENDE_REFERENCER, når begge lander (README).
//
// KASTER ALDRIG mod én hændelse: fejler én, tælles den, og de andre sendes. Vælter hele
// kørslen (databasen væk), er svaret 500 med grunden.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { sha256Hex } from "../_shared/aftryk.ts";
import { sendManagedEmail } from "../_shared/managedEmail.ts";
import { driftModtager } from "../_shared/driftModtager.ts";
import { indgangsMailHtml } from "../_shared/indgangsMail.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { sendTilMeta } from "../_shared/metaSendAfsendelse.ts";
import {
  ALARM_KLOKKE_TYPE, ALARM_MAIL_LABEL, alarmNoegle, alarmTekst, type AnsoegningTilMeta, type Art, ARTER, bygPayload, doem,
  erTestEventCode, eventId, type FejletAfsendelse, findForbudteNoegler, laasErAktiv, maaForsoeges, META_SEND_LAAS_NOEGLE,
  META_VINDUE_DAGE, senderRigtigt, type SporRaekke, type SprungetGrund,
} from "../_shared/metaSend.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[meta-send-cron]";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "nu", "test_event_code", "ansoegning_id"] as const;
/** Tidsbudget under cron-timeouten (60 s); hvert Meta-kald op til 8 s. */
export const BUDGET_MS = 45_000;
const SIDE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAEKKE_FELTER = "id, created_at, indsendt_at, fbclid, landing, user_agent";

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Plan { event_id: string; ansoegning_id: string; art: Art; event_time: string; fbc_praefiks: string; forsoeg: number }

export interface MetaSendResultat {
  ok: boolean;
  dry_run: boolean;
  /** app_config.meta_send_aktiv som læst (fail-closed). */
  laas_aktiv: boolean;
  /** dry_run: false OG (låsen ELLER testkoden). */
  sender_rigtigt: boolean;
  test_event_code: string | null;
  ansoegning_id: string | null;
  nu: string;
  kandidater: number;
  ville_sende: Plan[];
  sprunget: Record<SprungetGrund | "allerede_sendt" | "ugyldig", number>;
  sendt: number;
  fejlede: number;
  fejlede_liste: FejletAfsendelse[];
  udsat: number;
  /** ingen · toerkoersel · sendt · allerede_sendt_i_dag · fejlet: <grund>. */
  alarm: string;
  fejl: string[];
}

function tomt(a: { toer: boolean; laas: boolean; test: string | null; id: string | null; nu: Date }): MetaSendResultat {
  return {
    ok: true, dry_run: a.toer, laas_aktiv: a.laas, sender_rigtigt: senderRigtigt({ dryRun: a.toer, laasAktiv: a.laas, testEventCode: a.test }),
    test_event_code: a.test, ansoegning_id: a.id, nu: a.nu.toISOString(), kandidater: 0, ville_sende: [],
    sprunget: { ingen_fbclid: 0, ingen_user_agent: 0, ingen_landing: 0, ikke_indsendt: 0, ingen_tidspunkt: 0, for_gammel: 0, allerede_sendt: 0, ugyldig: 0 },
    sendt: 0, fejlede: 0, fejlede_liste: [], udsat: 0, alarm: "ingen", fejl: [],
  };
}

/** Låsen — fail-closed. */
async function hentLaas(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.from("app_config").select("config_value").eq("config_key", META_SEND_LAAS_NOEGLE).maybeSingle();
  if (error) { console.error(`${LOG} app_config (${META_SEND_LAAS_NOEGLE}) kunne ikke læses — låsen er lukket:`, error.message); return false; }
  return laasErAktiv((data as { config_value?: unknown } | null)?.config_value ?? null);
}

/** Kandidaterne i vinduet (+ 1 dags luft; dommen afgør præcist), side for side. KUN de seks kolonner. */
async function hentKandidater(admin: SupabaseClient, nu: Date, ansoegningId: string | null): Promise<AnsoegningTilMeta[]> {
  if (ansoegningId) {
    const { data, error } = await admin.from("ansoegninger").select(RAEKKE_FELTER).eq("id", ansoegningId).maybeSingle();
    if (error) throw new Error(`ansoegninger: ${error.message}`);
    return data ? [data as unknown as AnsoegningTilMeta] : [];
  }
  const fra = new Date(nu.getTime() - (META_VINDUE_DAGE + 1) * 86_400_000).toISOString();
  const ud: AnsoegningTilMeta[] = [];
  for (let start = 0; ; start += SIDE) {
    const { data, error } = await admin.from("ansoegninger").select(RAEKKE_FELTER)
      .or(`created_at.gte.${fra},indsendt_at.gte.${fra}`)
      .not("fbclid", "is", null)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(start, start + SIDE - 1);
    if (error) throw new Error(`ansoegninger: ${error.message}`);
    const rk = (data ?? []) as unknown as AnsoegningTilMeta[];
    ud.push(...rk);
    if (rk.length < SIDE) return ud;
  }
}

async function hentSpor(admin: SupabaseClient, eventIds: string[]): Promise<Map<string, SporRaekke>> {
  const ud = new Map<string, SporRaekke>();
  for (let i = 0; i < eventIds.length; i += 500) {
    const { data, error } = await admin.from("meta_haendelser").select("event_id, udfald, forsoeg").in("event_id", eventIds.slice(i, i + 500));
    if (error) throw new Error(`meta_haendelser: ${error.message}`);
    for (const r of (data ?? []) as SporRaekke[]) ud.set(r.event_id, r);
  }
  return ud;
}

/** Alarmen: én mail pr. dansk døgn (loggen slås op først) + drift-klokke. */
async function skrivAlarm(admin: SupabaseClient, fejlede: readonly FejletAfsendelse[], nu: Date, r: MetaSendResultat): Promise<void> {
  const noegle = alarmNoegle(nu);
  const tekst = alarmTekst(fejlede, nu);
  try {
    const { data: fandtes, error: opslagFejl } = await admin.from("email_send_log").select("message_id").eq("message_id", noegle).limit(1);
    if (opslagFejl) throw new Error(`email_send_log: ${opslagFejl.message}`);
    if ((fandtes ?? []).length > 0) {
      r.alarm = "allerede_sendt_i_dag";
    } else {
      const html = indgangsMailHtml({ eyebrow: "Drift · Meta", overskrift: tekst.emne, afsnit: tekst.afsnit, blokke: tekst.blokke, hilsen: "The Boardroom" });
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
  const skrevet = await skrivRaadgiverBesked(admin, { type: ALARM_KLOKKE_TYPE, title: tekst.titel, body: tekst.tekst.slice(0, 2000), reference_type: "meta_haendelser", reference_id: null });
  if (skrevet.fejl.length > 0) r.fejl.push(`alarm_klokke: ${skrevet.fejl.join("; ")}`);
}

export async function koerMetaSend(
  admin: SupabaseClient,
  a: { toerKoersel: boolean; nu: Date; testEventCode: string | null; ansoegningId: string | null; startMs: number },
): Promise<{ status: number; resultat: MetaSendResultat }> {
  const laas = await hentLaas(admin);
  const r = tomt({ toer: a.toerKoersel, laas, test: a.testEventCode, id: a.ansoegningId, nu: a.nu });

  const kandidater = await hentKandidater(admin, a.nu, a.ansoegningId);
  r.kandidater = kandidater.length;
  const alleIds = kandidater.flatMap((k) => ARTER.map((art) => eventId(k.id, art)));
  const spor = await hentSpor(admin, alleIds);

  // Dommen pr. (ansøgning, art) — og sporets ord om det, der allerede er sendt eller er ugyldigt.
  const planer: { plan: Plan; raekke: AnsoegningTilMeta; tid: Date }[] = [];
  for (const k of kandidater) {
    for (const art of ARTER) {
      const d = doem(k, art, a.nu);
      if (!d.ok) { r.sprunget[d.grund]++; continue; }
      const id = eventId(k.id, art);
      const m = maaForsoeges(spor.get(id) ?? null);
      if (!m.ok) { r.sprunget[m.grund]++; continue; }
      planer.push({ plan: { event_id: id, ansoegning_id: k.id, art, event_time: d.tid.toISOString(), fbc_praefiks: `fb.1.${Date.parse(k.created_at)}.…`, forsoeg: (spor.get(id)?.forsoeg ?? 0) + 1 }, raekke: k, tid: d.tid });
    }
  }
  r.ville_sende = planer.map((p) => p.plan);

  if (!r.sender_rigtigt) return { status: 200, resultat: r };

  for (const p of planer) {
    if (Date.now() - a.startMs > BUDGET_MS) { r.udsat++; continue; }
    const payload = bygPayload(p.raekke, p.plan.art, p.tid, await sha256Hex(p.raekke.id));
    const forbudte = findForbudteNoegler(payload);
    if (forbudte.length > 0) {
      console.error(`${LOG} SVAR AFVIST — persondata i payloaden:`, forbudte.join(", "));
      r.ok = false; r.fejl.push(`payload_afvist: ${forbudte.join(", ")}`);
      return { status: 500, resultat: r };
    }
    const svar = await sendTilMeta(payload, a.testEventCode);
    const { error } = await admin.from("meta_haendelser").upsert({
      event_id: p.plan.event_id, ansoegning_id: p.plan.ansoegning_id, art: p.plan.art, event_time: p.plan.event_time,
      udfald: svar.udfald, forsoeg: p.plan.forsoeg, sidste_forsoeg_at: a.nu.toISOString(), sendt_at: svar.udfald === "sendt" ? a.nu.toISOString() : null,
      status: svar.status, events_received: svar.events_received, svar: svar.svar, fejl: svar.fejl, test_event_code: a.testEventCode, varighed_ms: svar.varighed_ms,
    }, { onConflict: "event_id" });
    if (error) { r.fejl.push(`spor ${p.plan.event_id}: ${error.message}`); console.error(`${LOG} SPOR IKKE SKREVET for ${p.plan.event_id}:`, error.message); }
    if (svar.udfald === "sendt") r.sendt++;
    else { r.fejlede++; r.fejlede_liste.push({ event_id: p.plan.event_id, udfald: svar.udfald, fejl: svar.fejl, forsoeg: p.plan.forsoeg }); }
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
  let testEventCode: string | null = null;
  if (raaBody?.test_event_code !== undefined && raaBody?.test_event_code !== null) {
    if (!erTestEventCode(raaBody.test_event_code)) return json({ ok: false, fejl: ["«test_event_code» skal være 4–40 bogstaver/tal (Events Manager → Test events)"] }, 400);
    testEventCode = raaBody.test_event_code;
  }
  let ansoegningId: string | null = null;
  if (raaBody?.ansoegning_id !== undefined && raaBody?.ansoegning_id !== null) {
    if (typeof raaBody.ansoegning_id !== "string" || !UUID.test(raaBody.ansoegning_id)) return json({ ok: false, fejl: ["«ansoegning_id» skal være en uuid"] }, 400);
    ansoegningId = raaBody.ansoegning_id;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let svar: { status: number; resultat: MetaSendResultat };
  try {
    svar = await koerMetaSend(admin, { toerKoersel, nu, testEventCode, ansoegningId, startMs });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, grund);
    return json({ ok: false, dry_run: toerKoersel, nu: nu.toISOString(), fejl: [grund] }, 500);
  }
  console.log(`${LOG} Summary:`, JSON.stringify({ ...svar.resultat, ville_sende: svar.resultat.ville_sende.length, fejlede_liste: svar.resultat.fejlede_liste.length }));
  return json(svar.resultat, svar.status);
});
