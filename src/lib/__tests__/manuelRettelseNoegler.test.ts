import { describe, expect, it } from "vitest";
import {
  bevaredeNoegler,
  formularenKanIkkeUdtrykke,
  manuelPreviewMedBevarede,
  somSqlTal,
  tabteNoegler,
  type KanoniskNoegleRaekke,
} from "@/lib/manuelRettelseNoegler";

/**
 * Den manuelle rettelse bevarer nøgler, formularen ikke kan udtrykke (3/10-2026, kort
 * g03-manuel-rettelse-taber-noegler). Fiktive tal — ingen kundedata.
 */

const NOEGLER: KanoniskNoegleRaekke[] = [
  { noegle: "revenue", dansk_noegle: "omsaetning", danske_aliaser: [] },
  { noegle: "gross_profit", dansk_noegle: "daekningsbidrag", danske_aliaser: ["bruttofortjeneste"] },
  { noegle: "payroll", dansk_noegle: "loenninger", danske_aliaser: [] },
  { noegle: "vehicle_costs", dansk_noegle: null, danske_aliaser: [] },
  { noegle: "financial_costs", dansk_noegle: null, danske_aliaser: [] },
  { noegle: "inventory", dansk_noegle: null, danske_aliaser: null },
  // En tænkt nøgle uden dansk_noegle, men MED et alias: formularen kan sende den — den bevares ikke fra kilden.
  { noegle: "kun_alias", dansk_noegle: null, danske_aliaser: ["gammelt_navn"] },
];

describe("formularenKanIkkeUdtrykke", () => {
  it("dansk_noegle NULL og ingen aliaser (også aliaser NULL) → true; ellers false", () => {
    const dom = Object.fromEntries(NOEGLER.map((r) => [r.noegle, formularenKanIkkeUdtrykke(r)]));
    expect(dom).toEqual({
      revenue: false, gross_profit: false, payroll: false,
      vehicle_costs: true, financial_costs: true, inventory: true, kun_alias: false,
    });
  });
});

describe("somSqlTal — SQL'ens `value ~ '^-?[0-9]'` → `::numeric`", () => {
  it("tal og taltekst med minus tæller; null, tom, tekst, objekt og boolean gør ikke", () => {
    expect(somSqlTal(4000)).toBe(4000);
    expect(somSqlTal("5165.34")).toBe(5165.34);
    expect(somSqlTal(-12)).toBe(-12);
    expect(somSqlTal(0)).toBe(0);
    expect(somSqlTal(null)).toBeNull();
    expect(somSqlTal(undefined)).toBeNull();
    expect(somSqlTal("")).toBeNull();
    expect(somSqlTal("n/a")).toBeNull();
    expect(somSqlTal({ a: 1 })).toBeNull();
    expect(somSqlTal(true)).toBeNull();
  });
});

describe("bevaredeNoegler — reglen i migrationens blok", () => {
  const manuel = { revenue: 519000, gross_profit: 400000, payroll: 187000 };

  it("tager KUN de uudtrykkelige nøgler fra kilden — formularens nøgler bliver formularens", () => {
    const kilde = { revenue: 1, payroll: 153000, cogs: 119000, vehicle_costs: 13000, financial_costs: 10000, inventory: 1755000, kun_alias: 5 };
    expect(bevaredeNoegler(manuel, kilde, NOEGLER)).toEqual({ vehicle_costs: 13000, financial_costs: 10000, inventory: 1755000 });
    // Regnestykket: preview efter blokken = formularens 3 + de 3 bevarede = 6 nøgler; revenue er stadig 519.000 (ikke kildens 1).
    const ud = manuelPreviewMedBevarede(manuel, kilde, NOEGLER);
    expect(Object.keys(ud)).toHaveLength(6);
    expect(ud.revenue).toBe(519000);
    expect(ud.payroll).toBe(187000);
  });

  it("en nøgle, kilden ikke kender (fx cogs, som er udtrykkelig men tom i formularen), genoplives IKKE", () => {
    // cogs står ikke i NOEGLER som uudtrykkelig — et bevidst tømt formularfelt bliver tomt.
    expect(bevaredeNoegler(manuel, { cogs: 119000 }, NOEGLER)).toEqual({});
  });

  it("0 bevares (dokumentet siger 0), null og tekst gør ikke", () => {
    expect(bevaredeNoegler(manuel, { financial_costs: 0, vehicle_costs: null, inventory: "ukendt" }, NOEGLER)).toEqual({ financial_costs: 0 });
  });

  it("ingen eller ugyldig kilde → intet (jsonb_typeof <> 'object')", () => {
    expect(bevaredeNoegler(manuel, null, NOEGLER)).toEqual({});
    expect(bevaredeNoegler(manuel, undefined, NOEGLER)).toEqual({});
    expect(bevaredeNoegler(manuel, [1, 2], NOEGLER)).toEqual({});
    expect(bevaredeNoegler(manuel, "x", NOEGLER)).toEqual({});
  });

  it("en uudtrykkelig nøgle, der ALLEREDE står i previewen, overskrives ikke (formularens tal vinder)", () => {
    expect(bevaredeNoegler({ ...manuel, vehicle_costs: 1 }, { vehicle_costs: 13000 }, NOEGLER)).toEqual({});
  });
});

describe("tabteNoegler — genskabelsens regel for én facts-række", () => {
  it("kun det, facts MANGLER; en nøgle, facts har (også med 0 eller null), røres aldrig", () => {
    const facts = { revenue: 519000, payroll: 187000, financial_costs: null };
    const kilde = { vehicle_costs: 4000, financial_costs: 6000, inventory: 1709000, revenue: 1 };
    expect(tabteNoegler(facts, kilde, NOEGLER)).toEqual({ vehicle_costs: 4000, inventory: 1709000 });
  });
});
