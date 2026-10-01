import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bevaegelseTekst,
  danskeDageSiden,
  engagementMaalDom,
  engagementMaalPrVirksomhed,
  bevaegelseSorteringsnoegle,
  INGEN_MAAL,
  menneskeligeTidspunkter,
  STATUSSER_I_HENTNINGEN,
  tomMaalLaesning,
  type EngagementMaalRaekke,
  type EngagementSkridtRaekke,
} from "@/lib/hjemmebane/engagementMaal";
import { sorterEngagement } from "@/components/hjemmebane/engagement/EngagementView";
import type { EngagementRaekke } from "@/hooks/trofaeer";

/* /engagement «Aktive mål» og «Sidst rørt» (1/10-2026, designpapiret om Dine mål;
   rettet efter det tekniske råds fund R1, R2, B4, B5, K8 samme dag). */

// 1/10-2026 kl. 12:00 dansk (CEST, UTC+2).
const NU = new Date("2026-10-01T10:00:00Z");
const maal = (over: Partial<EngagementMaalRaekke> & { id: string }): EngagementMaalRaekke => ({
  company_id: "c1", status: "active", progress: 0, deadline: null, progress_updated_at: null, created_at: null, ...over,
});
const skridt = (over: Partial<EngagementSkridtRaekke>): EngagementSkridtRaekke => ({
  maal_id: "a", status: "active", accepted_at: null, closed_at: null, created_at: null, source_type: "agent", ...over,
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

describe("Sidst rørt — menneskets tidspunkter på aktive mål", () => {
  it("tager det seneste af kilderne (progress_updated_at, accepted_at, closed_at)", () => {
    const d = engagementMaalDom(
      [maal({ id: "a", progress_updated_at: "2026-09-01T10:00:00Z" })],
      [
        skridt({ status: "done", accepted_at: "2026-09-12T10:00:00Z", closed_at: "2026-09-20T10:00:00Z", created_at: "2026-09-10T10:00:00Z" }),
        skridt({ status: "active", accepted_at: "2026-09-25T10:00:00Z", created_at: "2026-09-05T10:00:00Z" }),
      ],
      NU,
    );
    expect(d.senesteBevaegelse).toBe("2026-09-25T10:00:00Z");
    expect(d.dageSidenBevaegelse).toBe(6);
  });

  it("skridt under et parkeret/nået mål eller uden mål tæller ikke", () => {
    const d = engagementMaalDom(
      [maal({ id: "a", progress_updated_at: "2026-09-01T10:00:00Z" }), maal({ id: "p", status: "parked" }), maal({ id: "n", status: "completed" })],
      [
        skridt({ maal_id: "p", status: "done", closed_at: "2026-09-30T10:00:00Z" }),
        skridt({ maal_id: "n", accepted_at: "2026-09-30T10:00:00Z" }),
        skridt({ maal_id: null, accepted_at: "2026-09-30T10:00:00Z" }),
      ],
      NU,
    );
    expect(d.senesteBevaegelse).toBe("2026-09-01T10:00:00Z");
    expect(d.dageSidenBevaegelse).toBe(30);
  });

  it("R1: et TAGET forslag tæller på accepted_at, ikke agentens created_at", () => {
    // Agenten foreslog 1/9; medlemmet tog det 28/9.
    const taget = skridt({ status: "active", source_type: "agent", created_at: "2026-09-01T10:00:00Z", accepted_at: "2026-09-28T10:00:00Z" });
    expect(menneskeligeTidspunkter(taget)).toEqual(["2026-09-28T10:00:00Z"]);
    expect(engagementMaalDom([maal({ id: "a" })], [taget], NU).dageSidenBevaegelse).toBe(3);
    // created_at på et forslag tæller aldrig — heller ikke når det er nyere end accepten.
    const gammelAccept = skridt({ status: "active", source_type: "ai_weekly", created_at: "2026-09-30T10:00:00Z", accepted_at: "2026-09-02T10:00:00Z" });
    expect(engagementMaalDom([maal({ id: "a" })], [gammelAccept], NU).dageSidenBevaegelse).toBe(29);
  });

  it("R1: et forslag uden accept (active/done uden accepted_at, ikke 'manual') tæller ikke på created_at", () => {
    for (const source_type of ["agent", "ai_weekly", "advisor", null]) {
      const s = skridt({ status: "active", source_type, created_at: "2026-09-30T10:00:00Z" });
      expect(menneskeligeTidspunkter(s), String(source_type)).toEqual([]);
    }
  });

  it("R1: medlemmets eget skridt ('manual') tæller på accepted_at; uden accepted_at (ældre række) på created_at", () => {
    expect(menneskeligeTidspunkter(skridt({ source_type: "manual", accepted_at: "2026-09-29T10:00:00Z", created_at: "2026-09-29T09:59:59Z" }))).toEqual(["2026-09-29T10:00:00Z"]);
    expect(menneskeligeTidspunkter(skridt({ source_type: "manual", created_at: "2026-09-29T10:00:00Z" }))).toEqual(["2026-09-29T10:00:00Z"]);
    // Også et lukket eget skridt: created_at + closed_at.
    expect(menneskeligeTidspunkter(skridt({ status: "done", source_type: "manual", created_at: "2026-09-01T10:00:00Z", closed_at: "2026-09-20T10:00:00Z" }))).toEqual(["2026-09-20T10:00:00Z", "2026-09-01T10:00:00Z"]);
    // 'manual' som proposed/dismissed findes ikke i praksis — tæller alligevel ikke.
    expect(menneskeligeTidspunkter(skridt({ status: "proposed", source_type: "manual", created_at: "2026-09-29T10:00:00Z" }))).toEqual([]);
    expect(menneskeligeTidspunkter(skridt({ status: "dismissed", source_type: "manual", created_at: "2026-09-29T10:00:00Z" }))).toEqual([]);
  });

  it("et nyt forslag (proposed), dismissed og en udløbet rækkes closed_at er IKKE bevægelse", () => {
    const d = engagementMaalDom(
      [maal({ id: "a", progress_updated_at: "2026-09-01T10:00:00Z" })],
      [
        skridt({ status: "proposed", created_at: "2026-10-01T06:00:00Z" }),
        skridt({ status: "dismissed", created_at: "2026-09-30T06:00:00Z", closed_at: "2026-09-30T08:00:00Z" }),
        skridt({ status: "expired", created_at: "2026-09-29T06:00:00Z", closed_at: "2026-09-30T08:00:00Z" }),
      ],
      NU,
    );
    expect(d.senesteBevaegelse).toBe("2026-09-01T10:00:00Z");
    expect(d.dageSidenBevaegelse).toBe(30);
  });

  it("en accepteret opgave, der siden udløb (expired MED accepted_at), tæller på accepten — ikke på cronens closed_at", () => {
    expect(menneskeligeTidspunkter(skridt({ status: "expired", accepted_at: "2026-09-10T10:00:00Z", closed_at: "2026-09-30T08:00:00Z" }))).toEqual(["2026-09-10T10:00:00Z"]);
  });

  it("closed_at tæller for done/not_done/dropped; ikke for active", () => {
    expect(engagementMaalDom([maal({ id: "a" })], [skridt({ status: "active", accepted_at: "2026-09-28T10:00:00Z", closed_at: "2026-09-30T10:00:00Z" })], NU).dageSidenBevaegelse).toBe(3);
    for (const status of ["done", "not_done", "dropped"]) {
      expect(engagementMaalDom([maal({ id: "a" })], [skridt({ status, accepted_at: "2026-09-01T10:00:00Z", closed_at: "2026-09-30T10:00:00Z" })], NU).dageSidenBevaegelse, status).toBe(1);
    }
  });

  it("R2: et nyt mål (milestones.created_at) er bevægelse — kun på et aktivt mål", () => {
    expect(engagementMaalDom([maal({ id: "a", created_at: "2026-10-01T07:00:00Z" })], [], NU).dageSidenBevaegelse).toBe(0);
    const d = engagementMaalDom([maal({ id: "a", created_at: "2026-09-01T07:00:00Z" }), maal({ id: "p", status: "parked", created_at: "2026-10-01T07:00:00Z" })], [], NU);
    expect(d.dageSidenBevaegelse).toBe(30);
  });

  it("hentningens statusser er præcis dem, dommen kan bruge", () => {
    expect([...STATUSSER_I_HENTNINGEN].sort()).toEqual(["active", "done", "dropped", "expired", "not_done"]);
    for (const status of ["proposed", "dismissed", "noget_nyt"]) {
      expect(menneskeligeTidspunkter(skridt({ status, source_type: "manual", accepted_at: "2026-09-29T10:00:00Z", closed_at: "2026-09-29T10:00:00Z", created_at: "2026-09-29T10:00:00Z" })), status).toEqual([]);
    }
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

describe("teksten (K8)", () => {
  it("«i dag» · «for 1 dag siden» · «for N dage siden» · «—»", () => {
    expect(bevaegelseTekst(0)).toBe("i dag");
    expect(bevaegelseTekst(1)).toBe("for 1 dag siden");
    expect(bevaegelseTekst(12)).toBe("for 12 dage siden");
    expect(bevaegelseTekst(null)).toBe("—");
  });
});

describe("batch — pr. virksomhed", () => {
  it("skridt kobles til virksomheden gennem målets id; en virksomhed uden mål findes ikke i kortet", () => {
    const pr = engagementMaalPrVirksomhed(
      [maal({ id: "a", company_id: "c1" }), maal({ id: "b", company_id: "c2", status: "parked" })],
      [skridt({ maal_id: "a", accepted_at: "2026-10-01T06:00:00Z" }), skridt({ maal_id: "x", accepted_at: "2026-10-01T06:00:00Z" })],
      NU,
    );
    expect(pr.get("c1")).toEqual({ aktive: 1, senesteBevaegelse: "2026-10-01T06:00:00Z", dageSidenBevaegelse: 0 });
    expect(pr.get("c2")).toEqual(INGEN_MAAL);
    expect(pr.get("c3")).toBeUndefined();
  });
});

describe("B4: en tom læsning er ikke «0»", () => {
  it("kundevirksomheder og 0 målrækker → tom læsning; ingen virksomheder eller nogle rækker → ikke", () => {
    expect(tomMaalLaesning(12, 0)).toBe(true);
    expect(tomMaalLaesning(0, 0)).toBe(false);
    expect(tomMaalLaesning(12, 1)).toBe(false);
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
    raekke("E", { aktive: 1, senesteBevaegelse: null, dageSidenBevaegelse: null }),
  ];
  it("Aktive mål: hentefejl (null) nederst ved faldende", () => {
    expect(sorterEngagement(r, "maal", false).map((x) => x.navn)).toEqual(["D", "A", "E", "B", "C"]);
  });
  it("B5 Sidst rørt faldende: aktive mål uden bevægelse øverst (mest stagnerede), så længst siden; uden aktive mål nederst", () => {
    expect(sorterEngagement(r, "bevaegelse", false).map((x) => x.navn)).toEqual(["E", "A", "D", "B", "C"]);
  });
  it("B5 Sidst rørt stigende: senest rørt først — uden aktive mål STADIG nederst", () => {
    expect(sorterEngagement(r, "bevaegelse", true).map((x) => x.navn)).toEqual(["D", "A", "E", "B", "C"]);
  });
  it("sorteringsnøglen: null = nederst, +∞ = aktive uden bevægelse", () => {
    expect(bevaegelseSorteringsnoegle(null)).toBeNull();
    expect(bevaegelseSorteringsnoegle(INGEN_MAAL)).toBeNull();
    expect(bevaegelseSorteringsnoegle({ aktive: 1, senesteBevaegelse: null, dageSidenBevaegelse: null })).toBe(Number.POSITIVE_INFINITY);
    expect(bevaegelseSorteringsnoegle({ aktive: 1, senesteBevaegelse: "x", dageSidenBevaegelse: 0 })).toBe(0);
  });
});

describe("kildeværn — hentningen (B3, B4)", () => {
  const kilde = readFileSync(resolve(process.cwd(), "src/hooks/trofaeer.ts"), "utf8");
  const krop = kilde.slice(kilde.indexOf("async function hentMaalGrundlag"), kilde.indexOf("interface VirksomhedRaekke"));
  it("company_actions hentes kun med dommens statusser og med accepted_at + source_type", () => {
    expect(krop).toMatch(/\.select\("maal_id, status, accepted_at, closed_at, created_at, source_type"\)/);
    expect(krop).toMatch(/\.in\("status", \[\.\.\.STATUSSER_I_HENTNINGEN\]\)/);
  });
  it("milestones hentes kun for universets virksomheder i bidder — aldrig med et statusfilter (not.in taber status null)", () => {
    expect(krop).toMatch(/\.in\("company_id", bid\)/);
    expect(krop).toMatch(/ids\.slice\(i, i \+ MAAL_ID_BID\)/);
    expect(krop).toMatch(/progress_updated_at, created_at"\)/);
    expect(krop).not.toMatch(/\.not\("status"/);
  });
  it("en tom læsning bliver en hentefejl", () => {
    expect(krop).toMatch(/tomMaalLaesning\(ids\.length, maal\.value\.length\)\) return \{ grundlag: null, kilder: \[TOM_MAAL_LAESNING\] \}/);
  });
});
