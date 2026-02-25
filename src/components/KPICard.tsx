import { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  secondaryChange?: string;
  secondaryTrend?: "up" | "down" | "neutral";
  /** Budget comparison label, e.g. "5k under budget" */
  budgetLabel?: string;
  /** Whether actual is favorable vs budget (green) or not (red) */
  budgetFavorable?: boolean;
  subtitle?: string;
  icon?: ReactNode;
  accentColor?: "emerald" | "amber" | "blue" | "rose";
}

const accentMap = {
  emerald: {
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    border: "border-l-primary",
    glow: "group-hover:shadow-[0_0_24px_-6px_hsl(var(--primary)/0.25)]",
  },
  amber: {
    iconBg: "bg-chart-warning/10",
    iconText: "text-chart-warning",
    border: "border-l-chart-warning",
    glow: "group-hover:shadow-[0_0_24px_-6px_hsl(38,92%,50%,0.2)]",
  },
  blue: {
    iconBg: "bg-chart-info/10",
    iconText: "text-chart-info",
    border: "border-l-chart-info",
    glow: "group-hover:shadow-[0_0_24px_-6px_hsl(217,91%,60%,0.2)]",
  },
  rose: {
    iconBg: "bg-destructive/10",
    iconText: "text-destructive",
    border: "border-l-destructive",
    glow: "group-hover:shadow-[0_0_24px_-6px_hsl(0,72%,51%,0.15)]",
  },
};

const KPICard = ({ title, value, change, trend = "neutral", secondaryChange, secondaryTrend = "neutral", budgetLabel, budgetFavorable, subtitle, icon, accentColor = "emerald" }: KPICardProps) => {
  const accent = accentMap[accentColor];

  const ChangeBadge = ({ label, dir }: { label: string; dir: "up" | "down" | "neutral" }) => (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        dir === "up"
          ? "bg-primary/10 text-primary"
          : dir === "down"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {dir === "up" ? (
        <TrendingUp className="h-3 w-3" />
      ) : dir === "down" ? (
        <TrendingDown className="h-3 w-3" />
      ) : (
        <Minus className="h-3 w-3" />
      )}
      {label}
    </span>
  );

  return (
    <div className={`glass-card rounded-xl p-5 animate-fade-in group border-l-[3px] ${accent.border} hover:border-l-4 transition-all duration-300 ${accent.glow}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
        {icon && (
          <div className={`p-2 rounded-lg ${accent.iconBg}`}>
            <div className={accent.iconText}>{icon}</div>
          </div>
        )}
      </div>
      <p className="text-2xl font-display font-bold text-foreground tracking-tight leading-none">{value}</p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {change && <ChangeBadge label={change} dir={trend} />}
        {secondaryChange && <ChangeBadge label={secondaryChange} dir={secondaryTrend} />}
        {budgetLabel && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            budgetFavorable
              ? "bg-primary/5 text-primary border-primary/20"
              : "bg-destructive/5 text-destructive border-destructive/20"
          }`}>
            {budgetLabel}
          </span>
        )}
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  );
};

export default KPICard;
