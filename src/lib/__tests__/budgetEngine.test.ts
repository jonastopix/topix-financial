import * as fs from "fs";
import * as path from "path";
import { describe, expect, it, vi } from "vitest";

// Motoren importerer supabase-klienten (skrivevejene); dommene testes rent
// uden netværk — klienten mockes væk (parseMetricValue-præcedensen).
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  applyQuickstartRows,
  computeEbitda,
  decodeBudgetRows,
  decodeImportedRows,
  deriveBudgetFill,
  deriveGrowthFactor,
  distributeEvenly,
  distributeSeasonally,
  normalizeBudgetKey,
  parseBudgetMarker,
  parseBudgetPeriod,
  resolveAutoYear,
  type BudgetTargetRow,
} from "../budgetEngine";
import { BUDGET_TEMPLATES } from "../budgetTemplates";
import { laesMatrix } from "@/lib/importEngine";
import { byggGitter, GYLDIGE_GRUPPER } from "@/lib/importGitterModel";
import { byggSkriveplan, byggSkriveplanInserts, type Skriveplan } from "@/lib/importSkrivning";
import { parseCsvTilMatrix } from "@/lib/csvLaesning";
import { laesArkTilMatrix } from "./xlsxTestHelper";

import type { BudgetRow } from "@/components/budget/types";

const row = (key: string, group: string, values: number[], isEditable = true): BudgetRow => ({
  key,
  label: key,
  values,
  isEditable,
  group,
});

const zeros = () => Array(12).fill(0);
const filled = (count: number, value = 100) =>
  Array.from({ length: 12 }, (_, i) => (i < count ? value : 0));

/** Case-tabellerne fra design-blokken §b1/§b4/§b5 — bygget præcis som bogført. */

describe("parseBudgetPeriod (§b5)", () => {
  it('"2026-base-0" → {2026, base, 0}', () => {
    expect(parseBudgetPeriod("2026-base-0")).toEqual({ year: "2026", scenario: "base", monthIdx: 0 });
  });

  it('"2026-optimistisk-11" → {2026, optimistisk, 11}', () => {
    expect(parseBudgetPeriod("2026-optimistisk-11")).toEqual({
      year: "2026",
      scenario: "optimistisk",
      monthIdx: 11,
    });
  });

  it('monthIdx 12 er uden for 0-11 → null', () => {
    expect(parseBudgetPeriod("2026-base-12")).toBeNull();
  });

  it('"2026-base--1" → null (tom del ⇒ NaN)', () => {
    expect(parseBudgetPeriod("2026-base--1")).toBeNull();
  });

  it("ikke-numerisk månedsindeks → null", () => {
    expect(parseBudgetPeriod("2026-base-x")).toBeNull();
  });

  it("skabelon-key (for få dele) → null", () => {
    expect(parseBudgetPeriod("webshop_b2c")).toBeNull();
  });

  it('DB-defaulten "Oktober 2025" → null', () => {
    expect(parseBudgetPeriod("Oktober 2025")).toBeNull();
  });
});

describe("parseBudgetMarker (§b5)", () => {
  it("__template__ → template", () => {
    expect(parseBudgetMarker("__template__")).toEqual({ kind: "template" });
  });

  it("__label__ m. underscore-key", () => {
    expect(parseBudgetMarker("__label__2026_min_kategori")).toEqual({
      kind: "label",
      year: "2026",
      key: "min_kategori",
    });
  });

  it("__group__ m. manuel key inkl. timestamp-suffix", () => {
    expect(parseBudgetMarker("__group__2026_manual_x_1712")).toEqual({
      kind: "group",
      year: "2026",
      key: "manual_x_1712",
    });
  });

  it("__sim_event__ → simEvent m. idx", () => {
    expect(parseBudgetMarker("__sim_event__2026_0")).toEqual({
      kind: "simEvent",
      year: "2026",
      idx: 0,
    });
  });

  it("almindelig kategori → null", () => {
    expect(parseBudgetMarker("omsaetning")).toBeNull();
  });

  it("ukendt dunder-prefix → null", () => {
    expect(parseBudgetMarker("__ukendt__x")).toBeNull();
  });
});

