import { BarChart3 } from "lucide-react";

export interface GaugeEntry {
  kpi_key: string;
  label: string;
  actualValue: number | null;
  benchmarkValue: number;
  benchmarkMin: number;
  benchmarkMax: number;
  benchmarkLabel: string;
  unit: string;
  sourceLabel: string;
}

interface IndustryBenchmarkGaugeProps {
  industryLabel: string;
  entries: GaugeEntry[];
}

export default function IndustryBenchmarkGauge({ industryLabel, entries }: IndustryBenchmarkGaugeProps) {
  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Branchesammenligning</span>
        <span className="text-xs text-muted-foreground">· {industryLabel}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {entries.map(entry => {
          if (entry.actualValue == null) return null;
          const range = entry.benchmarkMax - entry.benchmarkMin;
          const positionPct = range > 0
            ? Math.min(100, Math.max(0, ((entry.actualValue - entry.benchmarkMin) / range) * 100))
            : 50;
          const aboveBenchmark = entry.actualValue >= entry.benchmarkValue;
          const statusColor = aboveBenchmark ? "text-primary" : "text-destructive";
          const barColor = aboveBenchmark ? "bg-primary" : "bg-destructive";

          return (
            <div key={entry.kpi_key} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-foreground">{entry.label}</p>
                <span className="text-sm tabular-nums">
                  <span className="font-semibold text-foreground">{entry.actualValue.toFixed(1)}{entry.unit}</span>
                  {" "}
                  <span className={`text-xs ${statusColor}`}>
                    {aboveBenchmark ? "↑ over" : "↓ under"} snit
                  </span>
                </span>
              </div>

              {/* Track */}
              <div className="relative h-3 rounded-full bg-muted">
                {/* Benchmark zone (min→max) */}
                <div className="absolute inset-y-0 rounded-full bg-muted-foreground/10" style={{ left: "0%", right: "0%" }} />

                {/* Benchmark midpoint marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/40"
                  style={{ left: `${range > 0 ? ((entry.benchmarkValue - entry.benchmarkMin) / range) * 100 : 50}%` }}
                />

                {/* Actual value dot */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-background shadow ${barColor}`}
                  style={{ left: `calc(${positionPct}% - 7px)` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{entry.benchmarkMin}{entry.unit}</span>
                <span>{entry.benchmarkLabel}</span>
                <span>{entry.benchmarkMax}{entry.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground mt-4">
        Kilde: {entries[0]?.sourceLabel || "Branchestandard (The Boardroom)"}
      </p>
    </div>
  );
}
