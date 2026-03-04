import { useState } from "react";
import { SHORT_MONTHS } from "@/lib/financialUtils";

export type PeriodMode = "last12" | "ytd" | "custom";

interface PeriodSelectorProps {
  mode: PeriodMode;
  onModeChange: (mode: PeriodMode) => void;
  customFrom: string | null; // "YYYY-MM"
  customTo: string | null;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  periodLabel: string;
  compact?: boolean;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);
const months = SHORT_MONTHS.map((m, i) => ({ label: m, value: String(i + 1).padStart(2, "0") }));

const PeriodSelector = ({
  mode, onModeChange, customFrom, customTo,
  onCustomFromChange, onCustomToChange, periodLabel, compact,
}: PeriodSelectorProps) => {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          { key: "last12" as PeriodMode, label: "Seneste 12 mdr" },
          { key: "ytd" as PeriodMode, label: "År til dato" },
          { key: "custom" as PeriodMode, label: "Vælg periode" },
        ]).map(opt => (
          <button
            key={opt.key}
            onClick={() => onModeChange(opt.key)}
            className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${
              mode === opt.key
                ? "bg-primary/10 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === "custom" && (
        <div className="flex items-center gap-2 flex-wrap">
          <MonthYearPicker value={customFrom} onChange={onCustomFromChange} label="Fra" />
          <span className="text-muted-foreground text-xs">–</span>
          <MonthYearPicker value={customTo} onChange={onCustomToChange} label="Til" />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">{periodLabel}</p>
    </div>
  );
};

function MonthYearPicker({ value, onChange, label }: { value: string | null; onChange: (v: string) => void; label: string }) {
  const [y, m] = value ? value.split("-") : ["", ""];
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground w-6">{label}</span>
      <select
        value={m}
        onChange={e => onChange(`${y || currentYear}-${e.target.value}`)}
        className="text-xs rounded-md border border-border/50 bg-background px-2 py-1 text-foreground"
      >
        <option value="">Mdr</option>
        {months.map(mo => <option key={mo.value} value={mo.value}>{mo.label}</option>)}
      </select>
      <select
        value={y}
        onChange={e => onChange(`${e.target.value}-${m || "01"}`)}
        className="text-xs rounded-md border border-border/50 bg-background px-2 py-1 text-foreground"
      >
        <option value="">År</option>
        {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  );
}

// Hook for period filtering logic
export function usePeriodFilter() {
  const [mode, setMode] = useState<PeriodMode>("last12");
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);

  const filterKeys = (allKeys: string[]): string[] => {
    const sorted = [...allKeys].sort();
    if (mode === "last12") {
      return sorted.slice(-12);
    }
    if (mode === "ytd") {
      const yearPrefix = `${new Date().getFullYear()}-`;
      return sorted.filter(k => k.startsWith(yearPrefix));
    }
    // custom
    return sorted.filter(k => {
      if (customFrom && k < customFrom) return false;
      if (customTo && k > customTo) return false;
      return true;
    });
  };

  const getPeriodLabel = (filteredKeys: string[]): string => {
    if (filteredKeys.length === 0) return "Ingen data i valgt periode";
    const first = filteredKeys[0];
    const last = filteredKeys[filteredKeys.length - 1];
    const fmt = (k: string) => {
      const [y, m] = k.split("-");
      return `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${y}`;
    };
    return `${fmt(first)} – ${fmt(last)}`;
  };

  return { mode, setMode, customFrom, setCustomFrom, customTo, setCustomTo, filterKeys, getPeriodLabel };
}

export default PeriodSelector;
