import { describe, it, expect } from "vitest";
// Cross-boundary import (samme mønster som notificationEmailSelection.test.ts):
// vi tester den delte Deno-dommerlogik direkte fra vitest, så CI
// (bun run test) dækker den.
import {
  evaluateKpiTargets,
  KPI_EXTRACTORS,
  type KpiTarget,
} from "../../../supabase/functions/_shared/weeklyFocusKpi.ts";

/**
 * Reproduktion af fejlsporet 2026-08-11: ugens fokus slog KPI-værdier
 * op på nøgler der enten var forkerte eller ikke fandtes i facts
 * (resultat → net_result, db_margin → gross_margin_pct,
 * ebitda_margin → ebitda_margin_pct). Tre af fem mål blev stille
 * sprunget over ved hver kørsel.
 *
 * Rettelsen: værdien UDLEDES som i VALUE_EXTRACTORS (kpiDefs.ts) og
 * calcDbMargin/calcResultMargin (financialUtils.ts), så dommen falder
 * over det tal medlemmet ser i UI'et.
 */

const target = (overrides: Partial<KpiTarget> = {}): KpiTarget => ({
  kpi_key: "resultat",
  target_value: 100_000,
  lower_is_better: false,
  ...overrides,
});

describe("evaluateKpiTargets — resultat måles mod ebt (fejlsporet)", () => {
  it("1. vurderer resultat mod m.ebt, IKKE m.net_result", () => {
    // ebt rammer målet; net_result ligger 50% under. Før rettelsen ville
    // net_result-værdien udløse off target — nu skal ebt frikende målet.
    const clear = evaluateKpiTargets([target()], {
      ebt: 100_000,
      net_result: 50_000,
    });
    expect(clear).toEqual([]);

    // Spejlet: ebt er 50% under målet; net_result rammer det. Dommen skal
    // følge ebt og melde off target.
    const off = evaluateKpiTargets([target()], {
      ebt: 50_000,
      net_result: 100_000,
    });
    expect(off).toHaveLength(1);
    expect(off[0]).toEqual({
      kpi_key: "resultat",
      actual: 50_000,
      target: 100_000,
      deviation_pct: 50,
    });
  });

  it("2. vurderer resultat når kun ebt findes (før rettelsen: sprunget over)", () => {
    const out = evaluateKpiTargets([target()], { ebt: 50_000 });
    expect(out).toHaveLength(1);
    expect(out[0].kpi_key).toBe("resultat");
    expect(out[0].actual).toBe(50_000);

    // Uden noget grundlag overhovedet: springes over.
    expect(evaluateKpiTargets([target()], {})).toEqual([]);
    expect(evaluateKpiTargets([target()], { ebt: null })).toEqual([]);
  });
});

describe("evaluateKpiTargets — db_margin udledes af gross_profit/revenue", () => {
  const dbTarget = (overrides: Partial<KpiTarget> = {}): KpiTarget =>
    target({ kpi_key: "db_margin", target_value: 60, ...overrides });

  it("3. beregnes som gross_profit/revenue*100", () => {
    // 80.000 / 200.000 = 40% mod mål 60% → 33,3% afvigelse, off target.
    const off = evaluateKpiTargets([dbTarget()], {
      revenue: 200_000,
      gross_profit: 80_000,
    });
    expect(off).toHaveLength(1);
    expect(off[0]).toEqual({
      kpi_key: "db_margin",
      actual: 40,
      target: 60,
      deviation_pct: 33.3,
    });

    // Samme tal mod mål 40% → på målet, ingen dom.
    expect(
      evaluateKpiTargets([dbTarget({ target_value: 40 })], {
        revenue: 200_000,
        gross_profit: 80_000,
      }),
    ).toEqual([]);
  });

  it("4. revenue = 0 → null, springes over (ingen division med nul)", () => {
    const out = evaluateKpiTargets([dbTarget()], {
      revenue: 0,
      gross_profit: 80_000,
    });
    expect(out).toEqual([]);
  });

  it("5. uden gross_profit → springes over", () => {
    expect(evaluateKpiTargets([dbTarget()], { revenue: 200_000 })).toEqual([]);
  });
});

