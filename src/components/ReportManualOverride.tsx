import { useState, useMemo, useEffect } from "react";
import { Pencil, Save, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  DANISH_MONTHS, type ReportData, hasManualOverride,
  getEffectiveMetrics, getEffectiveReportPeriodKey,
} from "@/lib/financialUtils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  report: ReportData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const REPORT_TYPES = [
  { value: "resultatopgørelse", label: "Resultatopgørelse" },
  { value: "saldobalance", label: "Saldobalance" },
  { value: "andet", label: "Andet" },
];

const PNL_FIELDS = ["omsaetning", "daekningsbidrag", "loenninger", "resultat_foer_skat"];
const BALANCE_FIELDS = ["bank_balance", "debitorer", "kreditorer", "egenkapital", "aktiver_i_alt"];
const ALL_FIELDS = [...PNL_FIELDS, ...BALANCE_FIELDS];

const FIELD_LABELS: Record<string, string> = {
  omsaetning: "Omsætning",
  daekningsbidrag: "Dækningsbidrag",
  loenninger: "Lønninger",
  resultat_foer_skat: "Resultat f. skat",
  bank_balance: "Bank",
  debitorer: "Debitorer",
  kreditorer: "Kreditorer",
  egenkapital: "Egenkapital",
  aktiver_i_alt: "Aktiver i alt",
};


