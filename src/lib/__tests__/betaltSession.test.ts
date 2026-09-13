import { describe, expect, it } from "vitest";
import { afgoerBetaltSession, betaltSessionTekst, erBetalt, type BetaltBooking } from "@/lib/betaltSession";

// De betalte 1:1-sessioner (kort 76, 13/9): fladen siger det rækken VED —
// betalt og link sendt — og påstår aldrig «afholdt» uden calendly_event_uri.
// Prod 11/9: tre booking_sent uden URI, ni pending, ingen paid/refunded.

const NU = new Date("2026-09-13T12:00:00Z");
const b = (over: Partial<BetaltBooking> = {}): BetaltBooking => ({
  status: "booking_sent",
  amount_dkk: 500,
  calendly_event_uri: null,
  start_tid: null,
  slut_tid: null,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-02T08:30:00Z",
  ...over,
});

describe("erBetalt — udledes af rækken alene", () => {
  it("koster penge OG forbi pending: betalt", () => {
    for (const status of ["paid", "booking_sent", "booked", "cancelled", "refunded"]) {
      expect(erBetalt(b({ status }))).toBe(true);
    }
  });
  it("pending er ikke betalt — en checkout der aldrig blev gennemført", () => {
    expect(erBetalt(b({ status: "pending" }))).toBe(false);
  });
  it("amount_dkk 0 er det gratis spor, aldrig betalt — uanset status", () => {
    expect(erBetalt(b({ amount_dkk: 0, status: "booking_sent" }))).toBe(false);
    expect(erBetalt(b({ amount_dkk: 0, status: "booked" }))).toBe(false);
    expect(erBetalt(null)).toBe(false);
  });
});

describe("afgoerBetaltSession — tilstanden", () => {
  it("booking_sent (prods tre rækker): betalt og link sendt, ingen afholdt-dom", () => {
    const dom = afgoerBetaltSession(b(), NU);
    expect(dom.tilstand).toBe("betalt_link_sendt");
    expect(dom.betalt?.toISOString()).toBe("2026-09-02T08:30:00.000Z");
  });
  it("pending (prods ni rækker): ikke gennemført, ingen linje", () => {
    const dom = afgoerBetaltSession(b({ status: "pending" }), NU);
    expect(dom.tilstand).toBe("ikke_gennemfoert");
    expect(betaltSessionTekst(dom)).toBeNull();
  });
  it("gratis spor (amount_dkk 0): hører til introSession, ingen linje her", () => {
    const dom = afgoerBetaltSession(b({ amount_dkk: 0, status: "booked", calendly_event_uri: "https://api.calendly.com/scheduled_events/x" }), NU);
    expect(dom.tilstand).toBe("gratis_spor");
    expect(betaltSessionTekst(dom)).toBeNull();
  });
  it("paid (skrives ikke i dag): betalt uden link", () => {
    expect(afgoerBetaltSession(b({ status: "paid" }), NU).tilstand).toBe("betalt_uden_link");
  });
  it("booked UDEN calendly_event_uri: ordet alene beviser intet — behandles som link sendt, aldrig afholdt", () => {
    const passeret = b({ status: "booked", calendly_event_uri: null, start_tid: "2026-09-03T09:00:00Z", slut_tid: "2026-09-03T09:45:00Z" });
    expect(afgoerBetaltSession(passeret, NU).tilstand).toBe("betalt_link_sendt");
  });
  it("booked MED URI: afholdt når sluttiden er nået, booket når den ligger forude, uden tid = booket_uden_tid", () => {
    const uri = "https://api.calendly.com/scheduled_events/abc";
    expect(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: uri, start_tid: "2026-09-03T09:00:00Z", slut_tid: "2026-09-03T09:45:00Z" }), NU).tilstand).toBe("afholdt");
    expect(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: uri, start_tid: "2026-09-13T11:15:00Z", slut_tid: "2026-09-13T12:00:00Z" }), NU).tilstand).toBe("afholdt");
    expect(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: uri, start_tid: "2026-09-13T11:20:00Z", slut_tid: "2026-09-13T12:05:00Z" }), NU).tilstand).toBe("booket");
    expect(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: uri, start_tid: "2026-09-20T09:00:00Z", slut_tid: "2026-09-20T09:45:00Z" }), NU).tilstand).toBe("booket");
    expect(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: uri }), NU).tilstand).toBe("booket_uden_tid");
  });
  it("cancelled / refunded / ukendt / null", () => {
    expect(afgoerBetaltSession(b({ status: "cancelled" }), NU).tilstand).toBe("aflyst");
    expect(afgoerBetaltSession(b({ status: "refunded" }), NU).tilstand).toBe("refunderet");
    expect(afgoerBetaltSession(b({ status: "noget_nyt" }), NU).tilstand).toBe("ukendt");
    expect(afgoerBetaltSession(null, NU).tilstand).toBe("ukendt");
  });
  it("betalt-datoen er updated_at (webhookens skrivning); uden updated_at bruges created_at", () => {
    expect(afgoerBetaltSession(b({ updated_at: null }), NU).betalt?.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect(afgoerBetaltSession(b({ updated_at: "ikke en dato" }), NU).betalt?.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect(afgoerBetaltSession(b({ status: "pending" }), NU).betalt).toBeNull();
  });
});

describe("ordene — dansk tid, siger kun det rækken ved", () => {
  it("booking_sent: «Betalt 2. september · booking-link sendt»", () => {
    expect(betaltSessionTekst(afgoerBetaltSession(b(), NU))).toBe("Betalt 2. september · booking-link sendt");
  });
  it("paid: «Betalt … · booking-link ikke sendt»", () => {
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "paid" }), NU))).toBe("Betalt 2. september · booking-link ikke sendt");
  });
  it("booked med URI: Afholdt / Booket til / uden tid", () => {
    const uri = "https://api.calendly.com/scheduled_events/abc";
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: uri, start_tid: "2026-09-03T09:00:00Z", slut_tid: "2026-09-03T09:45:00Z" }), NU))).toBe("Afholdt 3. september");
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: uri, start_tid: "2026-09-20T09:00:00Z", slut_tid: "2026-09-20T09:45:00Z" }), NU))).toBe("Booket til 20. september kl. 11.00");
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "booked", calendly_event_uri: uri }), NU))).toBe("Booket — tidspunktet er ikke registreret");
  });
  it("aflyst / refunderet", () => {
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "cancelled" }), NU))).toBe("Betalt · aflyst");
    expect(betaltSessionTekst(afgoerBetaltSession(b({ status: "refunded" }), NU))).toBe("Betalt · refunderet");
  });
  it("ordet «afholdt» forekommer KUN med calendly_event_uri", () => {
    const uden = ["pending", "paid", "booking_sent", "booked", "cancelled", "refunded"].map((status) =>
      betaltSessionTekst(afgoerBetaltSession(b({ status, calendly_event_uri: null, start_tid: "2026-01-05T09:00:00Z", slut_tid: "2026-01-05T09:45:00Z" }), NU)),
    );
    for (const tekst of uden) expect(tekst ?? "").not.toMatch(/afholdt/i);
  });
});
