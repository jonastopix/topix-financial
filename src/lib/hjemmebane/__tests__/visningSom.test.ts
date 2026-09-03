import { describe, it, expect } from "vitest";
import { visningSomLinje, VISNING_SOM_KNAP } from "../visningSom";

// «Visning som»-linjen (3/9, recon-raadgiverfladen §4): samme betingelse
// som AppLayouts banner — rådgiver, valg sat, ikke «se som medlem».

const grund = { isAdvisor: true, isCompanyOverride: true, viewingAsMember: false, companyName: "Two Socks ApS" };

describe("visningSomLinje", () => {
  it("rådgiver med valg → linjen med virksomhedens navn og vejen tilbage", () => {
    expect(visningSomLinje(grund)).toEqual({ tekst: "Du ser Two Socks ApS", knap: VISNING_SOM_KNAP });
  });

  it("uden navn siges det ærligt, frem for «Du ser »", () => {
    expect(visningSomLinje({ ...grund, companyName: null })?.tekst).toBe("Du ser en anden virksomhed");
    expect(visningSomLinje({ ...grund, companyName: "  " })?.tekst).toBe("Du ser en anden virksomhed");
  });

  it("ikke rådgiver → null (et medlem har aldrig et valg)", () => {
    expect(visningSomLinje({ ...grund, isAdvisor: false })).toBeNull();
  });

  it("intet valg → null", () => {
    expect(visningSomLinje({ ...grund, isCompanyOverride: false })).toBeNull();
  });

  it("«se som medlem» → null, præcis som AppLayouts banner", () => {
    expect(visningSomLinje({ ...grund, viewingAsMember: true })).toBeNull();
  });
});
