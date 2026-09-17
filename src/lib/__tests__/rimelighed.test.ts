import { describe, expect, it } from "vitest";
import {
  ANDEL_MAX,
  ANDEL_MIN,
  BEKRAEFT_TEKST,
  krTekst,
  MARGIN_MAX,
  MARGIN_MIN,
  pctTekst,
  rimelighedAdvarsler,
  rimelighedstjek,
  TOLERANCE_MIN_KR,
  TOLERANCE_PCT,
} from "@/lib/rimelighed";

/* Rimelighedstjek FØR godkendelse — «tal der ikke kan passe» D (18/9-2026).
   De fire måneder ordret fra Jonas' SQL 17/9 16:33 (…_16-33-35.csv): revenue,
   gross_profit, payroll, ebt og «regnet» (= revenue − alle omkostninger).
   CSV'en bærer ikke de øvrige omkostningsposter enkeltvis — de står her som
   ÉN post (admin_costs), sat så revenue − alle omkostninger giver «regnet»
   på kronen. Booking Innovation 2024: payroll 46 kr. ved omsætning 83.665. */

const finder = (a: ReturnType<typeof rimelighedstjek>, name: string) => a.find((x) => x.name === name)!;

/** revenue, gross_profit, payroll, ebt, regnet → øvrige omkostninger som admin_costs. */
const maaned = (revenue: number, gross: number, payroll: number | null, ebt: number, regnet: number) => {
  const cogs = revenue - gross;
  const alleOmk = revenue - regnet;
  const opex = alleOmk - cogs;
  const admin = opex - (payroll ?? 0);
  return { revenue, gross_profit: gross, cogs, payroll, admin_costs: Math.round(admin * 100) / 100, ebt };
};

describe("grænserne sagt højt", () => {
  it("5 % / 500 kr.; andel [0,1 %; 300 %]; margin [−300 %; 100 %]", () => {
    expect(TOLERANCE_PCT).toBe(0.05);
    expect(TOLERANCE_MIN_KR).toBe(500);
    expect(ANDEL_MIN).toBe(0.001);
    expect(ANDEL_MAX).toBe(3);
    expect(MARGIN_MIN).toBe(-3);
    expect(MARGIN_MAX).toBe(1);
    expect(BEKRAEFT_TEKST).toBe("Ja, tallene er rigtige — godkend alligevel");
  });
});

describe("Fjeldgaardshop 2025-10 (forkert: ebt +241.813,30 mod regnet −241.813)", () => {
  const m = maaned(241595.98, 198586.71000000002, 6328.38, 241813.30000000002, -241813);
  const a = rimelighedstjek(m, "trial_balance");
  it("ebt_reconciles WARN — samme tal med modsat fortegn, teksten siger det", () => {
    const e = finder(a, "ebt_reconciles");
    expect(e.result).toBe("WARN");
    expect(e.details).toMatch(/opposite sign/);
    expect(e.tekst).toBe("Resultatet før skat står som 241.813 kr., men dækningsbidraget minus omkostningerne giver −241.813 kr. — samme tal med modsat fortegn. Er et overskud læst som underskud, eller omvendt?");
    expect(e.felter).toEqual(["ebt"]);
  });
  it("result_vs_revenue WARN: 241.813 > 241.596 + 12.080 er falsk … nej — inden for tolerancen? Nej: |ebt| 241.813 ≤ 241.596 + 12.080 → PASS", () => {
    expect(finder(a, "result_vs_revenue").result).toBe("PASS");
  });
  it("magnitude_plausibility: admin-posten 434.072 = 180 % — inden for 300 %; margin 100,09 % — lige over 100 % → WARN på ebt", () => {
    const mp = finder(a, "magnitude_plausibility");
    expect(mp.result).toBe("WARN");
    expect(mp.felter).toEqual(["ebt"]);
    expect(mp.tekst).toMatch(/Resultatgraden er 100 %/);
  });
});

describe("Fjeldgaardshop 2026-01 (rigtig: ebt 25.873,21 = regnet 25.873)", () => {
  const m = maaned(53329.369999999995, 36590.28999999999, null, 25873.209999999992, 25873);
  it("alle tre PASS — ingen advarsler", () => {
    const a = rimelighedstjek(m, "trial_balance");
    expect(a.map((x) => [x.name, x.result])).toEqual([["ebt_reconciles", "PASS"], ["result_vs_revenue", "PASS"], ["magnitude_plausibility", "PASS"]]);
    expect(rimelighedAdvarsler(m, "trial_balance")).toEqual([]);
  });
});

