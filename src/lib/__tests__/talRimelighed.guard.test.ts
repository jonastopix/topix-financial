import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (17/9-2026) for rimelighedsdommen — Jonas ordret «Enig med dig»
// til ~/Downloads/recon-tal-der-ikke-kan-passe.md §5 A + B. Fire domme:
//   1. MOTOREN (virksomhedsSignaler.ts): grænserne står som eksporterede
//      VALG (500 % / 1.000 kr. / 50.000 kr.), filhovedet siger dem højt med
//      Doggybeds tal ordret (7.656,76 mod 35), og talSerForkertUd dømmes FØR
//      tærsklen i budgetgrenen OG i begge MoM-grene; ét push med nøglen.
//   2. FORSIDEN (forsidensDom.ts): det forkerte tal får handlingen «Tjek
//      tallene for {navn}», ikke «Tag det op med».
//   3. VIRKSOMHEDSSIDEN (VirksomhedView.tsx): budgettet slås op gennem
//      forsidens budgetOmsaetningFor med data_basis; M/M gates med momErGyldig;
//      intet eget «-base-»-opslag tilbage.
//   4. HOOKEN (useVirksomhed.ts): budget_targets hentes gennem hentAlleSider
//      (.range) med company_id i select — ikke den uafgrænsede select.
// Selvbevis («VÆRNET VIRKER») kører hver dom på kopier med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const MOTOR = "src/lib/virksomhedsSignaler.ts";
const DOM = "src/lib/forsidensDom.ts";
const VIEW = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";
const HOOK = "src/hooks/useVirksomhed.ts";

/** Dom 1. `raa` er kilden MED kommentarer (filhovedet), `motor` uden. */
export const motorenDoemmerRimelighed = (raa: string, motor: string): boolean => {
  const budget = motor.slice(motor.indexOf("input.budgetOmsaetning !== 0) {"), motor.indexOf('noegle: under ? "budget_under" : "budget_over"'));
  const momOms = motor.slice(motor.indexOf("const pct = pctAendring(seneste.omsaetning, forrige.omsaetning);"), motor.indexOf('noegle: "omsaetningsfald_mom"'));
  const momRes = motor.slice(motor.indexOf("const pctRes = pctAendring(seneste.resultat_foer_skat, forrige.resultat_foer_skat);"), motor.indexOf('noegle: "resultatfald_mom"'));
  return (
    motor.includes("export const RIMELIGHED_PCT_MAX = 500;") &&
    motor.includes("export const RIMELIGHED_GRUNDLAG_MIN_KR = 1000;") &&
    motor.includes("export const RIMELIGHED_FAKTISK_MIN_KR = 50_000;") &&
    raa.includes("Doggybed") && raa.includes("7.656,76") && raa.includes("budget 35 kr.") && raa.includes("«Enig med dig»") &&
    budget.includes("if (talSerForkertUd(pct, input.budgetOmsaetning, seneste.omsaetning)) {") &&
    budget.indexOf("talSerForkertUd(") < budget.indexOf("BUDGET_TAERSKEL_PCT") &&
    momOms.includes("talSerForkertUd(pct, forrige.omsaetning, seneste.omsaetning)") &&
    momOms.indexOf("talSerForkertUd(") < momOms.indexOf("MOM_TAERSKEL_PCT") &&
    momRes.includes("talSerForkertUd(pctRes, forrige.resultat_foer_skat, seneste.resultat_foer_skat)") &&
    momRes.indexOf("talSerForkertUd(") < momRes.indexOf("MOM_TAERSKEL_PCT") &&
    (motor.match(/noegle: "tal_ser_forkert_ud",/g) ?? []).length === 1 &&
    motor.includes('| "tal_ser_forkert_ud"')
  );
};

/** Dom 2. */
export const forsidenTjekkerTallene = (dom: string): boolean =>
  dom.includes('handling = s.noegle === "tal_ser_forkert_ud" ? `Tjek tallene for ${v.navn}` : `Tag det op med ${v.navn}`;');

/** Dom 3 — dømt på blokken bygSignalInput (resten af siden har sine egne,
    lovlige «-base-»-opslag til budgetfanen). */
