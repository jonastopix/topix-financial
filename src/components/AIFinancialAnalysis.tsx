import { useState, useMemo } from "react";
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
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { useCompanyCommentary, generateCommentary, type Commentary } from "@/hooks/useCompanyCommentary";
import { postActivityMessage } from "@/lib/chatActivity";

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

export interface AnalysisData {
  overview: string;
  key_findings: KeyFinding[];
  positive_trends: TrendItem[];
  challenges: TrendItem[];
  strategic_questions: string[];
  next_steps: string[];
}

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

interface AIFinancialAnalysisProps {
  conversationId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  /** Controlled valgt periode (parent ejer den; null = auto-vælg seneste herinde) */
  selectedPeriodKey?: string | null;
  onSelectPeriod?: (key: string) => void;
}

const CORE_FIELDS = ["revenue", "gross_profit", "ebt"] as const;

const AIFinancialAnalysis = ({ conversationId, companyId, userId, selectedPeriodKey = null, onSelectPeriod }: AIFinancialAnalysisProps) => {
  const queryClient = useQueryClient();
  const { data: facts = [] } = useCompanyFacts(companyId ?? undefined);
  const { data: commentaries = [], isLoading: commentariesLoading } = useCompanyCommentary(companyId ?? undefined);

  const [loading, setLoading] = useState(false);
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);
  const [showAllTrends, setShowAllTrends] = useState(false);
  const [needsMoreData, setNeedsMoreData] = useState(false);

  // Available periods from committed facts (sorted descending)
  const availablePeriods = useMemo(() => {
    return [...facts]
      .sort((a, b) => b.period_key.localeCompare(a.period_key))
      .map(f => ({
        period_key: f.period_key,
        period_label: f.period_label,
      }));
  }, [facts]);

  // Auto-select: first period with commentary, or first available period
  const effectivePeriodKey = useMemo(() => {
    if (selectedPeriodKey) return selectedPeriodKey;
    const withCommentary = availablePeriods.find(p =>
      commentaries.some(c => c.period_key === p.period_key)
    );
    return withCommentary?.period_key || availablePeriods[0]?.period_key || null;
  }, [selectedPeriodKey, availablePeriods, commentaries]);

  // Get commentary for selected period
  const currentCommentary = useMemo(() => {
    if (!effectivePeriodKey) return null;
    return commentaries.find(c => c.period_key === effectivePeriodKey) || null;
  }, [commentaries, effectivePeriodKey]);

  const analysis = useMemo(() => {
    if (!currentCommentary?.analysis) return null;
    return currentCommentary.analysis as unknown as AnalysisData;
  }, [currentCommentary]);

  const isStale = currentCommentary?.is_stale ?? false;

  // Check data sufficiency for the selected period
  const dataSufficiency = useMemo(() => {
    if (!effectivePeriodKey) return { sufficient: false, populatedCoreCount: 0 };
    const fact = facts.find(f => f.period_key === effectivePeriodKey);
    if (!fact?.metrics) return { sufficient: false, populatedCoreCount: 0 };
    const metrics = fact.metrics as Record<string, unknown>;
    const populatedCoreCount = CORE_FIELDS.filter(k => metrics[k] != null).length;
    return { sufficient: populatedCoreCount >= 3, populatedCoreCount };
  }, [effectivePeriodKey, facts]);

  const currentPeriodLabel = useMemo(() => {
    const p = availablePeriods.find(p => p.period_key === effectivePeriodKey);
    return p?.period_label || effectivePeriodKey || "";
  }, [availablePeriods, effectivePeriodKey]);

  const handleGenerate = async (periodKey?: string) => {
    const targetPeriod = periodKey || effectivePeriodKey;
    if (!targetPeriod || !companyId) {
      toast.error("Ingen periode valgt.");
      return;
    }

    setLoading(true);
    setNeedsMoreData(false);
    if (periodKey) onSelectPeriod?.(periodKey);

    try {
      const result = await generateCommentary(companyId, targetPeriod);

      // Handle needs_more_data response from edge function
      if ((result as any)?.needs_more_data) {
        setNeedsMoreData(true);
        setLoading(false);
        return;
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["company-commentaries", companyId] });

      setExpandedFinding(0);

      // Post to chat
      if (conversationId && userId && result.analysis) {
        const analysisData = result.analysis as unknown as AnalysisData;
        const summaryParts: string[] = [];
        const label = availablePeriods.find(p => p.period_key === targetPeriod)?.period_label || targetPeriod;
        summaryParts.push(`📊 **AI Finansiel Analyse · ${label}**\n`);
        summaryParts.push(analysisData.overview || "");
        if (analysisData.key_findings?.length > 0) {
          summaryParts.push(`\n\n**Nøglefund:**`);
          analysisData.key_findings.forEach((f, i) => {
            const icon = f.severity === "positiv" ? "✅" : f.severity === "advarsel" ? "⚠️" : "🔴";
            summaryParts.push(`${icon} ${i + 1}. ${f.title} — ${f.recommendation}`);
          });
        }
        await postActivityMessage({
          conversationId,
          senderId: userId,
          content: summaryParts.join("\n"),
          contextType: "report",
          contextId: result.id,
          contextMeta: { title: `AI Analyse · ${label}` },
        });
      }

      toast.success("Analyse genereret");
    } catch (e: any) {
      console.error("Commentary generation error:", e);
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
              {effectivePeriodKey
                ? `${currentPeriodLabel}`
                : "Ingen committed facts tilgængelige"}
            </p>
          </div>
        </div>
        {effectivePeriodKey && dataSufficiency.sufficient && (
          <button
            onClick={() => handleGenerate()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyserer...</>
            ) : analysis ? (
              <><RefreshCw className="h-3.5 w-3.5" /> Generer ny</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> Generer analyse</>
            )}
          </button>
        )}
      </div>

      {/* Insufficient data — pre-generation guard */}
      {effectivePeriodKey && !dataSufficiency.sufficient && !loading && (
        <div className="rounded-xl border border-amber-300/50 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-950/20 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-1">
                Ikke nok data til AI-analyse
              </h3>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80 leading-relaxed">
                Tilføj mindst omsætning, dækningsbidrag og resultat for at modtage AI-analyse.
                Du kan rette data via rapportens review-dialog.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Needs more data — returned from edge function */}
      {needsMoreData && !loading && (
        <div className="rounded-xl border border-amber-300/50 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-950/20 p-5">
          <div className="flex items-start gap-3">
            <Pencil className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-1">
                Tilføj venligst de manglende nøgletal
              </h3>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80 leading-relaxed">
                De committed data indeholder ikke nok nøgletal til en komplet AI-analyse.
                Ret data via rapportens review-dialog og kør analysen igen.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="glass-card rounded-xl p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-foreground font-medium">Analyserer dine finansielle data...</p>
          <p className="text-xs text-muted-foreground mt-1">
            AI gennemgår committed facts og identificerer mønstre
          </p>
        </div>
      )}

      {/* Stale banner */}
      {isStale && !loading && (
        <div className="glass-card rounded-xl p-5 border-l-4 border-l-chart-warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-chart-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                Analysen er forældet
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Facts for denne periode er blevet opdateret efter analysen blev genereret. Kør analysen igen for at få opdaterede resultater.
              </p>
            </div>
            <button
              onClick={() => handleGenerate()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Generer igen
            </button>
          </div>
        </div>
      )}

      {/* Analysis content */}
      {analysis && !loading && (
        <>
          {/* Overview */}
          <div className={`glass-card rounded-xl p-6 border-l-4 ${isStale ? "border-l-chart-warning opacity-70" : "border-l-primary"}`}>
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
            <div className="grid grid-cols-1 gap-3">
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
                    <div className="flex items-start gap-3 p-4">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Icon className={`h-4 w-4 shrink-0 ${config.text}`} />
                        <p className="text-sm font-semibold text-foreground">{finding.title}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>
                          {config.label}
                        </span>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3">
                        <p className="text-sm text-foreground leading-relaxed">{finding.analysis}</p>
                        <div className="flex items-start gap-2 bg-secondary/50 rounded-lg p-3">
                          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Anbefaling</p>
                            <p className="text-sm text-foreground leading-relaxed">{finding.recommendation}</p>
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
            <h3 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Trend-Analyse
            </h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-4">
              Erkendelser, fokusområder og udfordringer
            </p>

            <div className="mb-5">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Fokusområder
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(showAllTrends ? analysis.positive_trends : analysis.positive_trends.slice(0, 3)).map(
                  (trend, i) => <TrendCard key={i} trend={trend} type="positive" />
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-chart-warning uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3" />
                Udfordringer
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(showAllTrends ? analysis.challenges : analysis.challenges.slice(0, 3)).map(
                  (trend, i) => <TrendCard key={i} trend={trend} type="challenge" />
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
            <div className="glass-card rounded-xl p-6">
              <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-chart-warning" />
                Spørgsmål til teamet
              </h3>
              <div className="space-y-3">
                {analysis.strategic_questions.map((q, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                    <span className="text-xs font-bold text-chart-warning shrink-0 mt-0.5">{i + 1}.</span>
                    <p className="text-sm text-foreground leading-relaxed">{q}</p>
                  </div>
                ))}
              </div>
            </div>

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
      {!analysis && !loading && availablePeriods.length === 0 && (
        <div className="glass-card rounded-xl p-12 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-foreground font-medium mb-1">Ingen committed facts fundet</p>
          <p className="text-xs text-muted-foreground">
            Upload og godkend en rapport for at aktivere AI-analyse
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
