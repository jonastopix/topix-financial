import { useState, useEffect, useMemo } from "react";
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
  Calendar,
  BarChart3,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { postActivityMessage } from "@/lib/chatActivity";
import type { Json } from "@/integrations/supabase/types";

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

interface ReportWithAnalysis {
  id: string;
  report_period: string | null;
  company_name: string | null;
  cvr_number: string | null;
  extracted_data: Json | null;
  normalized_data: Json | null;
  ai_analysis: Json | null;
  uploaded_at: string;
  status: string;
  validation_status?: string | null;
  extraction_method?: string | null;
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

const DANISH_MONTHS = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

interface AIFinancialAnalysisProps {
  conversationId?: string | null;
  companyId?: string | null;
  userId?: string | null;
}

const AIFinancialAnalysis = ({ conversationId, companyId, userId }: AIFinancialAnalysisProps) => {
  const [allReports, setAllReports] = useState<ReportWithAnalysis[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);
  const [showAllTrends, setShowAllTrends] = useState(false);
  const [expandedYear, setExpandedYear] = useState<string | null>(null);

  // Fetch all processed reports
  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("financial_reports")
        .select("id, report_period, company_name, cvr_number, extracted_data, normalized_data, ai_analysis, uploaded_at, status, validation_status, extraction_method")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .in("status", ["processed", "needs_review"])
        .order("uploaded_at", { ascending: false });

      const reports = (data || []) as ReportWithAnalysis[];
      setAllReports(reports);

      // Auto-select latest with analysis, or just latest
      const withAnalysis = reports.find(r => r.ai_analysis);
      setSelectedReportId(withAnalysis?.id || reports[0]?.id || null);

      // Auto-expand current year
      const currentYear = String(new Date().getFullYear());
      setExpandedYear(currentYear);
    };
    fetch();
  }, [companyId]);

  const selectedReport = useMemo(
    () => allReports.find(r => r.id === selectedReportId) || null,
    [allReports, selectedReportId]
  );

  const analysis = useMemo(() => {
    if (!selectedReport?.ai_analysis) return null;
    return selectedReport.ai_analysis as unknown as AnalysisData;
  }, [selectedReport]);

  const validationStatus = useMemo(() => {
    if (!selectedReport) return "FAIL";
    return selectedReport.validation_status || 
           (selectedReport.extracted_data as any)?.validation?.status || 
           "FAIL";
  }, [selectedReport]);

  // Canonical gating: block AI if normalized_data.metrics exists but ai_eligible_payload is missing
  const canonicalBlocked = useMemo(() => {
    if (!selectedReport) return false;
    const nd = selectedReport.normalized_data as any;
    return !!nd?.metrics && !(nd?.ai_eligible === true && nd?.ai_eligible_payload);
  }, [selectedReport]);

  // Group reports by year for history
  const reportsByYear = useMemo(() => {
    const groups: Record<string, ReportWithAnalysis[]> = {};
    allReports.forEach(r => {
      const yearMatch = r.report_period?.match(/\d{4}/);
      const year = yearMatch?.[0] || "Ukendt";
      if (!groups[year]) groups[year] = [];
      groups[year].push(r);
    });
    return groups;
  }, [allReports]);

  const generateAnalysis = async (report?: ReportWithAnalysis) => {
    const target = report || selectedReport;
    if (!target?.extracted_data) {
      toast.error("Ingen data at analysere.");
      return;
    }

    // CANONICAL GATING: block if metrics exist but payload missing
    const nd = target.normalized_data as any;
    if (nd?.metrics && !(nd?.ai_eligible === true && nd?.ai_eligible_payload)) {
      toast.error("AI-analyse blokeret: canonical metrics findes, men ai_eligible_payload mangler.");
      return;
    }

    // SAFETY: Bloker hvis validation !== PASS
    const vStatus = target.validation_status || 
                    (target.extracted_data as any)?.validation?.status || 
                    "FAIL";
    if (vStatus !== "PASS") {
      toast.error(`AI-analyse er deaktiveret: validation returnerede ${vStatus}. Gennemgå data manuelt.`);
      return;
    }

    setLoading(true);
    if (report) setSelectedReportId(report.id);

    try {
      const ed = target.extracted_data as any;
      const nd = target.normalized_data as any;
      const isCanonicalPath = nd?.ai_eligible === true && nd?.ai_eligible_payload;

      // Fetch historical data
      const { data: historicalReports } = await supabase
        .from("financial_reports")
        .select("extracted_data, normalized_data, report_period, validation_status")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("status", "processed")
        .neq("id", target.id)
        .order("uploaded_at", { ascending: true })
        .limit(12);

      // Build body based on canonical vs legacy path
      let body: any;

      if (isCanonicalPath) {
        // CANONICAL PATH: only PASS + ai_eligible historical
        const historicalCanonical = (historicalReports || [])
          .filter(r => r.validation_status === "PASS" && (r.normalized_data as any)?.ai_eligible === true)
          .map(r => ({
            period: r.report_period,
            ...(r.normalized_data as any)?.metrics,
            _source: "canonical",
          }));

        body = {
          canonicalPayload: nd.ai_eligible_payload,
          historicalCanonical: historicalCanonical.length > 0 ? historicalCanonical : undefined,
          companyContext: {
            name: target.company_name || ed?.company_name,
            cvr: target.cvr_number || ed?.cvr_number,
          },
          companyId,
        };
      } else {
        // LEGACY PATH: only non-canonical historical
        const legacyHistorical = (historicalReports || [])
          .filter(r => r.extracted_data)
          .map(r => {
            const d = r.extracted_data as any;
            return { period: r.report_period || d?.report_period, ...d?.key_figures };
          });

        body = {
          financialData: ed?.key_figures || ed,
          historicalData: legacyHistorical.length > 0 ? legacyHistorical : undefined,
          companyContext: {
            name: target.company_name || ed?.company_name,
            cvr: target.cvr_number || ed?.cvr_number,
          },
          companyId,
        };
      }

      const { data, error } = await supabase.functions.invoke("ai-financial-feedback", { body });

      if (error) throw error;

      // Persist analysis to DB
      if (data && !data.error) {
        await supabase
          .from("financial_reports")
          .update({ ai_analysis: data } as any)
          .eq("id", target.id);

        // Update local state
        setAllReports(prev =>
          prev.map(r => r.id === target.id ? { ...r, ai_analysis: data as Json } : r)
        );
      }
      setExpandedFinding(0);

      // Post to chat
      if (conversationId && userId && data && !data.error) {
        const summaryParts: string[] = [];
        summaryParts.push(`📊 **AI Finansiel Analyse · ${target.report_period}**\n`);
        summaryParts.push(data.overview);
        if (data.key_findings?.length > 0) {
          summaryParts.push(`\n\n**Nøglefund:**`);
          data.key_findings.forEach((f: any, i: number) => {
            const icon = f.severity === "positiv" ? "✅" : f.severity === "advarsel" ? "⚠️" : "🔴";
            summaryParts.push(`${icon} ${i + 1}. ${f.title} — ${f.recommendation}`);
          });
        }
        if (data.next_steps?.length > 0) {
          summaryParts.push(`\n\n**Næste skridt:**`);
          data.next_steps.forEach((s: string, i: number) => {
            summaryParts.push(`${i + 1}. ${s}`);
          });
        }
        await postActivityMessage({
          conversationId,
          senderId: userId,
          content: summaryParts.join("\n"),
          contextType: "report",
          contextId: target.id,
          contextMeta: { title: `AI Analyse · ${target.report_period}` },
        });
      }

      toast.success("Analyse genereret");
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
              {selectedReport?.report_period
                ? `${selectedReport.report_period} · ${selectedReport.company_name || ""}`
                : "Upload en rapport for at aktivere AI-analyse"}
            </p>
          </div>
        </div>
        {selectedReport && (
          <>
            {canonicalBlocked ? (
              <div className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-muted text-muted-foreground cursor-not-allowed" title="Canonical data ufuldstændig — ai_eligible_payload mangler">
                <ShieldAlert className="h-3.5 w-3.5" />
                AI blokeret
              </div>
            ) : validationStatus !== "PASS" ? (
              <div className="glass-card rounded-xl p-6 border-l-4 border-l-chart-warning">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-chart-warning shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">
                      AI-analyse ikke tilgængelig
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Validation returnerede <strong>{validationStatus}</strong>. 
                      AI-analyse er deaktiveret indtil data er valideret som PASS.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => generateAnalysis()}
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
          </>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="glass-card rounded-xl p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-foreground font-medium">Analyserer dine finansielle data...</p>
          <p className="text-xs text-muted-foreground mt-1">
            AI gennemgår rapporter og identificerer mønstre og trends
          </p>
        </div>
      )}

      {/* Canonical blocked banner */}
      {canonicalBlocked && (
        <div className="glass-card rounded-xl p-6 border-l-4 border-l-chart-warning">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-chart-warning shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                AI-analyse utilgængelig
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Canonical metrics er tilgængelige, men <strong>ai_eligible_payload</strong> mangler. 
                Ny AI-kørsel er blokeret indtil data er komplet.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stale/cached analysis when canonical blocked */}
      {canonicalBlocked && analysis && !loading && (
        <div className="opacity-60 border-2 border-chart-warning/30 rounded-xl p-1">
          <div className="flex items-center gap-2 px-5 pt-4 pb-2">
            <ShieldAlert className="h-4 w-4 text-chart-warning" />
            <span className="text-xs font-semibold text-chart-warning uppercase tracking-wider">
              Historisk analyse — ny kørsel blokeret
            </span>
          </div>
          {/* Overview (read-only) */}
          <div className="mx-4 mb-4 rounded-xl bg-secondary/30 p-5 border-l-4 border-l-muted">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Overblik (cached)
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{analysis.overview}</p>
          </div>
        </div>
      )}

      {/* Analysis content — only when NOT canonical blocked */}
      {!canonicalBlocked && validationStatus === "PASS" && analysis && !loading && (
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
              Erkendelser, fokusområder og udfordringer over tid
            </p>

            <div className="mb-5">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Tilgrundlæggende fokusområder
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
                Tilgrundlæggende udfordringer
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

      {/* Analysis History */}
      {Object.keys(reportsByYear).length > 0 && (
        <div className="glass-card rounded-xl p-6">
          <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Analysehistorik
          </h3>

          <div className="space-y-2">
            {Object.entries(reportsByYear)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([year, reports]) => (
                <div key={year}>
                  <button
                    onClick={() => setExpandedYear(expandedYear === year ? null : year)}
                    className="w-full flex items-center justify-between py-2 px-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    <span>{year}</span>
                    {expandedYear === year ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  {expandedYear === year && (
                    <div className="space-y-1 ml-2 mb-3">
                      {reports.map(r => {
                        const hasAnalysis = !!r.ai_analysis;
                        const isSelected = r.id === selectedReportId;
                        return (
                          <button
                            key={r.id}
                            onClick={() => {
                              setSelectedReportId(r.id);
                              setExpandedFinding(0);
                              // Don't auto-generate if canonical blocked
                              const rnd = r.normalized_data as any;
                              const rBlocked = !!rnd?.metrics && !(rnd?.ai_eligible === true && rnd?.ai_eligible_payload);
                              if (!hasAnalysis && !rBlocked) generateAnalysis(r);
                            }}
                            className={`w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-left transition-all ${
                              isSelected
                                ? "bg-primary/10 border border-primary/20"
                                : "hover:bg-secondary/50 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm text-foreground">{r.report_period || r.uploaded_at.slice(0, 10)}</span>
                              {/* Deterministic extraction badge */}
                              {r.extraction_method === "deterministic_template" && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                                  DET
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {hasAnalysis ? (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                  Analyse klar
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">
                                  Vælg for at analysere
                                </span>
                              )}
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!analysis && !loading && allReports.length === 0 && (
        <div className="glass-card rounded-xl p-12 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-foreground font-medium mb-1">Ingen rapporter fundet</p>
          <p className="text-xs text-muted-foreground">
            Upload en saldobalance eller resultatopgørelse for at komme i gang
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
