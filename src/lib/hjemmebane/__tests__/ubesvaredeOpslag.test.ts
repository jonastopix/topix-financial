/**
 * «Ubesvarede opslag» (Jonas 16/9, valg B): dommen i lib/hjemmebane/
 * ubesvaredeOpslag.ts — alle fire grene, grænsen præcis 14 døgn, et
 * medlems svar gør den ikke besvaret, et skjult/slettet rådgiversvar tæller
 * ikke, en rådgivers eget opslag er aldrig med, præsentationer er med.
 */
import { describe, expect, it } from "vitest";
import {
  ALLE_BESVARET_TEKST,
  alderTekst,
  erIVinduet,
  flereTekst,
  forfatterVisning,
  KORT_LOFT,
  kortUdsnit,
  linjeTekst,
  traadSti,
  UBESVARET_DAGE,
  UBESVARET_VINDUE_MS,
  ubesvaredeOpslag,
  type UbesvaretSvar,
  type UbesvaretTraad,
} from "@/lib/hjemmebane/ubesvaredeOpslag";

const NU = new Date("2026-09-16T12:00:00.000Z");
const RAADGIVERE = ["jonas", "morten"];
const forDage = (dage: number, ms = 0) => new Date(NU.getTime() - dage * 86_400_000 - ms).toISOString();

const traad = (id: string, over: Partial<UbesvaretTraad> = {}): UbesvaretTraad => ({
  id,
  titel: `Opslag ${id}`,
  forfatter_id: "mette",
  forfatter_navn: "Mette Hansen",
  created_at: forDage(1),
  status: "aktiv",
  kilde_type: null,
  ...over,
});
const svar = (traad_id: string, forfatter_id: string, status = "aktiv"): UbesvaretSvar => ({ traad_id, forfatter_id, status });
const doem = (traade: UbesvaretTraad[], svarListe: UbesvaretSvar[] = []) =>
  ubesvaredeOpslag({ traade, svar: svarListe, raadgiverIds: RAADGIVERE, nu: NU });

