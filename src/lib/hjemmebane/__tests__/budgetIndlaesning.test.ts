import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BUDGET_FINDES_TEKST,
  BUDGET_HENTEFEJL_TEKST,
  budgetVisning,
  domFoerTomSkrivning,
} from "@/lib/hjemmebane/budgetIndlaesning";

// analyse-medlemsrejse 30/9 §2.6: en fejlet hentning viste «Byg dit budget»
// til et medlem MED budget, og tom-tilstandens skriveveje kunne overskrive
// det rigtige budget.

const base = { dbLoaded: true, hentefejl: false, harScenarieData: false, harSkabelon: false };

describe("budgetVisning — henter · fejlet · tom · budget", () => {
  it("fejlet hentning er ALDRIG tom (fejlen fra analysen)", () => {
    expect(budgetVisning({ ...base, hentefejl: true })).toBe("fejlet");
    expect(budgetVisning({ ...base, hentefejl: true, dbLoaded: false })).toBe("fejlet");
  });

  it("lykket hentning uden data og uden skabelon → tom", () => {
    expect(budgetVisning(base)).toBe("tom");
  });

  it("før indlæsningen er afsluttet → henter", () => {
    expect(budgetVisning({ ...base, dbLoaded: false })).toBe("henter");
  });

  it("data i fladen → budget, uanset de andre flag", () => {
    expect(budgetVisning({ ...base, harScenarieData: true })).toBe("budget");
    expect(budgetVisning({ ...base, harScenarieData: true, hentefejl: true, dbLoaded: false })).toBe("budget");
  });

  it("valgt skabelon uden data er ikke tom", () => {
    expect(budgetVisning({ ...base, harSkabelon: true })).toBe("henter");
  });
});

describe("domFoerTomSkrivning — værnet før første skrivning", () => {
  it("kun loadBudgets empty=true er tomt", () => {
    expect(domFoerTomSkrivning({ empty: true })).toBe("tom");
    expect(domFoerTomSkrivning({ empty: false })).toBe("findes");
  });

  it("teksterne siger det rolige og det farlige", () => {
    expect(BUDGET_HENTEFEJL_TEKST).toMatch(/kunne ikke hentes/);
    expect(BUDGET_HENTEFEJL_TEKST).toMatch(/Intet er slettet/);
    expect(BUDGET_FINDES_TEKST).toMatch(/overskrevet/);
  });
});

// Kildeværn: fladen skal gå gennem dommen og værnet.
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
const VIEW = udenKommentarer(
  readFileSync(resolve(process.cwd(), "src/components/hjemmebane/budget/BudgetteringView.tsx"), "utf8"),
);

describe("BudgetteringView — kildeværn", () => {
  it("en fejlet loadBudget sætter hentefejl", () => {
    expect(VIEW).toMatch(/catch \(e\) \{[^}]*setHentefejl\(true\)/);
  });

  it("tom-tilstanden afgøres af budgetVisning, ikke af dbLoaded alene", () => {
    expect(VIEW).toMatch(/budgetVisning\(\{/);
    expect(VIEW).not.toMatch(/isEmptyState\s*=\s*dbLoaded/);
  });

  it("tom-tilstandens tre veje åbnes kun gennem værnet", () => {
    expect(VIEW).toMatch(/onClick=\{\(\) => void vaelgTomVej\(card\.key\)\}/);
    expect(VIEW).not.toMatch(/onClick=\{\(\) => setEmptyFlow\(card\.key\)\}/);
    expect(VIEW).toMatch(/domFoerTomSkrivning\(frisk\)/);
  });

  it("fejltilstanden har «Prøv igen» og ingen byg-knap", () => {
    const blok = VIEW.slice(VIEW.indexOf('visning === "fejlet" &&'), VIEW.indexOf("isEmptyState && ("));
    expect(blok).toMatch(/Prøv igen/);
    expect(blok).not.toMatch(/Byg dit budget|vaelgTomVej|setEmptyFlow/);
  });

  it("selvbevis: værnet ville fælde den gamle linje", () => {
    const gammel = "const isEmptyState = dbLoaded && !selectedTemplate && !scenarioData;";
    expect(gammel).toMatch(/isEmptyState\s*=\s*dbLoaded/);
  });
});
