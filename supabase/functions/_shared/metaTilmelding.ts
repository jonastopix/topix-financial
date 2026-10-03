/**
 * metaTilmelding — den RENE dom for webinarmotorens tilmeldinger til Metas Conversions API
 * (udkast 3/10-2026, docs/webinarmotor.md §7.9; spec §C6 og §G3). Deno-fri, så vitest dækker
 * den (src/lib/__tests__/metaTilmelding.test.ts). Kørslen (læsning + spor) bor i
 * metaTilmeldingKoersel.ts; afsendelsen er den samme som ansøgningernes
 * (metaSendAfsendelse.ts — det ENESTE sted, META_SEND_TOKEN læses), og cronen er den samme
 * (meta-send-cron). Ingen ny function, ingen ny secret, ingen ny cron.
 *
 * BESLUTTET (Jonas 30/9, D2.3): pixel + Conversions API på tilmeldingen, bag låsen
 * app_config.webinarmotor_meta_aktiv (fraværende = false, fail-closed).
 * IKKE BESLUTTET: B3 (dedup-formen mod pixlen) og B4 (privatlivsteksten). Derfor:
 *   - koden SENDER INTET, før låsen er åben — og låsen åbnes først, EFTER privatlivsteksten på
 *     topix.dk er publiceret (løftet «Selve din tilmelding deler vi ikke med Meta» står der i
 *     dag; docs/tracking.md §3, række 28);
 *   - event_id-formen «<tilmelding_id>:registration» er VORES forslag til B3. Pixlen på topix.dk
 *     skal bruge PRÆCIS den streng som eventID — Metas ord: «For deduplication, the eventID from
 *     a browser or app event must match the event_id in the corresponding server event.»
 *     (server-event-siden, citeret i metaSend.ts' filhoved). Spec'ens «eventID = tilmelding_id»
 *     (§A1, «Tracking ved succes») deduplikerer IKKE mod denne form og er afløst.
 *
 * HVORFOR EN WEBSITE-HÆNDELSE (og hvorfor den nu kan sendes ærligt): en tilmelding er et menneske,
 * der udfyldte en formular i en browser. Meta kræver client_user_agent og event_source_url for
 * website-hændelser («Website events … require the client_user_agent, action_source, and
 * event_source_url parameters»). eWebinars tilmeldinger blev fravalgt 21/9, fordi eWebinars raa
 * ingen user agent bærer (metaSend.ts pkt. 18) — MOTORENS tilmeldinger gør: webinar-tilmeld
 * gemmer request-headeren «user-agent» i webinar_tilmeldinger.user_agent (≤ 500) og formularens
 * landing i .origin (skive 1, 20261003010000). Uden user agent eller landing springes rækken over
 * — aldrig «system_generated» for en browserhandling.
 *
 * HVEM DER SENDES — KUN motorens egne, rigtige, første tilmeldinger:
 *   kilde_system = 'platform'    (eWebinars rækker har eWebinars egen pixel — «Fuldfør registrering»)
 *   ikke raa.intern              (D2.7: den interne prøvesession er ingen annoncekonvertering)
 *   ikke afmeldt                 (webinar_afmeldinger, mailen lower)
 *   ikke fravalgt                (en ansøgning på samme mail med meta_fravalg = true — tilmeldingen
 *                                 har ingen egen fravalgskolonne; ÅBENT punkt i tracking.md)
 *   ikke raa.via = 'gen_tilmeld' («Tag næste session» i rummet: personen er allerede tilmeldt, og
 *                                 rækkens origin er den FØRSTE formulars side — at sende den som
 *                                 event_source_url ville være en påstand om en side, hun ikke var på)
 *   user agent og landing findes, og registreret_at ligger i Metas 7-dagesvindue.
 *
 * PAYLOADEN — som ansøgningernes website-form, med færre felter:
 *   event_name «CompleteRegistration» (Metas standardhændelse), content_name «webinar_registration»,
 *   action_source «website», event_source_url = origin, event_time = registreret_at,
 *   user_data: em (SHA-256 af den normaliserede mail), fn (SHA-256 af FØRSTE ord i fornavnet),
 *   external_id (SHA-256 af tilmeldings-id), client_user_agent, fbc (URL'ens fbclid med
 *   registreret_at som tidspunkt — ellers _fbc-cookien ordret), fbp (ordret). ALDRIG ln, ph,
 *   country (vi ved det ikke), IP eller en værdi i klartekst — findForbudteNoegler prøver den
 *   færdige payload, som for ansøgningerne.
 *
 * LÅSEN — sender for alvor KUN med dry_run: false OG enten
 *   (meta_send_aktiv OG webinarmotor_meta_aktiv)   — begge: den gamle er hovedafbryderen, den nye er
 *                                                    tilmeldingernes egen;
 *   ELLER (test_event_code OG tilmelding_id)        — beviset, for PRÆCIS én tilmelding. En testkode
 *                                                    alene sender ingen tilmeldinger: Metas ord er,
 *                                                    at testhændelser «are not dropped», så en
 *                                                    testkørsel uden id ville sende hele vinduet.
 */
