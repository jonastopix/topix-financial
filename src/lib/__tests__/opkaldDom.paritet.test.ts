import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as src from "@/lib/opkald/dom";
import * as deno from "../../../supabase/functions/_shared/opkaldDom.ts";

/**
 * Paritet for «Må vi ringe til dig?»-dommen (2/10-2026), samme form som
 * webinarMailLoft.paritet: kroppen efter filhovedet er ORDRET ens, og dommen
 * svarer ens på samme input.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
const SRC = "src/lib/opkald/dom.ts";
const DENO = "supabase/functions/_shared/opkaldDom.ts";

describe("opkaldDom.paritet — kildeteksten", () => {
  it("kroppen er byte-ens, og ingen af dem importerer noget", () => {
    const a = krop(laes(SRC)), b = krop(laes(DENO));
    expect(b).toBe(a);
    expect(a.length).toBeGreaterThan(2000);
    expect(a).not.toMatch(/^\s*import\s/m);
    expect(laes(SRC)).toContain(DENO);
    expect(laes(DENO)).toContain(SRC);
  });

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = krop(laes(SRC)).replace("export const OPBEVARING_DAGE = 90;", "export const OPBEVARING_DAGE = 180;");
    expect(a).not.toBe(krop(laes(SRC)));
    expect(krop(laes(DENO))).not.toBe(a);
  });
});

describe("opkaldDom.paritet — dommen svarer ens", () => {
  it("konstanterne", () => {
    expect(deno.SAMTYKKE_ORDLYD).toBe(src.SAMTYKKE_ORDLYD);
    expect(deno.OPBEVARING_DAGE).toBe(src.OPBEVARING_DAGE);
    expect(deno.KLOKKE_TYPE).toBe(src.KLOKKE_TYPE);
    expect([...deno.KENDTE_FELTER]).toEqual([...src.KENDTE_FELTER]);
    expect([...deno.DELTOG_GRADER]).toEqual([...src.DELTOG_GRADER]);
  });

  it("normaliserTelefon og doemAnmodning på de samme input", () => {
    const numre = ["20123456", "+45 12 34 56 78", "0045 22334455", "4522334455", "02345678", "1234567", "", null, 12345678, "+46 70 123 45 67"];
    for (const n of numre) expect(deno.normaliserTelefon(n)).toBe(src.normaliserTelefon(n));
    const bodies = [
      { navn: "Mette Hansen", telefon: "20123456", samtykke: { kryds: true, ordlyd: src.SAMTYKKE_ORDLYD } },
      { navn: "", telefon: "20123456", samtykke: { kryds: true, ordlyd: src.SAMTYKKE_ORDLYD } },
      { navn: "M", telefon: "1", samtykke: { kryds: true, ordlyd: src.SAMTYKKE_ORDLYD } },
      { navn: "M", telefon: "20123456", samtykke: { kryds: false, ordlyd: src.SAMTYKKE_ORDLYD } },
      { navn: "M", telefon: "20123456", samtykke: { kryds: true, ordlyd: "noget andet" } },
      { navn: "M", telefon: "20123456", samtykke: true },
    ];
    for (const b of bodies) expect(deno.doemAnmodning(b as Record<string, unknown>)).toEqual(src.doemAnmodning(b as Record<string, unknown>));
    for (const g of ["set", "delvist", "moedte_ikke", "tilmeldt", "ukendt", null]) expect(deno.harDeltaget(g)).toBe(src.harDeltaget(g));
    for (const [a, b] of [[0, 0], [10, 0], [0, 200], [null, 0], [3, null]] as const) expect(deno.loftetNaaet(a, b)).toBe(src.loftetNaaet(a, b));
    expect(deno.klokkeTitel("Mette Hansen", "2026-09-22T07:00:00.000Z")).toBe(src.klokkeTitel("Mette Hansen", "2026-09-22T07:00:00.000Z"));
    const nu = new Date("2026-10-22T09:00:00.000Z");
    for (const st of ["2026-09-22T09:00:00.000Z", "2026-09-22T08:59:59.999Z", null, "x"]) expect(deno.tokenUdloebet(st, nu)).toBe(src.tokenUdloebet(st, nu));
    for (const st of ["2026-10-22T08:50:00.000Z", "2026-10-22T08:55:00.000Z", null, "x"]) expect(deno.forSnartIgen(st, nu)).toBe(src.forSnartIgen(st, nu));
    for (const f of [null, { ringet_at: null, sidst_indsendt_at: "2026-10-22T08:00:00.000Z" }, { ringet_at: "2026-10-21T08:00:00.000Z", sidst_indsendt_at: "2026-10-22T08:00:00.000Z" }, { ringet_at: null, sidst_indsendt_at: "2026-10-22T08:59:00.000Z" }]) {
      expect(deno.indsendVej(f, nu)).toBe(src.indsendVej(f, nu));
    }
  });
});
