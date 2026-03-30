import { Building2, BarChart3, FileText, Calculator } from "lucide-react";
import type { GroupCompanySummary } from "@/lib/groupDashboardUtils";
import { formatDKK } from "@/lib/financialUtils";

interface GroupCompanyCardProps {
  company: GroupCompanySummary;
  compact?: boolean;
  onCompanyClick?: (companyId: string, companyName: string) => void;
  onUploadClick?: (companyId: string, companyName: string) => void;
  onBudgetClick?: (companyId: string, companyName: string) => void;
}

function computeTrend(c: GroupCompanySummary): number | null {
  if (c.revenue != null && c.revenue_prev != null && c.revenue_prev > 0) {
    return ((c.revenue - c.revenue_prev) / c.revenue_prev) * 100;
  }
  return null;
}

export function CompanyTableRow({ company, onCompanyClick, onUploadClick }: GroupCompanyCardProps) {
  const {
    company_id, company_name, logo_url, has_verified_metrics,
    revenue, ebt, cash, missing_current_period, has_report,
  } = company;

  const revenueTrendPct = computeTrend(company);

  return (
    <tr
      className={`group border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors ${onCompanyClick ? "cursor-pointer" : ""}`}
      onClick={onCompanyClick ? () => onCompanyClick(company_id, company_name) : undefined}
    >
      {/* Company */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
            {logo_url ? (
              <img src={logo_url} alt="" className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{company_name}</p>
            {!has_report && (
              <p className="text-[10px] text-muted-foreground">Ingen rapport</p>
            )}
            {has_report && missing_current_period && (
              <p className="text-[10px] text-amber-600">Mangler aktuel periode</p>
            )}
          </div>
        </div>
      </td>

      {/* Omsætning */}
      <td className="py-3 px-4 text-right">
        <span className="text-sm font-medium text-foreground">{formatDKK(revenue)}</span>
      </td>

      {/* Resultat */}
      <td className="py-3 px-4 text-right">
        <span className={`text-sm font-medium ${(ebt ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>
          {formatDKK(ebt)}
        </span>
      </td>

      {/* Trend */}
      <td className="py-3 px-4 text-right hidden md:table-cell">
        {revenueTrendPct != null ? (
          <span className={`text-sm font-medium ${revenueTrendPct >= 0 ? "text-primary" : "text-destructive"}`}>
            {revenueTrendPct >= 0 ? "↑" : "↓"} {Math.abs(Math.round(revenueTrendPct))}%
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>

      {/* Likviditet */}
      <td className="py-3 px-4 text-right">
        <span className={`text-sm font-medium ${(cash ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>
          {formatDKK(cash)}
        </span>
      </td>

      {/* Status + Actions */}
      <td className="py-3 px-4 hidden sm:table-cell">
        <div className="flex items-center gap-2 justify-end">
          {/* Status badge */}
          {!has_verified_metrics ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
              Mangler data
            </span>
          ) : ebt === null ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
              —
            </span>
          ) : ebt > 0 ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Overskud
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
              Underskud
            </span>
          )}

          {/* Quick actions — visible on hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onCompanyClick && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCompanyClick(company_id, company_name); }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <BarChart3 className="h-3 w-3" />
                KPI'er
              </button>
            )}
            {missing_current_period && onUploadClick && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onUploadClick(company_id, company_name); }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors"
              >
                <FileText className="h-3 w-3" />
                Upload
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// Keep default export for backward compat (member dashboard uses the card grid)
const GroupCompanyCard = ({ company, onCompanyClick }: GroupCompanyCardProps) => {
  const {
    company_id, company_name, logo_url, has_report, has_verified_metrics,
    effective_period_label, missing_current_period,
    revenue, gross_profit, ebt, cash,
  } = company;

  return (
    <div
      className={`rounded-xl border border-border bg-card p-4 space-y-3 hover:shadow-sm transition-shadow ${onCompanyClick ? "cursor-pointer" : ""}`}
      onClick={onCompanyClick ? () => onCompanyClick(company_id, company_name) : undefined}
    >
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
          {logo_url ? (
            <img src={logo_url} alt="" className="h-full w-full object-contain" />
          ) : (
            <Building2 className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{company_name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {!has_report ? "Ingen rapport" : !has_verified_metrics ? "Rapport uden verificerede tal" : missing_current_period ? "Mangler aktuel periode" : effective_period_label ?? "Opdateret"}
          </p>
        </div>
      </div>
      {has_verified_metrics && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-border">
          <MetricRow label="Omsætning" value={formatDKK(revenue)} />
          <MetricRow label="Bruttofortjeneste" value={formatDKK(gross_profit)} />
          <MetricRow label="Resultat før skat" value={formatDKK(ebt)} />
          <MetricRow label="Likvider" value={formatDKK(cash)} />
        </div>
      )}
    </div>
  );
};

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

export default GroupCompanyCard;
