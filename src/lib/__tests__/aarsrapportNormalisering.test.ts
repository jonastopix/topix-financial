import { describe, it, expect } from "vitest";
// Cross-boundary import (samme mønster som weeklyFocusKpi.test.ts):
// vi tester den delte Deno-dommerlogik direkte fra vitest, så CI
// (bun run test) dækker den.
import {
  manglerOmsaetning,
  normaliserAarsrapport,
  type AarsrapportNormalisering,
} from "../../../supabase/functions/_shared/aarsrapportNormalisering.ts";

/**
 * De tretten fixtures er MÅLTE månedsværdier som de står i prod
 * (financial_report_facts, source_type annual_report, 2026-08-27) —
 * klassificeringen fra docs/aarsrapport-vejen-design.md §5 omsat til
 * test. Klasse A skal normaliseres uændret, klasse B (Alina) skal have
 * resultatlinjen vendt, klasse C/D skal afvises.
 *
 * PHILBERT er vendings-beviset for det skærpede 5 %-krav uden gulv:
 * med 500-gulvet på vendings-grenen ville en aprilbalance (forkert
 * dokument) blive vendt til "ok" (afvigelse 126 < 500 men 10,5 % af
 * |ebt|).
 */

type OkResultat = Extract<AarsrapportNormalisering, { ok: true }>;
type AfvistResultat = Extract<AarsrapportNormalisering, { ok: false }>;

// Eksplicitte casts frem for narrowing: tsconfig.app.json kører strict:false,
// hvor union-narrowing på ok-diskriminanten ikke slår igennem.
const kraevOk = (r: AarsrapportNormalisering): OkResultat => {
  if (!r.ok) {
    throw new Error(
      `Forventede ok, fik afvisning: ${(r as AfvistResultat).grund}`,
    );
  }
  return r as OkResultat;
};

const kraevAfvist = (r: AarsrapportNormalisering): AfvistResultat => {
  if (r.ok) throw new Error("Forventede afvisning, fik ok");
  return r as AfvistResultat;
};

describe("manglerOmsaetning", () => {
  // Målt eksempel: YKRG 2024 står med revenue 0 i alle tolv måneder —
  // et falsk nul skrevet i stedet for null. Et nul er ikke en måling.
  it("null, undefined, 0, -0 og NaN er manglende", () => {
    expect(manglerOmsaetning(null)).toBe(true);
    expect(manglerOmsaetning(undefined)).toBe(true);
    expect(manglerOmsaetning(0)).toBe(true);
    expect(manglerOmsaetning(-0)).toBe(true);
    expect(manglerOmsaetning(NaN)).toBe(true);
  });

  it("målte tal er ikke manglende", () => {
    expect(manglerOmsaetning(1)).toBe(false);
    expect(manglerOmsaetning(587157)).toBe(false);
    expect(manglerOmsaetning(-100)).toBe(false);
  });
});

