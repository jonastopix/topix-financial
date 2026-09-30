/**
 * driftDom — DRIFTSAGENTENS DOM, skive 1 (30/9-2026; Jonas: «den overvåger
 * cron-jobs, fejl, mailudsendelser og svartider og skriver til dig, før noget
 * går galt»). Grundlaget er ~/analyse-drift.md (docs/analyser-30-09/analyse-drift.md).
 *
 * HVORFOR DEN FINDES (analysens fund, målt i kode — ikke i prod):
 *   §0 #1  vagten (vagt_cron, 9. version) melder kun rødt ved ≥ 2 jobs med
 *          ikke-200 (20260916170000_vagtens_samlemail.sql:369). Ét job, der
 *          svarer 500 ved hver kørsel, er GRØNT. HER: ét job er nok.
 *   §0 #2  16 af 22 edge-crons svarer 200, også når rækker fejler (fejlet++,
 *          fejl.push). HER: kroppen læses (kernefelterne nedenfor).
 *   §0 #5  ingen vagt for vagten. HER: vagt-cron skal have kørt OG skrevet sin
 *          række, og agenten tjekker sin EGEN forrige kørsel.
 *   §0 #7  intet opdager et job, der ikke kører. HER: hjerteslaget — skemaet
 *          regnes ud, og en forventet kørsel, der ikke kom, er rød.
 *   (samt) sporene (udfald i webinar_mails, klaviyo_*, meta/ga_haendelser,
 *          email_send_log), webinarmails, der venter tæt på deres frist, og
 *          svartider tæt på jobbets timeout (SVARTID_GUL_ANDEL).
 *
 * REN OG DENO-FRI. Ingen fetch, ingen tid udefra: `nu` gives ind. Imports kun fra
 * rene _shared-filer: webinarMailAlarm.ts (fristFor, danskDatoKlokke — SAMME
 * frist som webinarmail-alarmen og dommen, så de tre er enige) og hverdage.ts
 * (kbhDele). Grundlaget læses af SQL-funktionen public.drift_agent_laes()
 * (migration 20260930150000_driftsagent.sql) — rå rækker; ALLE regler bor her.
 *
 * INGEN PERSONDATA I TEKSTERNE. Sætningerne bygges af jobnavne, spornavne, tal
 * og klokkeslæt. Den eneste fremmede tekst er pg_crons fejlbesked for et
 * SQL-job — den føres gennem udenMail() (en adresse bliver «(mail)»), og kun
 * de første BESKED_MAKS tegn. Kroppen af et HTTP-svar citeres ALDRIG: SQL'en
 * udtrækker kun kernefelterne (tal og sandhedsværdier) — se KERNE_FELTER.
 *
 * TILSKRIVNINGEN af et svar til et job er TID (som vagten, men med jobbets
 * egen timeout i stedet for vagtens faste 2 min — analysens §2(1) fjerde
 * punkt): et svar hører til den seneste kørsel af et HTTP-job, der startede
 * højst (timeout + SVAR_MARGIN_MS) før svaret. Et svar, der bærer markøren
 * «drift_agent», hører altid til agentens eget job. To jobs i samme minut kan
 * stadig fejltilskrives — tvetydige står i tal.tvetydige_svar, og sætningerne
 * siger «tilskrevet efter tid».
 */
import { kbhDele } from "./hverdage.ts";
import { danskDatoKlokke, fristFor } from "./webinarMailAlarm.ts";
import type { MailArt } from "./webinarMailDom.ts";

// ── Markøren og konstanterne ─────────────────────────────────────────────────

/** Beviset i svaret (CLAUDE.md «Deployment af edge functions» trin 4): kun den nye kode svarer med den. */
export const DRIFT_AGENT_MARKOER = "skive-1";
/** Agentens eget funktionsnavn — dens svar bærer markøren og tilskrives altid dens eget job. */
export const DRIFT_AGENT_FUNKTION = "drift-agent-cron";
/** Agentens cron-job (migration 20260930152000_driftsagent_cron.sql). */
export const DRIFT_AGENT_JOB = "drift-agent";
/** Vagtens job — «vagt for vagten». */
export const VAGT_JOB = "vagt-cron";

/** pg_cron kan starte et job lidt sent; en forventet kørsel dømmes først, når den er SLAEK_MS gammel. */
export const SLAEK_MS = 5 * 60_000;
/** En kørsel tæller for en forventet fyring, hvis den startede højst så længe FØR fyringen (ur-skævhed). */
export const FOER_TOLERANCE_MS = 60_000;
/** SQL'en læser kørsler og svar 25 timer tilbage — et døgnjob kan dømmes, et ugejob ikke. */
export const DATA_VINDUE_MS = 25 * 3_600_000;
/** Et svar kan komme op til jobbets timeout efter kørslens start — plus denne margin (pg_net-køen, netværk). */
export const SVAR_MARGIN_MS = 60_000;
/**
 * kald_edge uden timeout-argument bruger kald_edge_standard_ms() = 30 000
 * (20260910180000_kald_edge.sql — «SELECT 30000»; driftDom.guard holder tallet i
 * takt). Tallet står her, fordi service_role ikke må kalde kald_edge_standard_ms()
 * (REVOKE … FROM PUBLIC i samme migration) — SQL-læseren returnerer null.
 */
export const KALD_EDGE_STANDARD_MS = 30_000;
/** pg_nets egen standard for et råt net.http_post uden timeout_milliseconds (analysen §1). */
export const PG_NET_STANDARD_MS = 5_000;

/** Vagten kører hvert kvarter over (7 * * * *): en time + 15 min uden en ny række i cron_vagt_log = tavs. */
export const VAGT_TAVS_MS = 75 * 60_000;
/**
 * Agenten kører hvert 15. min (10,25,40,55 * * * *). Er dens forrige RIGTIGE
 * kørsel ældre end to intervaller + 5 min, har den sprunget mindst én over:
 * 2 × 15 + 5 = 35 min.
 */
export const AGENT_INTERVAL_MS = 15 * 60_000;
export const AGENT_SPRANG_MS = 2 * AGENT_INTERVAL_MS + 5 * 60_000;

