/**
 * webinarMailAlarm — alarmen, når webinar-mail-cron ikke får sine mails ud
 * (29/9-2026, ~/Downloads/recon-webinar-mail-alarm.md; omdømt 29/9 14:04).
 *
 * HVORFOR DEN FINDES: 29/9 kl. 08:09–10:00 fejlede 211 «fjorten_dage»-mails
 * over to timer (Mailguns probation-loft), og ingen i huset fik besked —
 * svaret lå i net._http_response, og en klokke i browseren er ikke et signal
 * (princip 1). Husets fire alarmer (klaviyo-gensend, klaviyo-profil, meta-send,
 * ga-send) er mønstret: ren alarmtekst her, mail til driftModtager() gennem
 * sendManagedEmail (IKKE Mailgun — er Mailgun spærret, må alarmen ikke være
 * det), drift-klokke gennem skrivRaadgiverBesked, og et opslag i
 * email_send_log på nøglen FØR afsendelsen.
 *
 * ALARMEN MÅ KUN LYDE, NÅR ET MENNESKE SKAL GØRE NOGET (Jonas 29/9 14:04: «Jeg
 * får hele tiden disse mails»). Første udgave (#1115) havde nøgle pr. dansk
 * time og lød ved HVERT loft-stop — under Mailguns probation rammes loftet hver
 * time (26 går igennem, så 420), og det er throttlen, der virker som bygget.
 * Resultat: én mail i timen hele dagen. Nu fire arter, i alvorsorden:
 *
 *   fejl   FEJLEDE AF ANDRE GRUNDE END LOFTET (noegle_afvist, ugyldig, fejl,
 *          timeout, sporet kunne ikke skrives …) — som i dag: nøgle pr. dansk TIME.
 *   tabt   UDLØBET: mails, dommen har dømt for_sent_efter_fejl i kørslen (en mail,
 *          vi fejlede med, nåede ikke ud før den næste art) — skal mærkes af et
 *          menneske, men ÉN mail om dagen pr. art er nok (Jonas 29/9: gentagelse
 *          hver time er støjen): nøgle pr. dansk DAG. Mailen siger antallet.
 *          (sprunget.for_sent_efter_fejl tæller alle i vinduet, ikke kun nye —
 *          dommen har intet spor af «allerede meldt».)
 *   frist  FRIST I FARE: prognosen (ventende ÷ ok pr. time) siger, at én eller
 *          flere ventende mails ikke når ud før deres frist — nøgle pr. dansk
 *          DAG; mailen siger antallet og den tidligste frist.
 *   loft   LOFT-STOP UDEN ANDRE FEJL (pause, stoppet_ved, eller over_loft > 0):
 *          højst ÉN mail pr. dansk DAG. Mailen siger, hvor mange der venter,
 *          hvor mange der gik igennem den seneste time, og hvornår de forventes
 *          ude — med regnestykket skrevet ud, og at prognosen antager samme takt
 *          som den seneste time.
 * KUN «fejl» har nøgle pr. dansk TIME — det er noget, der er i stykker. Arten
 * står i nøglen, så dagens loft-mail aldrig dæmper en tabt- eller frist-mail,
 * og omvendt.
 *
 * FRISTEN for en ventende mail er dommens (webinarMailDom.doemMail, INDHENTNING):
 * inden for nåden (2 t) sendes altid; derefter KUN indtil den næste arts tid —
 * og aldrig på den næste arts danske kalenderdato. Så fristen er
 *   max(planlagt + nåde, midnat dansk før den næste arts dato), dog aldrig efter
 *   sessionens start for arter, der kræver «ikke begyndt»; «straks» og «en_time»
 *   (ingen næste art): sessionens start. Se fristFor.
 *
 * PROGNOSEN: timer = ventende ÷ ok-mails de sidste 60 min; færdig = nu + timer.
 * Går 0 igennem, kan den ikke regnes — og det siges ærligt. Tider vises i dansk
 * tid (kbhDele, Europe/Copenhagen); nøglerne bærer dansk dato (og time).
 *
 * DENO-FRI. Imports kun fra _shared-filer uden Deno: kbhDele fra hverdage.ts
 * (spejlet i src/lib/hverdage.ts), og dommens tider fra webinarMailDom.ts
 * (spejlet i src/lib/webinar/mailDom.ts). Tiden gives ind som `nu`.
 */
