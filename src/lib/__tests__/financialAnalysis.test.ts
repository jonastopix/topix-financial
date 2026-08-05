/**
 * Tests for AI-analysens rene domme (design-blok hb-ai-design.md §b).
 * Kroppene er ordret flyttede fra AIFinancialAnalysis — testene fryser
 * dommene så begge visningslag (gamle komponent + HbFinancialAnalysis)
 * står på samme sandhed.
 */
import { describe, expect, it } from "vitest";
import {
  deriveDataSufficiency,
  deriveDefaultExpanded,
  deriveEffectivePeriod,
  sortFindings,
  type KeyFinding,
} from "@/lib/financialAnalysis";

const finding = (title: string, severity: KeyFinding["severity"]): KeyFinding => ({
  title,
  analysis: `${title} analyse`,
  recommendation: `${title} anbefaling`,
  severity,
});

describe("sortFindings", () => {
  it("sorterer kritisk → advarsel → positiv", () => {
    const input = [finding("A", "positiv"), finding("B", "kritisk"), finding("C", "advarsel")];
    expect(sortFindings(input).map(f => f.title)).toEqual(["B", "C", "A"]);
  });

  it("er stabil inden for samme alvor (index-tiebreak)", () => {
    const input = [finding("A", "kritisk"), finding("B", "kritisk")];
    expect(sortFindings(input).map(f => f.title)).toEqual(["A", "B"]);
  });

  it("lægger ukendt alvor sidst", () => {
    const input = [finding("A", "advarsel"), { ...finding("B", "positiv"), severity: "ukendt" as KeyFinding["severity"] }];
    expect(sortFindings(input).map(f => f.title)).toEqual(["A", "B"]);
  });

  it("returnerer tom liste for undefined og tomt input", () => {
    expect(sortFindings(undefined)).toEqual([]);
    expect(sortFindings([])).toEqual([]);
  });

  it("mutérer aldrig originalen (sorteret kopi)", () => {
    const input = [finding("A", "positiv"), finding("B", "kritisk")];
    const before = [...input];
    sortFindings(input);
    expect(input).toEqual(before);
  });
});

describe("deriveEffectivePeriod", () => {
  const periods = [
    { period_key: "2026-06", period_label: "Juni 2026" },
    { period_key: "2026-05", period_label: "Maj 2026" },
    { period_key: "2026-04", period_label: "April 2026" },
  ];

  it("controlled valg vinder altid", () => {
    expect(
      deriveEffectivePeriod("2026-03", periods, [{ period_key: "2026-06" }])
    ).toBe("2026-03");
  });

  it("vælger nyeste periode MED commentary, ikke nyeste periode", () => {
    const commentaries = [{ period_key: "2026-05" }, { period_key: "2026-04" }];
    expect(deriveEffectivePeriod(null, periods, commentaries)).toBe("2026-05");
  });

  it("falder tilbage til nyeste periode uden commentaries", () => {
    expect(deriveEffectivePeriod(null, periods, [])).toBe("2026-06");
  });

  it("returnerer null uden perioder", () => {
    expect(deriveEffectivePeriod(null, [], [])).toBeNull();
  });
});

describe("deriveDataSufficiency", () => {
  it("alle tre kernefelter populeret → sufficient", () => {
    expect(deriveDataSufficiency({ metrics: { revenue: 100, gross_profit: 40, ebt: 10 } }))
      .toEqual({ sufficient: true, populatedCoreCount: 3 });
  });

  it("nul-tal ER data (!= null-semantikken)", () => {
    expect(deriveDataSufficiency({ metrics: { revenue: 0, gross_profit: 0, ebt: 0 } }))
      .toEqual({ sufficient: true, populatedCoreCount: 3 });
  });

  it("null-felt tæller ikke", () => {
    expect(deriveDataSufficiency({ metrics: { revenue: 100, gross_profit: null, ebt: 10 } }))
      .toEqual({ sufficient: false, populatedCoreCount: 2 });
  });

  it("manglende felter tæller ikke", () => {
    expect(deriveDataSufficiency({ metrics: { revenue: 100 } }))
      .toEqual({ sufficient: false, populatedCoreCount: 1 });
  });

  it("fact uden metrics og manglende fact → insufficient", () => {
    expect(deriveDataSufficiency({})).toEqual({ sufficient: false, populatedCoreCount: 0 });
    expect(deriveDataSufficiency(undefined)).toEqual({ sufficient: false, populatedCoreCount: 0 });
  });
});

describe("deriveDefaultExpanded", () => {
  it("åbner alle kritiske fund", () => {
    const sorted = [finding("A", "kritisk"), finding("B", "kritisk"), finding("C", "advarsel")];
    expect(deriveDefaultExpanded(sorted)).toEqual([0, 1]);
  });

  it("åbner første fund når ingen kritiske", () => {
    const sorted = [finding("A", "advarsel"), finding("B", "positiv")];
    expect(deriveDefaultExpanded(sorted)).toEqual([0]);
  });

  it("tom liste → intet åbent", () => {
    expect(deriveDefaultExpanded([])).toEqual([]);
  });
});