import {
  bygFbc, erIVindue, FBC_FORM, type HashetBrugerdata, laasErAktiv, type MetaPayload, normaliserEmail, normaliserNavn,
  bygFbpFelt, USER_AGENT_MAKS,
} from "./metaSend.ts";

/** app_config-nøglen — tilmeldingernes EGEN lås. Fraværende = false (laasErAktiv(null) = false). */
export const WEBINAR_META_LAAS_NOEGLE = "webinarmotor_meta_aktiv";
/** Sporets art (meta_haendelser.art) — CHECK'en i 20261003070000 kender den. */
export const TILMELDING_ART = "registration" as const;
/** Metas standardhændelse for en tilmelding. */
export const TILMELDING_EVENT_NAME = "CompleteRegistration";
export const TILMELDING_CONTENT_NAME = "webinar_registration";
/** Rækkens markør for en gen-tilmelding fra rummet (webinar-rum «gen_tilmeld»). */
export const GEN_TILMELD_VIA = "gen_tilmeld";

/** event_id = «<tilmelding_id>:registration». Pixlens eventID på topix.dk SKAL være samme streng (B3). */
export function tilmeldingEventId(tilmeldingId: string): string {
  return `${tilmeldingId}:${TILMELDING_ART}`;
}

/** Rækken, kørslen læser (webinar_tilmeldinger + de to opslag). E-mail og fornavn læses KUN for at blive hashet. */
export interface TilmeldingTilMeta {
  id: string;
  kilde_system: string | null;
  /** raa->>intern — «true» på den interne prøvesessions rækker. */
  intern: string | boolean | null;
  /** raa->>via — «gen_tilmeld» for «Tag næste session». */
  via: string | null;
  registreret_at: string | null;
  email: string | null;
  fornavn: string | null;
  fbclid: string | null;
  fbp: string | null;
  fbc_cookie: string | null;
  /** Formularens landing (webinar-tilmeld: body.landing → origin). */
  origin: string | null;
  user_agent: string | null;
  /** Mailen står i webinar_afmeldinger. */
  afmeldt: boolean;
  /** En ansøgning på samme mail har meta_fravalg = true. */
  fravalgt: boolean;
}

export const TILMELDING_GRUNDE = [
  "ikke_platform", "intern", "afmeldt", "fravalgt", "gen_tilmelding",
  "ingen_user_agent", "ingen_landing", "ingen_tidspunkt", "for_gammel",
] as const;
export type TilmeldingGrund = (typeof TILMELDING_GRUNDE)[number];

export type TilmeldingDom = { ok: true; tid: Date } | { ok: false; grund: TilmeldingGrund };

export const erInternRaekke = (r: Pick<TilmeldingTilMeta, "intern">): boolean => r.intern === true || r.intern === "true";

/**
 * Dommen pr. tilmelding. RÆKKEFØLGEN er med vilje: hvem der aldrig må sendes (eWebinar, intern,
 * afmeldt, fravalgt) dømmes FØR alt andet — en afmeldt prøves ikke af på noget andet.
 */
export function doemTilmelding(r: TilmeldingTilMeta, nu: Date): TilmeldingDom {
  if (r.kilde_system !== "platform") return { ok: false, grund: "ikke_platform" };
  if (erInternRaekke(r)) return { ok: false, grund: "intern" };
  if (r.afmeldt) return { ok: false, grund: "afmeldt" };
  if (r.fravalgt) return { ok: false, grund: "fravalgt" };
  if (r.via === GEN_TILMELD_VIA) return { ok: false, grund: "gen_tilmelding" };
  if (!r.user_agent || r.user_agent.trim() === "") return { ok: false, grund: "ingen_user_agent" };
  if (!r.origin || r.origin.trim() === "") return { ok: false, grund: "ingen_landing" };
  const t = typeof r.registreret_at === "string" ? Date.parse(r.registreret_at) : Number.NaN;
  if (!Number.isFinite(t)) return { ok: false, grund: "ingen_tidspunkt" };
  const tid = new Date(t);
  if (!erIVindue(tid, nu)) return { ok: false, grund: "for_gammel" };
  return { ok: true, tid };
}

