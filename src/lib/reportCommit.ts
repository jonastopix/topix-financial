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

/**
 * Suppresses the report review email fallback once a report is committed.
 *
 * At upload time extract-financial-data writes an action_required notification
 * asking the founder to review and approve the extracted numbers. A 15-minute
 * pg_cron emails it if it is still unseen and un-emailed. There are TWO variants
 * for the same report, distinguished by dedup_key:
 *   report_review_ready:<reportId>  ("gennemgaa dine tal", numbers auto-extracted)
 *   report_manual_entry:<reportId>  ("indtast tal manuelt", extraction failed)
 * Once the report is committed, both ask for something the founder has just done,
 * so both fallback mails are pure noise. We mark the email side handled on both.
 *
 * SAMME mekanisme bruges ved SLETNING af en rapport (alle soft-delete-sites i
 * Reports.tsx + ReportReviewDialog.handleReplace): en slettet rapports
 * review-mail er lige så meningsløs som en committets. Bemærk at dette er
 * best-effort/RLS-scoped (fejlspor 2026-07-22: advisor-sletning af andres
 * rapporter rammer 0 rækker) — den autoritative gate er server-side i
 * send-notification-email via notificationEmailSelection (defence-in-depth).
 *
 * We deliberately set email_sent_at (NOT seen_at): it suppresses ONLY the
 * fallback mail and leaves the in-app notification state untouched. The reminder
 * still fires for reports the founder has NOT committed (deferred approval,
 * advisor-upload) because we set the field only on an actual commit. Other
 * notification types for the same report (report_error, financial alerts) are
 * untouched.
 *
 * Owner-scoped + idempotent: RLS ("Users update own notifications") limits the
 * update to the committing founder's own rows; the dedup_key list targets exactly
 * this report's two review notifications, and `email_sent_at IS NULL` makes a
 * re-commit a no-op. Non-blocking: a failure never breaks the commit. Frontend
 * only, no RLS or migration change.
 */
export async function clearReportReviewNotification(reportId: string): Promise<void> {
  if (!reportId) return;
  try {
    await supabase
      .from("notifications")
      .update({ email_sent_at: new Date().toISOString() } as never)
      .in("dedup_key", [
        `report_review_ready:${reportId}`,
        `report_manual_entry:${reportId}`,
      ])
      .is("email_sent_at", null);
  } catch (err) {
    console.warn("[reportCommit] clearReportReviewNotification failed (non-blocking):", err);
  }
}

export function propagateReportCommit(params: PropagateReportCommitParams): void {
  const { queryClient, companyId, reportId, periodKey, periodLabel, metricsPreview } = params;

  queryClient.invalidateQueries({ queryKey: ["company-facts"] });
  queryClient.invalidateQueries({ queryKey: ["report-commit-states"] });
  queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
  queryClient.invalidateQueries({ queryKey: ["financial-reports-chart"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
  queryClient.invalidateQueries({ queryKey: ["advisor-dashboard"] });

  // C2 (docs/chat-design.md, besluttet 31/8): rapportkvitteringen i
  // chatten skrives IKKE længere — en rapport hører til i Rapportering
  // og KPI'er, ikke i en samtale. postReportCardMessage er fjernet.

  // Report is now reviewed + committed: suppress the "report_review_ready" email
  // fallback so the founder is not asked to review what they just approved.
  clearReportReviewNotification(reportId).catch((err) =>
    console.warn("[reportCommit] clear review notification failed (non-blocking):", err)
  );

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
      dry_run: false,
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
          dry_run: false,
        },
      }).catch((err) => console.warn("Anomaly agent failed:", err));
    }
  }).catch(() => {});
}
