import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { erAftryk, formaterAftryk, kodeHash, sha256Hex } from "@/lib/aftryk";
import * as deno from "../../../supabase/functions/_shared/aftryk.ts";

// Aftrykket (Jonas 18/9, punkt 1): SHA-256 hex over UTF-8. Kendte vektorer,
// så en ombygning af hashen aldrig går ubemærket — og paritet med Deno-spejlet.

describe("sha256Hex", () => {
  it("kendte vektorer: tom streng og «abc»", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("UTF-8: æøå giver et andet aftryk end ae oe aa, og bytes = streng", async () => {
    expect(await sha256Hex("æøå")).not.toBe(await sha256Hex("aeoeaa"));
    expect(await sha256Hex(new TextEncoder().encode("æøå"))).toBe(await sha256Hex("æøå"));
  });
  it("erAftryk kræver 64 små hex-tegn; formaterAftryk grupperer i fire", async () => {
    const h = await sha256Hex("abc");
    expect(erAftryk(h)).toBe(true);
    expect(erAftryk(h.toUpperCase())).toBe(false);
    expect(erAftryk(h.slice(1))).toBe(false);
    expect(formaterAftryk("ba7816bf8f01")).toBe("ba78 16bf 8f01");
  });
  it("kodeHash saltes med aftalens id — samme kode, to aftaler, to hashes", async () => {
    expect(await kodeHash("a", "123456")).not.toBe(await kodeHash("b", "123456"));
    expect(await kodeHash("a", "123456")).toBe(await sha256Hex("a:123456"));
  });
});

describe("aftryk — paritet mellem src/lib og supabase/functions/_shared", () => {
  const krop = (sti: string) => {
    const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
    return kilde.slice(kilde.indexOf("*/") + 2);
  };
  it("kroppen er ordret ens efter filhovedet, ingen imports", () => {
    const a = krop("src/lib/aftryk.ts");
    expect(a).toBe(krop("supabase/functions/_shared/aftryk.ts"));
    expect(a.match(/^import /gm) ?? []).toHaveLength(0);
  });
  it("samme aftryk", async () => {
    expect(await deno.sha256Hex("The Boardroom")).toBe(await sha256Hex("The Boardroom"));
  });
});
