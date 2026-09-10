/**
 * Den første sætning efter en fornyelsesbetaling (10/9): vælges på FØR-
 * tilstanden (?foer=) — ikke på tier efter hjemkomsten, som webhooken
 * normalt allerede har ændret. Alle fire felter i reconens tabel + faldback.
 */
import { describe, expect, it } from "vitest";
import {
  fornyelsesToastTekst,
  laesFoer,
  TOAST_AABEN_IGEN,
  TOAST_AABNER_SNART,
  TOAST_FORTSAETTER,
} from "../fornyelsesToast";

describe("laesFoer", () => {
  it("kender kun aktiv og udloebet; alt andet er ukendt", () => {
    expect(laesFoer("aktiv")).toBe("aktiv");
    expect(laesFoer("udloebet")).toBe("udloebet");
    expect(laesFoer("Aktiv")).toBeNull();
    expect(laesFoer("")).toBeNull();
    expect(laesFoer(null)).toBeNull();
    expect(laesFoer(undefined)).toBeNull();
  });
});

describe("fornyelsesToastTekst", () => {
  it("fuldt medlem betalte tidligt: «fortsætter uden afbrydelse» — uanset hvem der vandt kapløbet", () => {
    expect(fornyelsesToastTekst({ foer: "aktiv", tier: "full" })).toBe(TOAST_FORTSAETTER);
    expect(fornyelsesToastTekst({ foer: "aktiv", tier: null })).toBe(TOAST_FORTSAETTER);
    expect(fornyelsesToastTekst({ foer: "aktiv", tier: "subscriber" })).toBe(TOAST_FORTSAETTER);
  });
  it("genåbnet, webhooken vandt (det normale): «åben igen — løber fra i dag», IKKE «fortsætter uden afbrydelse»", () => {
    const t = fornyelsesToastTekst({ foer: "udloebet", tier: "full" });
    expect(t).toBe(TOAST_AABEN_IGEN);
    expect(t).not.toContain("uden afbrydelse");
    expect(t).not.toContain("hvor den nuværende slutter");
  });
  it("genåbnet, returen vandt: «vi åbner om et øjeblik» (kvitteringen tager over)", () => {
    expect(fornyelsesToastTekst({ foer: "udloebet", tier: "expired" })).toBe(TOAST_AABNER_SNART);
    expect(fornyelsesToastTekst({ foer: "udloebet", tier: null })).toBe(TOAST_AABNER_SNART);
  });
  it("uden foer (session fra før ændringen): den gamle tier-regel", () => {
    expect(fornyelsesToastTekst({ foer: null, tier: "full" })).toBe(TOAST_FORTSAETTER);
    expect(fornyelsesToastTekst({ foer: null, tier: "expired" })).toBe(TOAST_AABNER_SNART);
    expect(fornyelsesToastTekst({ foer: null, tier: null })).toBe(TOAST_AABNER_SNART);
  });
});
