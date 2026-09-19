import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as web from "@/lib/webinarDom";
import * as deno from "../../../supabase/functions/_shared/webinarDom.ts";

// Paritet mellem src/lib/webinarDom.ts og _shared/webinarDom.ts
// (ansoegningMotor.paritet-mønstret): kildeteksten efter filhovedet er ordret
// ens, OG dommen giver samme svar. Driver de fra hinanden, fejler denne fil højt.

/** Kroppen: alt efter det første blokkommentar-filhoved. */
function krop(kilde: string): string {
  const slut = kilde.indexOf("*/");
  return slut === -1 ? kilde : kilde.slice(slut + 2);
}

describe("webinarDom.paritet", () => {
  it("kildeteksten er ordret ens efter filhovedet", () => {
    const a = krop(readFileSync(resolve(process.cwd(), "src/lib/webinarDom.ts"), "utf8"));
    const b = krop(readFileSync(resolve(process.cwd(), "supabase/functions/_shared/webinarDom.ts"), "utf8"));
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(500);
  });

  it("dommen svarer ens", () => {
    const nu = new Date("2026-09-19T12:00:00Z");
    const t = { set_procent: 74.99, state: "Watched", session_tid: "2026-09-22T17:00:00Z" };
    expect(web.doemSetGrad(t, nu)).toBe("delvist");
    expect(deno.doemSetGrad(t, nu)).toBe(web.doemSetGrad(t, nu));
    expect(deno.SET_GRAENSE_PROCENT).toBe(web.SET_GRAENSE_PROCENT);
    expect(deno.somProcent("62 %")).toBe(web.somProcent("62 %"));
  });
});
