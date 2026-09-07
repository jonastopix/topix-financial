import { describe, expect, it, vi } from "vitest";
import { OMKOSTNINGSNOEGLER_DK, positiveOmkostninger } from "@/lib/omkostningsFortegn";

// Payload-opsamlende Supabase-stub (retDataEbitdaLoss-mønstret): vi kører
// den FAKTISKE saveManualOverride og asserterer på det payload der ville
// ramme financial_reports.manual_normalized_data.
type CapturedUpdate = { manual_normalized_data: { metrics: Record<string, number | null> } };
const captured = vi.hoisted(() => [] as CapturedUpdate[]);
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (payload: CapturedUpdate) => {
        captured.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));

import { saveManualOverride } from "@/lib/reportOverrideHelpers";

describe("positiveOmkostninger — de seks omkostningsposter er |beløb|, intet andet røres", () => {
  it("vender negative omkostninger positive", () => {
    const ud = positiveOmkostninger({
      direkte_omkostninger: -600000, loenninger: -320000, salgsomkostninger: -45000,
      lokaleomkostninger: -60000, administrationsomkostninger: -85000, afskrivninger: -40000,
    });
    for (const k of OMKOSTNINGSNOEGLER_DK) expect(ud[k]).toBeGreaterThan(0);
    expect(ud.loenninger).toBe(320000);
  });
  it("lader positive omkostninger være", () => {
    expect(positiveOmkostninger({ loenninger: 30000.1, afskrivninger: 6243.97 })).toEqual({ loenninger: 30000.1, afskrivninger: 6243.97 });
  });
  it("rører IKKE resultatlinjer og balancen — de kan være ægte negative (mangellisten #38)", () => {
    const ud = positiveOmkostninger({
      omsaetning: 100000, daekningsbidrag: -12000, resultat_foer_skat: -125000.5,
      egenkapital: -50000, bank_balance: -8000, kreditorer: -95000, loenninger: -1,
    });
    expect(ud.daekningsbidrag).toBe(-12000);
    expect(ud.resultat_foer_skat).toBe(-125000.5);
    expect(ud.egenkapital).toBe(-50000);
    expect(ud.bank_balance).toBe(-8000);
    expect(ud.kreditorer).toBe(-95000);
    expect(ud.loenninger).toBe(1);
  });
  it("null og manglende nøgler bevares", () => {
    expect(positiveOmkostninger({ loenninger: null, afskrivninger: undefined })).toEqual({ loenninger: null, afskrivninger: undefined });
    expect("salgsomkostninger" in positiveOmkostninger({ omsaetning: 1 })).toBe(false);
  });
  it("muterer ikke input", () => {
    const ind = { loenninger: -5 };
    positiveOmkostninger(ind);
    expect(ind.loenninger).toBe(-5);
  });
});

describe("den manuelle skrivevej — saveManualOverride gemmer omkostninger positive", () => {
  const base = { reportId: "r", userId: "u", month: 6, year: 2026, reportType: "saldobalance", note: "", overrideSource: "advisor", status: "applied" as const };

  it("minus i formularen (regnskabets konvention, som placeholders foreslår) → positivt i payloadet", async () => {
    await saveManualOverride({
      ...base,
      metricInputs: {
        omsaetning: "1250000", direkte_omkostninger: "-600000", daekningsbidrag: "650000",
        loenninger: "-320000", salgsomkostninger: "-45000", lokaleomkostninger: "-60000",
        administrationsomkostninger: "-85000", afskrivninger: "-40000",
        resultat_foer_skat: "120000", egenkapital: "750000", kreditorer: "-95000",
      },
    });
    const m = captured.at(-1)!.manual_normalized_data.metrics;
    expect(m.direkte_omkostninger).toBe(600000);
    expect(m.loenninger).toBe(320000);
    expect(m.salgsomkostninger).toBe(45000);
    expect(m.lokaleomkostninger).toBe(60000);
    expect(m.administrationsomkostninger).toBe(85000);
    expect(m.afskrivninger).toBe(40000);
    // Resten som tastet:
    expect(m.kreditorer).toBe(-95000);
    expect(m.resultat_foer_skat).toBe(120000);
    // Og EBITDA/EBIT afledes nu (før: guarden `opex > 0` udelod dem for minus-tal):
    expect(m.ebitda).toBe(650000 - (320000 + 45000 + 60000 + 85000));
    expect(m.ebit).toBe(140000 - 40000);
  });

  it("positive tal gemmes uændret — samme fortegn som månedsvejen", async () => {
    await saveManualOverride({ ...base, metricInputs: { daekningsbidrag: "45000,97", loenninger: "30000,1", afskrivninger: "6243,97" } });
    const m = captured.at(-1)!.manual_normalized_data.metrics;
    expect(m.loenninger).toBe(30000.1);
    expect(m.afskrivninger).toBe(6243.97);
  });
});
