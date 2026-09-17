import { describe, expect, it } from "vitest";
import { rimelighedstjek } from "@/lib/rimelighed";

// ebt_reconciles efter saldobalance-rettelsen (17/9-2026): regnestykket er omkostningsnoegler.ebtRegnet —
// dækningsbidrag − Σ|drift inkl. øvrige| + andre driftsindtægter − |afskrivninger| − |finans|. Fiktive tal
// (den syntetiske saldobalances): ingen kundedata.
const finder = (a: ReturnType<typeof rimelighedstjek>, n: string) => a.find((x) => x.name === n)!;

describe("ebt_reconciles — øvrige omkostninger og andre driftsindtægter er med i regnestykket", () => {
  const efter = { revenue: 198500, gross_profit: 143500, cogs: 55000, payroll: 40000, sales_costs: 8000, facility_costs: 0, admin_costs: 10200, other_costs: 3600, other_operating_income: 15500, depreciation: 0, financial_costs: 900, ebt: 96300 };

  it("den syntetiske saldobalance EFTER rettelsen: PASS (143.500 − 61.800 + 15.500 − 900 = 96.300)", () => {
    const e = finder(rimelighedstjek(efter, "trial_balance"), "ebt_reconciles");
    expect(e.result).toBe("PASS");
    expect(e.details).toContain("96300.00");
  });

  it("uden indtægten og øvrige i regnestykket ville det IKKE lukke — beviset for at nøglerne er med", () => {
    // Samme tal, men indtægt og øvrige fjernet fra input: regnestykket giver 115.800 ≠ 96.300 → WARN.
    const { other_costs: _o, other_operating_income: _i, ...uden } = efter;
    void _o; void _i;
    expect(finder(rimelighedstjek(uden, "trial_balance"), "ebt_reconciles").result).toBe("WARN");
  });

  it("det gamle fortegnsvend-mønster (ebt = −regnet) er stadig WARN «samme tal med modsat fortegn»", () => {
    const vendt = { revenue: 100000, gross_profit: 60000, payroll: 50000, admin_costs: 30000, ebt: 20000 };
    const e = finder(rimelighedstjek(vendt, "trial_balance"), "ebt_reconciles");
    expect(e.result).toBe("WARN");
    expect(e.tekst).toContain("samme tal med modsat fortegn");
  });

  it("negativ konvention (alle omkostninger negative) lukker stadig via |beløb|", () => {
    expect(finder(rimelighedstjek({ revenue: 100_000, gross_profit: 60_000, payroll: -30_000, sales_costs: -5_000, financial_costs: -1_000, ebt: 24_000 }, "combined"), "ebt_reconciles").result).toBe("PASS");
  });

  it("uden en eneste omkostningspost ud over vareforbrug: SKIP (som A's kant)", () => {
    expect(finder(rimelighedstjek({ revenue: 100, gross_profit: 80, cogs: 20, ebt: 80 }, "pnl"), "ebt_reconciles").result).toBe("SKIP");
  });

  it("magnitude_plausibility måler også øvrige omkostninger som andel af omsætningen", () => {
    const e = finder(rimelighedstjek({ revenue: 100000, gross_profit: 60000, payroll: 20000, other_costs: 400000, ebt: -360000 }, "pnl"), "magnitude_plausibility");
    expect(e.result).toBe("WARN");
    expect(e.felter).toContain("other_costs");
    expect(e.tekst).toContain("Øvrige omkostninger");
  });
});
