import { afterEach, describe, expect, it, vi } from "vitest";
import { lavSporer, nytVisningsId, VISNINGS_TRIN } from "@/lib/ansoegning/visning";

/** Klientens visnings-id og engangs-sporeren (udkast 28/9-2026). */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("nytVisningsId", () => {
  it("er et uuid v4 og nyt hver gang", () => {
    const a = nytVisningsId(), b = nytVisningsId();
    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });
  it("uden crypto.randomUUID bygges et v4 af getRandomValues", () => {
    vi.stubGlobal("crypto", { getRandomValues: (b: Uint8Array) => { b.fill(0xab); return b; } });
    expect(nytVisningsId()).toMatch(UUID_V4);
  });
  it("helt uden crypto bygges stadig et gyldigt v4", () => {
    vi.stubGlobal("crypto", undefined);
    expect(nytVisningsId()).toMatch(UUID_V4);
  });
});

describe("lavSporer", () => {
  it("sender hvert trin højst én gang", () => {
    const send = vi.fn();
    const spor = lavSporer(send);
    spor("vist"); spor("vist"); spor("start"); spor("tastet"); spor("start");
    expect(send.mock.calls.map((c) => c[0])).toEqual(["vist", "start", "tastet"]);
  });
  it("returnerer aldrig et løfte — der er intet at afvente", () => {
    const spor = lavSporer(() => Promise.resolve("svar"));
    expect(spor("vist")).toBeUndefined();
  });
  it("en send, der kaster, koster siden intet", () => {
    const spor = lavSporer(() => { throw new Error("net"); });
    expect(() => spor("vist")).not.toThrow();
  });
  it("en send, der afviser, giver ingen uhåndteret afvisning", async () => {
    const uhaandteret = vi.fn();
    process.on("unhandledRejection", uhaandteret);
    const spor = lavSporer(() => Promise.reject(new Error("500")));
    spor("start");
    await new Promise((r) => setTimeout(r, 10));
    process.off("unhandledRejection", uhaandteret);
    expect(uhaandteret).not.toHaveBeenCalled();
  });
  it("trinene er de tre", () => {
    expect([...VISNINGS_TRIN]).toEqual(["vist", "start", "tastet"]);
  });
});
