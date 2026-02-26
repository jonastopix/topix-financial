import { useState, useEffect, useCallback, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import FileUploadZone from "@/components/FileUploadZone";
import AIFinancialAnalysis from "@/components/AIFinancialAnalysis";
import FinancialOverview from "@/components/FinancialOverview";
import PerformanceOverview from "@/components/PerformanceOverview";
import DeliveryOverview from "@/components/DeliveryOverview";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Send,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import type { Json } from "@/integrations/supabase/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  parseReportPeriodToKey, getKeyFigures, formatDKK, formatCompact,
  SHORT_MONTHS, reportStatusConfig, type ReportData,
} from "@/lib/financialUtils";

interface DbReport {
  id: string;
  file_name: string;
  file_path: string;
  report_type: string;
  report_period: string | null;
  company_name: string | null;
  uploaded_at: string;
  status: string;
  extracted_data: Json | null;
}

interface ChatMsg {
  id: string;
  sender_id: string;
  content: string;
  message_type: string;
  context_id: string | null;
  created_at: string;
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; label: string; className: string; bg: string }> = {
  processed: { icon: CheckCircle2, ...reportStatusConfig.processed },
  processing: { icon: Clock, ...reportStatusConfig.processing },
  error: { icon: AlertCircle, ...reportStatusConfig.error },
};

