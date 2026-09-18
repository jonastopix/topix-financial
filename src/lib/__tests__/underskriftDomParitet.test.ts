import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as web from "@/lib/underskriftDom";
import * as deno from "../../../supabase/functions/_shared/underskriftDom.ts";

// Paritet mellem src/lib/underskriftDom.ts og supabase/functions/_shared/
// underskriftDom.ts (omkostningsnoeglerParitet-mønstret): kroppen er byte-ens
// efter filhovedet, og de to moduler dømmer ens på de samme input.

const krop = (sti: string) => {
  const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
  return kilde.slice(kilde.indexOf("*/") + 2);
};

describe("underskriftDom — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("kroppen er ordret ens efter filhovedet, og ingen af dem importerer noget", () => {
    const a = krop("src/lib/underskriftDom.ts");
    const b = krop("supabase/functions/_shared/underskriftDom.ts");
    expect(a).toBe(b);
    expect(a.match(/^import /gm) ?? []).toHaveLength(0);
  });

  it("konstanterne er ens", () => {
    expect(deno.KODE_CIFRE).toBe(web.KODE_CIFRE);
    expect(deno.KODE_GYLDIG_MINUTTER).toBe(web.KODE_GYLDIG_MINUTTER);
    expect(deno.KODE_MAX_FORSOEG).toBe(web.KODE_MAX_FORSOEG);
    expect(deno.LINK_GYLDIG_DAGE).toBe(web.LINK_GYLDIG_DAGE);
  });

  it("dommene svarer ens på en tabel af input", () => {
    const NU = new Date("2026-09-18T12:00:00.000Z");
    const sendt = [0, 1, 20, 21, 22, 400].map((d) => new Date(NU.getTime() - d * 86_400_000).toISOString());
    for (const s of sendt) {
      for (const status of ["sendt", "underskrevet", "annulleret"] as const) {
        const input = { status, sendt_at: s, underskrevet_at: status === "underskrevet" ? s : null };
        expect(deno.afgoerAftaletilstand(input, NU)).toEqual(web.afgoerAftaletilstand(input, NU));
      }
    }
    for (const forsoeg of [0, 1, 4, 5, 6]) {
      for (const min of [0, 14, 15, 16]) {
        for (const matcher of [true, false]) {
          const k = { oprettet_at: new Date(NU.getTime() - min * 60_000).toISOString(), forsoeg, brugt_at: null, erstattet_at: null };
          expect(deno.afgoerIndtastning(k, matcher, NU)).toEqual(web.afgoerIndtastning(k, matcher, NU));
        }
      }
    }
    for (const navn of ["", "A", "Åse Ørum", "123", "x".repeat(121)]) {
      expect(deno.afgoerNavn(navn)).toEqual(web.afgoerNavn(navn));
    }
    expect(deno.kanoniskTekst(" a \r\n b \n")).toBe(web.kanoniskTekst(" a \r\n b \n"));
  });
});
