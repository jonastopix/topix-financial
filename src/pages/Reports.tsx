import { useState, useEffect } from "react";
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
  User,
  ThumbsUp,
  Send,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";

interface ReportFeedback {
  id: string;
  type: "ai" | "advisor";
  author: string;
  role?: string;
  date: string;
  message: string;
  severity?: "positiv" | "advarsel" | "kritisk";
  likes?: number;
  actionedOn?: boolean;
}

interface PastReport {
  id: string;
  month: string;
  status: "submitted" | "pending" | "overdue";
  highlights: string[];
  feedbackCount: number;
  submittedAt?: string;
  feedback: ReportFeedback[];
}

const pastReports: PastReport[] = [
  {
    id: "1",
    month: "Februar 2026",
    status: "pending",
    highlights: [],
    feedbackCount: 0,
    feedback: [],
  },
  {
    id: "2",
    month: "Januar 2026",
    status: "submitted",
    highlights: ["MRR nåede 98k DKK", "Lancerede ny pricing model", "Ansatte 2 nye udviklere"],
    feedbackCount: 6,
    submittedAt: "28. jan 2026",
    feedback: [
      {
        id: "f1",
        type: "ai",
        author: "AI Analyse",
        date: "28. jan 2026",
        message: "Omsætningen steg 20,3% MoM – en stærk vækstrate. Dog steg marketing-omkostningerne med 31%, hvilket presser contribution margin. Anbefaling: Analyser ROAS pr. kanal og alloker budget til de bedst performende.",
        severity: "advarsel",
        actionedOn: true,
      },
      {
        id: "f2",
        type: "ai",
        author: "AI Analyse",
        date: "28. jan 2026",
        message: "Lønninger er stabile, men med 2 nye ansættelser bør I budgettere en stigning på ~15% fra næste måned. Runway påvirkes – gå fra 16 til ca. 13 mdr.",
        severity: "kritisk",
        actionedOn: false,
      },
      {
        id: "f3",
        type: "ai",
        author: "AI Analyse",
        date: "28. jan 2026",
        message: "Ny pricing model er et godt strategisk træk. Monitor churn rate de næste 2-3 måneder for at vurdere impact.",
        severity: "positiv",
        actionedOn: true,
      },
      {
        id: "f4",
        type: "advisor",
        author: "Morten H.",
        role: "Advisor",
        date: "30. jan 2026",
        message: "Stærk vækst i MRR! Overvej at investere mere i marketing nu, da jeres unit economics ser solide ud. Hvad er planen for enterprise-segmentet?",
        likes: 3,
      },
      {
        id: "f5",
        type: "advisor",
        author: "Jonas K.",
        role: "Advisor",
        date: "29. jan 2026",
        message: "God fremgang med pricing. Husk at dokumentere jeres salgsproces så den kan skaleres. Hvem ejer salgsfunktionen pt?",
        likes: 2,
      },
    ],
  },
  {
    id: "3",
    month: "December 2025",
    status: "submitted",
    highlights: ["Lukkede 15 nye kunder", "Reducerede churn til 3%", "Launched v2.0"],
    feedbackCount: 5,
    submittedAt: "30. dec 2025",
    feedback: [
      {
        id: "f6",
        type: "ai",
        author: "AI Analyse",
        date: "30. dec 2025",
        message: "15 nye kunder er imponerende (+25% MoM). CAC ser ud til at falde, hvilket er et sundt tegn. Fortsæt den nuværende kanal-strategi.",
        severity: "positiv",
        actionedOn: true,
      },
      {
        id: "f7",
        type: "ai",
        author: "AI Analyse",
        date: "30. dec 2025",
        message: "Churn reduceret til 3% fra 4,1% – godt arbejde. Men administrative omkostninger steg 18% – undersøg hvad der driver dette.",
        severity: "advarsel",
        actionedOn: false,
      },
      {
        id: "f8",
        type: "advisor",
        author: "Morten H.",
        role: "Advisor",
        date: "2. jan 2026",
        message: "V2.0 launch ser lovende ud. Hvad er jeres plan for at reducere CAC? De nuværende tal er acceptable, men der er plads til optimering.",
        likes: 4,
      },
    ],
  },
  {
    id: "4",
    month: "November 2025",
    status: "submitted",
    highlights: ["Første enterprise-kunde", "Team voksede til 5 personer"],
    feedbackCount: 3,
    submittedAt: "27. nov 2025",
    feedback: [
      {
        id: "f9",
        type: "ai",
        author: "AI Analyse",
        date: "27. nov 2025",
        message: "Første enterprise-kunde er en vigtig milestone. Sikr at onboarding-processen er dokumenteret og skalerbar. Enterprise-segmentet kan drive betydelig ARR-vækst.",
        severity: "positiv",
        actionedOn: true,
      },
      {
        id: "f10",
        type: "ai",
        author: "AI Analyse",
        date: "27. nov 2025",
        message: "Med 5 ansatte bør I formalisere jeres organisationsstruktur. Burn rate stiger – overvej at sætte tydelige hiring-milestones knyttet til revenue-mål.",
        severity: "advarsel",
        actionedOn: true,
      },
    ],
  },
];

