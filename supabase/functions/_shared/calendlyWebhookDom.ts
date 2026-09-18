/**
 * calendlyWebhookDom — dommen bag calendly-webhook (13/9, recon-calendly-
 * reparationen.md §3, §7 B6).
 *
 * HVORFOR: calendly-webhook var uden test overhovedet (F8), og dens ene
 * skjulte sideeffekt — at en HOST-aflysning genåbner virksomhedens gratis
 * intro (companies.intro_session_used_at = null) — var kun sikret af et
 * advisor-filter på selve UPDATE'en (.eq("advisor", "morten")). Da filteret
 * blev åbnet 13/9, så Jonas' betalte spor også kan matches, ville en
 * aflysning af en BETALT Jonas-session ellers genåbne Mortens gratis ret.
 * Det er præcis den slags fejl en test fanger — så dommen ligger her.
 *
 * TO FUNKTIONER, fordi inputtene kendes på to tidspunkter i handleren:
 *
 *   doemCalendlyEvent  — FØR nogen DB-adgang: event-type + rescheduled →
 *                        book / aflys / ignorér. Rækken er ikke læst endnu.
 *   genaabnerRet       — EFTER aflysnings-UPDATE'en, som returnerer rækkens
 *                        advisor, amount_dkk og company_id: canceler_type +
 *                        rækkens spor → hvilken ret genåbnes (eller ingen)?
 *                        genaabnerGratis (bool, Morten alene) er bevaret som
 *                        den ældre form; handleren bruger genaabnerRet.
 *
 * Genåbnings-gaten: KUN canceler_type === "host" OG rækken er på et
 * INKLUDERET spor. Rækkens advisor + amount_dkk styrer sideeffekten — ikke
 * payloaden — fordi rækken er vores sandhed om hvilket spor bookingen hører
 * til. Værten i payloaden (created_by, event_memberships) logges kun (B7)
 * indtil den er målt mod en faktisk payload.
 *
 * TO RETTIGHEDER (13/9 aften, recon-de-tre-sessioner.md): medlemskabet
 * indeholder én session med hver rådgiver. Mortens ret er
 * companies.intro_session_used_at, Jonas' er companies.jonas_session_used_at
 * (migration 20260913220000). genaabnerRet siger HVILKEN kolonne en
 * host-aflysning nulstiller — eller null. Det købte Jonas-spor (amount_dkk
 * > 0) har ingen ret og genåbner aldrig noget; det er samme række-form
 * ('jonas') som det inkluderede, så amount_dkk er det der skelner (samme
 * dom som lib/betaltSession.afgoerSessionSpor på fladen).
 *
 * Matchningen (booking-id fra payload.tracking) ligger IKKE her; den er
 * uændret i handleren (salesforce_uuid || utm_content, skal være UUID).
 *
 * REN, testet i src/lib/__tests__/calendlyWebhookDom.test.ts.
 */

export const MORTEN_ADVISOR = "morten";

export interface CalendlyEventInput {
  /** Top-level `event` i payloaden: "invitee.created", "invitee.canceled", … */
  eventType: unknown;
  /** payload.rescheduled — true når aflysningen er første halvdel af en flytning. */
  rescheduled: unknown;
}

export type CalendlyHandling =
  /** invitee.created → status booked + URI + tid (neq cancelled i handleren). */
  | { handling: "book" }
  /** Ægte aflysning → status cancelled; genåbning afgøres bagefter af genaabnerGratis. */
  | { handling: "aflys" }
  /** Rør intet, svar 200 uden retry. */
  | { handling: "ignorer"; grund: "flytning" | "ubehandlet_event_type" };

export function doemCalendlyEvent(i: CalendlyEventInput): CalendlyHandling {
  if (i.eventType === "invitee.created") return { handling: "book" };
  if (i.eventType === "invitee.canceled") {
    // Flytning: Calendly sender canceled (rescheduled=true) + en ny created.
    // Rækken forbliver booked indtil den følgende created bekræfter den nye tid.
    if (i.rescheduled === true) return { handling: "ignorer", grund: "flytning" };
    return { handling: "aflys" };
  }
  return { handling: "ignorer", grund: "ubehandlet_event_type" };
}

export interface GenaabningInput {
  /** payload.cancellation.canceler_type — spec-enum "host" | "invitee". */
  cancelerType: unknown;
  /** session_bookings.advisor på den række aflysningen ramte. null = ingen række ramt. */
  advisor: string | null | undefined;
}

