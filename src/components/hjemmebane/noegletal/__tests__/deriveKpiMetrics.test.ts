import { describe, expect, it } from "vitest";
import { deriveKpiMetrics } from "@/lib/kpiDefs";
import type { CompanyFact } from "@/hooks/useCompanyFacts";

/** deriveKpiMetrics havde ingen test før 4/9-2026 — hverken M/M,
    formatering eller marginer. Disse låser M/M i to former: beløb relativt
    (%), procent-KPI'er i procentpoint (pp), plus data_basis-gaten,
    før = 0, før negativ, én periode, og formateringen af begge former. */

const fact = (
  period_key: string,
  metrics: Record<string, number>,
  data_basis: CompanyFact["data_basis"] = "measured",
): CompanyFact => ({
  id: `f-${period_key}`,
  period_key,
  period_label: period_key,
  source_report_id: `r-${period_key}`,
  source_type: "canonical_v2",
  data_basis,
  metrics,
  committed_at: "2026-09-01T00:00:00Z",
});

const ingenMaal = {};
const ingenBench = {};
const find = (facts: CompanyFact[], key: string) =>
  deriveKpiMetrics(facts, ingenMaal, ingenBench).find((m) => m.key === key)!;

describe("deriveKpiMetrics — M/M for marginer er procentpoint", () => {
  it("DB margin der stiger: 30,1 % → 45,7 % = +15.6 pp (ikke +51,8 %)", () => {
    const m = find(
      [
        fact("2026-07", { revenue: 100_000, gross_profit: 30_100 }),
        fact("2026-08", { revenue: 100_000, gross_profit: 45_700 }),
      ],
      "db_margin",
    );
    expect(m.numValue).toBeCloseTo(45.7);
    expect(m.value).toBe("45.7");
    expect(m.changeArt).toBe("procentpoint");
    expect(m.changePct).toBeCloseTo(15.6);
    expect(m.change).toBe("+15.6 pp");
    expect(m.trend).toBe("up");
  });

  it("DB margin der falder: 45,7 % → 30,1 % = -15.6 pp, trend ned", () => {
    const m = find(
      [
        fact("2026-07", { revenue: 100_000, gross_profit: 45_700 }),
        fact("2026-08", { revenue: 100_000, gross_profit: 30_100 }),
      ],
      "db_margin",
    );
    expect(m.changePct).toBeCloseTo(-15.6);
    expect(m.change).toBe("-15.6 pp");
    expect(m.trend).toBe("down");
  });

  it("Resultat margin: 0,44 % → 35,4 % er +34.96 pp — ikke +7996 %", () => {
    const m = find(
      [
        fact("2026-07", { revenue: 100_000, ebt: 440 }),
        fact("2026-08", { revenue: 100_000, ebt: 35_400 }),
      ],
      "ebitda_margin",
    );
    expect(m.numValue).toBeCloseTo(35.4);
    expect(m.changePct).toBeCloseTo(34.96);
    expect(m.change).toBe("+35.0 pp");
    expect(m.trend).toBe("up");
  });

  it("margin med forrige = 0 %: procentpoint kan dømme (0 → 12 = +12.0 pp)", () => {
    const m = find(
      [
        fact("2026-07", { revenue: 100_000, gross_profit: 0 }),
        fact("2026-08", { revenue: 100_000, gross_profit: 12_000 }),
      ],
      "db_margin",
    );
    expect(m.changePct).toBeCloseTo(12);
    expect(m.change).toBe("+12.0 pp");
  });

  it("margin med forrige negativ: −10 % → −15 % er -5.0 pp, trend ned", () => {
    const m = find(
      [
        fact("2026-07", { revenue: 100_000, ebt: -10_000 }),
        fact("2026-08", { revenue: 100_000, ebt: -15_000 }),
      ],
      "ebitda_margin",
    );
    expect(m.changePct).toBeCloseTo(-5);
    expect(m.change).toBe("-5.0 pp");
    expect(m.trend).toBe("down");
  });
});

