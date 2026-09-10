import { describe, expect, it, vi } from "vitest";

// budgetEngine (deriveGrowthFactor) importerer supabase-klienten til sine
// skriveveje — mockes væk som i budgetEngine.test.ts.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  aktualerFraFacts,
  estimeredeMaaneder,
  forecastSerie,
  nettoFlow,
  saldoKurve,
  sumMaalteOmkostninger,
  type MaanedsAktual,
} from "@/lib/budgetAktualer";

/**
 * Reglen (7/9): undefined er ukendt, 0 er nul. Målt i prod 7/9: 314 facts,
 * 277 med et tal, 12 med revenue = 0, 25 UDEN nøglen — begge tilstande er
 * reelle, og de to budgetkomponenter behandlede dem ens (`?? 0`).
 */
const fact = (period_key: string, metrics: Record<string, number | null>) => ({ period_key, metrics });
const budget12 = (v: number) => Array.from({ length: 12 }, () => v);

describe("aktualerFraFacts — en umålt metric er null, en målt nul er 0", () => {
  it("rapport uden omsætningslinje → omsaetning null (ikke 0)", () => {
    const a = aktualerFraFacts([fact("2026-03", { payroll: -40000, cash: 100000 })], "2026", { medAfskrivninger: true });
    expect(a[2]).toEqual({ omsaetning: null, omkostninger: 40000, bank: 100000 });
  });

  it("rapport med revenue = 0 → omsaetning 0 (en målt nul)", () => {
    const a = aktualerFraFacts([fact("2026-03", { revenue: 0, payroll: -40000 })], "2026", { medAfskrivninger: true });
    expect(a[2].omsaetning).toBe(0);
  });

  it("revenue som JSON-null behandles som umålt", () => {
    const a = aktualerFraFacts([fact("2026-03", { revenue: null, payroll: -40000 })], "2026", { medAfskrivninger: true });
    expect(a[2].omsaetning).toBeNull();
  });

  it("måned uden fact er ikke i mappet; andre år filtreres fra", () => {
    const a = aktualerFraFacts([fact("2026-01", { revenue: 10 }), fact("2025-12", { revenue: 99 })], "2026", { medAfskrivninger: true });
    expect(Object.keys(a)).toEqual(["0"]);
  });

  it("omkostninger: null når ingen post er målt; summen af de målte ellers; afskrivninger kun når bedt", () => {
    expect(sumMaalteOmkostninger({}, true)).toBeNull();
    expect(sumMaalteOmkostninger({ loenninger: null, salgsomkostninger: null }, true)).toBeNull();
    expect(sumMaalteOmkostninger({ loenninger: -40000, salgsomkostninger: 5000 }, true)).toBe(45000);
    expect(sumMaalteOmkostninger({ loenninger: 0 }, true)).toBe(0);
    expect(sumMaalteOmkostninger({ afskrivninger: 1000 }, true)).toBe(1000);
    expect(sumMaalteOmkostninger({ afskrivninger: 1000 }, false)).toBeNull();
  });
});

