import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as src from "@/lib/venterPaaVelkomst";
// Paritetsimport — Deno-kopien er et spejl uden imports (2/10-2026, dag-1-klokken),
// så de to filer skal være ordret ens ud over filhovederne.
import * as deno from "../../../supabase/functions/_shared/venterPaaVelkomst.ts";

const SRC = "src/lib/venterPaaVelkomst.ts";
const DENO = "supabase/functions/_shared/venterPaaVelkomst.ts";
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);

const NU = new Date(2026, 8, 9, 10, 0);
const dageFoer = (n: number, t = 14) => new Date(2026, 8, 9 - n, t, 30).toISOString();
const STEMPLER = [null, undefined, "ikke en dato", dageFoer(0), dageFoer(5)];
const STARTER = [null, undefined, "hest", dageFoer(0, 9), dageFoer(1), dageFoer(3), dageFoer(7), dageFoer(8), dageFoer(165)];

describe("venterPaaVelkomst — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("kildekoden er ordret ens efter filhovedet (ingen imports at undtage)", () => {
    expect(krop(laes(DENO))).toBe(krop(laes(SRC)));
    expect(krop(laes(SRC)).length).toBeGreaterThan(1500);
    expect(laes(SRC)).toContain(DENO);
    expect(laes(DENO)).toContain(SRC);
    expect(laes(DENO)).not.toMatch(/^import /m);
  });

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = krop(laes(SRC)).replace("export const VELKOMST_FRA_DAGE = 1;", "export const VELKOMST_FRA_DAGE = 2;");
    expect(a).not.toBe(krop(laes(SRC)));
    expect(krop(laes(DENO))).not.toBe(a);
  });

  it("dommen, ordene og grundlaget er ens for alle input", () => {
    for (const medlemSiden of STARTER) {
      for (const sidsteRaadgiverBeskedAt of STEMPLER) {
        const i = { medlemSiden, sidsteRaadgiverBeskedAt };
        const a = src.afgoerVenterPaaVelkomst(i, NU);
        expect(deno.afgoerVenterPaaVelkomst(i, NU)).toEqual(a);
        expect(deno.venterPaaVelkomstTekst(a)).toBe(src.venterPaaVelkomstTekst(a));
        expect(deno.venterPaaVelkomstGrundlag(i)).toBe(src.venterPaaVelkomstGrundlag(i));
      }
    }
    for (const dage of [null, 0, 1, 2, 7, 8, 165]) {
      for (const sidsteRaadgiverBeskedAt of STEMPLER) {
        expect(deno.doemVenterPaaVelkomst({ sidsteRaadgiverBeskedAt }, dage)).toEqual(src.doemVenterPaaVelkomst({ sidsteRaadgiverBeskedAt }, dage));
      }
    }
  });

  it("afgoerVenterPaaVelkomst er doemVenterPaaVelkomst med læserens kalender — omskrivningen 2/10 ændrede intet", () => {
    for (const medlemSiden of STARTER) {
      for (const sidsteRaadgiverBeskedAt of STEMPLER) {
        expect(src.afgoerVenterPaaVelkomst({ medlemSiden, sidsteRaadgiverBeskedAt }, NU))
          .toEqual(src.doemVenterPaaVelkomst({ sidsteRaadgiverBeskedAt }, src.kalenderdageSiden(medlemSiden, NU)));
      }
    }
  });
});
