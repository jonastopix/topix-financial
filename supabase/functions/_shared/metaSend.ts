/**
 * metaSend — den RENE dom for platformens afsendelse til Metas Conversions API
 * (udkast 21/9-2026 aften, HASTER: webinar 22/9 kl. 09; recon-tracking.md §2, §3.3,
 * §4, §5; genbruger det fra ~/Downloads/udkast-meta-capi/ (19/9), der holder).
 * Deno-fri, så vitest dækker den (src/lib/__tests__/metaSend.test.ts). Afsendelsen
 * (fetch + nøglen) bor i metaSendAfsendelse.ts; kørslen i meta-send-cron.
 *
 * BESLUTTET (Jonas 21/9 aften):
 *   1. Ansøgningens afsendelse rører vi ikke: Meta-afsendelsen er et SELVSTÆNDIGT
 *      cron-job, der læser ansoegninger og sender det, der ikke er sendt. Idempotent
 *      gennem sporet meta_haendelser (event_id unik) og Metas egen dedup på event_id.
 *   2. Browserens user agent gemmes ved «opret» — KUN når fbclid er sat.
 *   3. To hændelser, begge Lead: content_name «application_started» (created_at =
 *      første gem) og «application_submitted» (indsendt_at). event_id
 *      «<ansøgnings-id>:started» / «:submitted». user_data = { fbc, external_id
 *      (SHA-256 af ansøgnings-id), client_user_agent } — ALDRIG em, ph,
 *      client_ip_address, navn, CVR eller svar. Uden fbclid, user agent eller
 *      landing sendes intet (tælles som sprunget over med grund).
 *   4. Låsen app_config.meta_send_aktiv (standard false): besluttet af Jonas
 *      21/9-2026 — ingen jurist; låsen er bevisets, ikke juraens. Cronen tørkører
 *      mens den er false; beviset sendes med test_event_code (tilladt uden lås);
 *      derefter slås låsen til med én SQL, og cronen sender for alvor.
 *   7. Princip 1: fejlede afsendelser giver én mail pr. døgn til driftModtager.
 *   8. (rettelse 21/9 aften) INTET LOFT PÅ FORSØG — Metas 7-dagesvindue ER loftet:
 *      «ingen_noegle», «fejl» og «timeout» prøves igen ved hver kørsel, til doem siger
 *      «for_gammel». Kun «sendt» og «ugyldig» prøves aldrig igen. Et forsøgsloft (før: 6 ×
 *      5 min = 30 min) ville smide hændelser væk, som Meta stadig tager imod.
 *   9. (rettelse 21/9 aften) METAS FEJLSVAR DØMMES PÅ FEJLKODEN, ikke kun HTTP-status:
 *      Graph API svarer 400 med error.code også for en ugyldig nøgle (190) og manglende
 *      rettigheder (10, 200–299) — det må ALDRIG blive «ugyldig» (som aldrig prøves igen).
 *      Dommen står i doemMetaSvar: MIDLERTIDIGE_KODER eller is_transient → fejl; NOEGLE_KODER
 *      (uden kode: type OAuthException eller 401/403) → ingen_noegle; øvrige 4xx → ugyldig; 5xx → fejl.
 *  10. (rettelse 21/9 aften, docs/tracking.md §6 punkt 9) EN NØGLE UDEN ADGANG TIL DATASÆTTET
 *      GEMMER SIG BAG KODE 100. Metas fejlreference for 100 med error_subcode 33, ordret:
 *      «Unsupported post request. This error may occur if your access token is not added as a
 *      system user with appropriate permissions to the ad account that owns a Custom Audience.»
 *      (https://developers.facebook.com/docs/marketing-api/error-reference/) — altså
 *      RETTIGHEDER, ikke payload. Kode 100 alene er «Invalid parameter» og bliver «ugyldig»
 *      som før; kun PARRET (100, 33) løftes til ingen_noegle, så hændelsen prøves igen, når
 *      adgangen er givet. «ugyldig» prøves aldrig igen, og en nøglefejl, der lander dér,
 *      ville tabe hændelsen for altid.
 *
 * METAS DOKUMENTATION, citeret (hentet 21/9-2026):
 *   fbc — https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc/
 *     «version.subdomainIndex.creationTime.<fbclid>» · subdomainIndex «which domain the
 *     cookie is defined on ('com' = 0, 'example.com' = 1, 'www.example.com' = 2)» ·
 *     «If you're generating this field on a server, and not saving an _fbc cookie, use the
 *     value 1» · creationTime «the timestamp when you first observed or received this
 *     fbclid value» (ms). → fb.1.<created_at i ms>.<fbclid>. Det gamle udkasts tvivl om «fb.1.»
 *     er afgjort af dokumentationen: server-genereret uden cookie = 1, uanset app.-subdomænet.
 *   7 dage — https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event
 *     «The event_time can be up to 7 days before you send an event to Facebook. If any
 *     event_time in data is greater than 7 days in the past, we return an error for the
 *     entire request and process no events.» · «The event_source_url is required for
 *     website events shared using the Conversions API.»
 *   user agent — https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 *     «The client_user_agent is required for website events shared using the Conversions
 *     API.» (Do not hash) · external_id: «Hashing recommended» · fbc: «Do not hash» ·
 *     «You must provide at least one of the following user_data parameters».
 *   test_event_code — https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
 *     «Events sent with test_event_code are not dropped. They flow into Events Manager and
 *     are used for targeting and ads measurement purposes.» · «The test_event_code field
 *     should be used only for testing. You need to remove it when sending your production
 *     payload.» · «you can send us up to 1,000 events at a time» · «If any event you send
 *     in a batch is invalid, we reject the entire batch.» → én hændelse pr. kald, og
 *     bevishændelsen ER en rigtig hændelse (den tæller — derfor sendes den kun én gang og
 *     står i sporet som sendt med sin testkode).
 *   fejlsvar — https://developers.facebook.com/docs/graph-api/guides/error-handling (hentet 21/9 aften)
 *     Svarets form: «{ "error": { "message": "Message describing the error", "type": "OAuthException",
 *     "code": 190, "error_subcode": 460, … "fbtrace_id": "EJplcsCHuLu" } }». «Error Codes — Code or
 *     Type · Name · What To Do»: «OAuthException — If no subcode is present, the login status or access
 *     token has expired, been revoked, or is otherwise invalid. Get a new access token.» · «102 API
 *     Session — [samme ordlyd]» · «1 API Unknown — Possibly a temporary issue due to downtime. Wait and
 *     retry the operation.» · «2 API Service — Temporary issue due to downtime. Wait and retry the
 *     operation.» · «4 API Too Many Calls — Temporary issue due to throttling. Wait and retry the
 *     operation, or examine your API request volume.» · «17 API User Too Many Calls — Temporary issue
 *     due to throttling. Wait and retry …» · «10 API Permission Denied — Permission is either not
 *     granted or has been removed. Handle the missing permissions.» · «190 Access token has expired —
 *     Get a new access token.» · «200-299 API Permission (Multiple values depending on permission) —
 *     Permission is either not granted or has been removed.» · «341 Application limit reached —
 *     Temporary issue due to downtime or throttling. Wait and retry the operation …».
 *   rate limits — https://developers.facebook.com/docs/graph-api/overview/rate-limiting (hentet 21/9 aften)
 *     «Throttle Error Codes: 4 — the app whose token is being used in the request has reached its rate
 *     limit. 17 — the User whose token is being used … 32 — the User or app whose token is being used
 *     in the Pages API request has reached its rate limit. 613 — a custom rate limit has been reached.»
 *     Eksempel: «{ "error": { "message": "(#32) Page request limit reached", "type": "OAuthException",
 *     "code": 32, … } }» — type OAuthException står også på throttling, derfor dømmes de midlertidige
 *     koder FØR typen. Feltet «is_transient» står IKKE på nogen af de to sider (målt 21/9) — det
 *     læses alligevel som «midlertidig», fordi det kun kan gøre et svar til «fejl» (prøves igen),
 *     aldrig til «ugyldig».
 */
