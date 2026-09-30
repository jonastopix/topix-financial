import { describe, it, expect } from "vitest";
import { ERFAREN_EFTER_DAGE, erErfarentMedlem, erVelkomstHash, fokusCtaHref, onboardingBoksMonteres, pillenTraekkerSig, tjeklistenStyrerForsiden, VELKOMST_HASH, VELKOMST_INDLEDNING, velkomstTekst } from "../ankomst";

// Ankomstens to løse ender (docs/indgangen-overhaling.md §10, 3/9):
// hashen der lader fokuskortet åbne velkomstvideoen, og dommen der lader
// pillen trække sig — kun på forsiden, kun når kortet viser tjeklisten.

describe("fokusCtaHref — velkomst-punktet får hashen, intet andet røres", () => {
  it("tjekliste-punkt med sti '' → #velkomst", () => {
    expect(fokusCtaHref({ kind: "tjekliste", ctaHref: "" })).toBe(VELKOMST_HASH);
    expect(VELKOMST_HASH.startsWith("#")).toBe(true); // kortets <a href>-gren, ikke Link
  });

  it("de fem andre tjekliste-punkter bærer deres sti uændret", () => {
    for (const sti of ["/settings", "/rapportering", "/handouts", "/chat"]) {
      expect(fokusCtaHref({ kind: "tjekliste", ctaHref: sti })).toBe(sti);
    }
  });

  it("andre kinds med tom eller '/'-href røres ikke — kun tjeklistens '' oversættes", () => {
    expect(fokusCtaHref({ kind: "weekly-focus", ctaHref: "/" })).toBe("/");
    expect(fokusCtaHref({ kind: "unlinked-lever", ctaHref: "#dine-aftaler" })).toBe("#dine-aftaler");
    expect(fokusCtaHref({ kind: "empty-profile", ctaHref: "" })).toBe("");
  });
});

describe("erVelkomstHash", () => {
  it("matcher præcis #velkomst, med tolerance for mellemrum", () => {
    expect(erVelkomstHash("#velkomst")).toBe(true);
    expect(erVelkomstHash(" #velkomst ")).toBe(true);
    expect(erVelkomstHash("#velkomsten")).toBe(false);
    expect(erVelkomstHash("#goals")).toBe(false);
    expect(erVelkomstHash("")).toBe(false);
    expect(erVelkomstHash(null)).toBe(false);
    expect(erVelkomstHash(undefined)).toBe(false);
  });
});

describe("pillenTraekkerSig — kun på forsiden, kun når kortet viser tjeklisten", () => {
  it("forsiden + uafsluttet tjekliste → trækker sig", () => {
    expect(pillenTraekkerSig("boardroom", { faerdig: false })).toBe(true);
  });

  it("forsiden + færdig tjekliste → bliver (kortet viser noget andet; lykønskningen som i dag)", () => {
    expect(pillenTraekkerSig("boardroom", { faerdig: true })).toBe(false);
  });

  it("forsiden uden tjekliste (ikke landet, eller rådgiver) → bliver", () => {
    expect(pillenTraekkerSig("boardroom", null)).toBe(false);
    expect(pillenTraekkerSig("boardroom", undefined)).toBe(false);
  });

  it("alle andre sider → bliver, uanset tjeklistens tilstand", () => {
    for (const side of ["akademiet", "rapportering", "noegletal", "budget", "handouts", "booksession", "rabataftaler", "events", "medlemmer", "community", "chat", "deling"]) {
      expect(pillenTraekkerSig(side, { faerdig: false })).toBe(false);
      expect(pillenTraekkerSig(side, { faerdig: true })).toBe(false);
    }
  });
});

describe("velkomstTekst — overlejringen påstår aldrig en placering der ikke er på skærmen (14/9)", () => {
  it("forsiden (pillen trækker sig): tjeklisten er kortet under «Dit næste skridt» — ikke «nederst»", () => {
    const t = velkomstTekst(true);
    expect(t.startsWith(VELKOMST_INDLEDNING)).toBe(true);
    expect(t).toContain("under «Dit næste skridt» her på forsiden");
    expect(t).not.toMatch(/nederst/);
    expect(t).not.toMatch(/hjørne/);
  });

  it("alle andre sider (pillen vises): tjeklisten ligger nederst på skærmen — sandt både i bunden (mobil) og i hjørnet (lg)", () => {
    const t = velkomstTekst(false);
    expect(t.startsWith(VELKOMST_INDLEDNING)).toBe(true);
    expect(t).toContain("nederst på skærmen");
    expect(t).not.toMatch(/forsiden/);
    expect(t).not.toMatch(/hjørne/);
    expect(t).not.toMatch(/nederst på siden/); // den gamle sætning
  });

  it("begge tekster lover det samme: at tjeklisten følger med, indtil alt er på plads", () => {
    for (const t of [velkomstTekst(true), velkomstTekst(false)]) {
      expect(t).toContain("følger med dig, indtil alt er på plads.");
    }
    expect(velkomstTekst(true)).not.toBe(velkomstTekst(false));
  });
});

