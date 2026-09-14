/**
 * Mailfejlens dom (14/9 2026, _shared/mailFejl.ts): en 429 fra Lovables
 * mail-API er «rate_limited» — ikke en anonym «failed» — med Retry-After
 * båret med; 5xx er retryable; en spærret modtager er uændret; og en
 * kørsel til mange stopper ved første rate limit. Ren dom, ingen HTTP.
 */
import { describe, expect, it } from "vitest";
import {
  erRetryableStatus,
  klassificerMailFejl,
  logStatusFor,
  logTekstFor,
  RATE_LIMIT_STATUS,
  skalKoeStoppe,
} from "../../../supabase/functions/_shared/mailFejl.ts";

describe("klassificerMailFejl — 429 er rate_limited, ikke failed", () => {
  it("429 → rate_limited, retryable, med Retry-After båret med", () => {
    expect(klassificerMailFejl({ status: 429, code: null, retryAfterSeconds: 37, message: "Email API error: 429 rate limit" }))
      .toEqual({ reason: "rate_limited", retryable: true, retryAfterSeconds: 37 });
    expect(RATE_LIMIT_STATUS).toBe(429);
  });

  it("429 uden Retry-After → retryAfterSeconds null (ikke 0, ikke undefined)", () => {
    expect(klassificerMailFejl({ status: 429, message: "x" })).toEqual({ reason: "rate_limited", retryable: true, retryAfterSeconds: null });
    expect(klassificerMailFejl({ status: 429, retryAfterSeconds: Number.NaN, message: "x" }).retryAfterSeconds).toBeNull();
    expect(klassificerMailFejl({ status: 429, retryAfterSeconds: -5, message: "x" }).retryAfterSeconds).toBeNull();
    expect(klassificerMailFejl({ status: 429, retryAfterSeconds: 0, message: "x" }).retryAfterSeconds).toBe(0);
  });

  it("5xx → failed, men retryable — pakkens egen regel", () => {
    for (const status of [500, 502, 503, 599]) {
      expect(klassificerMailFejl({ status, message: "x" })).toEqual({ reason: "failed", retryable: true, retryAfterSeconds: null });
      expect(erRetryableStatus(status)).toBe(true);
    }
  });

  it("4xx (ikke 429), ingen status, eller en ikke-API-fejl → failed, ikke retryable", () => {
    expect(klassificerMailFejl({ status: 400, message: "x" })).toEqual({ reason: "failed", retryable: false, retryAfterSeconds: null });
    expect(klassificerMailFejl({ status: 401, message: "x" }).retryable).toBe(false);
    expect(klassificerMailFejl({ message: "LOVABLE_API_KEY missing" })).toEqual({ reason: "failed", retryable: false, retryAfterSeconds: null });
    expect(erRetryableStatus(null)).toBe(false);
    expect(erRetryableStatus(429)).toBe(false); // 429 er sin egen dom, ikke «retryable failed»
  });

  it("recipient_suppressed er uændret — og vinder over status, også over 429", () => {
    expect(klassificerMailFejl({ status: 400, code: "recipient_suppressed", message: "x" }))
      .toEqual({ reason: "recipient_suppressed", retryable: false, retryAfterSeconds: null });
    expect(klassificerMailFejl({ status: 429, code: "recipient_suppressed", retryAfterSeconds: 10, message: "x" }).reason)
      .toBe("recipient_suppressed");
  });
});

describe("loggen — status og tekst pr. dom", () => {
  it("tre statusser, alle kendt af EmailLogView (STATUS_LABELS/ALL_STATUSES)", () => {
    expect(logStatusFor("recipient_suppressed")).toBe("suppressed");
    expect(logStatusFor("rate_limited")).toBe("rate_limited");
    expect(logStatusFor("failed")).toBe("failed");
  });

  it("rate limit-teksten bærer Retry-After, den spærrede den gamle tekst, failed beskeden selv", () => {
    expect(logTekstFor({ reason: "rate_limited", retryable: true, retryAfterSeconds: 42 }, "Email API error: 429 x"))
      .toBe("Rate limit hos udbyderen (429, Retry-After 42 s): Email API error: 429 x");
    expect(logTekstFor({ reason: "rate_limited", retryable: true, retryAfterSeconds: null }, "y"))
      .toBe("Rate limit hos udbyderen (429, Retry-After ukendt): y");
    expect(logTekstFor({ reason: "recipient_suppressed", retryable: false, retryAfterSeconds: null }, "z"))
      .toBe("Modtageren er spærret (afmeldt, bounce eller klage)");
    expect(logTekstFor({ reason: "failed", retryable: false, retryAfterSeconds: null }, "Email API error: 400 w"))
      .toBe("Email API error: 400 w");
  });
});

describe("skalKoeStoppe — kun rate limit stopper en kørsel", () => {
  it("rate_limited → stop", () => {
    expect(skalKoeStoppe({ sent: false, reason: "rate_limited" })).toBe(true);
  });
  it("failed, recipient_suppressed og sent → fortsæt", () => {
    expect(skalKoeStoppe({ sent: false, reason: "failed" })).toBe(false);
    expect(skalKoeStoppe({ sent: false, reason: "recipient_suppressed" })).toBe(false);
    expect(skalKoeStoppe({ sent: true })).toBe(false);
  });

  it("en kø på 50 stopper ved den første 429 — resten står tilbage, ikke 49 nye afvisninger", () => {
    // Simuleret kørsel: svarene som udbyderen ville give dem i rækkefølge.
    const svar = [
      { sent: true }, { sent: true }, { sent: false, reason: "failed" },
      { sent: false, reason: "rate_limited" },
      ...Array.from({ length: 46 }, () => ({ sent: false, reason: "rate_limited" })),
    ];
    let forsoeg = 0, tilbage = 0;
    for (let i = 0; i < svar.length; i++) {
      forsoeg++;
      if (skalKoeStoppe(svar[i])) { tilbage = svar.length - i - 1; break; }
    }
    expect(forsoeg).toBe(4);   // tre almindelige + den første 429
    expect(tilbage).toBe(46);  // står ustemplede til næste kørsel
  });
});
