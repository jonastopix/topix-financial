import { useState, useEffect } from "react";
import { useParams, Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { notifyChatMessage } from "@/lib/chatNotify";
import {
  ArrowLeft,
  FileText,
  Wallet,
  Building2,
  Globe,
  Hash,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Target,
  MessageSquare,
  Send,
  ClipboardList,
  ExternalLink,
  Mail,
  Trash2,
  Pencil,
} from "lucide-react";
import HandoutDetail from "@/components/HandoutDetail";
import DeliveryOverview from "@/components/DeliveryOverview";
import { handoutConfigs, moduleOrder, type HandoutModule, type HandoutConfig } from "@/lib/handoutConfig";
import { calcHandoutProgress } from "@/lib/handoutUtils";
import { reportStatusConfig, getEffectiveReportPeriod, getEffectiveKeyFigures, hasManualOverride, REPORT_OVERRIDE_SELECT, type ReportData } from "@/lib/financialUtils";
import { openReportFile, isLegacyPath } from "@/lib/reportFileAccess";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import type { Json } from "@/integrations/supabase/types";

interface MemberProfile {
  full_name: string;
  company_name: string | null;
  avatar_url: string | null;
  created_at: string;
  email: string | null;
}

interface CompanyContext {
  company_id: string;
  name: string;
  industry: string | null;
  cvr_number: string | null;
  slack_channel: string | null;
  city: string | null;
  website: string | null;
  logo_url: string | null;
  start_date: string | null;
}

interface Report {
  id: string;
  file_name: string;
  file_path: string;
  report_type: string;
  status: string;
  report_period: string | null;
  uploaded_at: string;
  processed_at: string | null;
  extracted_data: Json | null;
  normalized_data?: Json | null;
  manual_report_period_label?: string | null;
  manual_report_period_key?: string | null;
  manual_normalized_data?: Json | null;
  manual_override_status?: string | null;
  manual_override_note?: string | null;
  manual_override_by?: string | null;
  manual_override_at?: string | null;
  manual_override_source?: string | null;
  manual_report_type?: string | null;
}

interface BudgetTarget {
  id: string;
  category: string;
  budget_amount: number;
  period: string;
}

interface Milestone {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  progress: number;
  status: string;
  source: string;
  source_report: string | null;
  created_at: string;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  context_type: string | null;
  context_id: string | null;
  context_meta: Record<string, unknown> | null;
  created_at: string;
}

interface HandoutSummaryItem {
  module: HandoutModule;
  status: 'not_started' | 'in_progress' | 'completed';
  progress: number;
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; label: string; className: string; bg: string }> = {
  processed: { icon: CheckCircle2, ...reportStatusConfig.processed },
  processing: { icon: Clock, ...reportStatusConfig.processing },
  error: { icon: AlertCircle, ...reportStatusConfig.error },
};

const handoutStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  not_started: { label: "Ikke startet", variant: "outline" },
  in_progress: { label: "I gang", variant: "secondary" },
  completed: { label: "Udfyldt", variant: "default" },
};

const MemberDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { isAdvisor: rawAdvisor, user, loading: authLoading } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [companyCtx, setCompanyCtx] = useState<CompanyContext | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [budgets, setBudgets] = useState<BudgetTarget[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [handoutSummaries, setHandoutSummaries] = useState<HandoutSummaryItem[]>([]);
  const [activeHandout, setActiveHandout] = useState<HandoutModule | null>(() => {
    const h = searchParams.get("handout") as HandoutModule | null;
    return h && moduleOrder.includes(h) ? h : null;
  });
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedReport, setExpandedReport] = useState<string | null>(() => {
    return searchParams.get("reportId") || null;
  });
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const memberCompanyId = companyCtx?.company_id ?? null;
  const { data: memberFacts = [] } = useCompanyFacts(memberCompanyId ?? undefined);

  const { data: latestPulse } = useQuery({
    queryKey: ["pulse-checkin-member", memberCompanyId],
    queryFn: async () => {
      if (!memberCompanyId) return null;
      const { data } = await (supabase
        .from("pulse_checkins" as any)
        .select("went_well, biggest_challenge, milestone_progress, created_at, period_key")
        .eq("company_id", memberCompanyId)
        .order("created_at", { ascending: false })
        .limit(1) as any).maybeSingle();
      return data || null;
    },
    enabled: !!memberCompanyId,
    staleTime: 5 * 60_000,
  });


  // Clear deep-link params after consuming
  useEffect(() => {
    if (searchParams.has("handout") || searchParams.has("reportId")) {
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to and highlight deep-linked report after data loads
  useEffect(() => {
    if (!expandedReport || loading || reports.length === 0) return;
    const targetReport = reports.find(r => r.id === expandedReport);
    if (!targetReport) return;
    // Wait for DOM render
    const timer = setTimeout(() => {
      const el = document.getElementById(`report-${expandedReport}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2500);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [loading, reports]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveMember = async () => {
    if (!userId) return;
    setRemoving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('manage-advisor', {
        body: { action: 'remove-member', target_user_id: userId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Medlem fjernet", description: "Brugeren er blevet fjernet fra virksomheden." });
      navigate('/members');
    } catch (err: any) {
      toast({ title: "Fejl", description: err.message || "Kunne ikke fjerne medlem", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  useEffect(() => {
    if (!userId || !isAdvisor) return;

    const load = async () => {
      setLoading(true);
      const [profileRes, reportsRes, milestonesRes, convRes, handoutsRes] = await Promise.all([
        supabase.from("profiles").select("full_name, company_name, avatar_url, created_at, email").eq("user_id", userId).single(),
        (supabase.from("financial_reports").select("*") as any).eq("user_id", userId).is("deleted_at", null).order("uploaded_at", { ascending: false }),
        supabase.from("milestones").select("*").eq("user_id", userId).order("deadline", { ascending: true }),
        supabase.from("conversations").select("id").eq("member_id", userId).single(),
        supabase.from("handouts").select("module, status, responses, checklist, levers").eq("user_id", userId),
      ]);

      // Fetch company context via company_members
      const { data: cmData } = await supabase
        .from("company_members" as any)
        .select("company_id, companies:company_id(name, industry, cvr_number, slack_channel, city, website, logo_url, start_date)" as any)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      const cm = cmData as any;
      if (cm?.companies) {
        setCompanyCtx({ ...cm.companies, company_id: cm.company_id } as CompanyContext);
        // Fetch budgets by company_id (correct key)
        const { data: budgetData } = await supabase
          .from("budget_targets")
          .select("*")
          .eq("company_id", cm.company_id)
          .order("category");
        setBudgets(budgetData || []);
        // Fetch invitation that was accepted by this specific user
        let invData: any = null;
        // Primary: match via accepted_by
        const { data: invByAcceptor } = await (supabase
          .from("company_invitations") as any)
          .select("email")
          .eq("company_id", cm.company_id)
          .eq("accepted_by", userId)
          .eq("status", "accepted")
          .maybeSingle();
        invData = invByAcceptor;

        // Fallback for legacy data: if company has exactly 1 member and 1 accepted invitation
        if (!invData) {
          const { count: memberCount } = await supabase
            .from("company_members")
            .select("id", { count: "exact", head: true })
            .eq("company_id", cm.company_id);
          if (memberCount === 1) {
            const { data: singleInv } = await (supabase
              .from("company_invitations") as any)
              .select("email")
              .eq("company_id", cm.company_id)
              .eq("status", "accepted")
              .maybeSingle();
            invData = singleInv;
          }
        }

        const profileEmail = profileRes.data?.email?.toLowerCase()?.trim();
        const invEmail = (invData as any)?.email?.toLowerCase()?.trim();
        if (invEmail && invEmail !== profileEmail) {
          setInvitedEmail((invData as any).email);
        } else {
          setInvitedEmail(null);
        }
      } else {
        setCompanyCtx(null);
        setInvitedEmail(null);
      }

      const reportsList = reportsRes.data || [];
      setProfile(profileRes.data);
      setReports(reportsList);
      setBudgets(budgetsRes.data || []);
      setMilestones(milestonesRes.data || []);
      setConversationId(convRes.data?.id || null);

      // Build handout summaries
      const handoutMap = new Map((handoutsRes.data || []).map((d: any) => [d.module, d]));
      setHandoutSummaries(moduleOrder.map(m => {
        const d = handoutMap.get(m) as any;
        if (!d) return { module: m, status: 'not_started' as const, progress: 0 };
        const config = handoutConfigs[m];
        const progress = calcHandoutProgress(
          config,
          (d.responses as Record<string, string>) || {},
          (d.checklist as Record<string, boolean>) || {},
          (d.levers as string[]) || []
        );
        return { module: m, status: d.status as HandoutSummaryItem["status"], progress };
      }));

      // Fetch chat messages with report context
      if (reportsList.length > 0 && convRes.data?.id) {
        const reportIds = reportsList.map((r) => r.id);
        const { data: msgs } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", convRes.data.id)
          .eq("context_type", "report")
          .in("context_id", reportIds)
          .order("created_at", { ascending: true });

        const grouped: Record<string, ChatMessage[]> = {};
        (msgs || []).forEach((m: any) => {
          const rid = m.context_id;
          if (rid) {
            if (!grouped[rid]) grouped[rid] = [];
            grouped[rid].push(m as ChatMessage);
          }
        });
        setChatMessages(grouped);
      }

      setLoading(false);
    };

    load();
  }, [userId, isAdvisor]);

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
        [reportId]: [...(prev[reportId] || []), data as unknown as ChatMessage],
      }));
      setCommentInputs((prev) => ({ ...prev, [reportId]: "" }));
      // Server-side: Slack + advisor notification
      notifyChatMessage((data as any).id);
    }
    setSubmittingComment(null);
  };

  const handleViewOriginalFile = async (filePath: string) => {
    await openReportFile(filePath);
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const formatDKK = (n: number) =>
    n.toLocaleString("da-DK", { maximumFractionDigits: 0 }) + " DKK";

  const renderExtractedData = (report: Report) => {
    const isOverridden = hasManualOverride(report as unknown as ReportData);

    // Prefer committed facts over raw report data
    const matchingFact = memberFacts.find(f => f.source_report_id === report.id)
      || memberFacts.find(f => f.period_label === report.report_period);

    let kf: Record<string, number> | null = null;
    if (matchingFact) {
      kf = factsToDanishMetrics(matchingFact.metrics);
    } else {
      kf = getEffectiveKeyFigures(report as unknown as ReportData);
    }

    if (!kf) {
      return <p className="text-sm text-muted-foreground">Ingen nøgletal fundet</p>;
    }

    const formatVal = (n?: number) =>
      n != null ? `${n.toLocaleString("da-DK")} kr.` : "—";

    const stats = [
      { label: "Omsætning", value: formatVal(kf.omsaetning) },
      { label: "Dækningsbidrag", value: formatVal(kf.daekningsbidrag) },
      { label: "Lønninger", value: formatVal(kf.loenninger) },
      { label: "Resultat f. skat", value: formatVal(kf.resultat_foer_skat) },
      kf.aktiver_i_alt != null ? { label: "Aktiver", value: formatVal(kf.aktiver_i_alt) } : null,
      kf.egenkapital != null ? { label: "Egenkapital", value: formatVal(kf.egenkapital) } : null,
      kf.bank_balance != null ? { label: "Bank", value: formatVal(kf.bank_balance) } : null,
      kf.debitorer != null ? { label: "Debitorer", value: formatVal(kf.debitorer) } : null,
      kf.kreditorer != null ? { label: "Kreditorer", value: formatVal(kf.kreditorer) } : null,
    ].filter(Boolean) as { label: string; value: string }[];

    return (
      <div>
        {isOverridden && (
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-accent-foreground mb-3">
            <Pencil className="h-3 w-3" />
            Manuelt rettet
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border/50 bg-background/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className="text-sm font-medium text-foreground mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (authLoading) return null;
  if (!isAdvisor) return <Navigate to="/" replace />;

  if (activeHandout) {
    return (
      <AppLayout>
        <HandoutDetail
          config={handoutConfigs[activeHandout]}
          onBack={() => setActiveHandout(null)}
          userId={userId}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Back link */}
      <Link
        to="/members"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Tilbage til medlemmer
      </Link>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : !profile ? (
        <div className="text-center py-20 text-muted-foreground">Medlem ikke fundet</div>
      ) : (
        <>
          {/* Member header */}
           <div className="glass-card rounded-xl p-6 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {companyCtx?.logo_url ? (
                <img src={companyCtx.logo_url} alt={companyCtx.name} className="h-full w-full object-contain" />
              ) : (
                <span className="text-lg font-bold text-primary">{getInitials(profile.full_name)}</span>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-display font-bold text-foreground">{profile.full_name}</h1>
              <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-muted-foreground">
                {companyCtx?.name && (
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Building2 className="h-3.5 w-3.5 text-primary" /> {companyCtx.name}
                  </span>
                )}
                {companyCtx?.industry && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5" /> {companyCtx.industry}
                  </span>
                )}
                {companyCtx?.cvr_number && (
                  <span className="flex items-center gap-1 font-mono text-xs">
                    CVR: {companyCtx.cvr_number}
                  </span>
                )}
                {companyCtx?.slack_channel && (
                  <span className="flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5" /> {companyCtx.slack_channel}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Medlem siden {format(new Date(profile.created_at), "MMMM yyyy", { locale: da })}
                </span>
              </div>
              {/* Email display */}
              {profile.email && (
                <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {profile.email}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <div className="text-center px-4">
                <p className="text-2xl font-display font-bold text-foreground">{reports.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Rapporter</p>
              </div>
              <div className="text-center px-4 border-l border-border">
                <p className="text-2xl font-display font-bold text-foreground">{budgets.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Budgetposter</p>
              </div>
              <div className="text-center px-4 border-l border-border">
                <p className="text-2xl font-display font-bold text-foreground">{milestones.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Milestones</p>
            </div>

            {/* Remove member button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Fjern medlem</AlertDialogTitle>
                  <AlertDialogDescription>
                    Er du sikker på, at du vil fjerne <strong>{profile.full_name}</strong>
                    {profile.email ? ` (${profile.email})` : ''}? 
                    Denne handling er permanent og fjerner brugeren fra virksomheden, profilen og kontoen.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuller</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRemoveMember}
                    disabled={removing}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {removing ? "Fjerner..." : "Fjern medlem"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          </div>

          {/* Delivery Overview */}
          <div className="mb-8">
            <DeliveryOverview reports={reports} />
          </div>

          {/* Reports section */}
          <div className="mb-8">
            <h2 className="font-display font-semibold text-foreground text-lg mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Rapporter
            </h2>

            {reports.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Ingen rapporter uploadet endnu</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => {
                  const isExpanded = expandedReport === report.id;
                  const config = statusConfig[report.status] || statusConfig.processing;
                  const StatusIcon = config.icon;

                  return (
                    <div key={report.id} id={`report-${report.id}`} className="glass-card rounded-xl overflow-hidden animate-fade-in transition-all duration-300">
                      <button
                        onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                        className="w-full text-left px-5 py-4 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2.5 rounded-lg bg-muted flex-shrink-0">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{report.file_name}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-muted-foreground capitalize">{report.report_type}</span>
                                {(() => {
                                  const effectivePeriod = getEffectiveReportPeriod(report as unknown as ReportData);
                                  return effectivePeriod ? (
                                    <span className="text-xs text-muted-foreground">· {effectivePeriod}</span>
                                  ) : null;
                                })()}
                                <span className="text-xs text-muted-foreground">
                                  · {format(new Date(report.uploaded_at), "d. MMM yyyy", { locale: da })}
                                </span>
                                {hasManualOverride(report as unknown as ReportData) && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                                    <Pencil className="h-2.5 w-2.5" /> Rettet
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  · {format(new Date(report.uploaded_at), "d. MMM yyyy", { locale: da })}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${config.bg} ${config.className}`}>
                              <StatusIcon className="h-3 w-3" />
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
                        <div className="border-t border-border/50 px-5 py-5">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            Ekstraheret data
                          </h4>
                          {renderExtractedData(report)}

                          {report.processed_at && (
                            <p className="text-[10px] text-muted-foreground mt-4">
                              Behandlet {format(new Date(report.processed_at), "d. MMM yyyy HH:mm", { locale: da })}
                            </p>
                          )}

                          {/* View original file button */}
                          {report.file_path && !isLegacyPath(report.file_path) && (
                            <button
                              onClick={() => handleViewOriginalFile(report.file_path)}
                              className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Se original fil
                            </button>
                          )}

                          {/* Chat comments section */}
                          <div className="mt-5 border-t border-border/50 pt-4">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5" />
                              Kommentarer ({(chatMessages[report.id] || []).length})
                            </h4>

                            {(chatMessages[report.id] || []).length > 0 && (
                              <div className="space-y-2 mb-3">
                                {(chatMessages[report.id] || []).map((msg) => (
                                  <div key={msg.id} className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                      <span className="text-[9px] font-bold text-primary">
                                        {msg.sender_id === user?.id ? "Du" : "M"}
                                      </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">{msg.content}</p>
                                      <p className="text-[10px] text-muted-foreground mt-1">
                                        {format(new Date(msg.created_at), "d. MMM yyyy HH:mm", { locale: da })}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex gap-2">
                              <textarea
                                value={commentInputs[report.id] || ""}
                                onChange={(e) =>
                                  setCommentInputs((prev) => ({ ...prev, [report.id]: e.target.value }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmitComment(report.id, report.file_name);
                                  }
                                }}
                                placeholder="Skriv en kommentar (sendes til chatten)..."
                                maxLength={2000}
                                rows={1}
                                className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <button
                                onClick={() => handleSubmitComment(report.id, report.file_name)}
                                disabled={!(commentInputs[report.id] || "").trim() || submittingComment === report.id}
                                className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                              >
                                <Send className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Budget section */}
          <div className="mb-8">
            <h2 className="font-display font-semibold text-foreground text-lg mb-4 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Budget
            </h2>

            {budgets.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center">
                <Wallet className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Intet budget opsat endnu</p>
              </div>
            ) : (
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="hidden sm:grid grid-cols-3 gap-2 px-5 py-3 bg-secondary/50 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Kategori</span>
                  <span>Periode</span>
                  <span className="text-right">Budgetteret</span>
                </div>
                <div className="divide-y divide-border/50">
                  {budgets.map((b) => (
                    <div key={b.id} className="px-5 py-3 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2 items-center">
                      <span className="text-sm font-medium text-foreground">{b.category}</span>
                      <span className="text-sm text-muted-foreground">{b.period}</span>
                      <span className="text-sm font-medium text-foreground sm:text-right">{formatDKK(b.budget_amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 bg-secondary/30 border-t border-border flex justify-between items-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Total</span>
                  <span className="text-sm font-bold text-foreground">
                    {formatDKK(budgets.reduce((sum, b) => sum + Number(b.budget_amount), 0))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Pulse check-in section */}
          {latestPulse && (
            <div className="mb-8">
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Pulse check-in · {(() => {
                    const [y, m] = (latestPulse.period_key || "").split("-");
                    const months = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
                    return `${months[parseInt(m, 10) - 1] || m} ${y}`;
                  })()}
                </h3>
                <div className="space-y-3">
                  {latestPulse.went_well && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Hvad gik godt</p>
                      <p className="text-sm text-foreground">{latestPulse.went_well}</p>
                    </div>
                  )}
                  {latestPulse.biggest_challenge && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Største udfordring</p>
                      <p className="text-sm text-foreground">{latestPulse.biggest_challenge}</p>
                    </div>
                  )}
                  {latestPulse.milestone_progress != null && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Milestone fremgang</p>
                      <p className="text-sm font-medium text-foreground">{latestPulse.milestone_progress}%</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!latestPulse && memberCompanyId && (
            <div className="mb-8">
              <div className="glass-card rounded-xl p-5">
                <p className="text-sm text-muted-foreground">Ingen pulse check-in denne måned endnu.</p>
              </div>
            </div>
          )}

          {/* Handouts section */}
          <div className="mb-8">
            <h2 className="font-display font-semibold text-foreground text-lg mb-4 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Handouts
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {handoutSummaries.map(s => {
                const config = handoutConfigs[s.module];
                const statusInfo = handoutStatusLabels[s.status];
                return (
                  <button
                    key={s.module}
                    onClick={() => setActiveHandout(s.module)}
                    className="glass-card rounded-xl p-4 text-left hover:ring-2 hover:ring-primary/30 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-foreground">{config.title}</h3>
                      <Badge variant={statusInfo.variant} className="text-[10px]">{statusInfo.label}</Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Udfyldt</span>
                        <span className="font-medium text-foreground">{s.progress}%</span>
                      </div>
                      <Progress value={s.progress} className="h-1.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Milestones section */}
          <div>
            <h2 className="font-display font-semibold text-foreground text-lg mb-4 flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Milestones
            </h2>

            {milestones.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center">
                <Target className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Ingen milestones oprettet endnu</p>
              </div>
            ) : (
              <div className="space-y-3">
                {milestones.map((m) => {
                  const isCompleted = m.status === "completed";
                  const isOverdue = m.deadline && new Date(m.deadline) < new Date() && !isCompleted;

                  return (
                    <div key={m.id} className="glass-card rounded-xl p-4 animate-fade-in">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 p-2 rounded-lg flex-shrink-0 ${isCompleted ? "bg-primary/10" : isOverdue ? "bg-destructive/10" : "bg-muted"}`}>
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : (
                            <Target className={`h-4 w-4 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-medium ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {m.title}
                            </p>
                            {m.source === "ai" && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                AI-foreslået
                              </span>
                            )}
                            {isOverdue && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                                Overskredet
                              </span>
                            )}
                          </div>
                          {m.description && (
                            <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            {m.deadline && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(m.deadline), "d. MMM yyyy", { locale: da })}
                              </span>
                            )}
                            {m.source_report && (
                              <span className="text-xs text-muted-foreground">· {m.source_report}</span>
                            )}
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${isCompleted ? "bg-primary" : isOverdue ? "bg-destructive" : "bg-primary/70"}`}
                                style={{ width: `${m.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground font-medium w-8 text-right">{m.progress}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default MemberDetail;