describe("normaliserAarsrapport — ok, uændret ebt (klasse A)", () => {
  it("ANLA GLAS 2024: omkostninger vendes positive, ebt urørt", () => {
    const r = kraevOk(
      normaliserAarsrapport({
        gross_profit: 376753,
        payroll: -310629,
        depreciation: -2718,
        ebt: 62362,
      }),
    );
    expect(r.vaerdier.payroll).toBe(310629);
    expect(r.vaerdier.depreciation).toBe(2718);
    expect(r.vaerdier.ebt).toBe(62362);
    expect(r.noter).toEqual([]);
  });

  it("Booking Innovation 2024: lukker inden for tolerancen", () => {
    const r = kraevOk(
      normaliserAarsrapport({
        revenue: 83665,
        gross_profit: 17047,
        payroll: -46,
        ebt: 16978,
      }),
    );
    expect(r.vaerdier.payroll).toBe(46);
    expect(r.vaerdier.ebt).toBe(16978);
    expect(r.noter).toEqual([]);
  });

  it("Doggybed 2025: invariant 1 lukker eksakt, ægte underskud urørt", () => {
    const r = kraevOk(
      normaliserAarsrapport({
        revenue: 15836,
        gross_profit: 10770,
        cogs: -5066,
        admin_costs: -13925,
        ebt: -3157,
      }),
    );
    expect(r.vaerdier.cogs).toBe(5066);
    expect(r.vaerdier.admin_costs).toBe(13925);
    expect(r.vaerdier.ebt).toBe(-3157);
    expect(r.noter).toEqual([]);
  });

  it("Livja 2025: lille resultatlinje lukker uændret inden for gulvet", () => {
    const r = kraevOk(
      normaliserAarsrapport({
        gross_profit: 34615,
        payroll: -34547,
        ebt: 68,
      }),
    );
    expect(r.vaerdier.ebt).toBe(68);
    expect(r.noter).toEqual([]);
  });

  it("ebt 0: begge grene lukker, uændret vinder og fortegnet er stabilt", () => {
    const r = kraevOk(
      normaliserAarsrapport({ gross_profit: 1000, payroll: -1000, ebt: 0 }),
    );
    expect(Object.is(r.vaerdier.ebt, 0)).toBe(true);
    expect(r.noter).toEqual([]);
  });

  it("Topix.dk 2025: ægte underskud forbliver negativt", () => {
    const r = kraevOk(
      normaliserAarsrapport({
        revenue: 48929.75,
        gross_profit: -14966,
        payroll: -19587,
        depreciation: -5922,
        ebt: -40344,
      }),
    );
    expect(r.vaerdier.revenue).toBe(48929.75);
    expect(r.vaerdier.payroll).toBe(19587);
    expect(r.vaerdier.depreciation).toBe(5922);
    expect(r.vaerdier.ebt).toBe(-40344);
    expect(r.noter).toEqual([]);
  });

  it("YKRG 2024: revenue 0 bliver null med note, resten normaliseres", () => {
    const r = kraevOk(
      normaliserAarsrapport({
        revenue: 0,
        gross_profit: 45565,
        payroll: -117444,
        ebt: -73109,
      }),
    );
    expect(r.vaerdier.revenue).toBeNull();
    expect(r.noter).toContain(
      "revenue 0 behandlet som manglende: et nul er ikke en måling",
    );
    expect(r.vaerdier.payroll).toBe(117444);
    expect(r.vaerdier.ebt).toBe(-73109);
  });
});

describe("normaliserAarsrapport — bruttolinje under de eksterne omkostninger", () => {
  it("vej b lukker invariant 1, og admin_costs trækkes ikke fra igen i invariant 2", () => {
    // Syntetisk: rev 1.000.000 − cogs 400.000 − admin 100.000 = gp 500.000
    // (vej a fejler med præcis admin-beløbet). Invariant 2 UDEN admin:
    // 500.000 − 300.000 = 200.000 = ebt. Med admin ville den fejle —
    // testen låser netop at der ikke trækkes fra to gange.
    const r = kraevOk(
      normaliserAarsrapport({
        revenue: 1_000_000,
        gross_profit: 500_000,
        cogs: 400_000,
        admin_costs: 100_000,
        payroll: -300_000,
        ebt: 200_000,
      }),
    );
    expect(r.noter).toContain("bruttolinjen ligger under de eksterne omkostninger");
    expect(r.vaerdier.ebt).toBe(200_000);
    expect(r.vaerdier.admin_costs).toBe(100_000);
    expect(r.vaerdier.payroll).toBe(300_000);
  });
});

describe("normaliserAarsrapport — ok, ebt vendes (klasse B)", () => {
  it("Alina i kreditnegativ form: toplinje og bruttolinje vendes, resultatet dømmes af invariant 2", () => {
    // Sådan kan AI'en nu aflevere dokumentet (prompten beder ikke længere
    // om fortegnsvending): omsætning og bruttoresultat i dokumentets egen
    // kreditnegative konvention. Uden regel 2b ville invariant 1 give
    // −150691 − 38601 = −189292 mod −112090 og afvise den sag porten
    // netop skal redde.
    const r = kraevOk(
      normaliserAarsrapport({
        revenue: -150691,
        gross_profit: -112090,
        cogs: 38601,
        payroll: 46796,
        depreciation: 2207,
        admin_costs: 29892,
        ebt: -33208,
      }),
    );
    expect(r.vaerdier.revenue).toBe(150691);
    expect(r.vaerdier.gross_profit).toBe(112090);
    expect(r.vaerdier.ebt).toBe(33208);
    expect(r.noter).toContain(
      "dokumentet er kreditnegativt: omsætning og bruttoresultat vendt",
    );
    expect(r.noter).toContain(
      "resultatlinjen vendt: dokumentet er kreditnegativt",
    );
  });

  it("Alina Beauty & Skincare 2025: kreditnegativt dokument, overskud genoprettes", () => {
    const r = kraevOk(
      normaliserAarsrapport({
        revenue: 150691,
        gross_profit: 112090,
        cogs: 38601,
        payroll: -46796,
        depreciation: 2207,
        admin_costs: 29892,
        ebt: -33208,
      }),
    );
    expect(r.vaerdier.ebt).toBe(33208);
    expect(r.noter).toContain(
      "resultatlinjen vendt: dokumentet er kreditnegativt",
    );
    expect(r.vaerdier.cogs).toBe(38601);
    expect(r.vaerdier.payroll).toBe(46796);
    expect(r.vaerdier.depreciation).toBe(2207);
    expect(r.vaerdier.admin_costs).toBe(29892);
  });
});

