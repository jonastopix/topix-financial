import { describe, expect, it } from "vitest";
import {
  UDLOEBET_GRUND,
  erAlleVirksomhederUdloebet,
  fordelUdloebne,
  type VirksomhedTilMail,
} from "../../../supabase/functions/_shared/mailModtager.ts";

const t = (iso: string) => new Date(iso);
const NU = t("2026-09-15T20:00:00Z");
const v = (over: Partial<VirksomhedTilMail> = {}): VirksomhedTilMail => ({
  contract_end_date: null,
  subscription_status: null,
  subscription_current_period_end: null,
  ...over,
});
const AKTIV = v({ contract_end_date: "2027-06-15" });
const UDLOEBET = v({ contract_end_date: "2026-09-05" });
const CARMA = v({ contract_end_date: "2026-09-11" });

describe("erAlleVirksomhederUdloebet — udløbet-reglen (chattens beslutning 15/9)", () => {
  it("tom liste er IKKE udløbet — en bruger uden medlemskab er uberørt", () => {
    expect(erAlleVirksomhederUdloebet([], NU)).toBe(false);
  });
  it("én aktiv → falsk; én udløbet → sand", () => {
    expect(erAlleVirksomhederUdloebet([AKTIV], NU)).toBe(false);
    expect(erAlleVirksomhederUdloebet([UDLOEBET], NU)).toBe(true);
  });
  it("udløbet + aktiv → falsk: én ikke-udløbet virksomhed er nok (EXISTS som har_aktivt_medlemskab)", () => {
    expect(erAlleVirksomhederUdloebet([UDLOEBET, AKTIV], NU)).toBe(false);
    expect(erAlleVirksomhederUdloebet([AKTIV, UDLOEBET], NU)).toBe(false);
    expect(erAlleVirksomhederUdloebet([UDLOEBET, UDLOEBET], NU)).toBe(true);
  });
  it("no_date er ikke udløbet — hverken alene eller sammen med en udløbet", () => {
    expect(erAlleVirksomhederUdloebet([v()], NU)).toBe(false);
    expect(erAlleVirksomhederUdloebet([UDLOEBET, v()], NU)).toBe(false);
  });
  it("subscriber er ikke udløbet: udløbet slutdato med aktivt abonnement", () => {
    const abonnent = v({ contract_end_date: "2026-09-05", subscription_status: "active", subscription_current_period_end: "2026-10-05T00:00:00Z" });
    expect(erAlleVirksomhederUdloebet([abonnent], NU)).toBe(false);
  });
  it("CARMA-grænsen (slut 2026-09-11): 11/9 23:59:59Z ikke udløbet, 12/9 00:00:00Z udløbet", () => {
    expect(erAlleVirksomhederUdloebet([CARMA], t("2026-09-11T23:59:59Z"))).toBe(false);
    expect(erAlleVirksomhederUdloebet([CARMA], t("2026-09-12T00:00:00Z"))).toBe(true);
  });
});

describe("fordelUdloebne — hver række præcis ét sted", () => {
  const raekker = [
    { id: "a1", user_id: "a" },
    { id: "a2", user_id: "a" },
    { id: "b1", user_id: "b" },
    { id: "c1", user_id: "c" },
    { id: "d1", user_id: "d" },
    { id: "e1", user_id: "e" },
  ];
  const medlemskaber = new Map<string, VirksomhedTilMail[]>([
    ["a", [UDLOEBET]], // udløbet
    ["b", [UDLOEBET, AKTIV]], // én aktiv → mail
    ["c", [AKTIV]],
    ["d", [v()]], // no_date
    // e: ingen company_members-række (rådgiver m.fl.)
  ]);
  it("udløbne og resten — og bruger uden medlemskab er i resten", () => {
    const r = fordelUdloebne(raekker, medlemskaber, NU);
    expect(r.udloebne).toEqual(["a1", "a2"]);
    expect(r.resten).toEqual(["b1", "c1", "d1", "e1"]);
    expect(UDLOEBET_GRUND).toBe("udloebet");
  });
  it("INVARIANTEN: udloebne ∪ resten = alle, disjunkte — også for tom liste og for kun udløbne", () => {
    for (const rk of [raekker, [], [{ id: "x", user_id: "a" }], [{ id: "y", user_id: "ukendt" }]]) {
      const r = fordelUdloebne(rk, medlemskaber, NU);
      const alle = [...r.udloebne, ...r.resten];
      expect(alle.length).toBe(rk.length);
      expect(new Set(alle).size).toBe(rk.length);
      expect([...alle].sort()).toEqual(rk.map((x) => x.id).sort());
    }
  });
  it("dommen afhænger af nu: CARMA er i resten 11/9 23:59:59Z og udløbet 12/9 00:00:00Z", () => {
    const rk = [{ id: "c", user_id: "carma" }];
    const m = new Map([["carma", [CARMA]]]);
    expect(fordelUdloebne(rk, m, t("2026-09-11T23:59:59Z"))).toEqual({ udloebne: [], resten: ["c"] });
    expect(fordelUdloebne(rk, m, t("2026-09-12T00:00:00Z"))).toEqual({ udloebne: ["c"], resten: [] });
  });
});
