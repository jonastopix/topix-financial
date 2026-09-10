import { describe, expect, it } from "vitest";
import {
  BRANCHE_PARAM,
  brancheOverskrift,
  brancherAf,
  filtrerPaaBranche,
  findSortering,
  laesBrancheParam,
  listeSti,
  SORTERINGER,
  sorterRaekker,
  STANDARD_SORTERING,
  tomBrancheTekst,
  type SorterbarRaekke,
} from "../branchefilter";

const R = (branche: string, navn = "x") => ({ branche, navn });

describe("brancherAf — kun brancher nogen faktisk har, med antal, alfabetisk", () => {
  it("tæller pr. branche, trimmer, udelader tomme, sorterer dansk (Ø efter Æ)", () => {
    const ud = brancherAf([R("Detailhandel"), R(" Detailhandel "), R("Økonomi"), R("Ærinder"), R(""), R("   "), R("Bygge og anlæg")]);
    expect(ud).toEqual([
      { branche: "Bygge og anlæg", antal: 1 },
      { branche: "Detailhandel", antal: 2 },
      { branche: "Ærinder", antal: 1 },
      { branche: "Økonomi", antal: 1 },
    ]);
  });

  it("tom liste → ingen brancher", () => {
    expect(brancherAf([])).toEqual([]);
  });
});

describe("filtrerPaaBranche", () => {
  const rows = [R("Detailhandel", "A"), R("Håndværk", "B"), R(" Detailhandel", "C"), R("", "D")];
  it("null → alle (ny liste, ikke samme reference)", () => {
    const ud = filtrerPaaBranche(rows, null);
    expect(ud).toEqual(rows);
    expect(ud).not.toBe(rows);
  });
  it("præcis label, trimmet på begge sider", () => {
    expect(filtrerPaaBranche(rows, "Detailhandel").map((r) => r.navn)).toEqual(["A", "C"]);
    expect(filtrerPaaBranche(rows, " Detailhandel ").map((r) => r.navn)).toEqual(["A", "C"]);
  });
  it("ukendt branche → tom", () => {
    expect(filtrerPaaBranche(rows, "Fiskeri")).toEqual([]);
  });
});

describe("URL'en — ?branche= ved siden af ?grund= og ?puls=", () => {
  it("laesBrancheParam: trim, tom → null", () => {
    expect(BRANCHE_PARAM).toBe("branche");
    expect(laesBrancheParam("Detailhandel")).toBe("Detailhandel");
    expect(laesBrancheParam(" Detailhandel ")).toBe("Detailhandel");
    expect(laesBrancheParam("")).toBeNull();
    expect(laesBrancheParam("  ")).toBeNull();
    expect(laesBrancheParam(null)).toBeNull();
    expect(laesBrancheParam(undefined)).toBeNull();
  });

  it("listeSti: grund og branche kan stå sammen — «tavse inden for detailhandel»", () => {
    expect(listeSti({ grund: "tavshed", branche: "Detailhandel" })).toBe("/virksomheder?grund=tavshed&branche=Detailhandel");
    expect(listeSti({ puls: "tavse", branche: "Bygge og anlæg" })).toBe("/virksomheder?puls=tavse&branche=Bygge+og+anl%C3%A6g");
  });

  it("listeSti: uden filtre → listen; null/undefined ignoreres", () => {
    expect(listeSti({})).toBe("/virksomheder");
    expect(listeSti({ grund: null, puls: undefined, branche: null })).toBe("/virksomheder");
    // «Fjern branche» = samme sti uden branche, med grund bevaret
    expect(listeSti({ grund: "tavshed", branche: null })).toBe("/virksomheder?grund=tavshed");
  });
});

describe("teksterne", () => {
  it("brancheOverskrift: ental og flertal", () => {
    expect(brancheOverskrift("Detailhandel", 1)).toBe("Detailhandel · 1 virksomhed");
    expect(brancheOverskrift("Detailhandel", 4)).toBe("Detailhandel · 4 virksomheder");
    expect(brancheOverskrift("Detailhandel", 0)).toBe("Detailhandel · 0 virksomheder");
  });
  it("tomBrancheTekst: søgning, forsidens udsnit, ellers branchen alene", () => {
    expect(tomBrancheTekst("Detailhandel", { iUdsnit: false, soegning: "" })).toBe("Ingen virksomheder inden for Detailhandel");
    expect(tomBrancheTekst("Detailhandel", { iUdsnit: true, soegning: "" })).toBe("Ingen af forsidens virksomheder er inden for Detailhandel");
    expect(tomBrancheTekst("Detailhandel", { iUdsnit: true, soegning: " nille " })).toBe('Ingen virksomheder inden for Detailhandel matcher "nille"');
  });
});

describe("sorteringen — navn, sidste kontakt, sidste rapportering; tomme altid sidst", () => {
  const rows: (SorterbarRaekke & { id: string })[] = [
    { id: "a", navn: "Ærø Både", sidsteKontaktDage: 3, sidsteRapporteringKey: "2026-06" },
    { id: "b", navn: "Alfa", sidsteKontaktDage: null, sidsteRapporteringKey: "2026-08" },
    { id: "c", navn: "Zeta", sidsteKontaktDage: 0, sidsteRapporteringKey: null },
    { id: "d", navn: "Beta", sidsteKontaktDage: 40, sidsteRapporteringKey: "2025-12" },
  ];
  const ids = (s: ReturnType<typeof findSortering>) => sorterRaekker(rows, s).map((r) => r.id);

  it("standard er navn A–Å med dansk sortering (Ærø efter Zeta)", () => {
    expect(STANDARD_SORTERING.id).toBe("navn");
    expect(ids(findSortering("navn"))).toEqual(["b", "d", "c", "a"]);
    expect(findSortering("findes-ikke")).toBe(STANDARD_SORTERING);
    expect(findSortering(null)).toBe(STANDARD_SORTERING);
  });

  it("sidste kontakt nyeste først: 0, 3, 40 dage — ingen dialog sidst", () => {
    expect(ids(findSortering("kontakt_nyeste"))).toEqual(["c", "a", "d", "b"]);
  });

  it("sidste kontakt længst siden først: 40, 3, 0 — ingen dialog STADIG sidst", () => {
    expect(ids(findSortering("kontakt_aeldste"))).toEqual(["d", "a", "c", "b"]);
  });

  it("sidste rapportering nyeste først: 2026-08, 2026-06, 2025-12 — ingen rapportering sidst", () => {
    expect(ids(findSortering("rapport_nyeste"))).toEqual(["b", "a", "d", "c"]);
  });

  it("sidste rapportering ældste først: 2025-12, 2026-06, 2026-08 — ingen rapportering STADIG sidst", () => {
    expect(ids(findSortering("rapport_aeldste"))).toEqual(["d", "a", "b", "c"]);
  });

  it("er stabil og ændrer ikke input; navn er sekundær nøgle ved lige værdier", () => {
    const lige = [
      { id: "y", navn: "Yrsa", sidsteKontaktDage: 5, sidsteRapporteringKey: null },
      { id: "x", navn: "Xavier", sidsteKontaktDage: 5, sidsteRapporteringKey: null },
    ];
    expect(sorterRaekker(lige, findSortering("kontakt_nyeste")).map((r) => r.id)).toEqual(["x", "y"]);
    expect(lige.map((r) => r.id)).toEqual(["y", "x"]);
  });

  it("SORTERINGER har unikke id'er og fem valg", () => {
    expect(new Set(SORTERINGER.map((s) => s.id)).size).toBe(SORTERINGER.length);
    expect(SORTERINGER).toHaveLength(5);
  });
});
