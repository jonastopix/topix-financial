import { describe, expect, it } from "vitest";
import { BALANCE_NOEGLER, metricsForMaaned, ULTIMO_MAANED } from "../../../supabase/functions/_shared/aarsrapportRaekker.ts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";

const aar = { revenue: 10_000, gross_profit: 4_000, payroll: 2_000, ebt: 1_000, cash: 210_000, equity: 80_000 };

describe("balanceposter kun i december (de-tyve nr. 9)", () => {
  it("januar til november: uden cash og equity — nøglen mangler, ikke 0", () => {
    for (let i = 0; i < 11; i++) {
      const m = metricsForMaaned(aar, i);
      expect(m).toEqual({ revenue: 10_000, gross_profit: 4_000, payroll: 2_000, ebt: 1_000 });
      expect("cash" in m).toBe(false);
      expect("equity" in m).toBe(false);
    }
  });
  it("december: alt med, uændret", () => {
    expect(metricsForMaaned(aar, ULTIMO_MAANED)).toEqual(aar);
    expect(ULTIMO_MAANED).toBe(11);
  });
  it("grænserne: november (10) uden, december (11) med", () => {
    expect("cash" in metricsForMaaned(aar, 10)).toBe(false);
    expect("cash" in metricsForMaaned(aar, 11)).toBe(true);
  });
  it("equity_total behandles som ultimo på linje med cash og equity; input muteres ikke", () => {
    expect(BALANCE_NOEGLER).toEqual(["cash", "equity", "equity_total"]);
    const m = { revenue: 1, equity_total: 5 };
    const ud = metricsForMaaned(m, 0);
    expect(ud).toEqual({ revenue: 1 });
    expect(m).toEqual({ revenue: 1, equity_total: 5 });
  });
  it("fladen tåler det: en række uden cash giver ingen bank_balance — ikke nul (#786)", () => {
    const kf = factsToDanishMetrics(metricsForMaaned(aar, 3));
    expect(kf.bank_balance).toBeUndefined();
    expect(kf.egenkapital).toBeUndefined();
    expect(factsToDanishMetrics(metricsForMaaned(aar, 11))).toMatchObject({ bank_balance: 210_000, egenkapital: 80_000 });
  });
});

describe("factsAdapter: equity → egenkapital (de-tyve nr. 8)", () => {
  it("årsrapportens equity bliver egenkapital", () => {
    expect(factsToDanishMetrics({ equity: 80_000 })).toEqual({ egenkapital: 80_000 });
  });
  it("findes begge, vinder equity_total — uanset nøglernes rækkefølge", () => {
    expect(factsToDanishMetrics({ equity: 1, equity_total: 2 })).toEqual({ egenkapital: 2 });
    expect(factsToDanishMetrics({ equity_total: 2, equity: 1 })).toEqual({ egenkapital: 2 });
  });
  it("null droppes stadig", () => {
    expect(factsToDanishMetrics({ equity: null, equity_total: null })).toEqual({});
  });
});
