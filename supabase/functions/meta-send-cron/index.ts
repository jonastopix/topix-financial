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
//      lidt luft, KUN kolonnerne i RAEKKE_FELTER. Dommen (doem) siger pr. (ansøgning,
//      started/submitted): send, eller sprunget over med grund. Sporet siger, hvad der
//      allerede er sendt eller ugyldigt (maaForsoeges) — intet forsøgsloft:
//      ingen_noegle/fejl/timeout prøves igen ved hver kørsel, til «for_gammel».
//   3. Tørkørsel: svaret bærer ville_sende (event_id, art, event_time, fbc-KILDEN og
//      NAVNENE på de brugerdata, der ville blive sendt — aldrig en værdi, aldrig et
//      klik-id eller en user agent i klartekst) og sprunget pr. grund.
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
//
// ── TRIN 2, 22/9-2026 (Jonas 21/9 22:25; designet i _shared/metaSend.ts pkt. 15–19) ──
//   TRE HÆNDELSER MERE, alle på ansøgningen: «Kvalificeret» (første tal_med_dem), «Schedule»
//     (første book) og «Purchase» (første indgangsperiode). Samme cron, samme spor, samme lås.
//   KANDIDATREGLEN ER OMSKREVET: en Purchase sker 30–60 dage EFTER ansøgningen, så «oprettet
//     eller indsendt i vinduet» ville aldrig finde den. Kandidaten er nu en ansøgning, hvor
//     NOGET er sket i vinduet — oprettelse/indsendelse, en beslutning eller en betaling.
//   DE TRE ER CRM-HÆNDELSER, ikke website: action_source «system_generated» + custom_data
//     event_source «crm». De bærer hverken user agent eller event_source_url, og dommen
//     kræver dem ikke — ellers ville hver ansøgning fra før 21/9 aften være udelukket.
//   WEBINARETS KLIK-ID er tredje led i fbc-kæden (efter URL og cookie).
//   WEBINARHÆNDELSER BYGGES IKKE: eWebinars raa har ingen user agent (målt 21/9 22:12).
//
// ── UDVIDELSEN 22/9-2026 (Jonas 21/9 aften; hele designet i _shared/metaSend.ts pkt. 11–14) ──
//   ALLE ANSØGERE: filteret på fbclid er væk — webinarvejen bærer intet klik-id og var usynlig.
//   HASHET BRUGERDATA: em, ph, fn, ln og country normaliseres efter Metas egne regler og
//     SHA-256'es i denne fil (hashBrugerdata), aldrig i klartekst videre. Kun de felter,
//     ansøgningen HAR — «application_started» sker på skærm 1, hvor mail og navn mangler.
//   METAS COOKIER: fbp og fbc_cookie fra theboardroom.dk; URL'ens fbclid har forrang på fbc.
//   FRAVALG: meta_fravalg = true → sprunget over med grunden «fravalgt», før alt andet.
//   VÆRNET AFVISER ÉN HÆNDELSE, IKKE HELE KØRSLEN (rettelse): før returnerede en afvist
//     payload 500 for hele kørslen — én bots user agent med et snabel-a kunne dermed have
//     standset alle afsendelser. Nu tælles den som fejlet (alarm), sporet skrives ikke, og
//     de øvrige sendes.

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
  ALARM_KLOKKE_TYPE, ALARM_MAIL_LABEL, alarmNoegle, alarmTekst, type AnsoegningTilMeta, type Art, ARTER, type BrugerdataNoegle,
  brugerdataNoegler, bygFbpFelt, bygPayload, doem, erCrmArt, erTestEventCode, eventId, type FbcKilde, fbcKilde,
  type FejletAfsendelse, findForbudteNoegler, hashBrugerdata, laasErAktiv, maaForsoeges, META_SEND_LAAS_NOEGLE, META_VINDUE_DAGE,
  normaliserBrugerdata, senderRigtigt, type SporRaekke, type SprungetGrund,
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
/**
 * KUN disse kolonner. email, navn og telefon kom til 22/9 og læses for ÉT formål: at blive
 * normaliseret og hashet af _shared/metaSend.ts. Cronen rører dem ALDRIG selv — den sender
 * hele rækken til normaliserBrugerdata og ser kun aftryk igen. cvr, svar, hjemmeside,
 * udfordring og ip_hash står ikke her og hentes aldrig.
 */
