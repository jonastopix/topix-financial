import { describe, expect, it } from "vitest";
import { DAG1_LINJE, dagensTekst, hilsenLinje, nyeTingTekst } from "@/lib/hjemmebane/forsideHilsen";

/* Hilsenens linje (forside PR 2, 17/9): dagen i dansk tid + «N nye ting siden
   sidst» (flyttet op fra båndet); dag 1 én fast sætning. */

const TORSDAG = new Date("2026-09-17T06:46:00Z"); // 08:46 dansk
const SENT = new Date("2026-09-17T22:30:00Z"); // 18/9 00:30 dansk — dagen skifter ved dansk midnat

describe("dagensTekst", () => {
  it("ugedag med stort og dato uden år, i dansk tid", () => {
    expect(dagensTekst(TORSDAG)).toBe("Torsdag 17. september");
    expect(dagensTekst(SENT)).toBe("Fredag 18. september");
    // 31/12 23:30 UTC er 1/1-2027 00:30 dansk — og 1. januar 2027 er en fredag.
    expect(dagensTekst(new Date("2026-12-31T23:30:00Z"))).toBe("Fredag 1. januar");
  });
});

describe("nyeTingTekst", () => {
  it("0 og ugyldigt → null; 1 ental; flere flertal", () => {
    expect(nyeTingTekst(0)).toBeNull();
    expect(nyeTingTekst(-1)).toBeNull();
    expect(nyeTingTekst(NaN)).toBeNull();
    expect(nyeTingTekst(1)).toBe("1 ny ting siden sidst");
    expect(nyeTingTekst(3)).toBe("3 nye ting siden sidst");
  });
});

describe("hilsenLinje", () => {
  it("dag 1 (tjeklisten ikke færdig): den faste sætning — uanset nyt", () => {
    expect(hilsenLinje({ nu: TORSDAG, nyeTing: 3, dag1: true })).toBe(DAG1_LINJE);
    expect(DAG1_LINJE).toBe("Du er inde. Her er de tre ting der giver mest den første uge.");
  });
  it("etableret: dagen · nye ting; uden nyt kun dagen", () => {
    expect(hilsenLinje({ nu: TORSDAG, nyeTing: 3, dag1: false })).toBe("Torsdag 17. september · 3 nye ting siden sidst");
    expect(hilsenLinje({ nu: TORSDAG, nyeTing: 0, dag1: false })).toBe("Torsdag 17. september");
  });
});
