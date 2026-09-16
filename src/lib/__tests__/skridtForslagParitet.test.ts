import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as web from "@/lib/hjemmebane/skridtForslag";
import * as deno from "../../../supabase/functions/_shared/skridtForslag.ts";

// Paritet (fase 0a): src/lib/hjemmebane/skridtForslag.ts er et spejl af
// _shared/skridtForslag.ts — begge uden imports, så kildeteksten efter
// filhovedet skal være ordret ens, og funktionerne skal svare ens for de
// samme input (maanedsnoegle-mønstret). Driver de, fejler vitest højt.

const NU = new Date("2026-09-17T08:00:00Z");
const TITLER = ["Ring til banken", "  ring til   BANKEN! ", "Følg op på Q3", "café", "café", "", "..."];
const RAEKKER = [
  { title: "Ring til banken", status: "proposed", created_at: "2026-09-16T08:00:00Z" },
  { title: "ring til banken.", status: "dismissed", created_at: "2026-08-20T08:00:00Z" },
  { title: "Ring til banken", status: "expired", created_at: "2026-08-01T08:00:00Z" },
  { title: "Følg op på Q3", status: "done", created_at: "nej" },
  { title: "Noget andet", status: "proposed", created_at: "2026-07-01T08:00:00Z" },
  // Fase 5: afvist under et mål, gammel — tæller kun med maalId "m1".
  { title: "Ring til banken", status: "dismissed", created_at: "2026-03-01T08:00:00Z", maal_id: "m1" },
  { title: "Følg op på Q3", status: "expired", created_at: "2026-03-01T08:00:00Z", maal_id: "m1" },
];
const MAAL = [undefined, null, "", "m1", "m2"];

describe("skridtForslag — paritet mellem src/lib/hjemmebane og supabase/functions/_shared", () => {
  it("konstanterne og funktionerne svarer ens", () => {
    expect(web.GENTAGELSES_VINDUE_DAGE).toBe(deno.GENTAGELSES_VINDUE_DAGE);
    expect([...web.AABNE_STATUSSER]).toEqual([...deno.AABNE_STATUSSER]);
    expect(web.SKRIVE_SELECT_KOLONNER).toBe(deno.SKRIVE_SELECT_KOLONNER);
    expect(web.gentagelsesGraense(NU).getTime()).toBe(deno.gentagelsesGraense(NU).getTime());
    expect(web.skriveFilter(NU)).toBe(deno.skriveFilter(NU));
    for (const m of MAAL) expect(web.skriveFilter(NU, m)).toBe(deno.skriveFilter(NU, m));
    for (const t of TITLER) {
      expect(web.normaliserTitel(t)).toBe(deno.normaliserTitel(t));
      for (let n = 0; n <= RAEKKER.length; n++) {
        const udsnit = RAEKKER.slice(0, n);
        expect(web.erGentagelse(t, udsnit, NU)).toEqual(deno.erGentagelse(t, udsnit, NU));
        for (const m of MAAL) expect(web.erGentagelse(t, udsnit, NU, m)).toEqual(deno.erGentagelse(t, udsnit, NU, m));
        for (const skriver of ["ai", "raadgiver"] as const) {
          expect(web.doemSkrivning(t, udsnit, NU, { skriver })).toEqual(deno.doemSkrivning(t, udsnit, NU, { skriver }));
          for (const m of MAAL) expect(web.doemSkrivning(t, udsnit, NU, { skriver, maalId: m })).toEqual(deno.doemSkrivning(t, udsnit, NU, { skriver, maalId: m }));
        }
        expect(web.taelAabne(udsnit)).toBe(deno.taelAabne(udsnit));
      }
    }
    for (const n of [0, 1, 6]) expect(web.maaSkriveForslag(n)).toBe(deno.maaSkriveForslag(n));
  });
  it("kildekoden er ordret ens efter filhovedet (ingen imports at undtage)", () => {
    const krop = (sti: string) => {
      const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
      return kilde.slice(kilde.indexOf("*/") + 2);
    };
    expect(krop("src/lib/hjemmebane/skridtForslag.ts")).toBe(krop("supabase/functions/_shared/skridtForslag.ts"));
  });
});
