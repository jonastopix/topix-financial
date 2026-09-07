import { describe, expect, it } from "vitest";
import { afgoerVarselTrin } from "@/lib/varselTrin";

const T = "2026-09-07T11:57:53Z";

describe("afgoerVarselTrin — tre tilstande, varsel 2 vinder", () => {
  it("intet sendt → ingen", () => {
    expect(afgoerVarselTrin(null, null)).toBe("ingen");
    expect(afgoerVarselTrin(undefined, undefined)).toBe("ingen");
  });
  it("kun varsel 1 → varsel_1", () => {
    expect(afgoerVarselTrin(T, null)).toBe("varsel_1");
  });
  it("begge sendt → varsel_2 (det seneste vinder)", () => {
    expect(afgoerVarselTrin("2026-08-30T11:00:00Z", T)).toBe("varsel_2");
  });
  it("CARMA STUDIO ordret: varsel 2 sat, varsel 1 null (sen beslutning sprang varsel 1 over) → varsel_2", () => {
    expect(afgoerVarselTrin(null, T)).toBe("varsel_2");
  });
});
