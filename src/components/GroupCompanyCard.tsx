import { Building2 } from "lucide-react";
import type { GroupCompanySummary } from "@/lib/groupDashboardUtils";

interface GroupCompanyCardProps {
  company: GroupCompanySummary;
  compact?: boolean;
  onCompanyClick?: (companyId: string, companyName: string) => void;
}

function formatDKK(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Tiny inline SVG sparkline — 3 data points, 50×20px */
function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    // Flat line for single data point
    return (
      <svg width="50" height="20" viewBox="0 0 50 20" className="shrink-0">
        <line x1="0" y1="10" x2="50" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 2;
  const h = 20 - padding * 2;

  const points = values
    .map((v, i) => {
      const x = values.length === 1 ? 25 : (i / (values.length - 1)) * 50;
      const y = padding + h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width="50" height="20" viewBox="0 0 50 20" className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Derive trend % from first to last value */
function getTrend(values: number[]): { pct: number; direction: "up" | "down" | "flat" } {
  if (values.length < 2) return { pct: 0, direction: "flat" };
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return { pct: 0, direction: "flat" };
  const pct = ((last - first) / Math.abs(first)) * 100;
  if (pct > 5) return { pct, direction: "up" };
  if (pct < -10) return { pct, direction: "down" };
  return { pct, direction: "flat" };
}

export function CompanyTableRow({ company }: GroupCompanyCardProps) {
  const {
    company_name, logo_url, has_verified_metrics,
    revenue, ebt, cash, missing_current_period, has_report,
  } = company;

  // Use revenue as sparkline proxy — currently only one period available from RPC
  // Build a simple array; the parent could pass historical data in the future
  const revenueValues = revenue != null ? [revenue] : [];
  const trend = getTrend(revenueValues);
  const sparkColor = trend.direction === "up" ? "#1D9E75" : trend.direction === "down" ? "#E24B4A" : "hsl(var(--muted-foreground))";

  const trendBadgeClass =
    trend.direction === "up"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
      : trend.direction === "down"
        ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
        : "bg-muted text-muted-foreground";

  const needsAttention = (cash != null && cash < 0) || trend.direction === "down";

  return (
    <tr className="group border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors">
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

      {/* Likviditet */}
      <td className="py-3 px-4 text-right">
        <span className={`text-sm font-medium ${(cash ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>
          {formatDKK(cash)}
        </span>
      </td>

      {/* Sparkline */}
      <td className="py-3 px-4 hidden sm:table-cell">
        {has_verified_metrics ? (
          <MiniSparkline values={revenueValues.length > 0 ? revenueValues : [0]} color={sparkColor} />
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </td>

      {/* Trend badge */}
      <td className="py-3 px-4 hidden sm:table-cell">
        {has_verified_metrics ? (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${trendBadgeClass}`}>
            {trend.direction === "flat" ? "—" : `${trend.pct >= 0 ? "+" : ""}${Math.round(trend.pct)}%`}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

// Keep default export for backward compat (member dashboard uses the card grid)
const GroupCompanyCard = ({ company }: GroupCompanyCardProps) => {
  const {
    company_name, logo_url, has_report, has_verified_metrics,
    effective_period_label, missing_current_period,
    revenue, gross_profit, ebt, cash,
  } = company;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 hover:shadow-sm transition-shadow">
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
