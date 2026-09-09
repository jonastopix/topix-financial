import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerIkkeIGang, ikkeIGangGrundlag, ikkeIGangTekst, skalSpringesOverIPaamindelse } from "@/lib/ikkeIGang";
// Paritetsimport — Deno-kopien er et spejl uden imports, så de to filer
// skal være ordret ens ud over filhovederne. vitest fejler højt hvis de driver.
import {
  afgoerIkkeIGang as afgoerIkkeIGangDeno,
  ikkeIGangGrundlag as ikkeIGangGrundlagDeno,
  ikkeIGangTekst as ikkeIGangTekstDeno,
  skalSpringesOverIPaamindelse as skalSpringesOverIPaamindelseDeno,
} from "../../../supabase/functions/_shared/ikkeIGang.ts";

const NU = new Date(2026, 8, 9, 9, 0);
const start = (d: number) => new Date(2026, 8, 9 - d, 14).toISOString();
const INPUTS = [0, 6, 7, 20, 21, 90, 91, 165].flatMap((d) =>
  [[false, 0], [false, 1], [true, 0], [true, 3]].map(([m, u]) => ({ medlemSiden: start(d), harMaaltRapport: m as boolean, antalUploads: u as number })),
).concat([{ medlemSiden: null, harMaaltRapport: false, antalUploads: 0 }]);

describe("ikkeIGang — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("dommen, ordene, grundlaget og påmindelsesreglen er ens for alle input", () => {
    for (const i of INPUTS) {
      const a = afgoerIkkeIGang(i, NU);
      const b = afgoerIkkeIGangDeno(i, NU);
      expect(b).toEqual(a);
      expect(ikkeIGangTekstDeno(b)).toBe(ikkeIGangTekst(a));
      expect(ikkeIGangGrundlagDeno(i, b)).toBe(ikkeIGangGrundlag(i, a));
      expect(skalSpringesOverIPaamindelseDeno(i, NU)).toEqual(skalSpringesOverIPaamindelse(i, NU));
    }
  });
  it("kildekoden er ordret ens efter filhovedet (ingen imports at undtage)", () => {
    const krop = (sti: string) => {
      const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
      return kilde.slice(kilde.indexOf("*/") + 2);
    };
    expect(krop("supabase/functions/_shared/ikkeIGang.ts")).toBe(krop("src/lib/ikkeIGang.ts"));
  });
});