describe("Brick Works 2025-01 (forkert: ebt +1.232.301,57 mod regnet −1.230.452; revenue 42.217)", () => {
  const m = maaned(42217.2, 639640.4, 490189.87, 1232301.57, -1230452);
  const a = rimelighedstjek(m, "trial_balance");
  it("ebt_reconciles WARN (modsat fortegn inden for 5 %: 1.850 mod tolerance 61.615)", () => {
    const e = finder(a, "ebt_reconciles");
    expect(e.result).toBe("WARN");
    expect(e.details).toMatch(/opposite sign/);
  });
  it("result_vs_revenue WARN: resultatet er 29 gange omsætningen", () => {
    const r = finder(a, "result_vs_revenue");
    expect(r.result).toBe("WARN");
    expect(r.tekst).toBe("Resultatet før skat (1.232.302 kr.) er større end hele omsætningen (42.217 kr.). Det sker sjældent — er et af tallene læst fra en forkert kolonne eller periode?");
    expect(r.felter).toEqual(["ebt", "revenue"]);
  });
  it("magnitude_plausibility WARN: cogs −597.423 (1.415 %), payroll 1.161 % og admin 3.269 % af omsætningen, margin 2.919 %", () => {
    const mp = finder(a, "magnitude_plausibility");
    expect(mp.result).toBe("WARN");
    expect(mp.felter).toEqual(["cogs", "payroll", "admin_costs", "ebt"]);
    expect(mp.tekst).toMatch(/Direkte omkostninger er −597.423 kr. — 1415 % af omsætningen/);
    expect(mp.tekst).toMatch(/Lønomkostninger er 490.190 kr. — 1161 % af omsætningen/);
    expect(mp.tekst).toMatch(/Resultatgraden er 2919 %/);
  });
});

describe("Brick Works 2024-08 (rigtig: ebt 731.361,55 mod regnet 731.808 — inden for 5 %)", () => {
  const m = maaned(1555817.95, 1211124.87, 388390.48000000004, 731361.5499999999, 731808);
  it("alle tre PASS — payroll 25 % af omsætningen, margin 47 %", () => {
    expect(rimelighedAdvarsler(m, "trial_balance")).toEqual([]);
    expect(finder(rimelighedstjek(m, "trial_balance"), "ebt_reconciles").details).toMatch(/≈ ebt/);
  });
});

describe("Booking Innovation 2024: payroll 46 kr. ved omsætning 83.665 (læst i t.kr.)", () => {
  const m = { revenue: 83665, gross_profit: 60000, payroll: 46, admin_costs: 12000, ebt: 47954 };
  it("magnitude_plausibility WARN på payroll — 0,05 % af omsætningen — med t.kr.-spørgsmålet", () => {
    const mp = finder(rimelighedstjek(m, "pnl"), "magnitude_plausibility");
    expect(mp.result).toBe("WARN");
    expect(mp.felter).toEqual(["payroll"]);
    expect(mp.tekst).toBe("Lønomkostninger er 46 kr. — kun 0,05 % af omsætningen. Er tallet i tusinder (t.kr.) eller læst fra en forkert kolonne?");
  });
  it("de to andre tjek PASS (regnestykket lukker; resultatet er under omsætningen)", () => {
    const a = rimelighedstjek(m, "pnl");
    expect(finder(a, "ebt_reconciles").result).toBe("PASS");
    expect(finder(a, "result_vs_revenue").result).toBe("PASS");
  });
});

