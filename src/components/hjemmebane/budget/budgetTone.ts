/** Budgettets tone-domme (budget-design §b2/§b3): kpiTone-mønstret — én
    dom, flere visninger. Kalibrering (Mola): favorable = quiet (ingen
    fejring); afvigelser = attention, ALDRIG alert — attention bæres af
    hb-rust på tal/tekst, aldrig ikoner eller alert-farver. Formlen arver
    varianceColor/-Icons retningsbevidsthed og 10 %-tærskel
    (BudgetHelpers.tsx:77-93) — alarmsproget (destructive/AlertTriangle)
    arves ikke. Cash-runway-trappen (BudgetCashflowTab.tsx:196-203: ≥6/≥3)
    går gennem samme kalibrering. */

export interface BudgetToneInput {
  budget: number;
  actual: number | null;
  isRevenue: boolean;
}

export interface BudgetToneView {
  state: "favorable" | "near" | "off" | "no_actual";
  tone: "quiet" | "attention";
  /** Afvigelse i % af |budget| (fortegnsbevidst); null uden realiseret tal.
      Arvet randadfærd: budget = 0 ⇒ pct 0 (og dermed aldrig "off"). */
  pct: number | null;
}

export function deriveBudgetTone({ budget, actual, isRevenue }: BudgetToneInput): BudgetToneView {
  if (actual == null) return { state: "no_actual", tone: "quiet", pct: null };
  const diff = isRevenue ? actual - budget : budget - actual;
  const pct = budget !== 0 ? (diff / Math.abs(budget)) * 100 : 0;
  if (diff >= 0) return { state: "favorable", tone: "quiet", pct };
  if (Math.abs(pct) > 10) return { state: "off", tone: "attention", pct };
  return { state: "near", tone: "attention", pct };
}

export interface RunwayToneView {
  state: "solid" | "stram" | "kritisk" | "none";
  tone: "quiet" | "attention";
}

/** Runway-dommen: ≥6 mdr = solid (quiet), ≥3 = stram (attention),
    derunder = kritisk (attention — hb-rust, ikke alert). */
export function deriveRunwayTone(runwayMonths: number | null): RunwayToneView {
  if (runwayMonths == null) return { state: "none", tone: "quiet" };
  if (runwayMonths >= 6) return { state: "solid", tone: "quiet" };
  if (runwayMonths >= 3) return { state: "stram", tone: "attention" };
  return { state: "kritisk", tone: "attention" };
}
