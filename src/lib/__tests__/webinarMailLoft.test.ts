import { describe, expect, it } from "vitest";
import {
  beregnKoerselsLoft,
  erStopStatus,
  LOFT_PAUSE_MS,
  LOFT_VINDUE_MS,
  MAILGUN_LOFT_PR_TIME,
  STOP_STATUSSER,
  type LoftRaekke,
} from "../../../supabase/functions/_shared/webinarMailLoft.ts";

/**
 * Loftet for én kørsel af webinar-mail-cron (29/9-2026). Hver regel i
 * webinarMailLoft.ts' filhoved har sin prøve her; paritet med spejlet i
 * webinarMailLoft.paritet.test.ts.
 */

const NU = new Date("2026-09-29T08:09:00Z");
const MIN = 60_000;
/** En række `minutter` før NU. */
const raekke = (minutter: number, udfald = "ok", status: number | null = 200): LoftRaekke =>
  ({ forsoegt_at: new Date(NU.getTime() - minutter * MIN).toISOString(), udfald, status });
const ok = (n: number, fra = 1) => Array.from({ length: n }, (_, i) => raekke(fra + (i % 50)));

describe("webinarMailLoft — konstanterne", () => {
  it("loftet er 1000 (Jonas 29/9, probationen ophævet — IKKE en Mailgun-grænse), vinduet og pausen er 60 minutter, og stop-koderne er 403 · 420 · 429", () => {
    expect(MAILGUN_LOFT_PR_TIME).toBe(1000);
    expect(LOFT_VINDUE_MS).toBe(60 * MIN);
    expect(LOFT_PAUSE_MS).toBe(60 * MIN);
    expect([...STOP_STATUSSER]).toEqual([403, 420, 429]);
    for (const s of [403, 420, 429]) expect(erStopStatus(s), String(s)).toBe(true);
    for (const s of [200, 400, 401, 404, 500, null, undefined]) expect(erStopStatus(s), String(s)).toBe(false);
  });
});

describe("webinarMailLoft — maks = loft − forsøg de sidste 60 min", () => {
  it("tomt spor → maks 1000, ingen pause", () => {
    expect(beregnKoerselsLoft({ seneste: [], loft: MAILGUN_LOFT_PR_TIME, nu: NU })).toEqual({ maks: 1000, pause: null });
  });

  it("med det RIGTIGE loft: 217 forsøg (7-dagsholdet 6/10) → 783; 1000 → 0; 1200 → 0 (aldrig negativt)", () => {
    expect(beregnKoerselsLoft({ seneste: ok(217), loft: MAILGUN_LOFT_PR_TIME, nu: NU })).toEqual({ maks: 783, pause: null });
    expect(beregnKoerselsLoft({ seneste: ok(1000), loft: MAILGUN_LOFT_PR_TIME, nu: NU })).toEqual({ maks: 0, pause: null });
    expect(beregnKoerselsLoft({ seneste: ok(1200), loft: MAILGUN_LOFT_PR_TIME, nu: NU })).toEqual({ maks: 0, pause: null });
  });

  it("det højere loft afskaffer IKKE bremsen: et 403/420/429 giver stadig pausen med det rigtige loft", () => {
    for (const status of [403, 420, 429]) {
      const dom = beregnKoerselsLoft({ seneste: [...ok(20), raekke(10, "loft", status)], loft: MAILGUN_LOFT_PR_TIME, nu: NU });
      expect(dom.maks, String(status)).toBe(0);
      expect(dom.pause?.til.toISOString(), String(status)).toBe(new Date(NU.getTime() + 50 * MIN).toISOString());
    }
  });

  it("85 forsøg → 5", () => {
    expect(beregnKoerselsLoft({ seneste: ok(85), loft: 90, nu: NU }).maks).toBe(5);
  });

  it("90 forsøg → 0, og 120 → 0 (aldrig negativt)", () => {
    expect(beregnKoerselsLoft({ seneste: ok(90), loft: 90, nu: NU })).toEqual({ maks: 0, pause: null });
    expect(beregnKoerselsLoft({ seneste: ok(120), loft: 90, nu: NU })).toEqual({ maks: 0, pause: null });
  });

  it("blandet ok og fejl tæller BEGGE — et afvist kald er stadig et kald hos Mailgun", () => {
    const seneste = [
      ...ok(40),
      ...Array.from({ length: 30 }, (_, i) => raekke(2 + i, "fejl", 500)),
      ...Array.from({ length: 10 }, (_, i) => raekke(3 + i, "ugyldig", 400)),
      raekke(4, "timeout", null),
      raekke(5, "ingen_noegle", null),
    ];
    expect(beregnKoerselsLoft({ seneste, loft: 90, nu: NU }).maks).toBe(90 - 82);
  });

  it("vinduet er 60 minutter, eksklusivt: 59 min 59 s tæller, præcis 60 min gør ikke", () => {
    const inde = { forsoegt_at: new Date(NU.getTime() - 60 * MIN + 1000).toISOString(), udfald: "ok", status: 200 };
    const ude = { forsoegt_at: new Date(NU.getTime() - 60 * MIN).toISOString(), udfald: "ok", status: 200 };
    expect(beregnKoerselsLoft({ seneste: [inde], loft: 90, nu: NU }).maks).toBe(89);
    expect(beregnKoerselsLoft({ seneste: [ude], loft: 90, nu: NU }).maks).toBe(90);
    expect(beregnKoerselsLoft({ seneste: [raekke(61)], loft: 90, nu: NU }).maks).toBe(90);
  });

  it("et ulæseligt forsoegt_at tæller som nu, og et loft, der ikke er et tal, er nul — fail-closed", () => {
    expect(beregnKoerselsLoft({ seneste: [{ forsoegt_at: "ikke en tid", udfald: "ok", status: 200 }], loft: 90, nu: NU }).maks).toBe(89);
    expect(beregnKoerselsLoft({ seneste: [], loft: Number.NaN, nu: NU }).maks).toBe(0);
  });
});

