import { describe, expect, it } from "vitest";
import { budgetNoegleFor, budgetOmsaetningFor, type BudgetRaekke } from "@/lib/budgetSignalInput";
import { afgoerVirksomhedsSignaler, type VirksomhedsInput } from "@/lib/virksomhedsSignaler";

const budgetter: BudgetRaekke[] = [
  { company_id: "c1", period: "2026-base-6", category: "omsaetning", budget_amount: 100000 },
  { company_id: "c1", period: "2026-base-6", category: "loenninger", budget_amount: 30000 },
  { company_id: "c2", period: "2026-base-6", category: "omsaetning", budget_amount: 0 },
  { company_id: "c3", period: "2026-base-6", category: "omsaetning", budget_amount: null },
];

describe("budgetnøglen — samme form som virksomhedssiden", () => {
  it("2026-07 → 2026-base-6 (månedsindeks 0-11)", () => {
    expect(budgetNoegleFor("2026-07")).toBe("2026-base-6");
    expect(budgetNoegleFor("2026-01")).toBe("2026-base-0");
    expect(budgetNoegleFor("2026-12")).toBe("2026-base-11");
  });
  it("ugyldig nøgle → null", () => {
    expect(budgetNoegleFor("2026-13")).toBeNull();
    expect(budgetNoegleFor("x")).toBeNull();
    expect(budgetNoegleFor(null)).toBeNull();
  });
});

describe("budgetOmsaetningFor — intet budget er intet signal, aldrig et signal om nul", () => {
  it("målt seneste + budget i base-scenariet: tallet", () => {
    expect(budgetOmsaetningFor(budgetter, "c1", "2026-07", "measured")).toBe(100000);
  });
  it("kun kategorien omsaetning tæller", () => {
    expect(budgetOmsaetningFor(budgetter.filter((b) => b.category !== "omsaetning"), "c1", "2026-07", "measured")).toBeNull();
  });
  it("virksomhed uden budget → null", () => {
    expect(budgetOmsaetningFor(budgetter, "c9", "2026-07", "measured")).toBeNull();
  });
  it("budget 0 eller null i rækken → null (dommen ville ellers dividere med nul)", () => {
    expect(budgetOmsaetningFor(budgetter, "c2", "2026-07", "measured")).toBeNull();
    expect(budgetOmsaetningFor(budgetter, "c3", "2026-07", "measured")).toBeNull();
  });
  it("estimeret seneste række → null (en plan mod en /12-fiktion dømmes ikke)", () => {
    expect(budgetOmsaetningFor(budgetter, "c1", "2026-07", "estimated")).toBeNull();
    expect(budgetOmsaetningFor(budgetter, "c1", "2026-07", null)).toBeNull();
  });
});

describe("dommen — hvornår «stikker ud» udløser på budgettet (motoren urørt)", () => {
  const nu = new Date("2026-08-15T10:00:00Z");
  const input = (omsaetning: number, budget: number | null): VirksomhedsInput => ({
    senesteFact: { period_key: "2026-07", period_label: "Jul 2026", omsaetning, resultat_foer_skat: null, bank_balance: null },
    forrigeFact: null,
    senesteCommittedAt: null,
    budgetOmsaetning: budget,
    forfaldneMilestones: 0,
    loeftestaenger: 0,
    ulaesteBeskeder: 0,
    senesteBeskedAt: "2026-08-14T10:00:00Z",
    harCommittedeTal: true,
    agentforslagVenter: 0,
  });
  const budgetSignaler = (i: VirksomhedsInput) =>
    afgoerVirksomhedsSignaler(i, nu).filter((s) => s.noegle === "budget_under" || s.noegle === "budget_over");

  it("10 % under er IKKE nok (tærsklen er «over 10 %»); 11 % under giver ét signal, alvor 50", () => {
    expect(budgetSignaler(input(90000, 100000))).toHaveLength(0);
    const [s] = budgetSignaler(input(89000, 100000));
    expect(s).toMatchObject({ noegle: "budget_under", koe: "stikker_ud", alvor: 50, tekst: "Omsætning 11% under budgetteret" });
  });
  it("over budget giver også et signal, men lavere (40)", () => {
    const [s] = budgetSignaler(input(115000, 100000));
    expect(s).toMatchObject({ noegle: "budget_over", alvor: 40 });
  });
  it("intet budget: intet signal — og ikke et signal om nul", () => {
    expect(budgetSignaler(input(89000, null))).toHaveLength(0);
    expect(budgetSignaler(input(89000, 0))).toHaveLength(0);
  });
  it("ikke friske tal (perioden ældre end tre måneder): intet signal, uanset afvigelse", () => {
    const gammel = { ...input(50000, 100000), senesteFact: { ...input(50000, 100000).senesteFact!, period_key: "2026-03" } };
    expect(budgetSignaler(gammel)).toHaveLength(0);
  });
});
