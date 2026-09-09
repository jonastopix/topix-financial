import { describe, expect, it } from "vitest";
import {
  ALVOR_VENTER_PAA_VELKOMST,
  VELKOMST_FRA_DAGE,
  afgoerVenterPaaVelkomst,
  kalenderdageSiden,
  venterPaaVelkomstGrundlag,
  venterPaaVelkomstTekst,
} from "@/lib/venterPaaVelkomst";

// «Venter på velkomst» (9/9): et medlem er kommet ind, og ingen rådgiver
// har skrevet en menneskebesked. Samme dag er for tidligt, en uge er for
// sent — én kalenderdag. Forsvinder når en rådgiver har skrevet, punktum.

const NU = new Date(2026, 8, 9, 10, 0); // 9. september 2026 kl. 10
const dageFoer = (n: number, t = 14) => new Date(2026, 8, 9 - n, t, 30).toISOString();

describe("afgoerVenterPaaVelkomst — grænserne", () => {
  it("konstanterne: én dag, alvor 80", () => {
    expect(VELKOMST_FRA_DAGE).toBe(1);
    expect(ALVOR_VENTER_PAA_VELKOMST).toBe(80);
  });

  it("ingen medlemmer: intet signal — det er invitationens problem, ikke velkomstens", () => {
    expect(afgoerVenterPaaVelkomst({ medlemSiden: null, sidsteRaadgiverBeskedAt: null }, NU)).toEqual({ tilstand: "ingen_medlem", dage: null, signal: false });
    expect(afgoerVenterPaaVelkomst({ medlemSiden: "hest", sidsteRaadgiverBeskedAt: null }, NU).signal).toBe(false);
  });

  it("samme kalenderdag (dag 0): for tidligt — rådgiveren har dagen", () => {
    expect(afgoerVenterPaaVelkomst({ medlemSiden: dageFoer(0, 9), sidsteRaadgiverBeskedAt: null }, NU)).toEqual({ tilstand: "for_tidligt", dage: 0, signal: false });
  });

  it("dag 1: signalet — også når der er gået under 24 timer (kalenderdag, ikke timer)", () => {
    // Kom ind i går kl. 14:30, nu er det kl. 10: 19,5 timer, men én kalenderdag.
    expect(afgoerVenterPaaVelkomst({ medlemSiden: dageFoer(1), sidsteRaadgiverBeskedAt: null }, NU)).toEqual({ tilstand: "venter", dage: 1, signal: true });
  });

  it("dag 3 og dag 165: signalet — ingen øvre grænse, det er det bagudrettede signal", () => {
    expect(afgoerVenterPaaVelkomst({ medlemSiden: dageFoer(3), sidsteRaadgiverBeskedAt: null }, NU).signal).toBe(true);
    const d165 = afgoerVenterPaaVelkomst({ medlemSiden: new Date(2026, 2, 28, 12, 0), sidsteRaadgiverBeskedAt: null }, NU);
    expect(d165.signal).toBe(true);
    expect(d165.dage).toBe(165);
  });
});

describe("afgoerVenterPaaVelkomst — forsvinder når en rådgiver har skrevet, punktum", () => {
  it("én rådgiverbesked — også fra dag 0 — og signalet er væk, uanset hvor mange dage der er gået", () => {
    expect(afgoerVenterPaaVelkomst({ medlemSiden: dageFoer(3), sidsteRaadgiverBeskedAt: dageFoer(2) }, NU)).toEqual({ tilstand: "hilst_paa", dage: 3, signal: false });
    expect(afgoerVenterPaaVelkomst({ medlemSiden: dageFoer(165), sidsteRaadgiverBeskedAt: dageFoer(160) }, NU).signal).toBe(false);
  });

  it("stemplet vinder over dag 0 og dag 1 alike (hilst_paa før for_tidligt)", () => {
    expect(afgoerVenterPaaVelkomst({ medlemSiden: dageFoer(0), sidsteRaadgiverBeskedAt: dageFoer(0) }, NU).tilstand).toBe("hilst_paa");
  });

  it("et ulæseligt stempel tæller ikke som en besked", () => {
    expect(afgoerVenterPaaVelkomst({ medlemSiden: dageFoer(2), sidsteRaadgiverBeskedAt: "ikke en dato" }, NU).signal).toBe(true);
  });

  it("at MEDLEMMET har skrevet, ændrer intet her — inputtet er rådgiverens stempel (de venter stadig på os)", () => {
    // Kalderen giver kun last_advisor_reply_at; en medlemsbesked er en anden grund («venter på svar»).
    expect(afgoerVenterPaaVelkomst({ medlemSiden: dageFoer(2), sidsteRaadgiverBeskedAt: null }, NU).signal).toBe(true);
  });
});

describe("venterPaaVelkomstTekst — husets ord", () => {
  it("i går, og N dage", () => {
    expect(venterPaaVelkomstTekst({ tilstand: "venter", dage: 1, signal: true })).toBe("Kom ind i går, har ikke hørt fra os");
    expect(venterPaaVelkomstTekst({ tilstand: "venter", dage: 3, signal: true })).toBe("Kom ind for 3 dage siden, har ikke hørt fra os");
    expect(venterPaaVelkomstTekst({ tilstand: "venter", dage: 165, signal: true })).toBe("Kom ind for 165 dage siden, har ikke hørt fra os");
  });
});

describe("venterPaaVelkomstGrundlag — startdagen, ikke dagene", () => {
  it("samme grundlag i dag og om en uge: at tiden går er ikke noget nyt", () => {
    const input = { medlemSiden: "2026-09-06T14:30:00.000Z", sidsteRaadgiverBeskedAt: null };
    expect(venterPaaVelkomstGrundlag(input)).toBe("2026-09-06");
    expect(venterPaaVelkomstGrundlag({ ...input })).toBe(venterPaaVelkomstGrundlag(input));
  });
  it("uden medlem: tom streng", () => {
    expect(venterPaaVelkomstGrundlag({ medlemSiden: null, sidsteRaadgiverBeskedAt: null })).toBe("");
  });
});

describe("kalenderdageSiden", () => {
  it("regner på læserens dag", () => {
    expect(kalenderdageSiden(new Date(2026, 8, 8, 23, 59), new Date(2026, 8, 9, 0, 1))).toBe(1);
    expect(kalenderdageSiden(null, NU)).toBeNull();
  });
});
