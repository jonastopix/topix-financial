import { describe, expect, it } from "vitest";
import { maaSkriveForslag, skalHaveUgensFokus, type FokusTier } from "../ugensFokusGate";
import {
  maaSkriveForslag as maaSkriveForslagDeno,
  skalHaveUgensFokus as skalHaveUgensFokusDeno,
} from "../../../supabase/functions/generate-weekly-focus/ugensFokusGate.ts";

// Jonas 8/9: «Maskinen skal selvfølgelig ikke foreslå noget, hvis der ikke
// er noget at foreslå på.» Målt: Rallysupport og ANLA GLAS (faldet ud) fik
// seks forslag hver, fordi ugens fokus kun så på weekly_focus_enabled.

const TIERS: FokusTier[] = ["no_date", "full", "subscriber", "expired"];
const STATUSSER = ["active", "tidligere", null, undefined, "noget_andet"] as const;

describe("skalHaveUgensFokus — er virksomheden der?", () => {
  it("udløbet tier: nej, uanset status", () => {
    for (const status of STATUSSER) {
      expect(skalHaveUgensFokus({ status, tier: "expired" })).toEqual({ ok: false, grund: "udloebet" });
    }
  });

  it("status 'tidligere' eller anden ikke-aktiv: nej, også med fuldt medlemskab", () => {
    expect(skalHaveUgensFokus({ status: "tidligere", tier: "full" })).toEqual({ ok: false, grund: "ikke_aktiv" });
    expect(skalHaveUgensFokus({ status: "noget_andet", tier: "no_date" })).toEqual({ ok: false, grund: "ikke_aktiv" });
  });

  it("aktiv (eller status null/undefined, som listen) med full, subscriber eller no_date: ja", () => {
    for (const tier of ["full", "subscriber", "no_date"] as FokusTier[]) {
      expect(skalHaveUgensFokus({ status: "active", tier })).toEqual({ ok: true });
      expect(skalHaveUgensFokus({ status: null, tier })).toEqual({ ok: true });
      expect(skalHaveUgensFokus({ status: undefined, tier })).toEqual({ ok: true });
    }
  });

  it("tier dømmes før status: en udløbet 'tidligere' hedder udløbet", () => {
    expect(skalHaveUgensFokus({ status: "tidligere", tier: "expired" })).toEqual({ ok: false, grund: "udloebet" });
  });
});

describe("maaSkriveForslag — seks ubesvarede plus seks nye er ikke et nudge", () => {
  it("nul ventende: ja", () => {
    expect(maaSkriveForslag(0)).toBe(true);
  });
  it("ét eller flere ventende: nej", () => {
    expect(maaSkriveForslag(1)).toBe(false);
    expect(maaSkriveForslag(6)).toBe(false);
    expect(maaSkriveForslag(61)).toBe(false);
  });
});

describe("paritet — Deno-kopien i generate-weekly-focus/ er ordret den samme dom", () => {
  for (const tier of TIERS) {
    for (const status of STATUSSER) {
      it(`skalHaveUgensFokus(${status}, ${tier})`, () => {
        expect(skalHaveUgensFokusDeno({ status, tier })).toEqual(skalHaveUgensFokus({ status, tier }));
      });
    }
  }
  for (const n of [0, 1, 6, 61]) {
    it(`maaSkriveForslag(${n})`, () => {
      expect(maaSkriveForslagDeno(n)).toBe(maaSkriveForslag(n));
    });
  }
});
