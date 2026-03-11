import { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  secondaryChange?: string;
  secondaryTrend?: "up" | "down" | "neutral";
  budgetLabel?: string;
  budgetFavorable?: boolean;
  /** Sparkline data points (last 6 months). Each entry is a value. */
  sparkline?: number[];
  /** Compact YTD secondary line, e.g. "YTD: 1.245.000 kr" */
  ytdLine?: string;
  subtitle?: string;
  icon?: ReactNode;
  accentColor?: "emerald" | "amber" | "blue" | "rose";
}

const accentMap = {
  emerald: {
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    border: "border-l-primary",
    sparkStroke: "hsl(var(--primary))",
    sparkFill: "hsl(var(--primary) / 0.1)",
  },
  amber: {
    iconBg: "bg-chart-warning/10",
    iconText: "text-chart-warning",
    border: "border-l-chart-warning",
    sparkStroke: "hsl(38, 92%, 50%)",
    sparkFill: "hsl(38, 92%, 50%, 0.1)",
  },
  blue: {
    iconBg: "bg-chart-info/10",
    iconText: "text-chart-info",
    border: "border-l-chart-info",
    sparkStroke: "hsl(217, 91%, 60%)",
    sparkFill: "hsl(217, 91%, 60%, 0.1)",
  },
  rose: {
    iconBg: "bg-destructive/10",
    iconText: "text-destructive",
    border: "border-l-destructive",
    sparkStroke: "hsl(0, 72%, 51%)",
    sparkFill: "hsl(0, 72%, 51%, 0.1)",
  },
};

const KPICard = ({ title, value, change, trend = "neutral", secondaryChange, secondaryTrend = "neutral", budgetLabel, budgetFavorable, sparkline, ytdLine, subtitle, icon, accentColor = "emerald" }: KPICardProps) => {
  const accent = accentMap[accentColor];

  const ChangeBadge = ({ label, dir }: { label: string; dir: "up" | "down" | "neutral" }) => (
    <span
      className={`inline-flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-full truncate ${
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

  const sparkData = sparkline?.map((v, i) => ({ v }));
  const hasSparkline = sparkData && sparkData.length >= 2;

  return (
    <div className={`bg-card border border-border shadow-sm rounded-xl p-3 sm:p-5 animate-fade-in group border-l-2 ${accent.border} hover:shadow-md transition-shadow duration-200 relative overflow-hidden`}>
      {/* Sparkline background */}
      {hasSparkline && (
        <div className="absolute bottom-0 left-0 right-0 h-12 opacity-60 group-hover:opacity-80 transition-opacity pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${title.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent.sparkStroke} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={accent.sparkStroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={accent.sparkStroke}
                strokeWidth={1.5}
                fill={`url(#spark-${title.replace(/\s/g, "")})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
          {icon && (
            <div className={`p-2 rounded-lg ${accent.iconBg}`}>
              <div className={accent.iconText}>{icon}</div>
            </div>
          )}
        </div>
        <p className="text-xl sm:text-2xl font-display font-bold text-foreground tracking-tight leading-none">{value}</p>
        <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-2 sm:mt-3 min-w-0">
          {change && <ChangeBadge label={change} dir={trend} />}
          {secondaryChange && <ChangeBadge label={secondaryChange} dir={secondaryTrend} />}
          {budgetLabel && (
            <span className={`inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full border truncate ${
              budgetFavorable
                ? "bg-primary/5 text-primary border-primary/20"
                : "bg-destructive/5 text-destructive border-destructive/20"
            }`}>
              {budgetLabel}
            </span>
          )}
          {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
        {ytdLine && (
          <p className="text-[10px] text-muted-foreground mt-1.5 truncate">{ytdLine}</p>
        )}
      </div>
    </div>
  );
};

export default KPICard;