describe("ubesvaredeOpslag — de fire grene", () => {
  it("et medlems aktive opslag uden rådgiversvar er med; ialt tæller alle", () => {
    const d = doem([traad("a"), traad("b", { created_at: forDage(3) })]);
    expect(d.liste.map((t) => t.id)).toEqual(["a", "b"]);
    expect(d.ialt).toBe(2);
  });

  it("(a) skjult og slettet er ikke med", () => {
    const d = doem([traad("a", { status: "skjult" }), traad("b", { status: "slettet" }), traad("c")]);
    expect(d.liste.map((t) => t.id)).toEqual(["c"]);
  });

  it("(b) grænsen er præcis 14 døgn: 14 døgn er med, 14 døgn + 1 ms er ikke; ulæselig dato er ikke", () => {
    expect(UBESVARET_DAGE).toBe(14);
    expect(UBESVARET_VINDUE_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(erIVinduet(forDage(14), NU)).toBe(true);
    expect(erIVinduet(forDage(14, 1), NU)).toBe(false);
    expect(erIVinduet("i går", NU)).toBe(false);
    const d = doem([traad("paa", { created_at: forDage(14) }), traad("over", { created_at: forDage(14, 1) }), traad("gammel", { created_at: forDage(30) })]);
    expect(d.liste.map((t) => t.id)).toEqual(["paa"]);
  });

  it("(b) et stempel i fremtiden (urskævhed) læses som nu — med", () => {
    expect(erIVinduet(new Date(NU.getTime() + 60_000).toISOString(), NU)).toBe(true);
  });

  it("(c) en rådgivers eget opslag er aldrig med — heller ikke uden svar", () => {
    const d = doem([traad("j", { forfatter_id: "jonas", forfatter_navn: "Jonas" }), traad("m", { forfatter_id: "morten" }), traad("a")]);
    expect(d.liste.map((t) => t.id)).toEqual(["a"]);
  });

  it("(d) et aktivt rådgiversvar gør tråden besvaret — den forsvinder", () => {
    const d = doem([traad("a"), traad("b")], [svar("a", "jonas")]);
    expect(d.liste.map((t) => t.id)).toEqual(["b"]);
    expect(d.ialt).toBe(1);
  });

  it("(d) et svar fra et medlem gør den IKKE besvaret", () => {
    const d = doem([traad("a")], [svar("a", "peter"), svar("a", "mette")]);
    expect(d.liste.map((t) => t.id)).toEqual(["a"]);
  });

  it("(d) et skjult eller slettet rådgiversvar tæller ikke", () => {
    const d = doem([traad("a"), traad("b")], [svar("a", "jonas", "skjult"), svar("b", "morten", "slettet")]);
    expect(d.liste.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("(d) et svar på en ANDEN tråd tæller ikke for denne", () => {
    const d = doem([traad("a"), traad("b")], [svar("b", "jonas")]);
    expect(d.liste.map((t) => t.id)).toEqual(["a"]);
  });

  it("præsentationer er med som alle andre", () => {
    const d = doem([traad("p", { kilde_type: "praesentation", titel: "Hej, jeg er Mette" })]);
    expect(d.liste[0]?.kilde_type).toBe("praesentation");
  });

  it("nyeste først", () => {
    const d = doem([traad("gammel", { created_at: forDage(5) }), traad("ny", { created_at: forDage(0) }), traad("midt", { created_at: forDage(2) })]);
    expect(d.liste.map((t) => t.id)).toEqual(["ny", "midt", "gammel"]);
  });

  it("tomt → tom liste, ialt 0; rører ikke input", () => {
    const traade = [traad("a")];
    const kopi = JSON.parse(JSON.stringify(traade));
    expect(doem([])).toEqual({ liste: [], ialt: 0 });
    doem(traade);
    expect(traade).toEqual(kopi);
  });
});

describe("kortets udsnit og tekster", () => {
  it("højst fem linjer; resten som tal", () => {
    expect(KORT_LOFT).toBe(5);
    const liste = ["a", "b", "c", "d", "e", "f", "g"];
    expect(kortUdsnit(liste)).toEqual({ viste: ["a", "b", "c", "d", "e"], flere: 2 });
    expect(kortUdsnit(["a"])).toEqual({ viste: ["a"], flere: 0 });
  });
  it("«og N mere i fællesskabet»", () => {
    expect(flereTekst(2)).toBe("og 2 mere i fællesskabet");
    expect(flereTekst(1)).toBe("og 1 mere i fællesskabet");
  });
  it("linjen: «{forfatter} · {titel}», fallback «Et medlem»", () => {
    expect(linjeTekst({ forfatter_navn: "Mette Hansen", titel: " Hvem har prøvet? " })).toBe("Mette Hansen · Hvem har prøvet?");
    expect(linjeTekst({ forfatter_navn: null, titel: "Hej" })).toBe("Et medlem · Hej");
    expect(forfatterVisning("  ")).toBe("Et medlem");
  });
  it("alderen: i dag / i går / for N dage siden — kalenderdage på læserens dag", () => {
    const nu = new Date(2026, 8, 16, 12, 0);
    expect(alderTekst(new Date(2026, 8, 16, 1, 0).toISOString(), nu)).toBe("i dag");
    expect(alderTekst(new Date(2026, 8, 15, 23, 0).toISOString(), nu)).toBe("i går");
    expect(alderTekst(new Date(2026, 8, 12, 9, 0).toISOString(), nu)).toBe("for 4 dage siden");
    expect(alderTekst("vrøvl", nu)).toBe("i dag");
  });
  it("stien og den tomme tekst", () => {
    expect(traadSti("t1")).toBe("/community/t1");
    expect(ALLE_BESVARET_TEKST).toBe("Alle opslag fra de sidste 14 dage har fået svar fra en af jer.");
  });
});
