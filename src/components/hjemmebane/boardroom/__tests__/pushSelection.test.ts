import { describe, expect, it } from "vitest";
import type { ContentItem } from "@/lib/hjemmebane/adminContentApi";
import { pickActivePush } from "../pushSelection";

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
