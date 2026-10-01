import { describe, expect, it } from "vitest";
import type { ScoreMaaned } from "@/lib/boardroomScore/typer";
import { antalOpnaaet, erHjaelpTilEtAndetMedlem, kaedeNaaet, TROFAEER, trofaeDom, type TrofaeGrundlag, type TrofaeId } from "../trofaeer";

const maaned = (key: string, godkendt: string | null, basis: "measured" | "estimated" = "measured"): ScoreMaaned => ({
  key,
  basis,
  foersteGodkendtAt: godkendt,
  metrics: {},
});

const tom = (): TrofaeGrundlag => ({
  maaneder: [],
  kontraktStart: "2026-01-01",
  maal: [],
  budgetOprettet: [],
  refleksioner: [],
  opslag: [],
  svar: [],
  egneBrugere: new Set(["mig", "kollega"]),
  raadgivere: new Set(["raadgiver", "tjenestekonto"]),
});

const af = (g: TrofaeGrundlag, id: TrofaeId) => trofaeDom(g).find((t) => t.id === id)!.opnaaetAt;

// Til tiden: første godkendelse senest streak-motorens frist (den 20. i måneden efter). 10. er altid inden.
const tilTiden = (key: string) => {
  const [a, m] = key.split("-").map(Number);
  const naeste = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return `${naeste}-10T08:00:00.000Z`;
};
const forSent = (key: string) => {
  const [a, m] = key.split("-").map(Number);
  const om2 = m >= 11 ? `${a + 1}-${String(m - 10).padStart(2, "0")}` : `${a}-${String(m + 2).padStart(2, "0")}`;
  return `${om2}-15T08:00:00.000Z`;
};

describe("trofæerne — hvert trofæ opnås / opnås ikke", () => {
  it("intet grundlag: intet trofæ", () => {
    const dom = trofaeDom(tom());
    expect(dom.map((t) => t.id)).toEqual(TROFAEER.map((t) => t.id));
    expect(antalOpnaaet(dom)).toBe(0);
  });

  it("første måned: kun en MÅLT måned tæller, og datoen er den tidligste godkendelse", () => {
    expect(af({ ...tom(), maaneder: [maaned("2026-02", "2026-03-05T10:00:00.000Z", "estimated")] }, "foerste_maaned")).toBeNull();
    expect(
      af({ ...tom(), maaneder: [maaned("2026-03", "2026-04-02T10:00:00.000Z"), maaned("2026-02", "2026-03-05T10:00:00.000Z")] }, "foerste_maaned"),
    ).toBe("2026-03-05T10:00:00.000Z");
  });

  it("tre i træk: tre sammenhængende rettidige måneder; datoen er den tredjes godkendelse", () => {
    const keys = ["2026-01", "2026-02", "2026-03"];
    const g = { ...tom(), maaneder: keys.map((k) => maaned(k, tilTiden(k))) };
    expect(af(g, "tre_til_tiden")).toBe(tilTiden("2026-03"));
    expect(af(g, "seks_til_tiden")).toBeNull();
  });

  it("tre i træk: en for sen måned bryder kæden", () => {
    const g = { ...tom(), maaneder: [maaned("2026-01", tilTiden("2026-01")), maaned("2026-02", forSent("2026-02")), maaned("2026-03", tilTiden("2026-03"))] };
    expect(af(g, "tre_til_tiden")).toBeNull();
  });

  it("tre i træk: et hul (manglende måned) bryder kæden", () => {
    const g = { ...tom(), maaneder: ["2026-01", "2026-02", "2026-04"].map((k) => maaned(k, tilTiden(k))) };
    expect(kaedeNaaet(g.maaneder, g.kontraktStart, 3)).toBeNull();
  });

  it("seks i træk: seks sammenhængende rettidige måneder", () => {
    const keys = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
    const g = { ...tom(), maaneder: keys.map((k) => maaned(k, tilTiden(k))) };
    expect(af(g, "seks_til_tiden")).toBe(tilTiden("2026-06"));
  });

  it("første mål: kun status 'completed' med tidspunkt", () => {
    expect(af({ ...tom(), maal: [{ status: "active", completed_at: null }, { status: "completed", completed_at: null }] }, "foerste_maal")).toBeNull();
    expect(af({ ...tom(), maal: [{ status: "completed", completed_at: "2026-05-01T00:00:00.000Z" }] }, "foerste_maal")).toBe("2026-05-01T00:00:00.000Z");
  });

  it("budget, refleksion, opslag: tidligste oprettelse", () => {
    const g = {
      ...tom(),
      budgetOprettet: ["2026-04-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"],
      refleksioner: ["2026-06-01T00:00:00.000Z"],
      opslag: [{ created_at: "2026-07-01T00:00:00.000Z" }],
    };
    expect(af(g, "foerste_budget")).toBe("2026-02-01T00:00:00.000Z");
    expect(af(g, "foerste_refleksion")).toBe("2026-06-01T00:00:00.000Z");
    expect(af(g, "foerste_opslag")).toBe("2026-07-01T00:00:00.000Z");
    expect(af(tom(), "foerste_budget")).toBeNull();
    expect(af(tom(), "foerste_refleksion")).toBeNull();
    expect(af(tom(), "foerste_opslag")).toBeNull();
  });
});

describe("«Hjalp et andet medlem» — kun et ANDET MEDLEMS tråd", () => {
  it("et svar i et andet medlems tråd giver trofæet", () => {
    expect(af({ ...tom(), svar: [{ created_at: "2026-08-01T00:00:00.000Z", traadForfatterId: "andet-medlem" }] }, "hjalp_et_medlem")).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });
  it("et svar på en RÅDGIVERS opslag giver det IKKE", () => {
    expect(af({ ...tom(), svar: [{ created_at: "2026-08-01T00:00:00.000Z", traadForfatterId: "raadgiver" }] }, "hjalp_et_medlem")).toBeNull();
  });
  it("heller ikke en tjenestekontos tråd, egen tråd, en kollegas tråd eller en ukendt forfatter", () => {
    for (const forfatter of ["tjenestekonto", "mig", "kollega", null]) {
      expect(erHjaelpTilEtAndetMedlem(forfatter, tom().egneBrugere, tom().raadgivere)).toBe(false);
    }
  });
  it("blandet: kun medlemssvaret tæller", () => {
    const g = {
      ...tom(),
      svar: [
        { created_at: "2026-07-01T00:00:00.000Z", traadForfatterId: "raadgiver" },
        { created_at: "2026-09-01T00:00:00.000Z", traadForfatterId: "andet-medlem" },
      ],
    };
    expect(af(g, "hjalp_et_medlem")).toBe("2026-09-01T00:00:00.000Z");
  });
});
