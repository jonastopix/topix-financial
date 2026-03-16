import { useState } from "react";
import { Navigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useGroupBudget, type GroupBudgetCompany, type GroupBudgetTotals } from "@/hooks/useGroupBudget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/budgetTemplates";
import { MONTHS } from "@/components/budget/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1].map(String);

function formatK(v: number): string {
  if (v === 0) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(v / 1000))}k`;
}

const REASON_LABELS: Record<string, string> = {
  no_template: "Ingen budgetskabelon valgt",
  ambiguous_template: "Flere skabeloner fundet",
  no_budget: "Ingen budgetdata for året",
  unmapped_categories: "Ukendte budgetkategorier",
};

const REASON_ICONS: Record<string, typeof AlertTriangle> = {
  no_template: XCircle,
  ambiguous_template: AlertTriangle,
  no_budget: XCircle,
  unmapped_categories: AlertTriangle,
};

const GroupBudget = () => {
  const { isGroupUser, isAdvisor, loading } = useAuth();
  const [year, setYear] = useState(String(currentYear));
  const { data, isLoading, error } = useGroupBudget(year);

  // Member-only gate — advisors blocked
  if (!loading && (!isGroupUser || isAdvisor)) {
    return <Navigate to="/" replace />;
  }

  const totalCompanies = (data?.included.length ?? 0) + (data?.excluded.length ?? 0);
  const includedCount = data?.included.length ?? 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Koncernbudget</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Samlet budgetoverblik (base-scenarie) på tværs af koncernen
            </p>
          </div>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center text-destructive">
              Der opstod en fejl ved hentning af koncernbudget.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Coverage */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  Dækning
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Koncernbudget baseret på{" "}
                  <span className="font-semibold text-foreground">{includedCount} af {totalCompanies}</span>{" "}
                  virksomheder
                </p>

                {/* Included */}
                {data!.included.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Inkluderet</p>
                    <div className="flex flex-wrap gap-2">
                      {data!.included.map((c) => (
                        <Badge key={c.company_id} variant="secondary" className="gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          {c.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Excluded */}
                {data!.excluded.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Ekskluderet</p>
                    <div className="space-y-1.5">
                      {data!.excluded.map((c) => {
                        const ReasonIcon = REASON_ICONS[c.reason ?? ""] ?? XCircle;
                        return (
                          <div key={c.company_id} className="flex items-start gap-2 text-sm">
                            <ReasonIcon className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <div>
                              <span className="font-medium text-foreground">{c.name}</span>
                              <span className="text-muted-foreground"> — {REASON_LABELS[c.reason ?? ""] ?? c.reason}</span>
                              {c.unmapped_keys && c.unmapped_keys.length > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="ml-1.5 text-xs text-muted-foreground underline decoration-dotted cursor-help">
                                      ({c.unmapped_keys.length} kategorier)
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">
                                    <p className="text-xs">{c.unmapped_keys.join(", ")}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Totals table */}
            {includedCount > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Samlet budget {year} (base)
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <TotalsTable totals={data!.totals} />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Ingen virksomheder med gyldigt budget for {year}.
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

function TotalsTable({ totals }: { totals: GroupBudgetTotals }) {
  // Calculate net row (indtaegter minus all cost groups)
  const netRow = Array(12).fill(0).map((_, i) => {
    return (
      totals.indtaegter[i] -
      totals.variable[i] -
      totals.personale[i] -
      totals.salg_marketing[i] -
      totals.drift[i] -
      totals.faste[i]
    );
  });

  const annualSum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-2 pr-4 font-medium text-muted-foreground sticky left-0 bg-card min-w-[140px]">
            Gruppe
          </th>
          {MONTHS.map((m) => (
            <th key={m} className="text-right py-2 px-1.5 font-medium text-muted-foreground min-w-[52px]">
              {m}
            </th>
          ))}
          <th className="text-right py-2 pl-3 font-semibold text-foreground min-w-[60px]">
            Årlig
          </th>
        </tr>
      </thead>
      <tbody>
        {GROUP_ORDER.map((gk) => {
          const values = totals[gk as keyof GroupBudgetTotals];
          const isRevenue = gk === "indtaegter";
          return (
            <tr key={gk} className="border-b border-border/50">
              <td className="py-2 pr-4 font-medium text-foreground sticky left-0 bg-card">
                {GROUP_LABELS[gk] ?? gk}
              </td>
              {values.map((v, i) => (
                <td key={i} className={`text-right py-2 px-1.5 tabular-nums ${isRevenue ? "text-primary" : "text-foreground"}`}>
                  {formatK(v)}
                </td>
              ))}
              <td className={`text-right py-2 pl-3 font-semibold tabular-nums ${isRevenue ? "text-primary" : "text-foreground"}`}>
                {formatK(annualSum(values))}
              </td>
            </tr>
          );
        })}
        {/* Net row */}
        <tr className="border-t-2 border-border">
          <td className="py-2 pr-4 font-bold text-foreground sticky left-0 bg-card">
            Nettoresultat
          </td>
          {netRow.map((v, i) => (
            <td key={i} className={`text-right py-2 px-1.5 font-bold tabular-nums ${v >= 0 ? "text-primary" : "text-destructive"}`}>
              {formatK(v)}
            </td>
          ))}
          <td className={`text-right py-2 pl-3 font-bold tabular-nums ${annualSum(netRow) >= 0 ? "text-primary" : "text-destructive"}`}>
            {formatK(annualSum(netRow))}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default GroupBudget;
