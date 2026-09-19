import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Paritet (19/9-2026): src/lib/metaAnnoncer.ts og
// supabase/functions/_shared/metaAnnoncer.ts skal være ORDRET ens efter
// filhovedet. Samme mønster som betalingsfristParitet.test.ts: motoren bor ét
// sted i to kopier, fordi Vite og Deno ikke kan dele en fil — og så skal en
// ændring i den ene fanges, ikke opdages en måned senere i drift.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
// Alt efter filhovedets afslutning — hovedet er den eneste tilladte forskel.
const krop = (kilde: string) => kilde.slice(kilde.indexOf("*/") + 2);

const SRC = "src/lib/metaAnnoncer.ts";
const SHARED = "supabase/functions/_shared/metaAnnoncer.ts";

describe("metaAnnoncer — spejlene er ens", () => {
  it("kroppene er byte for byte identiske", () => {
    expect(krop(laes(SHARED))).toBe(krop(laes(SRC)));
  });

  it("filhovederne peger på hinanden, så ingen retter kun det ene sted", () => {
    expect(laes(SRC)).toContain("supabase/functions/_shared/metaAnnoncer.ts");
    expect(laes(SHARED)).toContain("src/lib/metaAnnoncer.ts");
  });

  it("begge har NUL imports — ellers kan Deno eller Vitest ikke loade dem", () => {
    for (const sti of [SRC, SHARED]) {
      expect(krop(laes(sti))).not.toMatch(/^\s*import\s/m);
    }
  });

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const aendret = krop(laes(SRC)).replace('export const GRAPH_VERSION = "v26.0";', 'export const GRAPH_VERSION = "v27.0";');
    expect(aendret).not.toBe(krop(laes(SRC)));
    expect(krop(laes(SHARED))).not.toBe(aendret);
  });
});
