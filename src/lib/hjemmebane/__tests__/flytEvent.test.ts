import { describe, expect, it } from "vitest";
import { erTidsaendring, gemKnapTekst, planlaegGem } from "@/lib/hjemmebane/flytEvent";

/* «Gem» på et event (udkast 18/9): tiden på et PUBLICERET event går gennem
   flyt-event (besked til de tilmeldte); resten, kladder og aflyste gemmes som
   før. Dommen er ren. */

const gemt = { status: "published", starts_at: "2026-10-01T08:00:00.000Z", ends_at: "2026-10-01T09:00:00.000Z" };

describe("erTidsaendring", () => {
  it("samme tidspunkt i anden skrivemåde er IKKE en ændring", () => {
    expect(erTidsaendring(gemt, { starts_at: "2026-10-01T10:00:00+02:00" })).toBe(false);
  });
  it("ny start eller ny slut er en ændring; fjernet slut (null) også", () => {
    expect(erTidsaendring(gemt, { starts_at: "2026-10-02T08:00:00.000Z" })).toBe(true);
    expect(erTidsaendring(gemt, { ends_at: "2026-10-01T10:00:00.000Z" })).toBe(true);
    expect(erTidsaendring(gemt, { ends_at: null })).toBe(true);
  });
  it("titel alene er ingen ændring af tiden", () => {
    expect(erTidsaendring(gemt, { title: "Ny titel" })).toBe(false);
  });
});

describe("planlaegGem — hvad går hvor", () => {
  it("publiceret + ny start: flytningen bærer starten, resten er tom", () => {
    expect(planlaegGem(gemt, { starts_at: "2026-10-02T08:00:00.000Z" })).toEqual({
      flytning: { starts_at: "2026-10-02T08:00:00.000Z" },
      rest: {},
    });
  });
  it("publiceret + ny slut alene: flytningen bærer den GEMTE start og den nye slut", () => {
    expect(planlaegGem(gemt, { ends_at: "2026-10-01T10:00:00.000Z" })).toEqual({
      flytning: { starts_at: gemt.starts_at, ends_at: "2026-10-01T10:00:00.000Z" },
      rest: {},
    });
  });
  it("publiceret + tid OG titel: titlen i resten, tiden i flytningen", () => {
    expect(planlaegGem(gemt, { title: "T", starts_at: "2026-10-02T08:00:00.000Z", capacity: 20 })).toEqual({
      flytning: { starts_at: "2026-10-02T08:00:00.000Z" },
      rest: { title: "T", capacity: 20 },
    });
  });
  it("kladde med ny tid: ingen flytning, hele patchen i resten (ingen tilmeldte at underrette)", () => {
    expect(planlaegGem({ ...gemt, status: "draft" }, { starts_at: "2026-10-02T08:00:00.000Z" })).toEqual({
      flytning: null,
      rest: { starts_at: "2026-10-02T08:00:00.000Z" },
    });
  });
  it("aflyst/afholdt med ny tid: som kladde", () => {
    for (const status of ["cancelled", "completed"]) {
      expect(planlaegGem({ ...gemt, status }, { starts_at: "2026-10-02T08:00:00.000Z" }).flytning).toBeNull();
    }
  });
  it("publiceret, tiden gentaget uændret: ingen flytning, patchen urørt", () => {
    expect(planlaegGem(gemt, { starts_at: gemt.starts_at, title: "T" })).toEqual({ flytning: null, rest: { starts_at: gemt.starts_at, title: "T" } });
  });
  it("tom patch: tom rest, ingen flytning", () => {
    expect(planlaegGem(gemt, {})).toEqual({ flytning: null, rest: {} });
  });
});

describe("gemKnapTekst", () => {
  it("uden flytning: «Gem»; med flytning: siger at de tilmeldte får besked", () => {
    expect(gemKnapTekst({ flytning: null, rest: {} }, 5)).toBe("Gem");
    expect(gemKnapTekst({ flytning: { starts_at: "x" }, rest: {} }, 1)).toBe("Gem — 1 tilmeldt får besked om den nye tid");
    expect(gemKnapTekst({ flytning: { starts_at: "x" }, rest: {} }, 7)).toBe("Gem — 7 tilmeldte får besked om den nye tid");
    expect(gemKnapTekst({ flytning: { starts_at: "x" }, rest: {} }, 0)).toBe("Gem — den nye tid");
  });
});