describe("evaluateKpiTargets — ebitda_margin er en ebt-margin (arvegods-navn)", () => {
  it("6. beregnes som ebt/revenue*100 — bruger IKKE m.ebitda", () => {
    // ebt-margin = 50%; ebitda-margin ville være 100%. Mod mål 80% er
    // 50% off target (37,5% afvigelse) — 100% ville have frikendt målet.
    // Dommen skal altså falde, og med actual = 50.
    const out = evaluateKpiTargets(
      [target({ kpi_key: "ebitda_margin", target_value: 80 })],
      { revenue: 100_000, ebt: 50_000, ebitda: 100_000 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      kpi_key: "ebitda_margin",
      actual: 50,
      target: 80,
      deviation_pct: 37.5,
    });

    // Direkte på udlederen: ebitda alene er ikke grundlag nok.
    expect(
      KPI_EXTRACTORS.ebitda_margin({ revenue: 100_000, ebitda: 100_000 }),
    ).toBeNull();
  });
});

describe("evaluateKpiTargets — loenninger og omkostninger", () => {
  it("7. loenninger tager absolut værdi (negativ payroll → positivt tal)", () => {
    const out = evaluateKpiTargets(
      [target({ kpi_key: "loenninger", lower_is_better: true })],
      { payroll: -120_000 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      kpi_key: "loenninger",
      actual: 120_000,
      target: 100_000,
      deviation_pct: 20,
    });
  });

  it("8. omkostninger summerer alle seks led i absolut værdi", () => {
    // |-50.000| + |30.000| + |-10.000| + |5.000| + |3.000| + |-2.000| = 100.000
    const out = evaluateKpiTargets(
      [target({ kpi_key: "omkostninger", target_value: 80_000, lower_is_better: true })],
      {
        payroll: -50_000,
        cogs: 30_000,
        sales_costs: -10_000,
        facility_costs: 5_000,
        admin_costs: 3_000,
        depreciation: -2_000,
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      kpi_key: "omkostninger",
      actual: 100_000,
      target: 80_000,
      deviation_pct: 25,
    });
  });

  it("9. omkostninger hvor alle led mangler → springes over", () => {
    const out = evaluateKpiTargets(
      [target({ kpi_key: "omkostninger", lower_is_better: true })],
      { revenue: 500_000, ebt: 100_000 },
    );
    expect(out).toEqual([]);
  });

  it("10. omkostninger hvor summen er 0 → springes over", () => {
    // Nul betyder at ingen omkostninger blev læst, ikke at der ingen var.
    const out = evaluateKpiTargets(
      [target({ kpi_key: "omkostninger", lower_is_better: true })],
      { payroll: 0, cogs: 0 },
    );
    expect(out).toEqual([]);
  });
});

describe("evaluateKpiTargets — dommen (uændret tærskellogik)", () => {
  it("11. ukendt kpi_key → springes over", () => {
    const out = evaluateKpiTargets([target({ kpi_key: "cash_flow" })], {
      ebt: 0,
      revenue: 0,
    });
    expect(out).toEqual([]);
  });

  it("12. lower_is_better: 20% over mål → off target; 10% over → ikke", () => {
    const loen = target({ kpi_key: "loenninger", lower_is_better: true });
    expect(evaluateKpiTargets([loen], { payroll: 120_000 })).toHaveLength(1);
    expect(evaluateKpiTargets([loen], { payroll: 110_000 })).toEqual([]);
  });

  it("13. lower_is_better false: 20% under mål → off target; 10% under → ikke", () => {
    const oms = target({ kpi_key: "omsaetning" });
    expect(evaluateKpiTargets([oms], { revenue: 80_000 })).toHaveLength(1);
    expect(evaluateKpiTargets([oms], { revenue: 90_000 })).toEqual([]);
  });

  it("14. target_value = 0 → ingen division med nul, ingen exception", () => {
    // Math.abs(0 || 1) = 1 er nævneren; kaldet må aldrig kaste.
    const out = evaluateKpiTargets([target({ target_value: 0 })], {
      ebt: -10_000,
    });
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].deviation_pct).toBe(1_000_000);
  });

  it("15. negativt mål (planlagt underskud): værre → off target; bedre → ikke", () => {
    const planlagtUnderskud = target({ target_value: -100_000 });

    const worse = evaluateKpiTargets([planlagtUnderskud], { ebt: -150_000 });
    expect(worse).toHaveLength(1);
    expect(worse[0]).toEqual({
      kpi_key: "resultat",
      actual: -150_000,
      target: -100_000,
      deviation_pct: 50,
    });

    expect(evaluateKpiTargets([planlagtUnderskud], { ebt: -50_000 })).toEqual([]);
  });
});
