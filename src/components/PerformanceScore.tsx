import { useMemo } from "react";
import { TrendingUp, TrendingDown, Flame, DollarSign, BarChart3, Activity } from "lucide-react";

interface MetricScore {
  label: string;
  value: string;
  score: number; // 0-100
  icon: any;
  detail: string;
}

const METRICS: MetricScore[] = [
  {
    label: "Vækstrate",
    value: "+17,3%",
    score: 82,
    icon: TrendingUp,
    detail: "MRR vækst MoM",
  },
  {
    label: "Burn Rate",
    value: "75k/mdr",
    score: 71,
    icon: Flame,
    detail: "Faldende trend ↓4,2%",
  },
  {
    label: "Bruttomargin",
    value: "34,8%",
    score: 58,
    icon: DollarSign,
    detail: "Under benchmark (50%)",
  },
  {
    label: "Runway",
    value: "14 mdr.",
    score: 88,
    icon: BarChart3,
    detail: "Ved nuværende burn",
  },
];

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

function getScoreLabel(score: number) {
  if (score >= 80) return "Stærk";
  if (score >= 65) return "Sund";
  if (score >= 50) return "OK";
  if (score >= 35) return "Svag";
  return "Kritisk";
}

const PerformanceScore = () => {
  const overallScore = useMemo(() => {
    const weights = [0.3, 0.25, 0.2, 0.25]; // growth, burn, margin, runway
    return Math.round(
      METRICS.reduce((sum, m, i) => sum + m.score * weights[i], 0)
    );
  }, []);

  const scoreColor = getScoreColor(overallScore);
  const scoreBg = getScoreBg(overallScore);
  const scoreLabel = getScoreLabel(overallScore);

  // Calculate stroke for circular progress
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallScore / 100) * circumference;

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

      {/* Score ring */}
      <div className="flex items-center gap-6 mb-5">
        <div className="relative flex-shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="8"
            />
            {/* Score circle */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-display font-bold ${scoreColor}`}>
              {overallScore}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              / 100
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-1.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Din samlede forretningssundhed baseret på vækst, burn rate, marginer og runway.
          </p>
          <p className="text-[10px] text-muted-foreground">
            Opdateret · Februar 2026
          </p>
        </div>
      </div>

      {/* Individual metrics */}
      <div className="space-y-3">
        {METRICS.map((metric) => {
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
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${bg}`}
                    style={{ width: `${metric.score}%` }}
                  />
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
