import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { formatCompact } from "@/lib/financialUtils";

interface RollingForecastCardProps {
  forecastRevenue: number;
  forecastResult: number;
  budgetRevenue: number | null;
  budgetResult: number | null;
  actualsMonthCount: number;
  year: string;
}

export default function RollingForecastCard({
  forecastRevenue,
  forecastResult,
  budgetRevenue,
  budgetResult,
  actualsMonthCount,
  year,
}: RollingForecastCardProps) {
  const revDiff = budgetRevenue != null ? forecastRevenue - budgetRevenue : null;
  const resDiff = budgetResult != null ? forecastResult - budgetResult : null;

  const fmtDiff = (diff: number | null) => {
    if (diff == null) return null;
    const sign = diff >= 0 ? "+" : "";
    return `${sign}${formatCompact(diff)} kr. vs. plan`;
  };

  const resultPositive = forecastResult >= 0;
  const ResultIcon = resDiff == null
    ? (resultPositive ? TrendingUp : TrendingDown)
    : resDiff >= 0 ? TrendingUp : TrendingDown;
  const resultColor = resDiff != null
    ? (resDiff >= 0 ? "text-primary" : "text-destructive")
    : (resultPositive ? "text-primary" : "text-destructive");

  return (
    <Link to="/budget" className="block group">
      <div className="rounded-xl border bg-card p-5 hover:shadow-md transition-all">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Forventet årsresultat {year}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Baseret på {actualsMonthCount} måneders aktuals
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Revenue forecast */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Omsætning</p>
            <p className="text-lg font-bold text-foreground">
              {formatCompact(forecastRevenue)} kr.
            </p>
            {fmtDiff(revDiff) && (
              <p className={`text-[11px] mt-0.5 ${revDiff != null && revDiff >= 0 ? "text-primary" : "text-destructive"}`}>
                {fmtDiff(revDiff)}
              </p>
            )}
          </div>

          {/* Result forecast */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Resultat</p>
            <div className="flex items-center gap-1.5">
              <ResultIcon className={`h-4 w-4 ${resultColor}`} />
              <p className={`text-lg font-bold ${resultColor}`}>
                {formatCompact(forecastResult)} kr.
              </p>
            </div>
            {fmtDiff(resDiff) && (
              <p className={`text-[11px] mt-0.5 ${resDiff != null && resDiff >= 0 ? "text-primary" : "text-destructive"}`}>
                {fmtDiff(resDiff)}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