/** De TO brugerdatafelter, en tilmelding har — normaliseret efter Metas regler (metaSend.ts), stadig klartekst. */
export const TILMELDING_BRUGERDATA_NOEGLER = ["em", "fn"] as const;
export type TilmeldingBrugerdataNoegle = (typeof TILMELDING_BRUGERDATA_NOEGLER)[number];
export type TilmeldingBrugerdataRaa = Record<TilmeldingBrugerdataNoegle, string | null>;

/** em = normaliserEmail; fn = FØRSTE ord (et fornavnsfelt bærer intet efternavn — aldrig ln). */
export function normaliserTilmeldingBrugerdata(r: Pick<TilmeldingTilMeta, "email" | "fornavn">): TilmeldingBrugerdataRaa {
  return { em: normaliserEmail(r.email), fn: normaliserNavn(r.fornavn).fn };
}

/** Nøglerne, der ville blive sendt — til tørkørslen. ALDRIG værdierne. */
export function tilmeldingBrugerdataNoegler(raa: TilmeldingBrugerdataRaa): TilmeldingBrugerdataNoegle[] {
  return TILMELDING_BRUGERDATA_NOEGLER.filter((n) => typeof raa[n] === "string" && raa[n] !== "");
}

/** Hasher KUN de felter, der findes. Hasheren gives ind (sha256Hex), så filen er crypto-fri. */
export async function hashTilmeldingBrugerdata(raa: TilmeldingBrugerdataRaa, hash: (s: string) => Promise<string>): Promise<HashetBrugerdata> {
  const ud: HashetBrugerdata = {};
  for (const n of tilmeldingBrugerdataNoegler(raa)) ud[n] = [await hash(raa[n] as string)];
  return ud;
}

/**
 * fbc i TO led: (1) URL'ens fbclid med registreret_at som tidspunkt — Metas regel «use the
 * timestamp when you first observed or received this fbclid value»; (2) _fbc-cookien ORDRET.
 * Ellers intet fbc.
 */
export function tilmeldingFbc(r: Pick<TilmeldingTilMeta, "fbclid" | "fbc_cookie">, setTid: Date): string | null {
  const klik = (r.fbclid ?? "").trim();
  if (klik !== "") return bygFbc(klik, setTid);
  const c = (r.fbc_cookie ?? "").trim();
  return FBC_FORM.test(c) ? c : null;
}

export function tilmeldingFbcKilde(r: Pick<TilmeldingTilMeta, "fbclid" | "fbc_cookie">): "klik_id" | "cookie" | "ingen" {
  if ((r.fbclid ?? "").trim() !== "") return "klik_id";
  return FBC_FORM.test((r.fbc_cookie ?? "").trim()) ? "cookie" : "ingen";
}

/**
 * Payloaden. externalIdAftryk = sha256Hex(tilmeldings-id) og `hashet` =
 * hashTilmeldingBrugerdata(...) regnes af kalderen. Spredningen lægger kun felter ind, der findes.
 */
export function bygTilmeldingPayload(
  r: TilmeldingTilMeta,
  tid: Date,
  externalIdAftryk: string,
  hashet: HashetBrugerdata,
): MetaPayload {
  const fbc = tilmeldingFbc(r, tid);
  const fbp = bygFbpFelt(r.fbp);
  const ua = (r.user_agent ?? "").trim().slice(0, USER_AGENT_MAKS);
  return {
    event_name: TILMELDING_EVENT_NAME,
    event_time: Math.floor(tid.getTime() / 1000),
    event_id: tilmeldingEventId(r.id),
    action_source: "website",
    event_source_url: (r.origin ?? "").trim(),
    user_data: {
      ...hashet,
      external_id: [externalIdAftryk],
      client_user_agent: ua,
      ...(fbc !== null ? { fbc } : {}),
      ...(fbp !== null ? { fbp } : {}),
    },
    custom_data: { content_name: TILMELDING_CONTENT_NAME },
  };
}

