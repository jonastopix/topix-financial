// _shared/webinarSvarMailKoersel.ts — værtens svar på MAIL til den seer, der er
// gået (spec'ens skive 5, 3/10-2026; docs/webinarmotor.md §7.10). I/O-delen af et
// ISOLERET pas i webinar-motor-cron; dommen er ren og spejlet
// (webinarMotor/svarMail.ts).
//
// ISOLATIONEN: passet kaster aldrig, rører aldrig fremmødedommen, sessionerne,
// pulserne eller cronens `ok`/`fejl`/status — dets fejl står KUN i svarets
// `svar_mail.fejl`, og det har sin EGEN alarm (alarmerSvarMail).
//
// LÅSEN: app_config.webinar_svar_mail_aktiv (fraværende = false, fail-closed).
// Prøven til én adresse (`email`) sender uden låsen, KUN til den adresse.
//
// RÆKKEFØLGEN pr. spørgsmål (én mail pr. spørgsmål, kapløbssikkert):
//   1. dommen (svarMailDom) — afmeldt, intern session med en fremmed adresse,
//      prøven, kendt dårlig adresse, for gammel, stadig i rummet;
//   2. budgettet (svarMailBudgetTillader) og Mailgun-loftet;
//   3. TAG rækken: UPDATE leveret = 'mail', leveret_at = nu WHERE id AND
//      status = 'besvaret' AND leveret IS NULL — 0 rækker = pulsen leverede den
//      live, eller en anden kørsel tog den (`taget_imens`);
//   4. send gennem Mailgun EU (aldrig Lovables mail-API) til TILMELDINGENS EGEN mail;
//   5. loggen (webinar_motor_log, art «svar_leveret», via «mail») — aldrig mail,
//      navn eller Mailguns tekst i data;
//   6. ved en TYDELIG afvisning gives rækken FRI igen (vagtet på vores eget
//      stempel); ved et UKENDT udfald bliver den «mail» og sendes aldrig igen.

import {
  bygSvarMail, laesSvarMailLaas, MAIL_UDFALD, skalSvarMailAlarmere, svarPassetMaaBegynde, SVAR_MAIL_LAAS_NOEGLE, SVAR_MAIL_VINDUE_DAGE, svarMailAlarmNoegle,
  svarMailBudgetTillader, svarMailDom, type SvarMailGrund, type SvarMailResultat, svarMailSenderRigtigt, svarUdfaldArt,
  tomtSvarMailResultat,
} from "./webinarMotor/svarMail.ts";
import { erInternAdresse } from "./webinarMotor/tilmelding.ts";
import { sessionTider } from "./webinarMotor/ur.ts";
import { erAfmeldt } from "./webinarAfmelding.ts";
import { PAUSE_MS, sendMailgun } from "./mailgunAfsendelse.ts";
import { beregnKoerselsLoft, erStopStatus, LOFT_VINDUE_MS, type LoftRaekke, MAILGUN_LOFT_PR_TIME } from "./webinarMailLoft.ts";
import { afmeldUrl, byggAfmeldToken } from "./webinarAfmeldToken.ts";
import { AFSENDER, SVAR_TIL } from "./webinarMailTekster.ts";
import { sendManagedEmail } from "./managedEmail.ts";
import { driftModtager } from "./driftModtager.ts";
import { indgangsMailHtml } from "./indgangsMail.ts";
import { kbhDato, kbhDele } from "./hverdage.ts";

// deno-lint-ignore no-explicit-any
type Klient = any;

const LOG = "[webinar-motor-cron/svar_mail]";
const SIDE = 500;
const BUNDT = 100;
export const SVAR_MAIL_ALARM_LABEL = "webinar-svar-mail-alarm";

function bundter<T>(liste: readonly T[]): T[][] {
  const ud: T[][] = [];
  for (let i = 0; i < liste.length; i += BUNDT) ud.push(liste.slice(i, i + BUNDT));
  return ud;
}

/** Låsen, fail-closed: en læsefejl eller en manglende række er «lukket». */
export async function svarMailLaasAktiv(admin: Klient): Promise<boolean> {
  try {
    const { data, error } = await admin.from("app_config").select("config_value").eq("config_key", SVAR_MAIL_LAAS_NOEGLE).maybeSingle();
    if (error) return false;
    return laesSvarMailLaas((data as { config_value?: unknown } | null)?.config_value);
  } catch {
    return false;
  }
}

