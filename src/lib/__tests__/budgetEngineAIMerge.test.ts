import { beforeEach, describe, expect, it, vi } from "vitest";

/** Værn mod AI-merge-fejlen (hb-ai-merge-recon §c, levende fund Floren
    Engros 2026-08-05): edge-funktionen viser modellen KUN labels
    (baseSummary bruger r.label) men beder om "key" retur — det gamle
    ordrette match producerede da en stille base-kopi og meldte succes m.
    reasoning. Skrevet som RØD repro mod den gamle kode; grøn efter U3
    (normaliseret match + ærlig nul-match-fejl uden skrivning). */

const h = vi.hoisted(() => {
  const state: { aiResponse: unknown } = { aiResponse: null };
  const insertSpy = vi.fn(async () => ({ error: null }));
  return { state, insertSpy };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async () => ({ data: h.state.aiResponse, error: null })),
    },
    from: () => ({
      // Tom-tabel-builder m. kædebare order/range (fetchExistingRows
      // paginerer nu, fix/loadbudget-over-tusind) — svarer stadig tomt.
      select: () => {
        const builder = {
          eq: () => builder,
          order: () => builder,
          range: async () => ({ data: [], error: null }),
        };
        return builder;
      },
      delete: () => ({ in: async () => ({ error: null }) }),
      insert: h.insertSpy,
    }),
  },
}));

import { generateAIScenario } from "../budgetEngine";
import type { BudgetRow } from "@/components/budget/types";

const row = (key: string, label: string, group: string, monthly: number): BudgetRow => ({
  key,
  label,
  values: Array(12).fill(monthly),
  isEditable: true,
  group,
});

// Importeret budget uden skabelon (Floren-formen): keys fra importen,
// labels m. specialtegn som "Vareforbrug / COGS" og "Fragt & levering".
const baseRows: BudgetRow[] = [
  row("omsaetning", "Omsætning", "indtaegter", 100_000),
  row("vareforbrug", "Vareforbrug / COGS", "variable", 40_000),
  row("fragt_levering", "Fragt & levering", "variable", 8_000),
];

const args = {
  userId: "user-1",
  companyId: "company-1",
  year: "2026",
  target: "pessimistisk" as const,
  baseRows,
};

describe("generateAIScenario — merge-leddet (repro af pessimistisk-fejlen)", () => {
  beforeEach(() => {
    h.insertSpy.mockClear();
  });

  it("dansk-normaliserede keys (æ + lowercase af label) skal matche — ikke stille base-kopi", async () => {
    h.state.aiResponse = {
      categories: [
        { key: "omsætning", monthly: Array(12).fill(80_000) },
        { key: "vareforbrug / cogs", monthly: Array(12).fill(44_000) },
        { key: "fragt & levering", monthly: Array(12).fill(8_800) },
      ],
      reasoning: "Omsætning reduceret 20 %, variable omkostninger øget 10 %.",
    };

    const { updatedRows } = await generateAIScenario(args);

    expect(updatedRows.find((r) => r.key === "omsaetning")!.values).toEqual(Array(12).fill(80_000));
    expect(updatedRows.find((r) => r.key === "vareforbrug")!.values).toEqual(Array(12).fill(44_000));
    expect(updatedRows.find((r) => r.key === "fragt_levering")!.values).toEqual(Array(12).fill(8_800));
  });

  it("label-baserede keys m. casing-/mellemrums-varianter skal matche", async () => {
    h.state.aiResponse = {
      categories: [
        { key: "OMSÆTNING", monthly: Array(12).fill(85_000) },
        { key: "Vareforbrug/COGS", monthly: Array(12).fill(43_000) },
        { key: "Fragt & Levering ", monthly: Array(12).fill(8_500) },
      ],
      reasoning: "Justeret for lavere aktivitet.",
    };

    const { updatedRows } = await generateAIScenario(args);

    expect(updatedRows.find((r) => r.key === "omsaetning")!.values).toEqual(Array(12).fill(85_000));
    expect(updatedRows.find((r) => r.key === "vareforbrug")!.values).toEqual(Array(12).fill(43_000));
    expect(updatedRows.find((r) => r.key === "fragt_levering")!.values).toEqual(Array(12).fill(8_500));
  });

  it("nul-match må ALDRIG blive stille succes: ærlig fejl og INGEN skrivning", async () => {
    h.state.aiResponse = {
      categories: [
        { key: "revenue", monthly: Array(12).fill(1) },
        { key: "cost_of_goods", monthly: Array(12).fill(2) },
      ],
      reasoning: "Reduceret omsætning og øgede omkostninger.",
    };

    await expect(generateAIScenario(args)).rejects.toThrow(/matchede ikke/i);
    expect(h.insertSpy).not.toHaveBeenCalled();
  });
});
