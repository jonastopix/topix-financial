import { describe, expect, it } from "vitest";
import {
  ADVARSEL_ANDEL,
  DAGSLOFT_STANDARD,
  doemLoft,
  laesTal,
  LOFT_MAKS,
  LOFT_NOEGLE,
  vaelgLoft,
} from "../../../supabase/functions/_shared/cvrLoft.ts";
import { cvrLoftBesked, HAEV_LOFTET } from "../../../supabase/functions/_shared/cvrLoftBesked.ts";

/**
 * CVR-dagsloftet (udkast 19/9-2026, recon-boelgen-2 §3). To ting testes her:
 * at et ubrugeligt tal ALDRIG kan slukke loftet, og at advarslen kommer FØR
 * loftet er brugt op.
 */

describe("laesTal — et ubrugeligt tal må aldrig blive til et loft", () => {
  it("tager hele, positive tal — som tal og som tekst", () => {
    expect(laesTal(20)).toEqual({ ok: true, tal: 20 });
    expect(laesTal("40")).toEqual({ ok: true, tal: 40 });
    expect(laesTal("  25  ")).toEqual({ ok: true, tal: 25 });
    expect(laesTal(1)).toEqual({ ok: true, tal: 1 });
    expect(laesTal(LOFT_MAKS)).toEqual({ ok: true, tal: LOFT_MAKS });
  });

  it("AFVISER netop det, der før blev til NaN og slukkede loftet", () => {
    // `Number("tyve")` er NaN, og `brugt >= NaN` er altid falsk.
    for (const ond of ["tyve", "20 stk", "2o", "", "   ", "20,5", "20.0", "-5", "0", "1e3", "NaN", "Infinity"]) {
      const d = laesTal(ond);
      expect(d.ok, `«${ond}» blev accepteret`).toBe(false);
    }
  });

  it("afviser typer der ikke er tal, og tal uden for skalaen", () => {
    expect(laesTal(null).ok).toBe(false);
    expect(laesTal(undefined).ok).toBe(false);
    expect(laesTal(true).ok).toBe(false);
    expect(laesTal({}).ok).toBe(false);
    expect(laesTal(LOFT_MAKS + 1).ok).toBe(false);
    expect(laesTal(-3).ok).toBe(false);
  });
});

describe("vaelgLoft — app_config først, så secret, så koden", () => {
  it("app_config vinder over secret'en", () => {
    expect(vaelgLoft(40, "25")).toMatchObject({ loft: 40, kilde: "app_config" });
  });

  it("secret'en bruges, når app_config ikke er sat", () => {
    expect(vaelgLoft(null, "25")).toMatchObject({ loft: 25, kilde: "secret" });
    expect(vaelgLoft(undefined, "25")).toMatchObject({ loft: 25, kilde: "secret" });
  });

  it("koden bruges, når intet er sat — den eksisterende opsætning ændres ikke", () => {
    expect(vaelgLoft(null, undefined)).toMatchObject({ loft: DAGSLOFT_STANDARD, kilde: "standard" });
    expect(vaelgLoft(null, "")).toMatchObject({ loft: DAGSLOFT_STANDARD, kilde: "standard" });
  });

  it("en UBRUGELIG app_config-værdi springes over — den falder til secret'en, ikke til NaN", () => {
    const svar = vaelgLoft("tyve", "25");
    expect(svar).toMatchObject({ loft: 25, kilde: "secret" });
    expect(svar.afvist).toEqual([{ kilde: "app_config", vaerdi: "tyve", grund: "ikke et helt tal" }]);
  });

  it("er BEGGE ubrugelige, står koden tilbage — og begge er navngivet i loggen", () => {
    const svar = vaelgLoft("-1", "abc");
    expect(svar).toMatchObject({ loft: DAGSLOFT_STANDARD, kilde: "standard" });
    expect(svar.afvist.map((a) => a.kilde)).toEqual(["app_config", "secret"]);
  });

  it("tager jsonb i de tre former det kan komme i", () => {
    expect(vaelgLoft(40, null).loft).toBe(40);
    expect(vaelgLoft("40", null).loft).toBe(40);
    expect(vaelgLoft({ vaerdi: 40 }, null).loft).toBe(40);
  });

  it("nøglen er den migrationen skriver", () => {
    expect(LOFT_NOEGLE).toBe("ansoegning_cvr_dagsloft");
  });
});

