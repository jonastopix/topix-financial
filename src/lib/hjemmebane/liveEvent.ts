/**
 * src/lib/hjemmebane/liveEvent.ts
 *
 * «Live nu»-mærket i menuen (Jonas 10/9: «Når vi er live, skal der være en
 * badge på folks side om at der er en live session i gang, og når man
 * klikker på den, kommer man over på eventet.») — de rene dele, testet i
 * __tests__/liveEvent.test.ts.
 *
 * DOMMEN OPFINDES IKKE: «live» er eventMeetPhase (eventPhase.ts) — fra 15
 * minutter før start til og med sluttiden, samme dom som Meet-knappen
 * (EventRegisterAction) og nedtællingens «I gang» (#769). Denne fil vælger
 * kun HVILKET event der bæres, og hvad mærket siger og fører hen.
 *
 * FLERE LIVE PÅ ÉN GANG: det der er begyndt, vinder over det der begynder
 * om ti minutter — man skal opdage det der SKER, ikke det der kommer. Er
 * begge begyndt (eller ingen), vinder den tidligste start. Ét mærke, ét
 * event: menuen er ikke en liste.
 *
 * HVOR: i menuen ved «Events» — så det ses uanset side. Forsidens
 * «Kommende» ser man kun hvis man er der, og pointen er at opdage det.
 * Der findes intet mærke-mønster på menupunkter i forvejen (HbSidebar har
 * kun aktiv-stregen); mærket er husets pille (HbTag-formen) i sage/
 * evergreen, IKKE rust og IKKE blinkende: rust er husets «kræver noget»,
 * og noget der blinker er en alarm, ikke en invitation. Det står bare dér.
 *
 * HVEM: alle der har «Events» i menuen — medlemmer og rådgivere. En live
 * session man ikke er tilmeldt, er netop den man skal opdage. RLS lader
 * medlemmer se alle publicerede events, og kapaciteten (events.capacity)
 * afgøres på eventsiden, ikke her.
 *
 * KLIKKET fører til /events/:id (EventDetailView, med Meet-knappen) — ikke
 * til listen.
 */

import { eventMeetPhase, type EventTimes } from "./eventPhase";

export interface LiveKandidat extends EventTimes {
  id: string;
  title: string;
  status?: string;
}

export const LIVE_MAERKE = "Live nu";

/** Det ene event der er live nu — null når ingen er. Kun publicerede. */
export function liveEvent<T extends LiveKandidat>(events: readonly T[], now: Date = new Date()): T | null {
  const live = events.filter((e) => (e.status == null || e.status === "published") && eventMeetPhase(e, now) === "live");
  if (live.length === 0) return null;
  const t = now.getTime();
  const begyndt = (e: T) => new Date(e.starts_at).getTime() <= t;
  return [...live].sort((a, b) => {
    const ba = begyndt(a) ? 0 : 1;
    const bb = begyndt(b) ? 0 : 1;
    if (ba !== bb) return ba - bb;
    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  })[0];
}

/** Hvor mærket fører hen: eventets egen side. */
export function liveEventSti(e: Pick<LiveKandidat, "id">): string {
  return `/events/${e.id}`;
}

/** Skærmlæserens tekst — mærket selv siger kun «Live nu». */
export function liveEventTitel(e: Pick<LiveKandidat, "title">): string {
  return `Live nu: ${e.title}`;
}