const RAEKKE_FELTER = "id, created_at, indsendt_at, fbclid, landing, user_agent, email, navn, telefon, fbp, fbc_cookie, meta_fravalg, company_id";
/** Trin 2: de to beslutninger, der bliver til hændelser. Første række pr. (ansøgning, handling) tæller. */
const BESLUTNINGS_HANDLINGER = ["tal_med_dem", "book"] as const;
/** Trin 2: medlemskabets FØRSTE betaling. «fornyelse» er ikke en Purchase — den er en fornyelse. */
const PERIODE_ART_INDGANG = "indgang";

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Tørkørslens plan: hvad der VILLE blive sendt — nøglerne, aldrig værdierne. */
interface Plan {
  event_id: string;
  ansoegning_id: string;
  art: Art;
  event_time: string;
  /** klik_id · cookie · webinar · ingen — hvilket led fbc kom fra (trin 2: webinaret er led 3). */
  fbc_kilde: FbcKilde;
  /** website · crm — hvilken action_source hændelsen bærer (trin 2). */
  slags: "website" | "crm";
  /** Kun purchase: beløbet i kroner, som det ville blive sendt. */
  value?: number;
  fbp: boolean;
  /** em/ph/fn/ln/country, som de VILLE blive sendt (hashet). Kun navnene. */
  brugerdata: BrugerdataNoegle[];
  forsoeg: number;
}

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
  /** Payloads, værnet afviste (vores fejl, ikke Metas) — sporet skrives IKKE, så de prøves igen efter en rettelse. */
  payload_afvist: number;
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
    sprunget: {
      fravalgt: 0, ingen_user_agent: 0, ingen_landing: 0, ikke_indsendt: 0,
      ikke_kvalificeret: 0, ikke_booket: 0, ikke_betalt: 0, ingen_beloeb: 0,
      ingen_tidspunkt: 0, for_gammel: 0, allerede_sendt: 0, ugyldig: 0,
    },
    sendt: 0, payload_afvist: 0, fejlede: 0, fejlede_liste: [], udsat: 0, alarm: "ingen", fejl: [],
  };
}

/** Låsen — fail-closed. */
async function hentLaas(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.from("app_config").select("config_value").eq("config_key", META_SEND_LAAS_NOEGLE).maybeSingle();
  if (error) { console.error(`${LOG} app_config (${META_SEND_LAAS_NOEGLE}) kunne ikke læses — låsen er lukket:`, error.message); return false; }
  return laasErAktiv((data as { config_value?: unknown } | null)?.config_value ?? null);
}

/** Rækken, som den kommer af basen — trin 2's afledte felter slås op bagefter (berig). */
type RaaAnsoegning = Omit<
  AnsoegningTilMeta,
  "kvalificeret_at" | "booket_at" | "purchase_at" | "purchase_beloeb_oere" | "webinar_fbclid" | "webinar_fbclid_at"
> & { company_id: string | null };

const chunk = <T>(a: readonly T[], n: number): T[][] => {
  const ud: T[][] = [];
  for (let i = 0; i < a.length; i += n) ud.push(a.slice(i, i + n));
  return ud;
};

/**
 * KANDIDATERNE (omskrevet i trin 2).
 *
 * Før var reglen «ansøgninger, der er oprettet eller indsendt i vinduet». Den holder ikke
 * længere: en Purchase sker typisk 30–60 dage EFTER ansøgningen, og en kvalificering dage
 * efter. Ansøgningen ville for længst være ude af vinduet, og hændelsen ville aldrig blive
 * sendt. Kandidaten er derfor nu: en ansøgning, hvor NOGET er sket inden for vinduet —
 *   (a) oprettet eller indsendt,
 *   (b) en beslutning truffet («tal_med_dem» eller «book»),
 *   (c) en indgangsperiode skrevet (betalingen).
 * Dommen (doem) afgør bagefter præcist pr. art. Fravalget filtreres IKKE her — det springes
 * over med grunden «fravalgt», så tallet kan ses i svaret i stedet for at forsvinde.
 */
