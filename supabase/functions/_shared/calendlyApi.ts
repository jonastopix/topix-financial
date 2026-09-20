/**
 * calendlyApi — platformens ene Calendly-klient til afklaringssamtalen
 * (udkast 18/9-2026, rev. 2). Nøglen er CALENDLY_API_KEY (Jonas' org — samme
 * som create-free-intro-booking's Jonas-spor). Eventtypen «Afklaringssamtale»
 * er målt 18/9 (uri nedenfor); AFKLARING_EVENT_TYPE_URI kan overstyre.
 *
 * FIRE KALD, målt mod API'et 18/9:
 *   hentLedigeTider   GET event_type_available_times — de bookbare slots
 *                     med hans Google-kalender, Calendly-events og buffere
 *                     trukket fra (begge veje). Højst 7 dage pr. kald.
 *   opretBooking      POST /invitees — bookingen oprettes i Calendly på hans
 *                     eventtype: den lander i Google-kalenderen, Meet-linket
 *                     laves, og tracking bærer ansøgningens id (som de gamle
 *                     links), så calendly-webhook kan koble aflysninger gjort
 *                     i Calendly/Google tilbage til ansøgningen.
 *   hentMoedeLink     GET scheduled_event → location.join_url (Meet).
 *   aflysBooking      POST scheduled_event/cancellation — Calendly aflyser i
 *                     kalenderen. Flytning = aflys + opret (API'et har ingen
 *                     reschedule).
 * Fejl kaster CalendlyFejl med status — kalderen oversætter (409/502).
 * create-free-intro-booking og stripe-webhook har deres egne kopier af
 * users/me + event_types; en samling er stadig «et eget run» (deres ord).
 */
import type { CalendlySlot } from "./samtaleSlots.ts";
import { CALENDLY_SPOERGSMAAL_VIRKSOMHED } from "./samtaleSlots.ts";

const BASE = "https://api.calendly.com";
/** Målt 18/9-2026: «Afklaringssamtale», 30 min, Google Meet, slug afklaringssamtale. */
export const AFKLARING_EVENT_TYPE_URI_STANDARD = "https://api.calendly.com/event_types/5b77d2e2-c038-4440-8a56-508ca1647db4";
export const TIDSZONE = "Europe/Copenhagen";

export class CalendlyFejl extends Error {
  status: number;
  constructor(status: number, besked: string) {
    super(besked);
    this.status = status;
  }
}

export function afklaringEventType(): string {
  return Deno.env.get("AFKLARING_EVENT_TYPE_URI")?.trim() || AFKLARING_EVENT_TYPE_URI_STANDARD;
}

function noegle(): string {
  const k = Deno.env.get("CALENDLY_API_KEY")?.trim();
  if (!k) throw new CalendlyFejl(503, "CALENDLY_API_KEY mangler");
  return k;
}

/** Som DataCVR (virksomhedsOprettelse.ts): ét hængende Calendly-kald må ikke låse «Henter ledige tider…» (recon 19/9, §2). */
export const CALENDLY_TIMEOUT_MS = 8000;

async function kald<T>(url: string, init: RequestInit = {}): Promise<T> {
  const styring = new AbortController();
  const vaekkeur = setTimeout(() => styring.abort(), CALENDLY_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: styring.signal, headers: { Authorization: `Bearer ${noegle()}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new CalendlyFejl(504, `Calendly svarede ikke inden ${CALENDLY_TIMEOUT_MS / 1000} s på ${url.replace(BASE, "")}`);
    throw err;
  } finally {
    clearTimeout(vaekkeur);
  }
  const tekst = await res.text();
  if (!res.ok) throw new CalendlyFejl(res.status, `Calendly ${res.status} på ${url.replace(BASE, "")}: ${tekst.slice(0, 300)}`);
  return (tekst ? JSON.parse(tekst) : {}) as T;
}

export async function hentLedigeTider(eventType: string, fra: string, til: string): Promise<CalendlySlot[]> {
  const u = new URL(`${BASE}/event_type_available_times`);
  u.searchParams.set("event_type", eventType);
  u.searchParams.set("start_time", fra);
  u.searchParams.set("end_time", til);
  const data = await kald<{ collection?: CalendlySlot[] }>(u.toString());
  return data.collection ?? [];
}

export interface OprettetBooking {
  inviteeUri: string;
  eventUri: string;
}

export async function opretBooking(args: { eventType: string; start: string; email: string; navn: string; virksomhed: string; ansoegningId: string }): Promise<OprettetBooking> {
  const body = {
    event_type: args.eventType,
    start_time: args.start,
    invitee: { email: args.email, name: args.navn || args.email, timezone: TIDSZONE },
    location: { kind: "google_conference" },
    questions_and_answers: [{ question: CALENDLY_SPOERGSMAAL_VIRKSOMHED, answer: args.virksomhed, position: 0 }],
    // Samme to parametre som de gamle links (bygBookingUrl): webhooken finder ansøgningen igen.
    tracking: { salesforce_uuid: args.ansoegningId, utm_content: args.ansoegningId, utm_source: "platform", utm_campaign: null, utm_medium: null, utm_term: null },
  };
  const data = await kald<{ resource?: { uri?: string; event?: string; scheduled_event?: { uri?: string } } }>(`${BASE}/invitees`, { method: "POST", body: JSON.stringify(body) });
  const inviteeUri = data.resource?.uri;
  const eventUri = data.resource?.event ?? data.resource?.scheduled_event?.uri;
  if (!inviteeUri || !eventUri) throw new CalendlyFejl(502, `Calendly svarede uden invitee/event: ${JSON.stringify(data).slice(0, 300)}`);
  return { inviteeUri, eventUri };
}

/**
 * Invitee-ressourcen (20/9, no-show): målt 20/9 på en rigtig invitee — den bærer `tracking`
 * (salesforce_uuid/utm_content = VORES id), `event` (scheduled_event-URI) og `no_show`
 * ({ uri, created_at } | null). Bruges når et webhook-event ikke selv bærer tracking.
 */
export async function hentInvitee(inviteeUri: string): Promise<{ tracking: { salesforce_uuid?: string | null; utm_content?: string | null } | null; event: string | null; no_show: { uri: string; created_at: string } | null } | null> {
  if (!/^https:\/\/api\.calendly\.com\/scheduled_events\/[0-9a-f-]+\/invitees\/[0-9a-f-]+$/i.test(inviteeUri)) return null;
  const svar = await kald<{ resource?: { tracking?: { salesforce_uuid?: string | null; utm_content?: string | null } | null; event?: string | null; no_show?: { uri: string; created_at: string } | null } }>(inviteeUri);
  const r = svar.resource;
  if (!r) return null;
  return { tracking: r.tracking ?? null, event: typeof r.event === "string" ? r.event : null, no_show: r.no_show ?? null };
}
export async function hentMoedeLink(eventUri: string): Promise<string | null> {
  const data = await kald<{ resource?: { location?: { join_url?: string | null; type?: string } } }>(eventUri);
  const j = data.resource?.location?.join_url;
  return typeof j === "string" && /^https:\/\//.test(j) ? j : null;
}

export async function aflysBooking(eventUri: string, grund: string): Promise<void> {
  await kald(`${eventUri}/cancellation`, { method: "POST", body: JSON.stringify({ reason: grund.slice(0, 10_000) }) });
}
