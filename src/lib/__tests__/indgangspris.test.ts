import { describe, it, expect } from "vitest";
import {
  alleIndgangsmuligheder,
  beregnIndgangspris,
  erFejl,
  INDGANGS_PRISPUNKTER_OERE,
  RATE12_TILLAEG_PCT,
  type Betalingsmodel,
  type IndgangsprisFejl,
  type IndgangsprisOk,
  type IndgangsprisResultat,
  type IndgangsmulighederOk,
  type IndgangsmulighederResultat,
} from "../indgangspris";

const ok = (r: IndgangsprisResultat): IndgangsprisOk => {
  if (erFejl(r)) throw new Error(`Forventede ok, fik: ${r.grund} — ${r.detalje}`);
  return r;
};

const fejl = (r: IndgangsprisResultat | IndgangsmulighederResultat): IndgangsprisFejl => {
  if (r.ok !== false) throw new Error("Forventede fejl, fik ok");
  return r;
};

const alleOk = (r: IndgangsmulighederResultat): IndgangsmulighederOk => {
  if (r.ok === false) throw new Error(`Forventede ok, fik: ${r.grund} — ${r.detalje}`);
  return r;
};

describe("beregnIndgangspris — de seks kombinationer (målt mod Stripe-kataloget 1-2/9)", () => {
  const forventet = [
    // niveau,    model,     samlet,    rate,      træk, lookup_key
    [5_000_000, "fuld",   5_000_000, 5_000_000,  1, "nyt_50000_fuld"],
    [5_000_000, "rate2",  5_000_000, 2_500_000,  2, "nyt_50000_rate2"],
    [5_000_000, "rate12", 5_250_000,   437_500, 12, "nyt_50000_rate12"],
    [4_000_000, "fuld",   4_000_000, 4_000_000,  1, "nyt_40000_fuld"],
    [4_000_000, "rate2",  4_000_000, 2_000_000,  2, "nyt_40000_rate2"],
    [4_000_000, "rate12", 4_200_000,   350_000, 12, "nyt_40000_rate12"],
  ] as const;

  forventet.forEach(([niveau, model, samlet, rate, traek, key]) => {
    it(`${niveau / 100} kr., ${model} → ${key}`, () => {
      const r = ok(
        beregnIndgangspris({
          prisniveau_oere: niveau as number,
          betalingsmodel: model as Betalingsmodel,
        })
      );
      expect(r.grundbeloeb_oere).toBe(niveau);
      expect(r.samlet_oere).toBe(samlet);
      expect(r.rate_oere).toBe(rate);
      expect(r.antal_traek).toBe(traek);
      expect(r.lookup_key).toBe(key);
    });
  });

  it("grundbeløbet er listeprisen, ikke det betalte — også ved rate12 (rettelsen 1/9)", () => {
    const r = ok(beregnIndgangspris({ prisniveau_oere: 5_000_000, betalingsmodel: "rate12" }));
    expect(r.grundbeloeb_oere).toBe(5_000_000);
    expect(r.samlet_oere).toBe(5_250_000);
  });
});

