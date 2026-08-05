import { useMemo } from "react";
import { CheckCircle2, Clock, AlertCircle, Pencil } from "lucide-react";
import {
  DANISH_MONTHS, SHORT_MONTHS, hasManualOverride, reportStatusConfig, isCompletedMonth,
} from "@/lib/financialUtils";
// Beregningen er udskilt som ren flytning (rapportering-design §a2) og
// deles med Hb-leveringsbåndet. Denne komponents adfærd er uændret.
import { buildReportsByMonth, buildYearGroups, type ReportSlim } from "@/lib/deliveryMonths";

interface DeliveryOverviewProps {
  reports: ReportSlim[];
  onUploadClick?: () => void;
  committedReportIds?: Set<string>;
}

const DeliveryOverview = ({ reports, onUploadClick, committedReportIds }: DeliveryOverviewProps) => {
  const reportsByMonth = useMemo(() => buildReportsByMonth(reports), [reports]);

  const yearGroups = useMemo(
    () => buildYearGroups(reportsByMonth, committedReportIds),
    [reportsByMonth, committedReportIds],
  );

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
                // A month is past only when we're in a later month — consistent with commit blocking
                const isPast = isCompletedMonth(key);
                const status = report?.status;
                // Pending-approval: processed but not yet committed. Falls back to old
                // behavior (processed = delivered/green) when committedReportIds is undefined.
                const isPendingApproval = status === "processed"
                  && committedReportIds !== undefined
                  && report !== undefined
                  && !committedReportIds.has(report.id);
                const statusLabel = isPendingApproval
                  ? "Afventer godkendelse"
                  : reportStatusConfig[status || "processing"]?.label;
                return (
                  <div
                    key={key}
                    title={!report && isPast && onUploadClick ? `Klik for at uploade rapport for ${DANISH_MONTHS[month]} ${year}` : `${DANISH_MONTHS[month]} ${year}${report ? ` — ${statusLabel}` : ""}`}
                    onClick={!report && isPast && onUploadClick ? onUploadClick : undefined}
                    className={`flex flex-col items-center justify-center rounded-lg p-2 border transition-all ${
                      !report && isPast && onUploadClick ? "cursor-pointer hover:bg-primary/5 hover:border-primary/20" : "cursor-default"
                    } ${
                      isPendingApproval
                        ? "bg-chart-info/15 border-chart-info/50"
                        : status === "processed"
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
                    {isPendingApproval ? (
                      <Clock className="h-4 w-4 text-chart-info" />
                    ) : status === "processed" ? (
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
