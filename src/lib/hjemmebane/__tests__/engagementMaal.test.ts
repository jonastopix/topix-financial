import { describe, expect, it } from "vitest";
import {
  bevaegelseTekst,
  danskeDageSiden,
  engagementMaalDom,
  engagementMaalPrVirksomhed,
  INGEN_MAAL,
  type EngagementMaalRaekke,
  type EngagementSkridtRaekke,
} from "@/lib/hjemmebane/engagementMaal";
import { sorterEngagement } from "@/components/hjemmebane/engagement/EngagementView";
import type { EngagementRaekke } from "@/hooks/trofaeer";

/* /engagement «Aktive mål» og «Bevægelse» (1/10-2026, designpapiret om Dine mål). */

// 1/10-2026 kl. 12:00 dansk (CEST, UTC+2).
const NU = new Date("2026-10-01T10:00:00Z");
const maal = (over: Partial<EngagementMaalRaekke> & { id: string }): EngagementMaalRaekke => ({
  company_id: "c1", status: "active", progress: 0, deadline: null, progress_updated_at: null, ...over,
});
const skridt = (over: Partial<EngagementSkridtRaekke>): EngagementSkridtRaekke => ({
  maal_id: "a", closed_at: null, created_at: null, ...over,
});

describe("Aktive mål — afgoerMilepael(...).aktiv, ikke status alene", () => {
  it("tæller active og status null; ikke parked eller completed; progress 100 uden klik er aktivt", () => {
    const d = engagementMaalDom([
      maal({ id: "a" }),
      maal({ id: "b", status: null }),
      maal({ id: "c", status: "active", progress: 100 }),
      maal({ id: "p", status: "parked" }),
      maal({ id: "n", status: "completed" }),
    ], [], NU);
    expect(d.aktive).toBe(3);
  });

  it("flere end tre står med det rigtige tal (ikke klemt)", () => {
    expect(engagementMaalDom(["a", "b", "c", "d"].map((id) => maal({ id })), [], NU).aktive).toBe(4);
  });

  it("ingen aktive mål → 0 og «—», også når nåede mål har bevægelse", () => {
    const d = engagementMaalDom([maal({ id: "n", status: "completed", progress_updated_at: "2026-09-30T10:00:00Z" })], [skridt({ maal_id: "n", closed_at: "2026-09-30T10:00:00Z" })], NU);
    expect(d).toEqual({ aktive: 0, senesteBevaegelse: null, dageSidenBevaegelse: null });
    expect(bevaegelseTekst(d.dageSidenBevaegelse)).toBe("—");
  });
});