const Reports = () => {
  const { user, companyId } = useAuth();
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [dbReports, setDbReports] = useState<DbReport[]>([]);
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMsg[]>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [advisorProfiles, setAdvisorProfiles] = useState<Record<string, string>>({});
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [programStart, setProgramStart] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    const [reportsRes, convRes, companyRes] = await Promise.all([
      (supabase
        .from("financial_reports")
        .select("id, file_name, file_path, report_type, report_period, company_name, uploaded_at, status, extracted_data") as any)
        .eq("company_id", companyId)
        .order("uploaded_at", { ascending: false }),
      supabase.from("conversations").select("id").eq("member_id", user.id).maybeSingle(),
      companyId
        ? supabase.from("companies").select("start_date").eq("id", companyId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const reportsList = reportsRes.data || [];
    setDbReports(reportsList);
    setConversationId(convRes.data?.id || null);
    if (companyRes.data?.start_date) {
      setProgramStart(new Date(companyRes.data.start_date));
    } else {
      setProgramStart(null);
    }

    if (reportsList.length > 0 && convRes.data?.id) {
      const ids = reportsList.map((r) => r.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convRes.data.id)
        .eq("context_type", "report")
        .in("context_id", ids)
        .order("created_at", { ascending: true });

      const grouped: Record<string, ChatMsg[]> = {};
      const advisorIds = new Set<string>();
      (msgs || []).forEach((m: any) => {
        const rid = m.context_id as string;
        if (rid) {
          if (!grouped[rid]) grouped[rid] = [];
          grouped[rid].push(m as ChatMsg);
          if (m.sender_id !== user.id) advisorIds.add(m.sender_id);
        }
      });
      setChatMessages(grouped);

      if (advisorIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", Array.from(advisorIds));
        const map: Record<string, string> = {};
        (profiles || []).forEach((p) => { map[p.user_id] = p.full_name; });
        setAdvisorProfiles(map);
      }
    }
  }, [user, companyId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  // Group reports by month key, taking best report per month
  const reportsByMonth = useMemo(() => {
    const map: Record<string, DbReport> = {};
    // Sort ascending so later (better) reports overwrite
    const sorted = [...dbReports].sort((a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());
    sorted.forEach((r) => {
      const key = parseReportPeriodToKey(r.report_period);
      if (key) {
        // Prefer processed over others
        const existing = map[key];
        if (!existing || r.status === "processed") {
          map[key] = r;
        }
      }
    });
    return map;
  }, [dbReports]);

  // (delivery overview logic is now in DeliveryOverview component)


  // Build trend data for charts
  const trendData = useMemo(() => {
    const sortedKeys = Object.keys(reportsByMonth).sort();
    return sortedKeys
      .map((key) => {
        const r = reportsByMonth[key];
        if (r.status !== "processed") return null;
        const kf = getKeyFigures(r);
        if (!kf) return null;
        const [year, monthStr] = key.split("-");
        const monthIdx = parseInt(monthStr, 10) - 1;
        return {
          key,
          label: `${SHORT_MONTHS[monthIdx]} ${year}`,
          omsaetning: kf.omsaetning ?? null,
          daekningsbidrag: kf.daekningsbidrag ?? null,
          resultat_foer_skat: kf.resultat_foer_skat ?? null,
          loenninger: kf.loenninger ?? null,
          bank_balance: kf.bank_balance ?? null,
        };
      })
      .filter(Boolean) as any[];
  }, [reportsByMonth]);

  const handleSubmitComment = async (reportId: string, reportName: string) => {
    const content = (commentInputs[reportId] || "").trim();
    if (!content || !user || !conversationId) return;
    if (content.length > 2000) return;

    setSubmittingComment(reportId);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        message_type: "user",
        context_type: "report",
        context_id: reportId,
        context_meta: { title: reportName },
      } as any)
      .select()
      .single();

    if (!error && data) {
      setChatMessages((prev) => ({
        ...prev,
        [reportId]: [...(prev[reportId] || []), data as unknown as ChatMsg],
      }));
      setCommentInputs((prev) => ({ ...prev, [reportId]: "" }));
    }
    setSubmittingComment(null);
  };

  const handlePipelineComplete = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleViewOriginalFile = async (report: DbReport) => {
    if (!report.file_path) return;
    const { data } = await supabase.storage
      .from("financial-documents")
      .createSignedUrl(report.file_path, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  const renderExtractedData = (data: Json | null) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const obj = data as Record<string, Json | undefined>;
    const kf = obj.key_figures as Record<string, number> | undefined;
    if (!kf) return null;

    const stats = [
      { label: "Omsætning", value: formatDKK(kf.omsaetning), sub: kf.omsaetning_aar != null ? `Å.t.d: ${formatDKK(kf.omsaetning_aar)}` : undefined },
      { label: "Dækningsbidrag", value: formatDKK(kf.daekningsbidrag), sub: kf.daekningsbidrag_aar != null ? `Å.t.d: ${formatDKK(kf.daekningsbidrag_aar)}` : undefined },
      { label: "Lønninger", value: formatDKK(kf.loenninger) },
      { label: "Resultat f. skat", value: formatDKK(kf.resultat_foer_skat), sub: kf.resultat_foer_skat_aar != null ? `Å.t.d: ${formatDKK(kf.resultat_foer_skat_aar)}` : undefined },
      kf.aktiver_i_alt != null ? { label: "Aktiver", value: formatDKK(kf.aktiver_i_alt) } : null,
      kf.egenkapital != null ? { label: "Egenkapital", value: formatDKK(kf.egenkapital) } : null,
      kf.bank_balance != null ? { label: "Bank", value: formatDKK(kf.bank_balance) } : null,
      kf.debitorer != null ? { label: "Debitorer", value: formatDKK(kf.debitorer) } : null,
      kf.kreditorer != null ? { label: "Kreditorer", value: formatDKK(kf.kreditorer) } : null,
    ].filter(Boolean) as { label: string; value: string; sub?: string }[];

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border/50 bg-background/50 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{s.value}</p>
            {s.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
          Rapportering
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload dokumenter, følg udviklingen og få AI-analyse
        </p>
      </div>

      {/* ── Member-Centric Delivery Overview ── */}
      <div className="mb-8">
        <DeliveryOverview reports={dbReports} programStart={programStart} />
      </div>

      {/* ── Trend Charts ── */}
      {trendData.length >= 2 && (() => {
        const SERIES = [
          { key: "omsaetning", label: "Omsætning", color: "hsl(160, 84%, 39%)" },
          { key: "daekningsbidrag", label: "Dækningsbidrag", color: "hsl(38, 92%, 50%)" },
          { key: "resultat_foer_skat", label: "Resultat f. skat", color: "hsl(217, 91%, 60%)" },
          { key: "loenninger", label: "Lønninger", color: "hsl(280, 65%, 60%)" },
          { key: "bank_balance", label: "Bank", color: "hsl(190, 80%, 50%)" },
        ];

        const getLineProps = (seriesKey: string, baseColor: string) => {
          if (!activeSeries) {
            // Default: omsætning prominent, others subtle
            const isMain = seriesKey === "omsaetning";
            return { strokeWidth: isMain ? 2.5 : 1, opacity: isMain ? 1 : 0.4, strokeDasharray: isMain ? undefined : "4 4" };
          }
          const isActive = activeSeries === seriesKey;
          return { strokeWidth: isActive ? 3 : 0.8, opacity: isActive ? 1 : 0.15, strokeDasharray: undefined };
        };

        return (
        <div className="glass-card rounded-xl p-6 mb-8 animate-fade-in">
          <h2 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Finansiel udvikling
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Måned til måned — klik på en serie for at fremhæve</p>

          {/* Custom legend with click */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            {SERIES.map(s => {
              const isActive = activeSeries === s.key;
              const isDefault = !activeSeries && s.key === "omsaetning";
              const highlighted = isActive || isDefault;
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSeries(prev => prev === s.key ? null : s.key)}
                  className={`group flex items-center gap-1.5 text-[11px] tracking-wide transition-all duration-200 ${
                    highlighted
                      ? "opacity-100"
                      : "opacity-40 hover:opacity-80"
                  }`}
                >
                  <span
                    className={`rounded-full transition-all duration-200 ${highlighted ? "w-2 h-2" : "w-1.5 h-1.5 group-hover:w-2 group-hover:h-2"}`}
                    style={{ background: s.color }}
                  />
                  <span
                    className={`font-medium transition-colors duration-200 ${highlighted ? "" : "text-muted-foreground"}`}
                    style={highlighted ? { color: s.color } : undefined}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 18, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  {SERIES.map(s => (
                    <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatDKK(value), SERIES.find(s => s.key === name)?.label || name]}
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }}
                />
                {SERIES.map(s => {
                  const props = getLineProps(s.key, s.color);
                  const isActive = activeSeries === s.key;
                  const isDefaultMain = !activeSeries && s.key === "omsaetning";
                  const showLabels = isActive || isDefaultMain;
                  return (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      stroke={s.color}
                      strokeWidth={props.strokeWidth}
                      opacity={props.opacity}
                      strokeDasharray={props.strokeDasharray}
                      fill={isActive || isDefaultMain ? `url(#grad-${s.key})` : "none"}
                      dot={isActive ? { r: 3, fill: s.color, strokeWidth: 0 } : false}
                      activeDot={isActive ? { r: 5 } : { r: 3 }}
                      connectNulls
                      label={showLabels ? ({ x, y, value }: any) => {
                        if (value == null) return null;
                        return (
                          <text
                            x={x}
                            y={y - 10}
                            textAnchor="middle"
                            fill={s.color}
                            fontSize={9}
                            fontWeight={500}
                            opacity={0.85}
                          >
                            {formatCompact(value)}
                          </text>
                        );
                      } : false}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Month-over-month change indicators */}
          {trendData.length >= 2 && (() => {
            const latest = trendData[trendData.length - 1];
            const prev = trendData[trendData.length - 2];
            const changes = [
              { label: "Omsætning", curr: latest.omsaetning, prev: prev.omsaetning },
              { label: "Dækningsbidrag", curr: latest.daekningsbidrag, prev: prev.daekningsbidrag },
              { label: "Resultat f. skat", curr: latest.resultat_foer_skat, prev: prev.resultat_foer_skat },
            ].filter(c => c.curr != null && c.prev != null && c.prev !== 0);

            if (changes.length === 0) return null;

            return (
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/30">
                {changes.map(c => {
                  const pct = ((c.curr - c.prev) / Math.abs(c.prev)) * 100;
                  const isUp = pct > 0;
                  const isFlat = Math.abs(pct) < 1;
                  return (
                    <div key={c.label} className="flex items-center gap-2 rounded-lg bg-secondary/30 p-3">
                      {isFlat ? (
                        <Minus className="h-4 w-4 text-muted-foreground" />
                      ) : isUp ? (
                        <TrendingUp className="h-4 w-4 text-primary" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-destructive" />
                      )}
                      <div>
                        <p className="text-[10px] text-muted-foreground">{c.label}</p>
                        <p className={`text-sm font-semibold ${isFlat ? "text-muted-foreground" : isUp ? "text-primary" : "text-destructive"}`}>
                          {isUp ? "+" : ""}{pct.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
        );
      })()}

      {/* Upload section */}
      <div className="mb-8">
        <FileUploadZone
          title="Upload finansiel rapport"
          description="Saldobalance, resultatopgørelse eller andet regnskab — systemet genkender typen automatisk"
          accept=".xlsx,.xls,.csv,.pdf"
          conversationId={conversationId}
          userId={user?.id || null}
          companyId={companyId || null}
          onPipelineComplete={handlePipelineComplete}
        />
      </div>

      {/* AI Financial Analysis */}
      <div className="mb-8">
        <AIFinancialAnalysis conversationId={conversationId} companyId={companyId} userId={user?.id || null} />
      </div>

      {/* Detaljeret Finansiel Oversigt */}
      <div className="mb-8">
        <FinancialOverview reports={dbReports} programStart={programStart} />
      </div>

      {/* Performance Oversigt */}
      <div className="mb-8">
        <PerformanceOverview reports={dbReports} />
      </div>

      {/* Real DB Reports */}
      <h2 className="font-display font-semibold text-foreground text-lg mb-4 flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        Rapporter & Feedback
      </h2>

      {dbReports.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-foreground font-medium mb-1">Ingen rapporter endnu</p>
          <p className="text-xs text-muted-foreground">
            Upload en saldobalance eller resultatopgørelse ovenfor for at komme i gang
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {dbReports.map((report) => {
            const config = statusConfig[report.status] || statusConfig.processing;
            const Icon = config.icon;
            const isExpanded = expandedReport === report.id;
            const msgs = chatMessages[report.id] || [];
            const aiMsgs = msgs.filter((m) => m.message_type === "ai" || m.message_type === "system");
            const userMsgs = msgs.filter((m) => m.message_type === "user");

            return (
              <div key={report.id} className="glass-card rounded-xl animate-fade-in overflow-hidden">
                <button
                  onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                  className="w-full p-5 text-left hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-lg bg-muted flex-shrink-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {report.report_period || report.file_name}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground capitalize">{report.report_type}</span>
                          {report.company_name && (
                            <span className="text-xs text-muted-foreground">· {report.company_name}</span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            · {format(new Date(report.uploaded_at), "d. MMM yyyy", { locale: da })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      {aiMsgs.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                          <Sparkles className="h-3 w-3" />
                          AI analyse
                        </span>
                      )}
                      {msgs.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          {msgs.length}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${config.bg} ${config.className}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border/50 px-5 py-5 space-y-5">
                    {/* Original file download button */}
                    {report.file_path && report.file_path.includes("/") && (
                      <button
                        onClick={() => handleViewOriginalFile(report)}
                        className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Se original fil ({report.file_name})
                      </button>
                    )}
                    {report.extracted_data && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Nøgletal
                        </h4>
                        {renderExtractedData(report.extracted_data)}
                      </div>
                    )}

                    {aiMsgs.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 text-primary" />
                          AI Analyse & Aktivitet
                        </h4>
                        <div className="space-y-2">
                          {aiMsgs.map((msg) => (
                            <div key={msg.id} className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                              <p className="text-[10px] text-muted-foreground mt-2">
                                {format(new Date(msg.created_at), "d. MMM yyyy HH:mm", { locale: da })}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {userMsgs.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <MessageSquare className="h-3 w-3" />
                          Kommentarer ({userMsgs.length})
                        </h4>
                        <div className="space-y-2">
                          {userMsgs.map((msg) => {
                            const isOwn = msg.sender_id === user?.id;
                            const authorName = isOwn ? "Dig" : (advisorProfiles[msg.sender_id] || "Advisor");
                            return (
                              <div key={msg.id} className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                                <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                                  <span className="text-[9px] font-medium text-foreground">
                                    {authorName === "Dig" ? "Du" : authorName.split(" ").map(w => w[0]).join("")}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-semibold text-foreground">{authorName}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(msg.created_at), "d. MMM yyyy HH:mm", { locale: da })}
                                    </span>
                                  </div>
                                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{msg.content}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-3 border-t border-border/30">
                      <textarea
                        value={commentInputs[report.id] || ""}
                        onChange={(e) =>
                          setCommentInputs((prev) => ({ ...prev, [report.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmitComment(report.id, report.report_period || report.file_name);
                          }
                        }}
                        placeholder="Skriv en kommentar (sendes til chatten)..."
                        maxLength={2000}
                        rows={1}
                        className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => handleSubmitComment(report.id, report.report_period || report.file_name)}
                        disabled={!(commentInputs[report.id] || "").trim() || submittingComment === report.id}
                        className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>

                    {!report.extracted_data && aiMsgs.length === 0 && userMsgs.length === 0 && (
                      <div className="text-center py-4">
                        <Sparkles className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Rapport behandles...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
};

export default Reports;