/**
 * PORTEN (samme form som ti_minutter, 20261003040000): migrationen 20261003070000 lægger
 * låsens række (false). Findes rækken, er sporets CHECK'er udvidet — og KUN da sendes der
 * noget, OGSÅ med en testkode. Uden porten ville en testhændelse nå Meta, men sporets række
 * blive afvist (23502 på ansoegning_id, 23514 på art), så næste testkørsel sendte den igen.
 *   klar               rækken findes (værdien er låsens sag)
 *   migration_mangler  rækken findes ikke
 *   laesefejl          app_config kunne ikke læses — fail-closed
 */
export type TilmeldingPort = "klar" | "migration_mangler" | "laesefejl";

/**
 * Sender kørslen tilmeldinger for alvor? dry_run: false OG porten «klar» OG
 *   (begge låse — meta_send_aktiv OG webinarmotor_meta_aktiv)
 *   ELLER (testkode OG præcis én tilmelding).
 */
export function tilmeldingSenderRigtigt(a: {
  dryRun: boolean; port: TilmeldingPort; metaLaasAktiv: boolean; webinarLaasAktiv: boolean; testEventCode: string | null; tilmeldingId: string | null;
}): boolean {
  if (a.dryRun) return false;
  if (a.port !== "klar") return false;
  if (a.testEventCode !== null && a.tilmeldingId !== null) return true;
  return a.metaLaasAktiv && a.webinarLaasAktiv;
}

/** Låsens værdi → åben? Samme dom som meta_send_aktiv: kun true/"true". Fraværende (null) = lukket. */
export const webinarMetaLaasAaben = (configValue: unknown): boolean => laasErAktiv(configValue);

/** Læsningen af låsens række → port + lås. En fejl er «laesefejl» og lukket; ingen række er «migration_mangler» og lukket. */
export function laesWebinarLaas(svar: { fejl: boolean; raekke: { config_value?: unknown } | null }): { port: TilmeldingPort; aaben: boolean } {
  if (svar.fejl) return { port: "laesefejl", aaben: false };
  if (svar.raekke === null) return { port: "migration_mangler", aaben: false };
  return { port: "klar", aaben: webinarMetaLaasAaben(svar.raekke.config_value ?? null) };
}

/** Tørkørslens plan pr. tilmelding — nøglerne, aldrig værdierne. */
export interface TilmeldingPlan {
  event_id: string;
  tilmelding_id: string;
  event_time: string;
  fbc_kilde: "klik_id" | "cookie" | "ingen";
  fbp: boolean;
  brugerdata: TilmeldingBrugerdataNoegle[];
  forsoeg: number;
}

/** Svarets felt `tilmeldinger` — beviset for udrulningen (kun den nye kode har det). */
export interface TilmeldingResultat {
  /** klar · migration_mangler · laesefejl — findes låsens række (= migrationen 20261003070000 er kørt)? */
  port: TilmeldingPort;
  /** app_config.webinarmotor_meta_aktiv som læst (fail-closed; fraværende = false). */
  laas_aktiv: boolean;
  sender_rigtigt: boolean;
  tilmelding_id: string | null;
  kandidater: number;
  ville_sende: TilmeldingPlan[];
  sprunget: Record<TilmeldingGrund | "allerede_sendt" | "ugyldig", number>;
  sendt: number;
  payload_afvist: number;
  fejlede: number;
  udsat: number;
  /** Læsefejl i tilmeldingspasset (fx 42703 før skive 1) — passet er isoleret; ansøgningerne kører. */
  fejl: string | null;
}

export function tomtTilmeldingResultat(tilmeldingId: string | null): TilmeldingResultat {
  return {
    port: "laesefejl", laas_aktiv: false, sender_rigtigt: false, tilmelding_id: tilmeldingId, kandidater: 0, ville_sende: [],
    sprunget: {
      ikke_platform: 0, intern: 0, afmeldt: 0, fravalgt: 0, gen_tilmelding: 0,
      ingen_user_agent: 0, ingen_landing: 0, ingen_tidspunkt: 0, for_gammel: 0, allerede_sendt: 0, ugyldig: 0,
    },
    sendt: 0, payload_afvist: 0, fejlede: 0, udsat: 0, fejl: null,
  };
}