describe("doemLoft — advarslen kommer FØR loftet er brugt op", () => {
  it("med loft 20 går advarslen ved 16, og «ramt» ved 20", () => {
    expect(doemLoft(0, 20)).toMatchObject({ tilstand: "fri", resterende: 20, advarselVed: 16 });
    expect(doemLoft(15, 20).tilstand).toBe("fri");
    expect(doemLoft(16, 20)).toMatchObject({ tilstand: "advarsel", resterende: 4 });
    expect(doemLoft(19, 20)).toMatchObject({ tilstand: "advarsel", resterende: 1 });
    expect(doemLoft(20, 20)).toMatchObject({ tilstand: "ramt", resterende: 0 });
    expect(doemLoft(99, 20)).toMatchObject({ tilstand: "ramt", resterende: 0, andel: 1 });
  });

  it("advarslen er 80 %, rundet OP — så den aldrig lander oven i loftet selv", () => {
    expect(ADVARSEL_ANDEL).toBe(0.8);
    for (const loft of [5, 10, 20, 25, 40, 50, 100]) {
      const d = doemLoft(0, loft);
      expect(d.advarselVed).toBe(Math.ceil(loft * 0.8));
      expect(d.advarselVed, `loft ${loft}`).toBeLessThanOrEqual(loft);
      expect(d.advarselVed).toBeGreaterThan(0);
    }
  });

  it("et bittelille loft har ingen advarselszone — og siger det ved sidste opslag i stedet for slet ikke", () => {
    expect(doemLoft(0, 1)).toMatchObject({ tilstand: "fri", advarselVed: 1 });
    expect(doemLoft(1, 1).tilstand).toBe("ramt");
    expect(doemLoft(2, 3)).toMatchObject({ tilstand: "fri", advarselVed: 3 });
  });

  it("fail-closed-tælleren (MAX_SAFE_INTEGER) læses som «ramt», ikke som et frit loft", () => {
    expect(doemLoft(Number.MAX_SAFE_INTEGER, 20).tilstand).toBe("ramt");
  });

  it("et ubrugeligt loft falder tilbage på standarden i stedet for at dividere med nul", () => {
    for (const daarligt of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = doemLoft(0, daarligt);
      expect(d.advarselVed).toBe(Math.ceil(DAGSLOFT_STANDARD * 0.8));
      expect(Number.isFinite(d.andel)).toBe(true);
    }
  });
});

describe("beskederne — advarslen kan handles på, stoppet kan ikke", () => {
  it("advarslen siger hvor mange der er tilbage, og hvordan loftet hæves", () => {
    const b = cvrLoftBesked("naermer_sig", "2026-09-22", 20, 16);
    expect(b.title).toBe("CVR-opslag 2026-09-22: 16 af 20 brugt — 4 tilbage");
    expect(b.body).toContain("4 CVR-opslag tilbage");
    expect(b.body).toContain("update public.app_config");
  });

  it("advarslen og stop-beskeden har FORSKELLIGE titler — ellers dedup'er den ene den anden væk", () => {
    const advarsel = cvrLoftBesked("naermer_sig", "2026-09-22", 20, 16);
    const stoppet = cvrLoftBesked("dagsloft", "2026-09-22", 20);
    expect(advarsel.title).not.toBe(stoppet.title);
    expect(advarsel.type).toBe(stoppet.type);
  });

  it("stop-beskeden peger nu på app_config, ikke kun på secret'en", () => {
    expect(cvrLoftBesked("dagsloft", "2026-09-22", 20).body).toContain(HAEV_LOFTET);
  });

  it("DataCVR's egen grænse er stadig sin egen besked — vi kan ikke hæve deres loft", () => {
    const b = cvrLoftBesked("datacvr", "2026-09-22", 20);
    expect(b.body).toContain("DataCVR");
    expect(b.body).not.toContain("update public.app_config");
  });

  it("alle tre grunde siger konsekvensen: anbefalingen regnes uden CVR-data", () => {
    for (const g of ["dagsloft", "datacvr", "naermer_sig"] as const) {
      expect(cvrLoftBesked(g, "2026-09-22", 20, 16).body.toLowerCase()).toContain("branche");
    }
  });
});
