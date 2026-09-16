import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as web from "@/lib/hjemmebane/maal";
import * as deno from "../../../supabase/functions/_shared/maal.ts";

// Paritet (fase 1, 16/9): src/lib/hjemmebane/maal.ts er et spejl af
// _shared/maal.ts — begge uden imports, så kildeteksten efter filhovedet
// skal være ordret ens, og funktionerne skal svare ens for de samme input
// (maanedsnoegle-mønstret, som skridtForslag i 0a). Driver de, fejler vitest højt.

const STATUSSER = ["proposed", "active", "done", "not_done", "dropped", "dismissed", "expired", "open", "parked"];
const SKRIDTSAET: { status: string }[][] = [[]];
for (const a of STATUSSER) {
  SKRIDTSAET.push([{ status: a }]);
  for (const b of STATUSSER) SKRIDTSAET.push([{ status: a }, { status: b }, { status: "done" }]);
}
const NUVAERENDE = [null, undefined, Number.NaN, -3, 0, 12.5, 40, 99.5, 100, 140];
const MAAL = [
  { id: "a", status: "active", category: "salg", created_at: "2026-09-01T00:00:00Z" },
  { id: "b", status: "active", category: null, created_at: "2026-08-01T00:00:00Z" },
  { id: "c", status: "parked", category: "salg", created_at: "2026-07-01T00:00:00Z" },
  { id: "d", status: "completed", category: "økonomi", created_at: "2026-06-01T00:00:00Z" },
  { id: "e", status: "active", category: " Økonomi ", created_at: "2026-09-02T00:00:00Z" },
];
const OENSKER = [undefined, {}, { maalId: "a" }, { maalId: "c" }, { maalId: "x", kategori: "salg" }, { kategori: "økonomi" }, { kategori: "hr" }, { maalId: null, kategori: null }];

describe("maal — paritet mellem src/lib/hjemmebane og supabase/functions/_shared", () => {
  it("konstanterne og funktionerne svarer ens", () => {
    expect(web.MAX_AKTIVE_MAAL).toBe(deno.MAX_AKTIVE_MAAL);
    expect([...web.TAELLENDE_SKRIDT]).toEqual([...deno.TAELLENDE_SKRIDT]);
    for (const skridt of SKRIDTSAET) for (const n of NUVAERENDE) expect(web.maalFremdrift(skridt, n)).toBe(deno.maalFremdrift(skridt, n));
    for (const n of [-1, 0, 1, 2, 3, 4, 17, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(web.kanOpretteMaal(n)).toBe(deno.kanOpretteMaal(n));
      expect(web.gennemgangVenter(n)).toBe(deno.gennemgangVenter(n));
      expect(web.maaForeslaaMod(n)).toEqual(deno.maaForeslaaMod(n));
    }
    for (const o of OENSKER) {
      expect(web.vaelgMaalForForslag(MAAL, o)).toBe(deno.vaelgMaalForForslag(MAAL, o));
      expect(web.vaelgMaalForForslag([], o)).toBe(deno.vaelgMaalForForslag([], o));
    }
  });
  it("kildekoden er ordret ens efter filhovedet (ingen imports at undtage)", () => {
    const krop = (sti: string) => {
      const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
      return kilde.slice(kilde.indexOf("*/") + 2);
    };
    const a = krop("supabase/functions/_shared/maal.ts");
    const b = krop("src/lib/hjemmebane/maal.ts");
    expect(a).toBe(b);
    expect(a.match(/^import /gm) ?? []).toHaveLength(0);
  });
});
