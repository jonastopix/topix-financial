/**
 * useCompanyFacts — fetches committed financial facts for a company.
 *
 * Facts are sorted deterministically by period_key only.
 * created_at / committed_at do NOT affect user-facing ordering.
 *
 * Parity debug mode: set localStorage.FACTS_PARITY_DEBUG = '1' to enable
 * a parallel legacy fetch + console comparison. Fully off by default —
 * no double-fetch, no console noise.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";

export interface CompanyFact {
  id: string;
  period_key: string;
  period_label: string;
  source_report_id: string;
  source_type: string;
  metrics: Record<string, number>;
  committed_at: string;
}

function parseMetrics(raw: Json): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number") out[k] = v;
  }
  return out;
}

const PARITY_DEBUG =
  typeof window !== "undefined" &&
  localStorage.getItem("FACTS_PARITY_DEBUG") === "1";

export function useCompanyFacts(overrideCompanyId?: string) {
  const { user, companyId: authCompanyId } = useAuth();
  const companyId = overrideCompanyId ?? authCompanyId;

  const query = useQuery({
    queryKey: ["company-facts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_report_facts")
        .select(
          "id, period_key, period_label, source_report_id, source_type, metrics, committed_at"
        )
        .eq("company_id", companyId!)
        .order("period_key", { ascending: true });
      if (error) throw error;

      return (data || []).map((row) => ({
        ...row,
        metrics: parseMetrics(row.metrics),
      })) as CompanyFact[];
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60_000,
  });

  // ── Parity debug (fully off unless explicit localStorage flag) ──
  useQuery({
    queryKey: ["company-facts-parity-debug", companyId],
    queryFn: async () => {
      if (!PARITY_DEBUG || !query.data) return null;

      const { getEffectiveKeyFigures, getEffectiveReportPeriodKey } = await import(
        "@/lib/financialUtils"
      );

      const { data: reports } = await (supabase
        .from("financial_reports")
        .select(
          "id, report_period, extracted_data, normalized_data, status, manual_report_period_key, manual_normalized_data, manual_override_status"
        ) as any)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("status", "processed");

      if (!reports) return null;

      const { factsToDanishMetrics } = await import("@/lib/factsAdapter");

      const factsMap = new Map(
        query.data.map((f) => [f.period_key, factsToDanishMetrics(f.metrics)])
      );

      let mismatches = 0;
      for (const r of reports) {
        const key = getEffectiveReportPeriodKey(r);
        const kf = getEffectiveKeyFigures(r);
        if (!key || !kf) continue;
        const factKf = factsMap.get(key);
        if (!factKf) {
          console.warn(`[FACTS_PARITY] Missing fact for period ${key}`);
          mismatches++;
          continue;
        }
        for (const [dk, dv] of Object.entries(kf)) {
          const fv = factKf[dk];
          if (fv == null && dv != null) {
            console.warn(`[FACTS_PARITY] ${key}.${dk}: fact=null legacy=${dv}`);
            mismatches++;
          } else if (fv != null && dv != null && Math.abs(fv - dv) > 0.01) {
            console.warn(
              `[FACTS_PARITY] ${key}.${dk}: fact=${fv} legacy=${dv}`
            );
            mismatches++;
          }
        }
      }
      if (mismatches === 0) {
        console.info("[FACTS_PARITY] ✅ Zero mismatches");
      } else {
        console.warn(`[FACTS_PARITY] ⚠️ ${mismatches} mismatches found`);
      }
      return null;
    },
    enabled: PARITY_DEBUG && !!query.data && query.data.length > 0,
    staleTime: Infinity,
  });

  return query;
}
