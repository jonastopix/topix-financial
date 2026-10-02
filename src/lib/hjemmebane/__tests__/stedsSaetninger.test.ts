import { describe, expect, it } from "vitest";
import { STEDERNES_STIER, STEDS_SAETNINGER, stedForSti, stedsSaetning, visStedsSaetning, type Sted } from "@/lib/hjemmebane/stedsSaetninger";

/* «Det her er stedet, hvor …» (seks steder, 2/10-2026): den rene dom. Låser
   (1) at alle seks steder har en sætning, der begynder med forslagets ord,
   (2) hvilke stier der er stedernes forsider — og at undersider tier,
   (3) normaliseringen (query, hash, efterstillet skråstreg). */

const SEKS: Sted[] = ["boardroom", "dine_tal", "dine_maal", "netvaerket", "akademiet", "din_raadgiver"];

describe("stedsSaetninger — seks sætninger, ét sted", () => {
  it("hvert af de seks steder har én sætning, der begynder «Det her er stedet, hvor»", () => {
    expect(Object.keys(STEDS_SAETNINGER).sort()).toEqual([...SEKS].sort());
    for (const sted of SEKS) {
      expect(STEDS_SAETNINGER[sted].startsWith("Det her er stedet, hvor ")).toBe(true);
      expect(STEDS_SAETNINGER[sted].trim().length).toBeGreaterThan(40);
    }
  });
  it("alle seks steder har mindst én sti — og hver sti peger på et kendt sted", () => {
    const steder = new Set(Object.values(STEDERNES_STIER));
    for (const sted of SEKS) expect(steder.has(sted)).toBe(true);
    for (const sted of Object.values(STEDERNES_STIER)) expect(SEKS).toContain(sted);
  });
  it("stedernes forsider: forsiden, de tre tal, målene, Netværkets fem, Akademiet, chatten og booking", () => {
    expect(stedForSti("/")).toBe("boardroom");
    for (const sti of ["/reports", "/kpis", "/budget"]) expect(stedForSti(sti)).toBe("dine_tal");
    expect(stedForSti("/milestones")).toBe("dine_maal");
    for (const sti of ["/community", "/events", "/medlemmer", "/rabataftaler", "/deling"]) expect(stedForSti(sti)).toBe("netvaerket");
    expect(stedForSti("/akademiet")).toBe("akademiet");
    for (const sti of ["/chat", "/book-session"]) expect(stedForSti(sti)).toBe("din_raadgiver");
  });
  it("undersider og andre flader tier: tråd, event, profil, lektion, konto, rådgiverflader", () => {
    for (const sti of ["/community/abc", "/events/abc", "/medlemmer/abc", "/akademiet/classroom", "/akademiet/classroom/x", "/konto", "/settings", "/virksomheder", "/webinar", "/certifikat", "/handouts", "/opgaver", "/legat", ""]) {
      expect(stedForSti(sti)).toBeNull();
      expect(stedsSaetning(sti)).toBeNull();
    }
  });
  it("normaliserer: query, hash og efterstillet skråstreg ændrer intet; roden er «/»", () => {
    expect(stedForSti("/reports?reportId=1")).toBe("dine_tal");
    expect(stedForSti("/budget#forecast")).toBe("dine_tal");
    expect(stedForSti("/community/")).toBe("netvaerket");
    expect(stedForSti("/?x=1")).toBe("boardroom");
  });
  it("stedsSaetning giver stedets ord — ordret fra listen", () => {
    expect(stedsSaetning("/milestones")).toBe(STEDS_SAETNINGER.dine_maal);
    expect(stedsSaetning("/chat")).toBe(STEDS_SAETNINGER.din_raadgiver);
  });

  describe("visStedsSaetning — gaten er fail-closed (rådets fund 2)", () => {
    const tiers = ["full", "subscriber", "expired", null] as const;
    it("medlemmet: KUN tier «full» — null (mens useAuth henter, og en abonnent i første render), abonnent og udløbet giver intet", () => {
      expect(visStedsSaetning({ isAdvisor: false, viewingAsMember: false, membershipTier: "full" })).toBe(true);
      for (const tier of ["subscriber", "expired", null] as const) {
        expect(visStedsSaetning({ isAdvisor: false, viewingAsMember: false, membershipTier: tier }), String(tier)).toBe(false);
      }
    });
    it("rådgiveren: KUN i «Se som medlem» — tieren («full» hos rådgiveren) afgør intet", () => {
      for (const tier of tiers) {
        expect(visStedsSaetning({ isAdvisor: true, viewingAsMember: true, membershipTier: tier }), String(tier)).toBe(true);
        expect(visStedsSaetning({ isAdvisor: true, viewingAsMember: false, membershipTier: tier }), String(tier)).toBe(false);
      }
    });
    it("viewingAsMember uden isAdvisor ændrer intet for medlemmet", () => {
      expect(visStedsSaetning({ isAdvisor: false, viewingAsMember: true, membershipTier: null })).toBe(false);
      expect(visStedsSaetning({ isAdvisor: false, viewingAsMember: true, membershipTier: "subscriber" })).toBe(false);
    });
  });
});
