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
} from "@/lib/reportOverrideHelpers";

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
          Tomt felt = ingen manuel korrektion (bruger parserens værdi). Brug negativt tal for omkostninger.
        </p>

        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Driftsnøgletal</h3>
          <div className="grid grid-cols-1 gap-3">
            {PNL_FIELDS.map(field => (
              <div key={field} className="flex items-center gap-3">
                <Label className="w-32 text-xs flex-shrink-0">{FIELD_LABELS[field]}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={metricInputs[field] ?? ""}
                  onChange={e => onMetricChange(field, e.target.value)}
                  placeholder="—"
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
                <Label className="w-32 text-xs flex-shrink-0">{FIELD_LABELS[field]}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={metricInputs[field] ?? ""}
                  onChange={e => onMetricChange(field, e.target.value)}
                  placeholder="—"
                  className="flex-1"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
