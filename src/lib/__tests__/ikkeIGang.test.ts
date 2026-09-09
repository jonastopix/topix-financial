import { describe, expect, it } from "vitest";
import {
  NY_FRA_DAGE, NY_TIL_DAGE, TRIN_1_DAGE,
  afgoerIkkeIGang, ikkeIGangGrundlag, ikkeIGangHandling, ikkeIGangTekst, skalSpringesOverIPaamindelse,
} from "@/lib/ikkeIGang";

// «Ny og ikke kommet i gang» (9/9): to trin, én dom — trin 1 fra dag 7
// («ikke kommet i gang endnu»), trin 2 fra dag 21 («gået i stå», målt),
// øvre grænse 90. Beviset er én målt rapport. Grænserne fra begge sider.

const NU = new Date(2026, 8, 9, 10, 0); // 9. september 2026
const start = (dageSiden: number) => new Date(2026, 8, 9 - dageSiden, 14, 30).toISOString();
const input = (dageSiden: number, harMaaltRapport = false, antalUploads = 0) => ({ medlemSiden: start(dageSiden), harMaaltRapport, antalUploads });
const dom = (dageSiden: number, harMaaltRapport = false, antalUploads = 0) => afgoerIkkeIGang(input(dageSiden, harMaaltRapport, antalUploads), NU);

describe("afgoerIkkeIGang — trin 1: dag 6 og dag 7", () => {
  it("dag 6: for tidligt; dag 7: trin 1, «ikke kommet i gang endnu»", () => {
    expect(dom(6)).toMatchObject({ tilstand: "for_tidligt", dage: 6, signal: false, trin: null });
    expect(dom(7)).toMatchObject({ tilstand: "ikke_begyndt", dage: 7, signal: true, trin: 1 });
    expect(TRIN_1_DAGE).toBe(7);
    expect(ikkeIGangTekst(dom(7))).toBe("Medlem i 7 dage, ikke kommet i gang endnu — historik kan sendes fra dag ét");
    expect(ikkeIGangHandling(dom(7), "Bastant Design")).toBe("Spørg Bastant Design hvilket system de bruger");
  });
});

describe("afgoerIkkeIGang — trin 2: dag 20 og dag 21", () => {
  it("dag 20 er stadig trin 1; dag 21 er trin 2, «gået i stå»", () => {
    expect(dom(20)).toMatchObject({ tilstand: "ikke_begyndt", dage: 20, trin: 1 });
    expect(dom(21)).toMatchObject({ tilstand: "ikke_i_gang", dage: 21, signal: true, trin: 2 });
    expect(NY_FRA_DAGE).toBe(21);
    expect(ikkeIGangTekst(dom(21))).toBe("Medlem i 21 dage, gået i stå — har ikke uploadet, heller ikke historik");
    expect(ikkeIGangHandling(dom(21), "Bastant Design")).toBe("Hjælp Bastant Design i gang");
  });
  it("målt rapport slår alt: i gang på dag 7, 21 og 165", () => {
    for (const d of [7, 21, 165]) expect(dom(d, true)).toMatchObject({ tilstand: "i_gang", signal: false, trin: null });
  });
  it("kalenderdage, ikke timer: signup kl. 14:30 for 21 dage siden er dag 21 kl. 10", () => {
    expect(dom(21).dage).toBe(21);
  });
  it("ingen venten på første månedsskifte (Jonas 9/9): dag 21 er dag 21, også når medlemskabet begyndte den 20. i måneden", () => {
    const d = afgoerIkkeIGang({ medlemSiden: new Date(2026, 7, 20, 9).toISOString(), harMaaltRapport: false, antalUploads: 0 }, new Date(2026, 8, 10, 8));
    expect(d).toMatchObject({ tilstand: "ikke_i_gang", dage: 21, signal: true, trin: 2 });
  });
});