import { kbhDele } from "./hverdage.ts";
import { kbhTilUtc, type MailArt, naesteTidssatteArt, PLANEN, planlagtTid, SEN_TILMELDING_NAADE_MS } from "./webinarMailDom.ts";

// ── Konstanterne ─────────────────────────────────────────────────────────────

/** Idempotensnøglens præfiks — derefter arten, og dansk dato (loft · tabt · frist) eller dato+time (fejl). */
export const WEBINAR_ALARM_NOEGLE_PRAEFIKS = "webinar-mail-alarm:";
/** template_name i email_send_log og label hos Lovable. */
export const WEBINAR_ALARM_MAIL_LABEL = "webinar-mail-alarm";
/** Klokkens type — vagtens driftsbesked (klokkeMail.guard dom 11 kræver «drift»). */
export const WEBINAR_ALARM_KLOKKE_TYPE = "drift";
/** Klokkens reference_type — står på SELVMAILENDE_REFERENCER, fordi cronen selv mailer. */
export const WEBINAR_ALARM_REFERENCE = "webinar_mails";
/** Højst så mange fejl-linjer i mailen — 29/9 ville ellers have givet 211 linjer. */
export const ALARM_FEJL_LINJER_MAKS = 10;
/** Det udfald, loftet giver (mailgunAfsendelse.doemMailgunSvar: 429, og enhver tekst i LOFT_MOENSTRE). */
export const LOFT_UDFALD = "loft";

export type AlarmArt = "fejl" | "tabt" | "frist" | "loft";

// ── Input: de felter af MailResultat, dommen behøver ─────────────────────────

/** En mail, kørslen ikke nåede (over_loft) — art og session, så fristen kan regnes. */
export interface Ventende {
  art: MailArt;
  session_tid: string;
}

export interface AlarmInput {
  /** dry_run: false OG (låsen ELLER én navngiven adresse). */
  sender_rigtigt: boolean;
  fejlede: number;
  /** Cronens fejl-linjer: «<art>: <udfald> — <grund>» pr. fejlet mail, plus enkelte andre. */
  fejl: readonly string[];
  loft: {
    pause: { grund: string; til: string } | null;
    /** Statuskoden, der stoppede løkken i DENNE kørsel (403/420/429) — ellers null. */
    stoppet_ved: number | null;
    /** Mails med udfald ok de sidste 60 minutter (alle kørsler) — prognosens nævner. */
    ok_60_min: number;
  };
  over_loft: number;
  sprunget: { for_sent_efter_fejl: number };
  ventende: readonly Ventende[];
}

// ── Nøglerne ─────────────────────────────────────────────────────────────────

const to = (n: number) => String(n).padStart(2, "0");

/** «2026-09-29» — dansk dato. */
export function webinarAlarmDato(nu: Date): string {
  const p = kbhDele(nu);
  return `${p.aar}-${to(p.maaned)}-${to(p.dag)}`;
}

/** «2026-09-29T10» — dansk dato og time for et tidspunkt. */
export function webinarAlarmDatoOgTime(nu: Date): string {
  return `${webinarAlarmDato(nu)}T${to(kbhDele(nu).time)}`;
}

/** Arter med nøgle pr. dansk DAG — én mail om dagen pr. art er nok. Kun «fejl» er pr. time. */
export const ARTER_PR_DAG: readonly AlarmArt[] = ["loft", "tabt", "frist"];

/**
 * Idempotensnøglen pr. art: loft, tabt og frist én pr. dansk DAG
 * («…:tabt:2026-09-29»), fejl én pr. dansk TIME («…:fejl:2026-09-29T14»). Arten
 * står i nøglen, så en loft-mail om morgenen aldrig kan dæmpe en tabt- eller
 * frist-mail samme dag. Klokkens dedup går på titlen, som bærer det samme.
 */