describe("A2 (18/9-2026): finansielle indtægter og autodrift tæller med i regnestykket", () => {
  // Florens opbygning i syntetiske tal: dækningsbidrag 132.000, løn 107.000, salg 1.000,
  // lokaler 20.000, autodrift 16.000, admin 38.000, renteudgifter 5.000, renteindtægter 16.000
  // → 132 − 107 − 1 − 20 − 16 − 38 − 5 + 16 = −39.000 = resultatet.
  const m = { revenue: 440_000, gross_profit: 132_000, cogs: 308_000, payroll: 107_000, sales_costs: 1_000, facility_costs: 20_000, vehicle_costs: 16_000, admin_costs: 38_000, financial_costs: 5_000, financial_income: 16_000, ebt: -39_000 };
  it("ebt_reconciles PASS når renteindtægter lægges til og autodrift trækkes fra", () => {
    const e = finder(rimelighedstjek(m, "pnl"), "ebt_reconciles");
    expect(e.result).toBe("PASS");
    expect(e.details).toBe("gross_profit − opex + financial_income = -39000.00 ≈ ebt -39000");
  });
  it("uden autodrift-nøglen (som før) ville regnestykket give −23.000 og advare falsk", () => {
    const { vehicle_costs: _v, ...uden } = m;
    const e = finder(rimelighedstjek(uden, "pnl"), "ebt_reconciles");
    expect(e.result).toBe("WARN");
    expect(e.details).toMatch(/= -23000\.00 but ebt = -39000/);
  });
  it("magnitude_plausibility dømmer også autodrift, pension og øvrige personale (posten navngivet)", () => {
    const mp = finder(rimelighedstjek({ ...m, vehicle_costs: 10, payroll_related: 20, other_staff_costs: 30 }, "pnl"), "magnitude_plausibility");
    expect(mp.result).toBe("WARN");
    expect(mp.felter).toEqual(["payroll_related", "other_staff_costs", "vehicle_costs"]);
    expect(mp.tekst).toMatch(/^Pension og sociale omkostninger er 20 kr\./);
    expect(mp.tekst).toMatch(/Autodrift er 10 kr\./);
  });
});

describe("kanter", () => {
  it("balance-rapport: alt SKIP; uden revenue: to SKIP; uden opex: ebt_reconciles SKIP", () => {
    expect(rimelighedstjek({ revenue: 100, ebt: 10 }, "balance").every((x) => x.result === "SKIP")).toBe(true);
    const u = rimelighedstjek({ gross_profit: 100, payroll: 50, ebt: 50 }, "pnl");
    expect(u.map((x) => x.result)).toEqual(["PASS", "SKIP", "SKIP"]);
    expect(finder(rimelighedstjek({ revenue: 100, gross_profit: 80, ebt: 80 }, "pnl"), "ebt_reconciles").result).toBe("SKIP");
  });
  it("tolerancen: gulvet 500 kr. absorberer små afvigelser; 5 % skalerer", () => {
    expect(finder(rimelighedstjek({ revenue: 10000, gross_profit: 5000, payroll: 1000, ebt: 4400 }, "pnl"), "ebt_reconciles").result).toBe("PASS"); // 400 < 500
    expect(finder(rimelighedstjek({ revenue: 10000, gross_profit: 5000, payroll: 1000, ebt: 3400 }, "pnl"), "ebt_reconciles").result).toBe("WARN"); // 600 > 500
    expect(finder(rimelighedstjek({ revenue: 1_000_000, gross_profit: 500_000, payroll: 100_000, ebt: 385_000 }, "pnl"), "ebt_reconciles").result).toBe("PASS"); // 15.000 < 20.000
  });
  it("omkostninger i negativ konvention regnes med abs; en post på 0 dømmes ikke; margin −300 % er grænsen", () => {
    expect(finder(rimelighedstjek({ revenue: 100_000, gross_profit: 60_000, payroll: -30_000, ebt: 30_000 }, "pnl"), "ebt_reconciles").result).toBe("PASS");
    expect(finder(rimelighedstjek({ revenue: 100_000, gross_profit: 60_000, payroll: 0, admin_costs: 30_000, ebt: 30_000 }, "pnl"), "magnitude_plausibility").result).toBe("PASS");
    expect(finder(rimelighedstjek({ revenue: 100_000, gross_profit: 60_000, admin_costs: 360_000, ebt: -300_000 }, "pnl"), "magnitude_plausibility").felter).toEqual(["admin_costs"]); // margin −300 % er OK, admin 360 % ikke
    expect(finder(rimelighedstjek({ revenue: 100_000, gross_profit: 60_000, admin_costs: 200_000, ebt: -300_001 }, "pnl"), "magnitude_plausibility").felter).toEqual(["ebt"]);
  });
  it("formatering", () => {
    expect(krTekst(1232301.57)).toBe("1.232.302");
    expect(krTekst(-241813)).toBe("−241.813");
    expect(pctTekst(46 / 83665)).toBe("0,05 %");
    expect(pctTekst(2.59)).toBe("259 %");
  });
});
