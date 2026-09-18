import { describe, expect, it } from "vitest";
import { afgoerStatus, danskDato, danskTidspunkt, laesPladsHandling, PLADS_UDLOEBET, pladsSpoergsmaal, pladsSvarTekst } from "@/lib/ansoegning/status";

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
    // Rettelse 19/9: ingen «Ikke nu» på en booket samtale — den ville gemme mødet væk uden at aflyse det i kalenderen.
    expect(v.visIkkeNu).toBe(false);
    // booket uden tid (gamle links før tiden blev læst): tidsvælgeren igen, stadig uden «Ikke nu»
    expect(afgoerStatus({ ...basis, trin: "booket" })).toMatchObject({ book: true, booket: null, visIkkeNu: false });
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
  it("lukket med venteplads (19/9): tilbud → «Du har et tilbud om en plads» + frist + knapperne; i kø → «Du står i kø»; ellers «afsluttet»", () => {
    const lukket = { ...basis, trin: "lukket" };
    const tilbud = afgoerStatus({ ...lukket, ventepladser: { venter: 0, tilbud: { udloeber_at: "2026-09-25T10:00:00Z" } } });
    expect(tilbud).toMatchObject({ plads: "tilbud", titel: "Du har et tilbud om en plads", book: false, aftale: null, visIkkeNu: false });
    expect(tilbud.tekst).toContain("Svar senest 25. september 2026");
    const koe = afgoerStatus({ ...lukket, ventepladser: { venter: 2, tilbud: null } });
    expect(koe).toMatchObject({ plads: "koe", titel: "Du står i kø" });
    expect(koe.tekst).toContain("til 2 pladser");
    expect(afgoerStatus({ ...lukket, ventepladser: { venter: 1, tilbud: null } }).tekst).not.toContain("pladser");
    expect(afgoerStatus({ ...lukket, ventepladser: { venter: 0, tilbud: null } })).toMatchObject({ plads: null, titel: "Ansøgningen er afsluttet" });
    expect(afgoerStatus({ ...lukket, ventepladser: null })).toMatchObject({ plads: null, titel: "Ansøgningen er afsluttet" });
    expect(afgoerStatus(lukket)).toMatchObject({ plads: null, titel: "Ansøgningen er afsluttet" });
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

describe("statussiden — rettelser 19/9", () => {
  it("pausen gælder mod dato, ikke mod null: efter slutdatoen er siden ikke på pause (Nordivox/BlueNordix efter 10/12)", () => {
    const paa = afgoerStatus({ ...basis, trin: "indkaldt", paa_pause_til: "2026-12-10" }, new Date("2026-12-09T10:00:00Z"));
    expect(paa.titel).toBe("Din ansøgning holder pause");
    const efter = afgoerStatus({ ...basis, trin: "indkaldt", paa_pause_til: "2026-12-10" }, new Date("2026-12-10T10:00:00Z"));
    expect(efter.titel).toBe("Jonas vil gerne tale med dig");
    expect(efter.book).toBe(true);
  });
  it("ventelisten: mailens ?handling= læses, kortet spørger, svaret takker — og et udløbet tilbud har sine egne ord", () => {
    expect(laesPladsHandling("tag_pladsen")).toBe("ja");
    expect(laesPladsHandling("afslaa_pladsen")).toBe("nej");
    expect(laesPladsHandling("ikke_nu")).toBeNull();
    expect(laesPladsHandling(null)).toBeNull();
    expect(pladsSpoergsmaal("ja").knap).toBe("Ja tak, jeg vil have pladsen");
    expect(pladsSpoergsmaal("nej").knap).toBe("Nej tak — giv den videre");
    expect(pladsSvarTekst("ja", true).titel).toBe("Tak — pladsen er din");
    expect(pladsSvarTekst("ja", true).tekst).toMatch(/genåbnet/);
    expect(pladsSvarTekst("nej", false).tekst).toMatch(/videre til den næste/);
    expect(PLADS_UDLOEBET.titel).toMatch(/gælder ikke længere/);
  });
});
