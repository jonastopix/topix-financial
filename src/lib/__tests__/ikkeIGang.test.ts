import { describe, expect, it } from "vitest";
import { NY_FRA_DAGE, NY_TIL_DAGE, afgoerIkkeIGang, ikkeIGangGrundlag, ikkeIGangTekst } from "@/lib/ikkeIGang";

// «Ny og ikke kommet i gang» (9/9): tærsklen 21 dage (målt), beviset er
// én målt rapport, øvre grænse 90 dage. Grænserne fra begge sider.

const NU = new Date(2026, 8, 9, 10, 0); // 9. september 2026
const start = (dageSiden: number) => new Date(2026, 8, 9 - dageSiden, 14, 30).toISOString();
const dom = (dageSiden: number, harMaaltRapport = false, antalUploads = 0) =>
  afgoerIkkeIGang({ medlemSiden: start(dageSiden), harMaaltRapport, antalUploads }, NU);

describe("afgoerIkkeIGang — dag 20 og dag 21", () => {
  it("dag 20 uden rapport: for tidligt, intet signal", () => {
    expect(dom(20)).toMatchObject({ tilstand: "for_tidligt", dage: 20, signal: false });
  });
  it("dag 21 uden rapport: signalet", () => {
    expect(dom(21)).toMatchObject({ tilstand: "ikke_i_gang", dage: 21, signal: true });
    expect(NY_FRA_DAGE).toBe(21);
  });
  it("dag 21 MED målt rapport: i gang, intet signal — og dag 165 med rapport ligeså", () => {
    expect(dom(21, true)).toMatchObject({ tilstand: "i_gang", signal: false });
    expect(dom(165, true)).toMatchObject({ tilstand: "i_gang", signal: false });
  });
  it("kalenderdage, ikke timer: signup kl. 14:30 for 21 dage siden er dag 21 kl. 10", () => {
    expect(dom(21).dage).toBe(21);
  });
  it("ingen venten på første månedsskifte (Jonas 9/9): dag 21 er dag 21, også når medlemskabet begyndte den 20. i måneden", () => {
    // Start 20/8 → dag 21 er 10/9; ingen afsluttet måned er gået, og signalet står alligevel.
    const d = afgoerIkkeIGang({ medlemSiden: new Date(2026, 7, 20, 9).toISOString(), harMaaltRapport: false, antalUploads: 0 }, new Date(2026, 8, 10, 8));
    expect(d).toMatchObject({ tilstand: "ikke_i_gang", dage: 21, signal: true });
  });
});

describe("afgoerIkkeIGang — uploadet men ikke godkendt", () => {
  it("er stadig ikke i gang (uploaden er ikke bevis), men ordene skifter", () => {
    const d = dom(30, false, 2);
    expect(d).toMatchObject({ tilstand: "ikke_i_gang", signal: true, harUploadetUdenGodkendelse: true });
    expect(ikkeIGangTekst(d)).toBe("Medlem i 30 dage, har uploadet — tallene er ikke godkendt");
    expect(ikkeIGangTekst(dom(21))).toBe("Medlem i 21 dage, har ikke uploadet — heller ikke historik");
  });
  it("målt rapport slår uploads: i gang uanset antal", () => {
    expect(dom(30, true, 5)).toMatchObject({ tilstand: "i_gang", harUploadetUdenGodkendelse: false });
  });
});

describe("afgoerIkkeIGang — den øvre grænse og ingen start", () => {
  it("dag 90 er med, dag 91 er faldet ud (Bastants 165 står ikke for evigt)", () => {
    expect(dom(90)).toMatchObject({ tilstand: "ikke_i_gang", signal: true });
    expect(dom(91)).toMatchObject({ tilstand: "faldet_ud", signal: false });
    expect(dom(165)).toMatchObject({ tilstand: "faldet_ud", dage: 165, signal: false });
    expect(NY_TIL_DAGE).toBe(90);
  });
  it("uden medlem: ingen start, intet signal — det er invitationens problem", () => {
    expect(afgoerIkkeIGang({ medlemSiden: null, harMaaltRapport: false, antalUploads: 0 }, NU)).toMatchObject({ tilstand: "ingen_start", dage: null, signal: false });
    expect(afgoerIkkeIGang({ medlemSiden: "nej", harMaaltRapport: false, antalUploads: 0 }, NU).tilstand).toBe("ingen_start");
  });
});

describe("ikkeIGangGrundlag — lukningen", () => {
  it("startdag + antal uploads; en ny upload er noget nyt, dagene er det ikke", () => {
    const a = ikkeIGangGrundlag({ medlemSiden: "2026-08-19T12:00:00Z", harMaaltRapport: false, antalUploads: 0 });
    const b = ikkeIGangGrundlag({ medlemSiden: "2026-08-19T12:00:00Z", harMaaltRapport: false, antalUploads: 1 });
    expect(a).toBe("2026-08-19|0");
    expect(b).toBe("2026-08-19|1");
    expect(a).not.toBe(b);
  });
});
