import { describe, expect, it } from "vitest";
import { erMaanedAfsluttet, maanedsNoegleKbh } from "../../../supabase/functions/_shared/maanedsnoegle.ts";

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
