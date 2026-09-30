import { describe, expect, it } from "vitest";
import {
  andel,
  bredde,
  feltDom,
  FOLD_LOFT,
  foldUdsnit,
  forFaaNote,
  ONLINE_FELT_LOFT,
  pulsVisning,
  streakPille,
  svarKnapTekst,
  svartidRaekker,
  visAlleTekst,
} from "@/lib/hjemmebane/hoejreKolonne";
import { pulsLinjer, type Pulsen } from "@/lib/pulsen";
import type { SvartidTal } from "@/lib/svartid";

/** Højre kolonne på rådgivernes forside (30/9-2026): opsætningen som rene
    funktioner — prik og ord, udsnit, bjælker, tabel, pille. */

describe("feltDom — prik + ord, farve aldrig alene", () => {
  it("0 er roligt og i orden, med et ord", () => {
    for (const slags of ["sessioner", "online", "opslag", "betaling"] as const) {
      const d = feltDom(slags, 0);
      expect(d).toMatchObject({ tone: "i_orden", rolig: true });
      expect(d.statusTekst.length).toBeGreaterThan(0);
    }
  });
  it("noget der venter er orange; online nu venter aldrig på nogen", () => {
    expect(feltDom("sessioner", 2)).toEqual({ tone: "venter", rolig: false, statusTekst: "Står i kalenderen" });
    expect(feltDom("opslag", 3)).toEqual({ tone: "venter", rolig: false, statusTekst: "Venter på svar" });
    expect(feltDom("betaling", 1)).toEqual({ tone: "venter", rolig: false, statusTekst: "Har ikke betalt" });
    expect(feltDom("online", 4)).toEqual({ tone: "i_orden", rolig: false, statusTekst: "Har appen åben" });
  });
  it("de to toner har hver sit ord ved samme felt", () => {
    expect(feltDom("opslag", 0).statusTekst).not.toBe(feltDom("opslag", 1).statusTekst);
  });
});

describe("foldUdsnit — fem ad gangen", () => {
  const liste = Array.from({ length: 19 }, (_, i) => i);
  it("lukket for «vis alle»: FOLD_LOFT, resten skjult", () => {
    expect(FOLD_LOFT).toBe(5);
    expect(foldUdsnit(liste, false)).toEqual({ viste: [0, 1, 2, 3, 4], skjulte: 14 });
  });
  it("vis alle: alt, intet skjult", () => {
    expect(foldUdsnit(liste, true)).toEqual({ viste: liste, skjulte: 0 });
  });
  it("færre end loftet: intet skjult", () => {
    expect(foldUdsnit([1, 2, 3], false)).toEqual({ viste: [1, 2, 3], skjulte: 0 });
  });
  it("teksten og online-loftet", () => {
    expect(visAlleTekst(19)).toBe("Vis alle 19");
    expect(ONLINE_FELT_LOFT).toBe(5);
  });
});

describe("andel og bredde", () => {
  it("regner X af Y, klipper og tåler 0", () => {
    expect(andel(3, 12)).toBe(0.25);
    expect(andel(0, 12)).toBe(0);
    expect(andel(5, 0)).toBe(0);
    expect(andel(14, 12)).toBe(1);
    expect(bredde(1, 3)).toBe("33%");
    expect(bredde(0, 0)).toBe("0%");
  });
});

const PULSEN: Pulsen = {
  iAlt: 27,
  maanedNoegle: "2026-08",
  maanedNavn: "august",
  rapporterer: { antal: 3, companyIds: ["a", "b", "c"] },
  svarer: { antal: 1, companyIds: ["d"] },
  tavse: { antal: 15, companyIds: [] },
  fornyelser: { antal: 2, companyIds: ["e", "f"] },
  oeverst: { tavse: 1, fornyelser: 1 },
  tavseFordeling: { iLinjen: 10, oeverst: 1, ikkeKommetInd: 3, udloebet: 0, lukket: 1 },
};

