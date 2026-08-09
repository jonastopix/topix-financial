/** Event-fasedommen som REN funktion (Events-miljøet): om et event er
    afholdt udledes af SLUTTIDEN i stedet for manuel status-flytning —
    "Markér afholdt" i EventEditor består som eksplicit mulighed, men
    læsevejene behøver den ikke længere.
    Strukturel type (ikke EventRow-import) — filen skal være fri af
    adminContentApi og testbar uden React/Supabase. */

export interface EventTimes {
  /** ISO-timestamp — NOT NULL i skemaet. */
  starts_at: string;
  /** ISO-timestamp eller null — kolonnen er nullable (kun et værn:
      prod har 0 publicerede events uden ends_at). */
  ends_at: string | null;
}

/** Default-varighed når ends_at mangler: 90 minutter — formatets
    længste session (live sparring/workshop kører typisk 60-90 min),
    så et event uden sluttid aldrig markeres afholdt, mens det stadig
    er i gang. */
const FALLBACK_DURATION_MS = 90 * 60 * 1000;

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
