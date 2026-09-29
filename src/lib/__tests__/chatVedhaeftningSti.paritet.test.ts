import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as src from "@/lib/chatVedhaeftningSti";
import * as deno from "../../../supabase/functions/_shared/chatVedhaeftningSti.ts";

/** Paritet (29/9-2026): kroppen efter filhovedet er byte-ens, og dommene svarer ens. */
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
const SRC = "src/lib/chatVedhaeftningSti.ts";
const DENO = "supabase/functions/_shared/chatVedhaeftningSti.ts";

describe("chatVedhaeftningSti.paritet", () => {
  it("kroppen er byte-ens, og ingen af dem importerer noget", () => {
    const a = krop(laes(SRC)), b = krop(laes(DENO));
    expect(b).toBe(a);
    expect(a).not.toMatch(/^\s*import\s/m);
    expect(laes(SRC)).toContain(DENO);
    expect(laes(DENO)).toContain(SRC);
  });

  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = krop(laes(SRC)).split("if (dele.length < 2) return false;").join("if (dele.length < 1) return false;");
    expect(a).not.toBe(krop(laes(SRC)));
    expect(krop(laes(DENO))).not.toBe(a);
  });

  it("dommene svarer ens på de samme input", () => {
    const A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301", B = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
    for (const sti of [`${A}/1-a.pdf`, `${B}/1-a.pdf`, `${A}/../x`, `/${A}/x`, `${A}//x`, "", `${A}`]) {
      for (const afsender of [A, B, "x", null]) expect(deno.stiTilhoererAfsender(sti, afsender)).toBe(src.stiTilhoererAfsender(sti, afsender));
    }
    for (const att of [{ path: `${A}/x` }, { url: `https://h${src.OFFENTLIG_URL_MARKOER}${A}/x` }, { url: "https://h/x" }, null]) {
      expect(deno.vedhaeftningsSti(att)).toEqual(src.vedhaeftningsSti(att));
    }
  });
});
