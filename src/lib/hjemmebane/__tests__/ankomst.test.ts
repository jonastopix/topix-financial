import { describe, it, expect } from "vitest";
import { erVelkomstHash, fokusCtaHref, pillenTraekkerSig, VELKOMST_HASH } from "../ankomst";

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
    for (const side of ["akademiet", "rapportering", "noegletal", "budget", "handouts", "booksession", "podcast", "rabataftaler", "events", "medlemmer", "community", "chat"]) {
      expect(pillenTraekkerSig(side, { faerdig: false })).toBe(false);
      expect(pillenTraekkerSig(side, { faerdig: true })).toBe(false);
    }
  });
});