/**
 * Stigende fejlrate i et spor (seneste time mod de foregående 23 timer):
 *   RØD  når ≥ SPOR_ROED_MIN_FEJL fejl OG fejlraten ≥ SPOR_ROED_RATE (halvdelen fejler — noget er i stykker).
 *   GUL  når ≥ SPOR_GUL_MIN_FEJL fejl OG fejlraten ≥ SPOR_GUL_RATE OG fejlraten er
 *        mindst SPOR_GUL_STIGNING over døgnets (det er «stigende»: 25 % hele døgnet er
 *        et andet problem end 25 % nu mod 2 % før).
 * Fejlrate = fejl ÷ (ok + fejl); neutrale udfald (fx «loft», «suppressed») tæller hverken med.
 */
export const SPOR_ROED_MIN_FEJL = 5;
export const SPOR_ROED_RATE = 0.5;
export const SPOR_GUL_MIN_FEJL = 3;
export const SPOR_GUL_RATE = 0.2;
export const SPOR_GUL_STIGNING = 0.1;

/** Webinarmails, der venter (over loftet): rød når den tidligste frist er ≤ 2 t væk, gul ≤ 12 t. */
export const FRIST_ROED_MS = 2 * 3_600_000;
export const FRIST_GUL_MS = 12 * 3_600_000;
/** Den første frist-dom læser webinar-mail-cronens seneste svar. */
export const WEBINAR_MAIL_FUNKTION = "webinar-mail-cron";

/**
 * SVARTIDEN (Jonas 30/9: «… og svartider»): et 200-svar, der kom efter mindst
 * SVARTID_GUL_ANDEL af jobbets timeout, er GULT — «før noget går galt»: næste
 * kørsel med lidt mere arbejde får timeout, og en timeout midt i en afsendelse
 * er dublet-klassen fra 29/9 (analysen §0 #3, #4). Svartiden er
 * svar.created − kørslens start (pg_net skriver svarrækken, når svaret er
 * modtaget; kald_edge returnerer straks), tilskrevet efter tid.
 *   Eksempel: webinar-mail (60 s) svarer efter 49 s → 49 000 ≥ 0,8 × 60 000 = 48 000 → gul.
 */
export const SVARTID_GUL_ANDEL = 0.8;

/** pg_crons fejlbesked citeres højst så langt, og altid gennem udenMail(). */
export const BESKED_MAKS = 160;

/**
 * Kernefelterne — det ENESTE, SQL-funktionen drift_agent_kerne() tager ud af et
 * 200-svar (tal og sandhedsværdier, aldrig tekst). driftDom.guard kræver, at hvert
 * felt står i migrationen, og at migrationen ikke tager andre.
 *   ok · dry_run          kroppens egne
 *   fejlede · fejlet      tal (webinar-mail/meta/ga/klaviyo-profil · rykker/indgang/fornyelse/slet/onboarding)
 *   fejl                  tal, ELLER længden af en liste, ELLER 1 for en tekst (500-svarets «fejl: grund»)
 *   faktura_i_haanden     længden af listen (indgangs-paamindelser: penge)
 *   over_loft · udsat     tal (webinar-mail; udsat også meta/ga/klaviyo)
 *   ventende              webinar-mail: de DISTINKTE (art, session_tid) — ingen mails
 *   drift_agent           agentens egen markør
 */
export const KERNE_FELTER = ["ok", "dry_run", "fejlede", "fejlet", "fejl", "faktura_i_haanden", "over_loft", "udsat", "ventende", "drift_agent"] as const;

/**
 * Functions, der SELV mailer driftModtager ved fejl i rækker (klokkeMail.ts
 * SELVMAILENDE_REFERENCER + klokke-mail-cron). Et fejltal i deres krop er GUL her —
 * de har allerede alarmeret; rød kun ved ok:false eller ikke-200.
 */
export const SELVALARMERENDE_FUNKTIONER = [
  "klaviyo-gensend-cron", "klaviyo-profil-cron", "meta-send-cron", "ga-send-cron", "klokke-mail-cron", "webinar-mail-cron", DRIFT_AGENT_FUNKTION,
] as const;

/**
 * De jobs, der skal findes i prod (analysens §4 «forventet» — minus
 * klaviyo-hentning, som docs/marketingmotoren.md:385 siger ikke findes). Et
 * manglende job er GUL (prod-tilstanden er umålt — første kørsel viser den);
 * mangler vagten, er det RØDT.
 */
export const FORVENTEDE_JOBS = [
  "agent-runs-opbevaring", "agentforslag-udloeb", "ansoegning-rykker", "certifikat-klokke", "cleanup-stale-processing-reports",
  "daily-report-reminder", "event-reminders", "event-reminders-time", "fornyelsesvarsler", "ga-send", "generate-weekly-focus",
  "indgangs-paamindelser", "intro-session-reminder", "klaviyo-gensend", "klaviyo-profil", "klokke-mail", "legat-reminder-cron",
  "meta-annoncer", "meta-hentning-vagt", "meta-send", "onboarding-rytme", "opgave-forfald", "opgave-udloeb",
  "process-notification-emails", "report-review-cron", "slet-medlemsdata", "stille-klokker", VAGT_JOB,
  "webinar-delinger-opbevaring", "webinar-mail", DRIFT_AGENT_JOB,
] as const;

/** Jobs, repoet har afplanlagt (analysens §1 sidste række). Står de endnu: GUL. */
export const DOEDE_JOBS = [
  "send-monthly-digest", "send-pulse-reminder", "daily-reflection-nudge", "process-email-queue", "send-notification-email",
  "daily-circle-sync", "weekly-engagement-nudge",
] as const;

