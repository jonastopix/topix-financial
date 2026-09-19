import { describe, expect, it } from "vitest";
import { intervalOrd, kvartiler, median, pct, sammenlign, wilson, Z_95 } from "@/lib/marketing/statistik";

/**
 * Matematikken bag lag 6. Den er værd at prøve HÅRDT: hele lagets værdi er, at
 * det ved hvornår det ikke ved noget, og den viden ligger i disse tal.
 */
describe("wilson — rigtigt netop dér, hvor normaltilnærmelsen er forkert", () => {
  it("0 af 3 er IKKE [0, 0] — vi er ikke sikre på at ingen konverterer", () => {
    const i = wilson(0, 3)!;
    expect(i.andel).toBe(0);
    expect(i.nedre).toBe(0);
    expect(i.oevre).toBeCloseTo(0.5614, 3);
  });

  it("3 af 3 er IKKE [1, 1] — tre ud af tre beviser ikke hundrede procent", () => {
    const i = wilson(3, 3)!;
    expect(i.nedre).toBeCloseTo(0.4386, 3);
    expect(i.oevre).toBe(1);
  });

  it("kendte værdier: 5 af 10 og 0 af 10", () => {
    const halv = wilson(5, 10)!;
    expect(halv.nedre).toBeCloseTo(0.2366, 3);
    expect(halv.oevre).toBeCloseTo(0.7634, 3);
    const nul = wilson(0, 10)!;
    expect(nul.oevre).toBeCloseTo(0.2775, 3);
  });

  it("intervallet bliver smallere, jo mere vi ved", () => {
    const bredder = [10, 50, 200, 1000].map((n) => wilson(Math.round(n / 2), n)!.bredde);
    for (let i = 1; i < bredder.length; i++) expect(bredder[i]).toBeLessThan(bredder[i - 1]);
  });

  it("aldrig uden for [0, 1], uanset input", () => {
    for (const [s, n] of [[0, 1], [1, 1], [1, 2], [7, 7], [0, 1000], [1000, 1000]] as const) {
      const i = wilson(s, n)!;
      expect(i.nedre).toBeGreaterThanOrEqual(0);
      expect(i.oevre).toBeLessThanOrEqual(1);
      expect(i.nedre).toBeLessThanOrEqual(i.oevre);
    }
  });

  it("n = 0 giver NULL — der findes ingen andel af ingenting", () => {
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(3, 0)).toBeNull();
    expect(wilson(1, -5)).toBeNull();
    expect(wilson(Number.NaN, 10)).toBeNull();
  });

  it("succes over n klippes — et forhold kan ikke overstige 1", () => {
    const i = wilson(15, 10)!;
    expect(i.succes).toBe(10);
    expect(i.andel).toBe(1);
  });

  it("z er 95 % tosidet", () => expect(Z_95).toBeCloseTo(1.96, 2));
});

describe("sammenlign — «kan ikke afgøres» er et gyldigt svar", () => {
  it("adskilte intervaller betyder en reel forskel", () => {
    expect(sammenlign(wilson(90, 100), wilson(10, 100))).toBe("adskilte");
  });

  it("DE SMÅ TAL, hele laget findes for: 2 af 14 mod 1 af 13 kan IKKE skelnes", () => {
    expect(sammenlign(wilson(2, 14), wilson(1, 13))).toBe("overlapper");
  });

  it("overlap betyder ikke «ens» — kun «vi ved det ikke»", () => {
    // 40 % mod 20 % ved n = 20 ser stort ud og kan alligevel ikke afgøres.
    expect(sammenlign(wilson(8, 20), wilson(4, 20))).toBe("overlapper");
  });

  it("uden data kan intet sammenlignes", () => {
    expect(sammenlign(wilson(1, 10), null)).toBe("kan_ikke");
    expect(sammenlign(null, null)).toBe("kan_ikke");
  });
});

describe("ordene", () => {
  it("små andele rundes ikke til nul", () => {
    expect(pct(1 / 594)).toBe("0,2 %");
    expect(pct(0)).toBe("0 %");
    expect(pct(null)).toBe("–");
    expect(pct(0.324)).toBe("32 %");
  });

  it("intervallet skrives med sin bredde — aldrig tallet alene", () => {
    expect(intervalOrd(wilson(2, 14))).toBe("14 % (4–40 %)");
    expect(intervalOrd(null)).toBe("–");
  });
});

describe("median og kvartiler — valgt frem for gennemsnit", () => {
  it("én sen ansøger flytter gennemsnittet, men ikke medianen", () => {
    const normale = [2, 3, 4, 5, 6];
    const medEnSen = [...normale, 960];
    const gns = (t: number[]) => t.reduce((a, b) => a + b, 0) / t.length;
    expect(median(normale)).toBe(4);
    expect(median(medEnSen)).toBe(4.5);
    expect(gns(medEnSen) - gns(normale)).toBeGreaterThan(155);
  });

  it("kvartilerne viser spredningen", () => {
    const k = kvartiler([1, 2, 3, 4, 5])!;
    expect(k.p25).toBe(2);
    expect(k.p50).toBe(3);
    expect(k.p75).toBe(4);
  });

  it("tom liste giver null, ikke nul", () => {
    expect(median([])).toBeNull();
    expect(kvartiler([])).toBeNull();
  });
});