describe("afgoerIkkeIGang — uploadet men ikke godkendt", () => {
  it("er stadig et signal på begge trin (uploaden er ikke bevis), men ordene skifter", () => {
    expect(ikkeIGangTekst(dom(9, false, 1))).toBe("Medlem i 9 dage, har uploadet — tallene venter på godkendelse");
    expect(ikkeIGangTekst(dom(30, false, 2))).toBe("Medlem i 30 dage, gået i stå — har uploadet, tallene er ikke godkendt");
    expect(dom(30, false, 2)).toMatchObject({ tilstand: "ikke_i_gang", signal: true, harUploadetUdenGodkendelse: true });
  });
  it("målt rapport slår uploads", () => {
    expect(dom(30, true, 5)).toMatchObject({ tilstand: "i_gang", harUploadetUdenGodkendelse: false });
  });
});

describe("afgoerIkkeIGang — den øvre grænse og ingen start", () => {
  it("dag 90 er med (trin 2), dag 91 er faldet ud", () => {
    expect(dom(90)).toMatchObject({ tilstand: "ikke_i_gang", signal: true, trin: 2 });
    expect(dom(91)).toMatchObject({ tilstand: "faldet_ud", signal: false, trin: null });
    expect(dom(165)).toMatchObject({ tilstand: "faldet_ud", dage: 165 });
    expect(NY_TIL_DAGE).toBe(90);
  });
  it("uden medlem: ingen start, intet signal", () => {
    expect(afgoerIkkeIGang({ medlemSiden: null, harMaaltRapport: false, antalUploads: 0 }, NU)).toMatchObject({ tilstand: "ingen_start", dage: null, signal: false });
    expect(afgoerIkkeIGang({ medlemSiden: "nej", harMaaltRapport: false, antalUploads: 0 }, NU).tilstand).toBe("ingen_start");
  });
});

describe("ikkeIGangGrundlag — lukningen", () => {
  it("startdag | uploads | trin: en ny upload er nyt, trin 2 efter trin 1 er nyt, dagene inden for et trin er det ikke", () => {
    const i7 = input(7);
    const g7 = ikkeIGangGrundlag(i7, afgoerIkkeIGang(i7, NU));
    expect(g7).toBe(`${start(7).slice(0, 10)}|0|trin1`);
    const dag8 = new Date(2026, 8, 10, 10);
    expect(ikkeIGangGrundlag(i7, afgoerIkkeIGang(i7, dag8))).toBe(g7);
    const dag21 = new Date(2026, 8, 23, 10);
    expect(ikkeIGangGrundlag(i7, afgoerIkkeIGang(i7, dag21))).toBe(`${start(7).slice(0, 10)}|0|trin2`);
    const i7u = input(7, false, 1);
    expect(ikkeIGangGrundlag(i7u, afgoerIkkeIGang(i7u, NU))).toBe(`${start(7).slice(0, 10)}|1|trin1`);
  });
});

describe("skalSpringesOverIPaamindelse — rapportpåmindelsen", () => {
  it("ny uden nogen upload springes over — fra dag 0 til og med dag 90", () => {
    for (const d of [0, 6, 7, 20, 21, 90]) {
      expect(skalSpringesOverIPaamindelse(input(d), NU)).toEqual({ spring: true, grund: `ny_uden_upload (medlem i ${d} dage)` });
    }
  });
  it("uploadet uden godkendelse rykkes (godkend-varianten); målt rapport rykkes; faldet ud rykkes; uden medlem rykkes som før", () => {
    expect(skalSpringesOverIPaamindelse(input(10, false, 1), NU)).toEqual({ spring: false, grund: null });
    expect(skalSpringesOverIPaamindelse(input(10, true, 0), NU)).toEqual({ spring: false, grund: null });
    expect(skalSpringesOverIPaamindelse(input(91), NU)).toEqual({ spring: false, grund: null });
    expect(skalSpringesOverIPaamindelse({ medlemSiden: null, harMaaltRapport: false, antalUploads: 0 }, NU)).toEqual({ spring: false, grund: null });
  });
});
