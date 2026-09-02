import { describe, it, expect } from "vitest";
import {
  alleIndgangsmuligheder,
  beregnIndgangspris,
  INDGANGS_PRISPUNKTER_OERE,
  RATE12_TILLAEG_PCT,
  type IndgangsprisInput,
} from "@/lib/indgangspris";
// Parity import — the Deno copy is intentionally a verbatim mirror of the
// frontend copy. We import it here so vitest fails loudly if the two drift.
import {
  alleIndgangsmuligheder as alleIndgangsmulighederDeno,
  beregnIndgangspris as beregnIndgangsprisDeno,
  INDGANGS_PRISPUNKTER_OERE as INDGANGS_PRISPUNKTER_OERE_DENO,
  RATE12_TILLAEG_PCT as RATE12_TILLAEG_PCT_DENO,
} from "../../../supabase/functions/_shared/indgangspris.ts";

// Parity gate — the Deno copy at supabase/functions/_shared/indgangspris.ts
// must produce identical output for every input the frontend copy handles:
// begge prisniveauer, alle tre modeller, og begge fejlgrene. If this block
// fails, the two files have drifted and must be re-synced.
describe("beregnIndgangspris — parity between src/lib and supabase/functions/_shared", () => {
  const parityCases: IndgangsprisInput[] = [
    { prisniveau_oere: 5_000_000, betalingsmodel: "fuld" },
    { prisniveau_oere: 5_000_000, betalingsmodel: "rate2" },
    { prisniveau_oere: 5_000_000, betalingsmodel: "rate12" },
    { prisniveau_oere: 4_000_000, betalingsmodel: "fuld" },
    { prisniveau_oere: 4_000_000, betalingsmodel: "rate2" },
    { prisniveau_oere: 4_000_000, betalingsmodel: "rate12" },
    { prisniveau_oere: null, betalingsmodel: "fuld" }, // intet_prisniveau
    { prisniveau_oere: 4_500_000, betalingsmodel: "fuld" }, // ukendt_prispunkt
    { prisniveau_oere: 2_500_000, betalingsmodel: "rate12" }, // fornyelsens punkt, ikke indgangens
  ];

  for (const input of parityCases) {
    it(`parity: ${JSON.stringify(input)}`, () => {
      const fe = beregnIndgangspris(input);
      const deno = beregnIndgangsprisDeno(input);
      expect(deno).toEqual(fe);
    });
  }

  it("de seks ok-kombinationer rammer ok i begge kopier, de tre fejl rammer fejl", () => {
    for (const input of parityCases) {
      const fe = beregnIndgangspris(input);
      const deno = beregnIndgangsprisDeno(input);
      expect(deno.ok).toBe(fe.ok);
    }
  });
});

describe("alleIndgangsmuligheder — parity between src/lib and supabase/functions/_shared", () => {
  for (const niveau of [5_000_000, 4_000_000, null, 4_500_000]) {
    it(`parity: ${String(niveau)}`, () => {
      const fe = alleIndgangsmuligheder(niveau);
      const deno = alleIndgangsmulighederDeno(niveau);
      expect(deno).toEqual(fe);
    });
  }
});

describe("låsene er ens i begge kopier", () => {
  it("prispunkter og tillæg", () => {
    expect([...INDGANGS_PRISPUNKTER_OERE_DENO]).toEqual([...INDGANGS_PRISPUNKTER_OERE]);
    expect(RATE12_TILLAEG_PCT_DENO).toBe(RATE12_TILLAEG_PCT);
  });
});
