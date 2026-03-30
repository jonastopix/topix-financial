import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Building2, TrendingUp, Loader2, DollarSign, Wallet,
  BarChart3, FileCheck, AlertTriangle, MessageSquare,
} from "lucide-react";
import { CompanyTableRow } from "@/components/GroupCompanyCard";
import GroupCompanyCard from "@/components/GroupCompanyCard";
import type { GroupCompanySummary, GroupAggregates } from "@/lib/groupDashboardUtils";
import { useIsMobile } from "@/hooks/use-mobile";

function formatDKK(value: number): string {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(value);
}

type FilterTab = "alle" | "attention" | "top";
type SortKey = "revenue" | "ebt" | "trend";

function needsAttention(c: GroupCompanySummary): boolean {
  return (c.cash != null && c.cash < 0) || c.missing_current_period;
}

function isTopPerformer(c: GroupCompanySummary): boolean {
  return c.has_verified_metrics && (c.ebt ?? 0) > 0 && (c.revenue ?? 0) > 0;
}

interface GroupDashboardContentProps {
  companies: GroupCompanySummary[];
  aggregates: GroupAggregates;
  isLoading: boolean;
  groupName: string | null;
  actions?: React.ReactNode;
  onCompanyClick?: (companyId: string, companyName: string) => void;
  onUploadClick?: (companyId: string, companyName: string) => void;
}

