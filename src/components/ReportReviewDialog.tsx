import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
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
import { Loader2, CheckCircle2, AlertCircle, ShieldAlert, RefreshCw } from "lucide-react";
import { formatDKK } from "@/lib/financialUtils";

interface ReportReviewDialogProps {
  reportId: string;
  reportLabel: string;
  cardState: string; // 'ready' | 'update_available'
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  can_commit: boolean;
  state: string;
  state_reason: string | null;
}

// Canonical EN → Danish display labels
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
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const queryClient = useQueryClient();

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
    }
    if (!open) {
      setPreview(null);
      setError(null);
    }
  }, [open, reportId, loadPreview]);

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
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Fejl ved commit", description: err.message || "Ukendt fejl", variant: "destructive" });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {cardState === "update_available" ? (
              <RefreshCw className="h-5 w-5 text-primary" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            )}
            {cardState === "update_available" ? "Opdater committed data" : "Godkend data"}
          </DialogTitle>
          <DialogDescription>{reportLabel}</DialogDescription>
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

        {preview && !loading && (
          <div className="space-y-4">
            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={preview.eligible ? "default" : "destructive"}>
                {preview.eligible ? "Eligible" : "Ikke eligible"}
              </Badge>
              {preview.source_type && (
                <Badge variant="secondary">
                  {SOURCE_LABELS[preview.source_type] || preview.source_type}
                </Badge>
              )}
              {preview.validation_status && (
                <Badge variant="outline">{preview.validation_status}</Badge>
              )}
            </div>

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
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">Periode ejet af anden rapport</p>
                  {preview.state_reason && (
                    <p className="text-xs text-destructive/80 mt-0.5">{preview.state_reason}</p>
                  )}
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
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Metrics preview
                </h4>
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
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing}>
            Annuller
          </Button>
          {preview?.can_commit && (
            <Button onClick={handleCommit} disabled={committing}>
              {committing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {preview.ownership_state === "same_report" ? "Opdater committed data" : "Godkend data"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
