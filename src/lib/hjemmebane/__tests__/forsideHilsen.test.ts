import { describe, expect, it } from "vitest";
import { DAG1_DOEGN, DAG1_LINJE, dagensTekst, erDag1, hilsenLinje, nyeTingTekst } from "@/lib/hjemmebane/forsideHilsen";

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

describe("erDag1 — medlemskabets start inden for 14 døgn (forside PR 3; før: tjeklisten ikke færdig)", () => {
  const nu = new Date("2026-09-17T10:00:00Z"); // 17/9 dansk
  const dageFoer = (n: number) => new Date(Date.UTC(2026, 8, 17 - n, 10)).toISOString().slice(0, 10);
  it("dag 0, 13 og 14 → dag 1; dag 15 → ikke", () => {
    expect(DAG1_DOEGN).toBe(14);
    expect(erDag1(dageFoer(0), nu)).toBe(true);
    expect(erDag1(dageFoer(13), nu)).toBe(true);
    expect(erDag1(dageFoer(14), nu)).toBe(true);
    expect(erDag1(dageFoer(15), nu)).toBe(false);
  });
  it("ingen startdato (legacy), ulæselig, eller start i fremtiden → ikke dag 1", () => {
    expect(erDag1(null, nu)).toBe(false);
    expect(erDag1(undefined, nu)).toBe(false);
    expect(erDag1("hest", nu)).toBe(false);
    expect(erDag1("2026-09-20", nu)).toBe(false);
  });
  it("dansk midnat afgør dagen: start 3/9 og nu 17/9 23:30 dansk (21:30 UTC) er dag 14; 18/9 00:30 dansk er dag 15", () => {
    expect(erDag1("2026-09-03", new Date("2026-09-17T21:30:00Z"))).toBe(true);
    expect(erDag1("2026-09-03", new Date("2026-09-17T22:30:00Z"))).toBe(false);
  });
  it("et tidsstempel som start (contract_start_date kan være date) læses som dansk kalenderdag", () => {
    expect(erDag1("2026-09-16T22:30:00Z", new Date("2026-09-17T10:00:00Z"))).toBe(true);
  });
});