import { kbhDato } from "./hverdage.ts";

/** Pixel/datasæt-id (recon-tracking §5: i begge GTM-containere og eWebinar — offentligt). */
export const META_DATASET_ID = "858180112996496";
export const META_API_VERSION = "v21.0";
/** Secret-navnet for datasættets Conversions API-token — KUN dette navn, læst KUN i metaSendAfsendelse.ts. */
export const META_SEND_TOKEN_NAVN = "META_SEND_TOKEN";
/** app_config-nøglen (låsen). Standard false. */
export const META_SEND_LAAS_NOEGLE = "meta_send_aktiv";
/** Metas vindue: event_time højst 7 dage før afsendelsen. */
export const META_VINDUE_DAGE = 7;
export const META_TIMEOUT_MS = 8000;
/** user agent afkortes som aftale_spor (aftale-underskrift/index.ts). */
export const USER_AGENT_MAKS = 512;

export const ARTER = ["started", "submitted"] as const;
export type Art = (typeof ARTER)[number];

/** Metas standardnavn Lead for begge; content_name som hjemmesidens gamle GTM-tags (recon §0 #2–3). */
export const META_EVENT: Readonly<Record<Art, { event_name: "Lead"; content_name: string }>> = {
  started: { event_name: "Lead", content_name: "application_started" },
  submitted: { event_name: "Lead", content_name: "application_submitted" },
};