export function webinarAlarmNoegle(art: AlarmArt, nu: Date): string {
  const hale = ARTER_PR_DAG.includes(art) ? webinarAlarmDato(nu) : webinarAlarmDatoOgTime(nu);
  return `${WEBINAR_ALARM_NOEGLE_PRAEFIKS}${art}:${hale}`;
}

// ── Fejl-linjerne ────────────────────────────────────────────────────────────

/** «fjorten_dage: noegle_afvist — Mailgun svarede 403» → { art, udfald, rest }. Andre linjer → null. */
export function laesFejlLinje(linje: string): { art: string; udfald: string; rest: string } | null {
  const m = /^([a-z_]+): ([a-z_]+)(?: — (.*))?$/.exec(linje);
  if (!m) return null;
  return { art: m[1], udfald: m[2], rest: m[3] ?? "" };
}

/** Antal fejlede pr. udfald, i faldende orden — regnet af fejl-linjerne. */
export function fordelPaaUdfald(fejl: readonly string[]): { udfald: string; antal: number }[] {
  const antal = new Map<string, number>();
  for (const linje of fejl) {
    const l = laesFejlLinje(linje);
    if (l) antal.set(l.udfald, (antal.get(l.udfald) ?? 0) + 1);
  }
  return [...antal.entries()].map(([udfald, n]) => ({ udfald, antal: n })).sort((a, b) => b.antal - a.antal || a.udfald.localeCompare(b.udfald));
}

/** Fejl af ANDRE grunde end loftet: en mail-linje med et andet udfald end «loft», eller en linje, der ikke er en mail (sporet, secret'en, alarmen selv). */
export function andreFejl(fejl: readonly string[]): string[] {
  return fejl.filter((linje) => {
    const l = laesFejlLinje(linje);
    return l === null || l.udfald !== LOFT_UDFALD;
  });
}

// ── Fristen og prognosen ─────────────────────────────────────────────────────

/** Midnat dansk på det døgn, `d` ligger i. */
function danskMidnat(d: Date): Date {
  const p = kbhDele(d);
  return kbhTilUtc(p.aar, p.maaned, p.dag, 0, 0);
}

/**
 * Den sidste stund, dommen stadig sender en ventende mail (webinarMailDom.doemMail):
 *   straks (bekraeftelse) og en_time (ingen næste art): sessionens start;
 *   ellers max(planlagt + nåde, midnat dansk før den næste arts tidspunkt) — og
 *   aldrig efter sessionens start for arter, der kræver «ikke begyndt» (i dag
 *   kun bekræftelsen og en_time, som begge svarer ovenfor; «dagen» udgik 30/9).
 * null, når tiden ikke kan læses.
 */
export function fristFor(art: MailArt, sessionTid: string): Date | null {
  const sessionMs = Date.parse(sessionTid);
  if (!Number.isFinite(sessionMs)) return null;
  const plan = PLANEN.find((p) => p.art === art);
  if (!plan) return null;
  const session = new Date(sessionMs);
  if (plan.straks === true) return session;
  const naeste = naesteTidssatteArt(art);
  const planlagt = planlagtTid(sessionTid, art);
  if (naeste === null || planlagt === null) return session;
  const naesteTid = planlagtTid(sessionTid, naeste);
  if (naesteTid === null) return session;
  const efterNaade = new Date(planlagt.getTime() + SEN_TILMELDING_NAADE_MS);
  const foerNaesteDag = danskMidnat(naesteTid);
  const frist = new Date(Math.max(efterNaade.getTime(), foerNaesteDag.getTime()));
  if (plan.kraeverIkkeBegyndt && frist.getTime() > sessionMs) return session;
  return frist;
}

export interface Prognose {
  ventende: number;
  okPrTime: number;
  /** Timer, det tager at få de ventende ud — null når intet gik igennem. */
  timer: number | null;
  /** nu + timer — null når det ikke kan regnes. */
  faerdig: Date | null;
}

