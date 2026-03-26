import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isConversationActionable } from "@/lib/advisorActionHelpers";
import {
  MessageSquare, Clock, Building2,
  ChevronRight, CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DANISH_MONTHS, REPORT_OVERRIDE_SELECT, getEffectiveReportPeriodKey, getEffectiveKeyFigures, type ReportData } from "@/lib/financialUtils";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import GroupDashboardContent from "@/components/GroupDashboardContent";
import { buildGroupAggregates, type GroupCompanySummary } from "@/lib/groupDashboardUtils";

// ── Helpers ──

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  return formatDistanceToNow(new Date(dateStr), { locale: da, addSuffix: true });
}

/** Missing-report logic — mirrors AttentionNeeded exactly */
function getMissingReportKey(): string {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  return `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
}

function getMissingReportLabel(): string {
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  return DANISH_MONTHS[prevMonth];
}

// ── Types ──

interface ConversationRow {
  id: string;
  company_id: string | null;
  awaiting_reply_from: string | null;
  assigned_advisor_id: string | null;
  conversation_status: string;
  follow_up_at: string | null;
  last_member_message_at: string | null;
  last_message_at: string | null;
  acknowledged_at: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
  logo_url: string | null;
}

// ── Component ──

const AdvisorDashboard = () => {
  const { user, setCompanyOverride } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["advisor-dashboard", user?.id],
    queryFn: async () => {
      const [convRes, companiesRes, reportsRes, notesRes] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, company_id, awaiting_reply_from, assigned_advisor_id, conversation_status, follow_up_at, last_member_message_at, last_message_at, acknowledged_at")
          .eq("conversation_status", "open"),
        supabase
          .from("companies")
          .select("id, name, logo_url")
          .order("name"),
        (supabase
          .from("financial_reports")
          .select(`company_id, report_period, extracted_data, normalized_data, ${REPORT_OVERRIDE_SELECT}`) as any)
          .is("deleted_at", null)
          .eq("status", "processed"),
        supabase
          .from("conversation_notes")
          .select("conversation_id"),
      ]);

      const conversations = (convRes.data || []) as ConversationRow[];
      const companies = (companiesRes.data || []) as CompanyRow[];
      const reports = (reportsRes.data || []) as (ReportData & { company_id: string })[];
      const noteConvIds = new Set((notesRes.data || []).map((n: any) => n.conversation_id));

      const companyMap = new Map(companies.map(c => [c.id, c]));

      // Build report keys per company + latest key figures
      const reportKeysByCompany = new Map<string, Set<string>>();
      const latestKfByCompany = new Map<string, { key: string; kf: Record<string, number> }>();
      for (const r of reports) {
        const key = getEffectiveReportPeriodKey(r);
        if (!key) continue;
        if (!reportKeysByCompany.has(r.company_id)) reportKeysByCompany.set(r.company_id, new Set());
        reportKeysByCompany.get(r.company_id)!.add(key);

        const kf = getEffectiveKeyFigures(r);
        if (!kf) continue;
        const existing = latestKfByCompany.get(r.company_id);
        if (!existing || key > existing.key) {
          latestKfByCompany.set(r.company_id, { key, kf });
        }
      }

      // Latest report key per company
      const latestReportKey = new Map<string, string>();
      for (const [compId, keys] of reportKeysByCompany) {
        const sorted = [...keys].sort();
        latestReportKey.set(compId, sorted[sorted.length - 1]);
      }

      // Missing report check
      const missingKey = getMissingReportKey();
      const companiesMissingReport = new Set<string>();
      for (const c of companies) {
        const keys = reportKeysByCompany.get(c.id);
        if (!keys || !keys.has(missingKey)) companiesMissingReport.add(c.id);
      }

      // Personal scope: assigned to me OR unassigned
      const myConversations = conversations.filter(c =>
        c.assigned_advisor_id === user!.id || c.assigned_advisor_id === null
      );

      // Action Queue: uses shared actionable-now logic (excludes acknowledged/snoozed)
      const now = new Date();
      const actionQueue = myConversations
        .filter(c => isConversationActionable(c, now))
        .sort((a, b) => {
          const aTime = a.last_member_message_at || "";
          const bTime = b.last_member_message_at || "";
          return aTime.localeCompare(bTime); // oldest first
        });

      // Follow-ups
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const overdueFollowUps = myConversations
        .filter(c => c.follow_up_at && new Date(c.follow_up_at) <= now)
        .sort((a, b) => (a.follow_up_at || "").localeCompare(b.follow_up_at || ""));

      const upcomingFollowUps = myConversations
        .filter(c => c.follow_up_at && new Date(c.follow_up_at) > now && new Date(c.follow_up_at) <= weekFromNow)
        .sort((a, b) => (a.follow_up_at || "").localeCompare(b.follow_up_at || ""));

      // Conversation lookup by company for portfolio status
      const convByCompany = new Map<string, ConversationRow[]>();
      for (const c of conversations) {
        if (!c.company_id) continue;
        if (!convByCompany.has(c.company_id)) convByCompany.set(c.company_id, []);
        convByCompany.get(c.company_id)!.push(c);
      }

      // Has note per company
      const companiesWithNote = new Set<string>();
      for (const c of conversations) {
        if (c.company_id && noteConvIds.has(c.id)) companiesWithNote.add(c.company_id);
      }

      // Build GroupCompanySummary[] for the new dashboard component
      const groupSummaries: GroupCompanySummary[] = companies.map(c => {
        const latest = latestKfByCompany.get(c.id);
        const latestKey = latestReportKey.get(c.id) || null;
        const missingReport = companiesMissingReport.has(c.id);

        return {
          company_id: c.id,
          company_name: c.name,
          logo_url: c.logo_url,
          has_report: !!latestKey,
          has_verified_metrics: !!latest,
          latest_report_id: null,
          effective_period_label: latestKey ? (() => { const [y, m] = latestKey.split("-"); return `${DANISH_MONTHS[parseInt(m, 10) - 1]} ${y}`; })() : null,
          effective_period_key: latestKey,
          revenue: latest?.kf.omsaetning ?? null,
          gross_profit: latest?.kf.daekningsbidrag ?? null,
          ebt: latest?.kf.resultat_foer_skat ?? null,
          cash: latest?.kf.bank_balance ?? null,
          missing_current_period: missingReport,
        };
      });

      return {
        actionQueue,
        overdueFollowUps,
        upcomingFollowUps,
        groupSummaries,
        companyMap,
      };
    },
    enabled: !!user,
    staleTime: 2 * 60_000,
  });

  const actionQueue = data?.actionQueue || [];
  const overdueFollowUps = data?.overdueFollowUps || [];
  const upcomingFollowUps = data?.upcomingFollowUps || [];
  const groupSummaries = data?.groupSummaries || [];
  const companyMap = data?.companyMap || new Map();

  const hasFollowUps = overdueFollowUps.length > 0 || upcomingFollowUps.length > 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  /** Format report key "2026-02" → "Feb 2026" */
  const formatReportKey = (key: string | null): string => {
    if (!key) return "Ingen";
    const [year, month] = key.split("-");
    const monthIdx = parseInt(month, 10) - 1;
    return `${DANISH_MONTHS[monthIdx]?.slice(0, 3) || month} ${year}`;
  };

  

  const getCompanyName = (companyId: string | null): string => {
    if (!companyId) return "Ukendt";
    return companyMap.get(companyId)?.name || "Ukendt";
  };

  return (
    <div className="space-y-6">
      {/* ── Section 1: Kræver svar ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Afventer dit svar
          </h2>
          {actionQueue.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold">
              {actionQueue.length}
            </span>
          )}
        </div>

        {actionQueue.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary/50 border border-border">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm text-muted-foreground">Ingen samtaler afventer dit svar</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {actionQueue.map(conv => (
              <Link
                key={conv.id}
                to={`/chat?conversationId=${conv.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border hover:border-destructive/30 hover:bg-accent/50 transition-all group"
              >
                <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {getCompanyName(conv.company_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {conv.last_member_message_at ? timeAgo(conv.last_member_message_at) : "Afventer"}
                    {conv.assigned_advisor_id === user!.id ? (
                      <span className="ml-2 text-muted-foreground">· Min</span>
                    ) : conv.assigned_advisor_id === null ? (
                      <span className="ml-2 text-chart-warning">· Ikke tildelt</span>
                    ) : null}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-destructive transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Section 2: Follow-up ── */}
      {hasFollowUps && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-chart-warning" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Opfølgninger
            </h2>
          </div>
          <div className="space-y-1.5">
            {overdueFollowUps.length > 0 && (
              <>
                <p className="text-[11px] font-medium text-destructive uppercase tracking-wider px-1 mb-1">Forfalden</p>
                {overdueFollowUps.map(conv => (
                  <Link
                    key={conv.id}
                    to={`/chat?conversationId=${conv.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card border border-border border-l-[3px] border-l-destructive hover:bg-accent/50 transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {getCompanyName(conv.company_id)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {conv.assigned_advisor_id === user!.id ? (
                          <span className="text-muted-foreground">Min</span>
                        ) : conv.assigned_advisor_id === null ? (
                          <span className="text-chart-warning">Ikke tildelt</span>
                        ) : null}
                      </p>
                    </div>
                    <span className="text-xs text-destructive font-medium shrink-0">
                      {conv.follow_up_at
                        ? new Date(conv.follow_up_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" })
                        : ""}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </Link>
                ))}
              </>
            )}
            {upcomingFollowUps.length > 0 && (
              <>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1 mt-2">Kommende</p>
                {upcomingFollowUps.map(conv => (
                  <Link
                    key={conv.id}
                    to={`/chat?conversationId=${conv.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card border border-border hover:bg-accent/50 transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {getCompanyName(conv.company_id)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {conv.assigned_advisor_id === user!.id ? (
                          <span className="text-muted-foreground">Min</span>
                        ) : conv.assigned_advisor_id === null ? (
                          <span className="text-chart-warning">Ikke tildelt</span>
                        ) : null}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium shrink-0">
                      {conv.follow_up_at
                        ? new Date(conv.follow_up_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" })
                        : ""}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </Link>
                ))}
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Section 3: Porteføljestatus ── */}
      <GroupDashboardContent
        companies={groupSummaries}
        aggregates={buildGroupAggregates(groupSummaries)}
        isLoading={isLoading}
        groupName="Mine virksomheder"
        onCompanyClick={(id, name) => setCompanyOverride(id, name)}
      />
    </div>
  );
};

export default AdvisorDashboard;
