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

// Fast «nu»: 1. oktober 2026 kl. 12:00 UTC (flyttet fra 1. september 7/9:
// med ordningen i kraft 10/9 ville slutdatoer 0–9 dage efter 1/9 ligge
// UDEN FOR ORDNINGEN og aldrig få et varsel — grænsen har sin egen blok) — samme anker som
// fornyelsesvarsel.test.ts. Dagene regnes i hele UTC-kalenderdage.
const NU = new Date("2026-10-01T12:00:00.000Z");

/** Slutdato som «YYYY-MM-DD» præcis n kalenderdage efter NU (negativt = før). */
function slutdatoOmDage(n: number): string {
  return new Date(Date.UTC(2026, 9, 1) + n * 86_400_000).toISOString().slice(0, 10);
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
    // Ordningens grænse (7/9): slutdato på/før 10/9 kan ikke handle — begge kopier skal tie med samme grund.
    { navn: "uden for ordningen: slutdato 2026-09-10, 5 dage før", varsel: null, input: { ...input(5), contract_end_date: "2026-09-10" } },
    { navn: "inden for ordningen: slutdato 2026-09-11, 1 dag før", varsel: 2, input: { ...input(1), contract_end_date: "2026-09-11" } },
  ];

  for (const { navn, varsel, input: i } of cases) {
    it(`parity: ${navn}`, () => {
      // Grænse-casene ligger i september; resten ved oktober-ankeret.
      const nu = i.contract_end_date === "2026-09-10" ? new Date("2026-09-05T12:00:00.000Z")
        : i.contract_end_date === "2026-09-11" ? new Date("2026-09-10T12:00:00.000Z")
        : NU;
      const fe = afgoerForfaldentVarsel(i, nu);
      const deno = afgoerForfaldentVarselDeno(i, nu);
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
    for (const now of [NU, new Date("2026-10-01T23:30:00.000Z")]) {
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

describe("ordningens grænse (gren 5) — begge kopier tier ens omkring 2026-09-10", () => {
  it("slutdatoer 25/8–20/9 × to «nu» × tre beslutninger × fire stempel-kombinationer", () => {
    const beslutninger: (Fornyelsesbeslutning | null)[] = [null, "tilbyd", "tilbyd_ikke"];
    const stempler: Array<Pick<FornyelsesvarselInput, "varsel_1_sendt_at" | "varsel_2_sendt_at">> = [
      { varsel_1_sendt_at: null, varsel_2_sendt_at: null },
      { varsel_1_sendt_at: SENDT, varsel_2_sendt_at: null },
      { varsel_1_sendt_at: null, varsel_2_sendt_at: SENDT },
      { varsel_1_sendt_at: SENDT, varsel_2_sendt_at: SENDT },
    ];
    let blokerede = 0;
    for (const now of [new Date("2026-08-20T12:00:00.000Z"), new Date("2026-09-05T12:00:00.000Z")]) {
      for (let d = 0; d <= 26; d++) {
        const slutdato = new Date(Date.UTC(2026, 7, 25) + d * 86_400_000).toISOString().slice(0, 10);
        for (const beslutning of beslutninger) {
          for (const s of stempler) {
            const i: FornyelsesvarselInput = { contract_end_date: slutdato, beslutning, ...s };
            const fe = afgoerForfaldentVarsel(i, now);
            expect(afgoerForfaldentVarselDeno(i, now)).toEqual(fe);
            if (fe.blokeret_af) blokerede++;
          }
        }
      }
    }
    expect(blokerede).toBeGreaterThan(0); // grænsen er faktisk ramt i sweepet
  });
});

describe("låsene er ens i begge kopier", () => {
  it("varsel 1 og varsel 2's dage før slutdato", () => {
    expect(VARSEL_1_DAGE_FOER_DENO).toBe(VARSEL_1_DAGE_FOER);
    expect(VARSEL_2_DAGE_FOER_DENO).toBe(VARSEL_2_DAGE_FOER);
  });
});