describe("deriveBudgetFill (§b1)", () => {
  it("alle 0 → empty, 0", () => {
    expect(deriveBudgetFill([row("omsaetning", "indtaegter", zeros())])).toEqual({
      state: "empty",
      filledMonths: 0,
    });
  });

  it("4 mdr m. omsætning → partial, 4", () => {
    expect(deriveBudgetFill([row("omsaetning", "indtaegter", filled(4))])).toEqual({
      state: "partial",
      filledMonths: 4,
    });
  });

  it("9 mdr → partial, 9 (under 10-måneders-tærsklen)", () => {
    expect(deriveBudgetFill([row("omsaetning", "indtaegter", filled(9))])).toEqual({
      state: "partial",
      filledMonths: 9,
    });
  });

  it("10 mdr → complete, 10 (tærsklen)", () => {
    expect(deriveBudgetFill([row("omsaetning", "indtaegter", filled(10))])).toEqual({
      state: "complete",
      filledMonths: 10,
    });
  });

  it("12 mdr → complete, 12", () => {
    expect(deriveBudgetFill([row("omsaetning", "indtaegter", filled(12))])).toEqual({
      state: "complete",
      filledMonths: 12,
    });
  });

  it("kun negative indtægtsværdier: ikke empty (Σ≠0), 0 udfyldte → partial (arvet randadfærd)", () => {
    expect(deriveBudgetFill([row("omsaetning", "indtaegter", Array(12).fill(-100))])).toEqual({
      state: "partial",
      filledMonths: 0,
    });
  });

  it("ingen indtægtsrækker → empty, 0", () => {
    expect(deriveBudgetFill([row("loenninger", "personale", filled(12))])).toEqual({
      state: "empty",
      filledMonths: 0,
    });
  });
});

describe("deriveGrowthFactor (§b4)", () => {
  it("tomme aktuals → 1 (forecast = budget)", () => {
    expect(deriveGrowthFactor([], [100, 100])).toBe(1);
  });

  it("avgBudget 0 → 1", () => {
    expect(deriveGrowthFactor([50, 50], [0, 0])).toBe(1);
  });

  it("ratio 1.2 → 1.2", () => {
    expect(deriveGrowthFactor([120, 120], [100, 100])).toBeCloseTo(1.2);
  });

  it("ratio 0.05 → 0.1 (cap-gulv)", () => {
    expect(deriveGrowthFactor([5], [100])).toBe(0.1);
  });

  it("ratio 4.0 → 3 (cap-loft)", () => {
    expect(deriveGrowthFactor([400], [100])).toBe(3);
  });

  it("ratio 1.0 → 1", () => {
    expect(deriveGrowthFactor([100, 100, 100], [100, 100, 100])).toBe(1);
  });
});

describe("normalizeBudgetKey (U3 — miss-kataloget 1-4, hb-ai-merge-recon §b3)", () => {
  it("1: dansk normalisering — æ/ø/å oversættes som i keys", () => {
    expect(normalizeBudgetKey("omsætning")).toBe("omsaetning");
    expect(normalizeBudgetKey("Løn & Personale")).toBe("loen_personale");
    expect(normalizeBudgetKey("småanskaffelser")).toBe("smaaanskaffelser");
  });

  it("2: casing og kant-whitespace", () => {
    expect(normalizeBudgetKey("OMSÆTNING ")).toBe("omsaetning");
    expect(normalizeBudgetKey("vareforbrug / cogs")).toBe("vareforbrug_cogs");
  });

  it("3: specialtegns-/mellemrums-varianter af sammensatte labels falder sammen", () => {
    expect(normalizeBudgetKey("Vareforbrug / COGS")).toBe("vareforbrug_cogs");
    expect(normalizeBudgetKey("Vareforbrug/COGS")).toBe("vareforbrug_cogs");
    expect(normalizeBudgetKey("Fragt & levering")).toBe("fragt_levering");
    expect(normalizeBudgetKey("Fragt & Levering ")).toBe("fragt_levering");
  });

  it("4: lagrede snake_case-keys er fixpunkter (idempotent)", () => {
    expect(normalizeBudgetKey("fragt_levering")).toBe("fragt_levering");
    expect(normalizeBudgetKey("omsaetning")).toBe("omsaetning");
    expect(normalizeBudgetKey(normalizeBudgetKey("Vareforbrug / COGS"))).toBe("vareforbrug_cogs");
  });
});

describe("computeEbitda", () => {
  it("revenue − Σ|cost| pr. måned", () => {
    const rows = [
      row("omsaetning", "indtaegter", Array(12).fill(100)),
      row("loenninger", "personale", Array(12).fill(30)),
      row("marketing", "salg_marketing", Array(12).fill(-20)),
    ];
    expect(computeEbitda(rows)).toEqual(Array(12).fill(50));
  });

  it("tomme rækker → 12 nuller", () => {
    expect(computeEbitda([])).toEqual(zeros());
  });
});

