import { describe, it, expect } from "vitest";
import {
  beregnFornyelsespris,
  erFejl,
  PRISPUNKTER_OERE,
  RATE12_TILLAEG_PCT,
  type FornyelsesprisFejl,
  type FornyelsesprisOk,
  type FornyelsesprisResultat,
} from "../fornyelsespris";

const ok = (r: FornyelsesprisResultat): FornyelsesprisOk => {
  if (erFejl(r)) throw new Error(`Forventede ok, fik: ${r.grund} — ${r.detalje}`);
  return r;
};

const fejl = (r: FornyelsesprisResultat): FornyelsesprisFejl => {
  if (!erFejl(r)) throw new Error(`Forventede fejl, fik ok: ${r.lookup_key}`);
  return r;
};

describe("beregnFornyelsespris — de ni kombinationer", () => {
  const forventet = [
    // indgang,  model,     grund,     samlet,    rate,     lookup_key
    [3_000_000, "fuld",   1_500_000, 1_500_000, 1_500_000, "fornyelse_15000_fuld"],
    [3_000_000, "rate2",  1_500_000, 1_500_000,   750_000, "fornyelse_15000_rate2"],
    [3_000_000, "rate12", 1_500_000, 1_575_000,   131_250, "fornyelse_15000_rate12"],
    [4_000_000, "fuld",   2_000_000, 2_000_000, 2_000_000, "fornyelse_20000_fuld"],
    [4_000_000, "rate2",  2_000_000, 2_000_000, 1_000_000, "fornyelse_20000_rate2"],
    [4_000_000, "rate12", 2_000_000, 2_100_000,   175_000, "fornyelse_20000_rate12"],
    [5_000_000, "fuld",   2_500_000, 2_500_000, 2_500_000, "fornyelse_25000_fuld"],
    [5_000_000, "rate2",  2_500_000, 2_500_000, 1_250_000, "fornyelse_25000_rate2"],
    [5_000_000, "rate12", 2_500_000, 2_625_000,   218_750, "fornyelse_25000_rate12"],
  ] as const;

  forventet.forEach(([indgang, model, grund, samlet, rate, key]) => {
    it(`${indgang / 100} kr. ind, ${model} → ${key}`, () => {
      const r = ok(
        beregnFornyelsespris({
          indgangspris_oere: indgang as number,
          fornyelsespris_oere: null,
          betalingsmodel: model as any,
        })
      );
      expect(r.grundbeloeb_oere).toBe(grund);
      expect(r.samlet_oere).toBe(samlet);
      expect(r.rate_oere).toBe(rate);
      expect(r.lookup_key).toBe(key);
      expect(r.kilde).toBe("beregnet");
    });
  });
});

describe("afvigelsen vinder over reglen", () => {
  it("gemt fornyelsespris bruges frem for halvdelen af indgangsprisen", () => {
    const r = ok(
      beregnFornyelsespris({
        indgangspris_oere: 5_000_000,   // ville give 25.000
        fornyelsespris_oere: 2_000_000, // men aftalen siger 20.000
        betalingsmodel: "fuld",
      })
    );
    expect(r.grundbeloeb_oere).toBe(2_000_000);
    expect(r.lookup_key).toBe("fornyelse_20000_fuld");
    expect(r.kilde).toBe("afvigelse");
  });

  it("afvigelse uden for kataloget fejler også — ingen nærmeste-match", () => {
    const r = beregnFornyelsespris({
      indgangspris_oere: 4_000_000,
      fornyelsespris_oere: 2_250_000,
      betalingsmodel: "fuld",
    });
    expect(r.ok).toBe(false);
    expect(fejl(r).grund).toBe("ukendt_prispunkt");
  });
});

describe("den fejler højt frem for at gætte", () => {
  it("uden indgangspris og uden afvigelse", () => {
    const r = beregnFornyelsespris({
      indgangspris_oere: null,
      fornyelsespris_oere: null,
      betalingsmodel: "fuld",
    });
    expect(r.ok).toBe(false);
    expect(fejl(r).grund).toBe("ingen_indgangspris");
  });

  it("indgangspris der ikke halverer til et kendt prispunkt", () => {
    const r = beregnFornyelsespris({
      indgangspris_oere: 4_500_000, // → 22.500, findes ikke i Stripe
      fornyelsespris_oere: null,
      betalingsmodel: "fuld",
    });
    expect(r.ok).toBe(false);
    expect(fejl(r).grund).toBe("ukendt_prispunkt");
  });
});

describe("låse — ændres disse, ændres priserne i produktion", () => {
  it("tre prispunkter: 15.000, 20.000, 25.000", () => {
    expect(PRISPUNKTER_OERE).toEqual([1_500_000, 2_000_000, 2_500_000]);
  });

  it("ratetillægget er 5 % og gælder kun 12 rater", () => {
    expect(RATE12_TILLAEG_PCT).toBe(5);
    const r2 = ok(beregnFornyelsespris({ indgangspris_oere: 4_000_000, fornyelsespris_oere: null, betalingsmodel: "rate2" }));
    expect(r2.samlet_oere).toBe(2_000_000);
  });
});