describe("webinarMailLoft — pausen, når Mailgun har sagt stop", () => {
  it("et 403 for 10 min siden → maks 0, pause til +50 min, grunden nævner 403", () => {
    const dom = beregnKoerselsLoft({ seneste: [...ok(20), raekke(10, "noegle_afvist", 403)], loft: 90, nu: NU });
    expect(dom.maks).toBe(0);
    expect(dom.pause?.til.toISOString()).toBe(new Date(NU.getTime() + 50 * MIN).toISOString());
    expect(dom.pause?.grund).toContain("403");
    expect(dom.pause?.grund).toContain("venter timen ud");
  });

  it("420 og 429 stopper på samme måde", () => {
    for (const [status, udfald] of [[420, "ugyldig"], [429, "loft"]] as const) {
      const dom = beregnKoerselsLoft({ seneste: [raekke(30, udfald, status)], loft: 90, nu: NU });
      expect(dom.maks, String(status)).toBe(0);
      expect(dom.pause?.til.toISOString(), String(status)).toBe(new Date(NU.getTime() + 30 * MIN).toISOString());
    }
  });

  it("et 429 for 61 min siden tæller ikke — hverken som forsøg eller som stop", () => {
    expect(beregnKoerselsLoft({ seneste: [raekke(61, "loft", 429)], loft: 90, nu: NU })).toEqual({ maks: 90, pause: null });
  });

  it("pausen regnes fra det NYESTE stop, uanset rækkefølgen i listen", () => {
    const dom = beregnKoerselsLoft({ seneste: [raekke(5, "loft", 429), raekke(50, "noegle_afvist", 403), raekke(20, "ugyldig", 420)], loft: 90, nu: NU });
    expect(dom.pause?.til.toISOString()).toBe(new Date(NU.getTime() + 55 * MIN).toISOString());
    expect(dom.pause?.grund).toContain("429");
  });

  it("en almindelig fejl (500, 400, 401) er IKKE et stop — den tæller kun som et forsøg", () => {
    for (const status of [500, 400, 401, 404]) {
      expect(beregnKoerselsLoft({ seneste: [raekke(10, "fejl", status)], loft: 90, nu: NU }), String(status)).toEqual({ maks: 89, pause: null });
    }
  });
});