export const virksomhedssidenBrugerForsidensOpslag = (view: string): boolean => {
  const blok = view.slice(view.indexOf("function bygSignalInput("), view.indexOf("function findDerfor("));
  return (
    view.includes('import { budgetOmsaetningFor } from "@/lib/budgetSignalInput";') &&
    blok.includes("budgetOmsaetningFor(d.budgetter, d.company.id, seneste.period_key, seneste.data_basis)") &&
    blok.includes("forrigeFact: momErGyldig(facts) ? tilFactPunkt(forrige) : null,") &&
    !blok.includes("-base-") &&
    !/d\.budgetter\.find\(/.test(blok)
  );
};

/** Dom 4. */
export const hookenPaginererBudgettet = (hook: string): boolean => {
  const blok = hook.slice(hook.indexOf('hentAlleSider<{ company_id: string; period: string; category: string; budget_amount: number }>'), hook.indexOf('supabase\n      .from("milestones")'));
  return (
    hook.includes('import { hentAlleSider } from "@/lib/budgetEngine";') &&
    blok.includes('.from("budget_targets")') &&
    blok.includes('.select("company_id, period, category, budget_amount")') &&
    blok.includes(".range(fra, til)") &&
    !hook.includes('supabase.from("budget_targets").select("period, category, budget_amount")') &&
    hook.includes('budgetter: kraevRaekker(budgetRes, "budget_targets"),')
  );
};

describe("talRimelighed.guard — rimelighedsdommen i motoren, på forsiden, virksomhedssiden og i hooken", () => {
  const raa = laes(MOTOR);
  const motor = udenKommentarer(raa);
  const dom = udenKommentarer(laes(DOM));
  const view = udenKommentarer(laes(VIEW));
  const hook = udenKommentarer(laes(HOOK));

  it("1. motoren: grænserne som VALG, Doggybed ordret i filhovedet, talSerForkertUd før tærsklen i alle tre grene, ét push", () => {
    expect(motorenDoemmerRimelighed(raa, motor)).toBe(true);
  });
  it("2. forsiden: «Tjek tallene for {navn}» for det forkerte tal", () => {
    expect(forsidenTjekkerTallene(dom)).toBe(true);
  });
  it("3. virksomhedssiden: budgetOmsaetningFor med data_basis, momErGyldig på M/M, intet eget -base-opslag", () => {
    expect(virksomhedssidenBrugerForsidensOpslag(view)).toBe(true);
  });
  it("4. hooken: budget_targets gennem hentAlleSider med company_id og .range", () => {
    expect(hookenPaginererBudgettet(hook)).toBe(true);
  });
});

describe("talRimelighed.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const raa = laes(MOTOR);
  const motor = udenKommentarer(raa);
  const dom = udenKommentarer(laes(DOM));
  const view = udenKommentarer(laes(VIEW));
  const hook = udenKommentarer(laes(HOOK));

  it("1. budgetgrenen tilbage til den gamle form (procenten uanset størrelse), en anden grænse, eller Doggybed væk fra filhovedet, falder", () => {
    // Den gamle dom ordret (virksomhedsSignaler.ts:341-344 før 17/9).
    const gammel = motor
      .replace("if (talSerForkertUd(pct, input.budgetOmsaetning, seneste.omsaetning)) {", "if (false) {")
      .replace("} else if (Math.abs(pct) > BUDGET_TAERSKEL_PCT) {", "}\n    if (Math.abs(pct) > BUDGET_TAERSKEL_PCT) {");
    expect(gammel).not.toBe(motor);
    expect(motorenDoemmerRimelighed(raa, gammel)).toBe(false);
    expect(motorenDoemmerRimelighed(raa, motor.replace("export const RIMELIGHED_PCT_MAX = 500;", "export const RIMELIGHED_PCT_MAX = 5000;"))).toBe(false);
    expect(motorenDoemmerRimelighed(raa.split("7.656,76").join("…"), motor)).toBe(false);
    // M/M-grenen uden dommen.
    expect(motorenDoemmerRimelighed(raa, motor.replace("if (pct != null && talSerForkertUd(pct, forrige.omsaetning, seneste.omsaetning)) {", "if (false) {"))).toBe(false);
  });
  it("2. «Tag det op med» for det forkerte tal falder", () => {
    expect(forsidenTjekkerTallene(dom.replace('handling = s.noegle === "tal_ser_forkert_ud" ? `Tjek tallene for ${v.navn}` : `Tag det op med ${v.navn}`;', "handling = `Tag det op med ${v.navn}`;"))).toBe(false);
  });
  it("3. det gamle opslag (eget -base-, uden data_basis) eller M/M uden momErGyldig falder", () => {
    const gammelt = view.replace(
      "budgetOmsaetningFor(d.budgetter, d.company.id, seneste.period_key, seneste.data_basis)",
      'd.budgetter.find((b) => b.period === `${seneste.period_key.slice(0, 4)}-base-${parseInt(seneste.period_key.slice(5), 10) - 1}` && b.category === "omsaetning")?.budget_amount ?? null',
    );
    expect(virksomhedssidenBrugerForsidensOpslag(gammelt)).toBe(false);
    expect(virksomhedssidenBrugerForsidensOpslag(view.replace("forrigeFact: momErGyldig(facts) ? tilFactPunkt(forrige) : null,", "forrigeFact: tilFactPunkt(forrige),"))).toBe(false);
  });
  it("4. den uafgrænsede select, eller select uden company_id, falder", () => {
    const blokStart = hook.indexOf('hentAlleSider<{ company_id: string; period: string; category: string; budget_amount: number }>');
    const blokSlut = hook.indexOf('supabase\n      .from("milestones")');
    const uafgraenset = hook.slice(0, blokStart) + 'supabase.from("budget_targets").select("period, category, budget_amount").eq("company_id", companyId),\n    ' + hook.slice(blokSlut);
    expect(hookenPaginererBudgettet(uafgraenset)).toBe(false);
    expect(hookenPaginererBudgettet(hook.replace('.select("company_id, period, category, budget_amount")', '.select("period, category, budget_amount")'))).toBe(false);
  });
});
