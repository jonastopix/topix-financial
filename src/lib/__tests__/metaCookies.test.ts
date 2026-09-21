import { describe, expect, it } from "vitest";
import {
  cookieVaerdi, harMetaCookies, laesMetaCookies, META_FBC_COOKIE, META_FBC_FORM, META_FBP_COOKIE, META_FBP_FORM,
  metaCookiesAf, TOMME_META_COOKIES,
} from "@/lib/ansoegning/skema";

/**
 * Metas egne cookier fra theboardroom.dk (22/9-2026, udkast-meta-udvidelse pkt. 13).
 * Reglen er den samme som for GA's _ga: findes cookien ikke, eller passer værdien ikke Metas
 * form, er svaret null — ALDRIG et gæt. Og værdien røres ikke: Metas ord er «ClickID value is
 * case sensitive - do not apply any modifications before using, such as lower or upper case.»
 */
const FBP = "fb.1.1790017100000.1234567890";
const FBC = "fb.1.1790017100000.IwAR0abcDEF_123-xyz";

describe("metaCookies — fladen læser _fbp og _fbc af document.cookie", () => {
  it("begge til stede, i en rigtig cookiestreng med andre cookier omkring", () => {
    const c = `_ga=GA1.1.123.456; ${META_FBP_COOKIE}=${FBP}; sb-access-token=xyz; ${META_FBC_COOKIE}=${FBC}`;
    expect(laesMetaCookies(c)).toEqual({ fbp: FBP, fbc: FBC });
  });
  it("cookienavnene er Metas egne", () => {
    expect(META_FBP_COOKIE).toBe("_fbp");
    expect(META_FBC_COOKIE).toBe("_fbc");
  });
  it("VÆRDIEN RØRES IKKE: store og små bogstaver i klik-id'et står, som Meta skrev dem", () => {
    const blandet = "fb.1.1790017100000.IwAR_MiXeD-Case123";
    expect(laesMetaCookies(`${META_FBC_COOKIE}=${blandet}`).fbc).toBe(blandet);
  });
  it("intet samtykke på theboardroom.dk = ingen cookier = null, aldrig et gæt", () => {
    expect(laesMetaCookies("_ga=GA1.1.1.2")).toEqual(TOMME_META_COOKIES);
    expect(laesMetaCookies("")).toEqual(TOMME_META_COOKIES);
    expect(laesMetaCookies(null)).toEqual(TOMME_META_COOKIES);
    expect(laesMetaCookies(undefined)).toEqual(TOMME_META_COOKIES);
  });
  it("en værdi uden Metas form er ikke en værdi", () => {
    for (const v of ["", "fb.1.abc.def", "1.1.1.1", "fbq.1.2.3", "fb.1.2", "fb.1.1790017100000."]) {
      expect(laesMetaCookies(`${META_FBC_COOKIE}=${v}`).fbc, v).toBeNull();
    }
    // _fbp'ens sidste led er et TAL («randomnumber»); et klik-id dér er ikke en fbp.
    expect(laesMetaCookies(`${META_FBP_COOKIE}=fb.1.1790017100000.IwARx`).fbp).toBeNull();
    expect(META_FBP_FORM.test(FBP)).toBe(true);
    expect(META_FBC_FORM.test(FBC)).toBe(true);
  });
  it("cookieVaerdi er den samme parser, som GA bruger — én parser, ikke to", () => {
    expect(cookieVaerdi(`${META_FBP_COOKIE}=${FBP}`, META_FBP_COOKIE)).toBe(FBP);
    expect(cookieVaerdi("_fbp_andet=x", META_FBP_COOKIE)).toBeNull(); // præfiksforveksling
  });
});

describe("metaCookies — serveren dømmer formen IGEN (metaCookiesAf)", () => {
  it("det, en ærlig flade sender, kommer igennem", () => {
    expect(metaCookiesAf({ fbp: FBP, fbc: FBC })).toEqual({ fbp: FBP, fbc: FBC });
    expect(metaCookiesAf({ fbp: ` ${FBP} `, fbc: ` ${FBC} ` })).toEqual({ fbp: FBP, fbc: FBC });
  });
  it("fail-closed pr. felt: en forkert form bliver null, den anden overlever", () => {
    expect(metaCookiesAf({ fbp: "pjat", fbc: FBC })).toEqual({ fbp: null, fbc: FBC });
    expect(metaCookiesAf({ fbp: FBP, fbc: 42 })).toEqual({ fbp: FBP, fbc: null });
  });
  it("alt, der ikke er et objekt, er tomt — en klient må ikke kunne sende noget som helst ind", () => {
    for (const v of [null, undefined, "x", 7, [], [FBP], true]) expect(metaCookiesAf(v), JSON.stringify(v)).toEqual(TOMME_META_COOKIES);
    expect(metaCookiesAf({ ukendt: "x" })).toEqual(TOMME_META_COOKIES);
  });
  it("en overdreven lang værdi er ikke en cookie", () => {
    expect(metaCookiesAf({ fbp: `fb.1.1790017100000.${"1".repeat(400)}`, fbc: null }).fbp).toBeNull();
  });
  it("harMetaCookies: kun når der er noget at gemme", () => {
    expect(harMetaCookies(TOMME_META_COOKIES)).toBe(false);
    expect(harMetaCookies({ fbp: FBP, fbc: null })).toBe(true);
    expect(harMetaCookies({ fbp: null, fbc: FBC })).toBe(true);
  });
});