describe("onboardingBoksMonteres — ikke på chatten på mobil (den dækkede sendefeltet)", () => {
  it("chatten + mobil → monteres ikke", () => {
    expect(onboardingBoksMonteres("chat", true)).toBe(false);
  });

  it("chatten på desktop/tablet → monteres som før (desktop uændret)", () => {
    expect(onboardingBoksMonteres("chat", false)).toBe(true);
  });

  it("alle andre sider → monteres, på mobil som på desktop", () => {
    for (const side of ["boardroom", "akademiet", "rapportering", "noegletal", "budget", "handouts", "booksession", "rabataftaler", "events", "medlemmer", "community", "deling"]) {
      expect(onboardingBoksMonteres(side, true)).toBe(true);
      expect(onboardingBoksMonteres(side, false)).toBe(true);
    }
  });

  it("er uafhængig af pillenTraekkerSig (forsiden trækker pillen, chatten monterer den slet ikke)", () => {
    expect(pillenTraekkerSig("chat", { faerdig: false })).toBe(false);
    expect(onboardingBoksMonteres("chat", true)).toBe(false);
  });
});

/* ── 4. Erfarne medlemmer slippes (30/9): tjeklisten styrer kun forsiden
      for et medlem, der er kommet ind for højst 30 døgn siden. ── */

const NU = new Date("2026-10-01T09:00:00.000Z");
const DOEGN = 86_400_000;
const siden = (ms: number) => new Date(NU.getTime() - ms).toISOString();

describe("erErfarentMedlem — mere end 30 døgn siden profiles.created_at", () => {
  it("grænsen er 30 × 86 400 000 ms: præcis 30 døgn = ny, ét millisekund mere = erfaren", () => {
    expect(ERFAREN_EFTER_DAGE).toBe(30);
    expect(erErfarentMedlem(siden(30 * DOEGN), NU)).toBe(false);
    expect(erErfarentMedlem(siden(30 * DOEGN + 1), NU)).toBe(true);
  });

  it("de målte tilfælde (prod 30/9): profil fra 4/3 og 13/8 er erfaren; 15/9, 28/9 og 29/9 er nye", () => {
    expect(erErfarentMedlem("2026-03-04T10:00:00.000Z", NU)).toBe(true);
    expect(erErfarentMedlem("2026-08-13T10:00:00.000Z", NU)).toBe(true);
    expect(erErfarentMedlem("2026-09-15T10:00:00.000Z", NU)).toBe(false);
    expect(erErfarentMedlem("2026-09-28T10:00:00.000Z", NU)).toBe(false);
    expect(erErfarentMedlem("2026-09-29T10:00:00.000Z", NU)).toBe(false);
  });

  it("ukendt, tom eller ugyldig dato = NY (fail-soft: skjuler aldrig ankomsten for et nyt medlem)", () => {
    expect(erErfarentMedlem(null, NU)).toBe(false);
    expect(erErfarentMedlem(undefined, NU)).toBe(false);
    expect(erErfarentMedlem("", NU)).toBe(false);
    expect(erErfarentMedlem("ikke-en-dato", NU)).toBe(false);
  });

  it("en dato i fremtiden (ur-skævhed) = ny", () => {
    expect(erErfarentMedlem(new Date(NU.getTime() + DOEGN).toISOString(), NU)).toBe(false);
  });
});

describe("tjeklistenStyrerForsiden — ÉN dom for kortet, hilsenen og pillen", () => {
  it("ny + uafsluttet → styrer; ny + færdig → styrer ikke; ingen tjekliste → styrer ikke", () => {
    expect(tjeklistenStyrerForsiden({ faerdig: false }, siden(5 * DOEGN), NU)).toBe(true);
    expect(tjeklistenStyrerForsiden({ faerdig: true }, siden(5 * DOEGN), NU)).toBe(false);
    expect(tjeklistenStyrerForsiden(null, siden(5 * DOEGN), NU)).toBe(false);
    expect(tjeklistenStyrerForsiden(undefined, null, NU)).toBe(false);
  });

  it("erfaren + uafsluttet → styrer IKKE (fokuskortet og hilsenen er fri)", () => {
    expect(tjeklistenStyrerForsiden({ faerdig: false }, siden(240 * DOEGN), NU)).toBe(false);
  });

  it("ukendt medlem_siden + uafsluttet → styrer som før 30/9", () => {
    expect(tjeklistenStyrerForsiden({ faerdig: false }, null, NU)).toBe(true);
  });
});

describe("pillenTraekkerSig og erfarne medlemmer — pillen gemmer sig aldrig, mens kortet ikke viser listen", () => {
  it("erfaren på forsiden med uafsluttet liste → pillen BLIVER (kortet viser tal, ikke listen)", () => {
    expect(pillenTraekkerSig("boardroom", { faerdig: false }, siden(240 * DOEGN), NU)).toBe(false);
  });

  it("ny på forsiden med uafsluttet liste → pillen trækker sig som før", () => {
    expect(pillenTraekkerSig("boardroom", { faerdig: false }, siden(5 * DOEGN), NU)).toBe(true);
  });

  it("pillen og kortet er altid enige på forsiden (samme dom)", () => {
    for (const dage of [0, 5, 30, 31, 240]) {
      for (const faerdig of [false, true]) {
        const ms = siden(dage * DOEGN);
        expect(pillenTraekkerSig("boardroom", { faerdig }, ms, NU)).toBe(tjeklistenStyrerForsiden({ faerdig }, ms, NU));
      }
    }
  });

  it("andre sider → bliver, også for et nyt medlem", () => {
    expect(pillenTraekkerSig("rapportering", { faerdig: false }, siden(5 * DOEGN), NU)).toBe(false);
  });
});
