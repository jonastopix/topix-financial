import { describe, expect, it } from "vitest";
import { handoutConfigs } from "@/lib/handoutConfig";
import {
  RETNING_MODUL,
  RETNING_NOEGLER,
  retningFraHandout,
  retningStatus,
  retningTilResponses,
  vaelgRetningsRaekke,
  type RetningsRaekke,
} from "../maalRetning";

const raekke = (o: Partial<RetningsRaekke> = {}): RetningsRaekke => ({
  id: "h1",
  user_id: "u1",
  module: "overordnet",
  responses: {},
  updated_at: "2026-09-01T10:00:00Z",
  ...o,
});

describe("«Jeres retning» — nøglerne er handoutets", () => {
  it("de tre nøgler står ordret i handoutConfigs.overordnet", () => {
    const noegler = handoutConfigs.overordnet.sections.flatMap((s) => s.questions.map((q) => q.key));
    for (const n of RETNING_NOEGLER) expect(noegler).toContain(n);
    expect(RETNING_MODUL).toBe("overordnet");
  });
});

describe("vaelgRetningsRaekke", () => {
  it("kun modul 'overordnet', den nyeste", () => {
    const valgt = vaelgRetningsRaekke([
      raekke({ id: "gammel", updated_at: "2026-08-01T00:00:00Z" }),
      raekke({ id: "salg", module: "salg", updated_at: "2026-10-01T00:00:00Z" }),
      raekke({ id: "ny", updated_at: "2026-09-15T00:00:00Z" }),
    ]);
    expect(valgt?.id).toBe("ny");
  });
  it("ingen 'overordnet' → null; lige stempler → den første", () => {
    expect(vaelgRetningsRaekke([raekke({ module: "salg" })])).toBeNull();
    expect(vaelgRetningsRaekke([])).toBeNull();
    expect(vaelgRetningsRaekke([raekke({ id: "a" }), raekke({ id: "b" })])?.id).toBe("a");
  });
});

describe("retningFraHandout", () => {
  it("de tre svar af responses; andre nøgler ignoreres; besvaret tæller ikke-tomme efter trim", () => {
    const r = retningFraHandout(
      raekke({ responses: { lykkedes_12mdr: "2 mio. i omsætning", anderledes_hverdag: "   ", maal_forretning: "x", konsekvenser_ingen_aendring: "Vi lukker" } }),
    );
    expect(r.svar).toEqual({ lykkedes_12mdr: "2 mio. i omsætning", anderledes_hverdag: "   ", konsekvenser_ingen_aendring: "Vi lukker" });
    expect(r.besvaret).toBe(2);
    expect(r.handoutId).toBe("h1");
    expect(r.userId).toBe("u1");
    expect(r.opdateret).toBe("2026-09-01T10:00:00Z");
  });
  it("ingen række → tomme svar, intet id", () => {
    const r = retningFraHandout(null);
    expect(r).toEqual({ handoutId: null, userId: null, svar: { lykkedes_12mdr: "", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" }, besvaret: 0, opdateret: null });
  });
  it("et felt er en observation: ikke-tekst og ikke-objekt læses som tomt", () => {
    expect(retningFraHandout(raekke({ responses: { lykkedes_12mdr: 42, anderledes_hverdag: null } })).besvaret).toBe(0);
    expect(retningFraHandout(raekke({ responses: ["lykkedes_12mdr"] })).besvaret).toBe(0);
    expect(retningFraHandout(raekke({ responses: null })).svar.lykkedes_12mdr).toBe("");
  });
});

describe("retningTilResponses", () => {
  it("fletter KUN de tre nøgler; handoutets øvrige svar bevares ordret (også ikke-tekst)", () => {
    const d = retningTilResponses({ maal_forretning: "Vokse", lykkedes_12mdr: "gammelt", tal: 7 }, { lykkedes_12mdr: "nyt", anderledes_hverdag: "Fri fredag" });
    expect(d).toEqual({ ok: true, harIndhold: true, responses: { maal_forretning: "Vokse", lykkedes_12mdr: "nyt", tal: 7, anderledes_hverdag: "Fri fredag" } });
  });
  it("et udeladt svar står uændret; et tomt svar skrives som tomt", () => {
    const d = retningTilResponses({ lykkedes_12mdr: "x", konsekvenser_ingen_aendring: "y" }, { konsekvenser_ingen_aendring: "" });
    expect(d.ok && d.responses).toEqual({ lykkedes_12mdr: "x", konsekvenser_ingen_aendring: "" });
  });
  it("en fremmed nøgle afvises — handoutets andre svar skrives aldrig herfra", () => {
    expect(retningTilResponses({}, { maal_forretning: "x" })).toEqual({ ok: false, grund: "Kun de tre spørgsmål om retningen kan gemmes her" });
  });
  it("et svar, der ikke er tekst, afvises", () => {
    expect(retningTilResponses({}, { lykkedes_12mdr: 3 })).toEqual({ ok: false, grund: "Svaret skal være tekst" });
  });
  it("harIndhold: kun mellemrum er intet indhold; ikke-objekt-responses starter tomt", () => {
    expect(retningTilResponses(null, { lykkedes_12mdr: "  " })).toEqual({ ok: true, harIndhold: false, responses: { lykkedes_12mdr: "  " } });
  });
});

describe("retningStatus", () => {
  it("'completed' og 'in_progress' røres aldrig; 'not_started'/ny → afledt af indholdet", () => {
    expect(retningStatus("completed", true)).toBe("completed");
    expect(retningStatus("completed", false)).toBe("completed");
    expect(retningStatus("in_progress", false)).toBe("in_progress");
    expect(retningStatus("not_started", true)).toBe("in_progress");
    expect(retningStatus("not_started", false)).toBe("not_started");
    expect(retningStatus(null, true)).toBe("in_progress");
    expect(retningStatus(undefined, false)).toBe("not_started");
  });
});
