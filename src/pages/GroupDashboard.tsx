import { Navigate, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useGroupDashboard } from "@/hooks/useGroupDashboard";
import GroupCompanyCard from "@/components/GroupCompanyCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, TrendingUp, AlertTriangle, Loader2, MessageCircle } from "lucide-react";

function formatDKK(value: number): string {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(value);
}

const GroupDashboard = () => {
  const { isGroupUser, loading } = useAuth();
  const { companies, aggregates, isLoading, groupName } = useGroupDashboard();

  // Page-level guard: member-only, group-only
  if (!loading && !isGroupUser) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {groupName ?? "Koncernoverblik"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Samlet overblik over alle virksomheder i koncernen
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Aggregated KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard
                label="Samlet omsætning"
                value={formatDKK(aggregates.totalRevenue)}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <KPICard
                label="Samlet bruttofortjeneste"
                value={formatDKK(aggregates.totalGrossProfit)}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <KPICard
                label="Samlet resultat før skat"
                value={formatDKK(aggregates.totalEbt)}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <KPICard
                label="Samlet likvider"
                value={formatDKK(aggregates.totalCash)}
                icon={<TrendingUp className="h-4 w-4" />}
              />
            </div>

            {/* Completeness summary */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>
                  {aggregates.companiesWithMetrics} af {aggregates.companiesTotal} virksomheder med verificerede tal
                </span>
              </div>
              {aggregates.companiesMissingPeriod > 0 && (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    {aggregates.companiesMissingPeriod} mangler aktuel periode
                  </span>
                </div>
              )}
            </div>

            {/* Company list */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">Virksomheder</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {companies.map((c) => (
                  <GroupCompanyCard key={c.company_id} company={c} />
                ))}
              </div>
              {companies.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Ingen virksomheder i koncernen endnu.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

function KPICard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <p className="text-lg font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

export default GroupDashboard;
