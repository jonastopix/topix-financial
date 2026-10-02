import { describe, expect, it } from "vitest";
import { sessionerTilGode, TIL_GODE_ORD } from "../tilGode";

const nu = new Date("2026-10-02T19:00:00Z");
const fuld = { contract_end_date: "2027-04-01", subscription_status: null, subscription_current_period_end: null };

describe("Til gode — samme dom som backenden", () => {
  it("begge til gode (Topix 2/10: intro og jonas null, kontrakt 2030)", () => {
    expect(sessionerTilGode({ ...fuld, contract_end_date: "2030-04-20", intro_session_used_at: null, jonas_session_used_at: null }, nu)).toEqual(["morten", "jonas"]);
  });
  it("kun Morten (gammelt medlem, Jonas sat i hånden 13/9 uden tilbud)", () => {
    expect(sessionerTilGode({ ...fuld, intro_session_used_at: null, jonas_session_used_at: "2026-09-13T20:51:31Z", jonas_session_tilbudt_at: null }, nu)).toEqual(["morten"]);
  });
  it("Jonas tilbudt efter en ældre «brugt» tæller", () => {
    expect(sessionerTilGode({ ...fuld, intro_session_used_at: "2026-05-01T00:00:00Z", jonas_session_used_at: "2026-09-13T20:53:42Z", jonas_session_tilbudt_at: "2026-10-01T11:44:02Z" }, nu)).toEqual(["jonas"]);
  });
  it("ikke fuldt medlem = intet (no_date, udløbet, abonnent) — som backendens 403", () => {
    const fri = { intro_session_used_at: null, jonas_session_used_at: null };
    expect(sessionerTilGode({ ...fuld, ...fri, contract_end_date: null }, nu)).toEqual([]);
    expect(sessionerTilGode({ ...fuld, ...fri, contract_end_date: "2026-09-30" }, nu)).toEqual([]);
    expect(sessionerTilGode({ ...fri, contract_end_date: "2026-01-01", subscription_status: "active", subscription_current_period_end: "2027-01-01T00:00:00Z" }, nu)).toEqual([]);
  });
  it("slutdagen er sidste dag med adgang", () => {
    expect(sessionerTilGode({ ...fuld, contract_end_date: "2026-10-02", intro_session_used_at: null, jonas_session_used_at: "x" }, nu)).toEqual(["morten"]);
  });
  it("ingen række = intet", () => {
    expect(sessionerTilGode(null, nu)).toEqual([]);
  });
  it("ordene", () => {
    expect(TIL_GODE_ORD.overskrift(1)).toBe("1 gratis 1:1-session");
    expect(TIL_GODE_ORD.overskrift(2)).toBe("2 gratis 1:1-sessioner");
    expect(TIL_GODE_ORD.raekke("jonas")).toBe("1:1 med Jonas");
  });
});
