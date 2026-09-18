import { describe, expect, it } from "vitest";
import { afgoerStatus, danskDato, danskTidspunkt } from "@/lib/ansoegning/status";

// Statussiden (18/9, flow-gennemgangen §10): hvad der sker nu, hvad vi venter på, og de to knapper.
const basis = { trin: "ny", paa_pause_til: null, samtale_start: null, booking_url: null, aftale_url: null, virksomhedsnavn: "Nordic Byg ApS", fornavn: "Lisbeth" };

describe("afgoerStatus", () => {
  it("ny: «vi har din ansøgning», ingen knap ud over «ikke nu»", () => {
    const v = afgoerStatus(basis);
    expect(v.titel).toBe("Vi har din ansøgning");
    expect(v).toMatchObject({ book: null, aftale: null, visIkkeNu: true });
  });
  it("indkaldt: bookingknappen med linket, og «ikke nu»", () => {
    const v = afgoerStatus({ ...basis, trin: "indkaldt", booking_url: "https://calendly.com/topix-jonas/afklaringssamtale" });
    expect(v.book).toBe("https://calendly.com/topix-jonas/afklaringssamtale");
    expect(v.visIkkeNu).toBe(true);
    expect(v.tekst).toContain("30 minutter");
  });
  it("booket: tidspunktet i dansk tid, ingen bookingknap", () => {
    const v = afgoerStatus({ ...basis, trin: "booket", samtale_start: "2026-09-21T08:00:00Z" });
    expect(v.book).toBeNull();
    expect(v.tekst).toContain("mandag");
    expect(v.tekst).toContain("21. september");
    expect(v.tekst).toMatch(/10[.:]00/);
    expect(afgoerStatus({ ...basis, trin: "booket" }).tekst).toContain("bekræftelsen fra Calendly");
  });
  it("aftalegrundlag sendt: aftaleknappen; underskrevet og lukket: ingen knapper", () => {
    expect(afgoerStatus({ ...basis, trin: "aftalegrundlag_sendt", aftale_url: "https://app.theboardroom.dk/aftale?token=x" }).aftale).toBe("https://app.theboardroom.dk/aftale?token=x");
    expect(afgoerStatus({ ...basis, trin: "underskrevet" })).toMatchObject({ book: null, aftale: null, visIkkeNu: false });
    expect(afgoerStatus({ ...basis, trin: "lukket" })).toMatchObject({ book: null, aftale: null, visIkkeNu: false });
    expect(afgoerStatus({ ...basis, trin: "afholdt" })).toMatchObject({ book: null, aftale: null, visIkkeNu: true });
  });
  it("på pause: datoen på dansk, ingen knapper — uanset trin", () => {
    const v = afgoerStatus({ ...basis, trin: "indkaldt", booking_url: "https://calendly.com/x", paa_pause_til: "2026-12-18" });
    expect(v.titel).toBe("Din ansøgning holder pause");
    expect(v.tekst).toContain("18. december 2026");
    expect(v.tekst).toContain("kontakt@theboardroom.dk");
    expect(v).toMatchObject({ book: null, aftale: null, visIkkeNu: false });
  });
  it("ukendt trin → neutral tekst, ingen knapper", () => {
    expect(afgoerStatus({ ...basis, trin: "noget_nyt" })).toMatchObject({ titel: "Din ansøgning", book: null, aftale: null, visIkkeNu: false });
  });
});

describe("danskDato og danskTidspunkt", () => {
  it("danskDato splitter selv; ulæseligt → uændret", () => {
    expect(danskDato("2026-09-21")).toBe("21. september 2026");
    expect(danskDato("2026-01-05T00:00:00Z")).toBe("5. januar 2026");
    expect(danskDato("snart")).toBe("snart");
  });
  it("danskTidspunkt i Europe/Copenhagen; ulæseligt → uændret", () => {
    expect(danskTidspunkt("2026-01-05T09:30:00Z")).toMatch(/mandag.*5\. januar.*10[.:]30/);
    expect(danskTidspunkt("ikke en tid")).toBe("ikke en tid");
  });
});
