import { useMemo } from "react";
import { TrendingUp, Flame, DollarSign, BarChart3, Activity } from "lucide-react";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { useAppConfig } from "@/hooks/useAppConfig";

interface MetricScore {
  label: string;
  value: string;
  score: number;
  icon: typeof TrendingUp;
  detail: string;
}

function getScoreColor(score: number) {
  if (score >= 75) return "text-primary";
  if (score >= 50) return "text-chart-warning";
  return "text-destructive";
}

function getScoreBg(score: number) {
  if (score >= 75) return "bg-primary";
  if (score >= 50) return "bg-chart-warning";
  return "bg-destructive";
}

function getScoreLabel(score: number, labels: readonly { min: number; label: string }[]) {
  for (const { min, label } of labels) {
    if (score >= min) return label;
  }
  return labels[labels.length - 1].label;
}

const PerformanceScore = () => {
  const { performanceScore: PERF } = useAppConfig();
  const { data: facts = [] } = useCompanyFacts();

  const metrics = useMemo((): MetricScore[] => {
    if (facts.length === 0) return [];

    const sorted = facts
      .map(f => ({ key: f.period_key, kf: factsToDanishMetrics(f.metrics) }))
      .filter((d): d is { key: string; kf: Record<string, number> } =>
        !!d.key && Object.keys(d.kf).length > 0
      )
      .sort((a, b) => a.key.localeCompare(b.key));

    if (sorted.length === 0) return [];
    const latest = sorted[sorted.length - 1].kf;
    const prev = sorted.length >= 2 ? sorted[sorted.length - 2].kf : null;

    const revenueGrowth = prev?.omsaetning && latest.omsaetning
      ? ((latest.omsaetning - prev.omsaetning) / Math.abs(prev.omsaetning)) * 100 : 0;
    const growthScore = Math.min(100, Math.max(0, 50 + revenueGrowth * PERF.growthMultiplier));

    const dbMargin = latest.omsaetning && latest.daekningsbidrag
      ? (latest.daekningsbidrag / latest.omsaetning) * 100 : 0;
    const marginScore = Math.min(100, Math.max(0, dbMargin * PERF.marginMultiplier));

    const netMargin = latest.omsaetning && latest.resultat_foer_skat
      ? (latest.resultat_foer_skat / latest.omsaetning) * 100 : 0;
    const profitScore = Math.min(100, Math.max(0, 50 + netMargin * PERF.profitMultiplier));

    const bankScore = latest.bank_balance
      ? Math.min(100, Math.max(0, (latest.bank_balance / (Math.abs(latest.loenninger || PERF.defaultSalaryFallback) * PERF.liquidityMonths)) * 100))
      : 50;

    return [
      { label: "Vækstrate", value: `${revenueGrowth >= 0 ? "+" : ""}${revenueGrowth.toFixed(1)}%`, score: Math.round(growthScore), icon: TrendingUp, detail: "Omsætningsvækst M/M" },
      { label: "Bruttomargin", value: `${dbMargin.toFixed(1)}%`, score: Math.round(marginScore), icon: DollarSign, detail: "Dækningsgrad" },
      { label: "Nettoresultat", value: `${netMargin.toFixed(1)}%`, score: Math.round(profitScore), icon: Flame, detail: "Overskudsgrad" },
      { label: "Likviditet", value: latest.bank_balance ? `${(latest.bank_balance / 1000).toFixed(0)}k` : "—", score: Math.round(bankScore), icon: BarChart3, detail: "Banksaldo vs. 6 mdr. løn" },
    ];
  }, [reports, PERF]);

  const overallScore = useMemo(() => {
    if (metrics.length === 0) return 0;
    const weights = PERF.weights;
    return Math.round(metrics.reduce((sum, m, i) => sum + m.score * (weights[i] || 0.25), 0));
  }, [metrics, PERF]);

  const scoreColor = getScoreColor(overallScore);
  const scoreBg = getScoreBg(overallScore);
  const scoreLabel = getScoreLabel(overallScore, PERF.labels || []);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallScore / 100) * circumference;

  if (metrics.length === 0) {
    return (
      <div className="glass-card rounded-xl p-5 animate-fade-in">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-foreground">Performance Score</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          Upload mindst én rapport for at se din performance score.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-foreground">Performance Score</h3>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${scoreBg}/10 ${scoreColor}`}>
          {scoreLabel}
        </span>
      </div>

      <div className="flex items-center gap-6 mb-5">
        <div className="relative flex-shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
            <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--primary))" strokeWidth="8"
              strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-display font-bold ${scoreColor}`}>{overallScore}</span>
            <span className="text-[10px] text-foreground/60 uppercase tracking-wider">/ 100</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Din samlede forretningssundhed baseret på vækst, marginer, resultat og likviditet.
          </p>
          <p className="text-[10px] text-foreground/50">Baseret på uploadede rapporter</p>
        </div>
      </div>

      <div className="space-y-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const color = getScoreColor(metric.score);
          const bg = getScoreBg(metric.score);
          return (
            <div key={metric.label} className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-secondary">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">{metric.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{metric.value}</span>
                    <span className={`text-[10px] font-bold ${color}`}>{metric.score}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${bg}`} style={{ width: `${metric.score}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{metric.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PerformanceScore;
