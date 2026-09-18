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
  skalWebhookAflyse,
  skalWebhookBooke,
  doemCalendlyEvent,
  genaabnerGratis,
  genaabnerRet,
  JONAS_ADVISOR,
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

// ── To rettigheder (13/9 aften) ─────────────────────────────────────────────
//
// Medlemskabet indeholder én session med hver rådgiver. En host-aflysning af
// en INKLUDERET session nulstiller rettens kolonne — Mortens
// (intro_session_used_at) eller Jonas' (jonas_session_used_at). Det købte
// Jonas-spor har samme advisor som det inkluderede; amount_dkk skelner.

describe("genaabnerRet — hvilken ret en host-aflysning genåbner", () => {
  it("host aflyser Mortens inkluderede → intro_session_used_at", () => {
    expect(genaabnerRet({ cancelerType: "host", advisor: "morten", amount_dkk: 0 })).toBe("intro_session_used_at");
    expect(MORTEN_ADVISOR).toBe("morten");
  });

  it("host aflyser Jonas' inkluderede → jonas_session_used_at", () => {
    expect(genaabnerRet({ cancelerType: "host", advisor: "jonas", amount_dkk: 0 })).toBe("jonas_session_used_at");
    expect(JONAS_ADVISOR).toBe("jonas");
  });

  it("host aflyser Jonas' KØBTE → ingen ret genåbnes (samme advisor som den inkluderede — prisen skelner)", () => {
    expect(genaabnerRet({ cancelerType: "host", advisor: "jonas", amount_dkk: 500 })).toBeNull();
    expect(genaabnerRet({ cancelerType: "host", advisor: "jonas", amount_dkk: 1 })).toBeNull();
  });

  it("invitee (medlemmet) aflyser → ingen ret genåbnes, uanset spor", () => {
    expect(genaabnerRet({ cancelerType: "invitee", advisor: "morten", amount_dkk: 0 })).toBeNull();
    expect(genaabnerRet({ cancelerType: "invitee", advisor: "jonas", amount_dkk: 0 })).toBeNull();
  });

  it("ukendt eller manglende canceler_type → ingen", () => {
    for (const cancelerType of [undefined, null, "", "HOST", "system", 1]) {
      expect(genaabnerRet({ cancelerType, advisor: "morten", amount_dkk: 0 })).toBeNull();
      expect(genaabnerRet({ cancelerType, advisor: "jonas", amount_dkk: 0 })).toBeNull();
    }
  });

  it("amount_dkk mangler (null/undefined) → ingen: et ufuldstændigt bevis genåbner ikke", () => {
    expect(genaabnerRet({ cancelerType: "host", advisor: "morten", amount_dkk: null })).toBeNull();
    expect(genaabnerRet({ cancelerType: "host", advisor: "jonas", amount_dkk: undefined })).toBeNull();
  });

  it("ingen række ramt eller ukendt advisor → ingen", () => {
    expect(genaabnerRet({ cancelerType: "host", advisor: null, amount_dkk: 0 })).toBeNull();
    expect(genaabnerRet({ cancelerType: "host", advisor: "Morten", amount_dkk: 0 })).toBeNull();
    expect(genaabnerRet({ cancelerType: "host", advisor: "", amount_dkk: 0 })).toBeNull();
  });

  it("hele matricen: præcis (host, morten, 0) og (host, jonas, 0) genåbner — hver sin kolonne", () => {
    const sande: string[] = [];
    for (const cancelerType of ["host", "invitee", undefined]) {
      for (const advisor of ["morten", "jonas", null]) {
        for (const amount_dkk of [0, 500, null]) {
          const ret = genaabnerRet({ cancelerType, advisor, amount_dkk });
          if (ret) sande.push(`${cancelerType}/${advisor}/${amount_dkk}→${ret}`);
        }
      }
    }
    expect(sande).toEqual(["host/morten/0→intro_session_used_at", "host/jonas/0→jonas_session_used_at"]);
  });

  it("genaabnerGratis (den ældre bool) er enig med genaabnerRet om Mortens inkluderede", () => {
    for (const cancelerType of ["host", "invitee", undefined]) {
      for (const advisor of ["morten", "jonas", null]) {
        expect(genaabnerGratis({ cancelerType, advisor })).toBe(genaabnerRet({ cancelerType, advisor, amount_dkk: 0 }) === "intro_session_used_at");
      }
    }
  });
});

describe("calendlyWebhookDom — ansøgningsmotorens to værn (rettelser 19/9)", () => {
  const A = "https://api.calendly.com/scheduled_events/aaa", B = "https://api.calendly.com/scheduled_events/bbb";
  it("aflys: kun når det aflyste event ER ansøgningens; et andet event (det gamle efter en flytning) springes over; ukendt uri lader tvivlen gå til aflysningen", () => {
    expect(skalWebhookAflyse({ ansoegningEventUri: A, payloadEventUri: A })).toEqual({ aflys: true });
    const flyt = skalWebhookAflyse({ ansoegningEventUri: B, payloadEventUri: A });
    expect(flyt.aflys).toBe(false);
    expect(flyt.aflys === false && flyt.grund).toMatch(/andet event/);
    expect(skalWebhookAflyse({ ansoegningEventUri: null, payloadEventUri: A })).toEqual({ aflys: true }); // gamle links uden gemt uri
    expect(skalWebhookAflyse({ ansoegningEventUri: A, payloadEventUri: null })).toEqual({ aflys: true });
  });
  it("book: springes over når ansøgningen allerede bærer eventet ELLER samme starttid (platformen bookede); en ægte flytning i Calendly (ny uri, ny tid) bookes", () => {
    const start = "2026-09-21T07:00:00.000Z";
    expect(skalWebhookBooke({ trin: "booket", samtaleStart: start, ansoegningEventUri: A, payloadEventUri: A, payloadStart: start }).book).toBe(false);
    const sammeTid = skalWebhookBooke({ trin: "booket", samtaleStart: start, ansoegningEventUri: null, payloadEventUri: A, payloadStart: "2026-09-21T07:00:00Z" });
    expect(sammeTid.book).toBe(false);
    expect(sammeTid.book === false && sammeTid.grund).toMatch(/samme starttid/);
    expect(skalWebhookBooke({ trin: "booket", samtaleStart: start, ansoegningEventUri: A, payloadEventUri: B, payloadStart: "2026-09-22T07:00:00Z" })).toEqual({ book: true });
    expect(skalWebhookBooke({ trin: "indkaldt", samtaleStart: null, ansoegningEventUri: null, payloadEventUri: A, payloadStart: start })).toEqual({ book: true });
    expect(skalWebhookBooke({ trin: "booket", samtaleStart: null, ansoegningEventUri: null, payloadEventUri: A, payloadStart: null })).toEqual({ book: true });
  });
});
