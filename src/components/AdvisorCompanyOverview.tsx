import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ArrowLeft, MessageSquare, FileText, Target, BarChart3,
  BookOpen, Clock, StickyNote, Eye, DollarSign, TrendingUp, TrendingDown, Minus, Wallet,
  ChevronRight, ChevronDown, Sparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { Button } from "@/components/ui/button";
import {
  DANISH_MONTHS, REPORT_OVERRIDE_SELECT,
  getEffectiveReportPeriodKey, getEffectiveKeyFigures,
  formatDKK, type ReportData,
} from "@/lib/financialUtils";
import { toast } from "sonner";


/** Format "2026-02" → "Februar 2026" */
function formatReportKey(key: string): string {
  const [year, month] = key.split("-");
  const idx = parseInt(month, 10) - 1;
  return `${DANISH_MONTHS[idx] ?? month} ${year}`;
}

// ── Chat state label ──
interface ChatState {
  label: string;
  color: string;
  icon: typeof MessageSquare;
}

function deriveChatState(conv: ConvRow | null): ChatState {
  if (!conv) return { label: "Ingen aktiv samtale", color: "text-muted-foreground", icon: MessageSquare };
  if (conv.conversation_status === "resolved") return { label: "Afsluttet", color: "text-muted-foreground", icon: MessageSquare };
  if (conv.follow_up_at && new Date(conv.follow_up_at) > new Date()) {
    const d = new Date(conv.follow_up_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
    return { label: `Følger op ${d}`, color: "text-chart-warning", icon: Clock };
  }
  if (conv.awaiting_reply_from === "advisor") return { label: "Afventer dit svar", color: "text-destructive", icon: MessageSquare };
  if (conv.awaiting_reply_from === "company") return { label: "Afventer virksomhed", color: "text-primary", icon: MessageSquare };
  return { label: "Aktiv samtale", color: "text-foreground", icon: MessageSquare };
}

interface ConvRow {
  id: string;
  awaiting_reply_from: string | null;
  assigned_advisor_id: string | null;
  conversation_status: string;
  follow_up_at: string | null;
  last_message_at: string | null;
}

/**
 * Select the operationally most relevant conversation.
 * Priority: awaiting advisor reply → active follow-up → latest open → latest resolved
 */
function selectPrimaryConversation(conversations: ConvRow[]): ConvRow | null {
  if (conversations.length === 0) return null;

  const now = new Date();

  // 1. Open + awaiting advisor reply (oldest first = most urgent)
  const awaitingAdvisor = conversations
    .filter(c => c.conversation_status === "open" && c.awaiting_reply_from === "advisor")
    .sort((a, b) => (a.last_message_at || "").localeCompare(b.last_message_at || ""));
  if (awaitingAdvisor.length > 0) return awaitingAdvisor[0];

  // 2. Open + active follow-up (soonest first)
  const withFollowUp = conversations
    .filter(c => c.conversation_status === "open" && c.follow_up_at && new Date(c.follow_up_at) > now)
    .sort((a, b) => (a.follow_up_at || "").localeCompare(b.follow_up_at || ""));
  if (withFollowUp.length > 0) return withFollowUp[0];

  // 3. Latest open conversation
  const open = conversations
    .filter(c => c.conversation_status === "open")
    .sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
  if (open.length > 0) return open[0];

  // 4. Latest resolved conversation
  const resolved = [...conversations]
    .sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));
  return resolved[0];
}

