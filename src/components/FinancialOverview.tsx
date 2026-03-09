import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";
import {
  parseReportPeriodToKey, getCanonicalOrLegacyMetrics, formatDKK, formatCompact, pctChange,
  SHORT_MONTHS, type ReportData,
} from "@/lib/financialUtils";
import PeriodSelector, { usePeriodFilter } from "@/components/PeriodSelector";

interface FinancialOverviewProps {
  reports: ReportData[];
}

type TabKey = "marginer" | "omkostninger" | "resultat" | "balance";

const tabs: { key: TabKey; label: string }[] = [
  { key: "marginer", label: "Marginer" },
  { key: "omkostninger", label: "Omkostninger" },
  { key: "resultat", label: "Resultat" },
  { key: "balance", label: "Balance" },
];

const FinancialOverview = ({ reports }: FinancialOverviewProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>("marginer");
  const period = usePeriodFilter();

  const allChartData = useMemo(() => {
    const processed = reports
      .filter(r => r.status === "processed")
      .map(r => {
        const key = parseReportPeriodToKey(r.report_period);
        const result = getCanonicalOrLegacyMetrics(r);
        if (!key || !result) return null;
        const [year, monthStr] = key.split("-");
        const monthIdx = parseInt(monthStr, 10) - 1;
        return { key, label: `${SHORT_MONTHS[monthIdx]} ${year}`, kf: result.metrics };
      })
      .filter(Boolean) as { key: string; label: string; kf: Record<string, number | null> }[];

    return processed.sort((a, b) => a.key.localeCompare(b.key));
  }, [reports]);

  const chartData = useMemo(() => {
    const allKeys = allChartData.map(d => d.key);
    const filtered = period.filterKeys(allKeys);
    return allChartData.filter(d => filtered.includes(d.key));
  }, [allChartData, period.mode, period.customFrom, period.customTo]);

  const periodLabel = useMemo(() => {
    return period.getPeriodLabel(chartData.map(d => d.key));
  }, [chartData, period]);

  if (chartData.length < 1) return null;

  const latest = chartData[chartData.length - 1];
  const prev = chartData.length >= 2 ? chartData[chartData.length - 2] : null;
  const kf = latest.kf;

  // Strict null-checks: only compute margin if both values are non-null and denominator != 0
  const dbMargin = kf.omsaetning != null && kf.daekningsbidrag != null && kf.omsaetning !== 0
    ? ((kf.daekningsbidrag / kf.omsaetning) * 100) : null;
  const dbMarginPrev = prev?.kf.omsaetning != null && prev?.kf.daekningsbidrag != null && prev.kf.omsaetning !== 0
    ? ((prev.kf.daekningsbidrag / prev.kf.omsaetning) * 100) : null;

  const netMargin = kf.omsaetning != null && kf.resultat_foer_skat != null && kf.omsaetning !== 0
    ? ((kf.resultat_foer_skat / kf.omsaetning) * 100) : null;

  const kpis = [
    {
      label: "Dækningsgrad",
      value: dbMargin != null ? `${dbMargin.toFixed(1)}%` : "—",
      change: dbMargin != null && dbMarginPrev != null ? dbMargin - dbMarginPrev : null,
    },
    {
      label: "Dækningsbidrag",
      value: kf.daekningsbidrag != null ? formatDKK(kf.daekningsbidrag) : "—",
      change: pctChange(kf.daekningsbidrag, prev?.kf.daekningsbidrag),
    },
    {
      label: "Netto Margin",
      value: netMargin != null ? `${netMargin.toFixed(1)}%` : "—",
      change: pctChange(kf.resultat_foer_skat, prev?.kf.resultat_foer_skat),
    },
    {
      label: "EBITDA Margin",
      value: kf.omsaetning != null && kf.resultat_foer_skat != null && kf.omsaetning !== 0
        ? `${((kf.resultat_foer_skat / kf.omsaetning) * 100).toFixed(1)}%` : "—",
      change: null,
    },
  ];

  const tabChartData = chartData.map(d => {
    const k = d.kf;
    return {
      label: d.label,
      // AreaChart: use null for gaps (no false dips)
      omsaetning: k.omsaetning ?? null,
      daekningsbidrag: k.daekningsbidrag ?? null,
      resultat_foer_skat: k.resultat_foer_skat ?? null,
      // BarChart: use ?? 0 because bars can't render null height
      loenninger: k.loenninger ?? 0,
      direkte_omkostninger: k.direkte_omkostninger ?? 0,
      aktiver_i_alt: k.aktiver_i_alt ?? 0,
      passiver_i_alt: (k as any).passiver_i_alt ?? 0,
      egenkapital: k.egenkapital ?? 0,
      bank_balance: k.bank_balance ?? 0, // sign preserved
    };
  });

  return (
    <div className="glass-card rounded-xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Detaljeret Finansiel Oversigt
        </h2>
      </div>

      <div className="mb-4">
        <PeriodSelector
          mode={period.mode}
          onModeChange={period.setMode}
          customFrom={period.customFrom}
          customTo={period.customTo}
          onCustomFromChange={period.setCustomFrom}
          onCustomToChange={period.setCustomTo}
          periodLabel={periodLabel}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-secondary/30 p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
            <p className="text-xl font-bold text-foreground mt-1">{kpi.value}</p>
            {kpi.change != null && (
              <p className={`text-xs font-medium mt-1 ${kpi.change >= 0 ? "text-primary" : "text-destructive"}`}>
                {kpi.change >= 0 ? "▲" : "▼"} {Math.abs(kpi.change).toFixed(1)}%
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-1 mb-6 p-1 rounded-lg bg-secondary/50">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 text-xs font-medium py-2 px-3 rounded-md transition-all ${
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {activeTab === "marginer" ? (
            <AreaChart data={tabChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, name: string) => [formatDKK(v), { omsaetning: "Omsætning", daekningsbidrag: "Dækningsbidrag", resultat_foer_skat: "Resultat" }[name] || name]} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} />
              <Legend formatter={(v: string) => ({ omsaetning: "Omsætning", daekningsbidrag: "Dækningsbidrag", resultat_foer_skat: "Resultat" }[v] || v)} />
              <Area type="monotone" dataKey="omsaetning" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" strokeWidth={2} connectNulls />
              <Area type="monotone" dataKey="daekningsbidrag" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2) / 0.1)" strokeWidth={2} connectNulls />
              <Area type="monotone" dataKey="resultat_foer_skat" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3) / 0.1)" strokeWidth={2} connectNulls />
            </AreaChart>
          ) : activeTab === "omkostninger" ? (
            <BarChart data={tabChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, name: string) => [formatDKK(v), { loenninger: "Lønninger", direkte_omkostninger: "Direkte omk." }[name] || name]} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} />
              <Legend formatter={(v: string) => ({ loenninger: "Lønninger", direkte_omkostninger: "Direkte omk." }[v] || v)} />
              <Bar dataKey="loenninger" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="direkte_omkostninger" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : activeTab === "resultat" ? (
            <AreaChart data={tabChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [formatDKK(v), "Resultat f. skat"]} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} />
              <Area type="monotone" dataKey="resultat_foer_skat" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2.5} connectNulls />
            </AreaChart>
          ) : (
            <BarChart data={tabChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, name: string) => [formatDKK(v), { aktiver_i_alt: "Aktiver", egenkapital: "Egenkapital", bank_balance: "Bank" }[name] || name]} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} />
              <Legend formatter={(v: string) => ({ aktiver_i_alt: "Aktiver", egenkapital: "Egenkapital", bank_balance: "Bank" }[v] || v)} />
              <Bar dataKey="aktiver_i_alt" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="egenkapital" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="bank_balance" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FinancialOverview;