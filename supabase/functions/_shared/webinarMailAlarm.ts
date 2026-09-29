/**
 * webinarMailAlarm — alarmen, når webinar-mail-cron ikke får sine mails ud
 * (29/9-2026, ~/Downloads/recon-webinar-mail-alarm.md).
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
 * KUN MOTOREN. Indbygningen i webinar-mail-cron/index.ts og optagelsen af
 * WEBINAR_ALARM_REFERENCE i klokkeMail.ts' SELVMAILENDE_REFERENCER (ellers
 * mailer klokke-mail-cron alarmen én gang til) er en senere ændring.
 *
 * DENO-FRI. Én import: kbhDele fra ./hverdage.ts, som selv har nul imports og
 * er spejlet i src/lib/hverdage.ts — samme import som klaviyoGensend.ts:48.
 * Tiden gives ind som `nu`; her læses hverken database, miljø eller ur.
 */
import { kbhDele } from "./hverdage.ts";

// ── Konstanterne ─────────────────────────────────────────────────────────────

/** Idempotensnøglens præfiks — resten er dansk dato og TIME («…:2026-09-29T10»). */
export const WEBINAR_ALARM_NOEGLE_PRAEFIKS = "webinar-mail-alarm:";
/** template_name i email_send_log og label hos Lovable. */
export const WEBINAR_ALARM_MAIL_LABEL = "webinar-mail-alarm";
/** Klokkens type — vagtens driftsbesked (klokkeMail.guard dom 11 kræver «drift»). */
export const WEBINAR_ALARM_KLOKKE_TYPE = "drift";
/** Klokkens reference_type — skal på SELVMAILENDE_REFERENCER, når cronen selv mailer. */
export const WEBINAR_ALARM_REFERENCE = "webinar_mails";
/** Højst så mange fejl-linjer i mailen — 29/9 ville ellers have givet 211 linjer. */
export const ALARM_FEJL_LINJER_MAKS = 10;

// ── Dommen: skal der alarmeres? ──────────────────────────────────────────────

/** De felter af webinar-mail-cronens MailResultat, dommen behøver. */
export interface AlarmInput {
  /** dry_run: false OG (låsen ELLER én navngiven adresse). */
  sender_rigtigt: boolean;
  fejlede: number;
  loft: {
    pause: { grund: string; til: string } | null;
    /** Statuskoden, der stoppede løkken i DENNE kørsel (403/420/429) — ellers null. */
    stoppet_ved: number | null;
  };
  over_loft: number;
}

/**
 * Alarm, når en RIGTIG kørsel har ENTEN fejlede > 0, ELLER Mailgun sagde stop
 * i denne kørsel (loft.stoppet_ved), ELLER mails venter på en pause
 * (loft.pause sat OG over_loft > 0). Aldrig i en tørkørsel eller en låst kørsel.
 *
 * Hvorfor tre grene og ikke én: PAUSEN GIVER fejlede = 0 (recon §6). I en
 * kørsel under pausen forsøges intet, så intet fejler — mailene står som
 * over_loft. En alarm på fejlede alene havde ikke set 29/9 efter den første
 * kørsel: kl. 08:24 og frem var fejlede 0, og 211 mails ventede i stilhed.
 */
export function skalAlarmere(r: AlarmInput): boolean {
  if (!r.sender_rigtigt) return false;
  if (r.fejlede > 0) return true;
  if (r.loft.stoppet_ved !== null) return true;
  return r.loft.pause !== null && r.over_loft > 0;
}

// ── Nøglen: én alarm pr. dansk time ──────────────────────────────────────────

const to = (n: number) => String(n).padStart(2, "0");

/** «2026-09-29T10» — dansk dato og time for et tidspunkt. */
export function webinarAlarmDatoOgTime(nu: Date): string {
  const p = kbhDele(nu);
  return `${p.aar}-${to(p.maaned)}-${to(p.dag)}T${to(p.time)}`;
}

/**
 * Idempotensnøglen — én alarm pr. dansk TIME, som gensenderen (klaviyoGensend.ts
 * alarmNoegle), ikke pr. døgn som profil/meta/ga. Webinarmails er tidsbundne:
 * en fejl kl. 08 («om to uger») og en ny kl. 14 («om en time») samme dag er to
 * hændelser, der hver kræver handling samme dag — en døgnnøgle ville tie om
 * den anden. Klokkens dedup går på titlen, som bærer samme dato og time.
 */
export function webinarAlarmNoegle(nu: Date): string {
  return `${WEBINAR_ALARM_NOEGLE_PRAEFIKS}${webinarAlarmDatoOgTime(nu)}`;
}

// ── Teksten ──────────────────────────────────────────────────────────────────

