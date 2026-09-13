/**
 * calendly-webhook's dom (13/9): hvilken handling en event udløser, og —
 * det vigtigste — hvornår en aflysning må genåbne virksomhedens gratis
 * intro. Første test af webhooken overhovedet (recon F8).
 *
 * Genåbnings-gaten er grunden til at filen findes: advisor-filteret på
 * webhookens UPDATE blev åbnet 13/9 så Jonas' betalte spor kan matches, og
 * uden gaten ville en host-aflysning af en BETALT Jonas-session nulstille
 * Mortens gratis ret på virksomheden.
 */
import { describe, expect, it } from "vitest";
import {
  doemCalendlyEvent,
  genaabnerGratis,
  MORTEN_ADVISOR,
} from "../../../supabase/functions/_shared/calendlyWebhookDom.ts";

describe("doemCalendlyEvent — routing før DB", () => {
  it("invitee.created → book, uanset rescheduled (feltet hører til canceled)", () => {
    expect(doemCalendlyEvent({ eventType: "invitee.created", rescheduled: undefined })).toEqual({ handling: "book" });
    expect(doemCalendlyEvent({ eventType: "invitee.created", rescheduled: true })).toEqual({ handling: "book" });
    expect(doemCalendlyEvent({ eventType: "invitee.created", rescheduled: false })).toEqual({ handling: "book" });
  });

  it("invitee.canceled uden rescheduled → aflys", () => {
    expect(doemCalendlyEvent({ eventType: "invitee.canceled", rescheduled: false })).toEqual({ handling: "aflys" });
    expect(doemCalendlyEvent({ eventType: "invitee.canceled", rescheduled: undefined })).toEqual({ handling: "aflys" });
    expect(doemCalendlyEvent({ eventType: "invitee.canceled", rescheduled: null })).toEqual({ handling: "aflys" });
  });

  it("invitee.canceled med rescheduled === true → ignorér (flytning); kun boolean true tæller", () => {
    expect(doemCalendlyEvent({ eventType: "invitee.canceled", rescheduled: true })).toEqual({ handling: "ignorer", grund: "flytning" });
    // Strengen "true" er ikke en flytning — payloaden er JSON, feltet er boolean.
    expect(doemCalendlyEvent({ eventType: "invitee.canceled", rescheduled: "true" })).toEqual({ handling: "aflys" });
  });

  it("alt andet → ignorér (ubehandlet event-type): no-show, recap, ukendt, manglende", () => {
    for (const eventType of ["invitee_no_show.created", "invitee_no_show.deleted", "meeting_recap.created", "routing_form_submission.created", "", undefined, null, 42]) {
      expect(doemCalendlyEvent({ eventType, rescheduled: false })).toEqual({ handling: "ignorer", grund: "ubehandlet_event_type" });
    }
  });
});

describe("genaabnerGratis — gaten på den gratis intro", () => {
  it("host aflyser Mortens gratis → genåbn", () => {
    expect(genaabnerGratis({ cancelerType: "host", advisor: "morten" })).toBe(true);
    expect(MORTEN_ADVISOR).toBe("morten");
  });

  it("host aflyser Jonas' BETALTE session → genåbn ALDRIG (det er den fejl filteråbningen ellers ville give)", () => {
    expect(genaabnerGratis({ cancelerType: "host", advisor: "jonas" })).toBe(false);
  });

  it("invitee (medlemmet) aflyser → genåbn ikke, uanset spor", () => {
    expect(genaabnerGratis({ cancelerType: "invitee", advisor: "morten" })).toBe(false);
    expect(genaabnerGratis({ cancelerType: "invitee", advisor: "jonas" })).toBe(false);
  });

  it("ukendt eller manglende canceler_type → genåbn ikke", () => {
    for (const cancelerType of [undefined, null, "", "HOST", "system", 1]) {
      expect(genaabnerGratis({ cancelerType, advisor: "morten" })).toBe(false);
    }
  });

  it("ingen række ramt (advisor null/undefined) eller ukendt advisor → genåbn ikke", () => {
    expect(genaabnerGratis({ cancelerType: "host", advisor: null })).toBe(false);
    expect(genaabnerGratis({ cancelerType: "host", advisor: undefined })).toBe(false);
    expect(genaabnerGratis({ cancelerType: "host", advisor: "Morten" })).toBe(false);
    expect(genaabnerGratis({ cancelerType: "host", advisor: "" })).toBe(false);
  });

  it("hele matricen: kun (host, morten) er sand", () => {
    const sande: string[] = [];
    for (const cancelerType of ["host", "invitee", undefined]) {
      for (const advisor of ["morten", "jonas", null]) {
        if (genaabnerGratis({ cancelerType, advisor })) sande.push(`${cancelerType}/${advisor}`);
      }
    }
    expect(sande).toEqual(["host/morten"]);
  });
});
