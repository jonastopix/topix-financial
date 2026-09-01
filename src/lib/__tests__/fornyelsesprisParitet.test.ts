import { describe, it, expect } from "vitest";
import {
  beregnFornyelsespris,
  type FornyelsesprisInput,
} from "@/lib/fornyelsespris";
// Parity import — the Deno copy is intentionally a verbatim mirror of the
// frontend copy. We import it here so vitest fails loudly if the two drift.
import { beregnFornyelsespris as beregnFornyelsesprisDeno } from "../../../supabase/functions/_shared/fornyelsespris.ts";

// Parity gate — the Deno copy at supabase/functions/_shared/fornyelsespris.ts
// must produce identical output for every input the frontend copy handles.
// If this block fails, the two files have drifted and must be re-synced.
describe("beregnFornyelsespris — parity between src/lib and supabase/functions/_shared", () => {
  const parityCases: FornyelsesprisInput[] = [
    { indgangspris_oere: 3_000_000, fornyelsespris_oere: null, betalingsmodel: "fuld" },
    { indgangspris_oere: 3_000_000, fornyelsespris_oere: null, betalingsmodel: "rate12" },
    { indgangspris_oere: 4_000_000, fornyelsespris_oere: null, betalingsmodel: "rate2" },
    { indgangspris_oere: 5_000_000, fornyelsespris_oere: null, betalingsmodel: "rate12" },
    { indgangspris_oere: 5_000_000, fornyelsespris_oere: 2_000_000, betalingsmodel: "fuld" },
    { indgangspris_oere: 4_000_000, fornyelsespris_oere: 2_250_000, betalingsmodel: "fuld" },
    { indgangspris_oere: null, fornyelsespris_oere: null, betalingsmodel: "fuld" },
    { indgangspris_oere: 4_500_000, fornyelsespris_oere: null, betalingsmodel: "fuld" },
  ];

  for (const input of parityCases) {
    it(`parity: ${JSON.stringify(input)}`, () => {
      const fe = beregnFornyelsespris(input);
      const deno = beregnFornyelsesprisDeno(input);
      expect(deno).toEqual(fe);
    });
  }
});
