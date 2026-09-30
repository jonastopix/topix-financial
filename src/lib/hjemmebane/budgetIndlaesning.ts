/**
 * src/lib/hjemmebane/budgetIndlaesning.ts
 *
 * Budgetfladens tilstand: henter · fejlet · tom · budget — og værnet før
 * den første skrivning fra tom-tilstanden. Rene funktioner, testet i
 * __tests__/budgetIndlaesning.test.ts.
 *
 * FEJLEN (analyse-medlemsrejse 30/9 §2.6, målt i koden 30/9):
 * BudgetteringView fangede en kastet loadBudget (hentAlleSider kaster ved
 * hentefejl), loggede den og satte `dbLoaded = true` i `finally`. Så blev
 * `isEmptyState = dbLoaded && !selectedTemplate && !scenarioData` sand, og
 * et medlem MED budget så «Kom i gang — Byg dit budget». Tom-tilstandens
 * tre veje skriver alle i budget_targets: skabelonen (writeTemplateMarker →
 * saveScenarioEdits, der sletter årets `<år>-<scenarie>-`-rækker før
 * insert), Excel-importen (confirmImportFraSkriveplan sletter årets
 * base-rækker) og «fra regnskab» (confirmBudgetFromAccounts sletter
 * næste års base-rækker og __template__). Det rigtige budget kunne
 * overskrives.
 *
 * TO VÆRN:
 * 1. Tom og fejlet er to tilstande (husets mønster, hentefejl.ts): en
 *    fejlet hentning viser en fejllinje med «Prøv igen» og INGEN byg-knap.
 * 2. Før tom-tilstandens første skridt (valget af en af de tre veje, som
 *    er den eneste indgang til dens skriveveje) hentes budgettet frisk.
 *    Findes der rækker, spørges medlemmet eksplicit, før vejen åbnes; en
 *    fejl ved tjekket er en fejl (tilstand 1), aldrig «tomt».
 */

export type BudgetVisning = "henter" | "fejlet" | "tom" | "budget";

export interface BudgetVisningInput {
  /** Indlæsningen er afsluttet (lykkedes ELLER fejlede). */
  dbLoaded: boolean;
  /** Den seneste indlæsning (eller tjekket før skrivning) fejlede. */
  hentefejl: boolean;
  /** Der er et budget i fladen (scenarioData ≠ null). */
  harScenarieData: boolean;
  /** En skabelon er valgt i fladen. */
  harSkabelon: boolean;
}

/**
 * ÉN dom for fladen. Rækkefølgen er bærende:
 *  - budget først: står tallene i fladen, vises de (en fejlet genhentning
 *    nulstiller dem før den prøver, så det sker kun ved data i hånden).
 *  - fejlet før tom: en fejl må ALDRIG se ud som et tomt budget.
 *  - tom kun når indlæsningen er LYKKEDES uden data og uden valgt skabelon.
 */
export function budgetVisning(input: BudgetVisningInput): BudgetVisning {
  if (input.harScenarieData) return "budget";
  if (input.hentefejl) return "fejlet";
  if (input.dbLoaded && !input.harSkabelon) return "tom";
  return "henter";
}

/** Fejllinjen ved en fejlet hentning — rolig, siger hvad og at intet er tabt. */
export const BUDGET_HENTEFEJL_TEKST =
  "Dit budget kunne ikke hentes lige nu. Intet er slettet — prøv igen om lidt.";

/**
 * Dommen før tom-tilstandens første skrivning. `empty` er loadBudgets
 * egen dom: true KUN når virksomheden ingen budget_targets-rækker har
 * (alle år, alle markører). Alt andet — også en enkelt markør — er
 * «findes»: hellere én bekræftelse for meget end et overskrevet budget.
 */
export function domFoerTomSkrivning(resultat: { empty: boolean }): "tom" | "findes" {
  return resultat.empty ? "tom" : "findes";
}

/** Teksten, når tjekket finder et budget, fladen ikke viste. */
export const BUDGET_FINDES_TEKST =
  "Der ligger allerede et gemt budget for din virksomhed. Fortsætter du, kan de gemte tal blive overskrevet, og de kan ikke gendannes.";