/**
 * Må virksomhedens gratis intro genåbnes efter denne aflysning?
 *   host (Morten) aflyser Mortens gratis  → ja, det er ikke medlemmets skyld.
 *   invitee eller ukendt afsender         → nej; genåbning er en admin-handling.
 *   rækken er Jonas' betalte spor         → ALDRIG, uanset hvem der aflyste.
 *     En betalt session har ingen gratis ret at genåbne, og at nulstille
 *     Mortens ret fra Jonas' spor ville give virksomheden en ekstra gratis.
 */
export function genaabnerGratis(i: GenaabningInput): boolean {
  return i.cancelerType === "host" && i.advisor === MORTEN_ADVISOR;
}

export const JONAS_ADVISOR = "jonas";

/** Kolonnen paa companies der baerer en inkluderet rets «brugt»-stempel. */
export type RetKolonne = "intro_session_used_at" | "jonas_session_used_at";

export interface GenaabningRetInput extends GenaabningInput {
  /** session_bookings.amount_dkk paa den ramte raekke. 0 = inkluderet; > 0 = koebt. */
  amount_dkk: number | null | undefined;
}

/**
 * Hvilken ret genåbnes efter denne aflysning? null = ingen.
 *   host aflyser Mortens inkluderede ('morten', 0)  → intro_session_used_at
 *   host aflyser Jonas' inkluderede  ('jonas', 0)   → jonas_session_used_at
 *   host aflyser Jonas' KØBTE        ('jonas', > 0) → null — ingen ret at genåbne
 *   invitee eller ukendt afsender                  → null; genåbning er en admin-handling
 * amount_dkk mangler (null/undefined) → behandles som købt: ingen genåbning
 * på et ufuldstændigt bevis.
 */
export function genaabnerRet(i: GenaabningRetInput): RetKolonne | null {
  if (i.cancelerType !== "host") return null;
  if (typeof i.amount_dkk !== "number" || i.amount_dkk > 0) return null;
  if (i.advisor === MORTEN_ADVISOR) return "intro_session_used_at";
  if (i.advisor === JONAS_ADVISOR) return "jonas_session_used_at";
  return null;
}

// ── Ansøgningsmotoren: to værn før webhooken rører en ansøgning (rettelser 19/9) ──
//
// Platformen opretter og aflyser selv Calendly-events (ansoegning-samtale,
// ansoegning-handling), og hver af dem giver et invitee.created/canceled
// tilbage til denne webhook. Uden de to domme ville (1) vores egen aflysning
// af det GAMLE event efter en flytning ramme den NYE booking (aflys_booking er
// tilladt fra booket), og (2) et created for en booking platformen lige har
// skrevet køre «book» igen med samme starttid — annullere trappen og
// (ignoreDuplicates) ikke genskabe den, så påmindelser og marker_afholdt
// forsvinder. Recon 19/9 (vejen videre §5, §8 punkt 1–2).

export interface WebhookAflysInput {
  /** ansoegninger.calendly_event_uri — null for bookinger fra før uri'en blev gemt. */
  ansoegningEventUri: string | null;
  /** payload.event — det event Calendly siger er aflyst. */
  payloadEventUri: string | null;
}

/** Aflys kun når det aflyste event ER ansøgningens. Kender ansøgningen intet event, lader vi tvivlen komme aflysningen til gode (gamle links). */
export function skalWebhookAflyse(i: WebhookAflysInput): { aflys: true } | { aflys: false; grund: string } {
  if (i.ansoegningEventUri && i.payloadEventUri && i.ansoegningEventUri !== i.payloadEventUri) {
    return { aflys: false, grund: "aflysningen gælder et andet event end ansøgningens (flyttet)" };
  }
  return { aflys: true };
}

export interface WebhookBookInput {
  trin: string;
  /** ansoegninger.samtale_start (ISO) */
  samtaleStart: string | null;
  ansoegningEventUri: string | null;
  payloadEventUri: string | null;
  /** payload.scheduled_event.start_time (ISO) */
  payloadStart: string | null;
}

const sammeTid = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return false;
  const x = Date.parse(a), y = Date.parse(b);
  return !Number.isNaN(x) && !Number.isNaN(y) && x === y;
};

/** Book kun når ansøgningen ikke allerede bærer netop dette event ELLER netop denne starttid (platformen bookede selv). */
export function skalWebhookBooke(i: WebhookBookInput): { book: true } | { book: false; grund: string } {
  if (i.trin !== "booket") return { book: true };
  if (i.payloadEventUri && i.ansoegningEventUri === i.payloadEventUri) return { book: false, grund: "ansøgningen kender allerede eventet — platformen bookede" };
  if (sammeTid(i.samtaleStart, i.payloadStart)) return { book: false, grund: "ansøgningen er allerede booket på samme starttid — platformen bookede" };
  return { book: true };
}