export function eventId(ansoegningId: string, art: Art): string {
  return `${ansoegningId}:${art}`;
}

/** fb.1.<ms da fbclid blev set>.<fbclid> — indeks 1 er Metas regel for server-genereret uden cookie. */
export function bygFbc(fbclid: string, setTid: Date): string {
  return `fb.1.${setTid.getTime()}.${fbclid}`;
}

const somTid = (v: string | null | undefined): Date | null => {
  if (typeof v !== "string" || v.trim() === "") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
};

/** Inden for Metas vindue: 0 ≤ nu − tid ≤ 7 dage. */
export function erIVindue(tid: Date, nu: Date): boolean {
  const alder = nu.getTime() - tid.getTime();
  return alder >= 0 && alder <= META_VINDUE_DAGE * 86_400_000;
}

/** Rækken, cronen læser — og INTET andet (ingen navn, email, telefon, cvr, svar). */
export interface AnsoegningTilMeta {
  id: string;
  created_at: string;
  indsendt_at: string | null;
  fbclid: string | null;
  landing: string | null;
  user_agent: string | null;
}

export const SPRUNGET_GRUNDE = ["ingen_fbclid", "ingen_user_agent", "ingen_landing", "ikke_indsendt", "ingen_tidspunkt", "for_gammel"] as const;
export type SprungetGrund = (typeof SPRUNGET_GRUNDE)[number];

export type Dom = { ok: true; tid: Date } | { ok: false; grund: SprungetGrund };

/** Dommen pr. (ansøgning, art): må den sendes, og med hvilket event_time? */
export function doem(r: AnsoegningTilMeta, art: Art, nu: Date): Dom {
  if (!r.fbclid || r.fbclid.trim() === "") return { ok: false, grund: "ingen_fbclid" };
  if (!r.user_agent || r.user_agent.trim() === "") return { ok: false, grund: "ingen_user_agent" };
  if (!r.landing || r.landing.trim() === "") return { ok: false, grund: "ingen_landing" };
  if (art === "submitted" && !r.indsendt_at) return { ok: false, grund: "ikke_indsendt" };
  const tid = somTid(art === "started" ? r.created_at : r.indsendt_at);
  if (tid === null) return { ok: false, grund: "ingen_tidspunkt" };
  if (!erIVindue(tid, nu)) return { ok: false, grund: "for_gammel" };
  return { ok: true, tid };
}

