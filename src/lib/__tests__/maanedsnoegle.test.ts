import { describe, expect, it } from "vitest";
import {
  AFSLUTTEDE_MAANEDER_ANTAL,
  afsluttedeMaanederFoer,
  afsluttedeMaanederTekst,
  afsluttedeMaanederTekstFoer,
  erMaanedAfsluttet,
  maanedsliste,
  maanedsNoegleKbh,
  maanedsnavn,
  senesteAfsluttedeMaaneder,
} from "../../../supabase/functions/_shared/maanedsnoegle.ts";

/** Grænserne fra BEGGE sider — sidste sekund før og første sekund efter, sommer og vinter. */
describe("maanedsNoegleKbh — måneden set fra Danmark, ikke UTC", () => {
  it("sommertid (CEST, UTC+2): 30/9 kl. 21:59:59 UTC er stadig september i Danmark; 22:00:00 UTC er 1. oktober kl. 00:00", () => {
    expect(maanedsNoegleKbh(new Date("2026-09-30T21:59:59Z"))).toBe("2026-09");
    expect(maanedsNoegleKbh(new Date("2026-09-30T22:00:00Z"))).toBe("2026-10");
  });
  it("de to timer hvor UTC og dansk tid er uenige: 30/9 22:00–23:59 UTC er oktober i Danmark, september i UTC", () => {
    const t = new Date("2026-09-30T23:30:00Z");
    expect(t.toISOString().slice(0, 7)).toBe("2026-09"); // UTC — det resolveren sagde før
    expect(maanedsNoegleKbh(t)).toBe("2026-10");        // Danmark — det fladen siger
  });
  it("vintertid (CET, UTC+1): 31/12 kl. 22:59:59 UTC er december; 23:00:00 UTC er 1. januar", () => {
    expect(maanedsNoegleKbh(new Date("2026-12-31T22:59:59Z"))).toBe("2026-12");
    expect(maanedsNoegleKbh(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01");
  });
  it("sidste dag i måneden midt på dagen: stadig samme måned", () => {
    expect(maanedsNoegleKbh(new Date("2026-10-31T12:00:00Z"))).toBe("2026-10");
  });
});

describe("erMaanedAfsluttet — regel 6 i dansk tid", () => {
  it("september er afsluttet fra 1/10 kl. 00:00 dansk tid, ikke før", () => {
    expect(erMaanedAfsluttet("2026-09", new Date("2026-09-30T21:59:59Z"))).toBe(false);
    expect(erMaanedAfsluttet("2026-09", new Date("2026-09-30T22:00:00Z"))).toBe(true);
    expect(erMaanedAfsluttet("2026-09", new Date("2026-10-01T05:20:00Z"))).toBe(true); // cron'en kl. 07:20 dansk
  });
  it("indeværende og fremtidige måneder er ikke afsluttede", () => {
    const nu = new Date("2026-10-15T10:00:00Z");
    expect(erMaanedAfsluttet("2026-10", nu)).toBe(false);
    expect(erMaanedAfsluttet("2026-11", nu)).toBe(false);
    expect(erMaanedAfsluttet("2026-09", nu)).toBe(true);
  });
  it("første dag i måneden, i de to timer: dansk tid siger afsluttet, UTC ville sige nej", () => {
    const t = new Date("2026-09-30T22:30:00Z"); // 1/10 kl. 00:30 dansk
    expect(erMaanedAfsluttet("2026-09", t)).toBe(true);
    expect("2026-09" < t.toISOString().slice(0, 7)).toBe(false); // UTC-reglen (før): ikke afsluttet
  });
  it("ugyldig eller manglende nøgle: aldrig afsluttet", () => {
    expect(erMaanedAfsluttet(null, new Date())).toBe(false);
    expect(erMaanedAfsluttet("Juli 2026", new Date())).toBe(false);
  });
});

// ── De seneste afsluttede måneder ved navn (instruks F, 16/9) ──
//
// Samme danske nøgle som regel 6: hvad der er «afsluttet» skifter kl. 00:00
// dansk tid den 1. — ikke ved UTC-midnat. Chattens tre datoer, årsskiftet,
// og grænsen fra begge sider ved sommer- og vintertid.
describe("senesteAfsluttedeMaaneder / afsluttedeMaanederTekst — de tre seneste AFSLUTTEDE måneder set fra Danmark", () => {
  it("22/9-2026 → juni, juli og august", () => {
    const nu = new Date("2026-09-22T10:00:00Z");
    expect(senesteAfsluttedeMaaneder(nu)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(afsluttedeMaanederTekst(nu)).toBe("juni, juli og august");
  });
  it("1/10-2026 → juli, august og september", () => {
    expect(afsluttedeMaanederTekst(new Date("2026-10-01T07:15:00Z"))).toBe("juli, august og september");
  });
  it("5/1-2027 → oktober, november og december (årsskiftet, uden årstal)", () => {
    const nu = new Date("2027-01-05T07:15:00Z");
    expect(senesteAfsluttedeMaaneder(nu)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(afsluttedeMaanederTekst(nu)).toBe("oktober, november og december");
  });
  it("sommertid ved månedsskiftet: 30/9 kl. 21:59:59 UTC (23:59:59 dansk) → juni–august; 22:00:00 UTC (1/10 kl. 00:00 dansk) → juli–september", () => {
    expect(afsluttedeMaanederTekst(new Date("2026-09-30T21:59:59Z"))).toBe("juni, juli og august");
    expect(afsluttedeMaanederTekst(new Date("2026-09-30T22:00:00Z"))).toBe("juli, august og september");
    // Kl. 00:30 dansk den 1/10 er UTC stadig 30/9 — dansk tid vinder.
    expect(afsluttedeMaanederTekst(new Date("2026-09-30T22:30:00Z"))).toBe("juli, august og september");
  });
  it("vintertid ved årsskiftet: 31/12 kl. 22:59:59 UTC → september–november; 23:00:00 UTC (1/1 kl. 00:00 dansk) → oktober–december", () => {
    expect(afsluttedeMaanederTekst(new Date("2026-12-31T22:59:59Z"))).toBe("september, oktober og november");
    expect(afsluttedeMaanederTekst(new Date("2026-12-31T23:00:00Z"))).toBe("oktober, november og december");
    expect(afsluttedeMaanederTekst(new Date("2027-01-01T00:30:00Z"))).toBe("oktober, november og december");
  });
  it("hjælperen og regel 6 er enige: hver måned i listen er afsluttet, den næste er det ikke", () => {
    for (const nu of [new Date("2026-09-22T10:00:00Z"), new Date("2026-09-30T22:00:00Z"), new Date("2027-01-05T07:15:00Z")]) {
      const liste = senesteAfsluttedeMaaneder(nu);
      expect(liste).toHaveLength(AFSLUTTEDE_MAANEDER_ANTAL);
      for (const k of liste) expect(erMaanedAfsluttet(k, nu)).toBe(true);
      expect(erMaanedAfsluttet(maanedsNoegleKbh(nu), nu)).toBe(false);
    }
  });
});

describe("afsluttedeMaanederFoer / maanedsnavn / maanedsliste — de rene dele", () => {
  it("fra en nøgle: tre før, ældste først; over årsskiftet; antal kan ændres", () => {
    expect(afsluttedeMaanederFoer("2026-09")).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(afsluttedeMaanederFoer("2027-01")).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(afsluttedeMaanederFoer("2027-02")).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(afsluttedeMaanederFoer("2026-09", 1)).toEqual(["2026-08"]);
    expect(afsluttedeMaanederFoer("2026-09", 0)).toEqual([]);
    expect(afsluttedeMaanederTekstFoer("2026-08")).toBe("maj, juni og juli");
  });
  it("ugyldig nøgle: tom liste, tom tekst, null navn — aldrig et gæt", () => {
    expect(afsluttedeMaanederFoer("september")).toEqual([]);
    expect(afsluttedeMaanederFoer("2026-13")).toEqual([]);
    expect(afsluttedeMaanederTekstFoer("nej")).toBe("");
    expect(maanedsnavn("2026-00")).toBeNull();
    expect(maanedsnavn("2026-13")).toBeNull();
    expect(maanedsnavn("juni")).toBeNull();
  });
  it("navne og opremsning: «juni», «juni og juli», «juni, juli og august»", () => {
    expect(maanedsnavn("2026-06")).toBe("juni");
    expect(maanedsnavn("2026-12")).toBe("december");
    expect(maanedsliste([])).toBe("");
    expect(maanedsliste(["2026-06"])).toBe("juni");
    expect(maanedsliste(["2026-06", "2026-07"])).toBe("juni og juli");
    expect(maanedsliste(["2026-06", "2026-07", "2026-08"])).toBe("juni, juli og august");
    expect(maanedsliste(["2026-10", "2026-11", "2026-12", "2027-01"])).toBe("oktober, november, december og januar");
  });
});
