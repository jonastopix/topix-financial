import { describe, it, expect } from "vitest";
// Parity/cross-boundary import (samme mønster som canonicalTechSoftwareMerge.test.ts):
// vi tester den delte Deno-motor direkte fra vitest, så CI (bun run test) dækker den.
import { normalizeToCanonical } from "../../../supabase/functions/_shared/canonicalEngine.ts";

/**
 * Regression for kolonnevalg på BALANCEPOSTER (AI-stien).
 *
 * Prod-evidens 21/7-2026: samme juni-saldobalance-PDF (Topix) parset to gange gav
 * to forskellige cash-værdier. Rådata fra financial_reports.raw_extracted_data:
 *
 *   Parse 1 (8cd4c470-011d-45e6-8adc-76d41a66cb5f, 14:17):
 *     key_figures.bank_balance = 128984.64 (ÅTD-saldo, KORREKT)
 *     line_items: ingen linje matcher "bank"/"likvid" → override-reglen fandt intet
 *     → canonical cash 128984.64
 *
 *   Parse 2 (f53ee049-09c4-4937-9979-d5d3a51c6bef, 15:24):
 *     key_figures.bank_balance = 157290.98 (AI aggregerede Bankkonto+Pleo+Stripe)
 *     line_items: { account_no: "5820", name: "Bankkonto",
 *                   period_amount: -44551.32, ytd_amount: 128984.64 }
 *     → cash_prefers_bank_line_sign valgte period_amount (canonicalEngine.ts:377,
 *       `period_amount ?? ytd_amount`) → canonical cash -44551.32 (månedens
 *       BEVÆGELSE, ikke saldoen) → "negativ likviditet" i platformen.
 *
 * Princip der håndhæves: DRIFTSPOSTER fra Perioden, BALANCEPOSTER altid fra ÅTD —
 * en saldo er kumulativ. Den deterministiske sti gør det allerede
 * (dkEconomicSaldobalancePdfV1.ts:222-282, column_basis_rule "mixed"); AI-stien
 * skal give samme garanti uanset hvad AI-laget returnerer.
 */

// ── Fixtures: essensen af de to faktiske prod-parses (raw_extracted_data) ──
// key_figures/line_items-felter uden betydning for kolonnevalget er udeladt.

const parse1_2117_1417 = {
  report_type: "saldobalance",
  report_period: "Juni 2026",
  key_figures: {
    bank_balance: 128984.64, // AI valgte selv ÅTD-kolonnen — korrekt
  },
  // Ingen bank/likvid-linje i line_items (verificeret i prod-SQL: bank_line_items = INGEN)
  line_items: [],
};

const parse2_2117_1524 = {
  report_type: "saldobalance",
  report_period: "Juni 2026",
  key_figures: {
    bank_balance: 157290.98, // AI aggregerede flere likvid-konti (Bankkonto+Pleo+Stripe)
  },
  line_items: [
    {
      account_no: "5820",
      name: "Bankkonto",
      period_amount: -44551.32, // Perioden = månedens bevægelse
      ytd_amount: 128984.64, // ÅTD = den faktiske saldo
      raw_sign: "MINUS",
      class: "ASSET",
    },
  ],
};

describe("balance=ÅTD-håndhævelse — cash fra bank-linjens ÅTD-kolonne", () => {
  it("parse 1 (14:17, prod): cash forbliver 128984.64 (regressionsværn)", () => {
    const { metrics } = normalizeToCanonical(parse1_2117_1417, "ai_extraction");
    expect(metrics.cash).toBe(128984.64);
  });

  it("parse 2 (15:24, prod): cash skal være ÅTD-saldoen 128984.64, ikke bevægelsen -44551.32", () => {
    const { metrics, correction_log } = normalizeToCanonical(parse2_2117_1524, "ai_extraction");
    expect(metrics.cash).toBe(128984.64);

    // Auditerbarhed: håndhævelsen ændrede kf-værdien (157290.98 → 128984.64),
    // så der SKAL ligge en correction_log-entry med det håndhævede tal.
    const cashEntry = correction_log.find((c) => c.field === "cash");
    expect(cashEntry?.normalized_value).toBe(128984.64);
  });

  it("samme inputklasse giver samme cash deterministisk på tværs af de to parse-former", () => {
    const cash1 = normalizeToCanonical(parse1_2117_1417, "ai_extraction").metrics.cash;
    const cash2 = normalizeToCanonical(parse2_2117_1524, "ai_extraction").metrics.cash;
    expect(cash1).toBe(cash2);
  });

  // Fortegnsbevarelse via ÅTD-fortegnet: overtræk er stadig negativt.
  // Syntetisk variant af parse 2-formen (ikke prod-data).
  it("overtræk: negativt ÅTD-fortegn bevares (syntetisk)", () => {
    const overdraft = {
      report_type: "saldobalance",
      key_figures: { bank_balance: 5000 },
      line_items: [
        { account_no: "5820", name: "Bankkonto", period_amount: 5000, ytd_amount: -12000, raw_sign: "MINUS", class: "ASSET" },
      ],
    };
    const { metrics } = normalizeToCanonical(overdraft, "ai_extraction");
    expect(metrics.cash).toBe(-12000);
  });
});

describe("balance=ÅTD-håndhævelse — øvrige balanceposter (recon punkt 1, del b)", () => {
  // Syntetisk, men bygget over promptens eget eksempel (index.ts:1031-1032):
  // "Debitorer 50.000 i periode betyder at debitor STEG med 50.000 den måned.
  //  Debitorer 300.000 i år-til-dato er den faktiske saldo vi vil have."
  // AI'en har her bevisligt valgt Perioden-kolonnen (kf == linjens period_amount),
  // og linjen dokumenterer den korrekte ÅTD-saldo.
  it("debitorer: bevist Perioden-valg korrigeres til ÅTD-saldoen (syntetisk)", () => {
    const periodenPicked = {
      report_type: "saldobalance",
      key_figures: { debitorer: 50000 },
      line_items: [
        { account_no: "6900", name: "Debitorer", period_amount: 50000, ytd_amount: 300000, raw_sign: "PLUS", class: "ASSET" },
      ],
    };
    const { metrics } = normalizeToCanonical(periodenPicked, "ai_extraction");
    expect(metrics.trade_receivables).toBe(300000);
  });
});