// ── Trend helpers ──
function calcDeltaPct(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

interface TrendMetricProps {
  icon: typeof DollarSign;
  label: string;
  current: number | null | undefined;
  previous?: number | null | undefined;
  hasPrevious: boolean;
  negativeIsRed?: boolean;
  periodNote?: string;
}

function TrendMetric({ icon: Icon, label, current, previous, hasPrevious, negativeIsRed, periodNote }: TrendMetricProps) {
  const delta = calcDeltaPct(current, previous);
  const isPositive = delta != null && delta > 5;
  const isNegative = delta != null && delta < -5;
  const isLargeDecline = delta != null && delta < -10;

  // Signal color
  let signalColor = "text-muted-foreground"; // neutral
  if (isPositive) signalColor = "text-emerald-600";
  if (isLargeDecline) signalColor = "text-destructive";

  const DeltaIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${negativeIsRed && (current ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>
        {current != null ? formatDKK(current) : "—"}
      </p>
      {hasPrevious && delta != null ? (
        <div className={`flex items-center gap-1 mt-0.5 ${signalColor}`}>
          <DeltaIcon className="h-3 w-3" />
          <span className="text-[10px] font-medium">
            {delta >= 0 ? "+" : ""}{Math.round(delta)}%
          </span>
        </div>
      ) : hasPrevious ? null : current != null ? (
        <p className="text-[10px] text-muted-foreground mt-0.5">Første periode</p>
      ) : null}
      {periodNote && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{periodNote}</p>
      )}
    </div>
  );
}


const AdvisorCompanyOverview = () => {
  const [showDetails, setShowDetails] = useState(false);
  const { user, companyId, companyName, clearCompanyOverride, setCompanyOverride } = useAuth();
  const { toggleViewMode } = useViewMode();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["advisor-company-overview", companyId],
    queryFn: async () => {
      // Stage 1: parallel fetch of company, conversations, reports
      const [companyRes, convsRes, reportsRes] = await Promise.all([
        supabase.from("companies").select("id, name, industry_label, cvr_number, logo_url").eq("id", companyId!).single(),
        supabase.from("conversations")
          .select("id, awaiting_reply_from, assigned_advisor_id, conversation_status, follow_up_at, last_message_at")
          .eq("company_id", companyId!)
          .order("last_message_at", { ascending: false })
          .limit(10), // Phase-1 limit — sufficient for most companies
        (supabase.from("financial_reports")
          .select(`id, report_period, extracted_data, normalized_data, status, ${REPORT_OVERRIDE_SELECT}`) as any)
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .eq("status", "processed")
          .order("uploaded_at", { ascending: false })
          .limit(24),
      ]);

      const company = companyRes.data;
      const conversations = (convsRes.data || []) as ConvRow[];

      // Primary conversation: operational priority selection
      const primaryConv = selectPrimaryConversation(conversations);

      // Stage 2: scoped follow-up fetches — only when relevant
      const convIds = conversations.map(c => c.id);
      const assignedId = primaryConv?.assigned_advisor_id ?? null;

      const [notesRes, advisorProfileRes] = await Promise.all([
        // Notes: only for this company's conversations
        convIds.length > 0
          ? supabase.from("conversation_notes")
              .select("conversation_id")
              .in("conversation_id", convIds)
          : Promise.resolve({ data: [] as { conversation_id: string }[] }),
        // Advisor profile: only for the assigned advisor
        assignedId
          ? supabase.from("profiles")
              .select("full_name, user_id")
              .eq("user_id", assignedId)
              .maybeSingle()
          : Promise.resolve({ data: null as { full_name: string; user_id: string } | null }),
      ]);

      // Notes: check if any conversation for this company has a note
      const noteConvIds = new Set(((notesRes as any).data || []).map((n: any) => n.conversation_id));
      const hasNote = convIds.some(id => noteConvIds.has(id));
      // Track which conversation has the note for deep-linking
      const noteConvId = primaryConv && noteConvIds.has(primaryConv.id)
        ? primaryConv.id
        : convIds.find(id => noteConvIds.has(id)) ?? null;

      // Reports
      const reports = (reportsRes.data || []) as ReportData[];
      const sorted = reports
        .map(r => ({ key: getEffectiveReportPeriodKey(r), kf: getEffectiveKeyFigures(r), report: r }))
        .filter((d): d is { key: string; kf: Record<string, number>; report: ReportData } => !!d.key && !!d.kf)
        .sort((a, b) => a.key.localeCompare(b.key));

      const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
      const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
      const bankReport = [...sorted].reverse().find(r => r.kf.bank_balance != null);
      // Find the second-latest report that has bank_balance for bank trend
      const bankPrevious = bankReport
        ? [...sorted].reverse().find(r => r.kf.bank_balance != null && r.key !== bankReport.key)
        : null;


      const assignedName = (advisorProfileRes as any)?.data?.full_name ?? null;

      // Last 6 months of omsaetning for sparkline
      const revenueTimeline = sorted
        .filter(r => r.kf.omsaetning != null)
        .slice(-6)
        .map(r => ({ key: r.key, value: r.kf.omsaetning as number }));

      return {
        company,
        primaryConv,
        hasNote,
        noteConvId,
        latest,
        previous,
        bankReport,
        bankPrevious,
        
        assignedName,
        revenueTimeline,
      };
    },
    enabled: !!companyId && !!user,
    staleTime: 2 * 60_000,
  });

  const { data: milestonesData } = useQuery({
    queryKey: ["milestones-advisor", companyId],
    queryFn: async () => {
      const { data: members } = await (supabase
        .from("company_members" as any)
        .select("user_id")
        .eq("company_id", companyId!) as any);

      if (!members?.length) return [];

      const userIds = members.map((m: any) => m.user_id);

      const { data } = await supabase
        .from("milestones")
        .select("id, title, deadline, progress, status")
        .in("user_id", userIds)
        .eq("status", "active")
        .order("deadline", { ascending: true });

      return (data || []) as {
        id: string;
        title: string;
        deadline: string | null;
        progress: number;
        status: string;
      }[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
  const milestones = milestonesData || [];
  const overdueMilestones = milestones.filter(m =>
    m.deadline && new Date(m.deadline) < new Date()
  );

  const { data: latestPulse } = useQuery({
    queryKey: ["pulse-checkin", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("pulse_checkins")
        .select("went_well, biggest_challenge, milestone_progress, created_at, period_key")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data || null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  const { data: handoutData } = useQuery({
    queryKey: ["handout-summary-advisor", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("handouts")
        .select("module, status")
        .eq("company_id", companyId);
      const completed = (data || []).filter(h => h.status === "completed").length;
      const total = 5;
      return { completed, total };
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  const company = data?.company;
  const primaryConv = data?.primaryConv ?? null;
  const chatState = deriveChatState(primaryConv);
  const ChatIcon = chatState.icon;
  const latest = data?.latest;
  const bankReport = data?.bankReport;
  const hasNote = data?.hasNote ?? false;
  const noteConvId = data?.noteConvId ?? null;

  const hasReport = !!latest;
  const hasPulse = !!latestPulse;
  const latestPeriodLabel = latest ? formatReportKey(latest.key) : null;
  const handoutsCompleted = handoutData?.completed ?? 0;
  const handoutsTotal = handoutData?.total ?? 5;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Engagement Status Bar ── */}
      <div className="flex items-center gap-4 px-4 py-3 bg-secondary/30 rounded-xl mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${hasReport ? "bg-primary" : "bg-muted-foreground/30"}`} />
          <span className="text-muted-foreground">
            {hasReport ? `Rapport: ${latestPeriodLabel}` : "Ingen rapport endnu"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${hasPulse ? "bg-blue-500" : "bg-muted-foreground/30"}`} />
          <span className="text-muted-foreground">
            {hasPulse ? "Pulse udfyldt" : "Ingen pulse endnu"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${handoutsCompleted > 0 ? "bg-amber-500" : "bg-muted-foreground/30"}`} />
          <span className="text-muted-foreground">
            {handoutsCompleted}/{handoutsTotal} handouts
          </span>
        </div>
      </div>
      {/* ── Header ── */}
      {isMobile ? (
        /* Mobile: stacked header */
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { clearCompanyOverride(); navigate("/"); }}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
              title="Tilbage til portefølje"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h1 className="text-lg font-display font-bold text-foreground tracking-tight truncate flex-1">
              {company?.name || companyName || "Virksomhed"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pl-9 min-w-0">
            {company?.industry_label && <span>{company.industry_label}</span>}
            {company?.cvr_number && (
              <>
                {company?.industry_label && <span>·</span>}
                <span>CVR {company.cvr_number}</span>
              </>
            )}
            {data?.assignedName && (
              <>
                <span>·</span>
                <span>{data.assignedName}</span>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleViewMode}
            className="w-full gap-1.5"
          >
            <Eye className="h-3.5 w-3.5" />
            Vis som virksomhed
          </Button>
        </div>
      ) : (
        /* Desktop: original horizontal header */
        <div className="flex items-start gap-4">
          <button
            onClick={() => { clearCompanyOverride(); navigate("/"); }}
            className="mt-1 p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
            title="Tilbage til portefølje"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-display font-bold text-foreground tracking-tight truncate">
              {company?.name || companyName || "Virksomhed"}
            </h1>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              {company?.industry_label && <span>{company.industry_label}</span>}
              {company?.cvr_number && (
                <>
                  {company?.industry_label && <span>·</span>}
                  <span>CVR {company.cvr_number}</span>
                </>
              )}
              {data?.assignedName && (
                <>
                  <span>·</span>
                  <span>{data.assignedName}</span>
                </>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={toggleViewMode}
            className="shrink-0 gap-1.5"
          >
            <Eye className="h-3.5 w-3.5" />
            Vis som virksomhed
          </Button>
        </div>
      )}

      {/* ── Status Bar ── */}
      <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
        {/* Chat state */}
        <Link
          to={primaryConv ? `/chat?conversationId=${primaryConv.id}` : "/chat"}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card text-xs font-medium hover:bg-accent/50 transition-colors max-w-full min-w-0 ${chatState.color}`}
        >
          <ChatIcon className="h-3.5 w-3.5" />
          {chatState.label}
        </Link>

        {/* Overdue follow-up (if not already shown in chat state) */}
        {primaryConv?.follow_up_at && new Date(primaryConv.follow_up_at) <= new Date() && (
          <Link
            to={`/chat?conversationId=${primaryConv.id}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-destructive/20 bg-destructive/5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors max-w-full min-w-0"
          >
            <Clock className="h-3.5 w-3.5" />
            Forfalden opfølgning
          </Link>
        )}

        {/* Report status */}
        {latest && (
          <Link
            to="/reports"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:bg-accent/50 transition-colors max-w-full min-w-0"
          >
            <FileText className="h-3.5 w-3.5" />
            Seneste rapport: {formatReportKey(latest.key)}
          </Link>
        )}

        {/* Internal note indicator — links to chat if possible, otherwise non-clickable */}
        {hasNote && (
          noteConvId ? (
             <Link
              to={`/chat?conversationId=${noteConvId}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:bg-accent/50 transition-colors max-w-full min-w-0"
              title="Intern note — se i chatten"
            >
              <StickyNote className="h-3.5 w-3.5" />
              Note
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-card text-xs text-muted-foreground max-w-full min-w-0" title="Intern note">
              <StickyNote className="h-3.5 w-3.5" />
              Note
            </span>
          )
        )}
      </div>

      {/* ── Primary action hint ── */}
      {(() => {
        if (primaryConv?.awaiting_reply_from === "advisor") {
          return (
            <Link
              to={`/chat?conversationId=${primaryConv.id}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20 hover:bg-destructive/10 transition-colors"
            >
              <MessageSquare className="h-4 w-4 text-destructive flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">Afventer dit svar</p>
                <p className="text-xs text-destructive/70">Åbn chatten og svar founder</p>
              </div>
              <ChevronRight className="h-4 w-4 text-destructive/50 flex-shrink-0" />
            </Link>
          );
        }
        if (overdueMilestones.length > 0) {
          return (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-chart-warning/5 border border-chart-warning/20">
              <Target className="h-4 w-4 text-chart-warning flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-chart-warning">
                  {overdueMilestones.length} milestone{overdueMilestones.length > 1 ? "s" : ""} overskredet deadline
                </p>
                <p className="text-xs text-chart-warning/70 truncate">{overdueMilestones[0].title}</p>
              </div>
            </div>
          );
        }
        if (!data?.latest) {
          return (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="text-sm text-muted-foreground">Ingen rapport uploadet endnu</p>
            </div>
          );
        }
        return null;
      })()}

      {/* ── Financial Snapshot ── */}
      {latest && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Seneste nøgletal · {formatReportKey(latest.key)}
            {data?.previous ? ` vs. ${formatReportKey(data.previous.key)}` : ""}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TrendMetric
              icon={DollarSign}
              label="Omsætning"
              current={latest.kf.omsaetning}
              previous={data?.previous?.kf.omsaetning}
              hasPrevious={!!data?.previous}
            />
            <TrendMetric
              icon={TrendingUp}
              label="Resultat"
              current={latest.kf.resultat_foer_skat}
              previous={data?.previous?.kf.resultat_foer_skat}
              hasPrevious={!!data?.previous}
              negativeIsRed
            />
            <TrendMetric
              icon={Wallet}
              label="Bank"
              current={bankReport?.kf.bank_balance}
              previous={data?.bankPrevious?.kf.bank_balance}
              hasPrevious={!!data?.bankPrevious}
              periodNote={bankReport && bankReport.key !== latest.key ? `pr. ${formatReportKey(bankReport.key)}` : undefined}
            />
          </div>
        </div>
      )}

      {/* ── Revenue Sparkline ── */}
      {data?.revenueTimeline && data.revenueTimeline.length >= 3 && (() => {
        const tl = data.revenueTimeline;
        const first = tl[0].value;
        const last = tl[tl.length - 1].value;
        const totalDelta = first !== 0 ? Math.round(((last - first) / Math.abs(first)) * 100) : 0;
        if (Math.abs(totalDelta) < 5) return null;
        const isPositive = last >= first;
        const lineColor = isPositive ? "#1D9E75" : "#E24B4A";
        return (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Omsætning — {formatReportKey(tl[0].key)} til {formatReportKey(tl[tl.length - 1].key)}
              </p>
              <span className={`text-[11px] font-semibold ${isPositive ? "text-emerald-600" : "text-destructive"}`}>
                {totalDelta >= 0 ? "+" : ""}{totalDelta}%
              </span>
            </div>
            <ResponsiveContainer width="100%" height={48}>
              <LineChart data={tl}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={lineColor}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* ── Details toggle ── */}
      <button
        onClick={() => setShowDetails(v => !v)}
        className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
      >
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {latestPulse && (
            <span className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Pulse: {latestPulse.milestone_progress != null ? `${latestPulse.milestone_progress}% milestone` : "indsendt"}
            </span>
          )}
          {milestones.length > 0 && (
            <span className="flex items-center gap-1">
              <div className={`h-1.5 w-1.5 rounded-full ${overdueMilestones.length > 0 ? "bg-destructive" : "bg-chart-warning"}`} />
              {milestones.length} milestone{milestones.length !== 1 ? "s" : ""}
              {overdueMilestones.length > 0 && <span className="text-destructive">({overdueMilestones.length} overskredet)</span>}
            </span>
          )}
          {handoutsTotal > 0 && (
            <span className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {handoutsCompleted}/{handoutsTotal} handouts
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showDetails ? "rotate-180" : ""}`} />
      </button>

      {showDetails && (
        <div className="space-y-3">
          {/* ── Pulse Check-in ── */}
          {latestPulse && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Pulse check-in · {(() => {
                    const [year, month] = (latestPulse.period_key || "").split("-");
                    const months = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
                    return `${months[parseInt(month,10)-1] || month} ${year}`;
                  })()}
                </p>
                {latestPulse.milestone_progress != null && (
                  <span className="text-xs font-semibold text-primary">
                    {latestPulse.milestone_progress}% på milestone
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {latestPulse.went_well && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Hvad gik godt
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">
                      {latestPulse.went_well}
                    </p>
                  </div>
                )}
                {latestPulse.biggest_challenge && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Største udfordring
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">
                      {latestPulse.biggest_challenge}
                    </p>
                  </div>
                )}
                {(latestPulse as any).help_needed && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Brug for hjælp til
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">
                      {(latestPulse as any).help_needed}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          {!latestPulse && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Pulse check-in
              </p>
              <p className="text-xs text-muted-foreground">
                Medlemmet har endnu ikke udfyldt et check-in denne måned.
              </p>
            </div>
          )}

          {/* ── Milestones ── */}
          {milestones.length > 0 && (
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Aktive milestones
                </p>
                {overdueMilestones.length > 0 && (
                  <span className="text-[10px] font-semibold text-destructive">
                    {overdueMilestones.length} overskredet
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {milestones.slice(0, 4).map(m => {
                  const isOverdue = m.deadline && new Date(m.deadline) < new Date();
                  return (
                    <div key={m.id} className="flex items-center gap-2.5">
                      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        isOverdue ? "bg-destructive" :
                        m.progress >= 70 ? "bg-primary" : "bg-chart-warning"
                      }`} />
                      <span className="text-xs text-foreground flex-1 truncate">
                        {m.title}
                      </span>
                      {m.deadline && (
                        <span className={`text-[10px] shrink-0 ${
                          isOverdue ? "text-destructive" : "text-muted-foreground"
                        }`}>
                          {new Date(m.deadline).toLocaleDateString("da-DK",
                            { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                  );
                })}
                {milestones.length > 4 && (
                  <p className="text-[10px] text-muted-foreground pl-3.5">
                    +{milestones.length - 4} flere
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Handouts ── */}
          {handoutsTotal > 0 && (
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Handouts
                </p>
                <span className="text-xs font-semibold text-foreground">
                  {handoutsCompleted}/{handoutsTotal} fulgt
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(handoutsCompleted / handoutsTotal) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {!latest && (
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">Ingen rapporter er behandlet endnu. Upload den første via Rapporter.</p>
        </div>
      )}

      {/* ── Quick Links ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { to: primaryConv ? `/chat?conversationId=${primaryConv.id}` : "/chat", icon: MessageSquare, label: "Chat" },
          { to: "/reports", icon: FileText, label: "Rapporter" },
          { to: "/handouts", icon: BookOpen, label: "Handouts" },
          { to: "/milestones", icon: Target, label: "Milestones" },
          { to: "/kpis", icon: BarChart3, label: "KPI'er" },
        ].map(link => (
          <Link
            key={link.label}
            to={link.to}
            className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all text-center group"
          >
            <link.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{link.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AdvisorCompanyOverview;
