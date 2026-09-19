import { describe, expect, it, vi } from "vitest";
import { cacheRaekkeAf, gemICache, type CvrCacheRaekke } from "../../../supabase/functions/_shared/cvrCache.ts";

/**
 * Den delte cache-rækkebygger (19/9-2026). Den findes, fordi tre functions
 * bruger den samme DataCVR-nøgle, men kun ÉN skrev i cachen — og fordi en
 * naiv fælles skrivning ville have knækket formularen: en «fundet»-række
 * uden `visning` læses af ansoegning-cvr som «findes ikke».
 */

const SVAR_BODY = {
  name: "Nordic Byg ApS",
  startdate: "2019-04-01",
  industrycode: 412000,
  industrydesc: "Opførelse af bygninger",
  address: "Havnegade 3",
  zipcode: "8000",
  city: "Aarhus",
  website: "www.nordicbyg.dk",
  employees: "10-19",
  companytype: "ApS",
  status: "Aktiv",
};
const NU = new Date("2026-09-22T08:00:00.000Z");
const raa = (body: unknown, status = 200) => ({ slags: "svar" as const, status, body });

describe("cacheRaekkeAf — samme række, uanset hvem der slår op", () => {
  it("et fundet CVR giver BÅDE svar og visning — visning må aldrig mangle", () => {
    const { raekke, udfald } = cacheRaekkeAf("12345678", raa(SVAR_BODY), NU);
    expect(udfald.udfald).toBe("fundet");
    expect(raekke).not.toBeNull();
    expect(raekke?.udfald).toBe("fundet");
    expect(raekke?.slaaet_op_at).toBe("2026-09-22T08:00:00.000Z");
    // DETTE er fejlen der ville have knækket formularen: en fundet-række uden visning.
    expect(raekke?.visning).not.toBeNull();
    expect(raekke?.visning?.navn).toBe("Nordic Byg ApS");
    expect(raekke?.visning?.stiftet_aar).toBe(2019);
    expect(raekke?.svar).not.toBeNull();
  });

  it("den RÅ body gemmes aldrig — kun den navngivne delmængde og visningen", () => {
    const { raekke } = cacheRaekkeAf("12345678", raa({ ...SVAR_BODY, owners: [{ navn: "Et Menneske", cpr: "010190-1234" }] }), NU);
    const json = JSON.stringify(raekke);
    expect(json).not.toContain("owners");
    expect(json).not.toContain("cpr");
    expect(json).not.toContain("industrycode");
    expect(json).not.toContain("startdate");
  });

  it("«findes ikke» får en række (så den caches én dag), men hverken svar eller visning", () => {
    // 404 ALENE er ikke «findes ikke» — DataCVR skal sige NOT_FOUND i body'en
    // (tolkDataCvrSvar). Et bart 404 er en fejl og caches derfor ikke.
    const { raekke, udfald } = cacheRaekkeAf("12345678", raa({ error: "NOT_FOUND" }, 404), NU);
    expect(udfald.udfald).toBe("findes_ikke");
    expect(raekke).toMatchObject({ udfald: "findes_ikke", svar: null, visning: null });
  });

  it("fejl, grænse og manglende nøgle caches ALDRIG — et genforsøg skal være et nyt kald", () => {
    for (const r of [
      { slags: "fejl" as const, grund: "timeout" },
      { slags: "noegle_mangler" as const },
      raa({}, 429),
      raa({}, 500),
      raa({}, 404), // 404 uden NOT_FOUND er en fejl, ikke et svar
    ]) {
      const { raekke, udfald } = cacheRaekkeAf("12345678", r, NU);
      expect(raekke, `${JSON.stringify(r)} blev cachet`).toBeNull();
      expect(udfald.udfald).not.toBe("fundet");
    }
  });

  it("udfaldet gives uændret videre, så kalderens egen logik er upåvirket", () => {
    expect(cacheRaekkeAf("12345678", raa({}, 429), NU).udfald).toEqual({ udfald: "graense" });
    expect(cacheRaekkeAf("12345678", { slags: "noegle_mangler" }, NU).udfald).toEqual({ udfald: "noegle_mangler" });
  });
});

describe("gemICache — må aldrig vælte kalderen", () => {
  const raekke: CvrCacheRaekke = { cvr: "12345678", udfald: "fundet", svar: {}, visning: null, slaaet_op_at: NU.toISOString() };

  const skriver = (svar: { error: { message: string } | null } | Error) => ({
    from: vi.fn(() => ({
      upsert: vi.fn(() => (svar instanceof Error ? Promise.reject(svar) : Promise.resolve(svar))),
    })),
  });

  it("skriver til cvr_opslag_cache med onConflict på cvr", async () => {
    const s = skriver({ error: null });
    await gemICache(s, raekke);
    expect(s.from).toHaveBeenCalledWith("cvr_opslag_cache");
  });

  it("en DB-fejl logges, men kaster ikke — berigelsen skal køre videre", async () => {
    const fejl = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(gemICache(skriver({ error: { message: "nede" } }), raekke)).resolves.toBeUndefined();
    expect(fejl).toHaveBeenCalled();
    fejl.mockRestore();
  });

  it("en kastende klient fanges også", async () => {
    const fejl = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(gemICache(skriver(new Error("væltet")), raekke)).resolves.toBeUndefined();
    expect(fejl).toHaveBeenCalled();
    fejl.mockRestore();
  });

  it("ingen række = ingen skrivning", async () => {
    const s = skriver({ error: null });
    await gemICache(s, null);
    expect(s.from).not.toHaveBeenCalled();
  });
});