export interface MetaPayload {
  event_name: "Lead";
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url: string;
  user_data: { fbc: string; external_id: string[]; client_user_agent: string };
  custom_data: { content_name: string };
}

/**
 * Payloaden — præcis de tilladte felter. externalIdAftryk er sha256Hex(ansøgnings-id),
 * regnet af kalderen (aftryk.ts), så dommen her er synkron og ren.
 * fbc's tidspunkt er created_at — første gang vi så fbclid'et (Metas regel), ikke hændelsens tid.
 */
export function bygPayload(r: AnsoegningTilMeta, art: Art, tid: Date, externalIdAftryk: string): MetaPayload {
  const set = somTid(r.created_at) ?? tid;
  return {
    event_name: META_EVENT[art].event_name,
    event_time: Math.floor(tid.getTime() / 1000),
    event_id: eventId(r.id, art),
    action_source: "website",
    event_source_url: (r.landing ?? "").trim(),
    user_data: {
      fbc: bygFbc((r.fbclid ?? "").trim(), set),
      external_id: [externalIdAftryk],
      client_user_agent: (r.user_agent ?? "").trim().slice(0, USER_AGENT_MAKS),
    },
    custom_data: { content_name: META_EVENT[art].content_name },
  };
}

/** Nøgler, der ALDRIG må stå i det, vi sender: Metas kontakt-/personfelter og vores egne. */
export const FORBUDTE_NOEGLER = [
  "em", "ph", "fn", "ln", "ge", "db", "ct", "st", "zp", "country", "client_ip_address", "fbp", "subscription_id", "lead_id",
  "email", "navn", "telefon", "cvr", "svar", "ip", "ip_hash", "udfordring", "hjemmeside", "virksomhedsnavn",
  // GA's id'er (21/9 aften) hører til Google, aldrig til Metas payload.
  "ga_client_id", "ga_session_id",
] as const;

/** Stierne til enhver forbudt nøgle i objektet — tom = rent. */
export function findForbudteNoegler(obj: unknown, sti = ""): string[] {
  if (obj === null || typeof obj !== "object") return [];
  const ud: string[] = [];
  if (Array.isArray(obj)) { obj.forEach((v, i) => ud.push(...findForbudteNoegler(v, `${sti}[${i}]`))); return ud; }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const her = sti ? `${sti}.${k}` : k;
    if ((FORBUDTE_NOEGLER as readonly string[]).includes(k)) ud.push(her);
    ud.push(...findForbudteNoegler(v, her));
  }
  return ud;
}

/** Låsen: kun boolean true eller strengen "true" åbner. Alt andet (null, "ja", 1) er lukket. */
export function laasErAktiv(configValue: unknown): boolean {
  return configValue === true || configValue === "true";
}

/**
 * Sender kørslen for alvor? Kræver dry_run: false OG (låsen ELLER en testkode).
 * Testkoden er beviset: tilladt uden lås, og hændelsen sendes med koden — Meta dropper den ikke.
 */
export function senderRigtigt(a: { dryRun: boolean; laasAktiv: boolean; testEventCode: string | null }): boolean {
  if (a.dryRun) return false;
  return a.laasAktiv || a.testEventCode !== null;
}

export const TEST_EVENT_CODE_FORM = /^[A-Za-z0-9]{4,40}$/;
export function erTestEventCode(v: unknown): v is string {
  return typeof v === "string" && TEST_EVENT_CODE_FORM.test(v);
}

// ── Sporet (meta_haendelser) ─────────────────────────────────────────────────

export const SPOR_UDFALD = ["sendt", "fejl", "timeout", "ugyldig", "ingen_noegle"] as const;
export type SporUdfald = (typeof SPOR_UDFALD)[number];

export interface SporRaekke {
  event_id: string;
  udfald: SporUdfald;
  forsoeg: number;
}

