import { describe, it, expect } from "vitest";
import {
  beloebFraFaktura,
  beregnIndgangsPeriode,
  erIndgangsFaktura,
  kundeIdFraFaktura,
} from "../../../supabase/functions/_shared/indgangsFakturaBetaling.ts";

// Den rene del af invoice.paid-grenen (docs/indgangen-design.md §30):
// kun VORES fakturaer håndteres, beløbet er uden moms som checkoutens,
// og perioden løber fra betalingsdagen.

const COMPANY = "0f2b6a1e-1b7c-4c3e-9b1a-2d3e4f5a6b7c";

describe("erIndgangsFaktura", () => {
  it("kræver BÅDE metadata.art = indgang OG metadata.company_id på selve fakturaen", () => {
    expect(erIndgangsFaktura({ id: "in_1", metadata: { art: "indgang", company_id: COMPANY } })).toBe(true);
    expect(erIndgangsFaktura({ id: "in_2", metadata: { art: "indgang" } })).toBe(false);
    expect(erIndgangsFaktura({ id: "in_3", metadata: { company_id: COMPANY } })).toBe(false);
    expect(erIndgangsFaktura({ id: "in_4", metadata: { art: "fornyelse", company_id: COMPANY } })).toBe(false);
    expect(erIndgangsFaktura({ id: "in_5", metadata: { art: "indgang", company_id: "   " } })).toBe(false);
  });

  it("et abonnements månedsfaktura (tom metadata på fakturaen) falder igennem", () => {
    expect(erIndgangsFaktura({ id: "in_sub", metadata: {} })).toBe(false);
    expect(erIndgangsFaktura({ id: "in_sub2", metadata: null })).toBe(false);
    expect(erIndgangsFaktura({ id: "in_sub3" })).toBe(false);
  });
});

describe("beloebFraFaktura — uden moms, som checkoutens samlet_oere", () => {
  it("foretrækker total_excluding_tax frem for amount_paid (inkl. moms)", () => {
    const r = beloebFraFaktura({ id: "in_1", total_excluding_tax: 5_000_000, amount_paid: 6_250_000 });
    expect(r).toEqual({ beloeb_oere: 5_000_000, kilde: "total_excluding_tax" });
  });

  it("uden moms beregnet er total_excluding_tax = amount_paid, og det er stadig ekskl.-tallet", () => {
    const r = beloebFraFaktura({ id: "in_1", total_excluding_tax: 5_000_000, amount_paid: 5_000_000 });
    expect(r?.beloeb_oere).toBe(5_000_000);
  });

  it("falder tilbage på amount_paid og siger det i kilden", () => {
    const r = beloebFraFaktura({ id: "in_1", total_excluding_tax: null, amount_paid: 6_250_000 });
    expect(r).toEqual({ beloeb_oere: 6_250_000, kilde: "amount_paid" });
  });

  it("null når ingen af tallene findes", () => {
    expect(beloebFraFaktura({ id: "in_1" })).toBeNull();
    expect(beloebFraFaktura({ id: "in_1", total_excluding_tax: Number.NaN, amount_paid: undefined })).toBeNull();
  });
});

describe("kundeIdFraFaktura", () => {
  it("tager både id-streng og udfoldet objekt", () => {
    expect(kundeIdFraFaktura({ id: "in_1", customer: "cus_1" })).toBe("cus_1");
    expect(kundeIdFraFaktura({ id: "in_1", customer: { id: "cus_2" } })).toBe("cus_2");
    expect(kundeIdFraFaktura({ id: "in_1", customer: null })).toBeNull();
    expect(kundeIdFraFaktura({ id: "in_1", customer: "" })).toBeNull();
  });
});

describe("beregnIndgangsPeriode — fra betalingsdagen, tolv måneder frem", () => {
  it("2026-09-03 → 2026-09-03 til 2027-09-03", () => {
    expect(beregnIndgangsPeriode(new Date("2026-09-03T14:12:00.000Z"))).toEqual({
      periode_start: "2026-09-03",
      periode_slut: "2027-09-03",
    });
  });

  it("regner på UTC-komponenter — sen aften UTC skifter ikke dag", () => {
    expect(beregnIndgangsPeriode(new Date("2026-12-31T23:59:59.000Z"))).toEqual({
      periode_start: "2026-12-31",
      periode_slut: "2027-12-31",
    });
  });

  it("perioden er altid længere end nul dage (company_perioder_slut_efter_start)", () => {
    const p = beregnIndgangsPeriode(new Date("2027-02-28T10:00:00.000Z"));
    expect(p.periode_slut > p.periode_start).toBe(true);
  });
});
