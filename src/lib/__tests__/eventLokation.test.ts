import { describe, expect, it } from "vitest";
import { eventLokation, eventStedDele, LOKATION_MAKS_TEGN, validerLokation } from "@/lib/eventLokation";

const MEET = "https://meet.google.com/abc-defg-hij";

describe("eventStedDele — visningsreglen: online, lokation, begge, ingen", () => {
  it("kun Meet-link: «Online» som før", () => expect(eventStedDele({ meet_url: MEET })).toEqual(["Online"]));
  it("kun lokation: adressen", () => expect(eventStedDele({ meet_url: null, lokation: "Vestergade 12, 8600 Silkeborg" } as any)).toEqual(["Vestergade 12, 8600 Silkeborg"]));
  it("begge: begge, «Online» først", () => expect(eventStedDele({ meet_url: MEET, lokation: "Vestergade 12" } as any)).toEqual(["Online", "Vestergade 12"]));
  it("ingen: tom liste", () => expect(eventStedDele({ meet_url: null })).toEqual([]));
  it("en lokation på blanktegn er ingen lokation (og vises ikke som tomt led)", () => {
    expect(eventStedDele({ meet_url: null, lokation: "   " } as any)).toEqual([]);
    expect(eventStedDele({ meet_url: MEET, lokation: "" } as any)).toEqual(["Online"]);
  });
  it("kolonnen mangler på rækken (før migrationen/typerne): ingen lokation, ingen fejl", () => {
    expect(eventLokation({ meet_url: MEET })).toBeNull();
    expect(eventLokation(null)).toBeNull();
    expect(eventLokation(undefined)).toBeNull();
    expect(eventLokation({ lokation: 5 })).toBeNull();
  });
  it("lokationen trimmes", () => expect(eventLokation({ lokation: "  Vestergade 12 " })).toBe("Vestergade 12"));
});

describe("validerLokation — editorens validering", () => {
  it("valgfri: tom, null og undefined er gyldige", () => {
    expect(validerLokation("")).toBeNull();
    expect(validerLokation(null)).toBeNull();
    expect(validerLokation(undefined)).toBeNull();
  });
  it(`højst ${LOKATION_MAKS_TEGN} tegn: præcis grænsen er gyldig, ét over afvises med en tekst`, () => {
    expect(validerLokation("a".repeat(LOKATION_MAKS_TEGN))).toBeNull();
    expect(validerLokation("a".repeat(LOKATION_MAKS_TEGN + 1))).toBe(`Lokationen må højst være ${LOKATION_MAKS_TEGN} tegn`);
  });
  it("tæller den trimmede tekst: blanktegn i enderne udløser ikke fejlen", () => {
    expect(validerLokation("  " + "a".repeat(LOKATION_MAKS_TEGN) + "  ")).toBeNull();
  });
});