describe("forecastSerie — ukendte måneder holdes ude af faktoren og forecastes; en målt nul tæller", () => {
  const budget = budget12(100000);

  it("alle tre målte til budget → faktor 1, resten = budget", () => {
    const s = forecastSerie([100000, 100000, 100000, ...Array(9).fill(null)], budget);
    expect(s.faktor).toBe(1);
    expect(s.sidsteRealiseret).toBe(2);
    expect(s.vaerdier.slice(0, 3)).toEqual([100000, 100000, 100000]);
    expect(s.vaerdier.slice(3)).toEqual(Array(9).fill(100000));
    expect(s.realiseret.slice(0, 4)).toEqual([true, true, true, false]);
  });

  it("en MANGLENDE måned midt i (rapport uden tal) ændrer IKKE faktoren og udfyldes med budget × faktor", () => {
    const s = forecastSerie([100000, null, 100000, ...Array(9).fill(null)], budget);
    expect(s.faktor).toBe(1);
    expect(s.vaerdier[1]).toBe(100000); // budget × 1, ikke 0
    expect(s.realiseret[1]).toBe(false);
    expect(s.sidsteRealiseret).toBe(2);
  });

  it("en MÅLT nul midt i trækker faktoren ned — det er en måling", () => {
    const s = forecastSerie([100000, 0, 100000, ...Array(9).fill(null)], budget);
    expect(s.faktor).toBeCloseTo(2 / 3, 6);
    expect(s.vaerdier[1]).toBe(0);
    expect(s.realiseret[1]).toBe(true);
    expect(s.vaerdier[3]).toBe(Math.round(100000 * (2 / 3)));
  });

  it("blanding: målt, manglende, målt nul — kun de målte i faktoren, hullet forecastes, nullet står", () => {
    const s = forecastSerie([120000, null, 0, 80000, ...Array(8).fill(null)], budget);
    // faktor = gns(120000, 0, 80000) / gns(100000 ×3) = 200000/300000
    expect(s.faktor).toBeCloseTo(2 / 3, 6);
    expect(s.vaerdier[1]).toBe(Math.round(100000 * (2 / 3)));
    expect(s.vaerdier[2]).toBe(0);
    expect(s.realiseret).toEqual([true, false, true, true, ...Array(8).fill(false)]);
  });

  it("kun én målt måned der er 0 → faktor clamp 0,1 (som før) — men KUN når nullet er målt", () => {
    expect(forecastSerie([0, ...Array(11).fill(null)], budget).faktor).toBe(0.1);
    expect(forecastSerie(Array(12).fill(null), budget).faktor).toBe(1);
    expect(forecastSerie(Array(12).fill(null), budget).sidsteRealiseret).toBe(-1);
  });

  it("faktoren regnes mod budgettet i de SAMME måneder som de målte (ikke et præfiks)", () => {
    const b = [50000, 100000, 100000, ...Array(9).fill(100000)];
    // jan mangler, feb og mar målt til 100000 → mod feb+mar-budget (100000) = 1, ikke mod jan+feb (75000)
    expect(forecastSerie([null, 100000, 100000, ...Array(9).fill(null)], b).faktor).toBe(1);
  });
});

describe("nettoFlow og saldoKurve — en rapport uden tal er forecast, aldrig et fald", () => {
  const A = (a: Partial<MaanedsAktual>): MaanedsAktual => ({ omsaetning: null, omkostninger: null, bank: null, ...a });
  const budgetNet = budget12(10000);

  it("nettoFlow: kendt kun med både omsætning og omkostninger; en målt nul-omsætning giver et kendt (negativt) flow", () => {
    expect(nettoFlow(undefined)).toBeNull();
    expect(nettoFlow(A({ omkostninger: 40000 }))).toBeNull();
    expect(nettoFlow(A({ omsaetning: 50000 }))).toBeNull();
    expect(nettoFlow(A({ omsaetning: 0, omkostninger: 40000 }))).toBe(-40000);
    expect(nettoFlow(A({ omsaetning: 50000, omkostninger: 40000 }))).toBe(10000);
  });

  it("rapport med lønpost men UDEN omsætning: måneden er forecast med budgettets flow — ikke −løn som realiseret", () => {
    const k = saldoKurve(100000, { 0: A({ omkostninger: 40000 }) }, budgetNet);
    expect(k[0]).toMatchObject({ actual: null, forecast: 110000, isActual: false, rapportUdenTal: true, nettoFlow: 10000 });
  });

  it("samme rapport med revenue = 0: en målt nul giver et realiseret fald", () => {
    const k = saldoKurve(100000, { 0: A({ omsaetning: 0, omkostninger: 40000 }) }, budgetNet);
    expect(k[0]).toMatchObject({ actual: 60000, forecast: null, isActual: true, rapportUdenTal: false, nettoFlow: -40000 });
  });

  it("banksaldo målt sætter saldoen uanset nettoflow; måned uden fact er forecast uden rapportUdenTal", () => {
    const k = saldoKurve(100000, { 0: A({ bank: 250000 }) }, budgetNet);
    expect(k[0]).toMatchObject({ actual: 250000, isActual: true, rapportUdenTal: false, nettoFlow: 10000 });
    expect(k[1]).toMatchObject({ actual: null, forecast: 260000, isActual: false, rapportUdenTal: false });
    expect(k[11].budget).toBe(100000 + 12 * 10000);
  });

  it("blanding: målt, rapport uden tal, målt nul — saldoen går aldrig ned på et hul", () => {
    const k = saldoKurve(0, { 0: A({ omsaetning: 50000, omkostninger: 40000 }), 1: A({ omkostninger: 40000 }), 2: A({ omsaetning: 0, omkostninger: 40000 }) }, budgetNet);
    expect(k.map((p) => p.actual ?? p.forecast).slice(0, 3)).toEqual([10000, 20000, -20000]);
    expect(k.map((p) => p.isActual).slice(0, 3)).toEqual([true, false, true]);
    expect(k[1].rapportUdenTal).toBe(true);
  });
});

