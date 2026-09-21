import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Spejlet skal være byte-ens (webinarDom.paritet-mønstret): én regel, to steder. */
describe("eventSvar — spejlet i src/lib er ordret", () => {
  it("supabase/functions/_shared/eventSvar.ts === src/lib/hjemmebane/eventSvar.ts", () => {
    const a = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/eventSvar.ts"), "utf8");
    const b = readFileSync(resolve(process.cwd(), "src/lib/hjemmebane/eventSvar.ts"), "utf8");
    expect(b).toBe(a);
  });
});
