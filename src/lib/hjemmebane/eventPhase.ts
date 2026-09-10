/** Event-fasedommen som REN funktion (Events-miljøet): om et event er
    afholdt udledes af SLUTTIDEN i stedet for manuel status-flytning —
    "Markér afholdt" i EventEditor består som eksplicit mulighed, men
    læsevejene behøver den ikke længere.
    Strukturel type (ikke EventRow-import) — filen skal være fri af
    adminContentApi og testbar uden React/Supabase. */

import { kalenderdageTil } from "./aftaler";

export interface EventTimes {
  /** ISO-timestamp — NOT NULL i skemaet. */
  starts_at: string;
  /** ISO-timestamp, null eller FRAVÆRENDE — kolonnen er nullable (kun
      et værn: prod har 0 publicerede events uden ends_at). Feltet er
      valgfrit (6/9-2026), fordi de genererede typer nu udtrykker en
      nullable kolonne som `ends_at?: string`; PostgREST leverer stadig
      `null` for en tom kolonne, så begge former skal accepteres.
      REGLEN: null og undefined betyder det samme — «ingen sluttid» —
      og begge falder tilbage på starts_at + 90 min i eventEndTime. */
  ends_at?: string | null;
}

/** Default-varighed når ends_at mangler: 90 minutter — formatets
    længste session (live sparring/workshop kører typisk 60-90 min),
    så et event uden sluttid aldrig markeres afholdt, mens det stadig
    er i gang. */
const FALLBACK_DURATION_MS = 90 * 60 * 1000;

/** Sluttiden: ends_at når den er sat; ellers starts_at + 90 min. Et
    manglende ends_at (undefined) behandles PRÆCIS som null — tjekket er
    bevidst en sandhedsværdi, ikke `!== null`, så en række hentet uden
    kolonnen dømmes som en række med en tom kolonne. Events MED ends_at
    rammes ikke: deres sluttid vinder altid. */
export function eventEndTime(event: EventTimes): Date {
  if (event.ends_at) return new Date(event.ends_at);
  return new Date(new Date(event.starts_at).getTime() + FALLBACK_DURATION_MS);
}

export function isEventPast(event: EventTimes, now: Date = new Date()): boolean {
  return eventEndTime(event).getTime() < now.getTime();
}

export type EventMeetPhase = "before" | "live" | "after";

/** Meet-knappens fase: "live" fra 15 min FØR start (man skal kunne
    logge på i god tid) TIL OG MED sluttiden; "after" er STRENGT efter
    sluttiden. Grænserne: præcis 15 min før = live; præcis ved sluttid
    = stadig live. */
const LIVE_LEAD_MS = 15 * 60 * 1000;

export function eventMeetPhase(event: EventTimes, now: Date = new Date()): EventMeetPhase {
  const t = now.getTime();
  if (t > eventEndTime(event).getTime()) return "after";
  if (t >= new Date(event.starts_at).getTime() - LIVE_LEAD_MS) return "live";
  return "before";
}

/**
 * Nedtællingen på events-fladen og forsiden — KALENDERDAGE, ikke timer.
 *
 * FEJL SET 10/9 kl. 08.49 på /events: et event samme dag kl. 11 stod som
 * «I morgen», og et event 14 dage frem stod som «Om 15 dage». Begge flader
 * havde hver sin lokale `Math.ceil((starts − now) / døgn)`: to timer og
 * elleve minutter rundes op til én dag, fjorten dage og to timer til
 * femten. Husets greb er lokale kalenderdage (fornyelsesbåndet, «sidst
 * online» #751, forslagets udløb #740, venterPaaVelkomst.kalenderdageSiden)
 * — her aftaler.kalenderdageTil, som forslagets udløb allerede bruger.
 * Påmindelsesmailen (event-reminders, dayKey i Europe/Copenhagen) regnede
 * i forvejen kalenderdage, så mail og flade sagde to forskellige ting om
 * samme dag. Nu siger de det samme.
 *
 * «I DAG» fandtes før kun som «days <= 0», dvs. FØRST når starttiden var
 * passeret — et event senere i dag hed altid «I morgen». Nu er «I dag»
 * kalenderdagen, uanset klokken.
 *
 * PASSERET STARTTID: fra 15 min før start til og med sluttiden er eventet
 * «I gang» (eventMeetPhase = live — samme dom som Meet-knappen). Efter
 * sluttiden er det afholdt (isEventPast) og hører til i «Afholdte»;
 * listAllUpcomingEvents filtrerer det ud, så nedtællingen kaldes ikke —
 * returnerer null hvis den alligevel gør.
 */
export function eventNedtaelling(event: EventTimes, now: Date = new Date()): string | null {
  if (isEventPast(event, now)) return null;
  if (eventMeetPhase(event, now) === "live") return "I gang";
  const dage = kalenderdageTil(new Date(event.starts_at), now);
  if (dage <= 0) return "I dag";
  if (dage === 1) return "I morgen";
  return `Om ${dage} dage`;
}