describe("estimater er ikke realiserede (data_basis-kontrakten, 10/9)", () => {
  const est = (period_key: string, metrics: Record<string, number | null>) => ({ period_key, metrics, data_basis: "estimated" as const });
  const maalt = (period_key: string, metrics: Record<string, number | null>) => ({ period_key, metrics, data_basis: "measured" as const });

  it("en estimeret række (årsrapport /12) kommer ikke i aktualerne — før talte den som realiseret", () => {
    const a = aktualerFraFacts([est("2025-03", { revenue: 9_139, payroll: -9_787, cash: 50_000 })], "2025", { medAfskrivninger: true });
    expect(a[2]).toBeUndefined();
    expect(Object.keys(a)).toEqual([]);
  });

  it("en målt række kommer i aktualerne som før; en fact UDEN data_basis regnes som målt (ældre kaldere)", () => {
    const a = aktualerFraFacts([maalt("2026-03", { revenue: 100_000, payroll: -40_000 }), fact("2026-04", { revenue: 110_000 })], "2026", { medAfskrivninger: true });
    expect(a[2]).toEqual({ omsaetning: 100_000, omkostninger: 40_000, bank: null });
    expect(a[3]).toEqual({ omsaetning: 110_000, omkostninger: null, bank: null });
  });

  it("blandet år (YKRG-formen: 2 målte, 10 estimerede): kun de estimerede måneder mærkes, kun de målte er aktualer", () => {
    const facts = [
      ...Array.from({ length: 12 }, (_, i) => est(`2024-${String(i + 1).padStart(2, "0")}`, { revenue: 0, gross_profit: 45_565, payroll: 117_444 })),
      maalt("2024-11", { revenue: 80_000, payroll: -30_000 }),
      maalt("2024-12", { revenue: 90_000, payroll: -30_000 }),
    ];
    expect(estimeredeMaaneder(facts, "2024")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const a = aktualerFraFacts(facts, "2024", { medAfskrivninger: false });
    expect(Object.keys(a).map(Number)).toEqual([10, 11]);
  });

  it("en virksomhed der kun rapporterer månedligt ser intet nyt: ingen estimerede måneder, aktualerne uændrede", () => {
    const facts = Array.from({ length: 8 }, (_, i) => maalt(`2026-${String(i + 1).padStart(2, "0")}`, { revenue: 100_000 + i, payroll: -40_000 }));
    expect(estimeredeMaaneder(facts, "2026")).toEqual([]);
    expect(Object.keys(aktualerFraFacts(facts, "2026", { medAfskrivninger: true })).length).toBe(8);
  });

  it("estimeredeMaaneder filtrerer på år og ignorerer ulæselige nøgler", () => {
    expect(estimeredeMaaneder([est("2025-01", {}), est("2026-13", {}), est("2026-02", {})], "2026")).toEqual([1]);
  });

  it("forecastet regner kun på målinger: et estimatår giver ingen realiserede måneder og faktor fra budgettet alene", () => {
    const facts = Array.from({ length: 12 }, (_, i) => est(`2025-${String(i + 1).padStart(2, "0")}`, { revenue: 9_139 }));
    const a = aktualerFraFacts(facts, "2025", { medAfskrivninger: true });
    const serie = forecastSerie(Array.from({ length: 12 }, (_, i) => a[i]?.omsaetning ?? null), budget12(10_000));
    expect(serie.realiseret.every((r) => r === false)).toBe(true);
    expect(serie.sidsteRealiseret).toBe(-1);
  });
});
