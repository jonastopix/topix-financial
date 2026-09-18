import { describe, expect, it } from "vitest";
import { afgoerKnap, kodeHjaelp, tolkFejl } from "@/lib/aftaleSide";

describe("afgoerKnap — «Underskriv» er kun aktiv når alt er der", () => {
  const alt = { navn: "Lisbeth Hansen", accepteret: true, kode: "123456", kodeBestilt: true, arbejder: false };
  it("alt på plads: ok", () => expect(afgoerKnap(alt)).toEqual({ ok: true }));
  it("hvert manglende led giver sin grund, i sidens rækkefølge", () => {
    expect(afgoerKnap({ ...alt, arbejder: true })).toEqual({ ok: false, grund: "arbejder" });
    expect(afgoerKnap({ ...alt, navn: " " })).toEqual({ ok: false, grund: "navn" });
    expect(afgoerKnap({ ...alt, accepteret: false })).toEqual({ ok: false, grund: "kryds" });
    expect(afgoerKnap({ ...alt, kodeBestilt: false })).toEqual({ ok: false, grund: "kode_ikke_bestilt" });
    expect(afgoerKnap({ ...alt, kode: "12345" })).toEqual({ ok: false, grund: "kode" });
  });
  it("koden må tastes med mellemrum", () => expect(afgoerKnap({ ...alt, kode: "123 456" })).toEqual({ ok: true }));
});

describe("tolkFejl — funktionens fejl som sætninger", () => {
  it("forkert kode med forsøg tilbage, ental og flertal", () => {
    expect(tolkFejl({ status: 401, body: { error: "kode_forkert", forsoeg_tilbage: 3 } })).toBe("Koden er forkert. Du har 3 forsøg tilbage.");
    expect(tolkFejl({ status: 401, body: { error: "kode_forkert", forsoeg_tilbage: 1 } })).toBe("Koden er forkert. Du har ét forsøg tilbage.");
  });
  it("låst, vent, ukendt link, alt andet", () => {
    expect(tolkFejl({ status: 401, body: { error: "kode_laast" } })).toContain("låst");
    expect(tolkFejl({ status: 429, body: { error: "vent", vent_sekunder: 12 } })).toContain("12 sekunder");
    expect(tolkFejl({ status: 403, body: { error: "Linket kendes ikke." } })).toBe("Linket kendes ikke.");
    expect(tolkFejl({ status: 500, body: null })).toContain("Der gik noget galt");
  });
  it("aftryk_afviger siger udtrykkeligt at der IKKE er skrevet under", () => {
    expect(tolkFejl({ status: 500, body: { error: "aftryk_afviger" } })).toContain("ikke skrevet under");
  });
});

describe("kodeHjaelp", () => {
  it("før og efter bestilling", () => {
    expect(kodeHjaelp("l***@floor1.dk", 15, false)).toBe("Vi sender en 6-cifret kode til l***@floor1.dk, når du trykker «Send kode».");
    expect(kodeHjaelp("l***@floor1.dk", 15, true)).toBe("Vi har sendt en 6-cifret kode til l***@floor1.dk. Den gælder i 15 minutter.");
  });
});
