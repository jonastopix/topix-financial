import { describe, it, expect } from "vitest";
import {
  afgoerForfaldentVarsel,
  VARSEL_1_DAGE_FOER,
  VARSEL_2_DAGE_FOER,
  type FornyelsesvarselInput,
} from "@/lib/fornyelsesvarsel";
import type { Fornyelsesbeslutning } from "@/lib/fornyelse";
// Parity import — the Deno copy is intentionally a mirror of the frontend
// copy (import path is the only allowed difference). We import it here so
// vitest fails loudly if the two drift.
import {
  afgoerForfaldentVarsel as afgoerForfaldentVarselDeno,
  VARSEL_1_DAGE_FOER as VARSEL_1_DAGE_FOER_DENO,
  VARSEL_2_DAGE_FOER as VARSEL_2_DAGE_FOER_DENO,
} from "../../../supabase/functions/_shared/fornyelsesvarsel.ts";

// Fast «nu»: 1. september 2026 kl. 12:00 UTC — samme anker som
// fornyelsesvarsel.test.ts. Dagene regnes i hele UTC-kalenderdage.
const NU = new Date("2026-09-01T12:00:00.000Z");

/** Slutdato som «YYYY-MM-DD» præcis n kalenderdage efter NU (negativt = før). */
function slutdatoOmDage(n: number): string {
  return new Date(Date.UTC(2026, 8, 1) + n * 86_400_000).toISOString().slice(0, 10);
}

const SENDT = "2026-08-20T09:00:00.000Z";

const input = (dageTilSlut: number | null, over: Partial<FornyelsesvarselInput> = {}): FornyelsesvarselInput => ({
  contract_end_date: dageTilSlut === null ? null : slutdatoOmDage(dageTilSlut),
  beslutning: "tilbyd",
  varsel_1_sendt_at: null,
  varsel_2_sendt_at: null,
  ...over,
});

// Parity gate — the Deno copy at supabase/functions/_shared/fornyelsesvarsel.ts
// must produce an identical Fornyelsesvarsel (varsel, grund, dage_til_udloeb)
// for every input the frontend copy handles. Each explicit case asserts the
// intended varsel so no branch is silently missed. If this block fails, the
// two files have drifted and must be re-synced.
describe("afgoerForfaldentVarsel — parity between src/lib and supabase/functions/_shared", () => {
  const cases: Array<{ navn: string; varsel: 1 | 2 | null; input: FornyelsesvarselInput }> = [
    // Grænserne
    { navn: "dag 31: for tidligt", varsel: null, input: input(31) },
    { navn: "dag 30: varsel 1", varsel: 1, input: input(30) },
    { navn: "dag 8: varsel 1 hvis ikke sendt", varsel: 1, input: input(8) },
    { navn: "dag 8, varsel 1 sendt: intet", varsel: null, input: input(8, { varsel_1_sendt_at: SENDT }) },
    { navn: "dag 7, varsel 1 sendt: varsel 2", varsel: 2, input: input(7, { varsel_1_sendt_at: SENDT }) },
    { navn: "dag 0 (slutdagen): varsel 2", varsel: 2, input: input(0, { varsel_1_sendt_at: SENDT }) },
    // Den sene beslutning og stemplerne
    { navn: "dag 5 uden stempler: varsel 2, ikke 1", varsel: 2, input: input(5) },
    { navn: "dag 4, varsel 2 sendt: varsel 1 sendes ikke bagefter", varsel: null, input: input(4, { varsel_2_sendt_at: SENDT }) },
    { navn: "dag 20, kun varsel 2 sendt: intet", varsel: null, input: input(20, { varsel_2_sendt_at: SENDT }) },
    { navn: "dag 3, begge sendt: intet", varsel: null, input: input(3, { varsel_1_sendt_at: SENDT, varsel_2_sendt_at: SENDT }) },
    // Dem der aldrig får et varsel
    { navn: "tilbyd_ikke", varsel: null, input: input(5, { beslutning: "tilbyd_ikke" }) },
    { navn: "ingen beslutning", varsel: null, input: input(5, { beslutning: null }) },
    { navn: "ingen slutdato", varsel: null, input: input(null) },
    { navn: "ulæselig slutdato", varsel: null, input: input(5, { contract_end_date: "ikke-en-dato" }) },
    { navn: "ulæseligt stempel", varsel: null, input: input(20, { varsel_1_sendt_at: "ikke-en-dato" }) },
    { navn: "dagen efter slutdato", varsel: null, input: input(-1) },
  ];

  for (const { navn, varsel, input: i } of cases) {
    it(`parity: ${navn}`, () => {
      const fe = afgoerForfaldentVarsel(i, NU);
      const deno = afgoerForfaldentVarselDeno(i, NU);
      expect(fe.varsel).toBe(varsel); // inputtet rammer den tilsigtede gren
      expect(deno).toEqual(fe); // hele returobjektet: varsel, grund, dage_til_udloeb
    });
  }

  it("alle dage −20…+60 til slutdato × tre beslutninger × alle fire stempel-kombinationer × to now-datoer", () => {
    const beslutninger: (Fornyelsesbeslutning | null)[] = [null, "tilbyd", "tilbyd_ikke"];
    const stempler: Array<Pick<FornyelsesvarselInput, "varsel_1_sendt_at" | "varsel_2_sendt_at">> = [
      { varsel_1_sendt_at: null, varsel_2_sendt_at: null },
      { varsel_1_sendt_at: SENDT, varsel_2_sendt_at: null },
      { varsel_1_sendt_at: null, varsel_2_sendt_at: SENDT },
      { varsel_1_sendt_at: SENDT, varsel_2_sendt_at: SENDT },
    ];
    for (const now of [NU, new Date("2026-09-01T23:30:00.000Z")]) {
      for (let dage = -20; dage <= 60; dage++) {
        for (const beslutning of beslutninger) {
          for (const s of stempler) {
            const i: FornyelsesvarselInput = { contract_end_date: slutdatoOmDage(dage), beslutning, ...s };
            expect(afgoerForfaldentVarselDeno(i, now)).toEqual(afgoerForfaldentVarsel(i, now));
          }
        }
      }
    }
  });
});

describe("låsene er ens i begge kopier", () => {
  it("varsel 1 og varsel 2's dage før slutdato", () => {
    expect(VARSEL_1_DAGE_FOER_DENO).toBe(VARSEL_1_DAGE_FOER);
    expect(VARSEL_2_DAGE_FOER_DENO).toBe(VARSEL_2_DAGE_FOER);
  });
});