async function hentRaaKandidater(admin: SupabaseClient, nu: Date, ansoegningId: string | null): Promise<RaaAnsoegning[]> {
  if (ansoegningId) {
    const { data, error } = await admin.from("ansoegninger").select(RAEKKE_FELTER).eq("id", ansoegningId).maybeSingle();
    if (error) throw new Error(`ansoegninger: ${error.message}`);
    return data ? [data as unknown as RaaAnsoegning] : [];
  }
  const fra = new Date(nu.getTime() - (META_VINDUE_DAGE + 1) * 86_400_000).toISOString();
  const ids = new Set<string>();

  // (b) beslutninger i vinduet → ansøgnings-id'er
  {
    const { data, error } = await admin.from("ansoegning_beslutninger").select("ansoegning_id")
      .in("handling", [...BESLUTNINGS_HANDLINGER]).gte("truffet_at", fra).limit(SIDE * 5);
    if (error) throw new Error(`ansoegning_beslutninger: ${error.message}`);
    for (const r of (data ?? []) as { ansoegning_id: string }[]) ids.add(r.ansoegning_id);
  }
  // (c) indgangsperioder i vinduet → virksomheds-id'er → ansøgnings-id'er
  const betalteCompanyIds: string[] = [];
  {
    const { data, error } = await admin.from("company_perioder").select("company_id")
      .eq("art", PERIODE_ART_INDGANG).gte("created_at", fra).limit(SIDE * 5);
    if (error) throw new Error(`company_perioder: ${error.message}`);
    for (const r of (data ?? []) as { company_id: string }[]) betalteCompanyIds.push(r.company_id);
  }
  for (const del of chunk([...new Set(betalteCompanyIds)], 300)) {
    // Den dokumenterede bagvej fra betaling til ansøgning (recon §b.3).
    const { data, error } = await admin.from("company_betalingslink").select("ansoegning_id").in("company_id", del).not("ansoegning_id", "is", null);
    if (error) throw new Error(`company_betalingslink: ${error.message}`);
    for (const r of (data ?? []) as { ansoegning_id: string }[]) ids.add(r.ansoegning_id);
  }

  const ud = new Map<string, RaaAnsoegning>();
  // (a) vinduets egne + (c) virksomhedernes ansøgninger: companies.id == ansoegninger.id ved
  // ny virksomhed, ansoegninger.company_id ved CVR-genbrug — begge veje tages med.
  for (let start = 0; ; start += SIDE) {
    const { data, error } = await admin.from("ansoegninger").select(RAEKKE_FELTER)
      .or(`created_at.gte.${fra},indsendt_at.gte.${fra}`)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(start, start + SIDE - 1);
    if (error) throw new Error(`ansoegninger: ${error.message}`);
    const rk = (data ?? []) as unknown as RaaAnsoegning[];
    for (const r of rk) ud.set(r.id, r);
    if (rk.length < SIDE) break;
  }
  for (const del of chunk([...new Set(betalteCompanyIds)], 300)) {
    const { data, error } = await admin.from("ansoegninger").select(RAEKKE_FELTER)
      .or(`id.in.(${del.join(",")}),company_id.in.(${del.join(",")})`);
    if (error) throw new Error(`ansoegninger (betalte): ${error.message}`);
    for (const r of ((data ?? []) as unknown as RaaAnsoegning[])) ud.set(r.id, r);
  }
  const manglende = [...ids].filter((i) => !ud.has(i));
  for (const del of chunk(manglende, 300)) {
    const { data, error } = await admin.from("ansoegninger").select(RAEKKE_FELTER).in("id", del);
    if (error) throw new Error(`ansoegninger (beslutninger): ${error.message}`);
    for (const r of ((data ?? []) as unknown as RaaAnsoegning[])) ud.set(r.id, r);
  }
  return [...ud.values()];
}

