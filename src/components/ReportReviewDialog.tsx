import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, ShieldAlert, RefreshCw, Pencil, X, AlertTriangle, Info } from "lucide-react";
import { formatDKK } from "@/lib/financialUtils";
import OverrideFormFields from "@/components/OverrideFormFields";
import {
  ALL_FIELDS,
  canonicalPreviewToDanishInputs,
  parseMonth,
  validateForApply,
  getOverrideSource,
  saveManualOverride,
} from "@/lib/reportOverrideHelpers";

interface ReportReviewDialogProps {
  reportId: string;
  reportLabel: string;
  cardState: string; // 'ready' | 'update_available'
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface QualitySignal {
  name: string;
  result: string; // 'PASS' | 'FAIL' | 'SKIP'
  details: string;
}

interface QualitySignalsPayload {
  canonical_checks?: QualitySignal[];
  validation_status?: string;
  [key: string]: unknown;
}

interface PreviewData {
  report_id: string;
  eligible: boolean;
  eligibility_reason: string | null;
  source_type: string | null;
  period_key: string | null;
  period_label: string | null;
  report_type: string | null;
  validation_status: string | null;
  metrics_preview: Record<string, number> | null;
  ownership_state: string | null;
  existing_owner_id: string | null;
  can_commit: boolean;
  state: string;
  state_reason: string | null;
  quality_signals: QualitySignalsPayload | null;
  extraction_contract_version: string | null;
}

// Canonical EN → Danish display labels (for read-only preview)
const METRIC_LABELS: Record<string, string> = {
  revenue: "Omsætning",
  gross_profit: "Dækningsbidrag",
  payroll: "Lønninger",
  cogs: "Direkte omkostninger",
  sales_costs: "Salgsomkostninger",
  facility_costs: "Lokaleomkostninger",
  admin_costs: "Administrationsomkostninger",
  depreciation: "Afskrivninger",
  ebt: "Resultat før skat",
  net_result: "Resultat efter skat",
  assets_total: "Aktiver i alt",
  equity_total: "Egenkapital",
  cash: "Bank/likvider",
  trade_receivables: "Debitorer",
  current_liabilities: "Kreditorer",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manuelt godkendt",
  canonical: "Automatisk udtræk",
};

export default function ReportReviewDialog({
  reportId,
  reportLabel,
  cardState,
  open,
  onOpenChange,
}: ReportReviewDialogProps) {
  const { user, isAdvisor, isAdmin } = useAuth();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const queryClient = useQueryClient();

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metricInputs, setMetricInputs] = useState<Record<string, string>>({});
  const [editMonth, setEditMonth] = useState(1);
  const [editYear, setEditYear] = useState(2026);
  const [editReportType, setEditReportType] = useState("andet");
  const [editNote, setEditNote] = useState("");

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_report_commit_preview", {
        p_report_id: reportId,
      });
      if (rpcError) throw rpcError;
      setPreview(data as unknown as PreviewData);
    } catch (err: any) {
      setError(err.message || "Kunne ikke hente preview");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  // Load preview reactively when dialog opens
  useEffect(() => {
    if (open && reportId) {
      loadPreview();
      setEditing(false);
    }
    if (!open) {
      setPreview(null);
      setError(null);
      setEditing(false);
    }
  }, [open, reportId, loadPreview]);

  // Auto-enter edit mode for needs_manual_entry reports (no extractable metrics)
  useEffect(() => {
    if (!open || !preview || loading) return;
    const needsManual = (preview.quality_signals as any)?.needs_manual_entry === true;
    const hasMetrics = preview.metrics_preview && Object.keys(preview.metrics_preview).length > 0;
    if (needsManual && !hasMetrics && !editing) {
      enterEditMode();
    }
  }, [open, preview, loading]);

  // Initialize edit form from preview data
  function enterEditMode() {
    if (!preview) return;
    const inputs = canonicalPreviewToDanishInputs(preview.metrics_preview);
    setMetricInputs(inputs);
    const pm = parseMonth(preview.period_key);
    setEditMonth(pm.month);
    setEditYear(pm.year);
    setEditReportType(preview.report_type || "andet");
    setEditNote("");
    setEditing(true);
  }

  function cancelEditMode() {
    setEditing(false);
  }

  // Save edits as manual override, then refresh preview
  async function handleSaveEdits() {
    if (!user || !preview) return;

    // We need a minimal ReportData for validation
    // For inline edit in review dialog, we construct a pseudo-report from preview
    const pseudoReport = {
      id: reportId,
      report_period: preview.period_label,
      extracted_data: null,
      status: "processed",
      report_type: preview.report_type || "andet",
      // No existing manual override when editing from preview for the first time
      manual_override_status: null,
      manual_normalized_data: null,
      manual_report_period_key: null,
    } as any;

    // Skip the "no changes" validation for review-dialog inline edits
    // because the user explicitly chose to edit — just validate numeric inputs
    for (const f of ALL_FIELDS) {
      const trimmed = (metricInputs[f] ?? "").trim();
      if (trimmed === "") continue;
      const cleaned = trimmed.replace(/\./g, "").replace(",", ".");
      if (isNaN(Number(cleaned))) {
        toast({ title: "Validering", description: `Ugyldigt tal i feltet`, variant: "destructive" });
        return;
      }
    }

    if (editMonth < 1 || editMonth > 12) {
      toast({ title: "Validering", description: "Ugyldig måned", variant: "destructive" });
      return;
    }
    if (editYear < 2000 || editYear > 2100) {
      toast({ title: "Validering", description: "Ugyldigt årstal", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await saveManualOverride({
        reportId,
        userId: user.id,
        metricInputs,
        month: editMonth,
        year: editYear,
        reportType: editReportType,
        note: editNote,
        overrideSource: getOverrideSource(isAdmin, isAdvisor),
        status: "applied",
      });

      toast({ title: "Rettelser gemt", description: "Data opdateret — preview genindlæses." });

      // Refresh preview to reflect the manual override
      await loadPreview();
      setEditing(false);

      // Invalidate report queries so cards update
      queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
      queryClient.invalidateQueries({ queryKey: ["report-commit-states"] });
    } catch (err: any) {
      console.error("Inline override save error:", err);
      toast({ title: "Fejl", description: "Kunne ikke gemme rettelser.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const handleCommit = async () => {
    setCommitting(true);
    try {
      const { error: commitError } = await supabase.rpc("commit_report_facts", {
        p_report_id: reportId,
      });
      if (commitError) throw commitError;

      toast({ title: "Data godkendt", description: `Periode ${preview?.period_label || ""} er nu committed.` });
      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["report-commit-states"] });
      queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
      queryClient.invalidateQueries({ queryKey: ["financial-reports-chart"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });

      // Notify advisors that member has approved their report
      try {
        await supabase.functions.invoke("send-slack-report-notification", {
          body: {
            event: "report_committed",
            reportId,
            periodLabel: preview?.period_label || null,
          },
        });
      } catch (notifErr) {
        // Non-blocking — commit already succeeded
        console.warn("Commit notification failed (non-blocking):", notifErr);
      }

      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Fejl ved commit", description: err.message || "Ukendt fejl", variant: "destructive" });
    } finally {
      setCommitting(false);
    }
  };

  // Handle replace: soft-delete old report owner, then commit this one
  const handleReplace = async () => {
    if (!preview?.existing_owner_id) return;
    setReplacing(true);
    try {
      // Soft-delete the old report that owns this period
      const { error: delErr } = await (supabase
        .from("financial_reports")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", preview.existing_owner_id) as any);
      if (delErr) throw delErr;

      // Now commit the new report
      const { error: commitError } = await supabase.rpc("commit_report_facts", {
        p_report_id: reportId,
      });
      if (commitError) throw commitError;

      toast({ title: "Data erstattet", description: `Gammel rapport arkiveret og nye data godkendt for ${preview?.period_label || ""}.` });
      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["report-commit-states"] });
      queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
      queryClient.invalidateQueries({ queryKey: ["financial-reports-chart"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });

      // Notify advisors that member has approved their report
      try {
        await supabase.functions.invoke("send-slack-report-notification", {
          body: {
            event: "report_committed",
            reportId,
            periodLabel: preview?.period_label || null,
          },
        });
      } catch (notifErr) {
        // Non-blocking — commit already succeeded
        console.warn("Commit notification failed (non-blocking):", notifErr);
      }

      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Fejl ved erstatning", description: err.message || "Ukendt fejl", variant: "destructive" });
    } finally {
      setReplacing(false);
    }
  };

  const isBlocked = preview && !preview.can_commit && preview.ownership_state === "other_report";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? (
              <Pencil className="h-5 w-5 text-primary" />
            ) : cardState === "update_available" ? (
              <RefreshCw className="h-5 w-5 text-primary" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            )}
            {editing
              ? "Ret data"
              : cardState === "update_available"
                ? "Opdater committed data"
                : "Godkend data"}
          </DialogTitle>
          <DialogDescription>Er tallene korrekte? Tjek at vi har læst din {reportLabel} rigtigt.</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <div className="flex items-center gap-2 font-medium mb-1">
              <AlertCircle className="h-4 w-4" />
              Fejl
            </div>
            {error}
          </div>
        )}

        {preview && !loading && !editing && (
          <div className="space-y-4">
            {/* Status */}
            {preview.eligible ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Vi har trukket tallene ud — kontrollér at de ser rigtige ud
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                Rapporten er ikke klar til godkendelse endnu
              </div>
            )}

            {/* Period & type info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Periode</p>
                <p className="text-sm font-medium text-foreground mt-0.5">
                  {preview.period_label || "—"}
                </p>
                {preview.period_key && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{preview.period_key}</p>
                )}
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Rapporttype</p>
                <p className="text-sm font-medium text-foreground mt-0.5 capitalize">
                  {preview.report_type || "—"}
                </p>
              </div>
            </div>

            {/* Ownership state */}
            {preview.ownership_state === "other_report" && (
              <div className="rounded-lg border border-amber-300/50 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Du har allerede godkendt tal for denne periode fra en anden rapport</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Du kan erstatte de gamle data med denne rapports data. Den gamle rapport arkiveres.
                  </p>
                </div>
              </div>
            )}

            {preview.ownership_state === "same_report" && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
                <RefreshCw className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm text-primary">
                  Denne rapport ejer allerede perioden — data opdateres ved commit.
                </p>
              </div>
            )}

            {!preview.eligible && preview.eligibility_reason && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">{preview.eligibility_reason}</p>
              </div>
            )}

            {/* Metrics preview */}
            {preview.metrics_preview && Object.keys(preview.metrics_preview).length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Metrics preview
                  </h4>
                  {preview.eligible && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={enterEditMode}>
                      <Pencil className="h-3 w-3" />
                      Ret data
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(preview.metrics_preview).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-border/50 bg-background/50 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {METRIC_LABELS[key] || key}
                      </p>
                      <p className="text-sm font-medium text-foreground mt-0.5">
                        {formatDKK(value as number)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quality signals for V2 reports */}
            {(() => {
              if (preview.extraction_contract_version !== 'v2' || !preview.quality_signals) return null;
              const checks: QualitySignal[] = preview.quality_signals.canonical_checks || [];
              if (checks.length === 0) return null;
              const hasWarnings = checks.some(s => s.result === 'FAIL');
              return (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Kvalitetssignaler
                  </h4>
                  <div className="space-y-1.5">
                    {checks.map((signal, idx) => {
                      const isFail = signal.result === 'FAIL';
                      const isPass = signal.result === 'PASS';
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                            isFail
                              ? 'border-amber-300/50 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-950/20'
                              : isPass
                                ? 'border-border/50 bg-background/50'
                                : 'border-border/30 bg-muted/20'
                          }`}
                        >
                          {isFail ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                          ) : isPass ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                          ) : (
                            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className={`font-medium ${isFail ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'}`}>
                              {signal.name}
                            </p>
                            {signal.details && (
                              <p className="text-muted-foreground mt-0.5">{signal.details}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {hasWarnings && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 italic">
                      Advarsler blokerer ikke godkendelse — gennemgå data før commit.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* "Ret data" button for blocked reports or when no metrics yet */}
            {preview.eligible && (!preview.metrics_preview || Object.keys(preview.metrics_preview).length === 0) && (
              <Button variant="outline" size="sm" className="gap-1" onClick={enterEditMode}>
                <Pencil className="h-3 w-3" />
                Ret data
              </Button>
            )}
          </div>
        )}

        {/* Edit mode: render shared OverrideFormFields */}
        {preview && !loading && editing && (
          <div className="space-y-4">
            {/* Manual entry info banner */}
            {(preview.quality_signals as any)?.needs_manual_entry === true && (
              <div className="space-y-3">
                <div className="rounded-lg border border-blue-200/60 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-950/20 p-3">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                    Vi kunne ikke læse dit dokument automatisk
                  </p>
                  <p className="text-xs text-blue-700/80 dark:text-blue-400/80">
                    {preview.metrics_preview && Object.keys(preview.metrics_preview).length > 0
                      ? "Vi fandt nogle tal — kontrollér at de er korrekte og ret dem der er forkerte."
                      : "Systemet genkendte ikke formatet. Indtast tallene nedenfor direkte fra din rapport."}
                  </p>
                </div>

                {preview.metrics_preview && Object.keys(preview.metrics_preview).length > 0 && (
                  <div className="rounded-lg border border-amber-200/60 bg-amber-50/40 dark:border-amber-800/30 dark:bg-amber-950/20 p-3">
                    <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
                      Usikre tal — kontrollér disse
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(preview.metrics_preview).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {METRIC_LABELS[key] || key}
                          </span>
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            {formatDKK(value as number)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(preview.quality_signals as any)?.needs_manual_entry === true
              && (!preview.metrics_preview || Object.keys(preview.metrics_preview).length === 0) && (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1.5">
                <p className="font-medium text-foreground">
                  Vi understøtter disse eksportformater:
                </p>
                <ul className="space-y-1">
                  <li>
                    <span className="font-medium text-foreground">e-conomic:</span>
                    {" "}Regnskab → Rapporter → <strong>Balance</strong> → Excel
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Dinero:</span>
                    {" "}Rapporter → Resultatopgørelse → CSV eller PDF
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Billy:</span>
                    {" "}Rapporter → Resultatopgørelse → Excel
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Andre:</span>
                    {" "}Udfyld tallene nedenfor manuelt — det tager 2 minutter
                  </li>
                </ul>
              </div>
            )}

            {/* Blocked warning in edit mode */}
            {isBlocked && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">Periode ejet af anden rapport</p>
                  {preview.state_reason && (
                    <p className="text-xs text-destructive/80 mt-0.5">{preview.state_reason}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Du kan rette data — men commit er først mulig når blokering er løst (fx ved periodeændring).
                  </p>
                </div>
              </div>
            )}

            {(preview.quality_signals as any)?.needs_manual_entry && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Felterne er delvist udfyldt fra vores bedste forsøg — kontrollér alle tal
              </p>
            )}

            <OverrideFormFields
              reportType={editReportType}
              onReportTypeChange={setEditReportType}
              month={editMonth}
              onMonthChange={setEditMonth}
              year={editYear}
              onYearChange={setEditYear}
              metricInputs={metricInputs}
              onMetricChange={(field, value) => setMetricInputs(prev => ({ ...prev, [field]: value }))}
              note={editNote}
              onNoteChange={setEditNote}
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          {/* Non-edit mode footer */}
          {!editing && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing || replacing}>
                Annuller
              </Button>
              {preview?.can_commit && (
                <Button onClick={handleCommit} disabled={committing}>
                  {committing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {preview.ownership_state === "same_report" ? "Opdater committed data" : "Godkend data"}
                </Button>
              )}
              {isBlocked && preview?.existing_owner_id && (
                <Button onClick={handleReplace} disabled={replacing} variant="default">
                  {replacing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Erstat gammel data
                </Button>
              )}
            </>
          )}

          {/* Edit mode footer: commit is HIDDEN */}
          {editing && (
            <>
              <Button variant="outline" onClick={cancelEditMode} disabled={saving}>
                <X className="mr-1 h-3.5 w-3.5" />
                Annuller redigering
              </Button>
              <Button onClick={handleSaveEdits} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gem rettelser
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
