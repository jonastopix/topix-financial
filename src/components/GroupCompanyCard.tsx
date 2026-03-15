import { Building2, CheckCircle2, AlertTriangle, FileQuestion } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { GroupCompanySummary } from "@/hooks/useGroupDashboard";

interface GroupCompanyCardProps {
  company: GroupCompanySummary;
}

function formatDKK(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(value);
}

const GroupCompanyCard = ({ company }: GroupCompanyCardProps) => {
  const {
    company_name,
    logo_url,
    has_report,
    has_verified_metrics,
    effective_period_label,
    missing_current_period,
    revenue,
    gross_profit,
    ebt,
    cash,
  } = company;

  // Three distinct states
  const statusIcon = !has_report ? (
    <FileQuestion className="h-4 w-4 text-muted-foreground" />
  ) : !has_verified_metrics || missing_current_period ? (
    <AlertTriangle className="h-4 w-4 text-amber-500" />
  ) : (
    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  );

  const statusLabel = !has_report
    ? "Ingen rapport"
    : !has_verified_metrics
      ? "Rapport uden verificerede tal"
      : missing_current_period
        ? "Mangler aktuel periode"
        : effective_period_label ?? "Opdateret";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
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
            <div className="flex items-center gap-1.5 mt-0.5">
              {statusIcon}
              <span className="text-[11px] text-muted-foreground truncate">{statusLabel}</span>
            </div>
          </div>
        </div>

        {/* Metrics — only when verified */}
        {has_verified_metrics && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-border">
            <MetricRow label="Omsætning" value={formatDKK(revenue)} />
            <MetricRow label="Bruttofortjeneste" value={formatDKK(gross_profit)} />
            <MetricRow label="Resultat før skat" value={formatDKK(ebt)} />
            <MetricRow label="Likvider" value={formatDKK(cash)} />
          </div>
        )}
      </CardContent>
    </Card>
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