describe("alleIndgangsmuligheder — det betalingssiden viser", () => {
  it("50.000: tre muligheder i rækkefølgen fuld, rate2, rate12", () => {
    const r = alleOk(alleIndgangsmuligheder(5_000_000));
    expect(r.grundbeloeb_oere).toBe(5_000_000);
    expect(r.muligheder.map((m) => m.betalingsmodel)).toEqual(["fuld", "rate2", "rate12"]);
    expect(r.muligheder.map((m) => m.lookup_key)).toEqual([
      "nyt_50000_fuld",
      "nyt_50000_rate2",
      "nyt_50000_rate12",
    ]);
    expect(r.muligheder[2]).toEqual({
      betalingsmodel: "rate12",
      samlet_oere: 5_250_000,
      rate_oere: 437_500,
      antal_traek: 12,
      lookup_key: "nyt_50000_rate12",
    });
  });

  it("40.000: tre muligheder i rækkefølgen fuld, rate2, rate12", () => {
    const r = alleOk(alleIndgangsmuligheder(4_000_000));
    expect(r.grundbeloeb_oere).toBe(4_000_000);
    expect(r.muligheder.map((m) => m.betalingsmodel)).toEqual(["fuld", "rate2", "rate12"]);
    expect(r.muligheder.map((m) => m.samlet_oere)).toEqual([4_000_000, 4_000_000, 4_200_000]);
    expect(r.muligheder.map((m) => m.rate_oere)).toEqual([4_000_000, 2_000_000, 350_000]);
  });

  it("svarformen matcher hent-fornyelsestilbud: grundbeloeb_oere + muligheder med fem felter", () => {
    const r = alleOk(alleIndgangsmuligheder(5_000_000));
    for (const m of r.muligheder) {
      expect(Object.keys(m).sort()).toEqual(
        ["antal_traek", "betalingsmodel", "lookup_key", "rate_oere", "samlet_oere"]
      );
    }
  });

  it("null → intet_prisniveau, ikke en tom liste", () => {
    expect(fejl(alleIndgangsmuligheder(null)).grund).toBe("intet_prisniveau");
  });

  it("4.500.000 → ukendt_prispunkt, ikke en tom liste", () => {
    expect(fejl(alleIndgangsmuligheder(4_500_000)).grund).toBe("ukendt_prispunkt");
  });
});

describe("den fejler højt frem for at gætte", () => {
  it("prisniveau null → intet_prisniveau", () => {
    const r = beregnIndgangspris({ prisniveau_oere: null, betalingsmodel: "fuld" });
    expect(r.ok).toBe(false);
    expect(fejl(r).grund).toBe("intet_prisniveau");
  });

  it("4.500.000 → ukendt_prispunkt (45.000 findes ikke i Stripe, ingen nærmeste-match)", () => {
    const r = beregnIndgangspris({ prisniveau_oere: 4_500_000, betalingsmodel: "fuld" });
    expect(r.ok).toBe(false);
    expect(fejl(r).grund).toBe("ukendt_prispunkt");
    expect(fejl(r).detalje).toContain("45000");
  });

  it("fornyelsens prispunkter er ikke indgangens: 2.500.000 → ukendt_prispunkt", () => {
    const r = beregnIndgangspris({ prisniveau_oere: 2_500_000, betalingsmodel: "fuld" });
    expect(fejl(r).grund).toBe("ukendt_prispunkt");
  });
});

describe("låse — ændres disse, ændres priserne i Stripe og omvendt", () => {
  it("to prispunkter: præcis [4_000_000, 5_000_000]", () => {
    expect([...INDGANGS_PRISPUNKTER_OERE]).toEqual([4_000_000, 5_000_000]);
  });

  it("ratetillægget er 5 % og gælder kun 12 rater", () => {
    expect(RATE12_TILLAEG_PCT).toBe(5);
    const r2 = ok(beregnIndgangspris({ prisniveau_oere: 5_000_000, betalingsmodel: "rate2" }));
    expect(r2.samlet_oere).toBe(5_000_000);
    const rf = ok(beregnIndgangspris({ prisniveau_oere: 5_000_000, betalingsmodel: "fuld" }));
    expect(rf.samlet_oere).toBe(5_000_000);
  });

  it("rate12-summerne er 42.000 og 52.500 kr. — de tal der står i mailene", () => {
    expect(ok(beregnIndgangspris({ prisniveau_oere: 4_000_000, betalingsmodel: "rate12" })).samlet_oere).toBe(4_200_000);
    expect(ok(beregnIndgangspris({ prisniveau_oere: 5_000_000, betalingsmodel: "rate12" })).samlet_oere).toBe(5_250_000);
  });

  it("alle seks rater går op i hele ører", () => {
    for (const niveau of INDGANGS_PRISPUNKTER_OERE) {
      for (const model of ["fuld", "rate2", "rate12"] as const) {
        const r = ok(beregnIndgangspris({ prisniveau_oere: niveau, betalingsmodel: model }));
        expect(Number.isInteger(r.rate_oere)).toBe(true);
        expect(r.rate_oere * r.antal_traek).toBe(r.samlet_oere);
      }
    }
  });
});
