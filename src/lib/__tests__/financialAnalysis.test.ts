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
  laesAnalysisData,
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

// ── laesAnalysisData: Json fra basen → AnalysisData, eksplicit indsnævring ──
// (baseline-fejl 1, 7/9). Reglen står i læserens filhoved.

describe("laesAnalysisData", () => {
  const fuld = {
    overview: "Året gik godt",
    key_findings: [{ title: "Likviditet", analysis: "a", recommendation: "r", severity: "kritisk" }],
    positive_trends: [{ title: "Omsætning", description: "d", metric: "m", period: "p" }],
    challenges: [{ title: "Omkostninger", description: "d", metric: "m", period: "p" }],
    strategic_questions: ["Hvad nu?"],
    next_steps: ["Ring til banken"],
  };

  it("en fuld analyse læses uændret", () => {
    expect(laesAnalysisData(fuld)).toEqual(fuld);
  });

  it("ikke et objekt → null: null, array, streng, tal", () => {
    expect(laesAnalysisData(null)).toBeNull();
    expect(laesAnalysisData(undefined)).toBeNull();
    expect(laesAnalysisData([])).toBeNull();
    expect(laesAnalysisData("analyse")).toBeNull();
    expect(laesAnalysisData(42)).toBeNull();
  });

  it("tomt objekt → alle felter tomme, ikke null (der ER en analyse, den siger bare intet)", () => {
    expect(laesAnalysisData({})).toEqual({
      overview: "",
      key_findings: [],
      positive_trends: [],
      challenges: [],
      strategic_questions: [],
      next_steps: [],
    });
  });

  it("felt med forkert type behandles som manglende", () => {
    const a = laesAnalysisData({ overview: 7, key_findings: "ikke en liste", next_steps: { a: 1 } });
    expect(a?.overview).toBe("");
    expect(a?.key_findings).toEqual([]);
    expect(a?.next_steps).toEqual([]);
  });

  it("nøglefund uden titel eller med ukendt alvor droppes; analysis/recommendation falder tilbage på tom", () => {
    const a = laesAnalysisData({
      key_findings: [
        { title: "Kun titel", severity: "advarsel" },
        { analysis: "uden titel", severity: "kritisk" },
        { title: "Ukendt alvor", severity: "rød" },
        "ikke et objekt",
        null,
      ],
    });
    expect(a?.key_findings).toEqual([{ title: "Kun titel", analysis: "", recommendation: "", severity: "advarsel" }]);
  });

  it("tendenser kræver titel; øvrige felter falder tilbage på tom", () => {
    const a = laesAnalysisData({
      positive_trends: [{ title: "Vækst" }, { description: "uden titel" }],
      challenges: [{ title: "Pres", metric: "EBT" }],
    });
    expect(a?.positive_trends).toEqual([{ title: "Vækst", description: "", metric: "", period: "" }]);
    expect(a?.challenges).toEqual([{ title: "Pres", description: "", metric: "EBT", period: "" }]);
  });

  it("spørgsmål og næste skridt beholder kun strenge", () => {
    const a = laesAnalysisData({ strategic_questions: ["Hvad?", 3, null, "Hvorfor?"], next_steps: [{}, "Gør det"] });
    expect(a?.strategic_questions).toEqual(["Hvad?", "Hvorfor?"]);
    expect(a?.next_steps).toEqual(["Gør det"]);
  });

  it("input muteres ikke", () => {
    const input = { ...fuld, key_findings: [...fuld.key_findings] };
    const foer = JSON.stringify(input);
    laesAnalysisData(input);
    expect(JSON.stringify(input)).toBe(foer);
  });
});