/**
 * Idempotensen: sendt → aldrig igen; ugyldig (4xx med en rigtig fejl i payloaden) → aldrig igen
 * (retter sig ikke selv). ALT ANDET (ingen_noegle, fejl, timeout) prøves igen ved hver kørsel —
 * INTET forsøgsloft: Metas 7-dagesvindue (doem → «for_gammel») er loftet (rettelse 21/9 aften).
 */
export function maaForsoeges(spor: SporRaekke | null): { ok: true } | { ok: false; grund: "allerede_sendt" | "ugyldig" } {
  if (!spor) return { ok: true };
  if (spor.udfald === "sendt") return { ok: false, grund: "allerede_sendt" };
  if (spor.udfald === "ugyldig") return { ok: false, grund: "ugyldig" };
  return { ok: true };
}

/** Nøgle/rettighed (Graph API error-handling, citeret i filhovedet): 190, 102, 10 og 200–299 → ingen_noegle. */
export const NOEGLE_KODER: readonly number[] = [190, 102, 10];
export const erNoegleKode = (kode: number): boolean => NOEGLE_KODER.includes(kode) || (kode >= 200 && kode <= 299);
/** Midlertidigt (downtime/throttling — «Wait and retry»): 1, 2, 4, 17, 32, 341, 613 → fejl (prøves igen). */
export const MIDLERTIDIGE_KODER: readonly number[] = [1, 2, 4, 17, 32, 341, 613];

/**
 * Nøgle/rettighed, der gemmer sig bag en ANDEN kode — parret (code, error_subcode).
 * (100, 33) er Metas måde at sige «objektet findes ikke, eller din nøgle må det ikke»:
 * «Unsupported post request. This error may occur if your access token is not added as a
 * system user with appropriate permissions to the ad account …» (error-reference).
 * Uden dette par ville en nøgle uden adgang til datasættet blive dømt «ugyldig» — og
 * «ugyldig» prøves ALDRIG igen. Listen er parvis med vilje: kode 100 alene er en
 * payloadfejl og skal blive ved med at være det.
 */
export const NOEGLE_SUBKODER: readonly (readonly [number, number])[] = [[100, 33]];
export const erNoegleSubkode = (kode: number | null, subkode: number | null): boolean =>
  kode !== null && subkode !== null && NOEGLE_SUBKODER.some(([k, s]) => k === kode && s === subkode);

interface MetaFejl { message?: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean }

/**
 * Metas svar: { events_received, fbtrace_id } ved 2xx; { error: { message, type, code, … } } ellers.
 * Dømmes på FEJLKODEN (rettelse 21/9 aften), i denne rækkefølge:
 *   1. midlertidig (MIDLERTIDIGE_KODER eller is_transient: true) → «fejl» — FØR typen, fordi
 *      throttling også bærer type OAuthException (Metas eget eksempel på kode 32);
 *   2. nøgle/rettighed → «ingen_noegle»: KODEN afgør, når der er en (NOEGLE_KODER, 200–299),
 *      og PARRET (kode, error_subcode) afgør for dem, der gemmer sig bag kode 100 —
 *      (100, 33) er en manglende rettighed på datasættet, ikke en payloadfejl (NOEGLE_SUBKODER).
 *      Uden kode afgør typen (OAuthException — Metas ord: «If no subcode is present, the login
 *      status or access token has expired …») eller HTTP 401/403. Kode 100 UDEN subkode 33
 *      er «Invalid parameter» og bærer i praksis også type OAuthException — en payloadfejl;
 *   3. andre 4xx (fx kode 100) → «ugyldig» — den eneste, der aldrig prøves igen;
 *   4. 5xx og alt andet → «fejl».
 */
