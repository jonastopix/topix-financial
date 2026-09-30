/**
 * useBoardroomScore — læser grundlaget for Boardroom Score med medlemmets
 * egen RLS og kører den rene motor (src/lib/boardroomScore, design i
 * docs/boardroom-score.md). Ingen migration, ingen ny tabel, ingen flade.
 *
 * Fire kilder, alle eksisterende:
 *   - financial_report_facts (period_key, data_basis, metrics, created_at) —
 *     created_at er FØRSTE godkendelse; committed_at overskrives ved
 *     gen-godkendelse og bruges ikke. Egen hentning (useCompanyFacts
 *     vælger ikke created_at), samme policy.
 *   - companies.contract_start_date — afgrænser disciplin og streak.
 *   - budget_targets: findes mindst én værdirække for indeværende år?
 *     (base-scenariet, period «YYYY-base-idx»; markører har ikke den form.)
 *   - kpi_targets: findes mindst én række?
 *
 * Fejl er en fejl (husets regel): hver hentning kaster HentningsFejl med
 * kildens navn — et fejlet kald må ikke ligne «ingen tal» og give en
 * disciplin på 0.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { HentningsFejl, kraevRaekker } from "@/lib/kraevRaekker";
import { kbhDele } from "@/lib/hverdage";
import { boardroomScore, type ScoreDom, type ScoreGrundlag, type ScoreMaaned } from "@/lib/boardroomScore";
import type { Json } from "@/integrations/supabase/types";

function parseMetrics(raw: Json): Record<string, number | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (v === null) out[k] = null;
  }
  return out;
}

export const boardroomScoreKey = (companyId: string | undefined) => ["boardroom-score", "grundlag", companyId] as const;

/** Henter grundlaget som én query (fire kald), så fladen får ÉN isLoading/isError. */
export async function hentScoreGrundlag(companyId: string, nu: Date): Promise<ScoreGrundlag> {
  const aar = kbhDele(nu).aar;

  const facts = kraevRaekker(
    await supabase
      .from("financial_report_facts")
      .select("period_key, data_basis, metrics, created_at")
      .eq("company_id", companyId)
      .order("period_key", { ascending: true }),
    "financial_report_facts",
  );

  const virksomhed = await supabase.from("companies").select("contract_start_date").eq("id", companyId).maybeSingle();
  if (virksomhed.error) throw new HentningsFejl("companies", virksomhed.error.message);

  // Én værdirække i base-scenariet for året rækker («YYYY-base-idx»). Markørerne
  // (__template__/__label__/__group__/__fravalgt__) bærer skabelonnøgle, label
  // eller gruppe i `period` og rammes ikke af mønstret — samme filter som
  // rådgiverforsidens budgetafvigelse (AdvisorDashboard, «%-base-%»).
  const budget = await supabase
    .from("budget_targets")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .like("period", `${aar}-base-%`);
  if (budget.error) throw new HentningsFejl("budget_targets", budget.error.message);

  const maal = await supabase.from("kpi_targets").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if (maal.error) throw new HentningsFejl("kpi_targets", maal.error.message);

  const maaneder: ScoreMaaned[] = facts.map((f) => ({
    key: f.period_key,
    basis: f.data_basis === "estimated" ? "estimated" : "measured",
    foersteGodkendtAt: f.created_at ?? null,
    metrics: parseMetrics(f.metrics),
  }));

  return {
    maaneder,
    kontraktStart: (virksomhed.data as { contract_start_date?: string | null } | null)?.contract_start_date ?? null,
    harBudgetForAaret: (budget.count ?? 0) > 0,
    harMaal: (maal.count ?? 0) > 0,
  };
}

export function useBoardroomScore(overrideCompanyId?: string): {
  dom: ScoreDom | null;
  grundlag: ScoreGrundlag | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
} {
  const { user, companyId: authCompanyId } = useAuth();
  const companyId = overrideCompanyId ?? authCompanyId;

  const query = useQuery({
    queryKey: boardroomScoreKey(companyId),
    queryFn: () => hentScoreGrundlag(companyId!, new Date()),
    enabled: !!user && !!companyId,
    staleTime: 5 * 60_000,
  });

  // Dommen regnes i browseren af grundlaget — «nu» er indlæsningens tid (staleTime 5 min).
  const dom = useMemo(() => (query.data ? boardroomScore(query.data, new Date()) : null), [query.data]);

  return { dom, grundlag: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error };
}