describe("normaliserAarsrapport — ikke ok (klasse C/D)", () => {
  it("Floren Engros 2024: bruttolinje under eksterne lukker invariant 1, men resultatet lukker ikke", () => {
    // Invariant 1 lukker ad vej b (109.154 − 46.603 = 62.551 på kronen),
    // så admin_costs udelades af invariant 2: beregnet = 62.551 − 61.042
    // − 0 = 1.509 mod ebt 359 — afvigelse 1.150 > tolerance 500.
    const r = kraevAfvist(
      normaliserAarsrapport({
        revenue: 357266,
        gross_profit: 62551,
        cogs: 248112,
        payroll: -61042,
        admin_costs: 46603,
        ebt: 359,
      }),
    );
    expect(r.grund).toBe("regnestykket_lukker_ikke");
    expect(r.beregnet).toBe(1509); // 62551 − 61042 − 0 (admin udeladt, vej b)
    expect(r.forventet).toBe(359);
    expect(r.afvigelse).toBe(1150);
  });

  it("Floren Engros 2025: brutto stemmer ikke (invariant 1)", () => {
    const r = kraevAfvist(
      normaliserAarsrapport({
        revenue: 413013,
        gross_profit: 92290,
        cogs: -4335,
        payroll: -91761,
        admin_costs: -53468,
        ebt: -1674,
      }),
    );
    expect(r.grund).toBe("brutto_stemmer_ikke");
    expect(r.beregnet).toBe(408678); // 413013 − 4335
    expect(r.forventet).toBe(92290);
    expect(r.afvigelse).toBe(316388);
  });

  it("PHILBERT ApS 2025: aprilbalance — vending afvises på skærpet bevis", () => {
    const r = kraevAfvist(
      normaliserAarsrapport({
        revenue: 16070,
        gross_profit: 15355,
        cogs: 715,
        payroll: -47,
        depreciation: 0,
        admin_costs: 13986,
        ebt: -1196,
      }),
    );
    expect(r.grund).toBe("regnestykket_lukker_ikke");
    expect(r.beregnet).toBe(1322); // 15355 − 47 − 0 − 13986
    expect(r.forventet).toBe(-1196);
    expect(r.afvigelse).toBe(2518);
  });

  it("Rezycl.com 2025: saldobalance — lukker ingen veje", () => {
    const r = kraevAfvist(
      normaliserAarsrapport({
        revenue: 167620,
        gross_profit: -98223,
        payroll: 3478,
        depreciation: 2125,
        admin_costs: 1323,
        ebt: -63296,
      }),
    );
    expect(r.grund).toBe("regnestykket_lukker_ikke");
    expect(r.beregnet).toBe(-105149); // −98223 − 3478 − 2125 − 1323
    expect(r.forventet).toBe(-63296);
    expect(r.afvigelse).toBe(41853);
  });

  it("Booking Innovation 2025: gross_profit mangler — for få felter", () => {
    const r = kraevAfvist(
      normaliserAarsrapport({
        revenue: 62493,
        ebt: 11369,
      }),
    );
    expect(r.grund).toBe("for_faa_felter");
    expect(r.beregnet).toBeNull();
    expect(r.forventet).toBeNull();
    expect(r.afvigelse).toBeNull();
  });

  it("remm. 2025 (klasse D): alle omkostningsnøgler mangler — omkostninger_ikke_udtrukket", () => {
    const r = kraevAfvist(
      normaliserAarsrapport({
        revenue: 109671,
        gross_profit: 34199,
        ebt: 26934,
      }),
    );
    expect(r.grund).toBe("omkostninger_ikke_udtrukket");
    expect(r.beregnet).toBe(34199);
    expect(r.forventet).toBe(26934);
    expect(r.afvigelse).toBe(7265);
  });
});
