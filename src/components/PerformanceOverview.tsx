import { useMemo } from "react";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetricsNullable } from "@/lib/factsAdapter";
import { formatDKK, pctChange } from "@/lib/financialUtils";

const PerformanceOverview = () => {
  const { data: facts = [] } = useCompanyFacts();

  const data = useMemo(() => {
    return facts.map((f) => ({
      key: f.period_key,
      kf: factsToDanishMetricsNullable(f.metrics),
      period: f.period_label,
    }));
  }, [facts]);

  if (data.length < 1) return null;

  const latest = data[data.length - 1];
  const prev = data.length >= 2 ? data[data.length - 2] : null;
  const kf = latest.kf;

  const [latestYear] = latest.key.split("-");
  const currentYearReports = data.filter(r => r.key.startsWith(latestYear));
  const ytdRevenue = currentYearReports.reduce((s, r) => s + (r.kf.omsaetning ?? 0), 0);
  const ytdResult = currentYearReports.reduce((s, r) => s + (r.kf.resultat_foer_skat ?? 0), 0);

  const metrics = [
    { label: "YTD Omsætning", value: formatDKK(ytdRevenue), change: null, large: true },
    { label: "YTD Resultat", value: formatDKK(ytdResult), change: null, large: true },
    {
      label: "Seneste Måned", value: latest.period,
      sub: formatDKK(kf.omsaetning),
      change: pctChange(kf.omsaetning, prev?.kf.omsaetning), large: true,
    },
  ];

  const kpis = [
    {
      label: "DB Margin %",
      value: kf.omsaetning != null && kf.daekningsbidrag != null && kf.omsaetning !== 0
        ? `${((kf.daekningsbidrag / kf.omsaetning) * 100).toFixed(1)}%` : "—",
    },
    {
      label: "Oms. ændring M/M",
      value: (() => { const c = pctChange(kf.omsaetning, prev?.kf.omsaetning); return c != null ? `${c >= 0 ? "+" : ""}${c.toFixed(1)}%` : "—"; })(),
      change: pctChange(kf.omsaetning, prev?.kf.omsaetning),
    },
    {
      label: "Løn % af oms.",
      value: kf.omsaetning != null && kf.loenninger != null && kf.omsaetning !== 0
        ? `${((kf.loenninger / kf.omsaetning) * 100).toFixed(1)}%` : "—",
    },
    {
      label: "Netto Resultat %",
      value: kf.omsaetning != null && kf.resultat_foer_skat != null && kf.omsaetning !== 0
        ? `${((kf.resultat_foer_skat / kf.omsaetning) * 100).toFixed(1)}%` : "—",
      change: pctChange(kf.resultat_foer_skat, prev?.kf.resultat_foer_skat),
    },
  ];

  return (
    <div className="glass-card rounded-xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Performance Oversigt
        </h2>
        <span className="text-xs text-muted-foreground">{latest.key.split("-")[0]}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {metrics.map((m, i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-secondary/20 p-5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{m.value}</p>
            {m.sub && <p className="text-sm text-muted-foreground mt-0.5">{m.sub}</p>}
            {m.change != null && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${m.change >= 0 ? "text-primary" : "text-destructive"}`}>
                {m.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {m.change >= 0 ? "+" : ""}{m.change.toFixed(1)}% vs forrige
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Nøgletal</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => (
            <div key={i} className="rounded-lg border border-border/30 bg-background/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${
                (kpi as any).change != null ? (kpi as any).change >= 0 ? "text-primary" : "text-destructive" : "text-foreground"
              }`}>
                {kpi.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PerformanceOverview;