const GroupDashboardContent = ({
  companies,
  aggregates,
  isLoading,
  groupName,
  actions,
  onCompanyClick,
  onUploadClick,
}: GroupDashboardContentProps) => {
  const [filter, setFilter] = useState<FilterTab>("alle");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const isMobile = useIsMobile();

  const compliancePct = aggregates.companiesTotal > 0
    ? Math.round((aggregates.companiesWithMetrics / aggregates.companiesTotal) * 100)
    : 0;

  const companiesNegCash = companies.filter(c => c.cash != null && c.cash < 0).length;
  const companiesUpdated = aggregates.companiesWithMetrics;
  const companiesMissing = aggregates.companiesMissingPeriod;

  // Latest period label from any company
  const latestPeriod = companies.find(c => c.effective_period_label)?.effective_period_label ?? null;

  // Filtered + sorted
  const filteredCompanies = useMemo(() => {
    let list = [...companies];

    if (filter === "attention") list = list.filter(needsAttention);
    if (filter === "top") list = list.filter(isTopPerformer);

    list.sort((a, b) => {
      switch (sortKey) {
        case "revenue": return (b.revenue ?? 0) - (a.revenue ?? 0);
        case "ebt": return (b.ebt ?? 0) - (a.ebt ?? 0);
        case "trend": {
          const tA = a.revenue != null && a.revenue_prev != null && a.revenue_prev > 0
            ? ((a.revenue - a.revenue_prev) / a.revenue_prev) * 100 : -Infinity;
          const tB = b.revenue != null && b.revenue_prev != null && b.revenue_prev > 0
            ? ((b.revenue - b.revenue_prev) / b.revenue_prev) * 100 : -Infinity;
          return tB - tA;
        }
        default: return 0;
      }
    });

    return list;
  }, [companies, filter, sortKey]);

  const attentionCompanies = useMemo(() => companies.filter(needsAttention), [companies]);
  const missingReportCompanies = useMemo(() => companies.filter(c => c.missing_current_period), [companies]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {groupName ?? "Koncernoverblik"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {aggregates.companiesTotal} virksomheder
            {latestPeriod ? ` · Seneste periode: ${latestPeriod}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {companiesMissing > 0 && (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800 text-xs gap-1">
              <AlertTriangle className="h-3 w-3" />
              {companiesMissing} mangler rapport
            </Badge>
          )}
          {companiesUpdated > 0 && (
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800 text-xs gap-1">
              <FileCheck className="h-3 w-3" />
              {companiesUpdated} opdaterede
            </Badge>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Top Metrics Row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              icon={<DollarSign className="h-4 w-4" />}
              label="Samlet omsætning"
              value={formatDKK(aggregates.totalRevenue)}
              extra={aggregates.totalRevenueTrendPct != null ? (
                <span className={`text-[11px] font-medium ${aggregates.totalRevenueTrendPct >= 0 ? "text-primary" : "text-destructive"}`}>
                  {aggregates.totalRevenueTrendPct >= 0 ? "↑" : "↓"} {Math.abs(Math.round(aggregates.totalRevenueTrendPct))}% MoM
                </span>
              ) : undefined}
            />
            <MetricCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Samlet resultat"
              value={formatDKK(aggregates.totalEbt)}
              valueClass={(aggregates.totalEbt) < 0 ? "text-destructive" : undefined}
            />
            <MetricCard
              icon={<Wallet className="h-4 w-4" />}
              label="Samlet likviditet"
              value={formatDKK(aggregates.totalCash)}
              extra={companiesNegCash > 0 ? (
                <span className="text-[10px] text-destructive font-medium">
                  {companiesNegCash} med negativ saldo
                </span>
              ) : undefined}
            />
            <MetricCard
              icon={<BarChart3 className="h-4 w-4" />}
              label="Rapport-compliance"
              value={`${compliancePct}%`}
              extra={
                <Progress value={compliancePct} className="h-1 mt-1" />
              }
            />
          </div>

          {/* ── Filter + Sort Controls ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-1">
              {(["alle", "attention", "top"] as FilterTab[]).map(tab => (
                <Button
                  key={tab}
                  variant={filter === tab ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setFilter(tab)}
                >
                  {tab === "alle" ? "Alle" : tab === "attention" ? "Kræver opmærksomhed" : "Topperformere"}
                  {tab === "attention" && attentionCompanies.length > 0 && (
                    <span className="ml-1 text-[10px] opacity-70">({attentionCompanies.length})</span>
                  )}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground mr-1 uppercase tracking-wider">Sortér:</span>
              {(["revenue", "ebt", "trend"] as SortKey[]).map(key => (
                <Button
                  key={key}
                  variant={sortKey === key ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setSortKey(key)}
                >
                  {key === "revenue" ? "Omsætning" : key === "ebt" ? "Resultat" : "Trend"}
                </Button>
              ))}
            </div>
          </div>

          {/* ── Company Table (desktop) / Card list (mobile) ── */}
          {isMobile ? (
            <div className="space-y-3">
              {filteredCompanies.map(c => (
                <GroupCompanyCard key={c.company_id} company={c} onCompanyClick={onCompanyClick} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-2.5 px-4 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Virksomhed</th>
                    <th className="py-2.5 px-4 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Omsætning</th>
                    <th className="py-2.5 px-4 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Resultat</th>
                    <th className="py-2.5 px-4 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Trend</th>
                    <th className="py-2.5 px-4 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Likviditet</th>
                    <th className="py-2.5 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.map(c => (
                    <CompanyTableRow key={c.company_id} company={c} onCompanyClick={onCompanyClick} onUploadClick={onUploadClick} />
                  ))}
                </tbody>
              </table>
              {filteredCompanies.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {filter === "alle" ? "Ingen virksomheder i koncernen endnu." : "Ingen virksomheder matcher dette filter."}
                </p>
              )}
            </div>
          )}

          {/* ── Bottom Row ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Kræver opfølgning */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Kræver opfølgning nu
                  </span>
                </div>
                {attentionCompanies.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ingen virksomheder kræver opfølgning lige nu.</p>
                ) : (
                  <ul className="space-y-2">
                    {attentionCompanies.slice(0, 5).map(c => (
                      <li key={c.company_id} className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                          {c.logo_url ? (
                            <img src={c.logo_url} alt="" className="h-full w-full object-contain" />
                          ) : (
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                        <span className="text-xs text-foreground truncate flex-1">{c.company_name}</span>
                        {c.cash != null && c.cash < 0 && (
                          <span className="text-[10px] text-destructive font-medium shrink-0">Negativ saldo</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Ikke rapporteret */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Ikke rapporteret
                  </span>
                </div>
                {missingReportCompanies.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Alle virksomheder har rapporteret.</p>
                ) : (
                  <ul className="space-y-2">
                    {missingReportCompanies.map(c => (
                      <li key={c.company_id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-5 w-5 rounded bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                            {c.logo_url ? (
                              <img src={c.logo_url} alt="" className="h-full w-full object-contain" />
                            ) : (
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-xs text-foreground truncate">{c.company_name}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1 shrink-0">
                          <MessageSquare className="h-3 w-3" />
                          Send påmindelse
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

function MetricCard({ icon, label, value, valueClass, extra }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  extra?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        </div>
        <p className={`text-lg font-bold ${valueClass || "text-foreground"}`}>{value}</p>
        {extra}
      </CardContent>
    </Card>
  );
}

export default GroupDashboardContent;