function parseMonth(key: string | null): { month: number; year: number } {
  if (!key) return { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
  const [y, m] = key.split("-").map(Number);
  return { month: m || 1, year: y || new Date().getFullYear() };
}

export default function ReportManualOverride({ report, open, onOpenChange, onSaved }: Props) {
  const { user, isAdvisor, isAdmin } = useAuth();
  const isApplied = hasManualOverride(report);
  const existingMetrics = getEffectiveMetrics(report)?.metrics ?? {};
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

  

  // Parse a metric input: empty/blank → null, number → number, invalid → undefined (error)
  function parseMetricValue(raw: string): number | null | undefined {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const cleaned = trimmed.replace(/\./g, "").replace(",", ".");
    const num = Number(cleaned);
    if (isNaN(num)) return undefined;
    return num;
  }

  // Validation for "Gem og anvend"
  function validateForApply(): string | null {
    if (month < 1 || month > 12) return "Ugyldig måned";
    if (year < 2000 || year > 2100) return "Ugyldigt årstal";

    // Check that at least one real override exists
    const periodChanged = (() => {
      const origKey = existingPeriodKey;
      const newKey = `${year}-${String(month).padStart(2, "0")}`;
      return origKey !== newKey;
    })();

    const hasMetricOverride = ALL_FIELDS.some(f => {
      const parsed = parseMetricValue(metricInputs[f] ?? "");
      if (parsed === undefined) return false;
      const origVal = existingMetrics[f] ?? null;
      return parsed !== origVal;
    });

    const typeChanged = reportType !== (report.report_type || "andet");

    // For first-time apply: need at least one real change
    if (!isApplied && !periodChanged && !hasMetricOverride && !typeChanged) {
      return "Mindst én ændring (periode, type eller nøgletal) kræves for at anvende";
    }

    // For editing existing applied override: check if anything changed compared to current manual state
    if (isApplied) {
      const manualMetrics = (report.manual_normalized_data as any)?.metrics ?? {};
      const manualPeriodChanged = report.manual_report_period_key !== `${year}-${String(month).padStart(2, "0")}`;
      const manualTypeChanged = report.manual_report_type !== reportType;
      const manualMetricChanged = ALL_FIELDS.some(f => {
        const parsed = parseMetricValue(metricInputs[f] ?? "");
        if (parsed === undefined) return false;
        const currentManual = manualMetrics[f] ?? null;
        return parsed !== currentManual;
      });
      const noteChanged = note !== (report.manual_override_note || "");

      if (!manualPeriodChanged && !manualTypeChanged && !manualMetricChanged && !noteChanged) {
        return "Ingen ændringer at gemme";
      }
    }

    // Validate numeric inputs
    for (const f of ALL_FIELDS) {
      const parsed = parseMetricValue(metricInputs[f] ?? "");
      if (parsed === undefined) return `"${FIELD_LABELS[f]}" er ikke et gyldigt tal`;
    }

    return null;
  }

  function getOverrideSource(): string {
    if (isAdmin) return "admin";
    if (isAdvisor) return "advisor";
    return "member";
  }

  async function save(status: "draft" | "applied") {
    if (!user) return;

    if (status === "applied") {
      const err = validateForApply();
      if (err) {
        toast({ title: "Validering", description: err, variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      const periodKey = `${year}-${String(month).padStart(2, "0")}`;
      const periodLabel = `${DANISH_MONTHS[month - 1]} ${year}`;

      // Build manual_normalized_data following the same shape as normalized_data
      const metricsObj: Record<string, number | null> = {};
      for (const f of ALL_FIELDS) {
        const parsed = parseMetricValue(metricInputs[f] ?? "");
        metricsObj[f] = parsed === undefined ? null : parsed;
      }

      const manualNormalizedData = {
        metrics: metricsObj,
        override_source: "manual_correction",
      };

      const { error } = await (supabase
        .from("financial_reports")
        .update({
          manual_report_period_label: periodLabel,
          manual_report_period_key: periodKey,
          manual_report_type: reportType,
          manual_normalized_data: manualNormalizedData,
          manual_override_note: note.trim() || null,
          manual_override_by: user.id,
          manual_override_at: new Date().toISOString(),
          manual_override_source: getOverrideSource(),
          manual_override_status: status,
        } as any)
        .eq("id", report.id) as any);

      if (error) throw error;

      toast({
        title: status === "draft" ? "Kladde gemt" : "Korrektion anvendt",
        description: status === "applied"
          ? `Effektiv periode: ${periodLabel}`
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

  async function resetToParser() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await (supabase
        .from("financial_reports")
        .update({
          manual_report_period_label: null,
          manual_report_period_key: null,
          manual_report_type: null,
          manual_normalized_data: null,
          manual_override_note: null,
          manual_override_by: user.id,
          manual_override_at: new Date().toISOString(),
          manual_override_source: getOverrideSource(),
          manual_override_status: null,
        } as any)
        .eq("id", report.id) as any);

      if (error) throw error;

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

          <div className="mt-6 space-y-6">
            {/* Section A: Basics */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Grunddata</h3>

              <div>
                <Label htmlFor="report-type">Rapporttype</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger id="report-type" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map(rt => (
                      <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="period-month">Måned</Label>
                  <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
                    <SelectTrigger id="period-month" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DANISH_MONTHS.map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="period-year">År</Label>
                  <Input
                    id="period-year"
                    type="number"
                    min={2000}
                    max={2100}
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="override-note">Korrektionsnote (valgfri)</Label>
                <Textarea
                  id="override-note"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Beskriv hvorfor data er rettet..."
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Section B: Key figures */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nøgletal</h3>
              <p className="text-[10px] text-muted-foreground">
                Tomt felt = ingen manuel korrektion (bruger parserens værdi). Brug negativt tal for omkostninger.
              </p>

              <div className="grid grid-cols-1 gap-3">
                {visibleFields.map(field => (
                  <div key={field} className="flex items-center gap-3">
                    <Label className="w-32 text-xs flex-shrink-0">{FIELD_LABELS[field]}</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={metricInputs[field] ?? ""}
                      onChange={e => setMetricInputs(prev => ({ ...prev, [field]: e.target.value }))}
                      placeholder="—"
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Section C: Actions */}
            <div className="space-y-3 pt-4 border-t border-border">
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
            <AlertDialogAction onClick={resetToParser} disabled={saving}>
              {saving ? "Nulstiller..." : "Nulstil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
