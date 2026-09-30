// drift-agent-cron — DRIFTSAGENTEN, skive 1 (30/9-2026; Jonas: «den overvåger
// cron-jobs, fejl, mailudsendelser og svartider og skriver til dig, før noget går
// galt»). Grundlaget: ~/analyse-drift.md (fund §0 #1, #2, #5, #7).
//
// BUCKET B: authenticateServiceRole FØRST, verify_jwt = true (config.toml), kaldt
// af pg_cron gennem kald_edge hvert 15. min (migration 20260930152000).
//
// TØRKØRSEL SOM STANDARD — uden body (eller {"dry_run": true}) læses og dømmes der,
// og svaret bærer hele dommen, men INTET skrives og intet sendes. Ukendte felter
// afvises (kendteFelter.ts; bodyFelter.guard STRIKS).
// {"dry_run": false} er en RIGTIG kørsel: den logger sig i drift_agent_koersler
// (vagt for sig selv), noterer nye jobs i drift_agent_jobs — og mailer KUN, når
// låsen app_config['driftsagent_aktiv'] = true (fail-closed: ikke sat = false).
// Cron-jobbet kalder med dry_run: false fra første dag, så agenten logger og
// dømmer i drift, mens låsen styrer afsendelsen (samme adskillelse som
// meta_send_aktiv / webinar_mail_aktiv).
//
// DOMMEN bor i _shared/driftDom.ts (ren, testet). Her hentes kun data:
//   public.drift_agent_laes()   SELECT-only (SECURITY DEFINER efter 20260930151000,
//                               som kræver Jonas' grønne lys — ellers INVOKER og et
//                               rødt «kan ikke læse»-fund): cron.job,
//                               cron.job_run_details (seneste 3000 gennem runid),
//                               net._http_response (25 t, kun kernefelterne af
//                               kroppen), sporenes udfald (time/døgn), cron_vagt_log
//   drift_agent_koersler        agentens egen forrige RIGTIGE kørsel
//   drift_agent_jobs            hvornår agenten første gang så hvert job
//
// ALARMEN (kun rødt, kun rigtig kørsel med åben lås): ÉN samlet mail til
// driftModtager() gennem sendManagedEmail (aldrig Mailgun) pr. dansk TIME
// (nøglen «drift-agent:<dato>T<time>», email_send_log slås op FØR afsendelsen —
// webinarMailAlarms form) — og aldrig to gange samme dag for det SAMME røde
// billede (aftrykket, drift_agent_koersler). Klokken er type «drift» med
// reference_type «drift_agent_koersler», som står på klokkeMail.ts
// SELVMAILENDE_REFERENCER (én alarm, én mail).
//
// DEN GULE OPSAMLING (fund 5, 30/9): gule fund er aldrig en alarm, men samles i
// ÉN mail til driftModtager() kl. 07 dansk på hverdage (skalOpsamleGule) — samme
// lås, dedup pr. dansk dag (nøglen «drift-agent-gul:<dato>» slås op i
// email_send_log FØR afsendelsen). Ingen klokke: den gule er en morgenliste.
//
// BEVISET (CLAUDE.md trin 4): svaret bærer drift_agent: "skive-1" — kun den nye
// kode svarer med det.
//
// KASTER ALDRIG ud af kørslen: læsefejl bliver fund i dommen (rød), alarmfejl
// står i svaret og i loggen, og næste kørsel ser dem (alarm_kanal_fejlet).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { sendManagedEmail } from "../_shared/managedEmail.ts";
import { driftModtager } from "../_shared/driftModtager.ts";
import { indgangsMailHtml } from "../_shared/indgangsMail.ts";
import { kbhTilUtc } from "../_shared/hverdage.ts";
import {
  type AgentForrige,
  type AlarmValg,
  type CronJob,
  type CronKoersel,
  DRIFT_AGENT_MARKOER,
  DRIFT_ALARM_MAIL_LABEL,
  DRIFT_ALARM_REFERENCE,
  DRIFT_GUL_MAIL_LABEL,
  driftAlarmNoegle,
  driftGulNoegle,
  driftGulTekst,
  driftAlarmTekst,
  driftDato,
  type DriftDom,
  doemDrift,
  type GulValg,
  type HttpSvar,
  skalAlarmere,
  skalOpsamleGule,
  type SporTal,
  type VagtRaekke,
} from "../_shared/driftDom.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run"] as const;

/** Låsen — fail-closed: kun true (eller «true») åbner for afsendelse. */
export const LAAS_NOEGLE = "driftsagent_aktiv";
/** Agentens egen log ryddes efter så mange dage (96 rækker i døgnet). */
export const OPBEVARING_DAGE = 30;
const LOG = "[drift-agent-cron]";