export function doemMetaSvar(status: number, tekst: string): { udfald: SporUdfald; events_received: number | null; fejl: string | null; kode: number | null } {
  let krop: Record<string, unknown> | null = null;
  try { krop = JSON.parse(tekst) as Record<string, unknown>; } catch { krop = null; }
  if (status >= 200 && status < 300) {
    const n = typeof krop?.events_received === "number" ? krop.events_received : null;
    return { udfald: "sendt", events_received: n, fejl: n === null ? "svar uden events_received" : null, kode: null };
  }
  const e = (krop?.error ?? null) as MetaFejl | null;
  const kode = typeof e?.code === "number" ? e.code : null;
  const subkode = typeof e?.error_subcode === "number" ? e.error_subcode : null;
  const fejl = e?.message ? `${e.message}${kode !== null ? ` (kode ${kode}${subkode !== null ? `/${subkode}` : ""})` : ""}` : tekst.slice(0, 300);
  if ((kode !== null && MIDLERTIDIGE_KODER.includes(kode)) || e?.is_transient === true) return { udfald: "fejl", events_received: null, fejl, kode };
  if (kode !== null ? (erNoegleKode(kode) || erNoegleSubkode(kode, subkode)) : (e?.type === "OAuthException" || status === 401 || status === 403)) return { udfald: "ingen_noegle", events_received: null, fejl, kode };
  if (status >= 400 && status < 500) return { udfald: "ugyldig", events_received: null, fejl, kode };
  return { udfald: "fejl", events_received: null, fejl, kode };
}

// ── Alarmen (princip 1) ──────────────────────────────────────────────────────

export const ALARM_NOEGLE_PRAEFIKS = "meta-send-alarm:";
export const ALARM_MAIL_LABEL = "meta-send-alarm";
export const ALARM_KLOKKE_TYPE = "drift";
/** Én mail pr. dansk kalenderdøgn. */
export function alarmNoegle(nu: Date): string {
  return `${ALARM_NOEGLE_PRAEFIKS}${kbhDato(nu)}`;
}

export interface FejletAfsendelse { event_id: string; udfald: SporUdfald; fejl: string | null; forsoeg: number }

export function alarmTekst(fejlede: readonly FejletAfsendelse[], nu: Date): { emne: string; titel: string; afsnit: string[]; blokke: { overskrift: string; tekst: string }[]; tekst: string } {
  const n = fejlede.length;
  const hvad = n === 1 ? "1 Meta-hændelse" : `${n} Meta-hændelser`;
  const emne = `${hvad} kunne ikke sendes — Conversions API har brug for et menneske`;
  const titel = `Meta: ${hvad} kunne ikke sendes (${kbhDato(nu)})`;
  const noegle = fejlede.some((f) => f.udfald === "ingen_noegle");
  const afsnit = [
    `meta-send-cron kunne ikke sende ${hvad} til Metas Conversions API. Ansøgningerne er urørte — kun målingen mangler.`,
    noegle
      ? `Mindst én fejlede på nøglen eller rettigheden (Metas fejlkode 190/102/10/200–299 eller OAuthException): ${META_SEND_TOKEN_NAVN} mangler, er udløbet eller har ikke adgang til datasættet ${META_DATASET_ID}. Ret secret'en i Lovable — den prøves igen ved hver kørsel, så længe hændelsen er under 7 dage gammel.`
      : "fejl/timeout prøves igen ved hver kørsel, så længe hændelsen er under 7 dage gammel; «ugyldig» (4xx med en rigtig fejl i payloaden, fx kode 100) prøves ikke igen — payloaden skal rettes.",
  ];
  const blokke = fejlede.slice(0, 5).map((f) => ({ overskrift: f.event_id, tekst: `${f.udfald} · forsøg ${f.forsoeg}${f.fejl ? ` — ${f.fejl}` : ""}` }));
  const tekst = [emne, ...afsnit, "", ...blokke.map((b) => `${b.overskrift}: ${b.tekst}`), "", "Sporet: meta_haendelser. Tørkørsel: SELECT public.kald_edge('meta-send-cron');"].join("\n");
  return { emne, titel, afsnit, blokke, tekst };
}
