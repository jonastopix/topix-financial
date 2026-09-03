import { describe, it, expect } from "vitest";
import {
  beloebKr,
  datoOgTid,
  fejledeTraekPrVirksomhed,
  kortDato,
  stripeSagde,
  traekBadgeTekst,
  type FejletTraek,
} from "../traek";

// Det fejlede træk på /members (3/9): badgen siger hvad der ER sket og
// hvornår Stripe prøver igen; detaljerne bærer beløb, tidspunkt og hvad
// Stripe sagde. Datakilden er company_traek med status = 'fejlet'.

const traek = (overrides: Partial<FejletTraek> = {}): FejletTraek => ({
  company_id: "c1",
  stripe_invoice_id: "in_1",
  beloeb_oere: 437_500,
  fejlet_at: "2026-09-13T08:35:29.000Z",
  forsoeg: 1,
  naeste_forsoeg_at: "2026-09-17T08:35:29.000Z",
  fejl_kode: "card_declined",
  fejl_decline_code: "insufficient_funds",
  fejl_besked: "Your card has insufficient funds.",
  hosted_invoice_url: "https://invoice.stripe.com/i/x",
  faktura_nummer: "DZ7BZXM5-0012",
  periode_start: "2026-09-13T08:35:29.000Z",
  ...overrides,
});

describe("traekBadgeTekst — hvad der ER sket, og næste forsøg når det kendes", () => {
  it("ét fejlet træk med næste forsøg", () => {
    expect(traekBadgeTekst([traek()])).toBe("Træk fejlede 13. sep. · prøver igen 17. sep.");
  });

  it("uden næste forsøg siger den at Stripe har givet op", () => {
    expect(traekBadgeTekst([traek({ naeste_forsoeg_at: null })])).toBe("Træk fejlede 13. sep. · ingen flere forsøg");
  });

  it("flere fejlede: tællet + den nyeste dato", () => {
    const nyeste = traek({ stripe_invoice_id: "in_2", fejlet_at: "2026-10-13T08:35:29.000Z", naeste_forsoeg_at: null });
    expect(traekBadgeTekst([nyeste, traek()])).toBe("2 træk fejlede 13. okt. · ingen flere forsøg");
  });

  it("ingen fejlede → null (ingen badge)", () => {
    expect(traekBadgeTekst([])).toBeNull();
  });

  it("manglende fejlet_at udelader datoen, ikke badgen", () => {
    expect(traekBadgeTekst([traek({ fejlet_at: null, naeste_forsoeg_at: null })])).toBe("Træk fejlede · ingen flere forsøg");
  });
});

describe("fejledeTraekPrVirksomhed", () => {
  it("grupperer pr. virksomhed, nyeste først", () => {
    const rows = [
      traek({ company_id: "a", stripe_invoice_id: "a1", fejlet_at: "2026-09-13T08:00:00Z" }),
      traek({ company_id: "b", stripe_invoice_id: "b1" }),
      traek({ company_id: "a", stripe_invoice_id: "a2", fejlet_at: "2026-10-13T08:00:00Z" }),
      traek({ company_id: "a", stripe_invoice_id: "a0", fejlet_at: null }),
    ];
    const map = fejledeTraekPrVirksomhed(rows);
    expect(map.get("a")?.map((t) => t.stripe_invoice_id)).toEqual(["a2", "a1", "a0"]);
    expect(map.get("b")?.length).toBe(1);
    expect(map.get("c")).toBeUndefined();
  });
});

describe("stripeSagde", () => {
  it("besked + decline_code", () => {
    expect(stripeSagde(traek())).toBe("Your card has insufficient funds. (insufficient_funds)");
  });
  it("kun kode når beskeden mangler; fejl_kode som fallback for decline_code", () => {
    expect(stripeSagde(traek({ fejl_besked: null }))).toBe("insufficient_funds");
    expect(stripeSagde(traek({ fejl_besked: null, fejl_decline_code: null }))).toBe("card_declined");
  });
  it("null når Stripe intet sagde", () => {
    expect(stripeSagde({ fejl_besked: null, fejl_decline_code: null, fejl_kode: null })).toBeNull();
    expect(stripeSagde({ fejl_besked: " ", fejl_decline_code: "", fejl_kode: "" })).toBeNull();
  });
});

describe("format-hjælperne", () => {
  it("beløbet er inkl. moms i hele kroner med dansk tusindtal", () => {
    expect(beloebKr(437_500)).toBe("4.375 kr.");
    expect(beloebKr(6_250_000)).toBe("62.500 kr.");
  });
  it("datoer på dansk, null ved tomt eller ugyldigt", () => {
    expect(kortDato("2026-09-13T08:35:29.000Z")).toBe("13. sep.");
    expect(datoOgTid("2026-09-13T08:35:29.000Z")).toMatch(/^13\. sep\. 2026 kl\. \d{2}:\d{2}$/);
    expect(kortDato(null)).toBeNull();
    expect(kortDato("ikke en dato")).toBeNull();
  });
});
