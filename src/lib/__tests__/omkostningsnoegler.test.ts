import { describe, expect, it } from "vitest";
import { CANONICAL, DANSK, andreDriftsindtaegter, ebitdaRegnet, ebtRegnet, omkostningerIAlt, omkostningsnoegler, sumOmkostninger } from "@/lib/omkostningsnoegler";

// ÉN fælles definition af omkostningsnøglerne (17/9-2026). Fiktive tal — ingen kundedata.
describe("omkostningsnoegler — nøglesættene", () => {
  it("canonical: vareforbrug, otte driftsposter (inkl. other_costs), afskrivninger, finans; indtægten er ikke en omkostning", () => {
    expect(omkostningsnoegler(CANONICAL, "alle")).toEqual(["cogs", "payroll", "payroll_related", "other_staff_costs", "sales_costs", "facility_costs", "admin_costs", "vehicle_costs", "other_costs", "depreciation", "financial_costs"]);
    expect(omkostningsnoegler(CANONICAL, "drift")).not.toContain("cogs");
    expect(omkostningsnoegler(CANONICAL, "alle")).not.toContain("other_operating_income");
  });
  it("dansk: de syv kf-nøgler; finans findes ikke i kf", () => {
    expect(omkostningsnoegler(DANSK, "alle")).toEqual(["direkte_omkostninger", "loenninger", "salgsomkostninger", "lokaleomkostninger", "administrationsomkostninger", "oevrige_omkostninger", "afskrivninger"]);
    expect(omkostningsnoegler(DANSK, "vareforbrug_og_drift")).toEqual(["direkte_omkostninger", "loenninger", "salgsomkostninger", "lokaleomkostninger", "administrationsomkostninger", "oevrige_omkostninger"]);
    expect(DANSK.finans).toBeNull();
  });
});

describe("omkostningsnoegler — regnestykkerne", () => {
  const m = { revenue: 198500, gross_profit: 143500, cogs: 55000, payroll: 40000, sales_costs: 8000, facility_costs: 0, admin_costs: 10200, other_costs: 3600, other_operating_income: 15500, depreciation: 0, financial_costs: 900 };
  it("sumOmkostninger tager |beløb| og tæller de målte; null springes over", () => {
    expect(sumOmkostninger({ payroll: -30000, sales_costs: 5000, admin_costs: null }, CANONICAL, "drift")).toEqual({ sum: 35000, fundet: 2 });
    expect(sumOmkostninger({}, CANONICAL, "alle")).toEqual({ sum: 0, fundet: 0 });
  });
  it("omkostningerIAlt: Σ|alle| — indtægten trækkes ikke fra (den er ikke en omkostning)", () => {
    expect(omkostningerIAlt(m, CANONICAL)).toBe(55000 + 40000 + 8000 + 0 + 10200 + 3600 + 0 + 900);
    expect(andreDriftsindtaegter(m, CANONICAL)).toBe(15500);
    expect(andreDriftsindtaegter({}, CANONICAL)).toBe(0);
  });
  it("ebitdaRegnet: dækningsbidrag − Σ|drift| + andre driftsindtægter; null uden dækningsbidrag eller uden drift og indtægt", () => {
    expect(ebitdaRegnet(m.gross_profit, m, CANONICAL)).toBe(143500 - (40000 + 8000 + 0 + 10200 + 3600) + 15500);
    expect(ebitdaRegnet(null, m, CANONICAL)).toBeNull();
    expect(ebitdaRegnet(100, { cogs: 50 }, CANONICAL)).toBeNull();
    expect(ebitdaRegnet(100, { other_operating_income: 20 }, CANONICAL)).toBe(120);
  });
  it("ebtRegnet: ebitda − |afskrivninger| − |finans| — lukker på den syntetiske saldobalance (96.300)", () => {
    expect(ebtRegnet(m.gross_profit, m, CANONICAL)).toBe(96300);
  });
  it("dansk kf: samme regnestykke med danske nøgler (ingen finans)", () => {
    const kf = { daekningsbidrag: 143500, loenninger: 40000, salgsomkostninger: 8000, lokaleomkostninger: 0, administrationsomkostninger: 10200, oevrige_omkostninger: 3600, andre_driftsindtaegter: 15500, afskrivninger: 0 };
    expect(ebitdaRegnet(kf.daekningsbidrag, kf, DANSK)).toBe(97200);
    expect(ebtRegnet(kf.daekningsbidrag, kf, DANSK)).toBe(97200);
  });
  it("negativ konvention (før 7/9) regnes stadig rigtigt via |beløb|", () => {
    expect(ebitdaRegnet(60000, { payroll: -30000, sales_costs: -5000 }, CANONICAL)).toBe(25000);
  });
});
