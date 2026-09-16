/**
 * Medlemmets alarm kun for den seneste afsluttede måned (16/9, valg B):
 * _shared/alarmPeriode.ts — dansk tid, årsskifte, månedsskiftet i de to
 * timer hvor UTC og Danmark er uenige, og period_key-formen.
 */
import { describe, expect, it } from "vitest";
import {
  PERIOD_KEY_FORM,
  senesteAfsluttedeMaaned,
  skalMedlemsAlarm,
} from "../../../supabase/functions/_shared/alarmPeriode.ts";

describe("senesteAfsluttedeMaaned — set fra Danmark", () => {
  it("16/9-2026 → august", () => {
    expect(senesteAfsluttedeMaaned(new Date("2026-09-16T10:00:00Z"))).toBe("2026-08");
  });
  it("årsskifte: 5/1-2026 → december 2025", () => {
    expect(senesteAfsluttedeMaaned(new Date("2026-01-05T10:00:00Z"))).toBe("2025-12");
  });
  it("månedsskiftet i dansk tid: 30/9 kl. 23:30 UTC er 1/10 kl. 01:30 dansk → september; 21:59:59 UTC er stadig 30/9 → august", () => {
    expect(senesteAfsluttedeMaaned(new Date("2026-09-30T23:30:00Z"))).toBe("2026-09");
    expect(senesteAfsluttedeMaaned(new Date("2026-09-30T22:00:00Z"))).toBe("2026-09");
    expect(senesteAfsluttedeMaaned(new Date("2026-09-30T21:59:59Z"))).toBe("2026-08");
  });
  it("vintertid: 31/12 kl. 23:00 UTC er 1/1 kl. 00:00 dansk → december; 22:59:59 UTC → november", () => {
    expect(senesteAfsluttedeMaaned(new Date("2026-12-31T23:00:00Z"))).toBe("2026-12");
    expect(senesteAfsluttedeMaaned(new Date("2026-12-31T22:59:59Z"))).toBe("2026-11");
  });
  it("marts efter et skudår-februar: 10/3-2028 → 2028-02", () => {
    expect(senesteAfsluttedeMaaned(new Date("2028-03-10T12:00:00Z"))).toBe("2028-02");
  });
});

describe("skalMedlemsAlarm — kun den seneste afsluttede måned, kun «YYYY-MM»", () => {
  const NU = new Date("2026-09-16T12:29:00Z");
  it("august 2026 → ja; alle andre måneder → nej (Lisbeths fire: februar, marts, juli, august)", () => {
    expect(skalMedlemsAlarm("2026-08", NU)).toBe(true);
    for (const key of ["2026-02", "2026-03", "2026-05", "2026-06", "2026-07", "2026-09", "2025-08"]) {
      expect(skalMedlemsAlarm(key, NU), key).toBe(false);
    }
  });
  it("indeværende måned er ikke afsluttet → nej; efter månedsskiftet bliver den det", () => {
    expect(skalMedlemsAlarm("2026-09", NU)).toBe(false);
    expect(skalMedlemsAlarm("2026-09", new Date("2026-09-30T22:00:00Z"))).toBe(true);
    expect(skalMedlemsAlarm("2026-08", new Date("2026-09-30T22:00:00Z"))).toBe(false);
  });
  it("ugyldig form → aldrig (fail-closed): «2026-8», «August 2026», «2026-13», tom, null, undefined, mellemrum", () => {
    for (const key of ["2026-8", "August 2026", "2026-13", "2026-00", "", "  ", "2026-08-01"]) {
      expect(skalMedlemsAlarm(key, NU), key).toBe(false);
    }
    expect(skalMedlemsAlarm(null, NU)).toBe(false);
    expect(skalMedlemsAlarm(undefined, NU)).toBe(false);
    expect(skalMedlemsAlarm(" 2026-08 ", NU)).toBe(true); // trimmes
  });
  it("formen er facts' YYYY-MM (CHECK 20260310074139:5)", () => {
    expect(PERIOD_KEY_FORM.test("2026-08")).toBe(true);
    expect(PERIOD_KEY_FORM.test("2026-12")).toBe(true);
    expect(PERIOD_KEY_FORM.test("2026-13")).toBe(false);
  });
});
