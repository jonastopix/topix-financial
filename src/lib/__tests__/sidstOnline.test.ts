import { describe, expect, it } from "vitest";
import { dageSiden, erLaengeSiden, LAENGE_SIDEN_DAGE, senesteAf, sidstOnlineTekst } from "../sidstOnline";

// «Sidst online» — kilden er auth.users.last_sign_in_at (get_users_last_login),
// definitionen for en virksomhed er den seneste af alle medlemmer, sproget
// er husets «N dage siden», og «Aldrig logget ind» når der intet er.

const NU = new Date("2026-09-09T11:16:00Z");

describe("dageSiden — hele døgn, floor, som heleDageSiden", () => {
  it("i dag, i går, og Brick Works' 134", () => {
    expect(dageSiden("2026-09-09T08:00:00Z", NU)).toBe(0);
    expect(dageSiden("2026-09-08T12:00:00Z", NU)).toBe(0); // under 24 timer → 0
    expect(dageSiden("2026-09-08T10:00:00Z", NU)).toBe(1);
    expect(dageSiden("2026-04-28T11:16:00Z", NU)).toBe(134);
  });
  it("intet stempel eller ulæseligt: null", () => {
    expect(dageSiden(null, NU)).toBeNull();
    expect(dageSiden(undefined, NU)).toBeNull();
    expect(dageSiden("", NU)).toBeNull();
    expect(dageSiden("ikke en dato", NU)).toBeNull();
  });
  it("stempel i fremtiden (skævt ur): 0, ikke negativt", () => {
    expect(dageSiden("2026-09-10T00:00:00Z", NU)).toBe(0);
  });
});

describe("senesteAf — virksomheden er den seneste af sine medlemmer", () => {
  it("to medlemmer: den nyeste vinder", () => {
    expect(senesteAf(["2026-09-01T10:00:00Z", "2026-09-07T09:00:00Z"])).toBe("2026-09-07T09:00:00Z");
  });
  it("et medlem der aldrig har logget ind trækker ikke ned", () => {
    expect(senesteAf([null, "2026-09-07T09:00:00Z", undefined])).toBe("2026-09-07T09:00:00Z");
  });
  it("ingen har logget ind: null", () => {
    expect(senesteAf([])).toBeNull();
    expect(senesteAf([null, undefined, ""])).toBeNull();
  });
  it("ulæselige stempler springes over", () => {
    expect(senesteAf(["hest", "2026-09-07T09:00:00Z"])).toBe("2026-09-07T09:00:00Z");
  });
});

describe("sidstOnlineTekst — husets ord", () => {
  it("aldrig, i dag, ental, flertal", () => {
    expect(sidstOnlineTekst(null)).toBe("Aldrig logget ind");
    expect(sidstOnlineTekst(0)).toBe("Online i dag");
    expect(sidstOnlineTekst(1)).toBe("Online 1 dag siden");
    expect(sidstOnlineTekst(2)).toBe("Online 2 dage siden");
    expect(sidstOnlineTekst(134)).toBe("Online 134 dage siden");
  });
});

describe("erLaengeSiden — én grænse, tre måneder, rust; aldrig er ikke rust", () => {
  it("grænsen er 90 og er med", () => {
    expect(LAENGE_SIDEN_DAGE).toBe(90);
    expect(erLaengeSiden(89)).toBe(false);
    expect(erLaengeSiden(90)).toBe(true);
    expect(erLaengeSiden(134)).toBe(true);
  });
  it("Doggybed (1) og CARMA (83) er ikke rust; Brick Works (134) er", () => {
    expect(erLaengeSiden(1)).toBe(false);
    expect(erLaengeSiden(83)).toBe(false);
    expect(erLaengeSiden(134)).toBe(true);
  });
  it("aldrig logget ind: ingen farve", () => {
    expect(erLaengeSiden(null)).toBe(false);
  });
});