describe("distributeEvenly / distributeSeasonally", () => {
  it("÷12 m. December-rest: summen bevares eksakt", () => {
    const values = distributeEvenly(300001);
    expect(values).toHaveLength(12);
    expect(values.reduce((s, v) => s + v, 0)).toBe(300001);
    expect(values[0]).toBe(Math.round(300001 / 12));
  });

  it("sæsonprofilen: 12 måneder, summen bevares eksakt, december er størst", () => {
    const values = distributeSeasonally(1_000_000);
    expect(values).toHaveLength(12);
    expect(values.reduce((s, v) => s + v, 0)).toBe(1_000_000);
    expect(Math.max(...values)).toBe(values[11]);
  });
});

describe("applyQuickstartRows", () => {
  const rows = [
    row("omsaetning", "indtaegter", zeros()),
    row("loenninger", "personale", zeros()),
    row("marketing", "salg_marketing", zeros()),
    row("admin", "faste", zeros()),
  ];

  it("uden omsætningsmål ændres intet", () => {
    expect(applyQuickstartRows(rows, { revenue: 0, costs: 600000, payroll: 900000 })).toBe(rows);
  });

  it("fordeler omsætning og løn ÷12", () => {
    const result = applyQuickstartRows(rows, { revenue: 1_200_000, costs: 0, payroll: 240_000 });
    expect(result.find((r) => r.key === "omsaetning")!.values).toEqual(Array(12).fill(100_000));
    expect(result.find((r) => r.key === "loenninger")!.values).toEqual(Array(12).fill(20_000));
    expect(result.find((r) => r.key === "marketing")!.values).toEqual(zeros());
  });

  it("øvrige omkostninger fordeles ligeligt på redigerbare ikke-løn-rækker (arvet (costs−payroll)-formel)", () => {
    const result = applyQuickstartRows(rows, { revenue: 1_200_000, costs: 480_000, payroll: 240_000 });
    // (costs/12 − payroll/12) / 2 rækker = (40000 − 20000) / 2 = 10000
    expect(result.find((r) => r.key === "marketing")!.values).toEqual(Array(12).fill(10_000));
    expect(result.find((r) => r.key === "admin")!.values).toEqual(Array(12).fill(10_000));
  });
});

describe("decodeImportedRows", () => {
  it("mapper de seks kendte keys til grupper og resten til variable (arvet switch)", () => {
    const rows = decodeImportedRows({
      categories: [
        { key: "omsaetning", label: "Omsætning", monthly: filled(12) },
        { key: "loenninger", label: "Lønninger", monthly: filled(12) },
        { key: "vareforbrug", label: "Vareforbrug", monthly: filled(12) },
      ],
    });
    expect(rows.map((r) => r.group)).toEqual(["indtaegter", "personale", "variable"]);
  });

  it("manglende monthly udfyldes med 12 nuller", () => {
    const rows = decodeImportedRows({ categories: [{ key: "andet", label: "Andet" }] });
    expect(rows[0].values).toEqual(zeros());
  });
});

describe("resolveAutoYear", () => {
  it("valgt år uden data → nyeste år m. data", () => {
    expect(resolveAutoYear(["2024", "2025"], "2026")).toBe("2025");
  });

  it("valgt år har data → null (intet hop)", () => {
    expect(resolveAutoYear(["2025", "2026"], "2026")).toBeNull();
  });

  it("ingen år m. data → null", () => {
    expect(resolveAutoYear([], "2026")).toBeNull();
  });
});

