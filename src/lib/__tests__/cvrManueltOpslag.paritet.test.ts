import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as src from "@/lib/ansoegninger/cvrManueltOpslag";
import * as deno from "../../../supabase/functions/_shared/cvrManueltOpslag.ts";

/**
 * Paritet for dommen bag «Slå op i CVR» (22/9-2026). Fladen afgør, om knappen
 * vises (kanSlaaOp); functionen afgør, om den skriver (maaSkrives). To steder,
 * én regel — så kroppen efter filhovedet skal være ORDRET ens, og svarene ens.
 * Nul imports i begge, så der er ingen stier at oversætte.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
const SRC = "src/lib/ansoegninger/cvrManueltOpslag.ts";
const DENO = "supabase/functions/_shared/cvrManueltOpslag.ts";

describe("cvrManueltOpslag.paritet — kildeteksten", () => {
  it("kroppen er byte-ens, og ingen af dem importerer noget", () => {
    const a = krop(laes(SRC)), b = krop(laes(DENO));
    expect(b).toBe(a);
    expect(a.length).toBeGreaterThan(1500);
    expect(a).not.toMatch(/^\s*import\s/m);
    // Hver fil peger på den anden, så den næste læser finder spejlet.
    expect(laes(SRC)).toContain(DENO);
    expect(laes(DENO)).toContain(SRC);
  });

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = krop(laes(SRC)).replace('return harOpslag ? "Opdatér fra CVR" : "Slå op i CVR";', 'return "Slå op";');
    expect(a).not.toBe(krop(laes(SRC)));
    expect(krop(laes(DENO))).not.toBe(a);
  });
});

describe("cvrManueltOpslag.paritet — dommene svarer ens", () => {
  it("kanSlaaOp, maaSkrives, opslagsBesked og knapTekst", () => {
    for (const d of ["43327720", "31875161", "4332772012", "", "abc", null, undefined]) {
      expect(deno.kanSlaaOp(d)).toBe(src.kanSlaaOp(d));
    }
    for (const u of ["fundet", "findes_ikke", "utilgaengelig", "dagsloft", "intet_cvr", "ukendt_ansoegning"] as const) {
      for (const harVisning of [true, false]) expect(deno.maaSkrives(u, harVisning)).toBe(src.maaSkrives(u, harVisning));
      expect(deno.opslagsBesked(u)).toBe(src.opslagsBesked(u));
      expect(deno.opslagsBesked(u, "ABC hundeudstyr ApS")).toBe(src.opslagsBesked(u, "ABC hundeudstyr ApS"));
    }
    expect(deno.knapTekst(true)).toBe(src.knapTekst(true));
    expect(deno.knapTekst(false)).toBe(src.knapTekst(false));
  });
});