/**
 * Sporene — hvilke udfald er ok, og hvilke er neutrale (hverken ok eller fejl).
 * Alt andet er fejl. Tabellernes CHECK'er: webinar_mails/klaviyo_profil (ok ·
 * ingen_noegle · noegle_afvist · loft · ugyldig · fejl · timeout),
 * klaviyo_haendelser (samme, uden CHECK), meta/ga_haendelser (sendt · fejl ·
 * timeout · ugyldig · ingen_noegle), email_send_log.status (pending · sent ·
 * suppressed · failed · bounced · complained · dlq · rate_limited).
 * «loft» er throttlen (webinarMailAlarm har sin egen alarm) — neutral her.
 * `tid` er kolonnen, SQL'en tæller på, `felt` udfaldskolonnen; driftDom.guard holder listen og
 * SQL'ens værdiliste (drift_agent_laes) i takt.
 */
export const SPOR = [
  { navn: "webinar_mails", tid: "forsoegt_at", felt: "udfald", ok: ["ok"], neutral: ["loft"] },
  { navn: "klaviyo_haendelser", tid: "sendt_at", felt: "udfald", ok: ["ok"], neutral: ["loft"] },
  { navn: "klaviyo_profil", tid: "forsoegt_at", felt: "udfald", ok: ["ok"], neutral: ["loft"] },
  { navn: "meta_haendelser", tid: "sidste_forsoeg_at", felt: "udfald", ok: ["sendt"], neutral: [] as string[] },
  { navn: "ga_haendelser", tid: "sidste_forsoeg_at", felt: "udfald", ok: ["sendt"], neutral: [] as string[] },
  { navn: "email_send_log", tid: "created_at", felt: "status", ok: ["sent"], neutral: ["pending", "suppressed", "bounced", "complained"] },
] as const;

// ── Grundlaget (det, drift_agent_laes() svarer med) ─────────────────────────

export interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  /** Funktionsnavnet i kald_edge('<navn>') eller …/functions/v1/<navn> — null for rene SQL-jobs. */
  maal: string | null;
  kald_edge: boolean;
  http_post: boolean;
  /** Eksplicit timeout i kommandoen — null = standarden (KALD_EDGE_STANDARD_MS / PG_NET_STANDARD_MS). */
  timeout_ms: number | null;
}

export interface CronKoersel {
  runid: number;
  jobid: number;
  /** pg_cron: starting · running · sending · connecting · succeeded · failed */
  status: string;
  start: string;
  slut: string | null;
  /** return_message — KUN for failed (SQL'en udelader den ellers). */
  besked: string | null;
}

export interface Kerne {
  ok?: boolean;
  dry_run?: boolean;
  fejlede?: number;
  fejlet?: number;
  fejl?: number;
  faktura_i_haanden?: number;
  over_loft?: number;
  udsat?: number;
  ventende?: { art: string; session_tid: string }[] | null;
  drift_agent?: string;
  /** Kroppen lignede JSON, men kunne ikke læses. */
  ulaeselig?: boolean;
}

export interface HttpSvar {
  id: number;
  status: number | null;
  timeout: boolean;
  transportfejl: boolean;
  created: string;
  /** Kun for status 200 — null ellers, eller når kroppen ikke er et JSON-objekt. */
  kerne: Kerne | null;
}

export interface SporTal {
  spor: string;
  /** true = den seneste time; false = de foregående 23 timer. */
  time: boolean;
  udfald: string;
  n: number;
}

export interface VagtRaekke {
  tid: string;
  dom: string;
  grunde: string[] | null;
}

export interface AgentForrige {
  tid: string;
  alvor: string;
  alarm_mail: string | null;
}

export interface DriftGrundlag {
  nu: Date;
  jobs: readonly CronJob[];
  koersler: readonly CronKoersel[];
  /** Loftet på læste kørsler blev ramt INDEN FOR vinduet — så mangler der kørsler bagerst. */
  koersler_loft_ramt: boolean;
  aeldste_koersel: string | null;
  svar: readonly HttpSvar[];
  spor: readonly SporTal[];
  vagt: VagtRaekke | null;
  /** Agentens forrige RIGTIGE kørsel (dry_run = false) i drift_agent_koersler — null første gang. */
  forrige: AgentForrige | null;
  /**
   * Hvornår agenten første gang så hvert job (drift_agent_jobs) — et job, der er
   * yngre end sin seneste forventede fyring, dømmes ikke stille. null = ukendt
   * (tørkørsel før tabellen findes): alle jobs regnes for kendte.
   */
  foerst_set: Readonly<Record<string, string>> | null;
  /** Læsefejl fra SQL'en (en sektion, der ikke kunne læses) og fra functionen. */
  laesefejl: readonly string[];
}

// ── Dommen ───────────────────────────────────────────────────────────────────

export type Alvor = "roed" | "gul";
export type Samlet = "groen" | "gul" | "roed";

export type FundKode =
  | "kan_ikke_laese"      // en sektion af grundlaget kunne ikke læses
  | "kan_ikke_se_cron"    // 0 jobs — rettigheder/RLS
  | "vagt_mangler" | "vagt_tavs" | "vagt_roed"
  | "agent_sprang_over" | "alarm_kanal_fejlet"
  | "job_mangler" | "job_slukket" | "job_skulle_vaere_vaek" | "skema_ulaeseligt"
  | "stille"
  | "sql_fejl" | "startup_fejl"
  | "http_fejl"
  | "svartid_naer_timeout"
  | "svar_ok_false" | "faktura_i_haanden" | "fejl_i_svar"
  | "spor_fejlrate"
  | "mails_venter_frist";

export interface DriftFund {
  kode: FundKode;
  alvor: Alvor;
  /** Job-, spor- eller komponentnavnet — aftrykkets anden halvdel. */
  emne: string;
  /** Én menneskelig sætning. Ingen persondata. */
  saetning: string;
}

export interface DriftTal {
  jobs: number;
  aktive_jobs: number;
  koersler_laest: number;
  koersler_loft_ramt: boolean;
  svar_laest: number;
  svar_tilskrevet: number;
  tvetydige_svar: number;
  /** Jobs, hvis forventede fyring ligger uden for de læste data (fx ugejobs) — ikke dømt. */
  kan_ikke_afgoeres: string[];
  /** Jobs, der er yngre end deres forventede fyring (foerst_set) — ikke dømt stille endnu. */
  nye_jobs: string[];
}

