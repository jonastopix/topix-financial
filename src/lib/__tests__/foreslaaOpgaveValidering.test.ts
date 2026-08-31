import { describe, expect, it } from "vitest";
import {
  normaliserBegrundelse,
  TITEL_MAX_LAENGDE,
  validerTitel,
} from "../../../supabase/functions/_shared/foreslaaOpgaveValidering.ts";

// Den delte dom for foreslaa-opgave's input (opgaveUdloeb-mønstret:
// _shared-filen har nul imports og læses direkte af Vitest).
describe("validerTitel — obligatorisk, trimmet, højst 200 tegn", () => {
  it("afviser manglende, tom og whitespace-titel", () => {
    for (const input of [undefined, null, 42, "", "   ", "\n\t "]) {
      expect(validerTitel(input)).toEqual({ ok: false, grund: "Titlen mangler — skriv hvad medlemmet skal gøre" });
    }
  });

  it("trimmer og godkender en almindelig titel", () => {
    const dom = validerTitel("  Ring til banken  ");
    expect(dom).toEqual({ ok: true, titel: "Ring til banken" });
  });

  it("præcis 200 tegn godkendes, 201 afvises — målt EFTER trim", () => {
    expect(validerTitel("x".repeat(TITEL_MAX_LAENGDE)).ok).toBe(true);
    expect(validerTitel("x".repeat(TITEL_MAX_LAENGDE + 1))).toEqual({
      ok: false,
      grund: `Titlen må højst være ${TITEL_MAX_LAENGDE} tegn`,
    });
    // 201 tegn med whitespace i enderne trimmes til 199 og godkendes.
    expect(validerTitel(` ${"x".repeat(TITEL_MAX_LAENGDE - 1)} `).ok).toBe(true);
  });
});

describe("normaliserBegrundelse — valgfri, trimmet, tom bliver null", () => {
  it("trimmer en reel begrundelse", () => {
    expect(normaliserBegrundelse("  Renten skal genforhandles.  ")).toBe("Renten skal genforhandles.");
  });

  it("tom, whitespace og ikke-streng bliver null", () => {
    expect(normaliserBegrundelse("")).toBeNull();
    expect(normaliserBegrundelse("   ")).toBeNull();
    expect(normaliserBegrundelse(undefined)).toBeNull();
    expect(normaliserBegrundelse(42)).toBeNull();
  });
});
