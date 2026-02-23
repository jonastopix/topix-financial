import { useState } from "react";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Lightbulb,
  Target,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface KeyFinding {
  title: string;
  analysis: string;
  recommendation: string;
  severity: "positiv" | "advarsel" | "kritisk";
}

interface TrendItem {
  title: string;
  description: string;
  metric: string;
  period: string;
}

interface AnalysisData {
  overview: string;
  key_findings: KeyFinding[];
  positive_trends: TrendItem[];
  challenges: TrendItem[];
  strategic_questions: string[];
  next_steps: string[];
}

// Mock historical data to feed the AI
const currentFinancialData = {
  period: "Oktober 2025",
  omsaetning: 74731,
  direkte_omkostninger: 1862,
  daekningsbidrag: 72869,
  loenninger: 31966,
  marketing: 24661,
  administration: 24530,
  afskrivninger: 2911,
  resultat: -15149,
  aktiver: 221219,
  bank: 61095,
  egenkapital: 131343,
  kreditorer: 44938,
};

const historicalData = [
  { period: "Maj 2025", omsaetning: 28500, resultat: -28700, bank: 82000, marketing: 15200, loenninger: 28000 },
  { period: "Jun 2025", omsaetning: 35200, resultat: -32050, bank: 65000, marketing: 22100, loenninger: 29500 },
  { period: "Jul 2025", omsaetning: 42800, resultat: -33300, bank: 48000, marketing: 28500, loenninger: 30200 },
  { period: "Aug 2025", omsaetning: 51400, resultat: -32250, bank: 42000, marketing: 32400, loenninger: 31000 },
  { period: "Sep 2025", omsaetning: 62100, resultat: -28050, bank: 51000, marketing: 35800, loenninger: 31500 },
  { period: "Okt 2025", omsaetning: 74731, resultat: -15149, bank: 61095, marketing: 24661, loenninger: 31966 },
];

const severityConfig = {
  positiv: {
    icon: CheckCircle2,
    bg: "bg-primary/10",
    border: "border-primary/20",
    text: "text-primary",
    label: "Positiv",
  },
  advarsel: {
    icon: AlertTriangle,
    bg: "bg-chart-warning/10",
    border: "border-chart-warning/20",
    text: "text-chart-warning",
    label: "Advarsel",
  },
  kritisk: {
    icon: AlertCircle,
    bg: "bg-destructive/10",
    border: "border-destructive/20",
    text: "text-destructive",
    label: "Kritisk",
  },
};