export interface DriftDom {
  alvor: Samlet;
  fund: DriftFund[];
  /** De RØDE fund som «kode:emne», sorteret og samlet med «|» — tom når intet er rødt. */
  aftryk: string;
  tal: DriftTal;
}

// ── Småting ──────────────────────────────────────────────────────────────────

/** En mailadresse i en fremmed tekst bliver «(mail)». */
export function udenMail(s: string): string {
  return s.replace(/[^\s<>()"',;:]+@[^\s<>()"',;:]+/g, "(mail)");
}

/** pg_crons fejlbesked, kort og uden adresser. */
export function kortBesked(s: string | null): string {
  const ren = udenMail((s ?? "").replace(/\s+/g, " ").trim());
  return ren.length > BESKED_MAKS ? `${ren.slice(0, BESKED_MAKS)}…` : ren;
}

/** pg_crons egne tekster ved forbindelsesfejl (samme tre som vagten, 7. version) — heler sig selv. */
export function erStartupFejl(besked: string | null): boolean {
  const b = (besked ?? "").toLowerCase();
  return b.includes("job startup timeout") || b.includes("connection failed") || b.includes("connection lost");
}

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : Number.NaN);
const tal = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const procent = (r: number): string => `${Math.round(r * 100)} %`;
const timerOrd = (t: number): string => `${(Math.round(t * 10) / 10).toString().replace(".", ",")} t`;

// ── Cron-skemaet ─────────────────────────────────────────────────────────────

/** Et læst skema: fem felter i UTC (pg_cron på Supabase kører i GMT), eller «N seconds». */
export type Skema =
  | { art: "felter"; minut: Set<number>; time: Set<number>; dag: Set<number>; maaned: Set<number>; ugedag: Set<number>; dagBegraenset: boolean; ugedagBegraenset: boolean }
  | { art: "sekunder"; sekunder: number };

function feltMaengde(felt: string, min: number, maks: number): Set<number> | null {
  const ud = new Set<number>();
  for (const del of felt.split(",")) {
    const m = del.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) return null;
    const [, basis, trinTekst] = m;
    let fra = min, til = maks;
    if (basis !== "*") {
      const [a, b] = basis.split("-").map(Number);
      fra = a;
      til = b ?? (trinTekst ? maks : a);
    }
    const trin = trinTekst ? Number(trinTekst) : 1;
    if (!Number.isInteger(fra) || !Number.isInteger(til) || fra < min || til > maks || fra > til || trin < 1) return null;
    for (let i = fra; i <= til; i += trin) ud.add(i);
  }
  return ud;
}

/** Læser et pg_cron-skema. null = en form, dommen ikke kender (dømmes gul, aldrig gættet). */
export function laesSkema(s: string): Skema | null {
  const t = s.trim();
  const sek = t.match(/^(\d+)\s+seconds?$/i);
  if (sek) return Number(sek[1]) > 0 ? { art: "sekunder", sekunder: Number(sek[1]) } : null;
  const f = t.split(/\s+/);
  if (f.length !== 5) return null;
  const minut = feltMaengde(f[0], 0, 59);
  const time = feltMaengde(f[1], 0, 23);
  const dag = feltMaengde(f[2], 1, 31);
  const maaned = feltMaengde(f[3], 1, 12);
  const ugedagRaa = feltMaengde(f[4], 0, 7);
  if (!minut || !time || !dag || !maaned || !ugedagRaa) return null;
  // 7 = søndag = 0 (cron-konventionen).
  const ugedag = new Set([...ugedagRaa].map((d) => (d === 7 ? 0 : d)));
  return { art: "felter", minut, time, dag, maaned, ugedag, dagBegraenset: f[2] !== "*", ugedagBegraenset: f[4] !== "*" };
}

/**
 * UTC-ugedagen (0 = søndag), regnet af epoken: 1/1-1970 var en torsdag (4).
 * Bevidst IKKE Date.getUTCDay — isoUge.test's kildeværn fælder enhver fil under
 * supabase/functions/ med den (uge-nøgle-hændelsen 25/8); her er det cron-ugedagen,
 * ikke en uge-nøgle. Prøvet mod kendte datoer i driftDom.test.
 */
export function utcUgedag(d: Date): number {
  return (Math.floor(d.getTime() / 86_400_000) + 4) % 7;
}

/** Rammer skemaet dette minut (UTC)? Dag og ugedag: begge begrænset = ELLER (cron-reglen), ellers OG. */
export function matcherMinut(s: Extract<Skema, { art: "felter" }>, d: Date): boolean {
  if (!s.minut.has(d.getUTCMinutes()) || !s.time.has(d.getUTCHours()) || !s.maaned.has(d.getUTCMonth() + 1)) return false;
  const dagOk = s.dag.has(d.getUTCDate());
  const ugedagOk = s.ugedag.has(utcUgedag(d));
  if (s.dagBegraenset && s.ugedagBegraenset) return dagOk || ugedagOk;
  return dagOk && ugedagOk;
}

/** Hvor langt tilbage der ledes efter den seneste fyring: 8 døgn (et ugejob har én). */
export const SKEMA_BAGUD_MIN = 8 * 24 * 60;

/** Den seneste fyring ≤ foer (UTC, hele minutter). null = ingen inden for SKEMA_BAGUD_MIN. */
export function sidsteFyring(s: Skema, foer: Date): Date | null {
  if (s.art === "sekunder") {
    const trin = s.sekunder * 1000;
    return new Date(Math.floor(foer.getTime() / trin) * trin);
  }
  const start = Math.floor(foer.getTime() / 60_000) * 60_000;
  for (let i = 0; i <= SKEMA_BAGUD_MIN; i++) {
    const d = new Date(start - i * 60_000);
    if (matcherMinut(s, d)) return d;
  }
  return null;
}

// ── Tilskrivningen: svar → kørsel → job ─────────────────────────────────────

