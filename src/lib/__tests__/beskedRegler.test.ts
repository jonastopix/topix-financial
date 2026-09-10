/**
 * Redigering og sletning af chatbeskeder (10/9): samme 15-minutters-vindue
 * for medlemmer, kun egne beskeder; rådgiveren egne uden grænse. Grænserne
 * fra begge sider. Spejler policyen «Users can delete own messages within 15 min».
 */
import { describe, expect, it } from "vitest";
import { BESKED_VINDUE_MS, indenForVinduet, kanRedigereBesked, kanSletteBesked } from "../beskedRegler";

const NU = Date.parse("2026-09-10T12:00:00Z");
const iso = (msFoerNu: number) => new Date(NU - msFoerNu).toISOString();

describe("indenForVinduet", () => {
  it("14:59 er inden for, 15:00 er ikke (skarp grænse som policyens «>»)", () => {
    expect(BESKED_VINDUE_MS).toBe(15 * 60 * 1000);
    expect(indenForVinduet(iso(BESKED_VINDUE_MS - 1), NU)).toBe(true);
    expect(indenForVinduet(iso(BESKED_VINDUE_MS), NU)).toBe(false);
    expect(indenForVinduet(iso(BESKED_VINDUE_MS + 60_000), NU)).toBe(false);
  });
  it("en ulæselig dato er «for gammel» — aldrig et ja på et tal vi ikke har", () => {
    expect(indenForVinduet("ikke en dato", NU)).toBe(false);
  });
});

describe("kanSletteBesked — medlem", () => {
  const medlem = { currentUserId: "m1", isAdvisor: false };
  it("egen besked inden for vinduet → ja; efter vinduet → nej", () => {
    expect(kanSletteBesked({ ...medlem, senderId: "m1", createdAt: iso(60_000), now: NU })).toBe(true);
    expect(kanSletteBesked({ ...medlem, senderId: "m1", createdAt: iso(BESKED_VINDUE_MS), now: NU })).toBe(false);
    expect(kanSletteBesked({ ...medlem, senderId: "m1", createdAt: iso(90 * 86_400_000), now: NU })).toBe(false);
  });
  it("andres beskeder → aldrig, heller ikke friske", () => {
    expect(kanSletteBesked({ ...medlem, senderId: "advisor-1", createdAt: iso(1_000), now: NU })).toBe(false);
  });
  it("ingen bruger (ikke logget ind) → nej", () => {
    expect(kanSletteBesked({ senderId: "m1", currentUserId: undefined, isAdvisor: false, createdAt: iso(1_000), now: NU })).toBe(false);
  });
  it("sletning og redigering er SAMME dom", () => {
    for (const alder of [0, 60_000, BESKED_VINDUE_MS - 1, BESKED_VINDUE_MS, 3_600_000]) {
      const a = { ...medlem, senderId: "m1", createdAt: iso(alder), now: NU };
      expect(kanSletteBesked(a)).toBe(kanRedigereBesked(a));
    }
  });
});

describe("kanSletteBesked — rådgiver", () => {
  const raadgiver = { currentUserId: "a1", isAdvisor: true };
  it("egne beskeder uden tidsgrænse (som ved redigering)", () => {
    expect(kanSletteBesked({ ...raadgiver, senderId: "a1", createdAt: iso(400 * 86_400_000), now: NU })).toBe(true);
  });
  it("medlemmets beskeder vises IKKE som slettelige i fladen — selv om databasen bevilger det", () => {
    expect(kanSletteBesked({ ...raadgiver, senderId: "m1", createdAt: iso(1_000), now: NU })).toBe(false);
  });
});
