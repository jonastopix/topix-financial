import { describe, expect, it } from "vitest";
import { UDLOEBNE_VISTE, udloebetDenTekst, udloebneForslagTekst, udloebneRestTekst } from "../forslagTab";

describe("udloebneForslagTekst — de tabte forslag får en linje", () => {
  it("nul: ingen linje", () => {
    expect(udloebneForslagTekst(0)).toBeNull();
    expect(udloebneForslagTekst(-1)).toBeNull();
  });
  it("ental og flertal", () => {
    expect(udloebneForslagTekst(1)).toBe("1 forslag udløb uden svar");
    expect(udloebneForslagTekst(63)).toBe("63 forslag udløb uden svar");
  });
});

// Fase 0b («Én plan»): udløbne forslag synlige for rådgiveren — de seneste
// fem titler og «og N mere».
describe("udloebneRestTekst — «og N mere» efter de fem viste", () => {
  it("alle vist: null; én mere; flere", () => {
    expect(UDLOEBNE_VISTE).toBe(5);
    expect(udloebneRestTekst(5, 5)).toBeNull();
    expect(udloebneRestTekst(3, 3)).toBeNull();
    expect(udloebneRestTekst(6, 5)).toBe("og 1 mere");
    expect(udloebneRestTekst(12, 5)).toBe("og 7 mere");
  });
});

describe("udloebetDenTekst — dansk kort dato i dansk tid", () => {
  it("formaterer, og giver null uden eller med ulæseligt stempel", () => {
    expect(udloebetDenTekst("2026-09-12T22:00:00Z")).toBe("udløb 13. sep.");
    expect(udloebetDenTekst(null)).toBeNull();
    expect(udloebetDenTekst("nej")).toBeNull();
  });
});