describe("pulsVisning — pulsens tal sat op, links fra pulsLinjer", () => {
  const v = pulsVisning(PULSEN);
  it("to bjælker: X af porteføljen", () => {
    expect(v.bjaelker.map((b) => [b.noegle, b.x, b.y])).toEqual([["rapporterer", 3, 27], ["svarer", 1, 27]]);
    expect(v.bjaelker[0].etiket).toBe("Har rapporteret august");
    expect(v.bjaelker[1].etiket).toBe("Har svaret på et forslag (90 dage)");
  });
  it("linkene er pulsLinjers — én virksomhed direkte, flere til ?puls=", () => {
    const to = new Map(pulsLinjer(PULSEN).map((l) => [l.noegle, l.to]));
    expect(v.bjaelker[0].to).toBe(to.get("rapporterer"));
    expect(v.bjaelker[1].to).toBe("/virksomhed/d");
    expect(v.maerker.find((m) => m.noegle === "tavse")?.to).toBe(to.get("tavse"));
    expect(v.maerker.find((m) => m.noegle === "fornyelser")?.to).toBe(to.get("fornyelser"));
  });
  it("mærkerne: tavse (rust) og fordelingen uden nul-grupper, fornyelser sidst", () => {
    expect(v.maerker.map((m) => m.tekst)).toEqual(["15 tavse", "1 står øverst", "3 ikke kommet ind", "1 lukket", "2 fornyelser venter · 1 står øverst"]);
    expect(v.maerker.filter((m) => m.advarsel).map((m) => m.noegle)).toEqual(["tavse"]);
  });
  it("ingen tavse → intet rust", () => {
    const rolig = pulsVisning({ ...PULSEN, tavse: { antal: 0, companyIds: [] }, tavseFordeling: { iLinjen: 0, oeverst: 0, ikkeKommetInd: 0, udloebet: 0, lukket: 0 } });
    expect(rolig.maerker.some((m) => m.advarsel)).toBe(false);
    expect(rolig.maerker.map((m) => m.noegle)).toEqual(["tavse", "fornyelser"]);
  });
});

const tal = (x: Partial<SvartidTal>): SvartidTal => ({
  n: 12, forFaa: false, medianHverdagstimer: 3.5, gennemsnitHverdagstimer: 4, medianRaaTimer: 5, gennemsnitRaaTimer: 6,
  andelInden4t: 0.75, andelInden24t: 0.95, afgjorte4t: 12, afgjorte24t: 12, ...x,
});

describe("svartidRaekker — 7 og 30 dage som tabel", () => {
  it("fire rækker i designets orden", () => {
    const r = svartidRaekker(tal({}), tal({ n: 40, medianHverdagstimer: 12, andelInden4t: 0.5, andelInden24t: 0.9 }));
    expect(r.map((x) => x.etiket)).toEqual(["Median", "Andel < 4 t", "Andel < 24 t", "Antal svar"]);
    expect(r.map((x) => x.uge)).toEqual(["3,5 t", "75 %", "95 %", "12"]);
    expect(r.map((x) => x.maaned)).toEqual(["12 t", "50 %", "90 %", "40"]);
  });
  it("for få svar → streger, men antallet står", () => {
    const r = svartidRaekker(tal({ n: 3, forFaa: true }), tal({}));
    expect(r.map((x) => x.uge)).toEqual(["—", "—", "—", "3"]);
    expect(forFaaNote(tal({ n: 3, forFaa: true }), tal({}))).toBe("For få svar til tal (7 dage: 3 af mindst 5).");
    expect(forFaaNote(tal({}), tal({}))).toBeNull();
  });
  it("null-andel → streg", () => {
    expect(svartidRaekker(tal({ andelInden4t: null }), tal({}))[1].uge).toBe("—");
  });
});

describe("streakPille og svarKnapTekst", () => {
  it("kort tekst til pillen", () => {
    expect(streakPille({ dage: 12, mindst: false, brudtNu: false })).toBe("12 dage i træk");
    expect(streakPille({ dage: 1, mindst: false, brudtNu: false })).toBe("1 dag i træk");
    expect(streakPille({ dage: 30, mindst: true, brudtNu: false })).toBe("Mindst 30 dage i træk");
    expect(streakPille({ dage: 0, mindst: false, brudtNu: true })).toBe("Streak brudt");
    expect(streakPille({ dage: 0, mindst: false, brudtNu: false })).toBe("0 dage i træk");
  });
  it("knappen til chatten", () => {
    expect(svarKnapTekst("Floren Engros")).toBe("Svar Floren Engros →");
    expect(svarKnapTekst(null)).toBe("Svar samtalen →");
  });
});
