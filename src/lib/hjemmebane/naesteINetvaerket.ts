/**
 * src/lib/hjemmebane/naesteINetvaerket.ts — «Næste i Netværket», forsidens
 * ene kort om Netværket (seks steder, skridt 2, 2/10-2026).
 *
 * Jonas 2/10: «Din måned», «Kommende» og «Fra fællesskabet» forlader
 * forsiden «med én linje tilbage» — og: «Nyeste opslag fra community vil
 * jeg dog gerne have vist nederst, under næste event.» Forslagets ord
 * (ia-forslag, spørgsmål 2): «Uden linjen ser et medlem aldrig Netværket,
 * før hun klikker.» Så: ÉT kort nederst på forsiden med to rækker —
 * øverst det NÆSTE event (som «Kommende» viste det: dag, måned, titel,
 * meta, værter, tilmelding), under det det NYESTE Community-opslag (titel,
 * forfatter, tid, svar, link). Hver del har sin egen tomme tilstand; kortet
 * tegnes altid for et medlem med virksomhed (en tom sektion på forsiden
 * er ikke «noget er gået i stykker» her — den siger, hvad der kommer).
 *
 * REN dom, ingen React, ingen Supabase: kilderne er forsidens EKSISTERENDE
 * hentninger — listUpcomingEvents (stigende på starts_at: det første er det
 * næste) og hentFeed(30) under Community-fladens egen nøgle. Nyeste opslag =
 * senest OPRETTET (vaelgForsideOpslag, forsideOpslag.ts — ikke feedets
 * orden, hvor fastgjorte og gamle tråde med nye svar står øverst).
 *
 * KUN AKTIVE OPSLAG (rådets fund 3, 2/10): feedet kan bære en skjult tråd
 * (status «skjult» — rådgiveren ser den i Community med sit mærke), og
 * forsiden må aldrig fremhæve den. Dommen filtrerer `status === "aktiv"`
 * FØR valget af det nyeste — ellers kunne en skjult, nyere tråd skubbe det
 * nyeste aktive ud og stå på forsiden selv.
 * Testet i __tests__/naesteINetvaerket.test.ts; låst af seksSteder.guard.
 */

import { vaelgForsideOpslag, type ForsideTraad } from "./forsideOpslag";

export const NAESTE_I_NETVAERKET = {
  eyebrow: "Næste i Netværket",
  link: "Gå til Netværket",
  linkTo: "/community",
  eventEyebrow: "Næste event",
  eventTom: "Intet event på kalenderen lige nu — det næste står her, når det er sat.",
  eventAlle: "Se alle events",
  eventAlleTo: "/events",
  opslagEyebrow: "Nyeste i Community",
  opslagTom: "Ingen opslag endnu — bliv den første, der skriver.",
  opslagLaes: "Læs",
} as const;

/** Det dommen læser af en feed-række: forsidens snit + status. */
export type NaesteTraad = ForsideTraad & { status: string };

export interface NaesteINetvaerket<E, T extends NaesteTraad> {
  /** Det næste event — det første i den stigende liste — eller null. */
  event: E | null;
  /** Det senest oprettede opslag — eller null, når feedet er tomt. */
  opslag: T | null;
}

/** `events` er listUpcomingEvents' orden (status published, starts_at ≥ nu,
    stigende): det første ER det næste — dommen sorterer ikke om, så fladen
    og «Kommende» (før 2/10) viser det samme event. `traade` er feedet; det
    nyeste AKTIVE vælges af oprettelsen (en skjult tråd vælges aldrig). */
export function naesteINetvaerket<E, T extends NaesteTraad>(events: readonly E[], traade: readonly T[]): NaesteINetvaerket<E, T> {
  const aktive = traade.filter((t) => t.status === "aktiv");
  return { event: events[0] ?? null, opslag: vaelgForsideOpslag(aktive).fremhaevet };
}
