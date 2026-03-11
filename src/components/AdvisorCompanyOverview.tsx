import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import {
  ArrowLeft, MessageSquare, FileText, Target, BarChart3,
  BookOpen, Clock, StickyNote, Eye, DollarSign, TrendingUp, Wallet,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DANISH_MONTHS, REPORT_OVERRIDE_SELECT,
  getEffectiveReportPeriodKey, getEffectiveKeyFigures,
  formatDKK, type ReportData,
} from "@/lib/financialUtils";

// ── Missing-report logic — reused from AdvisorDashboard (same as AttentionNeeded) ──
function getMissingReportKey(): string {
  const now = new Date();
  const cm = now.getMonth();
  const cy = now.getFullYear();
  const pm = cm === 0 ? 11 : cm - 1;
  const py = cm === 0 ? cy - 1 : cy;
  return `${py}-${String(pm + 1).padStart(2, "0")}`;
}

function getMissingReportLabel(): string {
  const pm = new Date().getMonth() === 0 ? 11 : new Date().getMonth() - 1;
  return DANISH_MONTHS[pm];
}

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

const AdvisorCompanyOverview = () => {
  const { user, companyId, companyName, clearCompanyOverride } = useAuth();
  const { toggleViewMode } = useViewMode();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["advisor-company-overview", companyId],
    queryFn: async () => {
      // Stage 1: parallel fetch of company, conversations, reports
      const [companyRes, convsRes, reportsRes] = await Promise.all([
        supabase.from("companies").select("id, name, industry, cvr_number, logo_url").eq("id", companyId!).single(),
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
      const bankReport = [...sorted].reverse().find(r => r.kf.bank_balance != null);

      const missingKey = getMissingReportKey();
      const reportKeys = new Set(sorted.map(r => r.key));
      const missingReport = !reportKeys.has(missingKey);

      const assignedName = (advisorProfileRes as any)?.data?.full_name ?? null;

      return {
        company,
        primaryConv,
        hasNote,
        noteConvId,
        latest,
        bankReport,
        missingReport,
        assignedName,
      };
    },
    enabled: !!companyId && !!user,
    staleTime: 2 * 60_000,
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
  const missingReport = data?.missingReport ?? false;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Header ── */}
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
            {company?.industry && <span>{company.industry}</span>}
            {company?.cvr_number && (
              <>
                {company?.industry && <span>·</span>}
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

      {/* ── Status Bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Chat state */}
        <Link
          to={primaryConv ? `/chat?conversationId=${primaryConv.id}` : "/chat"}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card text-xs font-medium hover:bg-accent/50 transition-colors ${chatState.color}`}
        >
          <ChatIcon className="h-3.5 w-3.5" />
          {chatState.label}
        </Link>

        {/* Overdue follow-up (if not already shown in chat state) */}
        {primaryConv?.follow_up_at && new Date(primaryConv.follow_up_at) <= new Date() && (
          <Link
            to={`/chat?conversationId=${primaryConv.id}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-destructive/20 bg-destructive/5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Clock className="h-3.5 w-3.5" />
            Forfalden opfølgning
          </Link>
        )}

        {/* Report status */}
        {missingReport ? (
          <Link
            to="/reports"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-chart-warning/20 bg-chart-warning/5 text-xs font-medium text-chart-warning hover:bg-chart-warning/10 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Mangler {getMissingReportLabel()}
          </Link>
        ) : latest ? (
          <Link
            to="/reports"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:bg-accent/50 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            {formatReportKey(latest.key)}
          </Link>
        ) : null}

        {/* Internal note indicator — links to chat if possible, otherwise non-clickable */}
        {hasNote && (
          noteConvId ? (
            <Link
              to={`/chat?conversationId=${noteConvId}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
              title="Intern note — se i chatten"
            >
              <StickyNote className="h-3.5 w-3.5" />
              Note
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-card text-xs text-muted-foreground" title="Intern note">
              <StickyNote className="h-3.5 w-3.5" />
              Note
            </span>
          )
        )}
      </div>

      {/* ── Financial Snapshot ── */}
      {latest && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Seneste nøgletal · {formatReportKey(latest.key)}
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-medium">Omsætning</span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {formatDKK(latest.kf.omsaetning)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-medium">Resultat</span>
              </div>
              <p className={`text-sm font-semibold ${(latest.kf.resultat_foer_skat ?? 0) >= 0 ? "text-foreground" : "text-destructive"}`}>
                {formatDKK(latest.kf.resultat_foer_skat)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-medium">Bank</span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {bankReport ? formatDKK(bankReport.kf.bank_balance) : "—"}
              </p>
              {bankReport && bankReport.key !== latest.key && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  pr. {formatReportKey(bankReport.key)}
                </p>
              )}
            </div>
          </div>
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
