/**
 * src/lib/kalenderfil.ts — «Føj til kalender» som ren funktion (10/9-2026).
 *
 * FORMATET er .ics (iCalendar): én fil der åbner i Apple Kalender, Google
 * Kalender og Outlook uden at medlemmet skal vælge — og uden en tredjepart
 * i midten. Huset har intet kalenderformat i forvejen (grep 10/9: ingen
 * text/calendar, ingen VCALENDAR); nærmeste slægtning er reminder-mailen
 * (event-reminders), som bærer mødelinket og deep-linket /events/<id>.
 *
 * KRAVET (Jonas 10/9): «linket fra selve eventet er med i
 * kalendertilføjelsen; ellers har det ikke den store værdi.» Derfor står
 * Meet-linket BÅDE i LOCATION og i DESCRIPTION — nogle kalendere viser det
 * ene, nogle det andet, og nogle gør linket klikbart kun i beskrivelsen.
 * Og URL'en til eventsiden på platformen står ALTID i beskrivelsen: den er
 * vejen ind, også hvis mødelinket skiftes bagefter.
 *
 * UDEN MEET-LINK: meet_url sættes i hånden i admin (EventEditor, valgfrit,
 * https-valideret) — ingen automatik laver det, så et event kan være
 * publiceret før mødet er oprettet. AFGJORT: knappen tilbydes alligevel;
 * beskrivelsen siger at mødelinket sættes på eventsiden, og eventsiden er
 * LOCATION, så aftalen altid har en vej ind. En aftale uden nogen vej ind
 * er værdiløs — en aftale med vejen til eventsiden er ikke.
 *
 * VARIGHEDEN følger fasedommens regel (eventPhase.eventEndTime): ends_at,
 * ellers starts_at + 90 min — samme sluttid som «Deltag nu»-knappen regner
 * med. Tilbydes for kommende OG igangværende events (fase before/live),
 * aldrig for afholdte (after) eller aflyste.
 *
 * Testet i __tests__/kalenderfil.test.ts.
 */
import { eventEndTime, eventMeetPhase, type EventTimes } from "@/lib/hjemmebane/eventPhase";

export interface KalenderEvent extends EventTimes {
  id: string;
  title: string;
  description?: string | null;
  meet_url?: string | null;
  status?: string | null;
}

/** Basis-URL'en for eventsiden — kalderen giver window.location.origin. */
export const eventsideUrl = (basisUrl: string, eventId: string): string =>
  `${basisUrl.replace(/\/+$/, "")}/events/${eventId}`;

/** Må «Føj til kalender» tilbydes? Ikke aflyst, ikke afholdt. */
export function kanFoejeTilKalender(event: Pick<KalenderEvent, "starts_at" | "ends_at" | "status">, nu: Date = new Date()): boolean {
  if (event.status === "cancelled") return false;
  return eventMeetPhase(event, nu) !== "after";
}

/** iCalendar-tekst: \ ; , og linjeskift escapes (RFC 5545 §3.3.11). */
export function icsEscape(tekst: string): string {
  return tekst.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** UTC-tid i iCalendar-form: 20260915T083000Z. */
export function tilIcsTid(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Linjer over 75 oktetter foldes med CRLF + mellemrum (RFC 5545 §3.1). Tæller i UTF-8-bytes. */
export function foldLinje(linje: string): string {
  const enc = new TextEncoder();
  const ud: string[] = [];
  let rest = linje;
  let foerste = true;
  while (rest.length > 0) {
    const loft = foerste ? 75 : 74;
    let n = rest.length;
    while (n > 0 && enc.encode(rest.slice(0, n)).length > loft) n--;
    if (n === 0) n = 1;
    ud.push((foerste ? "" : " ") + rest.slice(0, n));
    rest = rest.slice(n);
    foerste = false;
  }
  return ud.join("\r\n");
}

export const KALENDER_MEET_LINJE = "Google Meet: ";
export const KALENDER_EVENTSIDE_LINJE = "Eventet på The Boardroom: ";
export const KALENDER_INTET_LINK_LINJE = "Mødelinket sættes på eventsiden, når det er klar.";

/** Beskrivelsen: eventets egen tekst, mødelinket (eller at det kommer), og altid vejen til eventsiden. */
export function kalenderBeskrivelse(event: Pick<KalenderEvent, "id" | "description" | "meet_url">, basisUrl: string): string {
  const dele: string[] = [];
  const egen = (event.description ?? "").trim();
  if (egen) dele.push(egen);
  dele.push(event.meet_url ? `${KALENDER_MEET_LINJE}${event.meet_url}` : KALENDER_INTET_LINK_LINJE);
  dele.push(`${KALENDER_EVENTSIDE_LINJE}${eventsideUrl(basisUrl, event.id)}`);
  return dele.join("\n\n");
}

/** Hele .ics-filen. `nu` er DTSTAMP — givet udefra, så testen er deterministisk. */
export function bygKalenderfil(event: KalenderEvent, basisUrl: string, nu: Date = new Date()): string {
  const side = eventsideUrl(basisUrl, event.id);
  const linjer = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Boardroom//Events//DA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${event.id}@app.theboardroom.dk`,
    `DTSTAMP:${tilIcsTid(nu)}`,
    `DTSTART:${tilIcsTid(event.starts_at)}`,
    `DTEND:${tilIcsTid(eventEndTime(event))}`,
    `SUMMARY:${icsEscape(event.title)}`,
    `DESCRIPTION:${icsEscape(kalenderBeskrivelse(event, basisUrl))}`,
    // Meet-linket i LOCATION når det findes — ellers eventsiden, så feltet aldrig er tomt.
    `LOCATION:${icsEscape(event.meet_url ?? side)}`,
    `URL:${event.meet_url ?? side}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return linjer.map(foldLinje).join("\r\n") + "\r\n";
}

/** Filnavn: «the-boardroom-<slug>.ics» — små bogstaver, danske tegn omskrevet, intet ulovligt. */
export function kalenderfilnavn(titel: string): string {
  const slug = titel
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `the-boardroom-${slug || "event"}.ics`;
}