export interface WebinarAlarmTekstInput extends AlarmInput {
  /** Cronens fejl-linjer: «<art>: <udfald> — <grund>» pr. fejlet mail, plus enkelte andre. */
  fejl: readonly string[];
  sendt: number;
  skal_sendes: number;
}

export interface WebinarAlarmTekst {
  emne: string;
  /** Klokkens titel — bærer dansk dato og time, så dedup giver én klokke pr. time. */
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
  loft: "Mailgun afviste med loft (429)",
  ingen_noegle: "MAILGUN_SENDING_KEY mangler",
  noegle_afvist: "Mailgun afviste med 401/403 (nøglen — eller probation-loftet)",
  ugyldig: "Mailgun afviste kaldet (4xx)",
};

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

/** «kl. 10:00» dansk for et ISO-tidspunkt — eller teksten selv, hvis den ikke kan læses. */
function danskKlokke(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const p = kbhDele(new Date(ms));
  return `kl. ${to(p.time)}:${to(p.minut)}`;
}

/** Teksterne til mail og klokke. Ren; rammen (indgangsMailHtml) lægges på i functionen. */
export function webinarAlarmTekst(r: WebinarAlarmTekstInput, nu: Date): WebinarAlarmTekst {
  const tid = webinarAlarmDatoOgTime(nu);
  const [dato, time] = tid.split("T");
  const n = r.fejlede;
  const hvad = n === 1 ? "1 webinarmail" : `${n} webinarmails`;
  const stop = r.loft.stoppet_ved;
  const pause = r.loft.pause;

  const emne = n > 0
    ? `${hvad} kunne ikke sendes — webinar-mail-cron har brug for et menneske`
    : `Webinarmails venter: Mailgun har sagt stop — ${r.over_loft} udsat`;
  const titel = n > 0
    ? `Webinarmails: ${hvad} kunne ikke sendes (${dato} kl. ${time})`
    : `Webinarmails: Mailgun har sagt stop, ${r.over_loft} venter (${dato} kl. ${time})`;

  const fordeling = fordelPaaUdfald(r.fejl);
  const afsnit: string[] = [];
  if (n > 0) {
    const dele = fordeling.map((f) => `${f.antal} × ${f.udfald}`).join(", ");
    afsnit.push(`Kørslen ${dato} kl. ${time} skulle sende ${r.skal_sendes} mails, sendte ${r.sendt} og fejlede med ${n}${dele ? ` (${dele})` : ""}.`);
  } else {
    afsnit.push(`Kørslen ${dato} kl. ${time} skulle sende ${r.skal_sendes} mails og sendte ${r.sendt}.`);
  }
  if (stop !== null) {
    afsnit.push(`Mailgun sagde stop midt i kørslen (status ${stop}) — løkken blev afbrudt, og sporet er skrevet.`);
  }
  if (pause !== null) {
    afsnit.push(`Pausen gælder til ${danskKlokke(pause.til)}: ${pause.grund}. Indtil da sender cronen intet.`);
  }
  if (r.over_loft > 0) {
    afsnit.push(`${r.over_loft} ${r.over_loft === 1 ? "mail blev" : "mails blev"} ikke forsøgt (over_loft) — de tages i en senere kørsel.`);
  }
  afsnit.push(
    "Hvad der sker nu: fejlede mails indhentes automatisk, indtil næste påmindelse er planlagt (indhentningen i webinarMailDom.ts). Det, der ikke nås inden da, udløber som for_sent_efter_fejl og sendes ikke.",
  );

  const blokke: { overskrift: string; tekst: string }[] = [];
  const linjer = r.fejl.slice(0, ALARM_FEJL_LINJER_MAKS);
  for (const linje of linjer) {
    const l = laesFejlLinje(linje);
    if (l) blokke.push({ overskrift: l.art, tekst: `${l.udfald} — ${UDFALD_ORD[l.udfald] ?? l.udfald}${l.rest ? ` · ${l.rest}` : ""}` });
    else blokke.push({ overskrift: "fejl", tekst: linje });
  }
  const resten = r.fejl.length - linjer.length;
  if (resten > 0) blokke.push({ overskrift: "…", tekst: `og ${resten} ${resten === 1 ? "linje" : "linjer"} mere — alle står i webinar_mails (udfald <> 'ok').` });

  const tekst = [
    ...afsnit,
    "",
    ...blokke.map((b) => `${b.overskrift}: ${b.tekst}`),
    "",
    "Sporet: webinar_mails (udfald <> 'ok', forsoegt_at de sidste timer). Tørkørsel i hånden: SELECT public.kald_edge('webinar-mail-cron', '{}'::jsonb, 60000);",
  ].join("\n");
  return { emne, titel, afsnit, blokke, tekst };
}
