import { describe, expect, it } from "vitest";
import { erFriskCache, CACHE_DAGE_FUNDET, CACHE_DAGE_FINDES_IKKE } from "../../../supabase/functions/_shared/cvrCache.ts";
import { kanSlaaOp, knapTekst, maaSkrives, opslagsBesked, type ManueltUdfald } from "@/lib/ansoegninger/cvrManueltOpslag";

/**
 * Dommen bag rådgiverens knap «Slå op i CVR» (22/9-2026) — og friskheden i
 * cachen, som nu har ét hjem, fordi to functions læser den.
 */

describe("kanSlaaOp — otte cifre, og kun det", () => {
  it("otte cifre er et CVR", () => {
    expect(kanSlaaOp("43327720")).toBe(true);   // Tatti
    expect(kanSlaaOp("31875161")).toBe(true);   // ABC
    expect(kanSlaaOp("  43327720  ")).toBe(true);
  });

  it("MÅLT 22/9: Monday-feltet med TI cifre er ikke et CVR", () => {
    expect(kanSlaaOp("4332772012")).toBe(false);
  });

  it("for få cifre, bogstaver, tomt og null er ikke et CVR", () => {
    for (const d of ["", "   ", "4332772", "DK43327720", "43 32 77 20", "abcdefgh", null, undefined]) {
      expect(kanSlaaOp(d), String(d)).toBe(false);
    }
  });
});

describe("maaSkrives — et tomt eller fejlet svar skriver ALDRIG", () => {
  it("kun «fundet» MED visning skriver", () => {
    expect(maaSkrives("fundet", true)).toBe(true);
  });

  it("alt andet lader det, der står, stå", () => {
    expect(maaSkrives("fundet", false)).toBe(false);
    for (const u of ["findes_ikke", "utilgaengelig", "dagsloft", "intet_cvr", "ukendt_ansoegning"] as ManueltUdfald[]) {
      expect(maaSkrives(u, true), u).toBe(false);
      expect(maaSkrives(u, false), u).toBe(false);
    }
  });
});

describe("opslagsBesked — en rolig linje, aldrig en stacktrace", () => {
  it("hvert udfald har en hel sætning på dansk", () => {
    for (const u of ["fundet", "findes_ikke", "utilgaengelig", "dagsloft", "intet_cvr", "ukendt_ansoegning"] as ManueltUdfald[]) {
      const s = opslagsBesked(u);
      expect(s.length, u).toBeGreaterThan(10);
      expect(s.endsWith("."), u).toBe(true);
      // Ingen kode, ingen engelske fejlord, intet nøgle-/kvoteinternt.
      expect(/error|Error|null|undefined|DATACVR|API_KEY|429|stack/.test(s), u).toBe(false);
    }
  });

  it("«fundet» bekræfter hvad der blev hentet", () => {
    expect(opslagsBesked("fundet", "ABC hundeudstyr ApS")).toBe("Hentet fra CVR: ABC hundeudstyr ApS.");
    expect(opslagsBesked("fundet", "   ")).toBe("Hentet fra CVR.");
    expect(opslagsBesked("fundet", null)).toBe("Hentet fra CVR.");
  });

  it("dagsloftet siger, hvad rådgiveren KAN gøre", () => {
    expect(opslagsBesked("dagsloft")).toContain("app_config");
  });

  it("«utilgængelig» lover, at intet blev ødelagt", () => {
    expect(opslagsBesked("utilgaengelig")).toContain("urørt");
  });
});

describe("knapTekst", () => {
  it("første gang «Slå op», bagefter «Opdatér»", () => {
    expect(knapTekst(false)).toBe("Slå op i CVR");
    expect(knapTekst(true)).toBe("Opdatér fra CVR");
  });
});

describe("erFriskCache — ét hjem for de to tal", () => {
  const nu = new Date("2026-09-22T15:10:00.000Z");
  const forDage = (d: number) => new Date(nu.getTime() - d * 86_400_000).toISOString();

  it("et fundet CVR er friskt i 30 dage", () => {
    expect(CACHE_DAGE_FUNDET).toBe(30);
    expect(erFriskCache("fundet", forDage(0), nu)).toBe(true);
    expect(erFriskCache("fundet", forDage(29.9), nu)).toBe(true);
    expect(erFriskCache("fundet", forDage(30.1), nu)).toBe(false);
  });

  it("«findes ikke» er friskt i én dag — en nystiftet virksomhed dukker op", () => {
    expect(CACHE_DAGE_FINDES_IKKE).toBe(1);
    expect(erFriskCache("findes_ikke", forDage(0.9), nu)).toBe(true);
    expect(erFriskCache("findes_ikke", forDage(1.1), nu)).toBe(false);
  });

  it("en ulæselig eller fremtidig dato er IKKE frisk (fail-closed)", () => {
    expect(erFriskCache("fundet", "ikke en dato", nu)).toBe(false);
    expect(erFriskCache("fundet", "", nu)).toBe(false);
    expect(erFriskCache("fundet", new Date(nu.getTime() + 3_600_000).toISOString(), nu)).toBe(false);
  });
});
