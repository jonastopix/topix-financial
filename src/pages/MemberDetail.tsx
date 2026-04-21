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
import AdvisorAIChat from "@/components/AdvisorAIChat";
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
  Sparkles,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Briefcase,
  CircleDot,
  AlertTriangle,
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
import { toast } from "sonner";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip as RechartsTooltip, LineChart, Line } from "recharts";
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
  industry_label: string | null;
  cvr_number: string | null;
  slack_channel: string | null;
  city: string | null;
  website: string | null;
  logo_url: string | null;
  start_date: string | null;
  application_context: Record<string, any> | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  onboarding_completed: boolean | null;
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
  levers: string[];
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

function buildBudgetSummary(budgets: { category: string; budget_amount: number; period: string }[]) {
  const GROUP_LABELS: Record<string, string> = {
    indtaegter: "Indtægter", variable: "Variable omk.", personale: "Personale",
    salg_marketing: "Salg & marketing", drift: "Drift", faste: "Faste omk.",
  };
  const baseRows = budgets.filter(b => b.period.includes("-base-"));
  const catTotals: Record<string, number> = {};
  for (const row of baseRows) catTotals[row.category] = (catTotals[row.category] || 0) + row.budget_amount;
  const CATEGORY_GROUPS: Record<string, string> = {
    omsaetning: "indtaegter",
    vareforbrug: "variable", fragt_levering: "variable", betalingsgebyrer: "variable",
    underleverandoerer: "variable", materialer: "variable", raavarerfood: "variable",
    loenninger: "personale", freelance_konsulenter: "personale", uddannelse: "personale",
    loenninger_dev: "personale", loenninger_salg: "personale", loenninger_admin: "personale",
    digital_marketing: "salg_marketing", seo_content: "salg_marketing",
    email_marketing: "salg_marketing", lokal_marketing: "salg_marketing",
    salg_kundepleje: "salg_marketing", rejser_repraesentant: "salg_marketing",
    salg_netvaerk: "salg_marketing", marketing: "salg_marketing",
    platform_tech: "drift", tech_software: "drift", hosting_infra: "drift",
    booking_tech: "drift", lager_logistik: "drift", koeretoej_braendstof: "drift",
    maskiner_vaerktoj: "drift", telefon_internet: "drift", udstyr_inventar: "drift",
    lokaler: "faste", lokaler_husleje: "faste", lokaler_vaerksted: "faste",
    forsikring: "faste", forsikring_abonnementer: "faste",
    admin_regnskab: "faste", admin: "faste", musik_rettigheder: "faste",
  };
  const groupTotals: Record<string, number> = {};
  for (const [cat, amount] of Object.entries(catTotals)) {
    const group = CATEGORY_GROUPS[cat] || "faste";
    groupTotals[group] = (groupTotals[group] || 0) + amount;
  }
  const ORDER = ["indtaegter", "variable", "personale", "salg_marketing", "drift", "faste"];
  return ORDER.filter(g => groupTotals[g] > 0).map(g => ({
    group: g, label: GROUP_LABELS[g] || g, total: groupTotals[g], isRevenue: g === "indtaegter",
  }));
}

const MemberDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
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
  const [convStatus, setConvStatus] = useState<{
    awaiting_reply_from: string | null;
    assigned_advisor_id: string | null;
    follow_up_at: string | null;
    conversation_status: string | null;
  } | null>(null);
  const [assignedAdvisorName, setAssignedAdvisorName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedReport, setExpandedReport] = useState<string | null>(() => {
    return searchParams.get("reportId") || null;
  });
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [sessionBullets, setSessionBullets] = useState<string[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [agentRunning, setAgentRunning] = useState<string | null>(null);
  const [showAgentLog, setShowAgentLog] = useState(false);
  const [forecast, setForecast] = useState<any[] | null>(null);
  const memberCompanyId = companyCtx?.company_id ?? null;
  const { data: memberFacts = [] } = useCompanyFacts(memberCompanyId ?? undefined);

  const { data: latestPulse } = useQuery({
    queryKey: ["pulse-checkin-member", memberCompanyId],
    queryFn: async () => {
      if (!memberCompanyId) return null;
      const { data } = await supabase
        .from("pulse_checkins")
        .select("went_well, biggest_challenge, milestone_progress, created_at, period_key")
        .eq("company_id", memberCompanyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data || null;
    },
    enabled: !!memberCompanyId,
    staleTime: 5 * 60_000,
  });

  const { data: agentMessages = [] } = useQuery({
    queryKey: ["agent-log", memberCompanyId],
    queryFn: async () => {
      if (!memberCompanyId) return [];
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("company_id", memberCompanyId)
        .maybeSingle();
      if (!conv) return [];
      const { data } = await supabase
        .from("messages")
        .select("id, content, created_at, context_meta")
        .eq("conversation_id", conv.id)
        .eq("context_type", "agent")
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!memberCompanyId,
  });


  // Clear deep-link params after consuming
  useEffect(() => {
    if (searchParams.has("handout") || searchParams.has("reportId")) {
      setSearchParams({}, { replace: true });
    }

    const section = searchParams.get("section");
    if (section) {
      setTimeout(() => {
        const el = document.getElementById(`section-${section}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 400);
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

  const handleLoadSessionPrep = async () => {
    const cid = memberCompanyId;
    if (!cid || sessionBullets.length > 0) return;
    setLoadingSession(true);
    try {
      const { data: respData, error } = await supabase.functions.invoke("ai-financial-feedback", {
        body: {
          request_type: "session_prep",
          companyId: cid,
          companyContext: { name: companyCtx?.name },
        },
      });
      if (!error && respData?.session_prep) {
        setSessionBullets(respData.session_prep);
      } else {
        console.error("Session prep error:", error, respData);
        toast.error(`Kunne ikke generere session-noter${error?.message ? ": " + error.message : ""}`);
      }
    } catch {
      toast.error("Kunne ikke generere session-noter");
    } finally {
      setLoadingSession(false);
    }
  };

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
      toast.success("Medlem fjernet", { description: "Brugeren er blevet fjernet fra virksomheden." });
      navigate('/members');
    } catch (err: any) {
      toast.error("Fejl", { description: err.message || "Kunne ikke fjerne medlem" });
    } finally {
      setRemoving(false);
    }
  };

  useEffect(() => {
    if (!userId || !isAdvisor) return;

    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, reportsRes, milestonesRes, convRes, handoutsRes] = await Promise.all([
          supabase.from("profiles").select("full_name, company_name, avatar_url, created_at, email").eq("user_id", userId).single(),
          (supabase.from("financial_reports").select("*") as any).eq("user_id", userId).is("deleted_at", null).order("uploaded_at", { ascending: false }),
          supabase.from("milestones").select("*").eq("user_id", userId).order("deadline", { ascending: true }),
          supabase.from("conversations").select("id, awaiting_reply_from, assigned_advisor_id, follow_up_at, conversation_status").eq("member_id", userId).single(),
          supabase.from("handouts").select("module, status, responses, checklist, levers").eq("user_id", userId),
        ]);

        // Fetch company context via company_members
        const { data: cmData } = await supabase
          .from("company_members" as any)
          .select("company_id, companies:company_id(name, industry_label, cvr_number, slack_channel, city, website, logo_url, start_date, application_context, contract_start_date, contract_end_date, onboarding_completed)" as any)
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        const cm = cmData as any;
        if (cm?.companies) {
          const ctx = { ...cm.companies, company_id: cm.company_id } as CompanyContext;
          setCompanyCtx(ctx);
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
        setMilestones(milestonesRes.data || []);
        setConversationId(convRes.data?.id || null);
        const convData = convRes.data as any;
        setConvStatus(convData ? {
          awaiting_reply_from: convData.awaiting_reply_from ?? null,
          assigned_advisor_id: convData.assigned_advisor_id ?? null,
          follow_up_at: convData.follow_up_at ?? null,
          conversation_status: convData.conversation_status ?? null,
        } : null);
        if (convData?.assigned_advisor_id) {
          const { data: advisorProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", convData.assigned_advisor_id)
            .maybeSingle();
          setAssignedAdvisorName(advisorProfile?.full_name || null);
        } else {
          setAssignedAdvisorName(null);
        }

        // Build handout summaries
        const handoutMap = new Map((handoutsRes.data || []).map((d: any) => [d.module, d]));
        setHandoutSummaries(moduleOrder.map(m => {
          const d = handoutMap.get(m) as any;
          if (!d) return { module: m, status: 'not_started' as const, progress: 0, levers: [] };
          const config = handoutConfigs[m];
          const rawLevers = (d.levers as string[]) || [];
          const progress = calcHandoutProgress(
            config,
            (d.responses as Record<string, string>) || {},
            (d.checklist as Record<string, boolean>) || {},
            rawLevers
          );
          return { module: m, status: d.status as HandoutSummaryItem["status"], progress, levers: rawLevers.filter(l => l.trim()) };
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
      } catch (e) {
        console.error("[MemberDetail] load failed:", e);
        toast.error("Kunne ikke indlæse siden", { description: "Tjek din internetforbindelse og prøv at genindlæse." });
      } finally {
        setLoading(false);
      }
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

    // Find previous period fact for trend
    const currentIdx = memberFacts.findIndex(f => f.source_report_id === report.id || f.period_label === report.report_period);
    const prevFact = currentIdx > 0 ? memberFacts[currentIdx - 1] : null;
    const prevKf = prevFact ? factsToDanishMetrics(prevFact.metrics) : null;

    const formatVal = (n?: number) =>
      n != null ? `${n.toLocaleString("da-DK")} kr.` : "—";

    const trend = (current?: number, previous?: number) => {
      if (current == null || previous == null || previous === 0) return null;
      const pct = ((current - previous) / Math.abs(previous)) * 100;
      const up = pct >= 0;
      return (
        <span className={`text-[10px] font-medium ${up ? "text-[hsl(var(--chart-positive))]" : "text-destructive"}`}>
          {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
        </span>
      );
    };

    const kpiCards = [
      { label: "Omsætning", value: kf.omsaetning, prev: prevKf?.omsaetning },
      { label: "Dækningsbidrag", value: kf.daekningsbidrag, prev: prevKf?.daekningsbidrag },
      { label: "Lønninger", value: kf.loenninger, prev: prevKf?.loenninger },
      { label: "Resultat f. skat", value: kf.resultat_foer_skat, prev: prevKf?.resultat_foer_skat },
      kf.bank_balance != null ? { label: "Bank", value: kf.bank_balance, prev: prevKf?.bank_balance } : null,
      kf.egenkapital != null ? { label: "Egenkapital", value: kf.egenkapital, prev: prevKf?.egenkapital } : null,
    ].filter(Boolean) as { label: string; value?: number; prev?: number }[];

    return (
      <div>
        {isOverridden && (
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-accent-foreground mb-3">
            Manuelt korrigeret
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {kpiCards.map(card => (
            <div key={card.label} className="rounded-xl bg-secondary/30 border border-border/30 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{card.label}</p>
              <p className="text-sm font-bold text-foreground">{formatVal(card.value)}</p>
              {prevKf && <div className="mt-0.5">{trend(card.value, card.prev)}</div>}
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

  // ── Derived KPI snapshot from facts ──
  const latestFact = memberFacts[memberFacts.length - 1] ?? null;
  const prevFact = memberFacts.length >= 2 ? memberFacts[memberFacts.length - 2] : null;
  const latestKf = latestFact ? factsToDanishMetrics(latestFact.metrics) : null;
  const prevKf = prevFact ? factsToDanishMetrics(prevFact.metrics) : null;

  const sparklinesByKey: Record<string, number[]> = {
    omsaetning: memberFacts.slice(-6).map(f => factsToDanishMetrics(f.metrics).omsaetning ?? 0),
    daekningsbidrag: memberFacts.slice(-6).map(f => factsToDanishMetrics(f.metrics).daekningsbidrag ?? 0),
    resultat_foer_skat: memberFacts.slice(-6).map(f => factsToDanishMetrics(f.metrics).resultat_foer_skat ?? 0),
    bank_balance: memberFacts.slice(-6).filter(f => factsToDanishMetrics(f.metrics).bank_balance != null).map(f => factsToDanishMetrics(f.metrics).bank_balance as number),
  };

  const kpiSnapshot = (() => {
    if (!latestKf) return [];
    const calc = (curr?: number, prev?: number) => {
      if (curr == null || prev == null || prev === 0) return { pct: null as number | null, dir: "neutral" as const };
      const pct = ((curr - prev) / Math.abs(prev)) * 100;
      return { pct, dir: pct > 1 ? "up" as const : pct < -1 ? "down" as const : "neutral" as const };
    };
    return [
      { label: "Omsætning", value: latestKf.omsaetning, sparkKey: "omsaetning", ...calc(latestKf.omsaetning, prevKf?.omsaetning) },
      { label: "Dækningsbidrag", value: latestKf.daekningsbidrag, sparkKey: "daekningsbidrag", ...calc(latestKf.daekningsbidrag, prevKf?.daekningsbidrag) },
      { label: "Resultat f. skat", value: latestKf.resultat_foer_skat, sparkKey: "resultat_foer_skat", ...calc(latestKf.resultat_foer_skat, prevKf?.resultat_foer_skat) },
      { label: "Bank", value: latestKf.bank_balance, sparkKey: "bank_balance", ...calc(latestKf.bank_balance, prevKf?.bank_balance) },
    ].filter(k => k.value != null);
  })();

  // ── Conversation status helpers ──
  const conversationStatusBadge = (() => {
    if (!convStatus) return { label: "Ingen samtale", tone: "muted" as const };
    if (convStatus.conversation_status === "resolved") return { label: "Løst", tone: "success" as const };
    if (convStatus.awaiting_reply_from === "advisor") return { label: "Afventer rådgiver", tone: "warning" as const };
    if (convStatus.awaiting_reply_from === "company") return { label: "Afventer member", tone: "info" as const };
    return { label: "Åben", tone: "muted" as const };
  })();

  const toneClasses: Record<"success" | "warning" | "info" | "muted", string> = {
    success: "bg-primary/10 text-primary",
    warning: "bg-chart-warning/15 text-chart-warning",
    info: "bg-accent/40 text-accent-foreground",
    muted: "bg-muted text-muted-foreground",
  };

  // Budget chart data for overlay
  const budgetChartData = (() => {
    if (!budgets.length || !memberFacts.length) return [];
    return memberFacts.slice(-8).map(f => {
      const [year, month] = f.period_key.split("-");
      const monthIndex = parseInt(month, 10) - 1;
      const baseKey = `${year}-base-${monthIndex}`;
      const monthBudgets = budgets.filter(b => b.period === baseKey);
      const budgetRevenue = monthBudgets.find(b => b.category === "omsaetning")?.budget_amount ?? null;
      return { periodKey: f.period_key, budgetRevenue };
    });
  })();

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
          {/* ───── Hero header ───── */}
          <div className="glass-card rounded-2xl p-6 mb-6">
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* Logo + identity */}
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-border/50">
                  {companyCtx?.logo_url ? (
                    <img src={companyCtx.logo_url} alt={companyCtx.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xl font-bold text-primary">{getInitials(profile.full_name)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-display font-bold text-foreground">
                      {companyCtx?.name || profile.full_name}
                    </h1>
                    {companyCtx?.industry_label && (
                      <Badge variant="outline" className="text-[10px] font-normal">{companyCtx.industry_label}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{profile.full_name}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                    {companyCtx?.cvr_number && (
                      <span className="font-mono">CVR {companyCtx.cvr_number}</span>
                    )}
                    {companyCtx?.city && (
                      <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {companyCtx.city}</span>
                    )}
                    {companyCtx?.slack_channel && (
                      <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {companyCtx.slack_channel}</span>
                    )}
                    {profile.email && (
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {profile.email}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Medlem siden {format(new Date(profile.created_at), "MMM yyyy", { locale: da })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick stat strip */}
              <div className="flex gap-2 lg:gap-3 flex-shrink-0">
                <div className="text-center px-3 py-2 rounded-xl bg-secondary/40 min-w-[68px]">
                  <p className="text-xl font-display font-bold text-foreground leading-tight">{reports.length}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Rapporter</p>
                </div>
                <div className="text-center px-3 py-2 rounded-xl bg-secondary/40 min-w-[68px]">
                  <p className="text-xl font-display font-bold text-foreground leading-tight">
                    {milestones.filter(m => m.status !== "completed" && m.status !== "parked").length}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Aktive</p>
                </div>
                <div className="text-center px-3 py-2 rounded-xl bg-secondary/40 min-w-[68px]">
                  <p className="text-xl font-display font-bold text-foreground leading-tight">
                    {handoutSummaries.filter(h => h.status === "completed").length}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Handouts</p>
                </div>
              </div>

              {/* Action cluster */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadSessionPrep}
                  disabled={loadingSession || sessionBullets.length > 0}
                  className="gap-1.5"
                >
                  {loadingSession ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Genererer...</>
                  ) : sessionBullets.length > 0 ? (
                    <><Sparkles className="h-3.5 w-3.5" />Klar</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" />Forbered session</>
                  )}
                </Button>
                <Link
                  to={conversationId ? `/chat?conversationId=${conversationId}` : `/chat`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Chat
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
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

            {/* Chat status bar */}
            <div className="mt-5 pt-4 border-t border-border/40 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              {conversationId ? (
                <Link
                  to={`/chat?conversationId=${conversationId}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium hover:opacity-80 transition-opacity ${toneClasses[conversationStatusBadge.tone]}`}
                >
                  <CircleDot className="h-3 w-3" /> {conversationStatusBadge.label}
                </Link>
              ) : (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${toneClasses[conversationStatusBadge.tone]}`}>
                  <CircleDot className="h-3 w-3" /> {conversationStatusBadge.label}
                </span>
              )}
              {assignedAdvisorName && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Briefcase className="h-3 w-3" />
                  Tildelt: <span className="text-foreground font-medium">{assignedAdvisorName}</span>
                </span>
              )}
              {convStatus?.follow_up_at && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Opfølgning: <span className="text-foreground font-medium">
                    {format(new Date(convStatus.follow_up_at), "d. MMM yyyy", { locale: da })}
                  </span>
                </span>
              )}
              {invitedEmail && (
                <span className="flex items-center gap-1.5 text-chart-warning">
                  <AlertTriangle className="h-3 w-3" />
                  Invitation sendt til <span className="font-medium">{invitedEmail}</span>
                </span>
              )}
            </div>
          </div>

          {/* ───── Application context panel ───── */}
          {(companyCtx as any)?.application_context && (
            <div className="mb-6 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Ansøgningskontekst</h3>
              </div>
              <div className="space-y-4">
                {(companyCtx as any).application_context.current_situation && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Nuværende situation</p>
                    <p className="text-sm text-foreground leading-relaxed">{(companyCtx as any).application_context.current_situation}</p>
                  </div>
                )}
                {(companyCtx as any).application_context.goals && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Mål med virksomheden</p>
                    <p className="text-sm text-foreground leading-relaxed">{(companyCtx as any).application_context.goals}</p>
                  </div>
                )}
                {(companyCtx as any).application_context.help_needed && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Søger hjælp til</p>
                    <p className="text-sm text-foreground leading-relaxed">{(companyCtx as any).application_context.help_needed}</p>
                  </div>
                )}
                {((companyCtx as any).contract_start_date || (companyCtx as any).contract_end_date) && (
                  <div className="flex gap-6 pt-2 border-t border-border/40">
                    {(companyCtx as any).contract_start_date && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Kontraktstart</p>
                        <p className="text-sm text-foreground">{new Date((companyCtx as any).contract_start_date).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}</p>
                      </div>
                    )}
                    {(companyCtx as any).contract_end_date && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Kontraktslut</p>
                        <p className={`text-sm font-medium ${new Date((companyCtx as any).contract_end_date) < new Date() ? "text-destructive" : "text-foreground"}`}>
                          {new Date((companyCtx as any).contract_end_date).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───── Session prep panel ───── */}
          {sessionBullets.length > 0 && (
            <div id="section-session" className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Sessionsforberedelse</p>
                <button
                  onClick={() => setSessionBullets([])}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  Ryd
                </button>
              </div>
              <div className="space-y-2">
                {sessionBullets.map((bullet, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-2" />
                    <p className="text-sm text-foreground">{bullet}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ───── Financial snapshot ───── */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-foreground text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Finansielt øjebliksbillede
              </h2>
              {latestFact && (
                <span className="text-xs text-muted-foreground">
                  Senest committed: <span className="font-medium text-foreground">{latestFact.period_label}</span>
                </span>
              )}
            </div>
            {kpiSnapshot.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center">
                <p className="text-sm text-muted-foreground">Ingen committede tal endnu — godkend en rapport for at se snapshot.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {kpiSnapshot.map(k => {
                  const TrendIcon = k.dir === "up" ? TrendingUp : k.dir === "down" ? TrendingDown : Minus;
                  const trendColor = k.dir === "up" ? "text-primary" : k.dir === "down" ? "text-destructive" : "text-muted-foreground";
                  return (
                    <div key={k.label} className="glass-card rounded-xl p-4">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">{k.label}</p>
                      <p className="text-lg font-display font-bold text-foreground">
                        {k.value != null ? `${k.value.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.` : "—"}
                      </p>
                      {k.pct != null && Math.abs(k.pct) >= 0.5 && (
                        <div className={`flex items-center gap-1 mt-1.5 text-[11px] font-medium ${trendColor}`}>
                          <TrendIcon className="h-3 w-3" />
                          {Math.abs(k.pct).toFixed(1)}% vs. forrige
                        </div>
                      )}
                      {(() => {
                        const spark = sparklinesByKey[k.sparkKey] ?? [];
                        if (spark.length < 2) return null;
                        const isPositive = spark[spark.length - 1] >= spark[0];
                        return (
                          <div className="mt-2 -mx-1">
                            <ResponsiveContainer width="100%" height={28}>
                              <LineChart data={spark.map((v, i) => ({ v, i }))} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                                <Line
                                  type="monotone"
                                  dataKey="v"
                                  stroke={isPositive ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                                  strokeWidth={1.5}
                                  dot={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ───── Finansiel udvikling ───── */}
          {memberFacts.length >= 2 && (() => {
            const chartData = memberFacts.slice(-8).map((f, i) => {
              const kf = factsToDanishMetrics(f.metrics);
              return {
                period: f.period_label,
                omsaetning: kf.omsaetning ?? 0,
                resultat: kf.resultat_foer_skat ?? 0,
                budget: budgetChartData[i]?.budgetRevenue ?? null,
              };
            });
            return (
              <div className="glass-card rounded-2xl p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-semibold text-foreground text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Finansiel udvikling
                  </h2>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary inline-block" />Omsætning</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-info inline-block" />Resultat</span>
                    {budgetChartData.some(b => b.budgetRevenue != null) && (
                      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="inline-block w-5 border-t-2 border-dashed border-chart-warning" />
                        Budget
                      </span>
                    )}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGradMD" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="resGradMD" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-info))" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(var(--chart-info))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="period" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number, name: string) => [
                        `${Number(v).toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.`,
                        name === "omsaetning" ? "Omsætning" : "Resultat f. skat"
                      ]}
                    />
                    <Area type="monotone" dataKey="omsaetning" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revGradMD)" dot={false} />
                    <Area type="monotone" dataKey="resultat" stroke="hsl(var(--chart-info))" strokeWidth={2} fill="url(#resGradMD)" dot={false} />
                    {budgetChartData.some(b => b.budgetRevenue != null) && (
                      <Line
                        type="monotone"
                        dataKey="budget"
                        stroke="hsl(var(--chart-warning))"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        dot={false}
                        connectNulls
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
                <button
                  onClick={async () => {
                    const { data } = await supabase.functions.invoke("generate-ai-forecast", {
                      body: { company_id: memberCompanyId },
                    });
                    if (data?.forecast) setForecast(data.forecast);
                  }}
                  className="text-xs text-primary hover:underline mt-2"
                >
                  Generer 3-måneders forecast →
                </button>
                {forecast && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {forecast.map((f: any) => (
                      <div key={f.period_key} className="rounded-lg border border-border/40 bg-muted/20 p-2">
                        <p className="text-[10px] font-medium text-muted-foreground">{f.period_label}</p>
                        <p className="text-xs text-foreground mt-1">Omsætning: {f.revenue?.toLocaleString("da-DK")} kr.</p>
                        <p className="text-xs text-foreground">Resultat: {f.ebt?.toLocaleString("da-DK")} kr.</p>
                      </div>
                    ))}
                    <p className="col-span-3 text-[10px] text-muted-foreground italic">Baseret på lineær trend — ikke en garanti</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ───── Pulse + talking points ───── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            {/* Pulse */}
            <div className="glass-card rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Pulse check-in
                {latestPulse && (
                  <span className="text-xs font-normal text-muted-foreground ml-auto">
                    {(() => {
                      const [y, m] = (latestPulse.period_key || "").split("-");
                      const months = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
                      return `${months[parseInt(m, 10) - 1] || m} ${y}`;
                    })()}
                  </span>
                )}
              </h3>
              {!latestPulse ? (
                <p className="text-xs text-muted-foreground">Ingen pulse endnu. Bed member om at udfylde månedlig check-in.</p>
              ) : (
                <div className="space-y-3">
                  {latestPulse.went_well && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Hvad gik godt</p>
                      <p className="text-sm text-foreground">{latestPulse.went_well}</p>
                    </div>
                  )}
                  {latestPulse.biggest_challenge && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Største udfordring</p>
                      <p className="text-sm text-foreground">{latestPulse.biggest_challenge}</p>
                    </div>
                  )}
                  {latestPulse.milestone_progress != null && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Milestone fremgang</p>
                      <p className="text-sm font-medium text-foreground">{latestPulse.milestone_progress}%</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Talking points */}
            <div className="glass-card rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Samtaleemner
              </h3>
              <div className="space-y-3">
                {milestones.filter(m => m.deadline && new Date(m.deadline) < new Date() && m.status !== "completed" && m.status !== "parked").length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <div className="h-5 w-5 rounded bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertCircle className="h-3 w-3 text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Overskredte milestones</p>
                      <p className="text-sm text-foreground">
                        {milestones
                          .filter(m => m.deadline && new Date(m.deadline) < new Date() && m.status !== "completed" && m.status !== "parked")
                          .map(m => m.title).join(" · ")}
                      </p>
                    </div>
                  </div>
                )}
                {handoutSummaries.some(h => h.levers.length > 0) && (
                  <div className="flex items-start gap-2.5">
                    <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <ClipboardList className="h-3 w-3 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Valgte løftestænger</p>
                      <div className="flex flex-wrap gap-1">
                        {handoutSummaries.flatMap(h => h.levers).slice(0, 6).map((lever, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            {lever}
                          </span>
                        ))}
                        {handoutSummaries.flatMap(h => h.levers).length > 6 && (
                          <span className="text-[10px] text-muted-foreground self-center">
                            +{handoutSummaries.flatMap(h => h.levers).length - 6} flere
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {!latestPulse?.biggest_challenge &&
                  milestones.filter(m => m.deadline && new Date(m.deadline) < new Date() && m.status !== "completed").length === 0 &&
                  !handoutSummaries.some(h => h.levers.length > 0) && (
                    <p className="text-xs text-muted-foreground italic">Ingen fremhævede emner — gennemgå sektionerne nedenfor.</p>
                  )}
              </div>
            </div>
          </div>

          {/* ───── AI Sparring-assistent ───── */}
          {memberFacts.length > 0 && memberCompanyId && (
            <div className="mb-8">
              <AdvisorAIChat
                companyId={memberCompanyId}
                companyName={companyCtx?.name || profile.full_name || ""}
              />
            </div>
          )}

          {/* ───── Milestones + Handouts compact ───── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {/* Milestones */}
            <div className="glass-card rounded-2xl p-5" id="section-milestones">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Milestones
                </h3>
                <div className="flex items-center gap-2 text-[10px]">
                  {milestones.filter(m => m.deadline && new Date(m.deadline) < new Date() && m.status !== "completed" && m.status !== "parked").length > 0 && (
                    <span className="text-destructive font-semibold">
                      {milestones.filter(m => m.deadline && new Date(m.deadline) < new Date() && m.status !== "completed" && m.status !== "parked").length} overskredet
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {milestones.filter(m => m.status !== "completed" && m.status !== "parked").length} aktive
                  </span>
                </div>
              </div>
              {milestones.filter(m => m.status !== "parked").length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Ingen milestones oprettet endnu</p>
              ) : (
                <div className="space-y-2.5">
                  {milestones.filter(m => m.status !== "parked").slice(0, 6).map(m => {
                    const isOverdue = m.deadline && new Date(m.deadline) < new Date() && m.status !== "completed";
                    const isCompleted = m.status === "completed";
                    return (
                      <div key={m.id} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs truncate flex-1 ${isCompleted ? "line-through text-muted-foreground" : isOverdue ? "text-destructive" : "text-foreground"}`}>
                            {m.title}
                          </p>
                          <span className={`text-[10px] shrink-0 ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            {m.deadline
                              ? format(new Date(m.deadline), "d. MMM", { locale: da })
                              : <span className="text-muted-foreground/40 italic">ingen frist</span>
                            }
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isCompleted ? "bg-primary" : isOverdue ? "bg-destructive" : "bg-primary/70"}`}
                            style={{ width: `${m.progress ?? 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {milestones.filter(m => m.status !== "parked").length > 6 && (
                    <p className="text-[10px] text-muted-foreground">+{milestones.filter(m => m.status !== "parked").length - 6} flere</p>
                  )}
                </div>
              )}
            </div>

            {/* Handouts */}
            <div className="glass-card rounded-2xl p-5" id="section-handouts">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" /> Handouts
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  {handoutSummaries.filter(h => h.status === "completed").length}/{handoutSummaries.length} fulgt
                </span>
              </div>
              <div className="mb-3">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${handoutSummaries.length > 0 ? (handoutSummaries.filter(h => h.status === "completed").length / handoutSummaries.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                {handoutSummaries.map(s => {
                  const config = handoutConfigs[s.module];
                  return (
                    <button
                      key={s.module}
                      onClick={() => setActiveHandout(s.module)}
                      className="w-full flex items-center gap-2.5 py-1.5 px-2 hover:bg-accent/30 rounded-lg transition-colors text-left"
                    >
                      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.status === "completed" ? "bg-primary" : s.progress > 0 ? "bg-chart-warning" : "bg-muted-foreground/20"}`} />
                      <p className="text-xs text-foreground truncate flex-1">{config?.title || s.module}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">{s.progress}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ───── Agent log ───── */}
          <div className="mt-6 mb-6">
            <button
              onClick={() => setShowAgentLog(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-foreground mb-3"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              Agent-log
              <span className="text-xs font-normal text-muted-foreground ml-1">({agentMessages.length})</span>
              {showAgentLog ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showAgentLog && (
              <div className="space-y-2">
                {agentMessages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Agenten har ikke kørt endnu for denne virksomhed.</p>
                ) : agentMessages.map((msg: any) => (
                  <div key={msg.id} className="rounded-lg border border-border/40 bg-muted/20 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-primary uppercase tracking-wider">Agent</span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(msg.created_at), "d. MMM yyyy HH:mm", { locale: da })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground line-clamp-3">{msg.content}</p>
                    {(msg.context_meta as any)?.feedback && (
                      <span className="text-[10px] text-muted-foreground mt-1 block">
                        Feedback: {(msg.context_meta as any).feedback === "up" ? "Nyttigt" : "Ikke nyttigt"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ───── Reports section ───── */}
          <div className="mb-8" id="section-reports">
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
                  const isCommitted = !!memberFacts.find(f => f.source_report_id === report.id);
                  const isProcessed = report.status === "processed" || report.status === "committed";

                  // Compose badge: committed (green) vs processed-needs-approval (amber) vs needs_manual_entry vs processing/error
                  const badge = (() => {
                    if (isCommitted) return { label: "Committed ✓", className: "text-primary", bg: "bg-primary/15", Icon: CheckCircle2 };
                    if (report.status === "needs_manual_entry") return { label: "Indtast tal manuelt", className: "text-chart-warning", bg: "bg-chart-warning/15", Icon: AlertTriangle };
                    if (report.status === "processed") return { label: "Afventer godkendelse", className: "text-chart-warning", bg: "bg-chart-warning/15", Icon: Clock };
                    if (report.status === "processing") return { label: "Behandles...", className: "text-muted-foreground", bg: "bg-muted", Icon: Clock };
                    if (report.status === "error") return { label: "Fejl", className: "text-destructive", bg: "bg-destructive/10", Icon: AlertCircle };
                    const fallback = reportStatusConfig[report.status] || reportStatusConfig.processing;
                    return { label: fallback.label, className: fallback.className, bg: fallback.bg, Icon: Clock };
                  })();
                  const BadgeIcon = badge.Icon;

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
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
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
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${badge.bg} ${badge.className}`}>
                              <BadgeIcon className="h-3 w-3" />
                              {badge.label}
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

                          {/* Commit status / approve action */}
                          <div className="mt-4 flex items-center gap-2 flex-wrap">
                            {isProcessed && !isCommitted && (
                              <a
                                href={`/admin/review-queue`}
                                className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                Godkend rapport →
                              </a>
                            )}
                            {isCommitted && (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                ✓ Committed
                              </span>
                            )}
                            {isCommitted && (
                              <button
                                onClick={async () => {
                                  setAgentRunning(report.id);
                                  try {
                                    // Find correct YYYY-MM period_key from committed facts
                                    const matchingFact = memberFacts.find(f => f.source_report_id === report.id)
                                      || memberFacts.find(f => f.period_label === report.report_period);

                                    const resolvedPeriodKey = matchingFact?.period_key
                                      || report.manual_report_period_key
                                      || report.report_period;

                                    const resolvedPeriodLabel = matchingFact?.period_label
                                      || report.manual_report_period_label
                                      || report.report_period;

                                    const { data: agentData, error: agentError } = await supabase.functions.invoke("run-company-agent", {
                                      body: {
                                        company_id: memberCompanyId,
                                        trigger: "report_committed",
                                        period_key: resolvedPeriodKey,
                                        period_label: resolvedPeriodLabel,
                                      },
                                    });

                                    if (agentError) throw agentError;
                                    if (!agentData?.ok) {
                                      throw new Error(agentData?.error || "Agenten skrev ingen besked");
                                    }

                                    toast.success("Agent kørt ✓", { description: "Tjek chatten for analysen." });
                                  } catch (err) {
                                    console.error("Agent error:", err);
                                    toast.error("Agent fejlede", { description: err instanceof Error ? err.message : String(err) });
                                  } finally {
                                    setAgentRunning(null);
                                  }
                                }}
                                disabled={agentRunning === report.id}
                                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                              >
                                <Sparkles className="h-3 w-3" />
                                {agentRunning === report.id ? "Kører..." : "Kør agent"}
                              </button>
                            )}
                            {report.processed_at && (
                              <span className="text-[10px] text-muted-foreground">
                                Behandlet {format(new Date(report.processed_at), "d. MMM yyyy HH:mm", { locale: da })}
                              </span>
                            )}
                          </div>

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

          {/* ───── Delivery Overview ───── */}
          <div className="mb-8">
            <DeliveryOverview reports={reports} />
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default MemberDetail;


