import { describe, expect, it } from "vitest";
import { deriveBudgetTone, deriveRunwayTone } from "../budgetTone";

/** Case-tabellerne fra design-blokken §b2/§b3 — bygget præcis som bogført. */
describe("deriveBudgetTone", () => {
  it("uden realiseret tal: no_actual · quiet · pct null", () => {
    expect(deriveBudgetTone({ budget: 100, actual: null, isRevenue: true })).toEqual({
      state: "no_actual",
      tone: "quiet",
      pct: null,
    });
  });

  it("indtægt over budget: favorable · quiet · +10", () => {
    expect(deriveBudgetTone({ budget: 100, actual: 110, isRevenue: true })).toEqual({
      state: "favorable",
      tone: "quiet",
      pct: 10,
    });
  });

  it("indtægt på budget: favorable · quiet · 0", () => {
    expect(deriveBudgetTone({ budget: 100, actual: 100, isRevenue: true })).toEqual({
      state: "favorable",
      tone: "quiet",
      pct: 0,
    });
  });

  it("indtægt lidt under budget (−5 %): near · attention", () => {
    expect(deriveBudgetTone({ budget: 100, actual: 95, isRevenue: true })).toEqual({
      state: "near",
      tone: "attention",
      pct: -5,
    });
  });

  it("indtægt mere end 10 % under budget (−11 %): off · attention", () => {
    expect(deriveBudgetTone({ budget: 100, actual: 89, isRevenue: true })).toEqual({
      state: "off",
      tone: "attention",
      pct: -11,
    });
  });

  it("omkostning under budget er favorable: quiet", () => {
    expect(deriveBudgetTone({ budget: 100, actual: 90, isRevenue: false })).toEqual({
      state: "favorable",
      tone: "quiet",
      pct: 10,
    });
  });

  it("omkostning lidt over budget (−8 %): near · attention", () => {
    expect(deriveBudgetTone({ budget: 100, actual: 108, isRevenue: false })).toEqual({
      state: "near",
      tone: "attention",
      pct: -8,
    });
  });

  it("omkostning mere end 10 % over budget (−20 %): off · attention", () => {
    expect(deriveBudgetTone({ budget: 100, actual: 120, isRevenue: false })).toEqual({
      state: "off",
      tone: "attention",
      pct: -20,
    });
  });

  it("budget 0, indtægt realiseret: favorable · quiet · pct 0 (arvet randadfærd)", () => {
    expect(deriveBudgetTone({ budget: 0, actual: 50, isRevenue: true })).toEqual({
      state: "favorable",
      tone: "quiet",
      pct: 0,
    });
  });

  it("budget 0, omkostning realiseret: near · attention · pct 0 — pct 0 kan aldrig blive off (arvet randadfærd)", () => {
    expect(deriveBudgetTone({ budget: 0, actual: 50, isRevenue: false })).toEqual({
      state: "near",
      tone: "attention",
      pct: 0,
    });
  });

  it("tonen er aldrig andet end quiet/attention (ingen alert i domænet)", () => {
    const tones = new Set(
      [
        { budget: 100, actual: null, isRevenue: true },
        { budget: 100, actual: 110, isRevenue: true },
        { budget: 100, actual: 95, isRevenue: true },
        { budget: 100, actual: 10, isRevenue: true },
        { budget: 100, actual: 500, isRevenue: false },
      ].map((c) => deriveBudgetTone(c).tone),
    );
    expect([...tones].every((t) => t === "quiet" || t === "attention")).toBe(true);
  });
});

describe("deriveRunwayTone", () => {
  it("null: none · quiet", () => {
    expect(deriveRunwayTone(null)).toEqual({ state: "none", tone: "quiet" });
  });

  it("12 måneder: solid · quiet", () => {
    expect(deriveRunwayTone(12)).toEqual({ state: "solid", tone: "quiet" });
  });

  it("6 måneder (trappens kant): solid · quiet", () => {
    expect(deriveRunwayTone(6)).toEqual({ state: "solid", tone: "quiet" });
  });

  it("5 måneder: stram · attention", () => {
    expect(deriveRunwayTone(5)).toEqual({ state: "stram", tone: "attention" });
  });

  it("3 måneder (trappens kant): stram · attention", () => {
    expect(deriveRunwayTone(3)).toEqual({ state: "stram", tone: "attention" });
  });

  it("2 måneder: kritisk · attention", () => {
    expect(deriveRunwayTone(2)).toEqual({ state: "kritisk", tone: "attention" });
  });

  it("0 måneder: kritisk · attention", () => {
    expect(deriveRunwayTone(0)).toEqual({ state: "kritisk", tone: "attention" });
  });
});
