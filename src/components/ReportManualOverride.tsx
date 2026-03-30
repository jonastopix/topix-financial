import { useState, useEffect } from "react";
import { Pencil, Save, RotateCcw, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  type ReportData, hasManualOverride,
  getEffectiveMetrics, getEffectiveReportPeriodKey,
} from "@/lib/financialUtils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ALL_FIELDS,
  parseMonth,
  parseMetricValue,
  validateForApply,
  getOverrideSource,
  saveManualOverride,
  resetManualOverride,
} from "@/lib/reportOverrideHelpers";
import OverrideFormFields from "@/components/OverrideFormFields";

interface Props {
  report: ReportData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function ReportManualOverride({ report, open, onOpenChange, onSaved }: Props) {
  const { user, isAdvisor, isAdmin } = useAuth();
  const isApplied = hasManualOverride(report);
  const existingPeriodKey = getEffectiveReportPeriodKey(report);

  const initialMonth = parseMonth(report.manual_report_period_key ?? existingPeriodKey);

  const [reportType, setReportType] = useState(report.manual_report_type || report.report_type || "andet");
  const [month, setMonth] = useState(initialMonth.month);
  const [year, setYear] = useState(initialMonth.year);
  const [note, setNote] = useState(report.manual_override_note || "");
  const [metricInputs, setMetricInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Initialize metric inputs from current effective values
  useEffect(() => {
    if (open) {
      const manualMetrics = (report.manual_normalized_data as any)?.metrics;
      const existingMetrics = getEffectiveMetrics(report)?.metrics ?? {};
      const initMetrics: Record<string, string> = {};
      for (const f of ALL_FIELDS) {
        const manualVal = manualMetrics?.[f];
        const existingVal = existingMetrics[f];
        const val = manualVal ?? existingVal;
        initMetrics[f] = val != null ? String(val) : "";
      }
      setMetricInputs(initMetrics);
      setReportType(report.manual_report_type || report.report_type || "andet");
      const pm = parseMonth(report.manual_report_period_key ?? existingPeriodKey);
      setMonth(pm.month);
      setYear(pm.year);
      setNote(report.manual_override_note || "");
    }
  }, [open, report.id]);

  async function save(status: "draft" | "applied") {
    if (!user) return;

    if (status === "applied") {
      const err = validateForApply({ month, year, reportType, metricInputs, report });
      if (err) {
        toast.error("Validering", { description: err });
        return;
      }
    }

    setSaving(true);
    try {
      await saveManualOverride({
        reportId: report.id,
        userId: user.id,
        metricInputs,
        month,
        year,
        reportType,
        note,
        overrideSource: getOverrideSource(isAdmin, isAdvisor),
        status,
      });

      toast({
        title: status === "draft" ? "Kladde gemt" : "Korrektion anvendt",
        description: status === "applied"
          ? `Effektiv periode: ${month}/${year}`
          : "Kladde gemt — den bruges ikke i dashboards endnu.",
      });

      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Manual override save error:", err);
      toast({ title: "Fejl", description: "Kunne ikke gemme korrektionen.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!user) return;
    setSaving(true);
    try {
      await resetManualOverride({
        reportId: report.id,
        userId: user.id,
        overrideSource: getOverrideSource(isAdmin, isAdvisor),
      });

      toast({ title: "Nulstillet", description: "Rapporten bruger nu parserens data igen." });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Reset error:", err);
      toast({ title: "Fejl", description: "Kunne ikke nulstille.", variant: "destructive" });
    } finally {
      setSaving(false);
      setResetConfirm(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Ret data manuelt
            </SheetTitle>
            <SheetDescription>
              Korriger periode og nøgletal. Parserens originale data bevares.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            <OverrideFormFields
              reportType={reportType}
              onReportTypeChange={setReportType}
              month={month}
              onMonthChange={setMonth}
              year={year}
              onYearChange={setYear}
              metricInputs={metricInputs}
              onMetricChange={(field, value) => setMetricInputs(prev => ({ ...prev, [field]: value }))}
              note={note}
              onNoteChange={setNote}
            />

            {/* Actions */}
            <div className="space-y-3 pt-4 mt-6 border-t border-border">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => save("draft")}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Gem kladde
                </button>
                <button
                  onClick={() => save("applied")}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Gem og anvend
                </button>
              </div>

              {(isApplied || report.manual_override_status === "draft") && (
                <button
                  onClick={() => setResetConfirm(true)}
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Nulstil til parserdata
                </button>
              )}

              {report.manual_override_at && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Sidst rettet: {new Date(report.manual_override_at).toLocaleDateString("da-DK")} ·{" "}
                  {report.manual_override_source || "ukendt"}
                </p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={resetConfirm} onOpenChange={setResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nulstil til parserdata?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle manuelle korrektioner fjernes og rapporten bruger igen de automatisk udtrukne data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuller</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={saving}>
              {saving ? "Nulstiller..." : "Nulstil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
