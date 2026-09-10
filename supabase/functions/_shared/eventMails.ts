/**
 * _shared/eventMails.ts — eventmailenes rene domme (10/9-2026).
 *
 * REN: ingen Deno-, Supabase- eller npm-imports, så vitest læser den direkte
 * (src/lib/__tests__/eventMails.test.ts) — som canonicalEngine/genkoersel.
 *
 * TRE TING JONAS BAD OM (recon-eventmails.md):
 * 1. En mail når et event PUBLICERES (publish-event). Hvem: husets dom for
 *    «alle aktive medlemmer» er RPC'en get_event_non_responders — aktivt
 *    medlemskab, ikke advisor, ikke legat, intet aktivt svar. For et nyt
 *    event har ingen svaret, så det er alle aktive; for «Genåbn som
 *    publiceret» udelukker den dem der allerede har svaret. Reglen står her
 *    som ren funktion (skalHavePubliceringsmail), så den kan læses og testes;
 *    RPC'en er den der kører i drift.
 * 2. Kalender-linket: mailen linker til EVENTSIDEN, hvor «Føj til kalender»
 *    står (#788) — mail-API'et har intet felt til vedhæftninger, og body-
 *    teksten escapes (ingen klikbare links i den). Knappen i mailen siger det.
 * 3. «Om en time» til de tilmeldte: et TREDJE vindue (C) i event-reminders,
 *    kørt af sin egen cron hvert kvarter — A og B er urørte og kører stadig
 *    dagligt kl. 07. C rammer når starten er 60–90 min væk: cron'en kører
 *    hvert 15. min, så ethvert event rammes mindst én gang (dedup tager
 *    resten), og mailkøens 15 min forsinkelse lander mailen 40–75 min før.
 */

export const OM_EN_TIME_FRA_MIN = 60;
export const OM_EN_TIME_TIL_MIN = 90;

/** Starter eventet om 60–90 minutter (fra inklusiv, til eksklusiv)? */
export function erOmEnTime(startsAtIso: string, nu: Date): boolean {
  const min = (new Date(startsAtIso).getTime() - nu.getTime()) / 60_000;
  return min >= OM_EN_TIME_FRA_MIN && min < OM_EN_TIME_TIL_MIN;
}

/** Hvilke vinduer en kørsel skal køre: tom body = A+B (som altid); { vindue: "time" } = kun C. */
export function vinduerFraBody(body: unknown): { ab: boolean; c: boolean } {
  const v = body && typeof body === "object" ? (body as Record<string, unknown>).vindue : undefined;
  if (v === "time") return { ab: false, c: true };
  return { ab: true, c: false };
}

/** Husets dom for hvem der får publiceringsmailen — spejl af get_event_non_responders. */
export function skalHavePubliceringsmail(p: {
  erAdvisor: boolean;
  aktivtMedlemskab: boolean;
  erLegat: boolean;
  harAktivtSvar: boolean;
}): boolean {
  return !p.erAdvisor && p.aktivtMedlemskab && !p.erLegat && !p.harAktivtSvar;
}

const TZ = "Europe/Copenhagen";

export function datoOrd(iso: string): string {
  return new Date(iso).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
}
export function tidOrd(iso: string): string {
  return new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export interface EventTilMail {
  id: string;
  title: string;
  starts_at: string;
  meet_url?: string | null;
}

export interface Besked {
  type: string;
  priority: "important";
  title: string;
  body: string;
  reference_type: "event";
  reference_id: string;
  deep_link: string;
  dedup_key: string;
}

/** «Nyt event: …» — én gang pr. event pr. modtager (dedup uden vindue). */
export function publiceringsBesked(e: EventTilMail): Besked {
  const hvor = e.meet_url ? " · Online" : "";
  return {
    type: "event_published",
    priority: "important",
    title: `Nyt event: ${e.title}`,
    body: `${datoOrd(e.starts_at)} kl. ${tidOrd(e.starts_at)}${hvor}. Tilmeld dig — eller sig fra — og føj det til din kalender fra eventsiden.`,
    reference_type: "event",
    reference_id: e.id,
    deep_link: `/events/${e.id}`,
    dedup_key: `event_published:${e.id}`,
  };
}

/** Vindue C: «Om en time: …» — samme type og dedup-form som A og B (suffiks c). */
export function omEnTimeBesked(e: EventTilMail): Besked {
  return {
    type: "event_reminder",
    priority: "important",
    title: `Om en time: ${e.title}`,
    body: `Kl. ${tidOrd(e.starts_at)}.${e.meet_url ? ` Mødelink: ${e.meet_url}` : ""}`,
    reference_type: "event",
    reference_id: e.id,
    deep_link: `/events/${e.id}`,
    dedup_key: `event_reminder:${e.id}:c`,
  };
}