interface Spoergsmaal {
  id: string;
  session_id: string;
  tilmelding_id: string;
  tekst: string;
  svar_tekst: string | null;
  svaret_at: string | null;
  status: string;
  leveret: string | null;
}

export async function koerSvarMail(admin: Klient, a: {
  toerKoersel: boolean;
  laas: boolean;
  proeveEmail: string | null;
  nu: Date;
  startMs: number;
  mailgunNoegle: string | null | undefined;
  afmeldSecret: string | null | undefined;
  afmeldBasis: string;
}): Promise<SvarMailResultat> {
  const senderRigtigt = svarMailSenderRigtigt({ toerKoersel: a.toerKoersel, laas: a.laas, proeveEmail: a.proeveEmail });
  const r = tomtSvarMailResultat({ laas: a.laas, senderRigtigt, proeve: a.proeveEmail !== null });
  // BUDGETTET FØRST (CTO 3/10, fund 1): har fremmødet brugt tiden, læses INTET —
  // alle svar er udsat til næste kørsel (regnestykket ved svarPassetMaaBegynde).
  const forloebet = Date.now() - a.startMs;
  r.forloebet_ved_start_ms = forloebet;
  if (!svarPassetMaaBegynde(forloebet)) { r.sprunget_over_af_budget = true; return r; }
  try {
    await koer(admin, a, r);
  } catch (err) {
    r.fejl.push(`uventet: ${err instanceof Error ? err.message : String(err)}`);
  }
  return r;
}

