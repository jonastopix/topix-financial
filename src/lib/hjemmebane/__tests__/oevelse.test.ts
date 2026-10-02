import { describe, expect, it } from "vitest";
import { handoutConfigs, moduleOrder } from "@/lib/handoutConfig";
import {
  RETNING_MODUL,
  RETNING_STI,
  erOevelse,
  modulFraParam,
  oevelseDom,
  oevelseLektionSti,
  oevelseSti,
  oevelseTilbage,
  oevelseUlaastISamling,
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
    expect(oevelseSti("salg", null)).toBe("/handouts?module=salg");
  });
  it("bærer afsenderen som fra=<area>/<slug> (URL-kodet), så «Tilbage» kan føre til lektionen, medlemmet kom fra", () => {
    expect(oevelseSti("salg", { area: "classroom", slug: "salg-2" })).toBe("/handouts?module=salg&fra=classroom%2Fsalg-2");
  });
});

describe("modulFraParam", () => {
  it("kun et kendt modul — også overordnet (HandoutsView sender det til Dine mål); alt andet er null", () => {
    expect(modulFraParam("salg")).toBe("salg");
    expect(modulFraParam("overordnet")).toBe("overordnet");
    for (const p of [null, undefined, "", "ukendt", "toString", "/handouts"]) expect(modulFraParam(p)).toBeNull();
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

describe("oevelseUlaastISamling", () => {
  const el = (handout_module: string | null, unlocked: boolean) => ({ item: { handout_module }, drip: { unlocked } });
  it("ulåst, når en lektion MED modulet er ulåst — en ulåst lektion med et andet modul låser ikke op (rådets fund 5)", () => {
    const entries = [el("bogholderi", true), el("salg", false), el(null, true)];
    expect(oevelseUlaastISamling(entries, "bogholderi")).toBe(true);
    expect(oevelseUlaastISamling(entries, "salg")).toBe(false);
    expect(oevelseUlaastISamling(entries, "marketing")).toBe(false);
    expect(oevelseUlaastISamling([el("salg", false), el("salg", true)], "salg")).toBe(true);
    expect(oevelseUlaastISamling([], "salg")).toBe(false);
  });
});

describe("oevelseTilbage", () => {
  const to = [{ area: "classroom", slug: "salg-1", title: "Salg 1" }, { area: "classroom", slug: "salg-2", title: "Salg 2" }];
  it("den første lektion, der bærer modulet — ellers Akademiet; aldrig /handouts", () => {
    expect(oevelseTilbage(to)).toEqual({ to: "/akademiet/classroom/salg-1", label: "Salg 1" });
    expect(oevelseTilbage([])).toEqual({ to: "/akademiet", label: "Akademiet" });
  });
  it("afsenderen (fra) vinder, når den står blandt modulets lektioner — ellers den første (aldrig en fri URL)", () => {
    expect(oevelseTilbage(to, "classroom/salg-2")).toEqual({ to: "/akademiet/classroom/salg-2", label: "Salg 2" });
    expect(oevelseTilbage(to, "classroom/salg-1")).toEqual({ to: "/akademiet/classroom/salg-1", label: "Salg 1" });
    for (const fra of [null, undefined, "", "classroom/ukendt", "academy/salg-2", "https://evil.example/x", "/akademiet/classroom/salg-2", "../salg-2"]) {
      expect(oevelseTilbage(to, fra)).toEqual({ to: "/akademiet/classroom/salg-1", label: "Salg 1" });
    }
  });
  it("lektioner i områder uden Akademi-side (AREAS.akademi = false) er aldrig et mål (rådets fund 10)", () => {
    const blandet = [{ area: "talks", slug: "t", title: "T" }, { area: "quick_wins", slug: "q", title: "Q" }, { area: "academy", slug: "a", title: "A" }];
    expect(oevelseTilbage(blandet)).toEqual({ to: "/akademiet/academy/a", label: "A" });
    expect(oevelseTilbage(blandet, "talks/t")).toEqual({ to: "/akademiet/academy/a", label: "A" });
    expect(oevelseTilbage([{ area: "talks", slug: "t", title: "T" }])).toEqual({ to: "/akademiet", label: "Akademiet" });
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
  it("et område uden Akademi-side springes over (fund 10)", () => {
    const katalog = [{ ...lektion("t", "salg", "published", 0), area: "talks" }, lektion("a", "salg", "published", 1)];
    expect(oevelseLektionSti(katalog, "salg")).toBe("/akademiet/classroom/a");
  });
});
