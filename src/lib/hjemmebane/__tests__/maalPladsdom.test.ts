import { describe, expect, it } from "vitest";
import { aktiveDerTaeller, BEKRAEFT_PLADS_GRUND, bekraeftelseSpaerret, laesPladsdom, PLADSDOM_RPC } from "@/lib/hjemmebane/maalPladsdom";

describe("maalPladsdom — reglen måles, den gættes ikke (punkt 13, migration 20261002241000)", () => {
  it("kun et bogstaveligt true giver «kun_bekraeftede»", () => {
    expect(laesPladsdom(true, null)).toBe("kun_bekraeftede");
    expect(laesPladsdom(false, null)).toBe("alle");
    expect(laesPladsdom(null, null)).toBe("alle");
    expect(laesPladsdom(undefined, undefined)).toBe("alle");
    expect(laesPladsdom("true", null)).toBe("alle");
    expect(laesPladsdom(1, null)).toBe("alle");
  });
  it("enhver fejl er «alle» — også PGRST202 (migrationen ikke kørt) og en fejl med data true", () => {
    expect(laesPladsdom(null, { code: "PGRST202", message: "Could not find the function" })).toBe("alle");
    expect(laesPladsdom(true, { code: "42501", message: "permission denied" })).toBe("alle");
    expect(laesPladsdom(true, { message: "netværk" })).toBe("alle");
  });
  it("aktiveDerTaeller: «alle» = bekræftede + ubekræftede; «kun_bekraeftede» = kun de bekræftede", () => {
    expect(aktiveDerTaeller(2, 1, "alle")).toBe(3);
    expect(aktiveDerTaeller(2, 1, "kun_bekraeftede")).toBe(2);
    expect(aktiveDerTaeller(0, 3, "kun_bekraeftede")).toBe(0);
    expect(aktiveDerTaeller(0, 3, "alle")).toBe(3);
  });
  it("RPC-navnet er migrationens", () => {
    expect(PLADSDOM_RPC).toBe("maal_pladser_kun_bekraeftede");
  });
  it("bekraeftelseSpaerret: kun under «kun_bekraeftede» og ved 3 bekræftede aktive (triggeren 20261002241000 afviser den fjerde)", () => {
    expect(bekraeftelseSpaerret("kun_bekraeftede", 3)).toBe(BEKRAEFT_PLADS_GRUND);
    expect(bekraeftelseSpaerret("kun_bekraeftede", 4)).toBe(BEKRAEFT_PLADS_GRUND);
    expect(bekraeftelseSpaerret("kun_bekraeftede", 2)).toBeNull();
    expect(bekraeftelseSpaerret("kun_bekraeftede", 0)).toBeNull();
    // «alle» (20260917150000): en bekræftelse ændrer ikke status og dømmes aldrig.
    expect(bekraeftelseSpaerret("alle", 3)).toBeNull();
    expect(bekraeftelseSpaerret("alle", 5)).toBeNull();
    expect(BEKRAEFT_PLADS_GRUND).toBe("I har 3 aktive mål — parkér eller markér et som nået først");
  });
});