async function koer(admin: Klient, a: Parameters<typeof koerSvarMail>[1], r: SvarMailResultat): Promise<void> {
  const nuMs = a.nu.getTime();
  const graense = new Date(nuMs - SVAR_MAIL_VINDUE_DAGE * 86_400_000).toISOString();

  // 1. Kandidaterne: besvarede, ikke-leverede, inden for vinduet.
  const { data: sRaa, error: sFejl } = await admin
    .from("webinar_spoergsmaal")
    .select("id, session_id, tilmelding_id, tekst, svar_tekst, svaret_at, status, leveret")
    .eq("status", "besvaret")
    .is("leveret", null)
    .gte("svaret_at", graense)
    .order("svaret_at", { ascending: true })
    .limit(SIDE);
  if (sFejl) { r.fejl.push(`webinar_spoergsmaal: ${sFejl.message}`); return; }
  const spoergsmaal = (sRaa ?? []) as Spoergsmaal[];
  r.kandidater = spoergsmaal.length;
  if (spoergsmaal.length === 0) return;

  // 2. Opslagene — tilmeldingens EGEN mail, sessionen, deltagelsen, afmeldingerne og loggen.
  const tIds = [...new Set(spoergsmaal.map((s) => s.tilmelding_id))];
  const sIds = [...new Set(spoergsmaal.map((s) => s.session_id))];
  const tilmeldinger = new Map<string, { email: string | null; fornavn: string | null; kilde_system: string | null; sidste_action: string | null; subscribed: string | null }>();
  for (const b of bundter(tIds)) {
    const { data, error } = await admin.from("webinar_tilmeldinger").select("id, email, fornavn, kilde_system, sidste_action, subscribed").in("id", b);
    if (error) { r.fejl.push(`webinar_tilmeldinger: ${error.message}`); return; }
    for (const t of data ?? []) tilmeldinger.set(t.id as string, t);
  }
  const { data: sesRaa, error: sesFejl } = await admin.from("webinar_sessioner").select("id, webinar_id, starter_at, status, intern").in("id", sIds);
  if (sesFejl) { r.fejl.push(`webinar_sessioner: ${sesFejl.message}`); return; }
  const sessioner = new Map<string, { webinar_id: string; starter_at: string; status: string; intern: boolean | null }>();
  for (const s of sesRaa ?? []) sessioner.set(s.id as string, s);
  const wIds = [...new Set([...sessioner.values()].map((s) => s.webinar_id))];
  const webinarer = new Map<string, { titel: string | null; vaert_navn: string | null; varighed_sek: number; intro_sek: number; lobby_min: number; exitrum_min: number }>();
  if (wIds.length > 0) {
    const { data, error } = await admin.from("webinarer").select("id, titel, vaert_navn, varighed_sek, intro_sek, lobby_min, exitrum_min").in("id", wIds);
    if (error) { r.fejl.push(`webinarer: ${error.message}`); return; }
    for (const w of data ?? []) webinarer.set(w.id as string, w);
  }
  const sidstePuls = new Map<string, number>();
  for (const b of bundter(tIds)) {
    const { data, error } = await admin.from("webinar_deltagelser").select("tilmelding_id, session_id, sidste_puls_at").in("tilmelding_id", b);
    if (error) { r.fejl.push(`webinar_deltagelser: ${error.message}`); return; }
    for (const d of data ?? []) {
      const ms = d.sidste_puls_at ? Date.parse(d.sidste_puls_at as string) : NaN;
      if (!Number.isFinite(ms)) continue;
      const k = `${d.tilmelding_id}:${d.session_id}`;
      sidstePuls.set(k, Math.max(sidstePuls.get(k) ?? 0, ms));
    }
  }
  const mails = [...new Set([...tilmeldinger.values()].map((t) => (t.email ?? "").trim().toLowerCase()).filter((m) => m !== ""))];
  const afmeldte = new Set<string>();
  for (const b of bundter(mails)) {
    const { data, error } = await admin.from("webinar_afmeldinger").select("email").in("email", b);
    // FAIL-CLOSED: kan afmeldingerne ikke læses, sendes INTET.
    if (error) { r.fejl.push(`webinar_afmeldinger: ${error.message}`); return; }
    for (const x of data ?? []) afmeldte.add((x.email as string).trim().toLowerCase());
  }
  // Loggen: tidligere «ugyldig» og antal tydelige afvisninger pr. spørgsmål — og svarmailenes forsøg til loftet.
  const ugyldige = new Set<string>();
  const afvisninger = new Map<string, number>();
  const egneForsoeg: LoftRaekke[] = [];
  const loftFra = Date.now() - LOFT_VINDUE_MS;
  for (const b of bundter(tIds)) {
    const { data, error } = await admin.from("webinar_motor_log").select("tid, data").eq("art", "svar_leveret").in("tilmelding_id", b);
    if (error) { r.fejl.push(`webinar_motor_log: ${error.message}`); return; }
    for (const l of data ?? []) {
      const d = (l.data ?? {}) as { via?: string; udfald?: string; status?: number | null; spoergsmaal_id?: string; art?: string };
      if (d.via !== "mail") continue;
      if (d.udfald === "ugyldig" && typeof d.spoergsmaal_id === "string") ugyldige.add(d.spoergsmaal_id);
      if (d.art === "afvist" && typeof d.spoergsmaal_id === "string") afvisninger.set(d.spoergsmaal_id, (afvisninger.get(d.spoergsmaal_id) ?? 0) + 1);
      if (Date.parse(l.tid as string) > loftFra) egneForsoeg.push({ forsoegt_at: l.tid as string, udfald: d.udfald ?? "fejl", status: typeof d.status === "number" ? d.status : null });
    }
  }

  // 3. Dommen pr. spørgsmål.
  const skal: Spoergsmaal[] = [];
  const grunde: Partial<Record<SvarMailGrund, number>> = {};
  for (const s of spoergsmaal) {
    const t = tilmeldinger.get(s.tilmelding_id) ?? null;
    const ses = sessioner.get(s.session_id) ?? null;
    const w = ses ? webinarer.get(ses.webinar_id) ?? null : null;
    const starterMs = ses ? Date.parse(ses.starter_at) : NaN;
    const slutMs = ses && ses.status === "aflyst"
      ? 0
      : ses && w && Number.isFinite(starterMs)
        ? sessionTider({ starterMs, varighedSek: w.varighed_sek, introSek: w.intro_sek, lobbyMin: w.lobby_min, exitrumMin: w.exitrum_min }).exitrumSlutMs
        : null;
    const email = (t?.email ?? "").trim().toLowerCase();
    const dom = svarMailDom({
      status: s.status,
      leveret: s.leveret,
      svar_tekst: s.svar_tekst,
      svaret_at: s.svaret_at,
      email: t ? email : null,
      kilde_system: t?.kilde_system ?? null,
      afmeldt: t !== null && (afmeldte.has(email) || erAfmeldt(t)),
      sessionIntern: ses?.intern === true,
      adresseErHusets: email !== "" && erInternAdresse(email),
      sidstePulsMs: sidstePuls.get(`${s.tilmelding_id}:${s.session_id}`) ?? null,
      sessionSlutMs: slutMs,
      tidligereUgyldig: ugyldige.has(s.id),
      afvisningerFoer: afvisninger.get(s.id) ?? 0,
    }, { nuMs, proeveEmail: a.proeveEmail });
    if (dom.send) skal.push(s);
    else { r.sprunget++; grunde[dom.grund] = (grunde[dom.grund] ?? 0) + 1; }
  }
  r.sprunget_grunde = grunde;
  r.skal_sendes = skal.length;

  // 4. Loftet — Mailgun-kontoen er én: webinarmailenes forsøg + svarmailenes egne.
  const loftNu = new Date();
  const { data: wmRaa, error: wmFejl } = await admin
    .from("webinar_mails").select("forsoegt_at, udfald, status")
    .gte("forsoegt_at", new Date(loftNu.getTime() - LOFT_VINDUE_MS).toISOString())
    .order("forsoegt_at", { ascending: true }).limit(5000);
  if (wmFejl) { r.fejl.push(`webinar_mails (loftet): ${wmFejl.message}`); return; }
  const loft = beregnKoerselsLoft({ seneste: [...((wmRaa ?? []) as LoftRaekke[]), ...egneForsoeg], loft: MAILGUN_LOFT_PR_TIME, nu: loftNu });
  r.loft = { maks: loft.maks, pause_til: loft.pause ? loft.pause.til.toISOString() : null };

  // TØRKØRSEL (eller lukket lås uden prøve): tallene er regnet, intet skrives, intet sendes.
  if (!r.sender_rigtigt || skal.length === 0) return;

  // Uden afmeldingslink sendes INTET (som webinar-mail-cron) — og intet tages.
  if (!a.afmeldSecret) { r.fejl.push("WEBINAR_AFMELD_SECRET mangler — intet sendt"); r.udsat += skal.length; return; }
  // Uden Mailgun-nøgle TAGES intet (CTO 3/10, fund 6) — ellers stod rækken som «afvist» uden at være forsøgt.
  if (!(a.mailgunNoegle ?? "").trim()) { r.fejl.push("MAILGUN_SENDING_KEY mangler — intet taget, intet sendt"); r.udsat += skal.length; return; }
  if (loft.pause) { r.udsat += skal.length; return; }

  let forsoegt = 0;
  for (let i = 0; i < skal.length; i++) {
    const s = skal[i];
    if (!svarMailBudgetTillader(Date.now() - a.startMs) || forsoegt >= loft.maks) { r.udsat += skal.length - i; break; }
    const t = tilmeldinger.get(s.tilmelding_id)!;
    const ses = sessioner.get(s.session_id)!;
    const w = webinarer.get(ses.webinar_id) ?? null;
    const email = (t.email ?? "").trim().toLowerCase();

    // 3. TAG rækken — vagtet på leveret IS NULL (pulsen har samme vagt til «live»).
    const taget = new Date().toISOString();
    const { data: tag, error: tagFejl } = await admin
      .from("webinar_spoergsmaal")
      .update({ leveret: "mail", leveret_at: taget, mail_udfald: null })
      .eq("id", s.id).eq("status", "besvaret").is("leveret", null)
      .select("id");
    if (tagFejl) { r.fejl.push(`tag ${s.id}: ${tagFejl.message}`); continue; }
    if (!tag || tag.length !== 1) { r.taget_imens++; continue; }

    // 4. Mailen — spørgsmålet og svaret ORDRET, til tilmeldingens egen mail.
    const link = afmeldUrl(a.afmeldBasis, await byggAfmeldToken(a.afmeldSecret, email));
    const mail = bygSvarMail({ fornavn: t.fornavn, spoergsmaal: s.tekst, svar: s.svar_tekst ?? "", webinarTitel: w?.titel ?? null, vaertNavn: w?.vaert_navn ?? null, afmeldUrl: link });
    forsoegt++;
    const spor = await sendMailgun(a.mailgunNoegle, { til: email, fra: AFSENDER, emne: mail.subject, html: mail.html, tekst: mail.text, svarTil: SVAR_TIL, afmeldUrl: link });
    const art = svarUdfaldArt(spor.udfald, spor.status);

    // 5. Loggen — aldrig mail, navn eller Mailguns tekst.
    const { error: logFejl } = await admin.from("webinar_motor_log").insert({
      kilde: "cron", art: "svar_leveret", tilmelding_id: s.tilmelding_id, session_id: s.session_id,
      data: { spoergsmaal_id: s.id, via: "mail", udfald: spor.udfald, status: spor.status, art, mailgun_id: spor.mailgun_id },
    });
    if (logFejl) r.fejl.push(`loggen for ${s.id}: ${logFejl.message}`);

    if (art === "ok" || art === "ukendt") {
      // Rækken bærer udfaldet (konsollens ord) — vagtet på vores eget stempel.
      const { error: udFejl } = await admin
        .from("webinar_spoergsmaal")
        .update({ mail_udfald: MAIL_UDFALD[art] })
        .eq("id", s.id).eq("leveret", "mail").eq("leveret_at", taget);
      if (udFejl) r.fejl.push(`${s.id}: udfaldet kunne ikke skrives på rækken (${udFejl.message})`);
    }
    if (art === "ok") r.sendt++;
    else if (art === "ukendt") {
      // Bliver «mail» — sendes ALDRIG igen automatisk (hellere ét manglende svar end en dublet).
      r.ukendte++;
      r.fejl.push(`${s.id}: ${spor.udfald}${spor.status ? ` ${spor.status}` : ""} — ukendt, om Mailgun tog imod; sendes ikke igen`);
    } else {
      // 6. En tydelig afvisning: rækken gives FRI — vagtet på vores eget stempel.
      r.fejlede++;
      r.fejl.push(`${s.id}: ${spor.udfald}${spor.status ? ` ${spor.status}` : ""}`);
      const { data: fri, error: friFejl } = await admin
        .from("webinar_spoergsmaal")
        .update({ leveret: null, leveret_at: null, mail_udfald: MAIL_UDFALD.afvist })
        .eq("id", s.id).eq("leveret", "mail").eq("leveret_at", taget)
        .select("id");
      if (friFejl || !fri || fri.length !== 1) r.fejl.push(`${s.id}: kunne ikke gives fri igen (${friFejl?.message ?? "0 rækker"})`);
    }
    if (erStopStatus(spor.status)) { r.stoppet = true; r.udsat += skal.length - i - 1; break; }
    if (PAUSE_MS > 0) await new Promise((klar) => setTimeout(klar, PAUSE_MS));
  }
}