describe("decodeBudgetRows", () => {
  const YEAR = "2026";
  const serviceB2b = BUDGET_TEMPLATES.find((t) => t.key === "service_b2b")!;

  it("skabelonen service_b2b findes i registret (test-forudsætning)", () => {
    expect(serviceB2b).toBeDefined();
    expect(serviceB2b.categories.some((c) => c.key === "omsaetning")).toBe(true);
  });

  const baseData: BudgetTargetRow[] = [
    { category: "__template__", budget_amount: 0, period: "service_b2b" },
    { category: "omsaetning", budget_amount: 100, period: `${YEAR}-base-0` },
    { category: "omsaetning", budget_amount: 200, period: `${YEAR}-optimistisk-3` },
  ];

  it("gyldig __template__-marker vinder: template fra marker, templateFromMarker true", () => {
    const decoded = decodeBudgetRows(baseData, YEAR);
    expect(decoded.template.key).toBe("service_b2b");
    expect(decoded.templateFromMarker).toBe(true);
  });

  it("værdirækker lander på rette scenarie/måned; andre scenarier forbliver 0", () => {
    const decoded = decodeBudgetRows(baseData, YEAR);
    expect(decoded.scenarioData.base.find((r) => r.key === "omsaetning")!.values[0]).toBe(100);
    expect(decoded.scenarioData.optimistisk.find((r) => r.key === "omsaetning")!.values[3]).toBe(200);
    expect(decoded.scenarioData.pessimistisk.find((r) => r.key === "omsaetning")!.values).toEqual(zeros());
  });

  it("uden marker: best-match-gæt, templateFromMarker false", () => {
    const decoded = decodeBudgetRows(
      serviceB2b.categories.slice(0, 5).map((c) => ({
        category: c.key,
        budget_amount: 10,
        period: `${YEAR}-base-0`,
      })),
      YEAR,
    );
    expect(decoded.template.key).toBe("service_b2b");
    expect(decoded.templateFromMarker).toBe(false);
  });

  it("ukendt marker-value falder tilbage til best-match (templateFromMarker false)", () => {
    const decoded = decodeBudgetRows(
      [
        { category: "__template__", budget_amount: 0, period: "findes_ikke" },
        ...serviceB2b.categories.slice(0, 5).map((c) => ({
          category: c.key,
          budget_amount: 10,
          period: `${YEAR}-base-0`,
        })),
      ],
      YEAR,
    );
    expect(decoded.template.key).toBe("service_b2b");
    expect(decoded.templateFromMarker).toBe(false);
  });

  it("ekstra kategori får gruppe fra __group__-marker; uden marker → variable", () => {
    const decoded = decodeBudgetRows(
      [
        ...baseData,
        { category: "ekstra_ting", budget_amount: 50, period: `${YEAR}-base-1` },
        { category: `__group__${YEAR}_ekstra_ting`, budget_amount: 0, period: "drift" },
        { category: "anden_ekstra", budget_amount: 5, period: `${YEAR}-base-2` },
      ],
      YEAR,
    );
    const ekstra = decoded.scenarioData.base.find((r) => r.key === "ekstra_ting")!;
    expect(ekstra.group).toBe("drift");
    expect(ekstra.values[1]).toBe(50);
    expect(decoded.scenarioData.base.find((r) => r.key === "anden_ekstra")!.group).toBe("variable");
  });

  it("__label__-marker overskriver label i alle scenarier og returneres som override", () => {
    const decoded = decodeBudgetRows(
      [...baseData, { category: `__label__${YEAR}_omsaetning`, budget_amount: 0, period: "Salg" }],
      YEAR,
    );
    expect(decoded.labelOverrides).toEqual({ omsaetning: "Salg" });
    expect(decoded.scenarioData.base.find((r) => r.key === "omsaetning")!.label).toBe("Salg");
    expect(decoded.scenarioData.pessimistisk.find((r) => r.key === "omsaetning")!.label).toBe("Salg");
  });

  it("strukturelt ugyldige perioder og andre års rækker ignoreres", () => {
    const decoded = decodeBudgetRows(
      [
        ...baseData,
        { category: "omsaetning", budget_amount: 999, period: `${YEAR}-base-12` },
        { category: "omsaetning", budget_amount: 888, period: "2025-base-0" },
        { category: "omsaetning", budget_amount: 777, period: "Oktober 2025" },
      ],
      YEAR,
    );
    const values = decoded.scenarioData.base.find((r) => r.key === "omsaetning")!.values;
    expect(values[0]).toBe(100);
    expect(values.includes(999)).toBe(false);
    expect(values.includes(888)).toBe(false);
  });

  it("availableYears samles fra værdirækker på tværs af år (markers tæller ikke)", () => {
    const decoded = decodeBudgetRows(
      [...baseData, { category: "omsaetning", budget_amount: 1, period: "2025-base-0" }],
      YEAR,
    );
    expect(decoded.availableYears).toEqual(["2025", "2026"]);
  });

  it("sim-event-rækker forstyrrer hverken år-listen eller værdierne", () => {
    const decoded = decodeBudgetRows(
      [
        ...baseData,
        {
          category: `__sim_event__${YEAR}_0`,
          budget_amount: 40000,
          period: '{"id":"a-b-c","type":"hire","label":"Ansæt","monthlyCost":40000,"startMonth":0,"isRevenue":false}',
        },
      ],
      YEAR,
    );
    expect(decoded.availableYears).toEqual(["2026"]);
    expect(decoded.scenarioData.base.find((r) => r.key === "omsaetning")!.values[0]).toBe(100);
    expect(decoded.scenarioData.base.some((r) => r.key.startsWith("__sim_event__"))).toBe(false);
  });
});

// ───────────────────────── Rundturen (sporets vigtigste test) ─────────────────────────

