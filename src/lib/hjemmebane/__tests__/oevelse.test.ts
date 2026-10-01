import { describe, expect, it } from "vitest";
import { handoutConfigs, moduleOrder } from "@/lib/handoutConfig";
import {
  RETNING_MODUL,
  RETNING_STI,
  erOevelse,
  oevelseDom,
  oevelseLektionSti,
  oevelseSti,
  oevelseTilbage,
  oevelserForSamling,
} from "@/lib/hjemmebane/oevelse";

/* Motoren bag «øvelsen» (handouts i Akademiet, 1/10-2026 nat). */

const salg = handoutConfigs.salg;

describe("erOevelse", () => {
  it("de fire moduler er øvelser; overordnet (retningen) er det ikke; ukendt/tom er det ikke", () => {
    for (const m of moduleOrder.filter((m) => m !== RETNING_MODUL)) expect(erOevelse(m)).toBe(true);
    expect(erOevelse(RETNING_MODUL)).toBe(false);
    expect(erOevelse("overordnet")).toBe(false);
    expect(erOevelse("")).toBe(false);
    expect(erOevelse(null)).toBe(false);
    expect(erOevelse(undefined)).toBe(false);
    expect(erOevelse("toString")).toBe(false); // prototypen tæller ikke
    expect(erOevelse("ukendt")).toBe(false);
  });

  it("retningen bor i Dine mål", () => {
    expect(RETNING_STI).toBe("/milestones");
  });
});

describe("oevelseSti", () => {
  it("er den eksisterende editor-rute med modulet som query (Akademi-broens kontrakt)", () => {
    expect(oevelseSti("salg")).toBe("/handouts?module=salg");
  });
});

describe("oevelseDom", () => {
  const raekke = (status: string | null, responses: Record<string, string> = {}) => ({
    status,
    responses,
    checklist: {},
    levers: [],
  });

  it("ingen række / not_started / null-status → ikke startet, «Lav øvelsen»", () => {
    for (const r of [null, undefined, raekke("not_started"), raekke(null)]) {
      expect(oevelseDom(r, salg)).toEqual({ tilstand: "ikke_startet", procent: 0, statusTekst: "Ikke startet", knapTekst: "Lav øvelsen" });
    }
  });

  it("in_progress → i gang med procenten, også på 0 % (rækken findes)", () => {
    const tom = oevelseDom(raekke("in_progress"), salg);
    expect(tom.tilstand).toBe("i_gang");
    expect(tom.procent).toBe(0);
    expect(tom.statusTekst).toBe("I gang · 0 %");
    expect(tom.knapTekst).toBe("Fortsæt");

    const foersteNoegle = salg.sections[0].questions[0].key;
    const lidt = oevelseDom(raekke("in_progress", { [foersteNoegle]: "svar" }), salg);
    expect(lidt.procent).toBeGreaterThan(0);
    expect(lidt.statusTekst).toBe(`I gang · ${lidt.procent} %`);
  });

  it("completed vinder over procenten → udfyldt, «Se dine svar»", () => {
    const d = oevelseDom(raekke("completed"), salg);
    expect(d.tilstand).toBe("udfyldt");
    expect(d.statusTekst).toBe("Udfyldt");
    expect(d.knapTekst).toBe("Se dine svar");
  });
});

describe("oevelserForSamling", () => {
  const el = (handout_module: string | null) => ({ item: { handout_module } });

  it("unikke moduler i moduleOrders rækkefølge; overordnet, null og ukendt udelades", () => {
    const moduler = oevelserForSamling([el("marketing"), el(null), el("salg"), el("marketing"), el("overordnet"), el("ukendt")]);
    expect(moduler).toEqual(["salg", "marketing"]);
  });

  it("tom samling → ingen øvelser", () => {
    expect(oevelserForSamling([])).toEqual([]);
  });
});

describe("oevelseTilbage", () => {
  it("den første lektion, der bærer modulet — ellers Akademiet; aldrig /handouts", () => {
    expect(oevelseTilbage([{ area: "classroom", slug: "salg-1", title: "Salg 1" }, { area: "classroom", slug: "salg-2", title: "Salg 2" }]))
      .toEqual({ to: "/akademiet/classroom/salg-1", label: "Salg 1" });
    expect(oevelseTilbage([])).toEqual({ to: "/akademiet", label: "Akademiet" });
  });
});

describe("oevelseLektionSti", () => {
  const lektion = (slug: string, handout_module: string | null, status = "published", position = 0) => ({
    id: slug, area: "classroom", slug, title: slug, status, handout_module, position, created_at: "2026-01-01T00:00:00Z",
  });
  it("den første publicerede lektion i forløbsrækkefølge, der bærer modulet — ellers Akademiet", () => {
    const katalog = [lektion("b", "salg", "published", 2), lektion("a", "salg", "published", 1), lektion("k", "salg", "draft", 0), lektion("x", "marketing")];
    expect(oevelseLektionSti(katalog, "salg")).toBe("/akademiet/classroom/a");
    expect(oevelseLektionSti(katalog, "bogholderi")).toBe("/akademiet");
    expect(oevelseLektionSti([], "salg")).toBe("/akademiet");
  });
});
