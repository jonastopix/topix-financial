import { useState, useEffect, useCallback, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import FileUploadZone from "@/components/FileUploadZone";
import AIFinancialAnalysis from "@/components/AIFinancialAnalysis";
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
  Calendar,
} from "lucide-react";
import { format, addMonths, startOfMonth } from "date-fns";
import { da } from "date-fns/locale";
import type { Json } from "@/integrations/supabase/types";

interface DbReport {
  id: string;
  file_name: string;
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
  processed: { icon: CheckCircle2, label: "Behandlet", className: "text-primary", bg: "bg-primary/10" },
  processing: { icon: Clock, label: "Behandles", className: "text-chart-warning", bg: "bg-chart-warning/10" },
  error: { icon: AlertCircle, label: "Fejl", className: "text-destructive", bg: "bg-destructive/10" },
};

// Danish month names for matching report_period strings
const DANISH_MONTHS = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

function parseReportPeriodToKey(period: string | null): string | null {
  if (!period) return null;
  // Match "Oktober 2025" etc.
  for (let i = 0; i < DANISH_MONTHS.length; i++) {
    if (period.toLowerCase().includes(DANISH_MONTHS[i].toLowerCase())) {
      const yearMatch = period.match(/\d{4}/);
      if (yearMatch) {
        return `${yearMatch[0]}-${String(i + 1).padStart(2, "0")}`;
      }
    }
  }
  return null;
}

function generate12MonthGrid(memberSince: Date): { key: string; label: string; monthNum: number }[] {
  const months: { key: string; label: string; monthNum: number }[] = [];
  const start = startOfMonth(memberSince);
  for (let i = 0; i < 12; i++) {
    const d = addMonths(start, i);
    const key = format(d, "yyyy-MM");
    const label = format(d, "MMM yyyy", { locale: da });
    months.push({ key, label, monthNum: d.getMonth() });
  }
  return months;
}

const Reports = () => {
  const { user } = useAuth();
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [dbReports, setDbReports] = useState<DbReport[]>([]);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMsg[]>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [advisorProfiles, setAdvisorProfiles] = useState<Record<string, string>>({});
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;

    const [reportsRes, convRes] = await Promise.all([
      supabase
        .from("financial_reports")
        .select("id, file_name, report_type, report_period, company_name, uploaded_at, status, extracted_data")
        .eq("user_id", user.id)
        .order("uploaded_at", { ascending: false }),
      supabase.from("conversations").select("id").eq("member_id", user.id).maybeSingle(),
    ]);

    const reportsList = reportsRes.data || [];
    setDbReports(reportsList);
    setConversationId(convRes.data?.id || null);

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
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  // Build a map of report_period keys to reports
  const reportsByMonth = useMemo(() => {
    const map: Record<string, DbReport[]> = {};
    dbReports.forEach((r) => {
      const key = parseReportPeriodToKey(r.report_period);
      if (key) {
        if (!map[key]) map[key] = [];
        map[key].push(r);
      }
    });
    return map;
  }, [dbReports]);

  // Generate 12-month grid based on user creation date (or earliest report)
  const monthGrid = useMemo(() => {
    // Use user created_at or fallback to 12 months back from now
    const memberSince = user?.created_at ? new Date(user.created_at) : new Date();
    return generate12MonthGrid(memberSince);
  }, [user]);

  const deliveredCount = monthGrid.filter((m) => {
    const reports = reportsByMonth[m.key];
    return reports?.some((r) => r.status === "processed");
  }).length;

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

  const renderExtractedData = (data: Json | null) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const obj = data as Record<string, Json | undefined>;
    const kf = obj.key_figures as Record<string, number> | undefined;
    if (!kf) return null;

    const formatDKK = (n?: number) =>
      n != null ? `${n.toLocaleString("da-DK")} DKK` : "—";

    const stats = [
      { label: "Omsætning", value: formatDKK(kf.omsaetning) },
      { label: "Dækningsbidrag", value: formatDKK(kf.daekningsbidrag) },
      { label: "Resultat f. skat", value: formatDKK(kf.resultat_foer_skat) },
      kf.aktiver_i_alt != null ? { label: "Aktiver", value: formatDKK(kf.aktiver_i_alt) } : null,
      kf.bank_balance != null ? { label: "Bank", value: formatDKK(kf.bank_balance) } : null,
      kf.kreditorer != null ? { label: "Kreditorer", value: formatDKK(kf.kreditorer) } : null,
    ].filter(Boolean) as { label: string; value: string }[];

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border/50 bg-background/50 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{s.value}</p>
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
          Upload dokumenter, få AI-analyse og følg op med dit advisory board
        </p>
      </div>

      {/* ── 12-Month Overview Grid ── */}
      <div className="glass-card rounded-xl p-6 mb-8 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            12-måneders overblik
          </h2>
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-primary/10 text-primary">
            {deliveredCount} af 12 afleveret
          </span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
          {monthGrid.map((month) => {
            const reports = reportsByMonth[month.key];
            const hasProcessed = reports?.some((r) => r.status === "processed");
            const hasProcessing = reports?.some((r) => r.status === "processing");
            const hasError = reports?.some((r) => r.status === "error");
            const isPast = new Date(month.key + "-01") < new Date();

            return (
              <div
                key={month.key}
                className={`relative flex flex-col items-center justify-center rounded-xl p-3 border transition-all ${
                  hasProcessed
                    ? "bg-primary/10 border-primary/30"
                    : hasProcessing
                    ? "bg-chart-warning/10 border-chart-warning/30"
                    : hasError
                    ? "bg-destructive/10 border-destructive/30"
                    : isPast
                    ? "bg-destructive/5 border-border/50"
                    : "bg-secondary/30 border-border/30"
                }`}
              >
                {hasProcessed ? (
                  <CheckCircle2 className="h-5 w-5 text-primary mb-1" />
                ) : hasProcessing ? (
                  <Clock className="h-5 w-5 text-chart-warning mb-1 animate-pulse" />
                ) : hasError ? (
                  <AlertCircle className="h-5 w-5 text-destructive mb-1" />
                ) : isPast ? (
                  <div className="h-5 w-5 rounded-full border-2 border-destructive/30 mb-1" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-border/50 mb-1" />
                )}
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                  hasProcessed ? "text-primary" : "text-muted-foreground"
                }`}>
                  {month.label.split(" ")[0]}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {month.label.split(" ")[1]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upload section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <FileUploadZone
          title="Saldobalance"
          description="Upload din seneste saldobalance (Excel, CSV eller PDF)"
          accept=".xlsx,.xls,.csv,.pdf"
          conversationId={conversationId}
          userId={user?.id || null}
          onPipelineComplete={handlePipelineComplete}
        />
        <FileUploadZone
          title="Resultatopgørelse"
          description="Upload din seneste resultatopgørelse (Excel, CSV eller PDF)"
          accept=".xlsx,.xls,.csv,.pdf"
          conversationId={conversationId}
          userId={user?.id || null}
          onPipelineComplete={handlePipelineComplete}
        />
      </div>

      {/* AI Financial Analysis */}
      <div className="mb-8">
        <AIFinancialAnalysis conversationId={conversationId} userId={user?.id || null} />
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