/** ventende ÷ ok pr. time. 0 igennem → kan ikke regnes (null), og det siges ærligt i teksten. */
export function beregnPrognose(ventende: number, okPrTime: number, nu: Date): Prognose {
  if (ventende <= 0) return { ventende, okPrTime, timer: 0, faerdig: nu };
  if (okPrTime <= 0) return { ventende, okPrTime, timer: null, faerdig: null };
  const timer = ventende / okPrTime;
  return { ventende, okPrTime, timer, faerdig: new Date(nu.getTime() + timer * 3_600_000) };
}

export interface FristIFare {
  art: MailArt;
  session_tid: string;
  frist: Date;
}

/** De ventende, hvis frist ligger FØR prognosens færdigtid. Uden prognose: ingen (ikke gættet). */
export function fristerIFare(ventende: readonly Ventende[], prognose: Prognose): FristIFare[] {
  if (prognose.faerdig === null) return [];
  const ud: FristIFare[] = [];
  for (const v of ventende) {
    const frist = fristFor(v.art, v.session_tid);
    if (frist !== null && frist.getTime() < prognose.faerdig.getTime()) ud.push({ art: v.art, session_tid: v.session_tid, frist });
  }
  return ud.sort((a, b) => a.frist.getTime() - b.frist.getTime());
}

// ── Dommen ───────────────────────────────────────────────────────────────────

export interface Alarm {
  art: AlarmArt;
  noegle: string;
  andreFejl: string[];
  tabt: number;
  prognose: Prognose;
  iFare: FristIFare[];
}

/**
 * Skal der alarmeres — og hvilken art? null = ingen alarm. Aldrig i en tørkørsel
 * eller en låst kørsel. Alvorsorden: fejl > tabt > frist > loft; den alvorligste
 * vinder, og dens mail bærer også loft-tallene, når nogen venter.
 */
export function doemAlarm(r: AlarmInput, nu: Date): Alarm | null {
  if (!r.sender_rigtigt) return null;
  const fejl = andreFejl(r.fejl);
  const tabt = r.sprunget.for_sent_efter_fejl;
  const prognose = beregnPrognose(r.over_loft, r.loft.ok_60_min, nu);
  const iFare = fristerIFare(r.ventende, prognose);
  const loftStop = r.loft.pause !== null || r.loft.stoppet_ved !== null || r.over_loft > 0;
  const art: AlarmArt | null =
    fejl.length > 0 ? "fejl"
    : tabt > 0 ? "tabt"
    : iFare.length > 0 ? "frist"
    : loftStop ? "loft"
    : null;
  if (art === null) return null;
  return { art, noegle: webinarAlarmNoegle(art, nu), andreFejl: fejl, tabt, prognose, iFare };
}

// ── Teksten ──────────────────────────────────────────────────────────────────

export interface WebinarAlarmTekstInput extends AlarmInput {
  sendt: number;
  skal_sendes: number;
}

export interface WebinarAlarmTekst {
  emne: string;
  /** Klokkens titel — bærer dansk dato (loft · tabt · frist) eller dato+time (fejl), så dedup følger nøglen. */
  titel: string;
  afsnit: string[];
  blokke: { overskrift: string; tekst: string }[];
  /** Ren tekst-udgaven af mailen. */
  tekst: string;
}

/** Mailgun-udfaldene (mailgunAfsendelse.ts' MailgunUdfald) med ord — en ukendt værdi vises som den er. */
const UDFALD_ORD: Record<string, string> = {
  timeout: "Mailgun svarede ikke i tide",
  fejl: "Mailgun svarede 5xx, eller kaldet kastede",
  loft: "Mailgun afviste med loft (429, probation eller recipient limit)",
  ingen_noegle: "MAILGUN_SENDING_KEY mangler",
  noegle_afvist: "Mailgun afviste nøglen (401/403)",
  ugyldig: "Mailgun afviste kaldet (400/422)",
};

const ART_ORD: Record<MailArt, string> = {
  bekraeftelse: "bekræftelsen", fjorten_dage: "om to uger", syv_dage: "om en uge", tre_dage: "om tre dage", en_dag: "i morgen", dagen: "i dag", en_time: "om en time",
};

