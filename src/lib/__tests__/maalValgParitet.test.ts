import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { forslagMaalDom, kraeverMaalValg, MAAL_KRAEVES_GRUND } from "@/lib/maalValg";
// Paritetsimport — Deno-kopien er et spejl uden imports.
import {
  forslagMaalDom as forslagMaalDomDeno,
  kraeverMaalValg as kraeverMaalValgDeno,
  MAAL_KRAEVES_GRUND as MAAL_KRAEVES_GRUND_DENO,
} from "../../../supabase/functions/_shared/maalValg.ts";

const M = [{ id: "a" }, { id: "b" }];

describe("maalValg — «Foreslå skridt» kræver et mål, når der er aktive mål (1/10-2026)", () => {
  it("kraeverMaalValg: kun når listen ikke er tom", () => {
    expect(kraeverMaalValg([])).toBe(false);
    expect(kraeverMaalValg([{ id: "a" }])).toBe(true);
  });

  it("uden aktive mål sendes forslaget uden mål", () => {
    expect(forslagMaalDom("klar", [], null)).toEqual({ kanSendes: true, maalId: null });
  });

  it("med aktive mål: intet valg = kan ikke sendes; et valgt aktivt mål = sendes med det", () => {
    expect(forslagMaalDom("klar", M, null)).toEqual({ kanSendes: false, grund: "vaelg_maal" });
    expect(forslagMaalDom("klar", M, "")).toEqual({ kanSendes: false, grund: "vaelg_maal" });
    expect(forslagMaalDom("klar", M, "b")).toEqual({ kanSendes: true, maalId: "b" });
  });

  it("«uden» eller et mål, der ikke er blandt de aktive, kan ikke sendes", () => {
    expect(forslagMaalDom("klar", M, "uden")).toEqual({ kanSendes: false, grund: "ukendt_maal" });
    expect(forslagMaalDom("klar", M, "x")).toEqual({ kanSendes: false, grund: "ukendt_maal" });
  });

  it("mens målene hentes, eller hentningen fejlede, sendes intet", () => {
    expect(forslagMaalDom("henter", [], null)).toEqual({ kanSendes: false, grund: "henter" });
    expect(forslagMaalDom("fejl", [], null)).toEqual({ kanSendes: false, grund: "fejl" });
  });

  it("grunden er «maal_kraeves»", () => {
    expect(MAAL_KRAEVES_GRUND).toBe("maal_kraeves");
  });
});

describe("maalValg — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("dommene er ens", () => {
    for (const status of ["henter", "fejl", "klar"] as const)
      for (const liste of [[], M])
        for (const valg of [null, "", "a", "uden", "x"])
          expect(forslagMaalDomDeno(status, liste, valg)).toEqual(forslagMaalDom(status, liste, valg));
    expect(kraeverMaalValgDeno(M)).toBe(kraeverMaalValg(M));
    expect(MAAL_KRAEVES_GRUND_DENO).toBe(MAAL_KRAEVES_GRUND);
  });
  it("kildekoden er ordret ens efter filhovedet", () => {
    const krop = (sti: string) => {
      const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
      return kilde.slice(kilde.indexOf("*/") + 2);
    };
    expect(krop("supabase/functions/_shared/maalValg.ts")).toBe(krop("src/lib/maalValg.ts"));
  });
});
