import { describe, expect, it } from "vitest";
import {
  AABNE_STATUSSER,
  GENTAGELSES_VINDUE_DAGE,
  doemSkrivning,
  erGentagelse,
  gentagelsesGraense,
  maaSkriveForslag,
  normaliserTitel,
  skriveFilter,
  taelAabne,
  type ForslagsRaekke,
} from "../skridtForslag";

// Fase 0a («Én plan pr. virksomhed»): tre skrivere, én dom. Jonas 16/9,
// beslutning 3: AI'en foreslår højst ét skridt ad gangen; kortets regel:
// samme normaliserede titel inden for 30 dage = samme forslag — også
// dismissed og expired.

const NU = new Date("2026-09-17T08:00:00Z");
const dage = (n: number) => new Date(NU.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
const r = (title: string, status: string, forDage: number): ForslagsRaekke => ({ title, status, created_at: dage(forDage) });

describe("normaliserTitel — små bogstaver, ét mellemrum, ingen kanter, ingen slut-tegnsætning", () => {
  it("skelner ikke på store/små bogstaver, whitespace og afsluttende tegn", () => {
    expect(normaliserTitel("  Ring til   banken. ")).toBe("ring til banken");
    expect(normaliserTitel("Ring til banken!")).toBe("ring til banken");
    expect(normaliserTitel("Ring til banken…")).toBe("ring til banken");
    expect(normaliserTitel("RING\tTIL\nBANKEN:")).toBe("ring til banken");
  });
  it("beholder tegn inde i titlen og tal", () => {
    expect(normaliserTitel("Følg op på Q3-budgettet (uge 38)")).toBe("følg op på q3-budgettet (uge 38)");
  });
  it("unicode-normaliserer (é på to måder er samme titel)", () => {
    expect(normaliserTitel("café")).toBe(normaliserTitel("café"));
  });
  it("tom eller kun tegnsætning giver tom nøgle", () => {
    expect(normaliserTitel("   ")).toBe("");
    expect(normaliserTitel("...")).toBe("");
  });
});

describe("erGentagelse — samme titel inden for 30 døgn, uanset status", () => {
  it("proposed, dismissed, expired, done: alle tæller inden for vinduet", () => {
    for (const status of ["proposed", "dismissed", "expired", "done", "active", "dropped", "not_done"]) {
      const d = erGentagelse("Ring til banken", [r("ring til banken!", status, 3)], NU);
      expect(d).toEqual({ gentagelse: true, status, created_at: dage(3) });
    }
  });
  it("31 døgn gammel: ingen gentagelse; præcis 30 døgn: gentagelse (grænsen tæller med)", () => {
    expect(erGentagelse("Ring til banken", [r("Ring til banken", "dismissed", 31)], NU)).toEqual({ gentagelse: false });
    expect(erGentagelse("Ring til banken", [r("Ring til banken", "dismissed", GENTAGELSES_VINDUE_DAGE)], NU)).toMatchObject({ gentagelse: true });
  });
  it("en anden titel er ikke en gentagelse", () => {
    expect(erGentagelse("Ring til revisor", [r("Ring til banken", "proposed", 1)], NU)).toEqual({ gentagelse: false });
  });
  it("tom titel er aldrig en gentagelse (valideringen afviser den før)", () => {
    expect(erGentagelse("   ", [r("", "proposed", 1)], NU)).toEqual({ gentagelse: false });
  });
  it("den nyeste ramte række returneres", () => {
    const d = erGentagelse("Ring til banken", [r("Ring til banken", "expired", 20), r("Ring til banken", "dismissed", 2)], NU);
    expect(d).toEqual({ gentagelse: true, status: "dismissed", created_at: dage(2) });
  });
  it("fail-closed: ulæseligt eller fremtidigt created_at tæller som inden for vinduet", () => {
    expect(erGentagelse("Ring til banken", [{ title: "Ring til banken", status: "expired", created_at: "nej" }], NU)).toMatchObject({ gentagelse: true });
    expect(erGentagelse("Ring til banken", [r("Ring til banken", "expired", -5)], NU)).toMatchObject({ gentagelse: true });
  });
});

describe("taelAabne og maaSkriveForslag — højst ét åbent forslag pr. virksomhed", () => {
  it("tæller kun proposed — også et udløbet der endnu ikke er lukket af cronen", () => {
    expect(AABNE_STATUSSER).toEqual(["proposed"]);
    expect(taelAabne([r("a", "proposed", 40), r("b", "expired", 1), r("c", "active", 1), r("d", "dismissed", 1)])).toBe(1);
  });
  it("nul åbne: ja; ét eller flere: nej", () => {
    expect(maaSkriveForslag(0)).toBe(true);
    expect(maaSkriveForslag(1)).toBe(false);
    expect(maaSkriveForslag(6)).toBe(false);
  });
});

const AI = { skriver: "ai" } as const;
const RAADGIVER = { skriver: "raadgiver" } as const;

describe("doemSkrivning for AI'en — i rækkefølgen venter → gentagelse → ok", () => {
  it("ingen rækker: ok", () => {
    expect(doemSkrivning("Ring til banken", [], NU, AI)).toEqual({ ok: true });
  });
  it("et åbent forslag (uanset titel og alder) → forslag_venter med antallet", () => {
    expect(doemSkrivning("Ring til banken", [r("Noget andet", "proposed", 45)], NU, AI)).toEqual({ ok: false, grund: "forslag_venter", antal: 1 });
  });
  it("intet åbent, men samme titel afvist for 10 dage siden → gentagelse", () => {
    expect(doemSkrivning("Ring til banken", [r("Ring til banken", "dismissed", 10)], NU, AI)).toEqual({ ok: false, grund: "gentagelse", status: "dismissed", created_at: dage(10) });
  });
  it("venter dømmes FØR gentagelse", () => {
    expect(doemSkrivning("Ring til banken", [r("Ring til banken", "dismissed", 10), r("Andet", "proposed", 1)], NU, AI)).toMatchObject({ grund: "forslag_venter" });
  });
  it("gammel gentagelse (31 dage) og intet åbent → ok", () => {
    expect(doemSkrivning("Ring til banken", [r("Ring til banken", "done", 31)], NU, AI)).toEqual({ ok: true });
  });
});

describe("doemSkrivning for rådgiveren (Jonas 16/9, valg A) — aldrig spærret af et ventende forslag, kun af dubletkontrollen", () => {
  it("et åbent forslag hos medlemmet spærrer IKKE rådgiveren", () => {
    expect(doemSkrivning("Ring til banken", [r("Noget andet", "proposed", 1)], NU, RAADGIVER)).toEqual({ ok: true });
    expect(doemSkrivning("Ring til banken", [r("A", "proposed", 1), r("B", "proposed", 2), r("C", "proposed", 3)], NU, RAADGIVER)).toEqual({ ok: true });
  });
  it("men samme titel inden for 30 døgn spærrer stadig — uanset status", () => {
    expect(doemSkrivning("Ring til banken", [r("ring til banken.", "dismissed", 10)], NU, RAADGIVER)).toEqual({ ok: false, grund: "gentagelse", status: "dismissed", created_at: dage(10) });
    expect(doemSkrivning("Ring til banken", [r("Ring til banken", "proposed", 1)], NU, RAADGIVER)).toMatchObject({ grund: "gentagelse" });
  });
  it("samme rækker, to skrivere, to domme: AI'en stopper, rådgiveren skriver", () => {
    const raekker = [r("Noget andet", "proposed", 1)];
    expect(doemSkrivning("Ring til banken", raekker, NU, AI)).toMatchObject({ ok: false, grund: "forslag_venter" });
    expect(doemSkrivning("Ring til banken", raekker, NU, RAADGIVER)).toEqual({ ok: true });
  });
});

describe("skriverens SELECT-filter", () => {
  it("grænsen er 30 døgn før nu, og filteret er «proposed uanset alder ELLER nyere end grænsen»", () => {
    expect(gentagelsesGraense(NU).toISOString()).toBe("2026-08-18T08:00:00.000Z");
    expect(skriveFilter(NU)).toBe("status.eq.proposed,created_at.gte.2026-08-18T08:00:00.000Z");
  });
});
