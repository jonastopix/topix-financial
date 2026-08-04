import { describe, expect, it } from "vitest";
import { dripState, effectiveDrip } from "../drip";

const day = (n: number) => new Date(Date.UTC(2026, 7, 1 + n, 12, 0, 0));
const JOINED = day(0).toISOString();

describe("effectiveDrip", () => {
  it("item-dryp vinder over samlingens", () => {
    expect(effectiveDrip(7, 30)).toBe(7);
  });
  it("arver fra samlingen når itemet ikke sætter egen", () => {
    expect(effectiveDrip(null, 14)).toBe(14);
  });
  it("null hele vejen = altid åben", () => {
    expect(effectiveDrip(null, null)).toBeNull();
    expect(effectiveDrip(null, undefined)).toBeNull();
  });
  it("0 dage er en gyldig egen værdi (straks), ikke arv", () => {
    expect(effectiveDrip(0, 30)).toBe(0);
  });
});

describe("dripState", () => {
  it("null-dryp er altid åben, også uden anker", () => {
    expect(dripState(null, { joinedAt: null, isAdvisor: false })).toEqual({ unlocked: true });
  });

  it("advisor ser alt uanset dryp og anker", () => {
    expect(dripState(30, { joinedAt: null, isAdvisor: true })).toEqual({ unlocked: true });
  });

  it("åbner præcis når dagene er gået (anker company_members.created_at)", () => {
    expect(dripState(14, { joinedAt: JOINED, isAdvisor: false, now: day(14) }).unlocked).toBe(true);
    expect(dripState(14, { joinedAt: JOINED, isAdvisor: false, now: day(13) }).unlocked).toBe(false);
  });

  it("tæller hele dage ned til oplåsning", () => {
    expect(dripState(14, { joinedAt: JOINED, isAdvisor: false, now: day(10) })).toEqual({
      unlocked: false,
      daysUntil: 4,
    });
  });

  it("fail-closed: dryppet indhold uden membership-anker er låst", () => {
    expect(dripState(7, { joinedAt: null, isAdvisor: false })).toEqual({
      unlocked: false,
      daysUntil: 7,
    });
  });

  it("fail-closed: ugyldigt anker behandles som manglende", () => {
    expect(dripState(7, { joinedAt: "not-a-date", isAdvisor: false }).unlocked).toBe(false);
  });
});
