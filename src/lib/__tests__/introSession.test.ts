import { describe, expect, it } from "vitest";
import { afgoerIntroSession, erAfholdt, formatIntroTid, introSessionTekst, type IntroBooking } from "@/lib/introSession";

// Intro-sessionen (8/9): AFHOLDT = booked og slut_tid passeret. Uden sluttid:
// ukendt, ikke afholdt. «Udeblev» kan ikke vides (ingen no_show i abonnementet).

const NU = new Date("2026-09-08T12:00:00Z");
const b = (over: Partial<IntroBooking> = {}): IntroBooking => ({
  status: "booked",
  start_tid: "2026-09-03T09:00:00Z",
  slut_tid: "2026-09-03T09:30:00Z",
  created_at: "2026-09-01T10:00:00Z",
  ...over,
});

describe("erAfholdt — grænserne om sluttidspunktet", () => {
  it("sluttede i går: afholdt", () => {
    expect(erAfholdt(b(), NU)).toBe(true);
  });
  it("slutter om fem minutter: ikke afholdt; sluttede for et minut siden: afholdt; præcis nu: afholdt", () => {
    expect(erAfholdt(b({ slut_tid: "2026-09-08T12:05:00Z" }), NU)).toBe(false);
    expect(erAfholdt(b({ slut_tid: "2026-09-08T11:59:00Z" }), NU)).toBe(true);
    expect(erAfholdt(b({ slut_tid: "2026-09-08T12:00:00Z" }), NU)).toBe(true);
  });
  it("uden sluttid: ukendt = ikke afholdt, også når mødet må være passeret", () => {
    expect(erAfholdt(b({ slut_tid: null, start_tid: "2026-05-01T09:00:00Z" }), NU)).toBe(false);
    expect(erAfholdt(b({ slut_tid: "ikke en dato" }), NU)).toBe(false);
  });
  it("kun booked tæller: aflyst, link sendt og pending er aldrig afholdt", () => {
    for (const status of ["cancelled", "booking_sent", "pending", "paid", "refunded"]) {
      expect(erAfholdt(b({ status }), NU)).toBe(false);
    }
    expect(erAfholdt(null, NU)).toBe(false);
  });
});

describe("afgoerIntroSession — tilstanden", () => {
  it("afholdt / booket / booket uden tid / link sendt / aflyst / ingen", () => {
    expect(afgoerIntroSession(b(), NU).tilstand).toBe("afholdt");
    expect(afgoerIntroSession(b({ start_tid: "2026-09-15T09:00:00Z", slut_tid: "2026-09-15T09:30:00Z" }), NU).tilstand).toBe("booket");
    expect(afgoerIntroSession(b({ start_tid: null, slut_tid: null }), NU).tilstand).toBe("booket_uden_tid");
    expect(afgoerIntroSession(b({ status: "booking_sent", start_tid: null, slut_tid: null }), NU).tilstand).toBe("link_sendt");
    expect(afgoerIntroSession(b({ status: "cancelled" }), NU).tilstand).toBe("aflyst");
    expect(afgoerIntroSession(null, NU).tilstand).toBe("ingen");
    expect(afgoerIntroSession(b({ status: "pending" }), NU).tilstand).toBe("ingen");
  });
});

describe("ordene — dansk tid, uafhængigt af maskinens zone", () => {
  it("formatIntroTid: UTC 09:00 er kl. 11.00 i september (CEST)", () => {
    expect(formatIntroTid(new Date("2026-09-15T09:00:00Z"), true)).toBe("15. september kl. 11.00");
    expect(formatIntroTid(new Date("2026-09-15T09:00:00Z"), false)).toBe("15. september");
    // Vintertid: UTC 10:00 er kl. 11.00.
    expect(formatIntroTid(new Date("2026-12-01T10:00:00Z"), true)).toBe("1. december kl. 11.00");
  });
  it("linjens tekster", () => {
    expect(introSessionTekst(afgoerIntroSession(b(), NU), b())).toBe("Afholdt 3. september");
    const kommende = b({ start_tid: "2026-09-15T09:00:00Z", slut_tid: "2026-09-15T09:30:00Z" });
    expect(introSessionTekst(afgoerIntroSession(kommende, NU), kommende)).toBe("Booket til 15. september kl. 11.00");
    const udenTid = b({ start_tid: null, slut_tid: null });
    expect(introSessionTekst(afgoerIntroSession(udenTid, NU), udenTid)).toBe("Booket — tidspunktet er ikke registreret (fra før 8/9)");
    const link = b({ status: "booking_sent", start_tid: null, slut_tid: null });
    expect(introSessionTekst(afgoerIntroSession(link, NU), link)).toBe("Link sendt 1. september, ingen tid valgt");
    expect(introSessionTekst(afgoerIntroSession(b({ status: "cancelled" }), NU), b({ status: "cancelled" }))).toBe("Aflyst");
    expect(introSessionTekst(afgoerIntroSession(null, NU), null)).toBeNull();
  });
});
