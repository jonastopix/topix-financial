/**
 * metaTilmeldingKoersel — tilmeldingspasset i meta-send-cron (udkast 3/10-2026, docs/webinarmotor.md
 * §7.9). Dommen er REN i metaTilmelding.ts; her bor læsningen, sporet og løkken.
 *
 * ISOLERET (CTO 3/10, HØJ): en fejl her står KUN i `tilmeldinger.fejl` — aldrig i kørslens
 * fejl, alarm eller HTTP-status. Ansøgningernes svar er de samme som uden passet.
 *
 * AFSENDELSEN GIVES IND (`send`): denne fil importerer IKKE metaSendAfsendelse.ts og læser
 * ingen secret. META_SEND_TOKEN læses stadig ét sted (metaTokenAdskillelse.guard dom 6;
 * webinarTilmeldMeta.guard dom 5).
 *
 * LÆSER KUN: webinar_tilmeldinger (de kolonner, TILMELDING_FELTER nævner), webinar_afmeldinger
 * (email), ansoegninger (email, KUN rækker med meta_fravalg = true), meta_haendelser og
 * app_config. SKRIVER KUN: meta_haendelser — og kun når tilmeldingSenderRigtigt siger ja.
 * PORTEN FØRST: intet andet end låsens række læses, før porten er «klar» (CTO 3/10).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { sha256Hex } from "./aftryk.ts";
import {
  bygFbpFelt, findForbudteNoegler, maaForsoeges, type MetaPayload, META_VINDUE_DAGE, type SporRaekke, type SporUdfald,
} from "./metaSend.ts";
import {
  bygTilmeldingPayload, doemTilmelding, hashTilmeldingBrugerdata, normaliserTilmeldingBrugerdata, TILMELDING_ART,
  tilmeldingBrugerdataNoegler, tilmeldingEventId, tilmeldingFbcKilde, type TilmeldingPlan, type TilmeldingResultat,
  laesWebinarLaas, tilmeldingSenderRigtigt, type TilmeldingPort, type TilmeldingTilMeta, tomtTilmeldingResultat, WEBINAR_META_LAAS_NOEGLE,
} from "./metaTilmelding.ts";

const LOG = "[meta-send-cron/tilmeldinger]";
const SIDE = 1000;
const BUNDT = 300;

/**
 * KUN disse kolonner. raa læses som to tekststier (intern, via) — aldrig hele raa. E-mail og
 * fornavn læses for ÉT formål: at blive normaliseret og hashet af metaTilmelding.ts.
 * ip_dagshash, navn, utm_* og ga_client_id hentes aldrig.
 */
export const TILMELDING_FELTER =
  "id, kilde_system, intern:raa->>intern, via:raa->>via, registreret_at, email, fornavn, fbclid, fbp, fbc_cookie, origin, user_agent";

/** Afsendelsens form — strukturelt samme som metaSendAfsendelse.ts' sendTilMeta. */
export type Sender = (payload: MetaPayload, testEventCode: string | null) => Promise<{
  udfald: SporUdfald; status: number | null; events_received: number | null; fejl: string | null; svar: string | null; varighed_ms: number;
}>;

type RaaTilmelding = Omit<TilmeldingTilMeta, "afmeldt" | "fravalgt">;
export interface TilmeldingPlanRaekke { plan: TilmeldingPlan; raekke: TilmeldingTilMeta; tid: Date }

const bundter = <T>(a: readonly T[]): T[][] => {
  const ud: T[][] = [];
  for (let i = 0; i < a.length; i += BUNDT) ud.push(a.slice(i, i + BUNDT));
  return ud;
};
const lav = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/** Låsen + porten — fail-closed: kan den ikke læses, eller er rækken fraværende, er den lukket. */
async function hentWebinarLaas(admin: SupabaseClient): Promise<{ port: TilmeldingPort; aaben: boolean }> {
  const { data, error } = await admin.from("app_config").select("config_value").eq("config_key", WEBINAR_META_LAAS_NOEGLE).maybeSingle();
  if (error) console.error(`${LOG} app_config (${WEBINAR_META_LAAS_NOEGLE}) kunne ikke læses — låsen er lukket:`, error.message);
  return laesWebinarLaas({ fejl: !!error, raekke: (data as { config_value?: unknown } | null) ?? null });
}

