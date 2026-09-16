import { describe, expect, it } from "vitest";
import {
  INGEN_ONLINE_TEKST,
  LEGAT_MAERKE,
  ONLINE_KANAL,
  ONLINE_LOFT,
  ONLINE_OVERSKRIFT,
  onlineIds,
  onlineMedlemmer,
  onlineOverskrift,
  onlineTitel,
  onlineUdsnit,
  type OnlineDomInput,
} from "@/lib/hjemmebane/online";

/* «Online nu» (Jonas 16/9): presence-state → personer, og dommen over hvem
   der vises. Nøglen er user.id; flere faner = én person. */

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const RAADGIVER = "99999999-9999-4999-8999-999999999999";

const dom = (over: Partial<OnlineDomInput> = {}): OnlineDomInput => ({
  ids: [U1],
  profiler: [{ user_id: U1, full_name: "Anna Andersen", avatar_url: "https://x/a.png" }],
  medlemskaber: [{ user_id: U1, company_id: "c1" }],
  virksomheder: [{ id: "c1", name: "Anna ApS", is_legat: false, er_kunde: true }],
  raadgiverIds: [RAADGIVER],
  ...over,
});

describe("onlineIds — presence-state til personer", () => {
  it("tom state → ingen", () => {
    expect(onlineIds({})).toEqual([]);
    expect(onlineIds(null)).toEqual([]);
    expect(onlineIds(undefined)).toEqual([]);
  });
  it("én nøgle med to presences (to faner) → ét id", () => {
    expect(onlineIds({ [U1]: [{ presence_ref: "a" }, { presence_ref: "b" }] })).toEqual([U1]);
  });
  it("en nøgle med tom liste er ikke online", () => {
    expect(onlineIds({ [U1]: [] })).toEqual([]);
  });
  it("nøgler der ikke er UUID'er (serverens egen nøgle når key glemmes) vises aldrig som et medlem", () => {
    expect(onlineIds({ "phx-abc": [{ presence_ref: "a" }], [U2]: [{ presence_ref: "b" }] })).toEqual([U2]);
  });
  it("sorteret og unik", () => {
    expect(onlineIds({ [U3]: [{ presence_ref: "a" }], [U1]: [{ presence_ref: "b" }] })).toEqual([U1, U3]);
  });
});

describe("onlineMedlemmer — hvem vises", () => {
  it("et kunde-medlem med profil: navn, billede, virksomhed, ikke legat", () => {
    expect(onlineMedlemmer(dom())).toEqual([{ user_id: U1, navn: "Anna Andersen", avatar_url: "https://x/a.png", virksomhed: "Anna ApS", legat: false }]);
  });
  it("rådgivere vises ikke — også selv om de er medlemmer af en virksomhed", () => {
    const r = onlineMedlemmer(dom({ ids: [U1, RAADGIVER], medlemskaber: [{ user_id: U1, company_id: "c1" }, { user_id: RAADGIVER, company_id: "c1" }] }));
    expect(r.map((m) => m.user_id)).toEqual([U1]);
  });
  it("ikke-kunder (er_kunde false — vores egen virksomhed) vises ikke; er_kunde null er kunde (fail-open)", () => {
    expect(onlineMedlemmer(dom({ virksomheder: [{ id: "c1", name: "Topix.dk ApS", is_legat: false, er_kunde: false }] }))).toEqual([]);
    expect(onlineMedlemmer(dom({ virksomheder: [{ id: "c1", name: "Uden felt", is_legat: false, er_kunde: null }] }))[0]?.virksomhed).toBe("Uden felt");
  });
  it("legat vises — mærket", () => {
    const r = onlineMedlemmer(dom({ virksomheder: [{ id: "c1", name: "Legat IVS", is_legat: true, er_kunde: true }] }));
    expect(r[0]).toMatchObject({ legat: true, virksomhed: "Legat IVS" });
    expect(onlineTitel(r[0])).toBe(`Anna Andersen · ${LEGAT_MAERKE}`);
  });
  it("uden virksomhed vises med virksomhed null; uden profil med navn null", () => {
    const r = onlineMedlemmer(dom({ ids: [U2], profiler: [], medlemskaber: [] }));
    expect(r).toEqual([{ user_id: U2, navn: null, avatar_url: null, virksomhed: null, legat: false }]);
    expect(onlineTitel(r[0])).toBe("Medlem");
  });
  it("medlem af to virksomheder: første kunde-virksomhed tæller; en ikke-kunde ved siden af udelukker ikke", () => {
    const r = onlineMedlemmer(dom({
      medlemskaber: [{ user_id: U1, company_id: "egen" }, { user_id: U1, company_id: "c1" }],
      virksomheder: [{ id: "egen", name: "Topix.dk ApS", is_legat: false, er_kunde: false }, { id: "c1", name: "Anna ApS", is_legat: false, er_kunde: true }],
    }));
    expect(r[0]?.virksomhed).toBe("Anna ApS");
  });
  it("tomt navn og tom avatar_url bliver null", () => {
    const r = onlineMedlemmer(dom({ profiler: [{ user_id: U1, full_name: "  ", avatar_url: "" }] }));
    expect(r[0]).toMatchObject({ navn: null, avatar_url: null });
  });
  it("sorteret på navn (dansk), ukendte navne sidst", () => {
    const r = onlineMedlemmer(dom({
      ids: [U3, U2, U1],
      profiler: [{ user_id: U1, full_name: "Ørsted", avatar_url: null }, { user_id: U2, full_name: "Anna", avatar_url: null }],
      medlemskaber: [],
    }));
    expect(r.map((m) => m.navn)).toEqual([null, "Anna", "Ørsted"]);
  });
  it("dubletter i ids giver én person", () => {
    expect(onlineMedlemmer(dom({ ids: [U1, U1] }))).toHaveLength(1);
  });
});

describe("ordene og udsnittet", () => {
  it("kanalnavn, overskrift og tom tekst", () => {
    expect(ONLINE_KANAL).toBe("online-medlemmer");
    expect(ONLINE_OVERSKRIFT).toBe("Online nu");
    expect(INGEN_ONLINE_TEKST).toBe("Ingen medlemmer online lige nu.");
    expect(onlineOverskrift(0)).toBe("Online nu");
    expect(onlineOverskrift(3)).toBe("Online nu · 3");
  });
  it("udsnit: højst ONLINE_LOFT, resten er «flere»", () => {
    const liste = Array.from({ length: 15 }, (_, i) => i);
    expect(ONLINE_LOFT).toBe(12);
    expect(onlineUdsnit(liste)).toEqual({ viste: liste.slice(0, 12), flere: 3 });
    expect(onlineUdsnit([1, 2])).toEqual({ viste: [1, 2], flere: 0 });
  });
});
