import { describe, expect, it } from "vitest";
import {
  NAVNE_MAKS,
  SIDEN_SIDST_LOFT_DAGE,
  intetNytTekst,
  samlNavne,
  sidenAf,
  sidenSidstLinjer,
  sidenTekst,
  talord,
} from "@/lib/sidenSidst";

const NU = new Date(2026, 8, 9, 8, 30); // 9. september 2026, morgen
const dageSiden = (d: number, t = 9) => new Date(2026, 8, 9 - d, t, 0);

describe("sidenAf — syv-dages-loftet", () => {
  it("i går → i går; en uge → loftet; en måned → loftet (syv dage)", () => {
    expect(sidenAf(dageSiden(1), NU).getTime()).toBe(dageSiden(1).getTime());
    expect(sidenAf(dageSiden(7, 8), NU).getTime()).toBe(NU.getTime() - 7 * 86_400_000); // 7 dage + 30 min → loftet
    expect(sidenAf(dageSiden(6), NU).getTime()).toBe(dageSiden(6).getTime()); // inden for loftet
    expect(sidenAf(dageSiden(30), NU).getTime()).toBe(NU.getTime() - 7 * 86_400_000);
    expect(SIDEN_SIDST_LOFT_DAGE).toBe(7);
  });
  it("uden stempel (første gang) → loftet; ulæseligt → loftet; fremtid → nu", () => {
    expect(sidenAf(null, NU).getTime()).toBe(NU.getTime() - 7 * 86_400_000);
    expect(sidenAf("nej", NU).getTime()).toBe(NU.getTime() - 7 * 86_400_000);
    expect(sidenAf(new Date(NU.getTime() + 60_000), NU).getTime()).toBe(NU.getTime());
  });
  it("tager både ISO-streng og Date", () => {
    expect(sidenAf(dageSiden(2).toISOString(), NU).getTime()).toBe(dageSiden(2).getTime());
  });
});

describe("sidenTekst", () => {
  it("i morges / i går / de seneste N dage / den seneste uge", () => {
    expect(sidenTekst(new Date(2026, 8, 9, 6), NU)).toBe("siden i morges");
    expect(sidenTekst(dageSiden(1), NU)).toBe("siden i går");
    expect(sidenTekst(dageSiden(3), NU)).toBe("de seneste 3 dage");
    expect(sidenTekst(sidenAf(dageSiden(30), NU), NU)).toBe("den seneste uge");
    expect(intetNytTekst(dageSiden(1), NU)).toBe("Intet nyt siden i går.");
  });
});

describe("samlNavne og talord", () => {
  it("ét, to, tre navne", () => {
    expect(samlNavne(["Doggybed"])).toBe("Doggybed");
    expect(samlNavne(["Doggybed", "PHILBERT"])).toBe("Doggybed og PHILBERT");
    expect(samlNavne(["Doggybed", "PHILBERT", "Floren"])).toBe("Doggybed, PHILBERT og Floren");
  });
  it("flere end tre: «og N andre», ental «anden»", () => {
    expect(NAVNE_MAKS).toBe(3);
    expect(samlNavne(["Doggybed", "PHILBERT", "Floren", "Rezycl"])).toBe("Doggybed, PHILBERT, Floren og en anden");
    expect(samlNavne(["Doggybed", "PHILBERT", "Floren", "Rezycl", "CARMA", "Brick Works"])).toBe("Doggybed, PHILBERT, Floren og tre andre");
  });
  it("tomme og blanke navne ignoreres", () => {
    expect(samlNavne([])).toBe("");
    expect(samlNavne([" ", "Doggybed"])).toBe("Doggybed");
  });
  it("talord til tolv, ellers tal", () => {
    expect(talord(3)).toBe("Tre");
    expect(talord(12)).toBe("Tolv");
    expect(talord(13)).toBe("13");
    expect(talord(2, false)).toBe("to");
  });
});

describe("sidenSidstLinjer", () => {
  it("Jonas' eksempel, ordret", () => {
    const l = sidenSidstLinjer([{ slags: "rapporter", antal: 3, navne: ["Doggybed", "PHILBERT", "Floren"] }]);
    expect(l[0].tekst).toBe("Tre rapporter kom ind · Doggybed, PHILBERT og Floren");
  });
  it("ental/flertal pr. slags, størst først, nul og ukendte slags ude", () => {
    const l = sidenSidstLinjer([
      { slags: "medlemmer", antal: 1, navne: ["Ny ApS"] },
      { slags: "beskeder", antal: 5, navne: ["Doggybed", "Floren"] },
      { slags: "svar", antal: 1, navne: ["CARMA STUDIO"] },
      { slags: "betalinger", antal: 0, navne: [] },
      { slags: "andet", antal: 9, navne: ["x"] },
      { slags: "betalinger", antal: 2, navne: ["Rezycl", "Brick Works"] },
    ]);
    expect(l.map((x) => x.tekst)).toEqual([
      "Fem nye beskeder · Doggybed og Floren",
      "To betalinger · Rezycl og Brick Works",
      "Et nyt medlem · Ny ApS",
      "Et forslag besvaret · CARMA STUDIO",
    ]);
  });
  it("«og N andre» regnes af navnene, ikke af hændelserne: tre beskeder fra én virksomhed", () => {
    const l = sidenSidstLinjer([{ slags: "beskeder", antal: 3, navne: ["Doggybed"] }]);
    expect(l[0].tekst).toBe("Tre nye beskeder · Doggybed");
  });
});
