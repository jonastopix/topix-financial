/**
 * webinarMotor/ics — husets EGEN kalenderinvitation (skive 1, 30/9-2026).
 *
 * Spejlet ORDRET i supabase/functions/_shared/webinarMotor/ics.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 *
 * RFC 5545: CRLF, linjer foldet ved 75 oktetter (UTF-8, ikke tegn), tekst
 * escapet (\\ ; , og linjeskift — samme regel som src/lib/kalenderfil.ts:icsEscape).
 * UID er VORES (`<tilmelding_id>@webinar.topix.dk`) og stabil, så en flyttet
 * eller aflyst session opdaterer SAMME aftale med en højere SEQUENCE.
 *
 * TIDSZONEN er Europe/Copenhagen med VTIMEZONE. ÉN UNDTAGELSE: en vægtid, der
 * findes to gange (sommertidens sidste time, fx 25/10 kl. 02:30), skrives i
 * UTC («Z») — RFC 5545 læser en tvetydig TZID-tid som den FØRSTE forekomst, og
 * en session kl. 02:30 vintertid ville ellers stå en time for tidligt.
 */

export const ICS_DOMAENE = "webinar.topix.dk";
export const ORGANIZER_NAVN = "Morten Larsen";
export const ORGANIZER_MAIL = "webinar@webinar.topix.dk";
export const ALARM_MIN = 15;
export const TZID = "Europe/Copenhagen";

export const icsUid = (tilmeldingId: string): string => `${tilmeldingId}@${ICS_DOMAENE}`;

export function icsTekst(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold ved 75 oktetter; fortsættelseslinjer starter med ét mellemrum (RFC 5545 §3.1). Et tegn deles aldrig. */
export function foldIcsLinje(linje: string): string {
  const enc = new TextEncoder();
  const ud: string[] = [];
  let rest = linje;
  let foerste = true;
  while (rest.length > 0) {
    const loft = foerste ? 75 : 74;
    let n = 0;
    let bytes = 0;
    for (const tegn of rest) {
      const b = enc.encode(tegn).length;
      if (bytes + b > loft) break;
      bytes += b;
      n += tegn.length;
    }
    if (n === 0) n = rest.codePointAt(0)! > 0xffff ? 2 : 1;
    ud.push((foerste ? "" : " ") + rest.slice(0, n));
    rest = rest.slice(n);
    foerste = false;
  }
  return ud.join("\r\n");
}

const to = (n: number) => String(n).padStart(2, "0");

/** 20261013T090000Z */
export function icsUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${to(d.getUTCMonth() + 1)}${to(d.getUTCDate())}T${to(d.getUTCHours())}${to(d.getUTCMinutes())}${to(d.getUTCSeconds())}Z`;
}

const KBH = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZID, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function kbhVaegtid(ms: number): { tekst: string; somUtcMs: number } {
  const p: Record<string, string> = {};
  for (const del of KBH.formatToParts(new Date(ms))) p[del.type] = del.value;
  const [aar, md, dag, t, m, s] = [p.year, p.month, p.day, p.hour, p.minute, p.second].map(Number);
  return { tekst: `${aar}${to(md)}${to(dag)}T${to(t % 24)}${to(m)}${to(s)}`, somUtcMs: Date.UTC(aar, md - 1, dag, t % 24, m, s) };
}

/**
 * Er vægtiden for dette øjeblik tvetydig (findes to gange)? Danmark er UTC+1
 * eller UTC+2; vægtiden v svarer til øjeblikkene v−1 t og v−2 t. Giver BEGGE
 * samme vægtid tilbage, er den tvetydig.
 */
export function erTvetydigVaegtid(ms: number): boolean {
  const v = kbhVaegtid(ms);
  const a = kbhVaegtid(v.somUtcMs - 3_600_000).tekst;
  const b = kbhVaegtid(v.somUtcMs - 7_200_000).tekst;
  return a === v.tekst && b === v.tekst;
}

/** «DTSTART;TZID=Europe/Copenhagen:20261013T110000» — eller i UTC, når vægtiden er tvetydig. */
export function icsTidLinje(navn: "DTSTART" | "DTEND", ms: number): string {
  if (erTvetydigVaegtid(ms)) return `${navn}:${icsUtc(ms)}`;
  return `${navn};TZID=${TZID}:${kbhVaegtid(ms).tekst}`;
}

export const VTIMEZONE_KBH = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
] as const;

export interface IcsInput {
  tilmeldingId: string;
  /** webinar_sessioner.ics_sekvens — øges ved flyt/aflys. */
  sekvens: number;
  metode: "REQUEST" | "CANCEL";
  startMs: number;
  slutMs: number;
  /** DTSTAMP — hvornår filen er bygget (gives ind). */
  stempelMs: number;
  titel: string;
  beskrivelse: string;
  /** Det personlige link til rummet. */
  url: string;
  deltagerMail: string;
}

/**
 * Beskrivelsen i husets .ics (skive 3): ét sted for webinar-rum GET ics OG
 * webinar-mail-cron's vedhæftede invitation, så de to filer er ens. Lover
 * intet om sendingen — kun rummet og spørgsmålet i venteværelset.
 */
export function icsBeskrivelse(url: string, vaertNavn: string | null): string {
  return `Gå ind i rummet her: ${url}\n\nDu kan stille ${vaertNavn ?? "værten"} et spørgsmål allerede i venteværelset.`;
}

/** Hele filen, CRLF-afsluttet. */
export function bygIcs(i: IcsInput): string {
  const aflyst = i.metode === "CANCEL";
  const linjer = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Topix//Webinarmotoren//DA",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.metode}`,
    ...VTIMEZONE_KBH,
    "BEGIN:VEVENT",
    `UID:${icsUid(i.tilmeldingId)}`,
    `SEQUENCE:${Math.max(0, Math.floor(i.sekvens))}`,
    `DTSTAMP:${icsUtc(i.stempelMs)}`,
    icsTidLinje("DTSTART", i.startMs),
    icsTidLinje("DTEND", i.slutMs),
    `SUMMARY:${icsTekst(i.titel)}`,
    `DESCRIPTION:${icsTekst(i.beskrivelse)}`,
    `LOCATION:${icsTekst(i.url)}`,
    `URL:${i.url}`,
    `ORGANIZER;CN=${icsTekst(ORGANIZER_NAVN)}:mailto:${ORGANIZER_MAIL}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${i.deltagerMail}`,
    `STATUS:${aflyst ? "CANCELLED" : "CONFIRMED"}`,
    ...(aflyst ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsTekst(i.titel)}`, `TRIGGER:-PT${ALARM_MIN}M`, "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return linjer.map(foldIcsLinje).join("\r\n") + "\r\n";
}
