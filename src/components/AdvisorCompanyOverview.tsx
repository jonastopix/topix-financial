import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ArrowLeft, MessageSquare, FileText, Target, BarChart3,
  BookOpen, Clock, StickyNote, DollarSign, TrendingUp, TrendingDown, Minus, Wallet,
  ChevronRight, ChevronDown, Sparkles, ExternalLink, AlertCircle,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { Button } from "@/components/ui/button";
import {
  DANISH_MONTHS, REPORT_OVERRIDE_SELECT,
  getEffectiveReportPeriodKey, getEffectiveKeyFigures,
  formatDKK, type ReportData,
} from "@/lib/financialUtils";



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

      const [notesRes, advisorProfileRes, membersRes] = await Promise.all([
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
        // Company members + their profile names
        supabase.from("company_members")
          .select("user_id")
          .eq("company_id", companyId!),
      ]);

      // Resolve member full names
      const memberUserIds = ((membersRes as any)?.data || []).map((m: any) => m.user_id).filter(Boolean);
      let memberNames = "";
      if (memberUserIds.length > 0) {
        const { data: memberProfiles } = await supabase
          .from("profiles")
          .select("full_name, user_id")
          .in("user_id", memberUserIds);
        memberNames = (memberProfiles || [])
          .map((p: any) => p.full_name)
          .filter(Boolean)
          .join(", ");
      }

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
        memberNames,
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
      const primaryMemberUserId = members[0]?.user_id ?? null;

      const { data } = await supabase
        .from("milestones")
        .select("id, title, deadline, progress, status, target_value, current_value, unit")
        .in("user_id", userIds)
        .eq("status", "active")
        .order("deadline", { ascending: true });

      return { milestones: (data || []) as {
        id: string;
        title: string;
        deadline: string | null;
        progress: number;
        status: string;
      }[], primaryMemberUserId };
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
  const milestones = (milestonesData as any)?.milestones || milestonesData || [];
  const primaryMemberUserId = (milestonesData as any)?.primaryMemberUserId ?? null;
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

  const { data: weeklyFocus } = useQuery({
    queryKey: ["advisor-weekly-focus", companyId],
    queryFn: async () => {
      const d = new Date();
      const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = utc.getUTCDay() || 7;
      utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      const weekKey = `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
      const { data } = await supabase
        .from("weekly_focus")
        .select("headline, summary, status, week_key")
        .eq("company_id", companyId!)
        .eq("week_key", weekKey)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
    staleTime: 30 * 60_000,
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
  const memberNames = data?.memberNames ?? "";

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => { clearCompanyOverride(); navigate("/"); }}
          className="mt-1 p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold text-foreground tracking-tight truncate">
            {company?.name || companyName || "Virksomhed"}
          </h1>
          {/* Member names */}
          <p className="text-sm text-muted-foreground mt-0.5">
            {memberNames || "—"}
            {company?.industry_label && <span className="text-muted-foreground/50 mx-1.5">·</span>}
            {company?.industry_label && <span>{company.industry_label}</span>}
            {data?.assignedName && <span className="text-muted-foreground/50 mx-1.5">·</span>}
            {data?.assignedName && <span>Tildelt: {data.assignedName}</span>}
          </p>
        </div>
        {/* Primary action button */}
        <Link
          to={primaryConv ? `/chat?conversationId=${primaryConv.id}` : "/chat"}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
            primaryConv?.awaiting_reply_from === "advisor"
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "border border-border bg-card hover:bg-accent text-foreground"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {primaryConv?.awaiting_reply_from === "advisor" ? "Svar nu" : "Åbn chat"}
        </Link>
      </div>

      {/* ── Chat status + follow-up ── */}
      {primaryConv && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          primaryConv.awaiting_reply_from === "advisor"
            ? "bg-destructive/5 border-destructive/20"
            : primaryConv.follow_up_at && new Date(primaryConv.follow_up_at) > new Date()
            ? "bg-amber-500/5 border-amber-500/20"
            : "bg-secondary/30 border-border"
        }`}>
          <MessageSquare className={`h-4 w-4 shrink-0 ${
            primaryConv.awaiting_reply_from === "advisor" ? "text-destructive" :
            primaryConv.follow_up_at ? "text-amber-600" : "text-muted-foreground"
          }`} />
          <p className="text-sm font-medium text-foreground flex-1">
            {deriveChatState(primaryConv).label}
          </p>
          {primaryConv.follow_up_at && new Date(primaryConv.follow_up_at) <= new Date() && (
            <span className="text-xs text-destructive font-medium">Forfalden</span>
          )}
        </div>
      )}

      {/* ── Financial snapshot ── */}
      {latest ? (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Seneste rapport · {formatReportKey(latest.key)}
            </p>
            <Link
              to={`/members/${primaryMemberUserId}?section=reports`}
              className="text-[11px] text-primary hover:underline"
              onClick={() => clearCompanyOverride()}
            >
              Se alle rapporter →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <TrendMetric icon={DollarSign} label="Omsætning" current={latest.kf.omsaetning} previous={data?.previous?.kf.omsaetning} hasPrevious={!!data?.previous} />
            <TrendMetric icon={TrendingUp} label="Resultat" current={latest.kf.resultat_foer_skat} previous={data?.previous?.kf.resultat_foer_skat} hasPrevious={!!data?.previous} negativeIsRed />
            <TrendMetric icon={Wallet} label="Bank" current={bankReport?.kf.bank_balance} previous={data?.bankPrevious?.kf.bank_balance} hasPrevious={!!data?.bankPrevious} periodNote={bankReport && bankReport.key !== latest.key ? `pr. ${formatReportKey(bankReport.key)}` : undefined} />
          </div>
          {/* Revenue trend sparkline */}
          {data?.revenueTimeline && data.revenueTimeline.length >= 3 && (() => {
            const tl = data.revenueTimeline;
            const first = tl[0].value;
            const last = tl[tl.length - 1].value;
            const totalDelta = first !== 0 ? Math.round(((last - first) / Math.abs(first)) * 100) : 0;
            if (Math.abs(totalDelta) < 3) return null;
            const lineColor = last >= first ? "#1D9E75" : "#E24B4A";
            return (
              <div className="mt-4 border-t border-border pt-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-muted-foreground">Omsætningstrend — {tl.length} måneder</p>
                  <span className={`text-[11px] font-semibold ${last >= first ? "text-emerald-600" : "text-destructive"}`}>
                    {totalDelta >= 0 ? "+" : ""}{totalDelta}%
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={40}>
                  <LineChart data={tl}>
                    <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-secondary/20">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">Ingen rapport uploadet endnu</p>
        </div>
      )}

      {/* ── Two-column: Pulse + Milestones ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pulse */}
        <div className="glass-card rounded-xl p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Pulse check-in
            {latestPulse?.period_key && (() => {
              const [year, month] = latestPulse.period_key.split("-");
              const months = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
              return ` · ${months[parseInt(month,10)-1]} ${year}`;
            })()}
          </p>
          {latestPulse ? (
            <div className="space-y-2.5">
              {latestPulse.went_well && (
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Hvad gik godt</p>
                  <p className="text-xs text-foreground leading-relaxed">{latestPulse.went_well}</p>
                </div>
              )}
              {latestPulse.biggest_challenge && (
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Største udfordring</p>
                  <p className="text-xs text-foreground leading-relaxed">{latestPulse.biggest_challenge}</p>
                </div>
              )}
              {(latestPulse as any).help_needed && (
                <div className="flex items-start gap-1.5 px-2.5 py-2 bg-amber-500/8 rounded-lg border border-amber-500/20">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">{(latestPulse as any).help_needed}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">Ingen check-in denne måned</p>
          )}
        </div>

        {/* Milestones */}
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Milestones</p>
            {primaryMemberUserId && (
              <Link
                to={`/members/${primaryMemberUserId}?section=milestones`}
                className="text-[11px] text-primary hover:underline"
                onClick={() => clearCompanyOverride()}
              >
                Se alle →
              </Link>
            )}
          </div>
          {milestones.length > 0 ? (
            <div className="space-y-2">
              {milestones.slice(0, 5).map((m: any) => {
                const isOverdue = m.deadline && new Date(m.deadline) < new Date();
                return (
                  <div key={m.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs truncate flex-1 ${isOverdue ? "text-destructive" : "text-foreground"}`}>
                        {m.title}
                      </p>
                      <span className={`text-[10px] shrink-0 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                        {m.deadline ? new Date(m.deadline).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : ""}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${m.progress >= 100 ? "bg-primary" : isOverdue ? "bg-destructive" : "bg-chart-warning"}`}
                        style={{ width: `${m.progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {milestones.length > 5 && (
                <p className="text-[10px] text-muted-foreground">+{milestones.length - 5} flere</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">Ingen aktive milestones</p>
          )}
        </div>
      </div>

      {/* ── Handouts + Weekly focus ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Handouts</p>
            {primaryMemberUserId && (
              <Link
                to={`/members/${primaryMemberUserId}?handout=overordnet`}
                className="text-[11px] text-primary hover:underline"
                onClick={() => clearCompanyOverride()}
              >
                Se handouts →
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${((handoutData?.completed ?? 0) / (handoutData?.total ?? 5)) * 100}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-foreground shrink-0">
              {handoutData?.completed ?? 0}/{handoutData?.total ?? 5}
            </span>
          </div>
        </div>

        {weeklyFocus ? (
          <div className="glass-card rounded-xl p-4">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-2">AI-fokus denne uge</p>
            <p className="text-xs font-medium text-foreground leading-snug">{weeklyFocus.headline}</p>
            {weeklyFocus.summary && (
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-3">{weeklyFocus.summary}</p>
            )}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-4 flex items-center justify-center">
            <p className="text-xs text-muted-foreground/40">Ingen AI-fokus denne uge</p>
          </div>
        )}
      </div>

      {/* ── Intern note (always visible) ── */}
      {hasNote && noteConvId && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="h-3.5 w-3.5 text-amber-600" />
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Intern note</p>
            <Link to={`/chat?conversationId=${noteConvId}`} className="ml-auto text-[11px] text-primary hover:underline">
              Se i chat →
            </Link>
          </div>
          <p className="text-xs text-muted-foreground italic">Note er gemt — klik for at se og redigere i chatten</p>
        </div>
      )}

      {/* ── Quick links ── */}
      {primaryMemberUserId && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Rapporter", path: `/members/${primaryMemberUserId}?section=reports` },
            { label: "Milestones", path: `/members/${primaryMemberUserId}?section=milestones` },
            { label: "Handouts", path: `/members/${primaryMemberUserId}?section=handouts` },
            { label: "Fuldt overblik", path: `/members/${primaryMemberUserId}` },
          ].map(link => (
            <Link
              key={link.label}
              to={link.path}
              onClick={() => clearCompanyOverride()}
              className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all text-xs font-medium text-muted-foreground hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdvisorCompanyOverview;