/** Hvad drift_agent_laes() svarer med (migration 20260930150000). */
interface Laest {
  nu: string;
  jobs: CronJob[];
  koersler: CronKoersel[];
  koersler_loft_ramt: boolean;
  aeldste_koersel: string | null;
  svar: HttpSvar[];
  spor: SporTal[];
  vagt: VagtRaekke | null;
  fejl: string[] | null;
}

export interface DriftAgentResultat {
  ok: boolean;
  /** Beviset for udrulningen — kun denne kode svarer med det. */
  drift_agent: typeof DRIFT_AGENT_MARKOER;
  dry_run: boolean;
  laas_aktiv: boolean;
  sender_rigtigt: boolean;
  nu: string;
  alvor: DriftDom["alvor"];
  fund: DriftDom["fund"];
  aftryk: string;
  tal: DriftDom["tal"];
  forrige: AgentForrige | null;
  laesefejl: string[];
  /** Alarmens afgørelse: «mail» eller grunden til at lade være. */
  alarm_valg: string;
  /** «ingen» · «sendt» · «fejlet: …» */
  alarm_mail: string;
  /** «ingen» · «skrevet» · «fandtes» · «fejlet: …» */
  alarm_klokke: string;
  /** Den gule opsamlings afgørelse (fund 5): «mail» eller grunden til at lade være. */
  gul_valg: string;
  /** «ingen» · «sendt» · «fejlet: …» */
  gul_mail: string;
  /** «ingen» (tørkørsel) · «skrevet» · «fejlet: …» */
  log: string;
  varighed_ms: number;
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

const besked = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function koerDriftAgent(admin: SupabaseClient, a: { toerKoersel: boolean; laas: boolean; startMs: number }): Promise<DriftAgentResultat> {
  const laesefejl: string[] = [];

  // 1. Grundlaget — ét RPC-kald, SELECT-only.
  let laest: Laest | null = null;
  try {
    const { data, error } = await admin.rpc("drift_agent_laes");
    if (error) laesefejl.push(`drift_agent_laes: ${error.message}`);
    else laest = data as Laest;
  } catch (e) {
    laesefejl.push(`drift_agent_laes: ${besked(e)}`);
  }
  for (const f of laest?.fejl ?? []) laesefejl.push(f);

  // 2. Agentens forrige RIGTIGE kørsel — vagten for sig selv.
  let forrige: AgentForrige | null = null;
  try {
    const { data, error } = await admin.from("drift_agent_koersler").select("tid, alvor, alarm_mail").order("tid", { ascending: false }).limit(1);
    if (error) laesefejl.push(`drift_agent_koersler: ${error.message}`);
    else forrige = ((data ?? [])[0] as AgentForrige | undefined) ?? null;
  } catch (e) {
    laesefejl.push(`drift_agent_koersler: ${besked(e)}`);
  }

  // 3. Hvornår agenten første gang så hvert job. Tom tabel = ukendt (null): alle jobs regnes for kendte.
  let foerstSet: Record<string, string> | null = null;
  try {
    const { data, error } = await admin.from("drift_agent_jobs").select("jobid, foerst_set").limit(1000);
    if (error) laesefejl.push(`drift_agent_jobs: ${error.message}`);
    else if ((data ?? []).length > 0) foerstSet = Object.fromEntries((data as { jobid: number; foerst_set: string }[]).map((r) => [String(r.jobid), r.foerst_set]));
  } catch (e) {
    laesefejl.push(`drift_agent_jobs: ${besked(e)}`);
  }

  // 4. Dommen. Uret er databasens (drift_agent_laes.nu), så data og dom deler tid.
  const nu = laest?.nu ? new Date(laest.nu) : new Date();
  const dom = doemDrift({
    nu,
    jobs: laest?.jobs ?? [],
    koersler: laest?.koersler ?? [],
    koersler_loft_ramt: laest?.koersler_loft_ramt ?? false,
    aeldste_koersel: laest?.aeldste_koersel ?? null,
    svar: laest?.svar ?? [],
    spor: laest?.spor ?? [],
    vagt: laest?.vagt ?? null,
    forrige,
    foerst_set: foerstSet,
    laesefejl,
  });

  const senderRigtigt = !a.toerKoersel && a.laas;
  const r: DriftAgentResultat = {
    ok: true,
    drift_agent: DRIFT_AGENT_MARKOER,
    dry_run: a.toerKoersel,
    laas_aktiv: a.laas,
    sender_rigtigt: senderRigtigt,
    nu: nu.toISOString(),
    alvor: dom.alvor,
    fund: dom.fund,
    aftryk: dom.aftryk,
    tal: dom.tal,
    forrige,
    laesefejl,
    alarm_valg: "ingen",
    alarm_mail: "ingen",
    alarm_klokke: "ingen",
    gul_valg: "ingen",
    gul_mail: "ingen",
    log: "ingen",
    varighed_ms: 0,
  };
  // TØRKØRSEL: intet skrives, intet sendes.
  if (a.toerKoersel) {
    r.alarm_valg = dom.alvor === "roed" ? "sender_ikke" : "ikke_roed";
    const g = skalOpsamleGule({ dom, senderRigtigt, nu, noegleFandtes: false });
    r.gul_valg = g.mail ? "mail" : g.grund;
    r.varighed_ms = Date.now() - a.startMs;
    return r;
  }

  // 5. Alarmen — kun rødt og kun med åben lås.
  let valg: AlarmValg = { mail: false, grund: dom.alvor === "roed" ? "sender_ikke" : "ikke_roed" };
  if (dom.alvor === "roed" && senderRigtigt) {
    const noegle = driftAlarmNoegle(nu);
    try {
      const { data: fandtes, error: opslagFejl } = await admin.from("email_send_log").select("message_id").eq("message_id", noegle).limit(1);
      if (opslagFejl) throw new Error(`email_send_log: ${opslagFejl.message}`);
      const dagStart = kbhTilUtc(driftDato(nu));
      const { data: idag, error: dagFejl } = await admin.from("drift_agent_koersler").select("aftryk")
        .gte("tid", dagStart.toISOString()).eq("alarm_mail", "sendt").limit(500);
      if (dagFejl) throw new Error(`drift_agent_koersler: ${dagFejl.message}`);
      valg = skalAlarmere({
        dom,
        senderRigtigt,
        noegleFandtes: (fandtes ?? []).length > 0,
        aftrykMailetIDag: (idag ?? []).map((x: { aftryk: string }) => x.aftryk),
      });
      if (valg.mail) {
        const tekst = driftAlarmTekst(dom, nu);
        const html = indgangsMailHtml({ eyebrow: "Drift · Driftsagenten", overskrift: tekst.emne, afsnit: tekst.afsnit, hilsen: "The Boardroom" });
        const res = await sendManagedEmail({
          adminClient: admin,
          // Driftsalarmen går til driftModtager — ét sted (driftModtager.ts), aldrig gennem Mailgun.
          to: driftModtager(),
          subject: tekst.emne,
          html,
          text: tekst.tekst,
          label: DRIFT_ALARM_MAIL_LABEL,
          idempotencyKey: noegle,
          metadata: { aftryk: dom.aftryk, roede: dom.fund.filter((f) => f.alvor === "roed").length, nu: nu.toISOString() },
        });
        r.alarm_mail = res.sent ? "sendt" : `fejlet: ${res.reason}`;
        if (!res.sent) console.error(`${LOG} alarmmailen blev ikke sendt: ${res.reason}`);

        // Klokken — referencen står som LITERAL (klokkeMail.guard selvmailendeIKoden læser den
        // ordret), og `satisfies` binder den til dommens konstant.
        try {
          const skrevet = await skrivRaadgiverBesked(admin, {
            type: "drift",
            title: tekst.titel,
            body: tekst.tekst.slice(0, 2000),
            reference_type: "drift_agent_koersler" satisfies typeof DRIFT_ALARM_REFERENCE,
            reference_id: null,
          });
          r.alarm_klokke = skrevet.fejl.length > 0 ? `fejlet: ${skrevet.fejl.join("; ")}` : skrevet.skrevet > 0 ? "skrevet" : "fandtes";
        } catch (e) {
          r.alarm_klokke = `fejlet: ${besked(e)}`;
          console.error(`${LOG} klokken kastede:`, besked(e));
        }
      }
    } catch (e) {
      r.alarm_mail = `fejlet: ${besked(e)}`;
      console.error(`${LOG} alarmen kastede:`, besked(e));
    }
  }
  r.alarm_valg = valg.mail ? "mail" : valg.grund;

  // 5b. Den gule opsamling — kun rigtigt, kun hverdag kl. 07 dansk, én gang pr. dag.
  let gulValg: GulValg = skalOpsamleGule({ dom, senderRigtigt, nu, noegleFandtes: false });
  if (gulValg.mail) {
    const gulNoegle = driftGulNoegle(nu);
    try {
      const { data: gulFandtes, error: gulOpslagFejl } = await admin.from("email_send_log").select("message_id").eq("message_id", gulNoegle).limit(1);
      if (gulOpslagFejl) throw new Error(`email_send_log: ${gulOpslagFejl.message}`);
      gulValg = skalOpsamleGule({ dom, senderRigtigt, nu, noegleFandtes: (gulFandtes ?? []).length > 0 });
      if (gulValg.mail) {
        const gul = driftGulTekst(dom, nu);
        const res = await sendManagedEmail({
          adminClient: admin,
          to: driftModtager(),
          subject: gul.emne,
          html: indgangsMailHtml({ eyebrow: "Drift · Driftsagenten", overskrift: gul.emne, afsnit: gul.afsnit, hilsen: "The Boardroom" }),
          text: gul.tekst,
          label: DRIFT_GUL_MAIL_LABEL,
          idempotencyKey: gulNoegle,
          metadata: { gule: dom.fund.filter((f) => f.alvor === "gul").length, nu: nu.toISOString() },
        });
        r.gul_mail = res.sent ? "sendt" : `fejlet: ${res.reason}`;
        if (!res.sent) console.error(`${LOG} den gule opsamling blev ikke sendt: ${res.reason}`);
      }
    } catch (e) {
      r.gul_mail = `fejlet: ${besked(e)}`;
      console.error(`${LOG} den gule opsamling kastede:`, besked(e));
    }
  }
  r.gul_valg = gulValg.mail ? "mail" : gulValg.grund;

  // 6. Nye jobs noteres (første gang set) — kun i en rigtig kørsel.
  try {
    const jobs = laest?.jobs ?? [];
    if (jobs.length > 0) {
      const { error } = await admin.from("drift_agent_jobs")
        .upsert(jobs.map((j) => ({ jobid: j.jobid, jobname: j.jobname })), { onConflict: "jobid", ignoreDuplicates: true });
      if (error) console.error(`${LOG} drift_agent_jobs:`, error.message);
    }
  } catch (e) {
    console.error(`${LOG} drift_agent_jobs kastede:`, besked(e));
  }

  // 7. Loggen — agentens eget hjerteslag. Skrevet EFTER alarmen, så alarm_mail står i den.
  r.varighed_ms = Date.now() - a.startMs;
  try {
    const { error } = await admin.from("drift_agent_koersler").insert({
      laas_aktiv: a.laas,
      alvor: dom.alvor,
      roede: dom.fund.filter((f) => f.alvor === "roed").length,
      gule: dom.fund.filter((f) => f.alvor === "gul").length,
      aftryk: dom.aftryk,
      fund: dom.fund,
      tal: dom.tal,
      laesefejl,
      alarm_valg: r.alarm_valg,
      alarm_mail: r.alarm_mail,
      alarm_klokke: r.alarm_klokke,
      gul_mail: r.gul_mail,
      varighed_ms: r.varighed_ms,
    });
    r.log = error ? `fejlet: ${error.message}` : "skrevet";
    const graense = new Date(nu.getTime() - OPBEVARING_DAGE * 86_400_000).toISOString();
    const { error: sletFejl } = await admin.from("drift_agent_koersler").delete().lt("tid", graense);
    if (sletFejl) console.error(`${LOG} opbevaringen:`, sletFejl.message);
  } catch (e) {
    r.log = `fejlet: ${besked(e)}`;
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  const startMs = Date.now();
  let raaBody: Record<string, unknown> | null = null;
  try {
    raaBody = (await req.json()) as Record<string, unknown>;
  } catch {
    /* ingen body = tørkørsel */
  }
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const tekst = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${tekst}`);
    return new Response(JSON.stringify({ ok: false, drift_agent: DRIFT_AGENT_MARKOER, fejl: tekst }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const toerKoersel = raaBody?.dry_run !== false;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const laas = await laasErAktiv(admin);
  let resultat: DriftAgentResultat;
  try {
    resultat = await koerDriftAgent(admin, { toerKoersel, laas, startMs });
  } catch (err) {
    console.error(`${LOG} kørslen væltede:`, besked(err));
    return new Response(JSON.stringify({ ok: false, drift_agent: DRIFT_AGENT_MARKOER, dry_run: toerKoersel, fejl: besked(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  console.log(`${LOG} ${resultat.dry_run ? "TØRKØRSEL" : resultat.sender_rigtigt ? "RIGTIG (lås åben)" : "RIGTIG (lås lukket)"} — ${resultat.alvor}, ${resultat.fund.length} fund (aftryk «${resultat.aftryk}»), alarm ${resultat.alarm_valg}/${resultat.alarm_mail}/${resultat.alarm_klokke}, gul ${resultat.gul_valg}/${resultat.gul_mail}, log ${resultat.log}, ${resultat.varighed_ms} ms`);
  return new Response(JSON.stringify(resultat), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