async function hentRaa(admin: SupabaseClient, nu: Date, tilmeldingId: string | null): Promise<RaaTilmelding[]> {
  if (tilmeldingId) {
    const { data, error } = await admin.from("webinar_tilmeldinger").select(TILMELDING_FELTER).eq("id", tilmeldingId).maybeSingle();
    if (error) throw new Error(`webinar_tilmeldinger: ${error.message}`);
    return data ? [data as unknown as RaaTilmelding] : [];
  }
  const fra = new Date(nu.getTime() - (META_VINDUE_DAGE + 1) * 86_400_000).toISOString();
  const ud: RaaTilmelding[] = [];
  for (let start = 0; ; start += SIDE) {
    const { data, error } = await admin.from("webinar_tilmeldinger").select(TILMELDING_FELTER)
      .eq("kilde_system", "platform").gte("registreret_at", fra)
      .order("registreret_at", { ascending: true }).order("id", { ascending: true })
      .range(start, start + SIDE - 1);
    if (error) throw new Error(`webinar_tilmeldinger: ${error.message}`);
    const rk = (data ?? []) as unknown as RaaTilmelding[];
    ud.push(...rk);
    if (rk.length < SIDE) break;
  }
  return ud;
}

/** Husets afmeldinger — mailen er nøglen, begge lower (webinar_afmeldinger har CHECK email = lower(email)). */
async function hentAfmeldte(admin: SupabaseClient, emails: readonly string[]): Promise<Set<string>> {
  const ud = new Set<string>();
  for (const b of bundter(emails)) {
    const { data, error } = await admin.from("webinar_afmeldinger").select("email").in("email", b);
    if (error) throw new Error(`webinar_afmeldinger: ${error.message}`);
    for (const x of (data ?? []) as { email: string }[]) ud.add(lav(x.email));
  }
  return ud;
}

/**
 * Fravalget: KUN kandidaternes mails (CTO 3/10, LAV) — ansoegninger har CHECK
 * (email = lower(email)) (20260918200000), og kandidaternes mails er lower'et, så .in er eksakt.
 */
async function hentFravalgte(admin: SupabaseClient, emails: readonly string[]): Promise<Set<string>> {
  const ud = new Set<string>();
  for (const b of bundter(emails)) {
    const { data, error } = await admin.from("ansoegninger").select("email").eq("meta_fravalg", true).in("email", b);
    if (error) throw new Error(`ansoegninger (meta_fravalg): ${error.message}`);
    for (const x of (data ?? []) as { email: string | null }[]) ud.add(lav(x.email));
  }
  return ud;
}

async function hentSpor(admin: SupabaseClient, eventIds: readonly string[]): Promise<Map<string, SporRaekke>> {
  const ud = new Map<string, SporRaekke>();
  for (let i = 0; i < eventIds.length; i += 500) {
    const { data, error } = await admin.from("meta_haendelser").select("event_id, udfald, forsoeg").in("event_id", eventIds.slice(i, i + 500));
    if (error) throw new Error(`meta_haendelser: ${error.message}`);
    for (const r of (data ?? []) as SporRaekke[]) ud.set(r.event_id, r);
  }
  return ud;
}

/**
 * Planen — kører OGSÅ i tørkørslen (beviset).
 *
 * PORTEN FØRST (CTO 3/10, HØJ): passet læser INTET andet end låsens række, før porten er
 * «klar». Er migrationen ikke kørt (eller app_config ulæselig), slås ingen tilmelding, intet
 * spor og ingen afmelding op. springOver (kørslen gælder én ANSØGNING) læser slet intet.
 *
 * KASTER ALDRIG: en fejl står i r.fejl (tilmeldingernes egen liste) — aldrig i kørslens
 * fejl, aldrig i dens HTTP-status. Ansøgningernes svar og status er de samme som uden passet.
 */
export async function planlaegTilmeldinger(
  admin: SupabaseClient,
  a: { nu: Date; dryRun: boolean; metaLaasAktiv: boolean; testEventCode: string | null; tilmeldingId: string | null; springOver: boolean },
): Promise<{ resultat: TilmeldingResultat; planer: TilmeldingPlanRaekke[] }> {
  const r = tomtTilmeldingResultat(a.tilmeldingId);
  const planer: TilmeldingPlanRaekke[] = [];
  if (a.springOver) { r.port = "sprunget_over"; return { resultat: r, planer }; }
  try {
    const laas = await hentWebinarLaas(admin);
    r.port = laas.port;
    r.laas_aktiv = laas.aaben;
    r.sender_rigtigt = tilmeldingSenderRigtigt({
      dryRun: a.dryRun, port: r.port, metaLaasAktiv: a.metaLaasAktiv, webinarLaasAktiv: r.laas_aktiv, testEventCode: a.testEventCode, tilmeldingId: a.tilmeldingId,
    });
    if (r.port !== "klar") return { resultat: r, planer };
    const raa = await hentRaa(admin, a.nu, a.tilmeldingId);
    const emails = [...new Set(raa.map((t) => lav(t.email)).filter((e) => e !== ""))];
    const [afmeldte, fravalgte] = await Promise.all([hentAfmeldte(admin, emails), hentFravalgte(admin, emails)]);
    const kandidater: TilmeldingTilMeta[] = raa.map((t) => ({ ...t, afmeldt: afmeldte.has(lav(t.email)), fravalgt: fravalgte.has(lav(t.email)) }));
    r.kandidater = kandidater.length;
    const spor = await hentSpor(admin, kandidater.map((t) => tilmeldingEventId(t.id)));
    for (const t of kandidater) {
      const d = doemTilmelding(t, a.nu);
      if (!d.ok) { r.sprunget[d.grund]++; continue; }
      const id = tilmeldingEventId(t.id);
      const m = maaForsoeges(spor.get(id) ?? null);
      if (!m.ok) { r.sprunget[m.grund]++; continue; }
      planer.push({
        plan: {
          event_id: id, tilmelding_id: t.id, event_time: d.tid.toISOString(),
          fbc_kilde: tilmeldingFbcKilde(t), fbp: bygFbpFelt(t.fbp) !== null,
          brugerdata: tilmeldingBrugerdataNoegler(normaliserTilmeldingBrugerdata(t)),
          forsoeg: (spor.get(id)?.forsoeg ?? 0) + 1,
        },
        raekke: t, tid: d.tid,
      });
    }
    r.ville_sende = planer.map((p) => p.plan);
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    r.fejl.push(`planlægning: ${grund}`);
    r.sender_rigtigt = false;
    console.error(`${LOG} passet kunne ikke planlægges — ansøgningerne er urørte:`, grund);
    return { resultat: r, planer: [] };
  }
  return { resultat: r, planer };
}