/**
 * RUNDTUR uden database: skriveplan → byggSkriveplanInserts (præcis de
 * rækker confirmImportFraSkriveplan indsætter) → decodeBudgetRows (præcis
 * afkodningen næste load kører). Beviser at etiketter, grupper og
 * månedstal overlever gem+genindlæsning. Skriver vi noget der ikke kan
 * læses, er etiketterne bevaret i databasen og tabt på skærmen — fejler
 * denne test, er alt det andet ligegyldigt.
 */
describe("decodeBudgetRows validerer __group__-markører", () => {
  it("en ugyldig gruppeværdi (frit sektionsnavn) passerer ALDRIG — falder til 'variable'", () => {
    const decoded = decodeBudgetRows(
      [
        { category: "import_loen_1", budget_amount: 100, period: "2026-base-0" },
        { category: "__group__2026_import_loen_1", budget_amount: 0, period: "Medarbejdere" },
      ],
      "2026",
    );
    const row = decoded.scenarioData.base.find((r) => r.key === "import_loen_1")!;
    expect(row.group).toBe("variable");
  });

  it("en gyldig gruppenøgle læses igennem", () => {
    const decoded = decodeBudgetRows(
      [
        { category: "import_loen_1", budget_amount: 100, period: "2026-base-0" },
        { category: "__group__2026_import_loen_1", budget_amount: 0, period: "personale" },
      ],
      "2026",
    );
    const row = decoded.scenarioData.base.find((r) => r.key === "import_loen_1")!;
    expect(row.group).toBe("personale");
  });
});

describe("rundtur: skriveplan → inserts → decodeBudgetRows", () => {
  const FIX = path.resolve(__dirname, "../__fixtures__");

  const rundtur = (plan: Skriveplan) => {
    const inserts = byggSkriveplanInserts({ userId: "test-user", companyId: "test-company", plan });
    const decoded = decodeBudgetRows(
      inserts.map(({ category, budget_amount, period }) => ({ category, budget_amount, period })),
      plan.aar,
    );
    return { inserts, baseRows: decoded.scenarioData.base };
  };

  const assertRundtur = (plan: Skriveplan) => {
    const { baseRows } = rundtur(plan);
    for (const raekke of plan.raekker) {
      const row = baseRows.find((r) => r.key === raekke.noegle);
      expect(row, `nøglen ${raekke.noegle} skal kunne læses tilbage`).toBeDefined();
      // Etiketten ordret tilbage (P3).
      expect(row!.label, raekke.noegle).toBe(raekke.etiket);
      // Gruppen tilbage — OG den skal være en af de seks gyldige nøgler.
      // (Testens blinde vinkel før: den tjekkede kun at group var lig det
      // vi skrev — også når det vi skrev var et frit sektionsnavn som
      // fladen ikke kender. Nu kræves begge dele.)
      expect(row!.group, raekke.noegle).toBe(raekke.gruppe);
      expect(GYLDIGE_GRUPPER, `${raekke.noegle}: ${row!.group}`).toContain(row!.group);
      // Månedstallene uændrede (null i planen = 0 efter afkodning).
      expect(row!.values, raekke.noegle).toEqual(raekke.maanedsbeloeb.map((v) => v ?? 0));
    }
  };

  it("Remm-budgettet overlever rundturen — 54 rækker, etiketter/grupper/tal intakte", () => {
    const g = byggGitter(
      laesMatrix(parseCsvTilMatrix(fs.readFileSync(`${FIX}/remm-budget-base-2026.csv`, "utf-8"))),
    );
    const plan = byggSkriveplan(g, "2026");
    expect(plan.raekker).toHaveLength(54);
    // Stikprøver på det der er sværest: dansk sektionsnavn og ordret etiket.
    const chatrine = plan.raekker.find((r) => r.etiket === "Chatrine Løn")!;
    expect(chatrine.gruppe).toBe("personale"); // opløst fra "Personale & konsulentydelser"
    assertRundtur(plan);
  });

  it("Topix Budget2026 overlever rundturen — 31 rækker, etiketter/grupper/tal intakte", () => {
    const g = byggGitter(laesMatrix(laesArkTilMatrix(`${FIX}/topix-budget-2026.xlsx`, "Budget2026")));
    const plan = byggSkriveplan(g, "2026");
    expect(plan.raekker).toHaveLength(31);
    const loen = plan.raekker.find((r) => r.etiket === "Løn")!;
    expect(loen.gruppe).toBe("personale"); // opløst fra "Medarbejdere"
    assertRundtur(plan);
  });
});