describe("deriveKpiMetrics — M/M for beløb er relativ (uændret)", () => {
  it("omsætning der stiger: 100.000 → 110.000 = +10.0%", () => {
    const m = find(
      [fact("2026-07", { revenue: 100_000 }), fact("2026-08", { revenue: 110_000 })],
      "omsaetning",
    );
    expect(m.numValue).toBe(110_000);
    expect(m.changeArt).toBe("relativ");
    expect(m.changePct).toBeCloseTo(10);
    expect(m.change).toBe("+10.0%");
    expect(m.trend).toBe("up");
  });

  it("omsætning der falder: 100.000 → 80.000 = -20.0%, trend ned", () => {
    const m = find(
      [fact("2026-07", { revenue: 100_000 }), fact("2026-08", { revenue: 80_000 })],
      "omsaetning",
    );
    expect(m.changePct).toBeCloseTo(-20);
    expect(m.change).toBe("-20.0%");
    expect(m.trend).toBe("down");
  });

  it("lowerIsBetter (lønninger): stigning er dårlig, fald er god", () => {
    const op = find(
      [fact("2026-07", { payroll: 50_000 }), fact("2026-08", { payroll: 60_000 })],
      "loenninger",
    );
    expect(op.change).toBe("+20.0%");
    expect(op.trend).toBe("down");
    const ned = find(
      [fact("2026-07", { payroll: 50_000 }), fact("2026-08", { payroll: 40_000 })],
      "loenninger",
    );
    expect(ned.change).toBe("-20.0%");
    expect(ned.trend).toBe("up");
  });

  it("beløb med forrige = 0: ingen dom (division), change «—», trend neutral", () => {
    const m = find(
      [fact("2026-07", { revenue: 0 }), fact("2026-08", { revenue: 50_000 })],
      "omsaetning",
    );
    expect(m.changePct).toBeNull();
    expect(m.change).toBe("—");
    expect(m.trend).toBe("neutral");
  });

  it("beløb med forrige negativ: −100.000 → −150.000 er -50.0% (abs-nævner), trend ned", () => {
    const m = find(
      [fact("2026-07", { ebt: -100_000 }), fact("2026-08", { ebt: -150_000 })],
      "resultat",
    );
    expect(m.changePct).toBeCloseTo(-50);
    expect(m.change).toBe("-50.0%");
    expect(m.trend).toBe("down");
  });
});

describe("deriveKpiMetrics — grundlag og formatering", () => {
  it("M/M gates på data_basis: seneste er estimat → ingen M/M for nogen nøgle", () => {
    const metrics = deriveKpiMetrics(
      [
        fact("2026-07", { revenue: 100_000, gross_profit: 30_100 }, "measured"),
        fact("2026-08", { revenue: 110_000, gross_profit: 45_700 }, "estimated"),
      ],
      ingenMaal,
      ingenBench,
    );
    expect(metrics.length).toBeGreaterThan(0);
    for (const m of metrics) {
      expect(m.changePct).toBeNull();
      expect(m.change).toBe("—");
      expect(m.trend).toBe("neutral");
    }
  });

  it("M/M gates på data_basis: forrige er estimat → ingen M/M", () => {
    const m = find(
      [
        fact("2026-07", { revenue: 100_000 }, "estimated"),
        fact("2026-08", { revenue: 110_000 }, "measured"),
      ],
      "omsaetning",
    );
    expect(m.changePct).toBeNull();
    expect(m.change).toBe("—");
  });

  it("kun én periode: tal, men ingen M/M", () => {
    const m = find([fact("2026-08", { revenue: 100_000, gross_profit: 45_700 })], "db_margin");
    expect(m.numValue).toBeCloseTo(45.7);
    expect(m.changePct).toBeNull();
    expect(m.change).toBe("—");
    expect(m.trend).toBe("neutral");
  });

  it("ingen facts: tom liste", () => {
    expect(deriveKpiMetrics([], ingenMaal, ingenBench)).toEqual([]);
  });

  it("formatering: procent-KPI'er med én decimal og « pp», beløb med «%» — fortegn kun ved ≥ 0", () => {
    const facts = [
      fact("2026-07", { revenue: 200_000, gross_profit: 100_000, ebt: 20_000 }),
      fact("2026-08", { revenue: 200_000, gross_profit: 100_000, ebt: 10_000 }),
    ];
    const db = find(facts, "db_margin");
    expect(db.change).toBe("+0.0 pp"); // uændret margin: nul med plus, i pp
    const res = find(facts, "resultat");
    expect(res.change).toBe("-50.0%");
    const rm = find(facts, "ebitda_margin");
    expect(rm.change).toBe("-5.0 pp"); // 10 % → 5 %
    expect(rm.unit).toBe("%");
    expect(res.unit).toBe("DKK");
  });

  it("nøgle uden grundlag udelades (ingen gross_profit → ingen db_margin)", () => {
    const metrics = deriveKpiMetrics([fact("2026-08", { revenue: 100_000 })], ingenMaal, ingenBench);
    expect(metrics.find((m) => m.key === "db_margin")).toBeUndefined();
    expect(metrics.find((m) => m.key === "omsaetning")).toBeDefined();
  });
});