/** Jobbets timeout: den eksplicitte, ellers standarden for kaldets form. null = ikke et HTTP-job. */
export function jobTimeoutMs(j: CronJob): number | null {
  if (!j.kald_edge && !j.http_post) return null;
  if (j.timeout_ms !== null && Number.isFinite(j.timeout_ms)) return j.timeout_ms;
  return j.kald_edge ? KALD_EDGE_STANDARD_MS : PG_NET_STANDARD_MS;
}

export interface Tilskrivning {
  /** svar-id → jobid */
  job: Map<number, number>;
  /** svar-id → den tilskrevne kørsels start (ms) — svartidens nulpunkt. */
  start: Map<number, number>;
  tvetydige: number;
}

/**
 * Hvert svar tilskrives den SENESTE endnu ikke tilskrevne kørsel af et HTTP-job,
 * der startede i [svar − (timeout + SVAR_MARGIN_MS), svar]. Svaret med markøren
 * «drift_agent» KUN til agentens eget job — og et 200-svar UDEN markøren aldrig
 * til agentens job (agenten svarer altid 200 med markøren, så et sådant svar er
 * et andet jobs, og det må ikke stjæle agentens kørsel). Et svar uden kandidat =
 * manuelt kald. Tvetydig = kandidater fra mere end ét job.
 */
export function tilskrivSvar(jobs: readonly CronJob[], koersler: readonly CronKoersel[], svar: readonly HttpSvar[]): Tilskrivning {
  const jobPrId = new Map(jobs.map((j) => [j.jobid, j]));
  const httpKoersler = koersler
    .map((k) => ({ k, j: jobPrId.get(k.jobid), start: ms(k.start) }))
    .filter((x): x is { k: CronKoersel; j: CronJob; start: number } => x.j !== undefined && jobTimeoutMs(x.j) !== null && Number.isFinite(x.start))
    .sort((a, b) => a.start - b.start);
  const taget = new Set<number>();
  const job = new Map<number, number>();
  const start = new Map<number, number>();
  let tvetydige = 0;
  for (const s of [...svar].sort((a, b) => ms(a.created) - ms(b.created) || a.id - b.id)) {
    const t = ms(s.created);
    if (!Number.isFinite(t)) continue;
    const egen = typeof s.kerne?.drift_agent === "string";
    const agentensJob = (x: { j: CronJob }) => x.j.maal === DRIFT_AGENT_FUNKTION;
    const kandidater = httpKoersler.filter((x) =>
      !taget.has(x.k.runid) && x.start <= t && t - x.start <= (jobTimeoutMs(x.j) as number) + SVAR_MARGIN_MS &&
      (egen ? agentensJob(x) : !(s.status === 200 && s.kerne !== null && agentensJob(x))));
    if (kandidater.length === 0) continue;
    if (new Set(kandidater.map((x) => x.j.jobid)).size > 1) tvetydige++;
    const valgt = kandidater[kandidater.length - 1];
    taget.add(valgt.k.runid);
    job.set(s.id, valgt.j.jobid);
    start.set(s.id, valgt.start);
  }
  return { job, start, tvetydige };
}

// ── De enkelte regler ────────────────────────────────────────────────────────

function kl(iso: string | Date, nu: Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (!Number.isFinite(d.getTime())) return String(iso);
  const p = kbhDele(d), q = kbhDele(nu);
  const hhmm = `kl. ${String(p.time).padStart(2, "0")}:${String(p.minut).padStart(2, "0")}`;
  return p.aar === q.aar && p.maaned === q.maaned && p.dag === q.dag ? hhmm : danskDatoKlokke(d);
}

/**
 * Fejltallet i en krop: det STØRSTE af fejlede, fejlet og fejl — ikke summen.
 * Felterne beskriver de samme fejl i forskellige former (webinar-mail-cron:
 * fejlede = 3 OG en fejl-liste med de samme 3 linjer → 3, ikke 6).
 */
export function fejlTal(k: Kerne): number {
  return Math.max(tal(k.fejlede), tal(k.fejlet), tal(k.fejl));
}

function sporRegel(g: DriftGrundlag): DriftFund[] {
  const ud: DriftFund[] = [];
  for (const def of SPOR) {
    const raekker = g.spor.filter((r) => r.spor === def.navn);
    const klasse = (u: string) => ((def.ok as readonly string[]).includes(u) ? "ok" : (def.neutral as readonly string[]).includes(u) ? "neutral" : "fejl");
    const sum = (time: boolean, k: string) => raekker.filter((r) => r.time === time && klasse(r.udfald) === k).reduce((s, r) => s + tal(r.n), 0);
    const okT = sum(true, "ok"), fejlT = sum(true, "fejl");
    const okD = sum(false, "ok"), fejlD = sum(false, "fejl");
    if (fejlT === 0) continue;
    const rateT = fejlT / (okT + fejlT);
    const rateD = okD + fejlD > 0 ? fejlD / (okD + fejlD) : 0;
    const grundlag = `${fejlT} af ${okT + fejlT} forsøg fejlede den seneste time (${procent(rateT)}) mod ${procent(rateD)} de foregående 23 timer`;
    if (fejlT >= SPOR_ROED_MIN_FEJL && rateT >= SPOR_ROED_RATE) {
      ud.push({ kode: "spor_fejlrate", alvor: "roed", emne: def.navn, saetning: `${def.navn}: ${grundlag}.` });
    } else if (fejlT >= SPOR_GUL_MIN_FEJL && rateT >= SPOR_GUL_RATE && rateT >= rateD + SPOR_GUL_STIGNING) {
      ud.push({ kode: "spor_fejlrate", alvor: "gul", emne: def.navn, saetning: `${def.navn}: fejlraten stiger — ${grundlag}.` });
    }
  }
  return ud;
}

// ── Hele dommen ──────────────────────────────────────────────────────────────

