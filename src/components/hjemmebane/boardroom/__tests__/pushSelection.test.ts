import { describe, expect, it } from "vitest";
import type { ContentItem } from "@/lib/hjemmebane/adminContentApi";
import { pickActiveItem, pickActivePush, pickActiveWeekVideo } from "../pushSelection";

const push = (overrides: Partial<ContentItem>): ContentItem =>
  ({
    title: "Uden titel",
    published_at: null,
    created_at: "2026-01-01T00:00:00Z",
    metadata: {},
    ...overrides,
  }) as ContentItem;

/** Fast "nu": fredag 7. august 2026 kl. 09.00 lokal tid. */
const NOW = new Date(2026, 7, 7, 9, 0, 0);

describe("pickActivePush — hero-udvælgelsen", () => {
  it("nyeste published vinder (published_at DESC, created_at-fallback)", () => {
    const items = [
      push({ title: "Ældre", published_at: "2026-08-01T08:00:00Z" }),
      push({ title: "Nyest", published_at: "2026-08-05T08:00:00Z" }),
    ];
    expect(pickActivePush(items, NOW)?.title).toBe("Nyest");
  });

  it("udløbet indslag springes over til næstnyeste", () => {
    const items = [
      push({ title: "Udløbet i går", published_at: "2026-08-05T08:00:00Z", metadata: { expires_at: "2026-08-06" } }),
      push({ title: "Stadig aktiv", published_at: "2026-08-01T08:00:00Z" }),
    ];
    expect(pickActivePush(items, NOW)?.title).toBe("Stadig aktiv");
  });

  it("udløbsdagen selv er stadig aktiv — torsdagens push lever torsdagen ud", () => {
    const torsdagAften = new Date(2026, 7, 6, 23, 30, 0);
    const items = [
      push({ title: "Torsdags-push", published_at: "2026-08-05T08:00:00Z", metadata: { expires_at: "2026-08-06" } }),
    ];
    expect(pickActivePush(items, torsdagAften)?.title).toBe("Torsdags-push");
  });

  it("dagen efter udløbsdagen er indslaget væk", () => {
    const fredagNat = new Date(2026, 7, 7, 0, 0, 1);
    const items = [
      push({ title: "Torsdags-push", published_at: "2026-08-05T08:00:00Z", metadata: { expires_at: "2026-08-06" } }),
    ];
    expect(pickActivePush(items, fredagNat)).toBeUndefined();
  });

  it("manglende/ugyldig expires_at = aldrig udløb", () => {
    const items = [
      push({ title: "Ugyldig dato", published_at: "2026-08-05T08:00:00Z", metadata: { expires_at: "snarest" } }),
    ];
    expect(pickActivePush(items, NOW)?.title).toBe("Ugyldig dato");
  });

  it("tom liste → undefined", () => {
    expect(pickActivePush([], NOW)).toBeUndefined();
  });
});

/** Ugens video (bølge 1, PR 1): samme dom som hero'en via pickActiveItem.
    Testdatoer er RELATIVE til NOW (tidszone-lærdommen fra PR #217):
    published_at som absolutte epoch-offsets; expires_at som LOKALE
    kalenderdatoer afledt af NOW's dele — dommen ER lokal-kalenderbaseret
    ("lever dagen ud"), så begge dele er deterministiske i enhver TZ. */
const isoDaysAgo = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();

const localDateStr = (offsetDays: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Klokkeslæt på en dag relativt til NOW's dato (lokal tid). */
const atLocal = (offsetDays: number, hours: number, minutes = 0, seconds = 0) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays, hours, minutes, seconds);

describe("pickActiveWeekVideo — ugens video (samme dom, relative datoer)", () => {
  it("nyeste published vinder", () => {
    const items = [
      push({ title: "Ældre video", published_at: isoDaysAgo(6) }),
      push({ title: "Nyeste video", published_at: isoDaysAgo(2) }),
    ];
    expect(pickActiveWeekVideo(items, NOW)?.title).toBe("Nyeste video");
  });

  it("udløbet springes over til næstnyeste", () => {
    const items = [
      push({ title: "Udløbet i går", published_at: isoDaysAgo(2), metadata: { expires_at: localDateStr(-1) } }),
      push({ title: "Stadig aktiv", published_at: isoDaysAgo(6) }),
    ];
    expect(pickActiveWeekVideo(items, NOW)?.title).toBe("Stadig aktiv");
  });

  it("grænsetilfælde: udløber I DAG → aktiv dagen ud (sent på aftenen), væk lige efter midnat", () => {
    const items = [
      push({ title: "Dagens video", published_at: isoDaysAgo(2), metadata: { expires_at: localDateStr(0) } }),
    ];
    expect(pickActiveWeekVideo(items, atLocal(0, 23, 30))?.title).toBe("Dagens video");
    expect(pickActiveWeekVideo(items, atLocal(1, 0, 0, 1))).toBeUndefined();
  });

  it("manglende/ugyldig expires_at = aldrig udløb", () => {
    const items = [push({ title: "Uden udløb", published_at: isoDaysAgo(2), metadata: { expires_at: "snarest" } })];
    expect(pickActiveWeekVideo(items, NOW)?.title).toBe("Uden udløb");
  });

  it("tomt resultat: tom liste OG alle-udløbet → undefined", () => {
    expect(pickActiveWeekVideo([], NOW)).toBeUndefined();
    const allExpired = [
      push({ title: "A", published_at: isoDaysAgo(3), metadata: { expires_at: localDateStr(-2) } }),
      push({ title: "B", published_at: isoDaysAgo(5), metadata: { expires_at: localDateStr(-1) } }),
    ];
    expect(pickActiveWeekVideo(allExpired, NOW)).toBeUndefined();
  });

  it("wrapper-ækvivalens: push- og video-dommen ER kerne-dommen (ingen duplikeret logik)", () => {
    const items = [
      push({ title: "X", published_at: isoDaysAgo(1) }),
      push({ title: "Y", published_at: isoDaysAgo(4), metadata: { expires_at: localDateStr(-1) } }),
    ];
    expect(pickActiveWeekVideo(items, NOW)).toBe(pickActiveItem(items, NOW));
    expect(pickActivePush(items, NOW)).toBe(pickActiveItem(items, NOW));
  });
});