/** «kl. 10:00» dansk for et ISO-tidspunkt — eller teksten selv, hvis den ikke kan læses. */
export function danskKlokke(iso: string | Date): string {
  const ms = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (!Number.isFinite(ms)) return String(iso);
  const p = kbhDele(new Date(ms));
  return `kl. ${to(p.time)}:${to(p.minut)}`;
}

/** «29/9 kl. 18:30» dansk. */
export function danskDatoKlokke(d: Date): string {
  const p = kbhDele(d);
  return `${p.dag}/${p.maaned} ${danskKlokke(d)}`;
}

/** «4,3 t» — én decimal, dansk komma. */
function timerOrd(t: number): string {
  return `${t.toFixed(1).replace(".", ",")} t`;
}

/** Regnestykket, skrevet ud: «112 venter ÷ 26 pr. time ≈ 4,3 t → ca. kl. 18:30». */
export function prognoseTekst(p: Prognose, nu: Date): string {
  if (p.ventende <= 0) return "Ingen venter.";
  if (p.faerdig === null || p.timer === null) return `${p.ventende} venter — hvornår de er ude, kan ikke beregnes: intet gik igennem den seneste time.`;
  const faerdig = webinarAlarmDato(p.faerdig) === webinarAlarmDato(nu) ? `ca. ${danskKlokke(p.faerdig)}` : `ca. ${danskDatoKlokke(p.faerdig)}`;
  return `${p.ventende} venter ÷ ${p.okPrTime} pr. time ≈ ${timerOrd(p.timer)} → ${faerdig}.`;
}

