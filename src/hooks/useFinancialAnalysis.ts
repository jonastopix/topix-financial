/**
 * useFinancialAnalysis — AI-analysens maskine, udskilt som REN FLYTNING
 * fra AIFinancialAnalysis.tsx (design-blok hb-ai-design.md, godkendt
 * 2026-08-05). Ejer queries, periodeopløsningen, generate-flowet og
 * messages-idempotensen — skrivevejen til samtalen har ÉN sandhed her og
 * må aldrig duplikeres i visningslag.
 *
 * Hook'en ejer INGEN toasts: kvittering/fejl går som værdier via
 * onGenerated/onError, så gamle komponent kan beholde sine toasts 1:1 og
 * Hb-laget kan kvittere stille (Mola). Funktionskroppene er de ordret
 * flyttede; eneste afvigelser er de tre toast-linjer → callbacks samt
 * memo-kroppe der kalder de ordret flyttede lib-domme (financialAnalysis).
 */
import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { useCompanyCommentary, generateCommentary } from "@/hooks/useCompanyCommentary";
import { supabase } from "@/integrations/supabase/client";
import {
  deriveDataSufficiency,
  deriveEffectivePeriod,
  sortFindings,
  type AnalysisData,
} from "@/lib/financialAnalysis";

export interface UseFinancialAnalysisArgs {
  conversationId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  /** Controlled valgt periode (parent ejer den; null = auto-vælg seneste herinde) */
  selectedPeriodKey?: string | null;
  onSelectPeriod?: (key: string) => void;
  /** Succes-kvittering (gamle komponent: toast.success("Analyse genereret")) */
  onGenerated?: () => void;
  /** Fejl som værdi — dækker både "Ingen periode valgt." og catch-grenen */
  onError?: (message: string) => void;
}

export function useFinancialAnalysis({
  conversationId,
  companyId,
  userId,
  selectedPeriodKey = null,
  onSelectPeriod,
  onGenerated,
  onError,
}: UseFinancialAnalysisArgs) {
  const queryClient = useQueryClient();
  const { data: facts = [] } = useCompanyFacts(companyId ?? undefined);
  const { data: commentaries = [], isLoading: commentariesLoading } = useCompanyCommentary(companyId ?? undefined);

  const [loading, setLoading] = useState(false);
  const [needsMoreData, setNeedsMoreData] = useState(false);

  // Available periods from committed facts (sorted descending)
  const availablePeriods = useMemo(() => {
    return [...facts]
      .sort((a, b) => b.period_key.localeCompare(a.period_key))
      .map(f => ({
        period_key: f.period_key,
        period_label: f.period_label,
      }));
  }, [facts]);

  // Auto-select: first period with commentary, or first available period
  const effectivePeriodKey = useMemo(
    () => deriveEffectivePeriod(selectedPeriodKey, availablePeriods, commentaries),
    [selectedPeriodKey, availablePeriods, commentaries],
  );

  // Get commentary for selected period
  const currentCommentary = useMemo(() => {
    if (!effectivePeriodKey) return null;
    return commentaries.find(c => c.period_key === effectivePeriodKey) || null;
  }, [commentaries, effectivePeriodKey]);

  const analysis = useMemo(() => {
    if (!currentCommentary?.analysis) return null;
    return currentCommentary.analysis as unknown as AnalysisData;
  }, [currentCommentary]);

  const sortedFindings = useMemo(() => sortFindings(analysis?.key_findings), [analysis]);

  const isStale = currentCommentary?.is_stale ?? false;

  // Check data sufficiency for the selected period
  const dataSufficiency = useMemo(() => {
    if (!effectivePeriodKey) return { sufficient: false, populatedCoreCount: 0 };
    return deriveDataSufficiency(facts.find(f => f.period_key === effectivePeriodKey));
  }, [effectivePeriodKey, facts]);

  const currentPeriodLabel = useMemo(() => {
    const p = availablePeriods.find(p => p.period_key === effectivePeriodKey);
    return p?.period_label || effectivePeriodKey || "";
  }, [availablePeriods, effectivePeriodKey]);

  const handleGenerate = async (periodKey?: string) => {
    const targetPeriod = periodKey || effectivePeriodKey;
    if (!targetPeriod || !companyId) {
      onError?.("Ingen periode valgt.");
      return;
    }

    setLoading(true);
    setNeedsMoreData(false);
    if (periodKey) onSelectPeriod?.(periodKey);

    try {
      const result = await generateCommentary(companyId, targetPeriod);

      // Handle needs_more_data response from edge function
      if ((result as any)?.needs_more_data) {
        setNeedsMoreData(true);
        setLoading(false);
        return;
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["company-commentaries", companyId] });

      // (default-fold for nøglefund styres af visningslagene via sortedFindings)

      // C2 (docs/chat-design.md, besluttet 31/8): AI-analysen skrives
      // IKKE længere som besked i chatten — analysen bor i KPI-/
      // rapporterings-fladerne (company_commentaries), og chatten skal
      // ikke bære kvitteringer for den.

      onGenerated?.();
    } catch (e: any) {
      console.error("Commentary generation error:", e);
      onError?.(e.message || "Kunne ikke generere analyse");
    } finally {
      setLoading(false);
    }
  };

  return {
    availablePeriods,
    effectivePeriodKey,
    currentPeriodLabel,
    analysis,
    sortedFindings,
    isStale,
    dataSufficiency,
    needsMoreData,
    loading,
    commentariesLoading,
    handleGenerate,
  };
}
