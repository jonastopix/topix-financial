/**
 * Shared override form fields — used by both ReportManualOverride (sheet)
 * and ReportReviewDialog (inline edit mode).
 *
 * Pure presentational / controlled component. No persistence logic.
 */

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DANISH_MONTHS } from "@/lib/financialUtils";
import {
  REPORT_TYPES,
  PNL_FIELDS,
  BALANCE_FIELDS,
  FIELD_LABELS,
  parseMetricValue,
} from "@/lib/reportOverrideHelpers";

const FIELD_PLACEHOLDERS: Record<string, string> = {
  omsaetning: "Eks. 1250000",
  daekningsbidrag: "Eks. 650000",
  loenninger: "Eks. -320000",
  ebitda: "Eks. 180000",
  resultat_foer_skat: "Eks. 120000",
  resultat_efter_skat: "Eks. 90000",
  bank_balance: "Eks. 480000",
  debitorer: "Eks. 210000",
  kreditorer: "Eks. -95000",
  egenkapital: "Eks. 750000",
  aktiver_i_alt: "Eks. 1800000",
  gaeld_i_alt: "Eks. 1050000",
};

const REQUIRED_FIELDS = new Set([
  "omsaetning",
  "daekningsbidrag",
  "resultat_foer_skat",
  "egenkapital",
  "aktiver_i_alt",
]);

export interface OverrideFormFieldsProps {
  reportType: string;
  onReportTypeChange: (v: string) => void;
  month: number;
  onMonthChange: (v: number) => void;
  year: number;
  onYearChange: (v: number) => void;
  metricInputs: Record<string, string>;
  onMetricChange: (field: string, value: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
}

export default function OverrideFormFields({
  reportType, onReportTypeChange,
  month, onMonthChange,
  year, onYearChange,
  metricInputs, onMetricChange,
  note, onNoteChange,
}: OverrideFormFieldsProps) {
  const omsVal = parseMetricValue(metricInputs["omsaetning"] ?? "");
  const omsSafe = typeof omsVal === "number" ? omsVal : null;
  const dbVal = parseMetricValue(metricInputs["daekningsbidrag"] ?? "");
  const resVal = parseMetricValue(metricInputs["resultat_foer_skat"] ?? "");
  const ebitdaVal = parseMetricValue(metricInputs["ebitda"] ?? "");

  const fieldWarning = (field: string): React.ReactNode => {
    if (field === "omsaetning" && typeof omsVal === "number" && omsVal < 0) {
      return <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 ml-[10.5rem]">Omsætning er negativ — er det korrekt?</p>;
    }
    if (field === "daekningsbidrag" && typeof dbVal === "number" && omsSafe !== null && omsSafe > 0 && dbVal > omsSafe) {
      return <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 ml-[10.5rem]">Dækningsbidrag kan ikke overstige omsætningen</p>;
    }
    if (field === "resultat_foer_skat" && typeof resVal === "number" && omsSafe !== null && omsSafe > 0 && Math.abs(resVal) > omsSafe * 1.5) {
      return <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 ml-[10.5rem]">Resultatet er usædvanligt stort ift. omsætningen</p>;
    }
    if (field === "ebitda" && typeof ebitdaVal === "number" && omsSafe !== null && omsSafe > 0 && ebitdaVal > omsSafe) {
      return <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 ml-[10.5rem]">EBITDA kan ikke overstige omsætningen</p>;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Section A: Basics */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Grunddata</h3>

        <div>
          <Label htmlFor="override-report-type">Rapporttype</Label>
          <Select value={reportType} onValueChange={onReportTypeChange}>
            <SelectTrigger id="override-report-type" className="mt-1">
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
            <Label htmlFor="override-period-month">Måned</Label>
            <Select value={String(month)} onValueChange={v => onMonthChange(Number(v))}>
              <SelectTrigger id="override-period-month" className="mt-1">
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
            <Label htmlFor="override-period-year">År</Label>
            <Input
              id="override-period-year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={e => onYearChange(Number(e.target.value))}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="override-note">Korrektionsnote (valgfri)</Label>
          <Textarea
            id="override-note"
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="Beskriv hvorfor data er rettet..."
            rows={2}
            className="mt-1"
          />
        </div>
      </div>

      {/* Section B: Key figures */}
      <div className="space-y-4">
        <p className="text-[10px] text-muted-foreground">
          Brug tal i hele kroner uden punktum som tusindtalsseparator. Negative tal angives med minus: -50000
        </p>
        <p className="text-[10px] text-muted-foreground">
          Tomt felt = ingen manuel korrektion (bruger parserens værdi).
        </p>

        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Driftsnøgletal</h3>
          <div className="grid grid-cols-1 gap-3">
            {PNL_FIELDS.map(field => (
              <div key={field} className="flex items-center gap-3">
                <Label className="w-40 text-xs flex-shrink-0">
                  {FIELD_LABELS[field]}
                  {REQUIRED_FIELDS.has(field) && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={metricInputs[field] ?? ""}
                  onChange={e => onMetricChange(field, e.target.value)}
                  placeholder={FIELD_PLACEHOLDERS[field] ?? "—"}
                  className="flex-1"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Balancenøgletal</h3>
          <div className="grid grid-cols-1 gap-3">
            {BALANCE_FIELDS.map(field => (
              <div key={field} className="flex items-center gap-3">
                <Label className="w-40 text-xs flex-shrink-0">
                  {FIELD_LABELS[field]}
                  {REQUIRED_FIELDS.has(field) && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={metricInputs[field] ?? ""}
                  onChange={e => onMetricChange(field, e.target.value)}
                  placeholder={FIELD_PLACEHOLDERS[field] ?? "—"}
                  className="flex-1"
                />
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground italic">* Obligatorisk for AI-analyse</p>
      </div>
    </div>
  );
}