export function doemDrift(g: DriftGrundlag): DriftDom {
  const nu = g.nu;
  const nuMs = nu.getTime();
  const fund: DriftFund[] = [];
  const kanIkke: string[] = [];
  const nye: string[] = [];

  // 0. Grundlaget selv.
  for (const f of g.laesefejl) {
    fund.push({ kode: "kan_ikke_laese", alvor: "roed", emne: f.split(":")[0] || "grundlag", saetning: `Driftsagenten kunne ikke læse sit grundlag: ${kortBesked(f)}.` });
  }
  if (g.jobs.length === 0 && !g.laesefejl.some((f) => f.startsWith("cron.job"))) {
    fund.push({ kode: "kan_ikke_se_cron", alvor: "roed", emne: "cron.job", saetning: "Driftsagenten ser 0 cron-jobs — service_role mangler adgang til cron.job (rettigheder eller RLS). Uden jobs kan intet dømmes." });
  }

  const jobPrNavn = new Map(g.jobs.map((j) => [j.jobname, j]));
  const koerslerPrJob = new Map<number, CronKoersel[]>();
  for (const k of [...g.koersler].sort((a, b) => a.runid - b.runid)) {
    const l = koerslerPrJob.get(k.jobid) ?? [];
    l.push(k);
    koerslerPrJob.set(k.jobid, l);
  }
  const aeldsteMs = ms(g.aeldste_koersel);
  const datagraense = Math.max(nuMs - DATA_VINDUE_MS, g.koersler_loft_ramt && Number.isFinite(aeldsteMs) ? aeldsteMs : -Infinity);

  // 1. Vagt for vagten.
  if (g.jobs.length > 0) {
    const vagt = jobPrNavn.get(VAGT_JOB);
    if (!vagt) fund.push({ kode: "vagt_mangler", alvor: "roed", emne: VAGT_JOB, saetning: `Cron-vagten (${VAGT_JOB}) findes ikke i cron.job — husets eneste generelle vagt kører ikke.` });
  }
  if (g.vagt === null) {
    if (!g.laesefejl.some((f) => f.startsWith("cron_vagt_log"))) {
      fund.push({ kode: "vagt_tavs", alvor: "roed", emne: "cron_vagt_log", saetning: "Cron-vagten har ingen række i cron_vagt_log — den har aldrig skrevet sin dom." });
    }
  } else {
    const alder = nuMs - ms(g.vagt.tid);
    if (!(alder <= VAGT_TAVS_MS)) {
      fund.push({ kode: "vagt_tavs", alvor: "roed", emne: "cron_vagt_log", saetning: `Cron-vagten skrev sidst sin dom ${kl(g.vagt.tid, nu)} (${Math.round(alder / 60_000)} min siden) — den skal skrive hver time.` });
    } else if (g.vagt.dom === "roed") {
      fund.push({ kode: "vagt_roed", alvor: "gul", emne: VAGT_JOB, saetning: `Cron-vagten er rød (${kl(g.vagt.tid, nu)}): ${(g.vagt.grunde ?? []).join(", ") || "ingen grund angivet"}. Vagten ringer selv sin klokke.` });
    }
  }

  // 2. Agenten selv — dens forrige RIGTIGE kørsel.
  if (g.forrige !== null) {
    const alder = nuMs - ms(g.forrige.tid);
    if (alder > AGENT_SPRANG_MS) {
      fund.push({ kode: "agent_sprang_over", alvor: "gul", emne: DRIFT_AGENT_JOB, saetning: `Driftsagentens forrige kørsel var ${kl(g.forrige.tid, nu)} (${Math.round(alder / 60_000)} min siden) — den skal køre hvert 15. min.` });
    }
    if ((g.forrige.alarm_mail ?? "").startsWith("fejlet")) {
      fund.push({ kode: "alarm_kanal_fejlet", alvor: "roed", emne: "alarmmail", saetning: `Driftsagentens forrige alarmmail (${kl(g.forrige.tid, nu)}) kunne ikke sendes: ${kortBesked(g.forrige.alarm_mail)}. Alarmkanalen (Lovables mail-API) er selv i fare.` });
    }
  }

  // 3. Jobbene findes, som de skal.
  if (g.jobs.length > 0) {
    for (const navn of FORVENTEDE_JOBS) {
      if (navn === VAGT_JOB) continue; // står i 1
      const j = jobPrNavn.get(navn);
      if (!j) fund.push({ kode: "job_mangler", alvor: "gul", emne: navn, saetning: `Jobbet ${navn} findes ikke i cron.job, men repoet og overleveringen forventer det.` });
      else if (!j.active) fund.push({ kode: "job_slukket", alvor: "gul", emne: navn, saetning: `Jobbet ${navn} står med active = false — det kører ikke.` });
    }
    for (const navn of DOEDE_JOBS) {
      if (jobPrNavn.get(navn)?.active) fund.push({ kode: "job_skulle_vaere_vaek", alvor: "gul", emne: navn, saetning: `Jobbet ${navn} er afplanlagt i repoet, men står stadig aktivt i cron.job.` });
    }
  }

  // 4. Hjerteslaget og den seneste kørsel pr. job. Kunne kørslerne ikke læses,
  // dømmes hjerteslaget ikke (ellers var HVERT job «stille» — kan_ikke_laese er rødt i forvejen).
  const kanSeKoersler = !g.laesefejl.some((f) => f.startsWith("cron.job_run_details"));
  const tilskrivning = tilskrivSvar(g.jobs, g.koersler, g.svar);
  const svarPrJob = new Map<number, HttpSvar[]>();
  for (const s of [...g.svar].sort((a, b) => ms(a.created) - ms(b.created) || a.id - b.id)) {
    const jobid = tilskrivning.job.get(s.id);
    if (jobid === undefined) continue;
    const l = svarPrJob.get(jobid) ?? [];
    l.push(s);
    svarPrJob.set(jobid, l);
  }

  for (const j of [...g.jobs].sort((a, b) => a.jobname.localeCompare(b.jobname))) {
    if (!j.active) continue;
    const egne = koerslerPrJob.get(j.jobid) ?? [];
    const skema = laesSkema(j.schedule);
    if (skema === null) {
      fund.push({ kode: "skema_ulaeseligt", alvor: "gul", emne: j.jobname, saetning: `Skemaet «${j.schedule}» for ${j.jobname} kan dommen ikke læse — hjerteslaget er ikke tjekket.` });
    } else if (kanSeKoersler) {
      const forventet = sidsteFyring(skema, new Date(nuMs - SLAEK_MS));
      const foerstSet = g.foerst_set ? ms(g.foerst_set[String(j.jobid)]) : Number.NaN;
      if (forventet === null || forventet.getTime() < datagraense) {
        kanIkke.push(j.jobname);
      } else if (g.foerst_set !== null && (!Number.isFinite(foerstSet) || foerstSet > forventet.getTime())) {
        nye.push(j.jobname);
      } else if (!egne.some((k) => ms(k.start) >= forventet.getTime() - FOER_TOLERANCE_MS)) {
        const sidst = egne.length > 0 ? egne[egne.length - 1].start : null;
        fund.push({
          kode: "stille", alvor: "roed", emne: j.jobname,
          saetning: `${j.jobname} har ikke kørt ${kl(forventet, nu)}, som skemaet (${j.schedule}, UTC) forventede — ${sidst ? `sidste kørsel ${kl(sidst, nu)}` : "ingen kørsel i det læste døgn"}.`,
        });
      }
    }

    // Seneste kørsel: SQL-fejl (rød) eller pg_crons forbindelsesfejl (gul).
    const seneste = egne[egne.length - 1];
    if (seneste && seneste.status === "failed") {
      if (erStartupFejl(seneste.besked)) {
        fund.push({ kode: "startup_fejl", alvor: "gul", emne: j.jobname, saetning: `${j.jobname} kom ikke i gang ${kl(seneste.start, nu)} (pg_cron: ${kortBesked(seneste.besked)}) — heler normalt sig selv.` });
      } else {
        fund.push({ kode: "sql_fejl", alvor: "roed", emne: j.jobname, saetning: `${j.jobname} fejlede i sin seneste kørsel ${kl(seneste.start, nu)} med en SQL-fejl: ${kortBesked(seneste.besked) || "(ingen besked)"}.` });
      }
    }

    // Seneste svar (tilskrevet efter tid).
    const svarene = svarPrJob.get(j.jobid) ?? [];
    const sidsteSvar = svarene[svarene.length - 1];
    if (!sidsteSvar) continue;
    const navn = j.maal ?? j.jobname;
    if (sidsteSvar.status !== 200) {
      const hvad = sidsteSvar.timeout
        ? `fik timeout (${Math.round((jobTimeoutMs(j) ?? 0) / 1000)} s)`
        : sidsteSvar.status === null ? "fik intet svar (transportfejl)" : `svarede ${sidsteSvar.status}`;
      fund.push({ kode: "http_fejl", alvor: "roed", emne: j.jobname, saetning: `${navn} ${hvad} i sin seneste kørsel ${kl(sidsteSvar.created, nu)} (tilskrevet efter tid).` });
      continue;
    }
    // Svartiden — også for agentens eget job.
    const timeout = jobTimeoutMs(j);
    const svarStart = tilskrivning.start.get(sidsteSvar.id);
    if (timeout !== null && svarStart !== undefined) {
      const svartid = ms(sidsteSvar.created) - svarStart;
      if (svartid >= SVARTID_GUL_ANDEL * timeout) {
        fund.push({
          kode: "svartid_naer_timeout", alvor: "gul", emne: j.jobname,
          saetning: `${navn} svarede ${kl(sidsteSvar.created, nu)} efter ${Math.round(svartid / 1000)} s — tæt på sin timeout på ${Math.round(timeout / 1000)} s (tilskrevet efter tid). Lidt mere arbejde, og kørslen afbrydes midt i.`,
        });
      }
    }
    const k = sidsteSvar.kerne;
    if (!k || k.ulaeselig || navn === DRIFT_AGENT_FUNKTION) continue;
    const selv = (SELVALARMERENDE_FUNKTIONER as readonly string[]).includes(navn);
    if (k.ok === false) {
      fund.push({ kode: "svar_ok_false", alvor: "roed", emne: j.jobname, saetning: `${navn} svarede 200 ${kl(sidsteSvar.created, nu)}, men kroppen siger ok: false.` });
      continue;
    }
    if (tal(k.faktura_i_haanden) > 0) {
      fund.push({ kode: "faktura_i_haanden", alvor: "roed", emne: j.jobname, saetning: `${navn} svarede 200 ${kl(sidsteSvar.created, nu)}, men ${tal(k.faktura_i_haanden)} ${tal(k.faktura_i_haanden) === 1 ? "faktura" : "fakturaer"} står «i hånden» — kunne ikke sendes automatisk.` });
    }
    const n = fejlTal(k);
    if (n > 0) {
      const forrigeSvar = svarene[svarene.length - 2];
      const gentaget = forrigeSvar?.status === 200 && forrigeSvar.kerne !== null && fejlTal(forrigeSvar.kerne) > 0;
      const alvor: Alvor = gentaget && !selv ? "roed" : "gul";
      fund.push({
        kode: "fejl_i_svar", alvor, emne: j.jobname,
        saetning: `${navn} svarede 200 ${kl(sidsteSvar.created, nu)}, men kroppen melder ${n} fejl${gentaget ? " — også i kørslen før" : ""}${selv ? " (functionen alarmerer selv)" : ""}.`,
      });
    }

    // Webinarmails, der venter tæt på deres frist.
    if (navn === WEBINAR_MAIL_FUNKTION) {
      const venter = tal(k.over_loft) + tal(k.udsat);
      const frister = (k.ventende ?? [])
        .map((v) => fristFor(v.art as MailArt, v.session_tid))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());
      if (venter > 0 && frister.length > 0) {
        const tilbage = frister[0].getTime() - nuMs;
        const alvor: Alvor | null = tilbage <= FRIST_ROED_MS ? "roed" : tilbage <= FRIST_GUL_MS ? "gul" : null;
        if (alvor) {
          const om = tilbage <= 0 ? "den er passeret" : `om ${timerOrd(tilbage / 3_600_000)}`;
          fund.push({ kode: "mails_venter_frist", alvor, emne: j.jobname, saetning: `${venter} webinarmails venter (over loftet ${tal(k.over_loft)}, udsat ${tal(k.udsat)}); den tidligste frist er ${kl(frister[0], nu)} — ${om}.` });
        }
      }
    }
  }

  // 5. Sporene.
  fund.push(...sporRegel(g));

  const roede = fund.filter((f) => f.alvor === "roed");
  const alvor: Samlet = roede.length > 0 ? "roed" : fund.length > 0 ? "gul" : "groen";
  return {
    alvor,
    fund: [...fund].sort((a, b) => (a.alvor === b.alvor ? 0 : a.alvor === "roed" ? -1 : 1)),
    aftryk: driftAftryk(fund),
    tal: {
      jobs: g.jobs.length,
      aktive_jobs: g.jobs.filter((j) => j.active).length,
      koersler_laest: g.koersler.length,
      koersler_loft_ramt: g.koersler_loft_ramt,
      svar_laest: g.svar.length,
      svar_tilskrevet: tilskrivning.job.size,
      tvetydige_svar: tilskrivning.tvetydige,
      kan_ikke_afgoeres: kanIkke,
      nye_jobs: nye,
    },
  };
}

