import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as src from "@/lib/hjemmebane/progressState";
import * as deno from "../../../supabase/functions/_shared/progressState.ts";

/**
 * Paritet for F0-dommen (3/10-2026, run-company-agent v8): fladens
 * progressState.ts og edge-lagets spejl. Kroppen efter filhovedet er ORDRET
 * ens, og dommene svarer ens på samme input — agenten må aldrig dømme
 * «gennemført» anderledes end Akademiet.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
const SRC = "src/lib/hjemmebane/progressState.ts";
const DENO = "supabase/functions/_shared/progressState.ts";

describe("progressState.paritet — kildeteksten", () => {
  it("kroppen er byte-ens, og ingen af dem importerer noget", () => {
    const a = krop(laes(SRC)), b = krop(laes(DENO));
    expect(b).toBe(a);
    expect(a.length).toBeGreaterThan(3000);
    expect(a).not.toMatch(/^\s*import\s/m);
    expect(laes(SRC)).toContain(DENO);
    expect(laes(DENO)).toContain(SRC);
  });

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = krop(laes(SRC)).replace('if (tidsstempel === markeretAt) return true;', 'if (tidsstempel === markeretAt) return false;');
    expect(a).not.toBe(krop(laes(SRC)));
    expect(krop(laes(DENO))).not.toBe(a);
  });
});

describe("progressState.paritet — dommene svarer ens", () => {
  const T = "2026-08-05T10:00:00.000Z";
  const T_PG = "2026-08-05T10:00:00+00:00";
  const EGEN = "2026-09-01T08:00:00.000Z";
  const raekker = [
    undefined,
    {},
    { acknowledged_at: T, seen_at: T, markeret_at: T },
    { acknowledged_at: T_PG, seen_at: T, markeret_at: T },
    { acknowledged_at: EGEN, seen_at: T, markeret_at: T },
    { acknowledged_at: null, seen_at: EGEN, markeret_at: T },
    { skipped_at: EGEN, seen_at: T, markeret_at: T },
    { acknowledged_at: T, seen_at: T },
    { seen_at: "x", markeret_at: "x" },
    { acknowledged_at: T, markeret_at: null },
  ];

  it("itemProgressState, markeringsTilstand, egetSeenAt og fortrydMarkeringPatch", () => {
    for (const r of raekker) {
      expect(deno.itemProgressState(r)).toBe(src.itemProgressState(r));
      expect(deno.markeringsTilstand(r)).toBe(src.markeringsTilstand(r));
      expect(deno.egetSeenAt(r)).toBe(src.egetSeenAt(r));
      if (r) {
        expect(deno.fortrydMarkeringPatch(r)).toEqual(src.fortrydMarkeringPatch(r));
        expect(deno.medlemmetsSenesteStempel(r)).toBe(src.medlemmetsSenesteStempel(r));
      }
    }
  });

  it("erRaadgiverensStempel og egetStempel", () => {
    const par: [string | null | undefined, string | null | undefined][] = [
      [T, T], [T_PG, T], [EGEN, T], [null, T], [T, null], [undefined, undefined], ["x", "x"], ["x", "y"],
    ];
    for (const [a, b] of par) {
      expect(deno.erRaadgiverensStempel(a, b)).toBe(src.erRaadgiverensStempel(a, b));
      expect(deno.egetStempel(a, b)).toBe(src.egetStempel(a, b));
    }
  });
});
