import { describe, expect, it } from "vitest";
import { ALLE_HAR_BOOKET, manglerAtBookeLinjer, MANGLER_OVERSKRIFT } from "@/lib/hjemmebane/manglerAtBookeBlok";
import type { OverbliksRaekke, SessionDom } from "@/lib/medlemsOverblik";

/** Forsidens «Mangler at booke» (29/9-2026): to linjer, tallet og navnene — intet andet. */
const NY = "2026-09-20T10:00:00Z", GAMMEL = "2026-06-01T10:00:00Z";
const dom = (raadgiver: "morten" | "jonas", status: SessionDom["status"]): SessionDom => ({ raadgiver, status, tid: null, retAt: null });
const r = (id: string, navn: string, m: SessionDom["status"], j: SessionDom["status"], medlemSiden: string | null) =>
  ({ companyId: id, navn, medlemSiden, sessioner: { morten: dom("morten", m), jonas: dom("jonas", j) } }) as unknown as OverbliksRaekke;

describe("manglerAtBookeLinjer", () => {
  it("overskriften og nul-ordet", () => {
    expect(MANGLER_OVERSKRIFT).toBe("Mangler at booke");
    expect(ALLE_HAR_BOOKET).toBe("Alle har booket.");
  });

  it("tæller gennem manglerAtBooke: Morten for alle, Jonas kun for nye — navne sorteret dansk", () => {
    const linjer = manglerAtBookeLinjer([
      r("1", "Ærø Cykler", "ikke_brugt", "ikke_brugt", NY),            // begge
      r("2", "Aarhus Is", "link_sendt", "ikke_omfattet", GAMMEL),      // kun Morten
      r("3", "Bager Hansen", "afholdt", "aflyst", NY),                 // kun Jonas
      r("4", "Citrus", "markeret_uden_booking", "ikke_brugt", GAMMEL), // ingen (gammel: Jonas tæller ikke)
      r("5", "Delta", "booket", "booket", NY),                         // ingen
      r("6", "Zeta", "aflyst", "afholdt", NY),                         // kun Morten
    ]);
    expect(linjer.map((l) => l.raadgiver)).toEqual(["morten", "jonas"]);
    expect(linjer[0]).toEqual({ raadgiver: "morten", tekst: "Morten-session: 3", virksomheder: [{ id: "6", navn: "Zeta" }, { id: "1", navn: "Ærø Cykler" }, { id: "2", navn: "Aarhus Is" }] });
    // Dansk sortering, som /virksomheder (localeCompare «da»): «Aa» er «Å» og står efter «Æ».
    expect(linjer[1]).toEqual({ raadgiver: "jonas", tekst: "Jonas-session: 2", virksomheder: [{ id: "3", navn: "Bager Hansen" }, { id: "1", navn: "Ærø Cykler" }] });
  });

  it("nul → «Alle har booket.» på linjen, uden navne", () => {
    const linjer = manglerAtBookeLinjer([r("1", "A", "afholdt", "ikke_omfattet", GAMMEL)]);
    expect(linjer.map((l) => l.tekst)).toEqual(["Morten-session: Alle har booket.", "Jonas-session: Alle har booket."]);
    expect(linjer.every((l) => l.virksomheder.length === 0)).toBe(true);
    expect(manglerAtBookeLinjer([]).map((l) => l.tekst)).toEqual(["Morten-session: Alle har booket.", "Jonas-session: Alle har booket."]);
  });

  it("ingen andre ord: ingen statusord, intet «ikke omfattet», ingen mærker", () => {
    const tekst = JSON.stringify(manglerAtBookeLinjer([r("1", "A", "ikke_brugt", "ikke_brugt", NY), r("2", "B", "aflyst", "link_sendt", NY)]).map((l) => l.tekst));
    expect(tekst).not.toMatch(/omfattet|aflyst|link|booket\b|trænger|mærke/i);
  });
});