/** Første «tal_med_dem» og første «book» pr. ansøgning — hændelsen er den FØRSTE, ikke den seneste. */
async function hentBeslutningstider(admin: SupabaseClient, ids: readonly string[]): Promise<Map<string, { tal_med_dem: string | null; book: string | null }>> {
  const ud = new Map<string, { tal_med_dem: string | null; book: string | null }>();
  for (const del of chunk(ids, 300)) {
    const { data, error } = await admin.from("ansoegning_beslutninger").select("ansoegning_id, handling, truffet_at")
      .in("ansoegning_id", del).in("handling", [...BESLUTNINGS_HANDLINGER]).order("truffet_at", { ascending: true });
    if (error) throw new Error(`ansoegning_beslutninger: ${error.message}`);
    for (const r of (data ?? []) as { ansoegning_id: string; handling: string; truffet_at: string }[]) {
      const p = ud.get(r.ansoegning_id) ?? { tal_med_dem: null, book: null };
      if (r.handling === "tal_med_dem" && p.tal_med_dem === null) p.tal_med_dem = r.truffet_at;
      if (r.handling === "book" && p.book === null) p.book = r.truffet_at;
      ud.set(r.ansoegning_id, p);
    }
  }
  return ud;
}

/** Første indgangsperiode pr. virksomhed — tidspunktet OG beløbet. En fornyelse er ikke en Purchase. */
async function hentBetalinger(admin: SupabaseClient, companyIds: readonly string[]): Promise<Map<string, { at: string; oere: number }>> {
  const ud = new Map<string, { at: string; oere: number }>();
  for (const del of chunk(companyIds, 300)) {
    const { data, error } = await admin.from("company_perioder").select("company_id, created_at, beloeb_oere")
      .in("company_id", del).eq("art", PERIODE_ART_INDGANG).order("created_at", { ascending: true });
    if (error) throw new Error(`company_perioder: ${error.message}`);
    for (const r of (data ?? []) as { company_id: string; created_at: string; beloeb_oere: number }[]) {
      if (!ud.has(r.company_id)) ud.set(r.company_id, { at: r.created_at, oere: r.beloeb_oere });
    }
  }
  return ud;
}

/**
 * Webinartilmeldingernes klik-id pr. mail (trin 2, pkt. 17). Koblingen er e-mail alene, begge
 * lower — husets eneste kobling mellem webinar og ansøgning (tabelkommentaren i
 * 20260919130000: «Kobles til ansoegninger på email (begge lower).»). Kun rækker MED et
 * klik-id; dommen (bygFbcFelt) vælger den seneste FØR ansøgningen og inden for 90 dage.
 */
async function hentWebinarKlikId(admin: SupabaseClient, emails: readonly string[]): Promise<Map<string, { fbclid: string; at: string | null }[]>> {
  const ud = new Map<string, { fbclid: string; at: string | null }[]>();
  for (const del of chunk(emails, 300)) {
    const { data, error } = await admin.from("webinar_tilmeldinger").select("email, fbclid, registreret_at, created_at")
      .in("email", del).not("fbclid", "is", null);
    if (error) throw new Error(`webinar_tilmeldinger: ${error.message}`);
    for (const r of (data ?? []) as { email: string; fbclid: string; registreret_at: string | null; created_at: string }[]) {
      const liste = ud.get(r.email) ?? [];
      liste.push({ fbclid: r.fbclid, at: r.registreret_at ?? r.created_at });
      ud.set(r.email, liste);
    }
  }
  return ud;
}

/**
 * Den seneste tilmelding FØR ansøgningen — valgt her, fordi «seneste før» er en sortering,
 * ikke en dom. Gyldigheden (90 dage) afgøres af den rene dom i metaSend.ts.
 */
function nyesteWebinarFoer(liste: readonly { fbclid: string; at: string | null }[], foer: string): { fbclid: string; at: string } | null {
  const graense = Date.parse(foer);
  let bedst: { fbclid: string; at: string } | null = null;
  for (const r of liste) {
    if (r.at === null) continue;
    const t = Date.parse(r.at);
    if (!Number.isFinite(t) || (Number.isFinite(graense) && t > graense)) continue;
    if (bedst === null || t > Date.parse(bedst.at)) bedst = { fbclid: r.fbclid, at: r.at };
  }
  return bedst;
}

