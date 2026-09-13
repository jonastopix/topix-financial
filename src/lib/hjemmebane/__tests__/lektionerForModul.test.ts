import { describe, expect, it } from "vitest";
import { hoererTilTekst, lektionerForModul, lektionsSti, type LektionRaekke } from "../lektionerForModul";

// Kort 56: koblingen lektion→handout fandtes kun envejs (content_items
// .handout_module læst af ElementView). Motoren her vender den om for
// handout-siden — og senere «Måske relevant for dig» — uden supabase.

const raekke = (over: Partial<LektionRaekke> & Pick<LektionRaekke, "id">): LektionRaekke => ({
  area: "classroom",
  slug: over.id,
  title: `Lektion ${over.id}`,
  status: "published",
  handout_module: null,
  position: 0,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("lektionerForModul", () => {
  it("finder de lektioner hvis handout_module matcher — og kun dem", () => {
    const katalog = [
      raekke({ id: "a", handout_module: "salg" }),
      raekke({ id: "b", handout_module: "marketing" }),
      raekke({ id: "c", handout_module: null }),
      raekke({ id: "d", handout_module: "salg" }),
    ];
    expect(lektionerForModul(katalog, "salg").map((l) => l.id)).toEqual(["a", "d"]);
    expect(lektionerForModul(katalog, "marketing").map((l) => l.id)).toEqual(["b"]);
  });

  it("giver tom liste ved intet match, tomt modul og ukendt modul", () => {
    const katalog = [raekke({ id: "a", handout_module: "salg" })];
    expect(lektionerForModul(katalog, "bogholderi")).toEqual([]);
    expect(lektionerForModul(katalog, null)).toEqual([]);
    expect(lektionerForModul(katalog, undefined)).toEqual([]);
    expect(lektionerForModul(katalog, "")).toEqual([]);
    expect(lektionerForModul(katalog, "findes-ikke")).toEqual([]);
    expect(lektionerForModul([], "salg")).toEqual([]);
  });

  it("udelader alt der ikke er published — en kladde bliver aldrig et link", () => {
    const katalog = [
      raekke({ id: "kladde", handout_module: "salg", status: "draft" }),
      raekke({ id: "arkiv", handout_module: "salg", status: "archived" }),
      raekke({ id: "live", handout_module: "salg" }),
    ];
    expect(lektionerForModul(katalog, "salg").map((l) => l.id)).toEqual(["live"]);
  });

  it("sorterer i forløbsrækkefølge: position, derefter created_at", () => {
    const katalog = [
      raekke({ id: "sen", handout_module: "salg", position: 2 }),
      raekke({ id: "y", handout_module: "salg", position: 1, created_at: "2026-02-01T00:00:00Z" }),
      raekke({ id: "x", handout_module: "salg", position: 1, created_at: "2026-01-15T00:00:00Z" }),
    ];
    expect(lektionerForModul(katalog, "salg").map((l) => l.id)).toEqual(["x", "y", "sen"]);
  });

  it("muterer ikke input og bevarer rækkens type", () => {
    const katalog = [
      raekke({ id: "b", handout_module: "salg", position: 2 }),
      raekke({ id: "a", handout_module: "salg", position: 1 }),
    ];
    const foer = katalog.map((l) => l.id);
    const svar = lektionerForModul(katalog, "salg");
    expect(katalog.map((l) => l.id)).toEqual(foer);
    expect(svar[0]).toBe(katalog[1]);
  });
});

describe("lektionsSti", () => {
  it("bygger ruten af area og slug — aldrig id (App.tsx /akademiet/:area/:slug)", () => {
    expect(lektionsSti({ area: "classroom", slug: "moms-og-fradrag" })).toBe(
      "/akademiet/classroom/moms-og-fradrag",
    );
  });
});

describe("hoererTilTekst", () => {
  it("bøjer efter antal og tier ved nul", () => {
    expect(hoererTilTekst(0)).toBeNull();
    expect(hoererTilTekst(1)).toBe("Hører til lektionen");
    expect(hoererTilTekst(2)).toBe("Hører til lektionerne");
    expect(hoererTilTekst(4)).toBe("Hører til lektionerne");
  });
});