const AIFinancialAnalysis = () => {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);
  const [showAllTrends, setShowAllTrends] = useState(false);

  const generateAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-financial-feedback", {
        body: {
          financialData: currentFinancialData,
          historicalData,
          companyContext: { name: "Demo Startup ApS", cvr: "12345678" },
        },
      });

      if (error) throw error;
      setAnalysis(data);
      setExpandedFinding(0); // Auto-expand first finding
    } catch (e: any) {
      console.error("AI analysis error:", e);
      toast.error(e.message || "Kunne ikke generere analyse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-display font-semibold text-foreground">
              AI Finansiel Analyse
            </h2>
            <p className="text-xs text-muted-foreground">
              {analysis
                ? `Genereret · Baseret på ${historicalData.length} måneders data`
                : "Dybdegående AI-analyse af din virksomheds økonomi"}
            </p>
          </div>
        </div>
        <button
          onClick={generateAnalysis}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyserer...
            </>
          ) : analysis ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Generer ny
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Generer analyse
            </>
          )}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="glass-card rounded-xl p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-foreground font-medium">Analyserer dine finansielle data...</p>
          <p className="text-xs text-muted-foreground mt-1">
            AI gennemgår {historicalData.length} måneders historik og identificerer mønstre
          </p>
        </div>
      )}

      {/* Analysis content */}
      {analysis && !loading && (
        <>
          {/* Overview */}
          <div className="glass-card rounded-xl p-6 border-l-4 border-l-primary">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Overblik
            </h3>
            <p className="text-sm text-foreground leading-relaxed">{analysis.overview}</p>
          </div>

          {/* Key Findings */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Nøglefund
            </h3>
            <div className="space-y-3">
              {analysis.key_findings.map((finding, i) => {
                const config = severityConfig[finding.severity];
                const Icon = config.icon;
                const isExpanded = expandedFinding === i;

                return (
                  <div
                    key={i}
                    className={`rounded-xl border ${config.border} ${config.bg} transition-all cursor-pointer`}
                    onClick={() => setExpandedFinding(isExpanded ? null : i)}
                  >
                    {/* Finding header */}
                    <div className="flex items-start gap-3 p-4">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs font-bold text-muted-foreground shrink-0">
                          {i + 1}.
                        </span>
                        <Icon className={`h-4 w-4 shrink-0 ${config.text}`} />
                        <p className="text-sm font-semibold text-foreground truncate">
                          {finding.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}
                        >
                          {config.label}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                            Analyse
                          </p>
                          <p className="text-sm text-foreground leading-relaxed">
                            {finding.analysis}
                          </p>
                        </div>
                        <div className="flex items-start gap-2 bg-secondary/50 rounded-lg p-3">
                          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                              Anbefaling
                            </p>
                            <p className="text-sm text-foreground leading-relaxed">
                              {finding.recommendation}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trend Analysis */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Trend-Analyse
              </h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Udvikling, fokusområder og udfordringer over {historicalData.length} måneder
              </p>
            </div>

            {/* Positive trends */}
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Tiltagende & Positive Trends
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(showAllTrends ? analysis.positive_trends : analysis.positive_trends.slice(0, 3)).map(
                  (trend, i) => (
                    <TrendCard key={i} trend={trend} type="positive" />
                  )
                )}
              </div>
            </div>

            {/* Challenges */}
            <div>
              <h4 className="text-xs font-semibold text-chart-warning uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3" />
                Tiltagende Udfordringer
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(showAllTrends ? analysis.challenges : analysis.challenges.slice(0, 3)).map(
                  (trend, i) => (
                    <TrendCard key={i} trend={trend} type="challenge" />
                  )
                )}
              </div>
            </div>

            {(analysis.positive_trends.length > 3 || analysis.challenges.length > 3) && (
              <button
                onClick={() => setShowAllTrends(!showAllTrends)}
                className="text-xs text-primary hover:text-primary/80 transition-colors mt-3"
              >
                {showAllTrends ? "Vis færre" : "Vis alle trends"}
              </button>
            )}
          </div>

          {/* Strategic Questions & Next Steps */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Strategic questions */}
            <div className="glass-card rounded-xl p-6">
              <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-chart-warning" />
                Spørgsmål til teamet
              </h3>
              <div className="space-y-3">
                {analysis.strategic_questions.map((q, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                    <span className="text-xs font-bold text-chart-warning shrink-0 mt-0.5">
                      {i + 1}.
                    </span>
                    <p className="text-sm text-foreground leading-relaxed">{q}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Next steps */}
            <div className="glass-card rounded-xl p-6">
              <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Anbefalede næste skridt
              </h3>
              <div className="space-y-3">
                {analysis.next_steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!analysis && !loading && (
        <div className="glass-card rounded-xl p-12 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-foreground font-medium mb-1">Ingen analyse genereret endnu</p>
          <p className="text-xs text-muted-foreground mb-4">
            Klik "Generer analyse" for at få en dybdegående AI-analyse af dine finansielle data
          </p>
          <p className="text-[10px] text-muted-foreground">
            Analysen bliver klogere over tid efterhånden som du uploader flere rapporter
          </p>
        </div>
      )}
    </div>
  );
};

function TrendCard({ trend, type }: { trend: TrendItem; type: "positive" | "challenge" }) {
  const isPositive = type === "positive";

  return (
    <div className="rounded-xl border border-border/30 bg-secondary/30 p-4 hover:bg-secondary/50 transition-colors">
      <p className="text-sm font-semibold text-foreground mb-1.5">{trend.title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{trend.description}</p>
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
            isPositive ? "bg-primary/10 text-primary" : "bg-chart-warning/10 text-chart-warning"
          }`}
        >
          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend.metric}
        </span>
        <span className="text-[10px] text-muted-foreground">{trend.period}</span>
      </div>
    </div>
  );
}

export default AIFinancialAnalysis;
