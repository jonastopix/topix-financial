/**
 * financialAnalysis — AI-analysens typer og rene domme, udskilt som REN
 * FLYTNING fra AIFinancialAnalysis.tsx (design-blok hb-ai-design.md,
 * godkendt 2026-08-05). Funktionskroppene er de ordret flyttede;
 * maskinen (queries/generate/messages) bor i useFinancialAnalysis.
 * Ingen supabase-imports her — filen skal kunne testes rent i vitest.
 */

export interface KeyFinding {
  title: string;
  analysis: string;
  recommendation: string;
  severity: "positiv" | "advarsel" | "kritisk";
}

export interface TrendItem {
  title: string;
  description: string;
  metric: string;
  period: string;
}

export interface AnalysisData {
  overview: string;
  key_findings: KeyFinding[];
  positive_trends: TrendItem[];
  challenges: TrendItem[];
  strategic_questions: string[];
  next_steps: string[];
}

export interface PeriodOption {
  period_key: string;
  period_label: string;
}

export interface DataSufficiency {
  sufficient: boolean;
  populatedCoreCount: number;
}

export const CORE_FIELDS = ["revenue", "gross_profit", "ebt"] as const;

// Sorteret KOPI af nøglefund efter alvor (kritisk → advarsel → positiv).
// Rører aldrig originalen; index som tie-breaker sikrer stabil rækkefølge
// inden for samme alvor.
export function sortFindings(findings: KeyFinding[] | undefined): KeyFinding[] {
  if (!findings) return [];
  const order: Record<string, number> = { kritisk: 0, advarsel: 1, positiv: 2 };
  return [...findings]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => ((order[a.f.severity] ?? 9) - (order[b.f.severity] ?? 9)) || (a.i - b.i))
    .map(x => x.f);
}

// Auto-select: first period with commentary, or first available period
export function deriveEffectivePeriod(
  selectedPeriodKey: string | null,
  availablePeriods: PeriodOption[],
  commentaries: { period_key: string }[],
): string | null {
  if (selectedPeriodKey) return selectedPeriodKey;
  const withCommentary = availablePeriods.find(p =>
    commentaries.some(c => c.period_key === p.period_key)
  );
  return withCommentary?.period_key || availablePeriods[0]?.period_key || null;
}

// Check data sufficiency for the selected period
export function deriveDataSufficiency(fact: { metrics?: unknown } | undefined): DataSufficiency {
  if (!fact?.metrics) return { sufficient: false, populatedCoreCount: 0 };
  const metrics = fact.metrics as Record<string, unknown>;
  const populatedCoreCount = CORE_FIELDS.filter(k => metrics[k] != null).length;
  return { sufficient: populatedCoreCount >= 3, populatedCoreCount };
}

// Default-fold: åbn alle kritiske fund (eller det første hvis ingen kritiske).
export function deriveDefaultExpanded(sortedFindings: KeyFinding[]): number[] {
  if (sortedFindings.length === 0) return [];
  const criticalIdx = sortedFindings
    .map((f, i) => (f.severity === "kritisk" ? i : -1))
    .filter(i => i >= 0);
  return criticalIdx.length > 0 ? criticalIdx : [0];
}
