import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface ReportData {
  id: string;
  report_period: string | null;
  extracted_data: Json | null;
  status: string;
}

interface PerformanceOverviewProps {
  reports: ReportData[];
}

const DANISH_MONTHS = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

function parseKey(period: string | null): string | null {
  if (!period) return null;
  for (let i = 0; i < DANISH_MONTHS.length; i++) {
    if (period.toLowerCase().includes(DANISH_MONTHS[i].toLowerCase())) {
      const y = period.match(/\d{4}/);
      if (y) return `${y[0]}-${String(i + 1).padStart(2, "0")}`;
    }
  }
  return null;
}

function getKF(report: ReportData): Record<string, number> | null {
  if (!report.extracted_data || typeof report.extracted_data !== "object" || Array.isArray(report.extracted_data)) return null;
  return (report.extracted_data as Record<string, Json | undefined>).key_figures as Record<string, number> | null;
}

const formatDKK = (n?: number) =>
  n != null ? `${n.toLocaleString("da-DK")} kr.` : "—";

const PerformanceOverview = ({ reports }: PerformanceOverviewProps) => {
  const data = useMemo(() => {
    const sorted = reports
      .filter(r => r.status === "processed")
      .map(r => ({ key: parseKey(r.report_period), kf: getKF(r), period: r.report_period }))
      .filter((d): d is { key: string; kf: Record<string, number>; period: string } => !!d.key && !!d.kf)
      .sort((a, b) => a.key.localeCompare(b.key));
    return sorted;
  }, [reports]);

  if (data.length < 1) return null;

  const latest = data[data.length - 1];
  const prev = data.length >= 2 ? data[data.length - 2] : null;
  const kf = latest.kf;

  const pctChange = (curr: number | undefined, prevVal: number | undefined) => {
    if (curr == null || prevVal == null || prevVal === 0) return null;
    return ((curr - prevVal) / Math.abs(prevVal)) * 100;
  };

  const metrics = [
    {
      label: "YTD Omsætning",
      value: formatDKK(kf.omsaetning_aar),
      change: null,
      large: true,
    },
    {
      label: "YTD Resultat",
      value: formatDKK(kf.resultat_foer_skat_aar),
      change: null,
      large: true,
    },
    {
      label: "Seneste Måned",
      value: latest.period,
      sub: formatDKK(kf.omsaetning),
      change: pctChange(kf.omsaetning, prev?.kf.omsaetning),
      large: true,
    },
  ];

  const kpis = [
    {
      label: "DB Margin %",
      value: kf.omsaetning && kf.daekningsbidrag
        ? `${((kf.daekningsbidrag / kf.omsaetning) * 100).toFixed(1)}%`
        : "—",
    },
    {
      label: "Oms. ændring M/M",
      value: (() => {
        const c = pctChange(kf.omsaetning, prev?.kf.omsaetning);
        return c != null ? `${c >= 0 ? "+" : ""}${c.toFixed(1)}%` : "—";
      })(),
      change: pctChange(kf.omsaetning, prev?.kf.omsaetning),
    },
    {
      label: "Løn % af oms.",
      value: kf.omsaetning && kf.loenninger
        ? `${((kf.loenninger / kf.omsaetning) * 100).toFixed(1)}%`
        : "—",
    },
    {
      label: "Netto Resultat %",
      value: kf.omsaetning && kf.resultat_foer_skat
        ? `${((kf.resultat_foer_skat / kf.omsaetning) * 100).toFixed(1)}%`
        : "—",
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

      {/* Main metrics */}
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

      {/* KPI row */}
      <div className="mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Nøgletal</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => (
            <div key={i} className="rounded-lg border border-border/30 bg-background/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${
                kpi.change != null
                  ? kpi.change >= 0 ? "text-primary" : "text-destructive"
                  : "text-foreground"
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
