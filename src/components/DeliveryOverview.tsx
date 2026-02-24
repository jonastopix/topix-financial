import { useMemo } from "react";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import {
  DANISH_MONTHS, SHORT_MONTHS, parseReportPeriodToKey, reportStatusConfig,
} from "@/lib/financialUtils";

interface ReportSlim {
  id: string;
  report_period: string | null;
  status: string;
}

interface DeliveryOverviewProps {
  reports: ReportSlim[];
  programStart: Date | null;
}

type MonthSlot = { key: string; month: number; year: string; report?: ReportSlim };

const DeliveryOverview = ({ reports, programStart }: DeliveryOverviewProps) => {
  const reportsByMonth = useMemo(() => {
    const map: Record<string, ReportSlim> = {};
    [...reports]
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((r) => {
        const key = parseReportPeriodToKey(r.report_period);
        if (key) {
          const existing = map[key];
          if (!existing || r.status === "processed") map[key] = r;
        }
      });
    return map;
  }, [reports]);

  const { historicMonths, programMonths, programDelivered } = useMemo(() => {
    if (!programStart) {
      const allKeys = Object.keys(reportsByMonth).sort();
      const slots: MonthSlot[] = allKeys.map(key => {
        const [y, m] = key.split("-");
        return { key, month: parseInt(m, 10) - 1, year: y, report: reportsByMonth[key] };
      });
      return { historicMonths: [] as MonthSlot[], programMonths: slots, programDelivered: slots.filter(s => s.report?.status === "processed").length };
    }

    const startYear = programStart.getFullYear();
    const startMonth = programStart.getMonth();

    const progMonths: MonthSlot[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(startYear, startMonth + i, 1);
      const y = String(d.getFullYear());
      const m = d.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      progMonths.push({ key, month: m, year: y, report: reportsByMonth[key] });
    }
    const programKeySet = new Set(progMonths.map(p => p.key));

    const historicKeys = Object.keys(reportsByMonth)
      .filter(k => !programKeySet.has(k) && k < progMonths[0].key)
      .sort();
    const hist: MonthSlot[] = historicKeys.map(key => {
      const [y, m] = key.split("-");
      return { key, month: parseInt(m, 10) - 1, year: y, report: reportsByMonth[key] };
    });

    const delivered = progMonths.filter(s => s.report?.status === "processed").length;
    return { historicMonths: hist, programMonths: progMonths, programDelivered: delivered };
  }, [reportsByMonth, programStart]);

  if (programMonths.length === 0 && historicMonths.length === 0) return null;

  return (
    <div className="glass-card rounded-xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-foreground">Leveringsoverblik</h2>
        {programStart && (
          <span className="text-xs text-muted-foreground">
            Programstart: {DANISH_MONTHS[programStart.getMonth()]} {programStart.getFullYear()}
          </span>
        )}
      </div>

      {/* Historic section */}
      {historicMonths.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Historik (før opstart)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {historicMonths.map(({ key, month, year, report }) => {
              const status = report?.status;
              return (
                <div
                  key={key}
                  title={`${DANISH_MONTHS[month]} ${year} — ${reportStatusConfig[status || "processing"]?.label || "Historik"}`}
                  className={`flex flex-col items-center justify-center rounded-lg p-2 border transition-all cursor-default opacity-60 ${
                    status === "processed"
                      ? "bg-primary/10 border-primary/30"
                      : status === "processing"
                      ? "bg-chart-warning/10 border-chart-warning/30"
                      : status === "error"
                      ? "bg-destructive/10 border-destructive/30"
                      : "bg-muted/50 border-border/30"
                  }`}
                >
                  {status === "processed" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  ) : status === "processing" ? (
                    <Clock className="h-3.5 w-3.5 text-chart-warning animate-pulse" />
                  ) : status === "error" ? (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                  <span className="text-[8px] font-medium text-muted-foreground mt-0.5">
                    {SHORT_MONTHS[month]} {year.slice(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Separator */}
      {historicMonths.length > 0 && programStart && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 border-t border-primary/30" />
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Programstart</span>
          <div className="flex-1 border-t border-primary/30" />
        </div>
      )}

      {/* Program 12-month grid */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Dit 12-måneders program
          </p>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
            {programDelivered} af 12 leveret
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary/50 mb-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(programDelivered / 12) * 100}%` }}
          />
        </div>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
          {programMonths.map(({ key, month, year, report }) => {
            const isPast = new Date(key + "-28") < new Date();
            const status = report?.status;
            return (
              <div
                key={key}
                title={`${DANISH_MONTHS[month]} ${year}${report ? ` — ${reportStatusConfig[status || "processing"]?.label}` : ""}`}
                className={`flex flex-col items-center justify-center rounded-lg p-2 border transition-all cursor-default ${
                  status === "processed"
                    ? "bg-primary/10 border-primary/30"
                    : status === "processing"
                    ? "bg-chart-warning/10 border-chart-warning/30"
                    : status === "error"
                    ? "bg-destructive/10 border-destructive/30"
                    : isPast
                    ? "bg-muted/50 border-border/30"
                    : "bg-secondary/20 border-border/20"
                }`}
              >
                {status === "processed" ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : status === "processing" ? (
                  <Clock className="h-4 w-4 text-chart-warning animate-pulse" />
                ) : status === "error" ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <div className={`h-4 w-4 rounded-full border-2 ${isPast ? "border-muted-foreground/20" : "border-border/40"}`} />
                )}
                <span className="text-[9px] font-medium text-muted-foreground mt-1">
                  {SHORT_MONTHS[month]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DeliveryOverview;
