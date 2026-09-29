import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as src from "@/lib/webinar/mailLoft";
import * as deno from "../../../supabase/functions/_shared/webinarMailLoft.ts";

/**
 * Paritet for kørselsloftet (29/9-2026), samme form som webinarMailDom.paritet:
 * kroppen efter filhovedet er ORDRET ens, og dommen svarer ens på samme input.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
const SRC = "src/lib/webinar/mailLoft.ts";
const DENO = "supabase/functions/_shared/webinarMailLoft.ts";
const NU = new Date("2026-09-29T08:09:00Z");

describe("webinarMailLoft.paritet — kildeteksten", () => {
  it("kroppen er byte-ens, og ingen af dem importerer noget", () => {
    const a = krop(laes(SRC)), b = krop(laes(DENO));
    expect(b).toBe(a);
    expect(a.length).toBeGreaterThan(2000);
    expect(a).not.toMatch(/^\s*import\s/m);
    expect(laes(SRC)).toContain(DENO);
    expect(laes(DENO)).toContain(SRC);
  });

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = krop(laes(SRC)).replace("export const MAILGUN_LOFT_PR_TIME = 90;", "export const MAILGUN_LOFT_PR_TIME = 900;");
    expect(a).not.toBe(krop(laes(SRC)));
    expect(krop(laes(DENO))).not.toBe(a);
  });
});

describe("webinarMailLoft.paritet — dommen svarer ens", () => {
  it("konstanterne", () => {
    expect(deno.MAILGUN_LOFT_PR_TIME).toBe(src.MAILGUN_LOFT_PR_TIME);
    expect(deno.LOFT_VINDUE_MS).toBe(src.LOFT_VINDUE_MS);
    expect(deno.LOFT_PAUSE_MS).toBe(src.LOFT_PAUSE_MS);
    expect([...deno.STOP_STATUSSER]).toEqual([...src.STOP_STATUSSER]);
  });

  it("beregnKoerselsLoft på tomt spor, fyldt spor, og med hvert stop", () => {
    const r = (min: number, status: number | null) => ({ forsoegt_at: new Date(NU.getTime() - min * 60_000).toISOString(), udfald: "x", status });
    const sæt = [
      [],
      Array.from({ length: 95 }, (_, i) => r(i % 59, 200)),
      [r(10, 403)],
      [r(10, 420), r(5, 429), r(70, 403)],
      [r(61, 429)],
      [{ forsoegt_at: "ikke en tid", udfald: "ok", status: 200 }],
    ];
    for (const seneste of sæt) {
      for (const loft of [90, 0, Number.NaN]) {
        expect(deno.beregnKoerselsLoft({ seneste, loft, nu: NU })).toEqual(src.beregnKoerselsLoft({ seneste, loft, nu: NU }));
      }
    }
    for (const s of [403, 420, 429, 200, null]) expect(deno.erStopStatus(s)).toBe(src.erStopStatus(s));
  });
});
