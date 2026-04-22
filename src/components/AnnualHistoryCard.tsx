import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp, TrendingDown, BookMarked } from "lucide-react";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { formatCompact } from "@/lib/financialUtils";

export default function AnnualHistoryCard() {
  const { data: facts = [] } = useCompanyFacts();

  const annualData = useMemo(() => {
    const annualFacts = facts.filter((f) => f.source_type === "annual_report");
    if (annualFacts.length === 0) return null;

    const byYear = new Map<string, { revenue: number; result: number; months: number }>();

    for (const fact of annualFacts) {
      const year = fact.period_key.split("-")[0];
      const kf = factsToDanishMetrics(fact.metrics);
      const rev = kf.omsaetning ?? 0;
      const res = kf.resultat_foer_skat ?? 0;

      const existing = byYear.get(year) || { revenue: 0, result: 0, months: 0 };
      byYear.set(year, {
        revenue: existing.revenue + rev,
        result: existing.result + res,
        months: existing.months + 1,
      });
    }

    return [...byYear.entries()]
      .map(([year, data]) => ({
        year,
        revenue: data.revenue,
        result: data.result,
      }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [facts]);

  if (!annualData || annualData.length === 0) return null;

  return (
    <div className="bg-card border border-border shadow-sm rounded-xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <BookMarked className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm text-foreground">
          Historiske årstal
        </h3>
      </div>

      <div className="space-y-3 flex-1">
        {annualData.map((yr, i) => {
          const prevYr = i > 0 ? annualData[i - 1] : null;
          const revChange =
            prevYr && prevYr.revenue > 0
              ? ((yr.revenue - prevYr.revenue) / prevYr.revenue) * 100
              : null;

          return (
            <div
              key={yr.year}
              className="rounded-lg border border-border/50 bg-secondary/30 p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground">
                  {yr.year}
                </span>
                {revChange != null && (
                  <span
                    className={`flex items-center gap-1 text-[10px] font-medium ${
                      revChange >= 0 ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {revChange >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {revChange >= 0 ? "+" : ""}
                    {revChange.toFixed(0)}% vs {prevYr!.year}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">Omsætning</p>
                  <p className="text-xs font-medium text-foreground">
                    {formatCompact(yr.revenue)} kr.
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    Resultat f. skat
                  </p>
                  <p
                    className={`text-xs font-medium ${
                      yr.result >= 0 ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {yr.result >= 0 ? "+" : ""}
                    {formatCompact(yr.result)} kr.
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Link
        to="/reports"
        className="mt-4 flex items-center justify-between text-xs text-primary hover:text-primary/80 font-medium group"
      >
        <span>Upload årsrapport</span>
        <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}
