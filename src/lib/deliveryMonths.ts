/** Leveringsoverbliks-BEREGNINGEN — udskilt fra DeliveryOverview.tsx som ren
    flytning (rapportering-design §a2), så gamle DeliveryOverview (Reports/
    MemberDetail, adfærd uændret) og Hb-leveringsbåndet deler samme dom. */
import { getEffectiveReportPeriodKey, isCompletedMonth } from "@/lib/financialUtils";

export interface ReportSlim {
  id: string;
  report_period: string | null;
  status: string;
  manual_report_period_key?: string | null;
  manual_override_status?: string | null;
}

export type MonthSlot = { key: string; month: number; year: string; report?: ReportSlim };

export interface YearGroup {
  year: string;
  months: MonthSlot[];
  delivered: number;
  total: number;
}

export function buildReportsByMonth(reports: ReportSlim[]): Record<string, ReportSlim> {
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
}

export function buildYearGroups(
  reportsByMonth: Record<string, ReportSlim>,
  committedReportIds?: Set<string>,
): YearGroup[] {
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
    const delivered = months.filter(s => {
      if (s.report?.status !== "processed") return false;
      // If committedReportIds is not provided, fall back to old behavior (processed = delivered).
      if (!committedReportIds) return true;
      return committedReportIds.has(s.report.id);
    }).length;
    groups.push({ year: yearStr, months, delivered, total: months.filter(s => isCompletedMonth(s.key)).length });
  }

  return groups;
}

/** Pr.-måned-dommen til Hb-båndet (samme logik som DeliveryOverviews
    render-forgrening, samlet ét sted). */
export type SlotState = "delivered" | "pending" | "processing" | "error" | "missing" | "upcoming";

export function deriveSlotState(slot: MonthSlot, committedReportIds?: Set<string>): SlotState {
  const status = slot.report?.status;
  const isPast = isCompletedMonth(slot.key);
  const isPendingApproval =
    status === "processed" &&
    committedReportIds !== undefined &&
    slot.report !== undefined &&
    !committedReportIds.has(slot.report.id);
  if (isPendingApproval) return "pending";
  if (status === "processed") return "delivered";
  if (status === "processing") return "processing";
  if (status === "error") return "error";
  return isPast ? "missing" : "upcoming";
}
