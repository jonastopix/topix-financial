/**
 * Fortegnsdommen (10/9-2026, recon-fortegnsdommen §2, §5, §6).
 *
 * suspicious_sign_pattern kører EFTER normaliseringen, hvor omsætning,
 * omkostninger, aktiver og passiver allerede er tvunget positive. Før talte
 * den alle udfyldte nøgler og fældede ved > 50 % negative — dvs. den fældede
 * resultatkæden, som er negativ ved ethvert underskud med negativt
 * dækningsbidrag. ANLA GLAS' tre filer 7/7-2026 («5/9 metrics negative») var
 * tab, ikke vendte filer. Nu tæller dommen kun de felter der ikke lovligt
 * kan være negative: ankre (omsætning, aktiver, passiver) og de rene
 * omkostningsposter.
 *
 * period_consistency: ÅTD 0 mod en periode ≠ 0 er ingen aflæsning (Warburg
 * 8/7-2026, «YTD (0) < period (1631529.45)») — den behandles som fravær.
 */
import { describe, expect, it } from "vitest";
import {
  SIGN_LOCKED_ANCHORS,
  SIGN_LOCKED_COSTS,
  SIGN_LOCKED_COSTS_MIN,
  buildCanonicalOutput,
  inferPeriodBasis,
  runExtendedValidation,
  ytdErAflaest,
} from "../../../supabase/functions/_shared/canonicalEngine.ts";
import type { CanonicalMetrics } from "../../../supabase/functions/_shared/canonicalTypes.ts";

const tomme: CanonicalMetrics = {
  revenue: null, cogs: null, gross_profit: null, gross_margin_pct: null,
  payroll: null, payroll_related: null, other_staff_costs: null,
  sales_costs: null, facility_costs: null, admin_costs: null, vehicle_costs: null,
  ebitda: null, depreciation: null, ebit: null, financial_costs: null,
  extraordinary_items: null, ebt: null, net_result: null,
  assets_total: null, inventory: null, receivables_total: null,
  trade_receivables: null, unbilled_wip: null, cash: null,
  equity_total: null, equity_ratio_pct: null, related_party_net: null,
  provisions_total: null, current_liabilities: null, debt_total: null,
  vat_payable: null, liabilities_total: null,
};

const metrics = (m: Partial<CanonicalMetrics>): CanonicalMetrics => ({ ...tomme, ...m });

const signCheck = (m: CanonicalMetrics) =>
  runExtendedValidation({ key_figures: {} }, m, "period", "pnl", []).canonical_checks.find(
    (c) => c.name === "suspicious_sign_pattern",
  )!;

