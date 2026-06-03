/**
 * Shared post-commit propagation for committed report facts.
 *
 * After a successful `commit_report_facts` RPC, the exact same set of cache
 * invalidations and downstream edge-function invokes must fire regardless of
 * which surface triggered the commit:
 *  - ReportReviewDialog ("Godkend data" / "Opdater committed data" / "Erstat")
 *  - "Ret data manuelt" -> "Gem og anvend" (apply commits immediately)
 *
 * The `commit_report_facts` RPC call and the success toast stay in the caller
 * (toast wording differs per surface). This helper only handles propagation so
 * the dashboard, KPIs, AI analysis and alerts update exactly like a normal commit.
 */
import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

export interface PropagateReportCommitParams {
  queryClient: QueryClient;
  companyId: string | null | undefined;
  reportId: string;
  periodKey: string | null | undefined;
  periodLabel: string | null | undefined;
  metricsPreview: Record<string, number> | null | undefined;
}

export function propagateReportCommit(params: PropagateReportCommitParams): void {
  const { queryClient, companyId, reportId, periodKey, periodLabel, metricsPreview } = params;

  queryClient.invalidateQueries({ queryKey: ["company-facts"] });
  queryClient.invalidateQueries({ queryKey: ["report-commit-states"] });
  queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
  queryClient.invalidateQueries({ queryKey: ["financial-reports-chart"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
  queryClient.invalidateQueries({ queryKey: ["advisor-dashboard"] });

  // Notify advisors that member has approved their report — non-blocking
  supabase.functions.invoke("send-slack-report-notification", {
    body: {
      event: "report_committed",
      reportId,
      periodLabel: periodLabel || null,
    },
  }).catch((notifErr) => {
    console.warn("Commit notification failed (non-blocking):", notifErr);
  });

  // Auto-generate AI financial analysis — non-blocking, with deferred invalidation
  supabase.functions.invoke("generate-financial-commentary", {
    body: {
      company_id: companyId,
      period_key: periodKey,
    },
  }).then(() => {
    // Invalidate AFTER generation completes so the UI shows the result immediately
    queryClient.invalidateQueries({ queryKey: ["company-commentaries", companyId] });
    queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
  }).catch((err) => {
    console.warn("Commentary generation failed (non-blocking):", err);
    // Still invalidate so stale UI clears
    queryClient.invalidateQueries({ queryKey: ["company-commentaries", companyId] });
  });

  // Trigger company agent — analyses the new data and writes proactive insights
  supabase.functions.invoke("run-company-agent", {
    body: {
      company_id: companyId,
      trigger: "report_committed",
      period_key: periodKey,
      period_label: periodLabel || periodKey,
    },
  }).then(({ data, error }) => {
    if (error) {
      console.warn("Agent run failed (non-blocking):", error);
    } else if (!data?.ok) {
      console.warn("Agent run reported failure (non-blocking):", data?.error, data?.diagnostics);
    }
  }).catch((err) => {
    console.warn("Agent run failed (non-blocking):", err);
  });

  // Auto-generate weekly focus with full AI analysis — non-blocking
  supabase.functions.invoke("generate-weekly-focus", {
    body: { company_id: companyId },
  }).catch((err) => {
    console.warn("Weekly focus generation failed (non-blocking):", err);
  });

  // Auto-create baseline + budget on first report — non-blocking
  supabase.auth.getUser().then(({ data }) => {
    supabase.functions.invoke("auto-create-baseline-budget", {
      body: {
        company_id: companyId,
        period_key: periodKey,
        metrics: metricsPreview ?? {},
        user_id: data.user?.id,
      },
    }).catch((err) => console.warn("[reportCommit] auto-create-baseline-budget failed:", err));
  });

  // If alerts were detected, trigger a second focused agent run
  supabase.functions.invoke("detect-financial-alerts", {
    body: {
      company_id: companyId,
      period_key: periodKey,
      report_id: reportId,
    },
  }).then(async (alertResult) => {
    const alertData = alertResult.data;
    if (alertData?.alerts_written > 0) {
      supabase.functions.invoke("run-company-agent", {
        body: {
          company_id: companyId,
          trigger: "anomaly_detected",
          period_key: periodKey,
          period_label: periodLabel || periodKey,
        },
      }).catch((err) => console.warn("Anomaly agent failed:", err));
    }
  }).catch(() => {});
}
