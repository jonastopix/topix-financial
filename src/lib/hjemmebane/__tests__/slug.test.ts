import { describe, expect, it } from "vitest";
import { slugify } from "../slug";

describe("slugify", () => {
  it("translitterer æ/ø/å til ae/oe/aa", () => {
    expect(slugify("Skat, moms og årsregnskab")).toBe("skat-moms-og-aarsregnskab");
    expect(slugify("Økonomistyring")).toBe("oekonomistyring");
    expect(slugify("Lær at læse tal")).toBe("laer-at-laese-tal");
  });

  it("håndterer accenter og specialtegn via dekomposition", () => {
    expect(slugify("Café-økonomi & résumé")).toBe("cafe-oekonomi-resume");
  });

  it("kollapser mellemrum/tegn til enkeltbindestreg og trimmer kanter", () => {
    expect(slugify("  Modul 1:  Moms — fradrag  ")).toBe("modul-1-moms-fradrag");
    expect(slugify("---")).toBe("");
  });

  it("bevarer tal og lader gyldige slugs passere uændret", () => {
    expect(slugify("regnskabsskolen-modul-2")).toBe("regnskabsskolen-modul-2");
  });
});