/** De røde fund som «kode:emne», sorteret — samme røde billede = samme aftryk. */
export function driftAftryk(fund: readonly DriftFund[]): string {
  return [...new Set(fund.filter((f) => f.alvor === "roed").map((f) => `${f.kode}:${f.emne}`))].sort().join("|");
}

// ── Alarmen: nøgle, dedup og tekst ───────────────────────────────────────────

export const DRIFT_ALARM_NOEGLE_PRAEFIKS = "drift-agent:";
export const DRIFT_ALARM_MAIL_LABEL = "drift-agent-alarm";
/** Klokkens reference_type — står på klokkeMail.ts SELVMAILENDE_REFERENCER, fordi agenten selv mailer. */
export const DRIFT_ALARM_REFERENCE = "drift_agent_koersler";

const to = (n: number) => String(n).padStart(2, "0");

/** «2026-09-30» — dansk dato. */
export function driftDato(nu: Date): string {
  const p = kbhDele(nu);
  return `${p.aar}-${to(p.maaned)}-${to(p.dag)}`;
}

/** «drift-agent:2026-09-30T14» — én samlet mail pr. dansk TIME (webinarMailAlarms form for «fejl»). */
export function driftAlarmNoegle(nu: Date): string {
  return `${DRIFT_ALARM_NOEGLE_PRAEFIKS}${driftDato(nu)}T${to(kbhDele(nu).time)}`;
}

