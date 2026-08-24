import * as fs from "fs";
import * as path from "path";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

// budgetEngine importerer supabase-klienten på modul-niveau; rundturen her
// er ren logik uden netværk — klienten mockes væk (budgetEngine.test.ts-
// præcedensen; uden mock giver auth-klientens storage en unhandled rejection).
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { laesMatrix, type Matrix } from "@/lib/importEngine";
import { byggGitter, raekkeGruppe } from "@/lib/importGitterModel";
import { byggSkriveplan, byggSkriveplanInserts, tolkKolonner, udledAar } from "@/lib/importSkrivning";
import { decodeBudgetRows } from "@/lib/budgetEngine";

/**
 * GOLDEN: download-skabelonerne mod motoren (feat/budget-skabelon +
 * feat/skabelon-webshop-b2c).
 *
 * Hver skabelon (public/skabeloner/*.xlsx; fixtures er byte-identiske
 * kopier) er bygget for at ramme motoren PRÆCIST: ét ark, ingen tomme
 * rækker, instruktionslinje uden cifre, header i række 2 med
 * "Januar 2026"…"December 2026", seks sektioner og kun postlinjer — ingen
 * totaler, marginer eller nøgletal. Hjælperen fylder skabelonen med
 * syntetiske tal i hukommelsen og beviser at en udfyldt skabelon
 * importerer perfekt: ingen bemærkninger, ingen advarsler, ingen valg.
 * Fejler noget her, er det et FUND i skabelonen (eller en motor-ændring
 * der rammer den) — ret skabelonen, ikke testen.
 */

const ARK = "Budget 2026";

const MAANEDSKOLONNER = [
  "Januar 2026", "Februar 2026", "Marts 2026", "April 2026", "Maj 2026", "Juni 2026",
  "Juli 2026", "August 2026", "September 2026", "Oktober 2026", "November 2026", "December 2026",
];

/** Skabelonen som rå matrix (uudfyldt). */
function skabelonMatrix(filnavn: string): Matrix {
  const sti = path.resolve(__dirname, "../__fixtures__", filnavn);
  const wb = XLSX.read(fs.readFileSync(sti), { type: "buffer" });
  return XLSX.utils.sheet_to_json(wb.Sheets[ARK], { header: 1, raw: true, defval: null }) as Matrix;
}

/**
 * Udfyldt skabelon: syntetiske tal i hukommelsen — ægte tal (numbers), som
 * SheetJS ville levere dem fra et udfyldt ark. Omsætning positiv,
 * omkostninger negative (skabelonernes egen instruktion i række 1).
 * Værdierne er lineære i (række, måned) med FORSKELLIG månedskoefficient
 * pr. række-antal, så ingen række kan ramme en bloksum i alle tolv
 * kolonner ved et tilfælde — subtotal-/total-værnene har intet at finde.
 */
function udfyldtMatrix(
  filnavn: string,
  sektioner: Record<string, string>,
): { matrix: Matrix; antalPoster: number } {
  const matrix = skabelonMatrix(filnavn);
  let antalPoster = 0;
  let aktuelSektion = "";
  for (let r = 2; r < matrix.length; r++) {
    const etiket = String(matrix[r][0] ?? "");
    if (etiket in sektioner) {
      aktuelSektion = etiket;
      continue;
    }
    antalPoster++;
    const erIndtaegt = sektioner[aktuelSektion] === "indtaegter";
    for (let m = 0; m < 12; m++) {
      const beloeb = 1000 + r * 137 + m * 11;
      matrix[r][1 + m] = erIndtaegt ? beloeb * 10 : -beloeb;
    }
  }
  return { matrix, antalPoster };
}

