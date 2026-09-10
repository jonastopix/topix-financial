/**
 * src/lib/budgetSignalInput.ts — budgetteret omsætning til forsidens dom
 * (#119, 10/9-2026). Ren funktion, testet i __tests__/budgetSignalInput.test.ts.
 *
 * HVAD DOMMEN GØR MED TALLET (virksomhedsSignaler.ts:331-344, urørt): kun
 * når seneste facts er FRISKE (perioden inden for de sidste tre måneder),
 * har omsætning, og budgettet findes og ikke er 0 — så regnes
 * (faktisk − budget) / |budget|. Over 10 % til hver side giver ét signal i
 * «Stikker ud»: «Omsætning N % under/over budgetteret», alvor 50 under og
 * 40 over — de laveste i køen (under omsætningsfald 80 og resultatfald 70,
 * fordi det er afvigelse fra en PLAN, ikke fra virkeligheden). 10 % er
 * husets tærskel for «markant afvigelse» også i budgettets egen flade
 * (budgetTone.ts). Mangler budgettet: budgetOmsaetning null → intet signal
 * — aldrig et signal om nul.
 *
 * OPSLAGET spejler virksomhedssiden (VirksomhedView.bygSignalInput):
 * budget_targets med category 'omsaetning' i base-scenariet, nøglen
 * «{år}-base-{månedsindeks 0-11}» for senestes periode.
 *
 * ESTIMATER (data_basis-kontrakten): et budget mod en /12-række fra
 * årsrapporten er en plan mod en regnekonstruktion. Er seneste række et
 * estimat, gives dommen null — samme greb som M/M-gaten (momErGyldig) i
 * forsidens fodring. Virksomhedssiden gør det ikke i dag; det er noteret,
 * ikke rettet her.
 */

export interface BudgetRaekke {
  company_id: string;
  period: string;
  category: string;
  budget_amount: number | null;
}

/** «2026-07» → «2026-base-6». null for en ugyldig nøgle. */
export function budgetNoegleFor(periodKey: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey ?? "");
  if (!m) return null;
  const maaned = parseInt(m[2], 10);
  if (maaned < 1 || maaned > 12) return null;
  return `${m[1]}-base-${maaned - 1}`;
}

/** Budgetteret omsætning for én virksomheds seneste periode — eller null. */
export function budgetOmsaetningFor(
  budgetter: readonly BudgetRaekke[],
  companyId: string,
  senestePeriodKey: string | null | undefined,
  senesteBasis: "measured" | "estimated" | null | undefined,
): number | null {
  if (senesteBasis !== "measured") return null;
  const noegle = budgetNoegleFor(senestePeriodKey);
  if (!noegle) return null;
  const r = budgetter.find((b) => b.company_id === companyId && b.period === noegle && b.category === "omsaetning");
  // 0 er ikke et budget at måle mod (motoren ville også springe det over) — null, aldrig et signal om nul.
  return r && r.budget_amount != null && Number.isFinite(r.budget_amount) && r.budget_amount !== 0 ? r.budget_amount : null;
}