/** Teksterne til mail og klokke. Ren; rammen (indgangsMailHtml) lægges på i functionen. */
export function webinarAlarmTekst(r: WebinarAlarmTekstInput, alarm: Alarm, nu: Date): WebinarAlarmTekst {
  const dato = webinarAlarmDato(nu);
  const time = to(kbhDele(nu).time);
  const stemplet = ARTER_PR_DAG.includes(alarm.art) ? dato : `${dato} kl. ${time}`;
  const koerslen = `Kørslen ${dato} kl. ${time} skulle sende ${r.skal_sendes} ${r.skal_sendes === 1 ? "mail" : "mails"}, sendte ${r.sendt}, og ${r.over_loft} ${r.over_loft === 1 ? "venter" : "venter"} (over loftet).`;
  const loftAfsnit: string[] = [];
  if (r.over_loft > 0 || r.loft.pause !== null || r.loft.stoppet_ved !== null) {
    loftAfsnit.push(`Den seneste time gik ${r.loft.ok_60_min} igennem. ${prognoseTekst(alarm.prognose, nu)} Prognosen antager samme takt som den seneste time.`);
    if (r.loft.stoppet_ved !== null) loftAfsnit.push(`Mailgun sagde stop midt i kørslen (status ${r.loft.stoppet_ved}) — løkken blev afbrudt, og sporet er skrevet.`);
    if (r.loft.pause !== null) loftAfsnit.push(`Pausen gælder til ${danskKlokke(r.loft.pause.til)}: ${r.loft.pause.grund}. Indtil da sender cronen intet.`);
  }

  let emne: string, titel: string;
  const afsnit: string[] = [koerslen];
  const blokke: { overskrift: string; tekst: string }[] = [];

  if (alarm.art === "fejl") {
    const n = alarm.andreFejl.length;
    const hvad = n === 1 ? "1 webinarmail" : `${n} webinarmails`;
    const dele = fordelPaaUdfald(alarm.andreFejl).map((f) => `${f.antal} × ${f.udfald}`).join(", ");
    emne = `${hvad} kunne ikke sendes — webinar-mail-cron har brug for et menneske`;
    titel = `Webinarmails: ${hvad} kunne ikke sendes (${stemplet})`;
    afsnit.push(`${n === 1 ? "Én fejl" : `${n} fejl`} af andre grunde end loftet${dele ? ` (${dele})` : ""} — det retter throttlen ikke.`);
    afsnit.push(...loftAfsnit);
    const linjer = alarm.andreFejl.slice(0, ALARM_FEJL_LINJER_MAKS);
    for (const linje of linjer) {
      const l = laesFejlLinje(linje);
      if (l) blokke.push({ overskrift: l.art, tekst: `${l.udfald} — ${UDFALD_ORD[l.udfald] ?? l.udfald}${l.rest ? ` · ${l.rest}` : ""}` });
      else blokke.push({ overskrift: "fejl", tekst: linje });
    }
    const resten = alarm.andreFejl.length - linjer.length;
    if (resten > 0) blokke.push({ overskrift: "…", tekst: `og ${resten} ${resten === 1 ? "linje" : "linjer"} mere — alle står i webinar_mails (udfald <> 'ok').` });
  } else if (alarm.art === "tabt") {
    const n = alarm.tabt;
    emne = `${n} ${n === 1 ? "webinarmail er tabt" : "webinarmails er tabt"} — nåede ikke ud før næste påmindelse`;
    titel = `Webinarmails: ${n} tabt (${stemplet})`;
    afsnit.push(`${n} ${n === 1 ? "mail, vi fejlede med, blev" : "mails, vi fejlede med, blev"} ikke indhentet før den næste påmindelses tidspunkt (dommens for_sent_efter_fejl) og sendes ikke. Personen får den næste påmindelse som planlagt — men ikke denne.`);
    afsnit.push(...loftAfsnit);
  } else if (alarm.art === "frist") {
    const n = alarm.iFare.length;
    const foerste = alarm.iFare[0];
    emne = `Webinarmails i fare: ${n} når ikke ${n === 1 ? "sin" : "deres"} frist (første ${danskDatoKlokke(foerste.frist)})`;
    titel = `Webinarmails: ${n} i fare for fristen (${stemplet})`;
    afsnit.push(`${prognoseTekst(alarm.prognose, nu)} ${n} af de ventende har en frist FØR det — den første ${danskDatoKlokke(foerste.frist)} (${ART_ORD[foerste.art]}, webinar ${danskDatoKlokke(new Date(foerste.session_tid))}). Nås den ikke, udløber mailen (for_sent_efter_fejl).`);
    const prArt = new Map<string, number>();
    for (const f of alarm.iFare) prArt.set(f.art, (prArt.get(f.art) ?? 0) + 1);
    afsnit.push(`Fordelt: ${[...prArt.entries()].map(([a, k]) => `${k} × ${a}`).join(", ")}.`);
    afsnit.push(...loftAfsnit.filter((x) => !x.startsWith("Den seneste time")));
    afsnit.push(`Den seneste time gik ${r.loft.ok_60_min} igennem — prognosen antager samme takt.`);
  } else {
    emne = alarm.prognose.faerdig
      ? `Webinarmails: ${r.over_loft} venter på Mailguns loft — forventet ude ${webinarAlarmDato(alarm.prognose.faerdig) === dato ? `ca. ${danskKlokke(alarm.prognose.faerdig)}` : `ca. ${danskDatoKlokke(alarm.prognose.faerdig)}`}`
      : `Webinarmails: ${r.over_loft} venter på Mailguns loft — hvornår kan ikke beregnes`;
    titel = `Webinarmails: ${r.over_loft} venter på loftet (${stemplet})`;
    afsnit.push(...loftAfsnit);
    afsnit.push("Det er throttlen, der virker som bygget: Mailgun-kontoen er på probation (100 pr. time), og cronen venter timen ud efter et stop. Der er ikke noget at gøre. Denne mail kommer højst én gang om dagen, så længe det kun er loftet; en egen alarm kommer, hvis en frist er i fare, en mail går tabt, eller noget fejler af en anden grund.");
  }

  const tekst = [
    ...afsnit,
    "",
    ...blokke.map((b) => `${b.overskrift}: ${b.tekst}`),
    "",
    "Sporet: webinar_mails (udfald <> 'ok', forsoegt_at de sidste timer). Tørkørsel i hånden: SELECT public.kald_edge('webinar-mail-cron', '{}'::jsonb, 60000);",
  ].join("\n");
  return { emne, titel, afsnit, blokke, tekst };
}
