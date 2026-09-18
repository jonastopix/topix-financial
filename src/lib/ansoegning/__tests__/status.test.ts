import { describe, expect, it } from "vitest";
import { afgoerStatus, danskDato, danskTidspunkt } from "@/lib/ansoegning/status";

// Statussiden (18/9, flow-gennemgangen §10): hvad der sker nu, hvad vi venter på, og de to knapper.
const basis = { trin: "ny", paa_pause_til: null, samtale_start: null, samtale_slut: null, moede_link: null, aftale_url: null, virksomhedsnavn: "Nordic Byg ApS", fornavn: "Lisbeth" };

describe("afgoerStatus", () => {
  it("ny: «vi har din ansøgning», ingen knap ud over «ikke nu»", () => {
    const v = afgoerStatus(basis);
    expect(v.titel).toBe("Vi har din ansøgning");
    expect(v).toMatchObject({ book: false, booket: null, aftale: null, visIkkeNu: true });
  });
  it("indkaldt: tidsvælgeren på siden (samtalen i kalenderen, 18/9), og «ikke nu»", () => {
    const v = afgoerStatus({ ...basis, trin: "indkaldt" });
    expect(v.book).toBe(true);
    expect(v.visIkkeNu).toBe(true);
    expect(v.tekst).toContain("30 minutter");
  });
  it("booket: tidspunktet i dansk tid, kalenderinvitationen, flyt/aflys på siden — aldrig Calendly ved navn", () => {
    const v = afgoerStatus({ ...basis, trin: "booket", samtale_start: "2026-09-21T08:00:00Z", samtale_slut: "2026-09-21T08:30:00Z", moede_link: "https://calendly.com/events/x/google_meet" });
    expect(v.book).toBe(false);
    expect(v.booket).toEqual({ start: "2026-09-21T08:00:00Z", slut: "2026-09-21T08:30:00Z", moedeLink: "https://calendly.com/events/x/google_meet" });
    expect(v.tekst).toContain("mandag");
    expect(v.tekst).toContain("21. september");
    expect(v.tekst).toMatch(/10[.:]00/);
    expect(v.tekst).toContain("kalenderinvitation");
    expect(v.tekst).not.toContain("Calendly");
    // booket uden tid (gamle links før tiden blev læst): tidsvælgeren igen
    expect(afgoerStatus({ ...basis, trin: "booket" })).toMatchObject({ book: true, booket: null });
  });
  it("aftalegrundlag sendt — brist 8: e-underskriften vinder over aftale_url; udløbet/annulleret giver ingen knap; underskrevet siger velkommen", () => {
    const u = { url: "https://app.theboardroom.dk/aftale?token=e-sig", udloeber_at: "2026-10-09T10:00:00Z", underskrevet_at: null };
    const s = { ...basis, trin: "aftalegrundlag_sendt", aftale_url: "https://example.com/gammel.pdf" };
    expect(afgoerStatus({ ...s, underskrift: { ...u, tilstand: "kan_underskrives" } }).aftale).toBe(u.url);
    expect(afgoerStatus({ ...s, underskrift: null }).aftale).toBe("https://example.com/gammel.pdf");
    expect(afgoerStatus(s).aftale).toBe("https://example.com/gammel.pdf");
    const udloebet = afgoerStatus({ ...s, underskrift: { ...u, tilstand: "udloebet", udloeber_at: null } });
    expect(udloebet).toMatchObject({ aftale: null, visIkkeNu: true });
    expect(udloebet.titel).toMatch(/udløbet/);
    expect(afgoerStatus({ ...s, underskrift: { ...u, tilstand: "annulleret", udloeber_at: null } })).toMatchObject({ aftale: null, visIkkeNu: true });
    const underskrevet = afgoerStatus({ ...s, underskrift: { ...u, tilstand: "underskrevet", udloeber_at: null, underskrevet_at: "2026-09-19T08:00:00Z" } });
    expect(underskrevet).toMatchObject({ aftale: null, visIkkeNu: false });
    expect(underskrevet.titel).toMatch(/skrevet under/);
  });
  it("aftalegrundlag sendt: aftaleknappen; underskrevet og lukket: ingen knapper", () => {
    expect(afgoerStatus({ ...basis, trin: "aftalegrundlag_sendt", aftale_url: "https://app.theboardroom.dk/aftale?token=x" }).aftale).toBe("https://app.theboardroom.dk/aftale?token=x");
    expect(afgoerStatus({ ...basis, trin: "underskrevet" })).toMatchObject({ book: false, aftale: null, visIkkeNu: false });
    expect(afgoerStatus({ ...basis, trin: "lukket" })).toMatchObject({ book: false, aftale: null, visIkkeNu: false });
    expect(afgoerStatus({ ...basis, trin: "afholdt" })).toMatchObject({ book: false, aftale: null, visIkkeNu: true });
  });
  it("på pause: datoen på dansk, ingen knapper — uanset trin", () => {
    const v = afgoerStatus({ ...basis, trin: "indkaldt", paa_pause_til: "2026-12-18" });
    expect(v.titel).toBe("Din ansøgning holder pause");
    expect(v.tekst).toContain("18. december 2026");
    expect(v.tekst).toContain("kontakt@theboardroom.dk");
    expect(v).toMatchObject({ book: false, booket: null, aftale: null, visIkkeNu: false });
  });
  it("ukendt trin → neutral tekst, ingen knapper", () => {
    expect(afgoerStatus({ ...basis, trin: "noget_nyt" })).toMatchObject({ titel: "Din ansøgning", book: false, aftale: null, visIkkeNu: false });
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
