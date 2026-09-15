import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as web from "@/lib/maanedsnoegle";
import * as deno from "../../../supabase/functions/_shared/maanedsnoegle.ts";

// Paritet (16/9, instruks F): src/lib/maanedsnoegle.ts er et spejl af
// _shared/maanedsnoegle.ts — begge uden imports, så kildeteksten efter
// filhovedet skal være ordret ens, og funktionerne skal svare ens for de
// samme input. Driver de, fejler vitest højt.

const TIDER = [
  "2026-09-22T10:00:00Z", "2026-09-30T21:59:59Z", "2026-09-30T22:00:00Z", "2026-09-30T22:30:00Z",
  "2026-10-01T07:15:00Z", "2026-12-31T22:59:59Z", "2026-12-31T23:00:00Z", "2027-01-05T07:15:00Z",
  "2026-03-28T23:30:00Z", "2026-10-25T00:30:00Z",
].map((s) => new Date(s));
const NOEGLER = ["2026-01", "2026-06", "2026-09", "2026-12", "2027-01", "2027-02", "2026-13", "nej"];

describe("maanedsnoegle — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("konstanterne og funktionerne svarer ens", () => {
    expect(web.TZ).toBe(deno.TZ);
    expect(web.AFSLUTTEDE_MAANEDER_ANTAL).toBe(deno.AFSLUTTEDE_MAANEDER_ANTAL);
    expect([...web.MAANEDSNAVNE]).toEqual([...deno.MAANEDSNAVNE]);
    for (const nu of TIDER) {
      expect(web.maanedsNoegleKbh(nu)).toBe(deno.maanedsNoegleKbh(nu));
      expect(web.senesteAfsluttedeMaaneder(nu)).toEqual(deno.senesteAfsluttedeMaaneder(nu));
      expect(web.afsluttedeMaanederTekst(nu)).toBe(deno.afsluttedeMaanederTekst(nu));
      for (const k of NOEGLER) expect(web.erMaanedAfsluttet(k, nu)).toBe(deno.erMaanedAfsluttet(k, nu));
    }
    for (const k of NOEGLER) {
      expect(web.afsluttedeMaanederFoer(k)).toEqual(deno.afsluttedeMaanederFoer(k));
      expect(web.afsluttedeMaanederTekstFoer(k)).toBe(deno.afsluttedeMaanederTekstFoer(k));
      expect(web.maanedsnavn(k)).toBe(deno.maanedsnavn(k));
    }
    expect(web.maanedsliste(["2026-06", "2026-07", "2026-08"])).toBe(deno.maanedsliste(["2026-06", "2026-07", "2026-08"]));
  });
  it("kildekoden er ordret ens efter filhovedet (ingen imports at undtage)", () => {
    const krop = (sti: string) => {
      const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
      return kilde.slice(kilde.indexOf("*/") + 2);
    };
    const a = krop("supabase/functions/_shared/maanedsnoegle.ts");
    const b = krop("src/lib/maanedsnoegle.ts");
    expect(a).toBe(b);
    expect(a.match(/^import /gm) ?? []).toHaveLength(0);
  });
});
