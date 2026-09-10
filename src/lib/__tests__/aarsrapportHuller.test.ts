/**
 * aarsrapportHuller (10/9-2026): et manglende tal er ikke nul. Reglerne gælder
 * kun estimerede rækker (årsrapport /12); målte måneder regner som før.
 */
import { describe, expect, it } from "vitest";
import {
  AARSRAPPORT_FELTER,
  aarsrapportHulTekst,
  faktaTilKf,
  manglendeAarsrapportFelter,
  omkostningerKendte,
  renskEstimatKf,
} from "../aarsrapportHuller";

describe("renskEstimatKf — nul der ikke er et tal", () => {
  it("YKRG 2024: omsætning 0 ved siden af bruttoresultat 45.565 i en estimeret række → omsætning fjernes (ikke læst)", () => {
    const kf = renskEstimatKf({ omsaetning: 0, daekningsbidrag: 45_565, loenninger: 117_444 }, "estimated");
    expect(kf.omsaetning).toBeUndefined();
    expect(kf.daekningsbidrag).toBe(45_565);
    expect(kf.loenninger).toBe(117_444);
  });

  it("omsætning 0 med vareforbrug ≠ 0 er også umuligt → fjernes", () => {
    expect(renskEstimatKf({ omsaetning: 0, direkte_omkostninger: 12_000 }, "estimated").omsaetning).toBeUndefined();
  });

  it("omsætning 0 hvor bruttoresultat og vareforbrug også er 0 (eller mangler) er et lovligt nul — bevares", () => {
    expect(renskEstimatKf({ omsaetning: 0, daekningsbidrag: 0 }, "estimated").omsaetning).toBe(0);
    expect(renskEstimatKf({ omsaetning: 0 }, "estimated").omsaetning).toBe(0);
  });

  it("målte rækker røres ikke — dér er 0 et tal", () => {
    const kf = { omsaetning: 0, daekningsbidrag: 45_565 };
    expect(renskEstimatKf(kf, "measured")).toEqual(kf);
  });

  it("faktaTilKf: adapter + renselse i ét — null-nøgler droppes, umuligt nul fjernes", () => {
    const kf = faktaTilKf({ metrics: { revenue: 0, gross_profit: 45_565, payroll: null, cogs: null }, data_basis: "estimated" });
    expect(kf).toEqual({ daekningsbidrag: 45_565 });
  });
});

describe("manglendeAarsrapportFelter — hvilke af de fem der ikke blev læst", () => {
  it("remm. 2025: oms og bruttoresultat læst; vareforbrug, personale og øvrige mangler", () => {
    expect(manglendeAarsrapportFelter({ omsaetning: 109_671, daekningsbidrag: 34_199 })).toEqual([
      "direkte_omkostninger",
      "loenninger",
      "administrationsomkostninger",
    ]);
  });
  it("et helt udtræk: ingen mangler", () => {
    const hel = Object.fromEntries(AARSRAPPORT_FELTER.map((f) => [f, 1]));
    expect(manglendeAarsrapportFelter(hel)).toEqual([]);
  });
  it("YKRG efter renselse: omsætningen tælles som manglende", () => {
    expect(manglendeAarsrapportFelter(faktaTilKf({ metrics: { revenue: 0, gross_profit: 45_565, payroll: 117_444 }, data_basis: "estimated" }))).toEqual([
      "omsaetning",
      "direkte_omkostninger",
      "administrationsomkostninger",
    ]);
  });
});

describe("omkostningerKendte — summen af det der blev læst er ikke «samlede omkostninger»", () => {
  const remm = { omsaetning: 109_671, daekningsbidrag: 34_199, loenninger: 117_444, afskrivninger: 1_000 };
  it("estimeret række med et manglende omkostningsfelt → null", () => {
    expect(omkostningerKendte(remm, "estimated")).toBeNull();
  });
  it("estimeret række hvor alle fire omkostningsfelter er læst → summen", () => {
    expect(omkostningerKendte({ direkte_omkostninger: 10, loenninger: 20, administrationsomkostninger: 30, afskrivninger: 40 }, "estimated")).toBe(100);
  });
  it("målt måned regner som før: manglende post = 0, sum > 0 ellers null", () => {
    expect(omkostningerKendte(remm, "measured")).toBe(118_444);
    expect(omkostningerKendte(remm, undefined)).toBe(118_444);
    expect(omkostningerKendte({ omsaetning: 5 }, "measured")).toBeNull();
  });
});

describe("aarsrapportHulTekst — rolig, siger tomt er ikke nul", () => {
  it("flere felter", () => {
    const t = aarsrapportHulTekst(["direkte_omkostninger", "loenninger", "administrationsomkostninger"]);
    expect(t).toBe(
      "I årsrapporten kunne vi ikke læse vareforbrug, personaleomkostninger og øvrige omkostninger. De felter står tomme her — ikke som nul. Tal der bygger på dem (fx samlede omkostninger) vises heller ikke.",
    );
  });
  it("ét felt — og omsætning kaldes omsætning", () => {
    expect(aarsrapportHulTekst(["omsaetning"])).toBe(
      "I årsrapporten kunne vi ikke læse omsætning. Det felt står tomt her — ikke som nul. Tal der bygger på det (fx samlede omkostninger) vises heller ikke.",
    );
  });
  it("ingen huller → ingen tekst; ingen udråb, skyld eller nøglenavne i teksten", () => {
    expect(aarsrapportHulTekst([])).toBeNull();
    const t = aarsrapportHulTekst([...AARSRAPPORT_FELTER])!;
    expect(t).not.toMatch(/!|fejl|error|_/i);
  });
});