/**
 * Afsendelsen — KUN når r.sender_rigtigt. Én hændelse pr. kald; værnet på det FAKTISKE objekt
 * før kaldet; sporet (upsert på event_id) efter kaldet, før tællingen.
 *
 * ALT HER BLIVER I `tilmeldinger` (CTO 3/10, HØJ): fejl og fejlede tælles i r — ALDRIG i
 * kørslens fejl, fejlede, alarmliste eller HTTP-status. VALGET: tilmeldingerne deler IKKE
 * ansøgningernes alarmmail (skrivAlarm ændrer r.alarm/r.fejl og ville gøre ansøgningernes
 * svar anderledes). Overvågningen er sporet: en hændelse, Meta afviser, står i meta_haendelser
 * med sit udfald, og driftsagenten (driftDom.ts SPOR, «meta_haendelser») dømmer fejlraten.
 * Et værn-afslag og en sporskrivning, der fejler, står i tilmeldinger.fejl og i functionens log.
 * KASTER ALDRIG.
 */
export async function sendTilmeldinger(
  admin: SupabaseClient,
  planer: readonly TilmeldingPlanRaekke[],
  r: TilmeldingResultat,
  a: { nu: Date; testEventCode: string | null; startMs: number; budgetMs: number; send: Sender },
): Promise<void> {
  if (!r.sender_rigtigt) return;
  try {
    for (const p of planer) {
      if (Date.now() - a.startMs > a.budgetMs) { r.udsat++; continue; }
      // Klarteksten findes kun i dette udtryk; bygTilmeldingPayload ser kun aftryk.
      const hashet = await hashTilmeldingBrugerdata(normaliserTilmeldingBrugerdata(p.raekke), sha256Hex);
      const payload = bygTilmeldingPayload(p.raekke, p.tid, await sha256Hex(p.raekke.id), hashet);
      const forbudte = findForbudteNoegler(payload);
      if (forbudte.length > 0) {
        console.error(`${LOG} PAYLOAD AFVIST — ${p.plan.event_id}:`, forbudte.join(", "));
        r.payload_afvist++; r.fejlede++;
        r.fejl.push(`payload_afvist ${p.plan.event_id}: ${forbudte.join(", ")}`);
        continue;
      }
      const svar = await a.send(payload, a.testEventCode);
      const { error } = await admin.from("meta_haendelser").upsert({
        event_id: p.plan.event_id, ansoegning_id: null, tilmelding_id: p.plan.tilmelding_id, art: TILMELDING_ART, event_time: p.plan.event_time,
        udfald: svar.udfald, forsoeg: p.plan.forsoeg, sidste_forsoeg_at: a.nu.toISOString(), sendt_at: svar.udfald === "sendt" ? a.nu.toISOString() : null,
        status: svar.status, events_received: svar.events_received, svar: svar.svar, fejl: svar.fejl, test_event_code: a.testEventCode, varighed_ms: svar.varighed_ms,
      }, { onConflict: "event_id" });
      if (error) { r.fejl.push(`spor ${p.plan.event_id}: ${error.message}`); console.error(`${LOG} SPOR IKKE SKREVET for ${p.plan.event_id}:`, error.message); }
      if (svar.udfald === "sendt") r.sendt++;
      else { r.fejlede++; r.fejl.push(`${p.plan.event_id}: ${svar.udfald}${svar.fejl ? ` — ${svar.fejl}` : ""}`); }
    }
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    r.fejl.push(`afsendelse: ${grund}`);
    console.error(`${LOG} afsendelsen kastede — ansøgningerne er urørte:`, grund);
  }
}