const statusConfig = {
  submitted: { icon: CheckCircle2, label: "Indsendt", className: "text-primary", bg: "bg-primary/10" },
  pending: { icon: Clock, label: "Afventer", className: "text-chart-warning", bg: "bg-chart-warning/10" },
  overdue: { icon: AlertCircle, label: "Forsinket", className: "text-destructive", bg: "bg-destructive/10" },
};

const severityIcon = {
  positiv: { icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
  advarsel: { icon: AlertTriangle, color: "text-chart-warning", bg: "bg-chart-warning/10" },
  kritisk: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
};

interface ChatMsg {
  id: string;
  sender_id: string;
  content: string;
  message_type: string;
  context_id: string | null;
  created_at: string;
}

interface DbReport {
  id: string;
  file_name: string;
  report_type: string;
  report_period: string | null;
  uploaded_at: string;
  status: string;
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

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const [reportsRes, convRes] = await Promise.all([
        supabase
          .from("financial_reports")
          .select("id, file_name, report_type, report_period, uploaded_at, status")
          .eq("user_id", user.id)
          .order("uploaded_at", { ascending: false }),
        supabase.from("conversations").select("id").eq("member_id", user.id).single(),
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
    };

    load();
  }, [user]);

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

  const toggleReport = (id: string) => {
    setExpandedReport(prev => prev === id ? null : id);
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

      {/* Upload section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <FileUploadZone
          title="Saldobalance"
          description="Upload din seneste saldobalance (Excel, CSV eller PDF)"
          accept=".xlsx,.xls,.csv,.pdf"
        />
        <FileUploadZone
          title="Resultatopgørelse"
          description="Upload din seneste resultatopgørelse (Excel, CSV eller PDF)"
          accept=".xlsx,.xls,.csv,.pdf"
        />
      </div>

      {/* AI Financial Analysis for current period */}
      <div className="mb-8">
        <AIFinancialAnalysis />
      </div>

      {/* Reports with integrated feedback */}
      <h2 className="font-display font-semibold text-foreground text-lg mb-4">
        Rapporter & Feedback
      </h2>
      <div className="space-y-4">
        {pastReports.map((report) => {
          const config = statusConfig[report.status];
          const Icon = config.icon;
          const isExpanded = expandedReport === report.id;
          const aiFeedback = report.feedback.filter(f => f.type === "ai");
          const advisorFeedback = report.feedback.filter(f => f.type === "advisor");
          const actionedCount = aiFeedback.filter(f => f.actionedOn).length;

          return (
            <div key={report.id} className="glass-card rounded-xl animate-fade-in overflow-hidden">
              {/* Report header - clickable */}
              <button
                onClick={() => toggleReport(report.id)}
                className="w-full p-6 text-left hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-muted">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-foreground">
                        {report.month}
                      </h3>
                      {report.submittedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Indsendt {report.submittedAt}
                        </p>
                      )}
                      {report.highlights.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {report.highlights.map((h, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                              {h}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* AI progress indicator */}
                    {aiFeedback.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                        <Sparkles className="h-3 w-3" />
                        {actionedCount}/{aiFeedback.length} handlet
                      </span>
                    )}
                    {report.feedbackCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        {report.feedbackCount}
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

              {/* Expanded feedback thread */}
              {isExpanded && report.feedback.length > 0 && (
                <div className="border-t border-border/50 px-6 pb-6">
                  {/* AI Feedback section */}
                  {aiFeedback.length > 0 && (
                    <div className="pt-5 mb-5">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary" />
                        AI Anbefalinger
                      </h4>
                      <div className="space-y-3">
                        {aiFeedback.map((fb) => {
                          const sev = severityIcon[fb.severity || "positiv"];
                          const SevIcon = sev.icon;
                          return (
                            <div
                              key={fb.id}
                              className={`rounded-xl border p-4 transition-all ${
                                fb.actionedOn
                                  ? "border-primary/20 bg-primary/5"
                                  : "border-border/30 bg-secondary/20"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`p-1.5 rounded-md ${sev.bg} mt-0.5`}>
                                  <SevIcon className={`h-3.5 w-3.5 ${sev.color}`} />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm text-foreground leading-relaxed">{fb.message}</p>
                                  <div className="flex items-center gap-3 mt-2">
                                    <span className="text-[10px] text-muted-foreground">{fb.date}</span>
                                    {fb.actionedOn !== undefined && (
                                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                        fb.actionedOn
                                          ? "bg-primary/10 text-primary"
                                          : "bg-chart-warning/10 text-chart-warning"
                                      }`}>
                                        {fb.actionedOn ? (
                                          <><CheckCircle2 className="h-3 w-3" /> Handlet på</>
                                        ) : (
                                          <><Clock className="h-3 w-3" /> Afventer handling</>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Advisor comments section */}
                  {advisorFeedback.length > 0 && (
                    <div className="mb-5">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        Advisor Kommentarer
                      </h4>
                      <div className="space-y-3">
                        {advisorFeedback.map((fb) => (
                          <div key={fb.id} className="rounded-xl border border-border/30 bg-secondary/20 p-4">
                            <div className="flex items-start gap-3">
                              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-medium text-foreground">
                                  {fb.author.split(" ").map(w => w[0]).join("")}
                                </span>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold text-foreground">{fb.author}</span>
                                  <span className="text-[10px] text-muted-foreground">{fb.role}</span>
                                  <span className="text-[10px] text-muted-foreground">· {fb.date}</span>
                                </div>
                                <p className="text-sm text-foreground leading-relaxed">{fb.message}</p>
                                {fb.likes !== undefined && (
                                  <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-2">
                                    <ThumbsUp className="h-3 w-3" />
                                    {fb.likes}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chat-based comments */}
                  {(() => {
                    const matchedDbReport = dbReports[pastReports.indexOf(report)];
                    const msgs = matchedDbReport ? (chatMessages[matchedDbReport.id] || []) : [];

                    return (
                      <>
                        {msgs.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <MessageSquare className="h-3 w-3" />
                              Kommentartråd
                            </h4>
                            <div className="space-y-2">
                              {msgs.map((c) => {
                                const isOwn = c.sender_id === user?.id;
                                const authorName = isOwn ? "Dig" : (advisorProfiles[c.sender_id] || "Advisor");
                                return (
                                  <div key={c.id} className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                                    <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                                      <span className="text-[9px] font-medium text-foreground">
                                        {authorName === "Dig" ? "Du" : authorName.split(" ").map(w => w[0]).join("")}
                                      </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-semibold text-foreground">{authorName}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {format(new Date(c.created_at), "d. MMM yyyy HH:mm", { locale: da })}
                                        </span>
                                      </div>
                                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">{c.content}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Reply input */}
                        {report.status === "submitted" && matchedDbReport && (
                          <div className="flex gap-2 pt-3 border-t border-border/30">
                            <textarea
                              value={commentInputs[matchedDbReport.id] || ""}
                              onChange={(e) =>
                                setCommentInputs((prev) => ({ ...prev, [matchedDbReport.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSubmitComment(matchedDbReport.id, matchedDbReport.file_name);
                                }
                              }}
                              placeholder="Svar på kommentarer (sendes til chatten)..."
                              maxLength={2000}
                              rows={1}
                              className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <button
                              onClick={() => handleSubmitComment(matchedDbReport.id, matchedDbReport.file_name)}
                              disabled={!(commentInputs[matchedDbReport.id] || "").trim() || submittingComment === matchedDbReport.id}
                              className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Collapsed: show empty state for pending reports */}
              {isExpanded && report.feedback.length === 0 && (
                <div className="border-t border-border/50 px-6 py-8 text-center">
                  <Sparkles className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Upload og indsend rapporten for at modtage AI-analyse og advisor feedback
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
};

export default Reports;