export type AlarmValg =
  | { mail: true }
  | { mail: false; grund: "ikke_roed" | "sender_ikke" | "fandtes_denne_time" | "samme_billede_i_dag" };

/**
 * Skal der mailes? Kun når noget er RØDT, kun i en rigtig kørsel (dry_run false OG
 * låsen åben), højst én gang pr. dansk time (nøglen fandtes i email_send_log) — og
 * ALDRIG to gange samme dag for PRÆCIS det samme røde billede (aftrykket): «jeg får
 * hele tiden disse mails» (Jonas 29/9, webinarMailAlarm). Et nyt rødt fund giver et
 * nyt aftryk og dermed en ny mail — også samme dag.
 */
export function skalAlarmere(a: { dom: DriftDom; senderRigtigt: boolean; noegleFandtes: boolean; aftrykMailetIDag: readonly string[] }): AlarmValg {
  if (a.dom.alvor !== "roed") return { mail: false, grund: "ikke_roed" };
  if (!a.senderRigtigt) return { mail: false, grund: "sender_ikke" };
  if (a.noegleFandtes) return { mail: false, grund: "fandtes_denne_time" };
  if (a.aftrykMailetIDag.includes(a.dom.aftryk)) return { mail: false, grund: "samme_billede_i_dag" };
  return { mail: true };
}

export interface DriftAlarmTekst {
  emne: string;
  /** Klokkens titel — bærer dansk dato og time, så klokkens dedup (på titlen) følger nøglen. */
  titel: string;
  afsnit: string[];
  tekst: string;
}

/** Mailens og klokkens tekst. Ren; rammen (indgangsMailHtml) lægges på i functionen. */
export function driftAlarmTekst(dom: DriftDom, nu: Date): DriftAlarmTekst {
  const roede = dom.fund.filter((f) => f.alvor === "roed");
  const gule = dom.fund.filter((f) => f.alvor === "gul");
  const stempel = `${driftDato(nu)} kl. ${to(kbhDele(nu).time)}:${to(kbhDele(nu).minut)}`;
  const foerste = roede[0];
  const emne = roede.length === 1
    ? `Driften: ${foerste.emne} — ${foerste.kode.replace(/_/g, " ")}`
    : `Driften: ${roede.length} røde fund (${[...new Set(roede.map((f) => f.emne))].slice(0, 3).join(", ")}${roede.length > 3 ? " …" : ""})`;
  const titel = `Driftsagenten: ${roede.length} rød${roede.length === 1 ? "t" : "e"} (${driftDato(nu)}T${to(kbhDele(nu).time)})`;
  const afsnit = [
    `Driftsagenten ${stempel}: ${roede.length} rød${roede.length === 1 ? "t fund" : "e fund"}${gule.length > 0 ? ` og ${gule.length} gul${gule.length === 1 ? "t" : "e"}` : ""}.`,
    ...roede.map((f) => `RØD · ${f.saetning}`),
    ...gule.map((f) => `GUL · ${f.saetning}`),
    `Læst: ${dom.tal.jobs} jobs (${dom.tal.aktive_jobs} aktive), ${dom.tal.koersler_laest} kørsler${dom.tal.koersler_loft_ramt ? " (loftet ramt)" : ""}, ${dom.tal.svar_laest} svar (${dom.tal.svar_tilskrevet} tilskrevet efter tid, ${dom.tal.tvetydige_svar} tvetydige).`,
    "Samme røde billede mailes højst én gang om dagen; et nyt rødt fund giver en ny mail. Tørkørsel i hånden: SELECT public.kald_edge('drift-agent-cron');",
  ];
  return { emne, titel, afsnit, tekst: afsnit.join("\n") };
}
