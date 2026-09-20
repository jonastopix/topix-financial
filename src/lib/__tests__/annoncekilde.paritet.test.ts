import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as web from "@/lib/webinar/annoncekilde";
import * as deno from "../../../supabase/functions/_shared/annoncekilde.ts";

// Paritet mellem src/lib/webinar/annoncekilde.ts og _shared/annoncekilde.ts
// (webinarDom.paritet-mønstret): kildeteksten efter filhovedet er ordret ens,
// OG dommen giver samme svar. Driver de fra hinanden, fejler denne fil højt.

/** Kroppen: alt efter det første blokkommentar-filhoved. */
function krop(kilde: string): string {
  const slut = kilde.indexOf("*/");
  return slut === -1 ? kilde : kilde.slice(slut + 2);
}

describe("annoncekilde.paritet", () => {
  it("kildeteksten er ordret ens efter filhovedet", () => {
    const a = krop(readFileSync(resolve(process.cwd(), "src/lib/webinar/annoncekilde.ts"), "utf8"));
    const b = krop(readFileSync(resolve(process.cwd(), "supabase/functions/_shared/annoncekilde.ts"), "utf8"));
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(500);
  });

  it("dommen svarer ens", () => {
    for (const v of ["fb", "facebook", "ig", "th", "an", "msg", "FB", "podcast-x", "  ", null, undefined]) {
      expect(deno.kildeNavn(v)).toBe(web.kildeNavn(v));
    }
    expect(deno.kildeErKendt("th")).toBe(web.kildeErKendt("th"));
    expect(Object.keys(deno.KILDE_NAVNE)).toEqual(Object.keys(web.KILDE_NAVNE));
  });
});
