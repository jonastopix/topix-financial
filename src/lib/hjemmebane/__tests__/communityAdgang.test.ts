import { describe, expect, it } from "vitest";
import {
  erCommunityGaest,
  GAEST_LAESER_TEKST,
  kanLaeseCommunity,
  kanSkriveICommunity,
  visComposer,
  visGaestGraense,
  type VirksomhedTilCommunity,
} from "@/lib/hjemmebane/communityAdgang";

const NU = new Date("2026-10-02T10:00:00Z");
const v = (over: Partial<VirksomhedTilCommunity> = {}): VirksomhedTilCommunity => ({
  vis_i_netvaerk: true, is_legat: false, contract_end_date: "2027-01-01", is_demo: false, data_slettet_at: null, ...over,
});

describe("communityAdgang — gæsten læser, skriver ikke (Jonas 14/9; migration 20261002242000)", () => {
  it("sandhedstabellen — samme rækker som migrationens filhoved", () => {
    const fuld = v();
    const udloebet = v({ contract_end_date: "2026-09-01" });
    const noDate = v({ contract_end_date: null });
    const gaest = v({ vis_i_netvaerk: false, contract_end_date: null });
    const skjultFuld = v({ vis_i_netvaerk: false });
    const udloebetMedFlag = v({ vis_i_netvaerk: false, contract_end_date: "2026-09-01" });
    const legatGaest = v({ vis_i_netvaerk: false, contract_end_date: null, is_legat: true });

    // R = kanLaeseCommunity, S = kanSkriveICommunity
    const tabel: [string, VirksomhedTilCommunity, boolean, boolean][] = [
      ["fuldt medlem", fuld, true, true],
      ["udløbet", udloebet, false, false],
      ["no_date uden flag (mulighed (b), afvist)", noDate, false, false],
      ["GÆSTEN", gaest, true, false],
      ["fuldt medlem skjult fra Netværket", skjultFuld, true, true],
      ["udløbet + gæsteflag: ikke en gæst", udloebetMedFlag, false, false],
      ["legat med flag og uden slutdato", legatGaest, false, false],
    ];
    for (const [navn, raekke, r, s] of tabel) {
      expect(kanLaeseCommunity([raekke], NU), `${navn} R`).toBe(r);
      expect(kanSkriveICommunity([raekke], NU), `${navn} S`).toBe(s);
    }
    expect(kanLaeseCommunity([], NU)).toBe(false);
    expect(kanSkriveICommunity([], NU)).toBe(false);
  });
  it("erCommunityGaest kræver alle tre: flaget, ikke legat, ingen slutdato", () => {
    expect(erCommunityGaest(v({ vis_i_netvaerk: false, contract_end_date: null }))).toBe(true);
    expect(erCommunityGaest(v({ vis_i_netvaerk: null, contract_end_date: null }))).toBe(false);
    expect(erCommunityGaest(v({ vis_i_netvaerk: true, contract_end_date: null }))).toBe(false);
    expect(erCommunityGaest(v({ vis_i_netvaerk: false, contract_end_date: "2026-09-01" }))).toBe(false);
    expect(erCommunityGaest(v({ vis_i_netvaerk: false, contract_end_date: null, is_legat: true }))).toBe(false);
    // Rådets fund 2/10: demo og slettet er ingen gæst; is_demo null = ikke demo (SQL: IS DISTINCT FROM true).
    expect(erCommunityGaest(v({ vis_i_netvaerk: false, contract_end_date: null, is_demo: true }))).toBe(false);
    expect(erCommunityGaest(v({ vis_i_netvaerk: false, contract_end_date: null, is_demo: null }))).toBe(true);
    expect(erCommunityGaest(v({ vis_i_netvaerk: false, contract_end_date: null, data_slettet_at: "2026-09-21T10:00:00Z" }))).toBe(false);
  });
  it("slutdagen tæller med (7/9) i læsning som i skrivning — spejlet er eventSvar.harAdgangEfterRls", () => {
    const paaSlutdagen = v({ contract_end_date: "2026-10-02" });
    expect(kanLaeseCommunity([paaSlutdagen], NU)).toBe(true);
    expect(kanSkriveICommunity([paaSlutdagen], NU)).toBe(true);
    const dagenEfter = new Date("2026-10-03T00:00:00Z");
    expect(kanLaeseCommunity([paaSlutdagen], dagenEfter)).toBe(false);
  });
  it("flere virksomheder: én gæst eller ét fuldt medlemskab rækker til læsning; kun fuldt til skrivning", () => {
    const gaest = v({ vis_i_netvaerk: false, contract_end_date: null });
    const udloebet = v({ contract_end_date: "2026-01-01" });
    expect(kanLaeseCommunity([udloebet, gaest], NU)).toBe(true);
    expect(kanSkriveICommunity([udloebet, gaest], NU)).toBe(false);
    expect(kanSkriveICommunity([udloebet, gaest, v()], NU)).toBe(true);
  });
  it("fladens dom: null = hverken composer eller grænse; true = grænsen; false = composeren", () => {
    expect(visComposer(null)).toBe(false);
    expect(visGaestGraense(null)).toBe(false);
    expect(visComposer(true)).toBe(false);
    expect(visGaestGraense(true)).toBe(true);
    expect(visComposer(false)).toBe(true);
    expect(visGaestGraense(false)).toBe(false);
    expect(GAEST_LAESER_TEKST).toMatch(/^Som gæst kan du læse med/);
    expect(GAEST_LAESER_TEKST).not.toMatch(/fejl|adgang/i);
  });
});