describe("suspicious_sign_pattern — et underskud er ikke en vendt fil", () => {
  it("ANLA-formen: fem negative i resultatkæden af ni udfyldte → PASS (før: FAIL «5/9 metrics negative»)", () => {
    const m = metrics({
      revenue: 500_000, cogs: 600_000, gross_profit: -100_000, gross_margin_pct: -20,
      payroll: 100_000, admin_costs: 50_000, ebitda: -250_000, ebt: -260_000, net_result: -260_000,
    });
    const udfyldte = Object.values(m).filter((v) => v != null).length;
    const negative = Object.values(m).filter((v) => typeof v === "number" && v < 0).length;
    expect(`${negative}/${udfyldte}`).toBe("5/9"); // præcis prod-mønstret
    const check = signCheck(m);
    expect(check.result).toBe("PASS");
    expect(check.details).toMatch(/result chain not counted/);
  });

  it("hele rapporten som tab gennem den legacy-kanoniske sti: status PASS, ikke needs_manual_entry-vejen", () => {
    const extracted = {
      report_type: "resultatopgørelse",
      report_period: "April 2025",
      key_figures: {
        omsaetning: 500_000, direkte_omkostninger: 600_000, daekningsbidrag: -100_000,
        loenninger: 100_000, admin: 50_000, resultat_foer_skat: -260_000, resultat_efter_skat: -260_000,
      },
      line_items: [],
    };
    const out = buildCanonicalOutput(extracted, extracted, "deterministic_template");
    const check = out.validation.canonical_checks.find((c) => c.name === "suspicious_sign_pattern")!;
    expect(check.result).toBe("PASS");
    expect(out.validation.status).toBe("PASS");
    // Afledte er stadig negative — de tælles bare ikke længere.
    expect(out.metrics.gross_margin_pct).toBeLessThan(0);
    expect(out.metrics.ebitda).toBeLessThan(0);
  });

  it("overtræk og negativ egenkapital er lovlige og tælles ikke", () => {
    const m = metrics({ revenue: 100_000, payroll: 20_000, cash: -50_000, equity_total: -30_000, ebt: -10_000, net_result: -10_000 });
    expect(signCheck(m).result).toBe("PASS");
  });

  it("negativ omsætning fælder stadig — én negativ anker er en vendt fil", () => {
    const m = metrics({ revenue: -500_000, cogs: 200_000, gross_profit: 300_000, payroll: 100_000, admin_costs: 50_000, ebt: 150_000 });
    const check = signCheck(m);
    expect(check.result).toBe("FAIL");
    expect(check.details).toMatch(/revenue=-500000 negative/);
  });

  it("negative aktiver eller passiver i alt fælder", () => {
    expect(signCheck(metrics({ revenue: 100_000, assets_total: -1_000_000, liabilities_total: 1_000_000 })).result).toBe("FAIL");
    expect(signCheck(metrics({ revenue: 100_000, assets_total: 1_000_000, liabilities_total: -1_000_000 })).result).toBe("FAIL");
  });

  it("et vendt omkostningssæt (flertallet negative) fælder; én tilbageførsel passerer", () => {
    const vendt = metrics({ revenue: 500_000, payroll: -100_000, admin_costs: -50_000, facility_costs: -20_000, depreciation: 10_000 });
    const check = signCheck(vendt);
    expect(check.result).toBe("FAIL");
    expect(check.details).toMatch(/3\/4 cost fields negative/);

    const tilbagefoersel = metrics({ revenue: 500_000, payroll: 100_000, admin_costs: 50_000, facility_costs: 20_000, depreciation: -10_000 });
    expect(signCheck(tilbagefoersel).result).toBe("PASS");
  });

  it("GULVET (10/9, ANLA «1/1»): under tre omkostningsfelter dømmes omkostningerne ikke — 1/1, 1/2 og 2/2 passerer", () => {
    expect(SIGN_LOCKED_COSTS_MIN).toBe(3);
    const enAfEn = signCheck(metrics({ revenue: 500_000, admin_costs: -14_082 }));
    expect(enAfEn.result).toBe("PASS");
    expect(enAfEn.details).toMatch(/1\/1 cost fields negative, under floor of 3: not judged/);
    expect(signCheck(metrics({ revenue: 500_000, payroll: 100_000, admin_costs: -14_082 })).result).toBe("PASS");
    expect(signCheck(metrics({ revenue: 500_000, payroll: -100_000, admin_costs: -14_082 })).result).toBe("PASS");
  });
  it("fra tre felter gælder flertallet: 2/3 og 3/3 fælder, 1/3 passerer", () => {
    expect(signCheck(metrics({ revenue: 500_000, payroll: -100_000, admin_costs: -14_082, depreciation: 10_000 })).result).toBe("FAIL");
    expect(signCheck(metrics({ revenue: 500_000, payroll: -100_000, admin_costs: -14_082, depreciation: -10_000 })).result).toBe("FAIL");
    expect(signCheck(metrics({ revenue: 500_000, payroll: 100_000, admin_costs: 14_082, depreciation: -10_000 })).result).toBe("PASS");
  });
  it("gulvet gælder kun omkostningerne — én negativ anker fælder stadig alene", () => {
    expect(signCheck(metrics({ revenue: -500_000, admin_costs: -14_082 })).result).toBe("FAIL");
  });

  it("cogs er contra-cost og tæller ikke med i omkostningssættet", () => {
    expect(SIGN_LOCKED_COSTS).not.toContain("cogs");
    expect(SIGN_LOCKED_ANCHORS).toEqual(["revenue", "assets_total", "liabilities_total"]);
    const m = metrics({ revenue: 500_000, cogs: -20_000, gross_profit: 520_000, payroll: 100_000, ebt: 400_000 });
    expect(signCheck(m).result).toBe("PASS");
  });

  it("på legacy-stien vendes negativ omsætning af normaliseringen FØR dommen (revenue_must_be_positive) — dommen er ikke det eneste værn", () => {
    const extracted = {
      report_type: "resultatopgørelse",
      report_period: "Oktober 2025",
      key_figures: { omsaetning: -500_000, direkte_omkostninger: 200_000, daekningsbidrag: 300_000, loenninger: 100_000, resultat_foer_skat: 150_000 },
      line_items: [],
    };
    const out = buildCanonicalOutput(extracted, extracted, "ai");
    expect(out.metrics.revenue).toBe(500_000);
    expect(out.correction_log.some((c) => c.rule === "revenue_must_be_positive")).toBe(true);
  });
});

describe("period_consistency — ÅTD 0 er ingen aflæsning", () => {
  it("ytdErAflaest: null og 0-mod-periode er fravær; alt andet er en aflæsning", () => {
    expect(ytdErAflaest(1_631_529.45, null)).toBe(false);
    expect(ytdErAflaest(1_631_529.45, 0)).toBe(false);
    expect(ytdErAflaest(0, 0)).toBe(true);
    expect(ytdErAflaest(100, 100)).toBe(true);
    expect(ytdErAflaest(100, 50)).toBe(true);
  });

  const periodeCheck = (kf: Record<string, number | null>) =>
    runExtendedValidation({ key_figures: kf }, tomme, "period", "pnl", []).canonical_checks.find(
      (c) => c.name === "period_consistency",
    )!;

  it("Warburg 8/7: YTD 0 mod periode 1.631.529,45 → SKIP, ikke FAIL", () => {
    const check = periodeCheck({ omsaetning: 1_631_529.45, omsaetning_aar: 0 });
    expect(check.result).toBe("SKIP");
    expect(check.details).toMatch(/YTD column not read/);
  });

  it("samme nul fælder heller ikke mixed_period_columns_detected: periodebasis bliver «period», ikke «unknown»", () => {
    expect(inferPeriodBasis({ omsaetning: 1_631_529.45, omsaetning_aar: 0 })).toBe("period");
    expect(inferPeriodBasis({ omsaetning: 100, omsaetning_aar: 50 })).toBe("unknown");
  });

  it("et rigtigt ÅTD under perioden fælder stadig; januar (lighed) passerer", () => {
    expect(periodeCheck({ omsaetning: 100_000, omsaetning_aar: 50_000 }).result).toBe("FAIL");
    expect(periodeCheck({ omsaetning: 100_000, omsaetning_aar: 100_000 }).result).toBe("PASS");
    expect(periodeCheck({ omsaetning: 100_000, omsaetning_aar: null }).result).toBe("SKIP");
  });
});