/** Fælles golden-krav for én skabelon — samme bevis for dem alle. */
function bevisSkabelon(args: {
  navn: string;
  filnavn: string;
  sektioner: Record<string, string>;
  antalLinjer: number;
}) {
  const { navn, filnavn, sektioner, antalLinjer } = args;

  describe(`golden: udfyldt ${navn} importerer perfekt`, () => {
    const { matrix, antalPoster } = udfyldtMatrix(filnavn, sektioner);
    const res = laesMatrix(matrix);
    const g = byggGitter(res);

    it("præcis ét bord med headeren i række 2 (0-indekseret 1)", () => {
      expect(res.tabeller).toHaveLength(1);
      expect(res.tabeller[0].headerRaekke).toBe(1);
      expect(res.tabeller[0].foersteDataRaekke).toBe(2);
    });

    it("kolonnenavnene er de tolv månedsnavne med 2026", () => {
      expect(g.kolonner).toEqual(MAANEDSKOLONNER);
    });

    it("udledAar giver præcis ['2026'] — medlemmet vælger intet år", () => {
      expect(udledAar(tolkKolonner(g.kolonner))).toEqual(["2026"]);
    });

    it(`${antalLinjer} gitterrækker, alle medtag: true`, () => {
      expect(antalPoster).toBe(antalLinjer);
      expect(g.raekker).toHaveLength(antalLinjer);
      expect(g.raekker.every((r) => r.medtag)).toBe(true);
    });

    it("NUL bemærkninger på nogen række", () => {
      expect(
        g.raekker.filter((r) => r.bemaerkning !== null).map((r) => [r.etiket, r.bemaerkning]),
      ).toEqual([]);
    });

    it("NUL advarsler på gitteret", () => {
      expect(g.advarsler).toEqual([]);
    });

    it("hver sektion får sin rigtige gruppe", () => {
      expect(g.struktur.filter((s) => s.slags === "sektion").map((s) => s.etiket)).toEqual(
        Object.keys(sektioner),
      );
      for (const [sektion, gruppe] of Object.entries(sektioner)) {
        expect(g.sektionsGrupper[sektion], sektion).toBe(gruppe);
      }
    });

    it("INGEN linje flipper ud af sin sektions gruppe (linjegættet er enigt eller tavst)", () => {
      for (const raekke of g.raekker) {
        const forventet = sektioner[raekke.sektion ?? ""];
        expect(raekkeGruppe(g, raekke), `${raekke.sektion} / ${raekke.etiket}`).toBe(forventet);
      }
    });

    it("skriveplanen: intet sprunget over, intet utolket, intet årsskifte", () => {
      const plan = byggSkriveplan(g, "2026");
      expect(plan.raekker).toHaveLength(antalLinjer);
      expect(plan.sprungetOverKolonner).toEqual([]);
      expect(plan.utolkedeKolonner).toEqual([]);
      expect(plan.aarsskift).toBeNull();
      // Ingen fordelinger — alle kolonner er rene måneder.
      expect(plan.raekker.every((r) => r.fordelinger.length === 0)).toBe(true);
    });

    it("rundturen: inserts → decodeBudgetRows giver etiketter og grupper ordret tilbage", () => {
      const plan = byggSkriveplan(g, "2026");
      const inserts = byggSkriveplanInserts({ userId: "u", companyId: "c", plan });
      const decoded = decodeBudgetRows(
        inserts.map(({ category, budget_amount, period }) => ({ category, budget_amount, period })),
        "2026",
      );
      const baseRows = decoded.scenarioData.base;
      expect(plan.raekker).toHaveLength(antalLinjer);
      for (const raekke of plan.raekker) {
        const row = baseRows.find((r) => r.key === raekke.noegle);
        expect(row, raekke.noegle).toBeDefined();
        expect(row!.label, raekke.noegle).toBe(raekke.etiket);
        expect(row!.group, raekke.noegle).toBe(raekke.gruppe);
      }
    });
  });

  describe(`golden: den TOMME ${navn} giver aldrig en fejlside (P1)`, () => {
    it("laesMatrix og byggGitter kaster ikke; gitteret er tomt og fladen falder til det tomme gitter", () => {
      // Uudfyldt: alle talceller er null. Motoren læser den uden at kaste;
      // hver linje er uden indhold og bliver støj (ingen senere række har
      // tal, så selv sektionerne er støj) → 0 gitterrækker. HbBudgetImport
      // (aabnMatrix) falder ved 0 rækker til tomtGitter() med noten "Vi
      // fandt ingen linjer i filen — skriv dine tal direkte i tabellen…" —
      // medlemmet lander i det redigerbare gitter, aldrig i en fejlside.
      const res = laesMatrix(skabelonMatrix(filnavn));
      const g = byggGitter(res);
      expect(g.raekker).toHaveLength(0);
    });
  });
}

bevisSkabelon({
  navn: "generisk budgetskabelon",
  filnavn: "budget-skabelon-2026.xlsx",
  sektioner: {
    "OMSÆTNING": "indtaegter",
    "VARIABLE OMKOSTNINGER": "variable",
    "PERSONALE": "personale",
    "SALG & MARKETING": "salg_marketing",
    "LOKALER": "faste",
    "DRIFT": "drift",
  },
  antalLinjer: 27,
});

bevisSkabelon({
  navn: "webshop (B2C)-skabelon",
  filnavn: "budget-skabelon-webshop-b2c-2026.xlsx",
  sektioner: {
    "OMSÆTNING": "indtaegter",
    "VAREFORBRUG": "variable",
    "PERSONALE": "personale",
    "MARKETING": "salg_marketing",
    "LOKALER": "faste",
    "DRIFT": "drift",
  },
  antalLinjer: 31,
});
