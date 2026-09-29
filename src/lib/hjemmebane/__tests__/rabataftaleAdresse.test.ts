import { describe, expect, it } from "vitest";
import {
  afgoerAftaleMaal, AFTALE_PARAM, laesRabataftaleId, rabataftaleAdresse, rabataftaleElementId, RABATAFTALER_STI,
} from "@/lib/hjemmebane/rabataftaleAdresse";

/** Én rabataftales adresse (29/9-2026) — husets ?<type>Id=-mønster. */
const A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("rabataftaleAdresse", () => {
  it("et uuid giver /rabataftaler?aftaleId={id}", () => {
    expect(rabataftaleAdresse(A)).toBe(`/rabataftaler?aftaleId=${A}`);
    expect(AFTALE_PARAM).toBe("aftaleId");
  });
  it("store bogstaver og mellemrum normaliseres til partners.id's form", () => {
    expect(rabataftaleAdresse(`  ${A.toUpperCase()} `)).toBe(`/rabataftaler?aftaleId=${A}`);
  });
  it("et id, der ikke er et uuid, giver listen uden mål — aldrig en halv adresse", () => {
    for (const id of ["", "abc", `${A}x`, "../x", null as unknown as string]) expect(rabataftaleAdresse(id)).toBe(RABATAFTALER_STI);
  });
});

describe("laesRabataftaleId", () => {
  it("læser id'et ud af location.search", () => {
    expect(laesRabataftaleId(`?aftaleId=${A}`)).toBe(A);
    expect(laesRabataftaleId(`?x=1&aftaleId=${A.toUpperCase()}&y=2`)).toBe(A);
  });
  it("rundtur: adressen læses tilbage til samme id", () => {
    expect(laesRabataftaleId(new URL(rabataftaleAdresse(A), "https://app.theboardroom.dk").search)).toBe(A);
  });
  it("kun et uuid — alt andet er null", () => {
    for (const s of ["", "?", "?aftaleId=", "?aftaleId=abc", `?aftaleId=${A}x`, "?aftaleId=%3Cscript%3E", `?andet=${A}`, null, undefined]) {
      expect(laesRabataftaleId(s as string)).toBeNull();
    }
  });
});

describe("rabataftaleElementId — samme form som FeedbackView's feedback-{id}", () => {
  it("aftale-{id}", () => expect(rabataftaleElementId(A)).toBe(`aftale-${A}`));
});

describe("afgoerAftaleMaal", () => {
  const base = { oensketId: A, henter: false, fejlet: false, vistIds: [A] };
  it("intet id → intet", () => expect(afgoerAftaleMaal({ ...base, oensketId: null })).toEqual({ art: "intet" }));
  it("henter → venter", () => expect(afgoerAftaleMaal({ ...base, henter: true })).toEqual({ art: "venter" }));
  it("hentningen fejlede → intet (en fejl er ikke et svar om aftalen)", () => {
    expect(afgoerAftaleMaal({ ...base, fejlet: true, vistIds: [] })).toEqual({ art: "intet" });
  });
  it("blandt dem, der vises → fundet", () => expect(afgoerAftaleMaal(base)).toEqual({ art: "fundet", id: A }));
  it("ikke blandt dem, der vises (arkiveret, udløbet, ukendt) → findes_ikke", () => {
    expect(afgoerAftaleMaal({ ...base, vistIds: [] })).toEqual({ art: "findes_ikke" });
    expect(afgoerAftaleMaal({ ...base, vistIds: ["9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"] })).toEqual({ art: "findes_ikke" });
  });
});
