import { describe, expect, it } from "vitest";
import { denneUgesFredag, efterMaalFrist, fraDatoStreng, naesteUgesFredag, omEnMaaned, tilDatoStreng } from "../opgaveDato";

/** Datoknapperne i opgavefladen (B6/B11). Faste ankre i lokal tid —
    2026-08-31 er en mandag, 2026-09-04 en fredag (doomsday-verificeret). */
const MANDAG = new Date(2026, 7, 31);
const FREDAG = new Date(2026, 8, 4);
const LOERDAG = new Date(2026, 8, 5);
const SOENDAG = new Date(2026, 8, 6);

describe("denneUgesFredag — nærmeste kommende fredag", () => {
  it("mandag → samme uges fredag", () => {
    expect(tilDatoStreng(denneUgesFredag(MANDAG))).toBe("2026-09-04");
  });

  it("fredag → i dag (frist i dag er lovlig; forfald indtræder først dagen efter)", () => {
    expect(tilDatoStreng(denneUgesFredag(FREDAG))).toBe("2026-09-04");
  });

  it("lørdag og søndag → NÆSTE fredag (den nærmeste kommende)", () => {
    expect(tilDatoStreng(denneUgesFredag(LOERDAG))).toBe("2026-09-11");
    expect(tilDatoStreng(denneUgesFredag(SOENDAG))).toBe("2026-09-11");
  });

  it("klokkeslæt på input ignoreres — resultatet er en ren kalenderdag", () => {
    const senMandagAften = new Date(2026, 7, 31, 23, 59, 59);
    const fredag = denneUgesFredag(senMandagAften);
    expect(tilDatoStreng(fredag)).toBe("2026-09-04");
    expect(fredag.getHours()).toBe(0);
  });
});

describe("naesteUgesFredag — fredagen ugen efter", () => {
  it("mandag → fredag i næste uge", () => {
    expect(tilDatoStreng(naesteUgesFredag(MANDAG))).toBe("2026-09-11");
  });

  it("fredag → fredag om syv dage (denneUgesFredag er i dag)", () => {
    expect(tilDatoStreng(naesteUgesFredag(FREDAG))).toBe("2026-09-11");
  });
});

describe("omEnMaaned — samme ugedag om fire uger", () => {
  it("+28 dage, ugedagen bevares", () => {
    const resultat = omEnMaaned(MANDAG);
    expect(tilDatoStreng(resultat)).toBe("2026-09-28");
    expect(resultat.getDay()).toBe(MANDAG.getDay());
  });

  it("ruller over årsskiftet", () => {
    expect(tilDatoStreng(omEnMaaned(new Date(2026, 11, 15)))).toBe("2027-01-12");
  });
});

describe("tilDatoStreng — lokal kalenderdag som YYYY-MM-DD", () => {
  it("padder måned og dag", () => {
    expect(tilDatoStreng(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("klokkeslæt påvirker ikke dagen (ingen UTC-skridning)", () => {
    expect(tilDatoStreng(new Date(2026, 8, 4, 23, 30))).toBe("2026-09-04");
  });
});

describe("målets frist som loft i datovalget (rådets fund B2, 1/10-2026)", () => {
  it("fristdagen er tilladt, dagen efter er ikke; uden frist ingen grænse", () => {
    expect(efterMaalFrist(new Date(2026, 9, 10, 15, 0), "2026-10-10")).toBe(false);
    expect(efterMaalFrist(new Date(2026, 9, 11), "2026-10-10")).toBe(true);
    expect(efterMaalFrist(new Date(2030, 0, 1), null)).toBe(false);
    expect(efterMaalFrist(new Date(2030, 0, 1), "")).toBe(false);
  });
  it("hurtigknapperne: «Om en måned» falder bort, når målets frist er om ti dage", () => {
    const nu = new Date(2026, 9, 1); // torsdag
    expect(efterMaalFrist(denneUgesFredag(nu), "2026-10-10")).toBe(false); // 2/10
    expect(efterMaalFrist(naesteUgesFredag(nu), "2026-10-10")).toBe(false); // 9/10
    expect(efterMaalFrist(omEnMaaned(nu), "2026-10-10")).toBe(true); // 29/10
  });
  it("fraDatoStreng: lokal midnat for en rigtig dato, ellers null", () => {
    const d = fraDatoStreng("2026-10-10");
    expect(d && tilDatoStreng(d)).toBe("2026-10-10");
    expect(d?.getHours()).toBe(0);
    for (const v of [null, undefined, "", "2026-02-31", "2026-10-10T00:00:00Z", "10-10-2026"]) expect(fraDatoStreng(v)).toBeNull();
  });
});
