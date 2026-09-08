import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerMilepael, sammenlignAktive, statusEfterFremgang } from "@/lib/milepaelDom";
// Paritetsimport — Deno-kopien er et spejl uden imports, så de to filer
// skal være ordret ens ud over filhovederne. vitest fejler højt hvis de driver.
import {
  afgoerMilepael as afgoerMilepaelDeno,
  sammenlignAktive as sammenlignAktiveDeno,
  statusEfterFremgang as statusEfterFremgangDeno,
} from "../../../supabase/functions/_shared/milepaelDom.ts";

const NU = [new Date(2026, 8, 9, 23, 59), new Date(2026, 8, 10, 12), new Date(2026, 8, 11, 0, 0), new Date(2026, 11, 31, 12)];
const RAEKKER = [
  { status: "active", progress: 0, deadline: "2026-09-10" },
  { status: "active", progress: 55, deadline: "2026-09-10" },
  { status: "active", progress: 100, deadline: "2026-09-10" },
  { status: "completed", progress: 20, deadline: "2026-09-10" },
  { status: "parked", progress: 20, deadline: "2026-09-10" },
  { status: "active", progress: 20, deadline: null },
  { status: "active", progress: null, deadline: new Date("2026-09-10") },
];

describe("milepaelDom — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("dommen er ens for alle rækker og alle «nu»", () => {
    for (const nu of NU) for (const r of RAEKKER) expect(afgoerMilepaelDeno(r, nu)).toEqual(afgoerMilepael(r, nu));
  });
  it("sorteringen og skrivereglen er ens", () => {
    for (const nu of NU) for (const a of RAEKKER) for (const b of RAEKKER) expect(sammenlignAktiveDeno(a, b, nu)).toBe(sammenlignAktive(a, b, nu));
    for (const p of [0, 50, 99, 100, 140]) expect(statusEfterFremgangDeno(p)).toBe(statusEfterFremgang(p));
  });
  it("kildekoden er ordret ens efter filhovedet (ingen imports at undtage)", () => {
    const krop = (sti: string) => {
      const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
      return kilde.slice(kilde.indexOf("*/") + 2);
    };
    expect(krop("supabase/functions/_shared/milepaelDom.ts")).toBe(krop("src/lib/milepaelDom.ts"));
  });
});
