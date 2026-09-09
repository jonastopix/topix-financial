import { describe, expect, it } from "vitest";
import { EKSPORT_VEJE, HISTORIK_MAANEDER, tomListeTekst, uploadZoneTekst, vejledningAaben } from "../rapporteringTekst";

// Rapporteringens ord (9/9): en ny skal forstå at de ikke skal vente på
// næste måned — de skal uploade det de har, også fra før medlemskabet.
// En vant skal ikke læse introduktionen hver måned.

describe("uploadZoneTekst — ny mod vant", () => {
  it("ny: beder om historik, tre måneder, gerne mere, også fra før medlemskabet — og siger hvor tallene kommer fra", () => {
    const t = uploadZoneTekst(true);
    expect(HISTORIK_MAANEDER).toBe(3);
    expect(t.overskrift).toBe("Upload dine tal — start med historikken");
    expect(t.linje).toContain("seneste 3 måneder");
    expect(t.linje).toContain("gerne mere");
    expect(t.linje).toContain("før du blev medlem");
    expect(t.linje).toContain("regnskabsprogram");
    expect(t.linje).toContain("Klik eller træk hertil");
  });

  it("vant: den hidtidige korte tekst, ordret", () => {
    expect(uploadZoneTekst(false)).toEqual({
      overskrift: "Upload din månedsrapport",
      linje: "Saldobalance eller resultatopgørelse — PDF, Excel eller CSV. Klik eller træk hertil.",
    });
  });
});

describe("tomListeTekst", () => {
  it("ny: siger hvad der skal til, ingen nuller", () => {
    const t = tomListeTekst(true);
    expect(t).toContain("seneste 3 måneder");
    expect(t).toContain("før medlemskabet");
    expect(t).not.toMatch(/\b0 /);
  });
  it("vant (fx et årsfilter uden rækker): kort", () => {
    expect(tomListeTekst(false)).toBe("Ingen rapporter i denne visning.");
  });
});

describe("EKSPORT_VEJE — systemerne står FØR uploaden, én linje hver", () => {
  it("de tre systemer fra fejlbeskederne, plus «Andre»", () => {
    expect(EKSPORT_VEJE.map((v) => v.system)).toEqual(["e-conomic", "Dinero", "Billy", "Andre"]);
    for (const v of EKSPORT_VEJE) expect(v.vej.length).toBeLessThan(140); // én linje, ikke en vejledning
  });
  it("vejledningen er foldet ud for den nye, sammen for den vante", () => {
    expect(vejledningAaben(true)).toBe(true);
    expect(vejledningAaben(false)).toBe(false);
  });
});
