/**
 * Beløbet i indgangens mails (10/9, recon-penge-og-roller.md §1): dag 0 og
 * dag 25 siger listeprisen «ekskl. moms»; dag 31 siger det der står på
 * fakturaen — inkl. moms når Stripe Tax regnede den, totalen alene når
 * ikke, og listeprisen ekskl. moms når fakturaen ikke kunne læses.
 */
import { describe, expect, it } from "vitest";
import { dag0Mail, dag14Mail, dag25Mail, dag31Mail, fakturaBeloebTekst } from "../../../supabase/functions/_shared/indgangsMail.ts";

describe("fakturaBeloebTekst", () => {
  it("total kendt + moms beregnet → inkl. moms (den danske kunde med adresse)", () => {
    expect(fakturaBeloebTekst({ totalOere: 6_250_000, momsBeregnet: true, listeprisKr: 50_000 })).toBe("62.500 kr. inkl. moms");
  });
  it("total kendt + moms IKKE beregnet → totalen alene (adresse mangler / EU-kunde med momsnummer)", () => {
    expect(fakturaBeloebTekst({ totalOere: 5_000_000, momsBeregnet: false, listeprisKr: 50_000 })).toBe("50.000 kr.");
    expect(fakturaBeloebTekst({ totalOere: 5_000_000, momsBeregnet: null, listeprisKr: 50_000 })).toBe("50.000 kr.");
  });
  it("total ukendt (null, 0, NaN) → listeprisen mærket ekskl. moms — aldrig et regnet 62.500", () => {
    expect(fakturaBeloebTekst({ totalOere: null, momsBeregnet: null, listeprisKr: 50_000 })).toBe("50.000 kr. ekskl. moms");
    expect(fakturaBeloebTekst({ totalOere: 0, momsBeregnet: true, listeprisKr: 40_000 })).toBe("40.000 kr. ekskl. moms");
    expect(fakturaBeloebTekst({ totalOere: Number.NaN, momsBeregnet: true, listeprisKr: 40_000 })).toBe("40.000 kr. ekskl. moms");
  });
  it("rammer ører op til hele kroner: 6.250.050 øre → 62.501", () => {
    expect(fakturaBeloebTekst({ totalOere: 6_250_050, momsBeregnet: true, listeprisKr: 50_000 })).toBe("62.501 kr. inkl. moms");
  });
});

describe("mailene", () => {
  const fælles = { fornavn: "Lisbeth", betalingsUrl: "https://app.theboardroom.dk/betal?token=x", fristDato: "2. oktober 2026" };

  it("dag 0 nævner beløbet konkret, ekskl. moms (design §9)", () => {
    const html = dag0Mail({ ...fælles, beloebKr: 50_000 }).html;
    expect(html).toContain("det fulde beløb, 50.000 kr. ekskl. moms.");
  });
  it("dag 14 nævner stadig ikke noget beløb", () => {
    const html = dag14Mail({ fornavn: "Lisbeth", betalingsUrl: fælles.betalingsUrl }).html;
    expect(html).not.toMatch(/\d\.\d{3} kr\./);
  });
  it("dag 25 siger listeprisen ekskl. moms — ens med /betal, gaten og kvitteringen", () => {
    const html = dag25Mail({ ...fælles, beloebKr: 50_000 }).html;
    expect(html).toContain("det fulde beløb, 50.000 kr. ekskl. moms.");
    expect(html).not.toContain("62.500");
  });
  it("dag 31 skriver fakturaens beløb", () => {
    expect(dag31Mail({ fornavn: "Lisbeth", beloebKr: 50_000, fakturaTotalOere: 6_250_000, momsBeregnet: true }).html)
      .toContain("en faktura på 62.500 kr. inkl. moms. Du finder den");
    expect(dag31Mail({ fornavn: "Lisbeth", beloebKr: 50_000, fakturaTotalOere: 5_000_000, momsBeregnet: false }).html)
      .toContain("en faktura på 50.000 kr. Du finder den");
    expect(dag31Mail({ fornavn: "Lisbeth", beloebKr: 50_000 }).html)
      .toContain("en faktura på 50.000 kr. ekskl. moms. Du finder den");
  });
});