describe("Bevægelse — max(progress_updated_at, skridt lukket, skridt oprettet) på aktive mål", () => {
  it("tager det seneste af de tre kilder", () => {
    const d = engagementMaalDom(
      [maal({ id: "a", progress_updated_at: "2026-09-01T10:00:00Z" })],
      [skridt({ closed_at: "2026-09-20T10:00:00Z", created_at: "2026-09-10T10:00:00Z" }), skridt({ created_at: "2026-09-25T10:00:00Z" })],
      NU,
    );
    expect(d.senesteBevaegelse).toBe("2026-09-25T10:00:00Z");
    expect(d.dageSidenBevaegelse).toBe(6);
  });

  it("skridt under et parkeret/nået mål eller uden mål tæller ikke", () => {
    const d = engagementMaalDom(
      [maal({ id: "a", progress_updated_at: "2026-09-01T10:00:00Z" }), maal({ id: "p", status: "parked" }), maal({ id: "n", status: "completed" })],
      [skridt({ maal_id: "p", closed_at: "2026-09-30T10:00:00Z" }), skridt({ maal_id: "n", created_at: "2026-09-30T10:00:00Z" }), skridt({ maal_id: null, created_at: "2026-09-30T10:00:00Z" })],
      NU,
    );
    expect(d.senesteBevaegelse).toBe("2026-09-01T10:00:00Z");
    expect(d.dageSidenBevaegelse).toBe(30);
  });

  it("aktive mål uden noget tidspunkt → antal, men «—»", () => {
    const d = engagementMaalDom([maal({ id: "a" })], [], NU);
    expect(d.aktive).toBe(1);
    expect(d.dageSidenBevaegelse).toBeNull();
  });

  it("dagsgrænsen er dansk: 23:30 dansk i går er «1 dag», 00:30 dansk i dag er «i dag»", () => {
    // 30/9 23:30 CEST = 30/9 21:30Z; 1/10 00:30 CEST = 30/9 22:30Z (samme UTC-dato, forskellig dansk).
    expect(danskeDageSiden("2026-09-30T21:30:00Z", NU)).toBe(1);
    expect(danskeDageSiden("2026-09-30T22:30:00Z", NU)).toBe(0);
  });

  it("over sommertidens udgang (25/10) regnes hele kalenderdage", () => {
    expect(danskeDageSiden("2026-10-24T10:00:00Z", new Date("2026-10-26T10:00:00Z"))).toBe(2);
  });

  it("et tidspunkt i fremtiden (ur-skred) er 0, et ulæseligt ignoreres", () => {
    expect(danskeDageSiden("2026-10-02T10:00:00Z", NU)).toBe(0);
    expect(engagementMaalDom([maal({ id: "a", progress_updated_at: "ikke en dato" })], [], NU).dageSidenBevaegelse).toBeNull();
  });
});

describe("teksten", () => {
  it("«i dag» · «1 dag» · «N dage» · «—»", () => {
    expect(bevaegelseTekst(0)).toBe("i dag");
    expect(bevaegelseTekst(1)).toBe("1 dag");
    expect(bevaegelseTekst(12)).toBe("12 dage");
    expect(bevaegelseTekst(null)).toBe("—");
  });
});

describe("batch — pr. virksomhed", () => {
  it("skridt kobles til virksomheden gennem målets id; en virksomhed uden mål findes ikke i kortet", () => {
    const pr = engagementMaalPrVirksomhed(
      [maal({ id: "a", company_id: "c1" }), maal({ id: "b", company_id: "c2", status: "parked" })],
      [skridt({ maal_id: "a", created_at: "2026-10-01T06:00:00Z" }), skridt({ maal_id: "x", created_at: "2026-10-01T06:00:00Z" })],
      NU,
    );
    expect(pr.get("c1")).toEqual({ aktive: 1, senesteBevaegelse: "2026-10-01T06:00:00Z", dageSidenBevaegelse: 0 });
    expect(pr.get("c2")).toEqual(INGEN_MAAL);
    expect(pr.get("c3")).toBeUndefined();
  });
});

describe("sortering på /engagement", () => {
  const raekke = (navn: string, m: EngagementRaekke["maal"]): EngagementRaekke =>
    ({ companyId: navn, navn, dom: { score: null, streak: { laengde: 0 } }, trofaeer: [], senesteAktivitet: null, maal: m }) as unknown as EngagementRaekke;
  const r = [
    raekke("A", { aktive: 2, senesteBevaegelse: "x", dageSidenBevaegelse: 40 }),
    raekke("B", { aktive: 0, senesteBevaegelse: null, dageSidenBevaegelse: null }),
    raekke("C", null),
    raekke("D", { aktive: 3, senesteBevaegelse: "x", dageSidenBevaegelse: 2 }),
  ];
  it("Aktive mål: hentefejl (null) nederst ved faldende", () => {
    expect(sorterEngagement(r, "maal", false).map((x) => x.navn)).toEqual(["D", "A", "B", "C"]);
  });
  it("Bevægelse faldende: længst siden først (lige → navn, vendt som de andre kolonner)", () => {
    expect(sorterEngagement(r, "bevaegelse", false).map((x) => x.navn)).toEqual(["A", "D", "C", "B"]);
  });
});