/** Passets EGEN alarm: én mail pr. dansk TIME til driftModtager() — kun i en rigtig kørsel. */
export async function alarmerSvarMail(admin: Klient, r: SvarMailResultat, nu: Date): Promise<void> {
  if (!skalSvarMailAlarmere(r)) return;
  const time = String(kbhDele(nu).time).padStart(2, "0");
  const noegle = svarMailAlarmNoegle(`${kbhDato(nu)}T${time}`);
  try {
    const { data: fandtes, error } = await admin.from("email_send_log").select("message_id").eq("message_id", noegle).limit(1);
    if (error) throw new Error(`email_send_log: ${error.message}`);
    if ((fandtes ?? []).length > 0) { r.alarm = "allerede_sendt_i_timen"; return; }
    const emne = `Webinar: svar på mail kunne ikke sendes rent (${kbhDato(nu)} kl. ${time})`;
    const afsnit = [
      `webinar-motor-cron's svarpas havde ${r.fejlede} afviste og ${r.ukendte} ukendte afsendelser${r.stoppet ? ", og Mailgun sagde stop" : ""}; ${r.sendt} blev sendt. Fremmødedommen er urørt.`,
      r.ukendte > 0
        ? "Et UKENDT udfald sendes aldrig igen automatisk — slå op i Mailguns log, om svaret kom frem."
        : "Afviste svar gives fri igen: de leveres i rummet, hvis seeren kommer tilbage, ellers prøves de ved næste kørsel (højst 7 dage).",
    ];
    const blokke = r.fejl.slice(0, 5).map((f, i) => ({ overskrift: `Fejl ${i + 1}`, tekst: f }));
    const tekst = [emne, ...afsnit, "", ...blokke.map((b) => `${b.overskrift}: ${b.tekst}`), "", "Loggen: webinar_motor_log (art svar_leveret). Tørkørsel: SELECT public.kald_edge('webinar-motor-cron');"].join("\n");
    const html = indgangsMailHtml({ eyebrow: "Drift · Webinar · svar på mail", overskrift: emne, afsnit, blokke, hilsen: "The Boardroom" });
    const res = await sendManagedEmail({
      adminClient: admin, to: driftModtager(), subject: emne, html, text: tekst, label: SVAR_MAIL_ALARM_LABEL, idempotencyKey: noegle,
      metadata: { fejlede: r.fejlede, ukendte: r.ukendte, fejl: r.fejl.length, nu: nu.toISOString() },
    });
    r.alarm = res.sent ? "sendt" : `fejlet: ${res.reason}`;
    if (res.sent === false) console.error(`${LOG} alarmmailen blev ikke sendt: ${res.reason}`);
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    r.alarm = `fejlet: ${grund}`;
    console.error(`${LOG} alarmmailen kastede:`, grund);
  }
}
