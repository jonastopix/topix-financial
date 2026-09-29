import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as src from "@/lib/chatVideo";
import * as deno from "../../../supabase/functions/_shared/chatVideo.ts";

/**
 * Paritet for chatvideoens dom (29/9-2026), samme form som webinarMailLoft.paritet:
 * kroppen efter filhovedet er ORDRET ens, og dommen svarer ens på samme input.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
const SRC = "src/lib/chatVideo.ts";
const DENO = "supabase/functions/_shared/chatVideo.ts";

describe("chatVideo.paritet — kildeteksten", () => {
  it("kroppen er byte-ens, og ingen af dem importerer noget", () => {
    const a = krop(laes(SRC)), b = krop(laes(DENO));
    expect(b).toBe(a);
    expect(a.length).toBeGreaterThan(2000);
    expect(a).not.toMatch(/^\s*import\s/m);
    expect(laes(SRC)).toContain(DENO);
    expect(laes(DENO)).toContain(SRC);
  });

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = krop(laes(SRC)).replace("export const MAKS_SEKUNDER = 180;", "export const MAKS_SEKUNDER = 1800;");
    expect(a).not.toBe(krop(laes(SRC)));
    expect(krop(laes(DENO))).not.toBe(a);
  });
});

describe("chatVideo.paritet — dommen svarer ens", () => {
  const GUID = "657bb740-a71b-4529-a012-528021c31a92";

  it("konstanterne", () => {
    expect(deno.MAKS_SEKUNDER).toBe(src.MAKS_SEKUNDER);
    expect(deno.BUNNY_VIDEO_STATUS).toEqual(src.BUNNY_VIDEO_STATUS);
  });

  it("laesChatVideo, videoStatus, erAfspillelig, iChatBibliotek og maaSlette på samme input", () => {
    for (const meta of [null, {}, { video: { guid: GUID } }, { video: { guid: "x" } }, { video: { guid: GUID.toUpperCase() } }]) {
      expect(deno.laesChatVideo(meta)).toEqual(src.laesChatVideo(meta));
    }
    for (const status of [0, 1, 2, 3, 4, 5, 6, 7, 8, 99, undefined]) {
      for (const availableResolutions of ["", "360p", " , ", null]) {
        for (const afspilData of [undefined, null, {}, { isPlayable: true }, { isPlayable: false }, { isPlayable: "true" }]) {
          const v = { status, availableResolutions };
          expect(deno.videoStatus(v, afspilData)).toBe(src.videoStatus(v, afspilData));
          expect(deno.erAfspillelig(afspilData)).toBe(src.erAfspillelig(afspilData));
        }
      }
    }
    for (const [v, c] of [[{ videoLibraryId: 765771 }, "765771"], [{ videoLibraryId: 765771 }, 765771], [{ videoLibraryId: 720547 }, "765771"], [{ videoLibraryId: "765771" }, "765771"], [{}, "765771"], [null, "765771"], [{ videoLibraryId: 765771 }, ""], [{ videoLibraryId: 765771 }, null]] as const) {
      expect(deno.iChatBibliotek(v, c)).toBe(src.iChatBibliotek(v, c));
    }
    for (const i of [
      { callerId: "a", senderId: "a", erAdmin: false },
      { callerId: "a", senderId: "b", erAdmin: false },
      { callerId: "a", senderId: "b", erAdmin: true },
      { callerId: "", senderId: "", erAdmin: false },
    ]) {
      expect(deno.maaSlette(i)).toBe(src.maaSlette(i));
    }
  });
});