/** Rå række + de fire opslag → den fulde række, dommen og payloaden læser. */
export function berig(
  r: RaaAnsoegning,
  beslutninger: { tal_med_dem: string | null; book: string | null } | undefined,
  betaling: { at: string; oere: number } | undefined,
  webinar: { fbclid: string; at: string } | null,
): AnsoegningTilMeta {
  return {
    ...r,
    kvalificeret_at: beslutninger?.tal_med_dem ?? null,
    booket_at: beslutninger?.book ?? null,
    purchase_at: betaling?.at ?? null,
    purchase_beloeb_oere: betaling?.oere ?? null,
    webinar_fbclid: webinar?.fbclid ?? null,
    webinar_fbclid_at: webinar?.at ?? null,
  };
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

  // Trin 2: rækkerne først, derefter de fire opslag, der gør dem til hændelser.
  const raa = await hentRaaKandidater(admin, a.nu, a.ansoegningId);
  const ids = raa.map((k) => k.id);
  const companyIds = [...new Set(raa.map((k) => k.company_id ?? k.id))];
  const emails = [...new Set(raa.map((k) => (k.email ?? "").trim().toLowerCase()).filter((e) => e !== ""))];
  const [beslutninger, betalinger, webinarer] = await Promise.all([
    hentBeslutningstider(admin, ids),
    hentBetalinger(admin, companyIds),
    emails.length > 0 ? hentWebinarKlikId(admin, emails) : Promise.resolve(new Map<string, { fbclid: string; at: string | null }[]>()),
  ]);
  const kandidater = raa.map((k) =>
    berig(
      k,
      beslutninger.get(k.id),
      betalinger.get(k.company_id ?? k.id),
      nyesteWebinarFoer(webinarer.get((k.email ?? "").trim().toLowerCase()) ?? [], k.created_at),
    )
  );
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
      planer.push({
        plan: {
          event_id: id, ansoegning_id: k.id, art, event_time: d.tid.toISOString(),
          fbc_kilde: fbcKilde(k), fbp: bygFbpFelt(k.fbp) !== null,
          slags: erCrmArt(art) ? "crm" : "website",
          ...(art === "purchase" ? { value: (k.purchase_beloeb_oere ?? 0) / 100 } : {}),
          brugerdata: brugerdataNoegler(normaliserBrugerdata(k)),
          forsoeg: (spor.get(id)?.forsoeg ?? 0) + 1,
        },
        raekke: k, tid: d.tid,
      });
    }
  }
  r.ville_sende = planer.map((p) => p.plan);

  if (!r.sender_rigtigt) return { status: 200, resultat: r };

  for (const p of planer) {
    if (Date.now() - a.startMs > BUDGET_MS) { r.udsat++; continue; }
    // Brugerdataene normaliseres og hashes HER — klarteksten findes kun i dette udtryk og
    // forlader aldrig funktionen. Aftrykkene er det eneste, bygPayload nogensinde ser.
    const hashet = await hashBrugerdata(normaliserBrugerdata(p.raekke), sha256Hex);
    const payload = bygPayload(p.raekke, p.plan.art, p.tid, await sha256Hex(p.raekke.id), hashet);
    const forbudte = findForbudteNoegler(payload);
    if (forbudte.length > 0) {
      // ÉN hændelse afvises, ikke hele kørslen (rettelse 22/9). En rå værdi i ét felt —
      // fx en e-mail i en bots user agent — må ikke kunne standse alle de andre. Sporet
      // skrives IKKE: det er VORES fejl, og hændelsen skal prøves igen, når den er rettet.
      // Alarmen kommer alligevel, fordi den tælles med blandt de fejlede.
      console.error(`${LOG} PAYLOAD AFVIST — ${p.plan.event_id}:`, forbudte.join(", "));
      r.payload_afvist++;
      r.fejl.push(`payload_afvist ${p.plan.event_id}: ${forbudte.join(", ")}`);
      r.fejlede++;
      r.fejlede_liste.push({ event_id: p.plan.event_id, udfald: "ugyldig", fejl: `værnet afviste payloaden: ${forbudte.join(", ")}`, forsoeg: p.plan.forsoeg });
      continue;
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
