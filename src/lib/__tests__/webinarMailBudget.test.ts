import { describe, expect, it } from "vitest";
import {
  budgetTillader,
  JOB_TIMEOUT_MS,
  OPSTART_MARGIN_MS,
  resttidKraevetMs,
  senesteStartMs,
  SPOR_RESERVE_MS,
  tomtBudgetBevis,
} from "../../../supabase/functions/_shared/webinarMailBudget.ts";
import { TIMEOUT_MS } from "../../../supabase/functions/_shared/mailgunAfsendelse.ts";
import { INVITATION_TIMEOUT_MS } from "../../../supabase/functions/_shared/mimeInvitation.ts";

/**
 * Budgetdommen for webinar-mail-cron (30/9-2026, analyse-drift fund 4). Hver
 * linje i regnestykket i webinarMailBudget.ts' filhoved har sin prøve her.
 */

describe("webinarMailBudget — regnestykket", () => {
  it("konstanterne er dem, regnestykket står med", () => {
    expect(JOB_TIMEOUT_MS).toBe(60_000);
    expect(OPSTART_MARGIN_MS).toBe(5_000);
    expect(SPOR_RESERVE_MS).toBe(5_000);
    expect(INVITATION_TIMEOUT_MS).toBe(8_000);
    expect(TIMEOUT_MS).toBe(10_000);
  });

  it("resttiden: 8 000 + 10 000 + 5 000 = 23 000 med invitation, 10 000 + 5 000 = 15 000 uden", () => {
    expect(resttidKraevetMs(true)).toBe(23_000);
    expect(resttidKraevetMs(false)).toBe(15_000);
  });

  it("seneste start: 60 000 − 5 000 − 23 000 = 32 000 med invitation, − 15 000 = 40 000 uden", () => {
    expect(senesteStartMs(true)).toBe(32_000);
    expect(senesteStartMs(false)).toBe(40_000);
  });

  it("værste slut = seneste start + resttid = 55 000 — under jobbets timeout med hele marginen", () => {
    for (const med of [true, false]) {
      expect(senesteStartMs(med) + resttidKraevetMs(med)).toBe(JOB_TIMEOUT_MS - OPSTART_MARGIN_MS);
      expect(senesteStartMs(med) + resttidKraevetMs(med)).toBeLessThan(JOB_TIMEOUT_MS);
    }
  });

  it("det gamle budget (45 s tjekket FØR forsøget) kunne ende efter jobbets timeout: 45 + 8 + 10 = 63 s", () => {
    const gammeltVaerste = 45_000 + INVITATION_TIMEOUT_MS + TIMEOUT_MS;
    expect(gammeltVaerste).toBe(63_000);
    expect(gammeltVaerste).toBeGreaterThan(JOB_TIMEOUT_MS);
    // Og den nye dom afviser netop det forsøg.
    expect(budgetTillader({ forloebetMs: 45_000, medInvitation: true })).toBe(false);
    expect(budgetTillader({ forloebetMs: 45_000, medInvitation: false })).toBe(false);
  });
});

describe("webinarMailBudget — dommen", () => {
  it("tillader et forsøg lige til og med seneste start, og afviser ét millisekund efter", () => {
    expect(budgetTillader({ forloebetMs: 0, medInvitation: true })).toBe(true);
    expect(budgetTillader({ forloebetMs: 32_000, medInvitation: true })).toBe(true);
    expect(budgetTillader({ forloebetMs: 32_001, medInvitation: true })).toBe(false);
    expect(budgetTillader({ forloebetMs: 40_000, medInvitation: false })).toBe(true);
    expect(budgetTillader({ forloebetMs: 40_001, medInvitation: false })).toBe(false);
  });

  it("invitationen koster sin hentetid: 35 s er for sent med, i tide uden", () => {
    expect(budgetTillader({ forloebetMs: 35_000, medInvitation: true })).toBe(false);
    expect(budgetTillader({ forloebetMs: 35_000, medInvitation: false })).toBe(true);
  });

  it("er fail-closed på et ulæseligt eller negativt forløb", () => {
    for (const forloebetMs of [NaN, Infinity, -Infinity, -1]) {
      expect(budgetTillader({ forloebetMs, medInvitation: false }), String(forloebetMs)).toBe(false);
    }
  });

  it("beviset i svaret bærer tallene og starter uden stop", () => {
    expect(tomtBudgetBevis()).toEqual({
      job_timeout_ms: 60_000,
      opstart_margin_ms: 5_000,
      resttid_kraevet_ms: { med_invitation: 23_000, uden_invitation: 15_000 },
      seneste_start_ms: { med_invitation: 32_000, uden_invitation: 40_000 },
      stoppet_af_budget: false,
      forloebet_ved_stop_ms: null,
    });
  });
});
