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
 *   genaabnerGratis    — EFTER aflysnings-UPDATE'en, som returnerer rækkens
 *                        advisor og company_id: canceler_type + rækkens
 *                        advisor → må den gratis genåbnes?
 *
 * Genåbnings-gaten: KUN canceler_type === "host" OG rækkens advisor ===
 * "morten". Rækkens advisor styrer sideeffekten — ikke payloaden — fordi
 * rækken er vores sandhed om hvilket spor bookingen hører til. Værten i
 * payloaden (created_by, event_memberships) logges kun (B7) indtil den er
 * målt mod en faktisk payload.
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
