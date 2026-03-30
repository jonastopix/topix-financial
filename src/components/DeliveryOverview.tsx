import { useMemo } from "react";
import { CheckCircle2, Clock, AlertCircle, Pencil } from "lucide-react";
import {
  DANISH_MONTHS, SHORT_MONTHS, getEffectiveReportPeriodKey, hasManualOverride, reportStatusConfig,
} from "@/lib/financialUtils";

interface ReportSlim {
  id: string;
  report_period: string | null;
  status: string;
  manual_report_period_key?: string | null;
  manual_override_status?: string | null;
}

interface DeliveryOverviewProps {
  reports: ReportSlim[];
  onUploadClick?: () => void;
}

type MonthSlot = { key: string; month: number; year: string; report?: ReportSlim };

interface YearGroup {
  year: string;
  months: MonthSlot[];
  delivered: number;
  total: number;
}

const DeliveryOverview = ({ reports, onUploadClick }: DeliveryOverviewProps) => {
  const reportsByMonth = useMemo(() => {
    const map: Record<string, ReportSlim> = {};
    [...reports]
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((r) => {
        const key = getEffectiveReportPeriodKey(r as any);
        if (key) {
          const existing = map[key];
          if (!existing || r.status === "processed") map[key] = r;
        }
      });
    return map;
  }, [reports]);

  const yearGroups = useMemo(() => {
    const allKeys = Object.keys(reportsByMonth);
    if (allKeys.length === 0) return [];

    // Find min/max year from reports
    const allYears = allKeys.map(k => parseInt(k.split("-")[0], 10));
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed
    const minYear = Math.min(...allYears);
    const maxYear = Math.max(...allYears, currentYear);

    const groups: YearGroup[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      const yearStr = String(y);
      // For current year, only show months up to current month
      const lastMonth = y === currentYear ? currentMonth : 11;
      const months: MonthSlot[] = [];
      for (let m = 0; m <= lastMonth; m++) {
        const key = `${yearStr}-${String(m + 1).padStart(2, "0")}`;
        months.push({
          key,
          month: m,
          year: yearStr,
          report: reportsByMonth[key],
        });
      }
      const delivered = months.filter(s => s.report?.status === "processed").length;
      groups.push({ year: yearStr, months, delivered, total: months.length });
    }

    return groups;
  }, [reportsByMonth]);

  if (yearGroups.length === 0) return null;

  return (
    <div className="glass-card rounded-xl p-6 animate-fade-in">
      <h2 className="font-display font-semibold text-foreground mb-4">Leveringsoverblik</h2>

      <div className="space-y-5">
        {yearGroups.map((group) => (
          <div key={group.year}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-foreground">{group.year}</p>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                {group.delivered} af {group.total} leveret
              </span>
            </div>

            <div className="h-1.5 rounded-full bg-secondary/50 mb-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${group.total > 0 ? (group.delivered / group.total) * 100 : 0}%` }}
              />
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {group.months.map(({ key, month, year, report }) => {
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
                      <div className="relative">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {report && hasManualOverride(report as any) && (
                          <Pencil className="h-2 w-2 text-accent-foreground absolute -top-0.5 -right-0.5" />
                        )}
                      </div>
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
        ))}
      </div>
    </div>
  );
};

export default DeliveryOverview;
