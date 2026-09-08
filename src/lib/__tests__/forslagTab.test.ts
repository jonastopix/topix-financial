import { describe, expect, it } from "vitest";
import { udloebneForslagTekst } from "../forslagTab";

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
