import { describe, expect, it } from "vitest";
import { fornavn, NY_I_DENNE_UGE, pushOverlinje } from "../pushOverlinje";

/* Forside PR 1 (17/9): «12. august» i pushets overlinje er væk — «Ny i denne
   uge» ≤ 7 dage, ellers «Fra {fornavn}» når der er en afsender, ellers intet. */

const NU = new Date("2026-09-17T08:46:00Z");
const dage = (n: number) => new Date(NU.getTime() - n * 86400000).toISOString();

describe("pushOverlinje", () => {
  it("≤ 7 dage: «Ny i denne uge» — også med afsender (nyheden vinder)", () => {
    expect(pushOverlinje({ publishedAt: dage(0), afsenderNavn: null, nu: NU })).toBe(NY_I_DENNE_UGE);
    expect(pushOverlinje({ publishedAt: dage(7), afsenderNavn: "Morten Larsen", nu: NU })).toBe(NY_I_DENNE_UGE);
  });
  it("ældre end 7 dage med afsender: «Fra Morten» — fornavnet, aldrig datoen", () => {
    expect(pushOverlinje({ publishedAt: dage(8), afsenderNavn: "Morten Larsen", nu: NU })).toBe("Fra Morten");
    expect(pushOverlinje({ publishedAt: "2026-08-12T10:00:00Z", afsenderNavn: "Morten", nu: NU })).toBe("Fra Morten");
  });
  it("ældre end 7 dage uden afsender: intet (ingen dato)", () => {
    expect(pushOverlinje({ publishedAt: dage(36), afsenderNavn: null, nu: NU })).toBeNull();
    expect(pushOverlinje({ publishedAt: dage(36), afsenderNavn: "   ", nu: NU })).toBeNull();
  });
  it("ulæselig eller manglende dato er ikke «ny» — afsenderen eller intet", () => {
    expect(pushOverlinje({ publishedAt: "hest", afsenderNavn: "Jonas Herlev", nu: NU })).toBe("Fra Jonas");
    expect(pushOverlinje({ publishedAt: null, afsenderNavn: null, nu: NU })).toBeNull();
  });
  it("fornavn: første ord, trimmet; tomt → null", () => {
    expect(fornavn("  Lisbeth   Gade ")).toBe("Lisbeth");
    expect(fornavn("Morten")).toBe("Morten");
    expect(fornavn("")).toBeNull();
    expect(fornavn(undefined)).toBeNull();
  });
});
