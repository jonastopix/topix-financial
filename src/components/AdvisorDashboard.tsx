import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isConversationActionable } from "@/lib/advisorActionHelpers";
import {
  MessageSquare, Clock, Building2, ChevronRight, CheckCircle2,
  BarChart3, Activity, TrendingUp, TrendingDown, AlertTriangle, MessageCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DANISH_MONTHS, REPORT_OVERRIDE_SELECT, getEffectiveReportPeriodKey, getEffectiveKeyFigures, formatCompact, type ReportData } from "@/lib/financialUtils";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import type { GroupCompanySummary } from "@/lib/groupDashboardUtils";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";

// ── Helpers ──

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  return formatDistanceToNow(new Date(dateStr), { locale: da, addSuffix: true });
}

function getMissingReportKey(): string {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  return `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
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

interface InvestorCompanySummary extends GroupCompanySummary {
  revenueTrendPct: number | null;
  ebitdaMargin: number | null;
  budgetRevenue: number | null;
  budgetVsActualPct: number | null;
  latestPulse: { went_well: string; biggest_challenge: string; created_at: string } | null;
  needsAttention: boolean;
  unreadMessages: number;
}

// ── Component ──

const AdvisorDashboard = () => {
  const { user, setCompanyOverride } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["advisor-dashboard", user?.id],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const currentYear = new Date().getFullYear();

      const [convRes, companiesRes, reportsRes, notesRes, budgetRes, pulseRes, recentReportsRes, recentFactsRes] = await Promise.all([
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
        supabase
          .from("budget_targets")
          .select("company_id, category, budget_amount, period")
          .like("period", `${currentYear}-base-%`),
        (supabase
          .from("pulse_checkins" as any)
          .select("company_id, went_well, biggest_challenge, created_at")
          .order("created_at", { ascending: false })
          .limit(100) as any),
        (supabase
          .from("financial_reports")
          .select("id, company_id, uploaded_at, status, report_period")
          .is("deleted_at", null)
          .gte("uploaded_at", weekAgo)
          .order("uploaded_at", { ascending: false })
          .limit(20) as any),
        (supabase
          .from("financial_report_facts")
          .select("company_id, committed_at, period_key")
          .gte("committed_at", weekAgo)
          .order("committed_at", { ascending: false })
          .limit(20) as any),
      ]);

      const conversations = (convRes.data || []) as ConversationRow[];
      const companies = (companiesRes.data || []) as CompanyRow[];
      const reports = (reportsRes.data || []) as (ReportData & { company_id: string })[];

      const companyMap = new Map(companies.map(c => [c.id, c]));

      // Budget revenue by company
      const budgetRevenueByCompany = new Map<string, number>();
      for (const bt of (budgetRes.data || []) as any[]) {
        if (bt.category === "omsaetning") {
          budgetRevenueByCompany.set(
            bt.company_id,
            (budgetRevenueByCompany.get(bt.company_id) || 0) + (bt.budget_amount || 0)
          );
        }
      }

      // Latest pulse by company
      const latestPulseByCompany = new Map<string, { went_well: string; biggest_challenge: string; created_at: string }>();
      for (const p of (pulseRes.data || []) as any[]) {
        if (!latestPulseByCompany.has(p.company_id)) {
          latestPulseByCompany.set(p.company_id, {
            went_well: p.went_well || "",
            biggest_challenge: p.biggest_challenge || "",
            created_at: p.created_at,
          });
        }
      }

      // Unread messages per company
      const unreadByCompany = new Map<string, number>();
      for (const c of conversations) {
        if (c.company_id && c.awaiting_reply_from === "advisor") {
          unreadByCompany.set(c.company_id, (unreadByCompany.get(c.company_id) || 0) + 1);
        }
      }

      // Build report keys per company + KFs by period
      const reportKeysByCompany = new Map<string, Set<string>>();
      const kfByCompanyPeriod = new Map<string, Map<string, Record<string, number>>>();
      const latestKfByCompany = new Map<string, { key: string; kf: Record<string, number> }>();

      for (const r of reports) {
        const key = getEffectiveReportPeriodKey(r);
        if (!key) continue;
        if (!reportKeysByCompany.has(r.company_id)) reportKeysByCompany.set(r.company_id, new Set());
        reportKeysByCompany.get(r.company_id)!.add(key);

        const kf = getEffectiveKeyFigures(r);
        if (!kf) continue;

        // Store per period for trend calc
        if (!kfByCompanyPeriod.has(r.company_id)) kfByCompanyPeriod.set(r.company_id, new Map());
        const existing = kfByCompanyPeriod.get(r.company_id)!.get(key);
        if (!existing) kfByCompanyPeriod.get(r.company_id)!.set(key, kf);

        const latestExisting = latestKfByCompany.get(r.company_id);
        if (!latestExisting || key > latestExisting.key) {
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

      // Revenue trend per company
      const revenueTrendByCompany = new Map<string, number | null>();
      for (const [compId, periodMap] of kfByCompanyPeriod) {
        const sortedKeys = [...periodMap.keys()].sort();
        if (sortedKeys.length >= 2) {
          const latest = periodMap.get(sortedKeys[sortedKeys.length - 1]);
          const prev = periodMap.get(sortedKeys[sortedKeys.length - 2]);
          const latestRev = latest?.omsaetning;
          const prevRev = prev?.omsaetning;
          if (latestRev != null && prevRev != null && prevRev !== 0) {
            revenueTrendByCompany.set(compId, ((latestRev - prevRev) / Math.abs(prevRev)) * 100);
          } else {
            revenueTrendByCompany.set(compId, null);
          }
        } else {
          revenueTrendByCompany.set(compId, null);
        }
      }

      // Personal scope
      const myConversations = conversations.filter(c =>
        c.assigned_advisor_id === user!.id || c.assigned_advisor_id === null
      );

      // Action Queue
      const now = new Date();
      const actionQueue = myConversations
        .filter(c => isConversationActionable(c, now))
        .sort((a, b) => (a.last_member_message_at || "").localeCompare(b.last_member_message_at || ""));

      // Follow-ups
      const weekFromNow = new Date(now.getTime() + 7 * 86400000);
      const overdueFollowUps = myConversations
        .filter(c => c.follow_up_at && new Date(c.follow_up_at) <= now)
        .sort((a, b) => (a.follow_up_at || "").localeCompare(b.follow_up_at || ""));
      const upcomingFollowUps = myConversations
        .filter(c => c.follow_up_at && new Date(c.follow_up_at) > now && new Date(c.follow_up_at) <= weekFromNow)
        .sort((a, b) => (a.follow_up_at || "").localeCompare(b.follow_up_at || ""));

      // Build InvestorCompanySummary[]
      const monthsElapsed = new Date().getMonth() + 1;

      const investorSummaries: InvestorCompanySummary[] = companies.map(c => {
        const latest = latestKfByCompany.get(c.id);
        const latestKey = latestReportKey.get(c.id) || null;
        const missingReport = companiesMissingReport.has(c.id);
        const revenue = latest?.kf.omsaetning ?? null;
        const ebt = latest?.kf.resultat_foer_skat ?? null;
        const cash = latest?.kf.bank_balance ?? null;
        const revenueTrendPct = revenueTrendByCompany.get(c.id) ?? null;
        const budgetRevenue = budgetRevenueByCompany.get(c.id) ?? null;
        const pulse = latestPulseByCompany.get(c.id) ?? null;

        const ebitdaMargin = revenue != null && revenue > 0 && ebt != null
          ? (ebt / revenue) * 100 : null;

        let budgetVsActualPct: number | null = null;
        if (budgetRevenue != null && budgetRevenue > 0 && revenue != null) {
          const proratedBudget = (budgetRevenue / 12) * monthsElapsed;
          budgetVsActualPct = ((revenue - proratedBudget) / proratedBudget) * 100;
        }

        const needsAttention =
          (cash != null && cash < 0)
          || (revenueTrendPct != null && revenueTrendPct < -15)
          || (missingReport && !latestKey);

        return {
          company_id: c.id,
          company_name: c.name,
          logo_url: c.logo_url,
          has_report: !!latestKey,
          has_verified_metrics: !!latest,
          latest_report_id: null,
          effective_period_label: latestKey ? (() => { const [y, m] = latestKey.split("-"); return `${DANISH_MONTHS[parseInt(m, 10) - 1]} ${y}`; })() : null,
          effective_period_key: latestKey,
          revenue,
          gross_profit: latest?.kf.daekningsbidrag ?? null,
          ebt,
          cash,
          missing_current_period: missingReport,
          revenueTrendPct,
          ebitdaMargin,
          budgetRevenue,
          budgetVsActualPct,
          latestPulse: pulse,
          needsAttention,
          unreadMessages: unreadByCompany.get(c.id) || 0,
        };
      });

      // Activity feed
      interface ActivityEvent {
        id: string;
        type: "report_uploaded" | "report_committed";
        companyId: string;
        companyName: string;
        label: string;
        timestamp: string;
      }
      const activityEvents: ActivityEvent[] = [];
      for (const r of (recentReportsRes.data || []) as any[]) {
        const name = companyMap.get(r.company_id)?.name || "Ukendt";
        activityEvents.push({
          id: `report-${r.id}`, type: "report_uploaded", companyId: r.company_id,
          companyName: name, label: `Rapport uploadet${r.report_period ? ` · ${r.report_period}` : ""}`,
          timestamp: r.uploaded_at,
        });
      }
      for (const f of (recentFactsRes.data || []) as any[]) {
        const name = companyMap.get(f.company_id)?.name || "Ukendt";
        activityEvents.push({
          id: `fact-${f.company_id}-${f.period_key}`, type: "report_committed", companyId: f.company_id,
          companyName: name, label: `Tal godkendt · ${f.period_key}`, timestamp: f.committed_at,
        });
      }
      const seen = new Set<string>();
      const activityFeed = activityEvents
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
        .slice(0, 10);

      return {
        actionQueue, overdueFollowUps, upcomingFollowUps,
        investorSummaries, companyMap, activityFeed,
      };
    },
    enabled: !!user,
    staleTime: 2 * 60_000,
  });

  const actionQueue = data?.actionQueue || [];
  const overdueFollowUps = data?.overdueFollowUps || [];
  const upcomingFollowUps = data?.upcomingFollowUps || [];
  const investorSummaries = data?.investorSummaries || [];
  const companyMap = data?.companyMap || new Map();
  const activityFeed = data?.activityFeed || [];

  const hasFollowUps = overdueFollowUps.length > 0 || upcomingFollowUps.length > 0;
  const attentionCompanies = investorSummaries.filter(c => c.needsAttention);
  const totalRevenue = investorSummaries.reduce((s, c) => s + (c.revenue ?? 0), 0);
  const pulseCompanies = investorSummaries
    .filter(c => c.latestPulse && new Date(c.latestPulse.created_at) > new Date(Date.now() - 30 * 86400000))
    .sort((a, b) => b.latestPulse!.created_at.localeCompare(a.latestPulse!.created_at))
    .slice(0, 8);

  const getCompanyName = (companyId: string | null): string => {
    if (!companyId) return "Ukendt";
    return companyMap.get(companyId)?.name || "Ukendt";
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Section 1: Kræver opmærksomhed ── */}
      {attentionCompanies.length > 0 ? (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Kræver opmærksomhed
            </h2>
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold">
              {attentionCompanies.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {attentionCompanies.map(c => (
              <div
                key={c.company_id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border hover:border-destructive/30 transition-all"
              >
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {c.logo_url
                    ? <img src={c.logo_url} alt="" className="h-8 w-8 object-cover rounded-lg" />
                    : <span className="text-[10px] font-bold text-muted-foreground">
                        {c.company_name.slice(0, 2).toUpperCase()}
                      </span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.company_name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {c.cash != null && c.cash < 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                        Negativ cash
                      </span>
                    )}
                    {c.revenueTrendPct != null && c.revenueTrendPct < -15 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                        Omsætning {c.revenueTrendPct.toFixed(0)}% MoM
                      </span>
                    )}
                    {c.missing_current_period && !c.has_report && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-chart-warning/10 text-chart-warning font-medium">
                        Ingen rapport
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setCompanyOverride(c.company_id, c.company_name)}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Se data →
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-700 dark:text-emerald-300">
            Alt ser godt ud — ingen virksomheder kræver opmærksomhed
          </span>
        </div>
      )}

      {/* ── Section 2: Porteføljeoverblik ── */}
      <section>
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                Portefølje ({investorSummaries.length} virksomheder)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Samlet omsætning: {formatCompact(totalRevenue)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Virksomhed</TableHead>
                  <TableHead className="text-right">Omsætning</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Vækst MoM</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">vs. Budget</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investorSummaries
                  .sort((a, b) => (b.revenue ?? -Infinity) - (a.revenue ?? -Infinity))
                  .map(c => (
                    <TableRow
                      key={c.company_id}
                      className="cursor-pointer"
                      onClick={() => setCompanyOverride(c.company_id, c.company_name)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                            {c.logo_url
                              ? <img src={c.logo_url} alt="" className="h-7 w-7 object-cover rounded-md" />
                              : <span className="text-[9px] font-bold text-muted-foreground">
                                  {c.company_name.slice(0, 2).toUpperCase()}
                                </span>
                            }
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-foreground truncate">
                                {c.company_name}
                              </span>
                              {c.needsAttention && (
                                <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                              )}
                            </div>
                            {c.effective_period_label && (
                              <span className="text-[10px] text-muted-foreground">
                                {c.effective_period_label}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-medium text-foreground">
                          {c.revenue != null ? formatCompact(c.revenue) : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm ${
                          c.ebitdaMargin == null ? "text-muted-foreground" :
                          c.ebitdaMargin >= 10 ? "text-primary" :
                          c.ebitdaMargin >= 0 ? "text-foreground" :
                          "text-destructive"
                        }`}>
                          {c.ebitdaMargin != null ? `${c.ebitdaMargin.toFixed(1)}%` : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.revenueTrendPct != null ? (
                          <span className={`inline-flex items-center gap-0.5 text-sm ${
                            c.revenueTrendPct >= 0 ? "text-primary" : "text-destructive"
                          }`}>
                            {c.revenueTrendPct >= 0
                              ? <TrendingUp className="h-3 w-3" />
                              : <TrendingDown className="h-3 w-3" />
                            }
                            {c.revenueTrendPct > 0 ? "+" : ""}{c.revenueTrendPct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm ${c.cash != null && c.cash < 0 ? "text-destructive font-medium" : "text-foreground"}`}>
                          {c.cash != null ? formatCompact(c.cash) : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.budgetVsActualPct != null ? (
                          <span className={`text-sm ${
                            c.budgetVsActualPct >= 0 ? "text-primary" : "text-destructive"
                          }`}>
                            {c.budgetVsActualPct > 0 ? "+" : ""}
                            {c.budgetVsActualPct.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      {/* ── Section 3: Hvad siger medlemmerne ── */}
      {pulseCompanies.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Hvad siger medlemmerne
            </h2>
            <span className="text-xs text-muted-foreground">· Seneste pulse check-in</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {pulseCompanies.map(c => (
              <button
                key={c.company_id}
                className="glass-card rounded-xl p-4 text-left hover:bg-accent/30 transition-colors"
                onClick={() => setCompanyOverride(c.company_id, c.company_name)}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-sm font-medium text-foreground truncate">
                    {c.company_name}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(c.latestPulse!.created_at), { locale: da, addSuffix: true })}
                  </span>
                </div>
                {c.latestPulse?.biggest_challenge && (
                  <div className="mb-2">
                    <p className="text-[10px] font-semibold text-destructive/70 uppercase tracking-wider mb-0.5">
                      Største udfordring
                    </p>
                    <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-2">
                      "{c.latestPulse.biggest_challenge}"
                    </p>
                  </div>
                )}
                {c.latestPulse?.went_well && (
                  <div>
                    <p className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider mb-0.5">
                      Hvad gik godt
                    </p>
                    <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-2">
                      "{c.latestPulse.went_well}"
                    </p>
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 4: Ubesvarede beskeder ── */}
      {actionQueue.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Ubesvarede beskeder
            </h2>
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold">
              {actionQueue.length}
            </span>
          </div>
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
        </section>
      )}

      {/* ── Section 5: Opfølgninger ── */}
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

      {/* ── Section 6: Seneste aktivitet ── */}
      {activityFeed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Seneste 7 dage
            </h2>
          </div>
          <div className="glass-card rounded-xl divide-y divide-border/30">
            {activityFeed.map((event: any) => {
              const iconConfig = {
                report_uploaded: { color: "text-blue-500", bg: "bg-blue-500/10", label: "Rapport" },
                report_committed: { color: "text-primary", bg: "bg-primary/10", label: "Godkendt" },
              }[event.type as string] as { color: string; bg: string; label: string };
              return (
                <button
                  key={event.id}
                  onClick={() => setCompanyOverride(event.companyId, event.companyName)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors text-left"
                >
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${iconConfig.bg} ${iconConfig.color}`}>
                    {iconConfig.label}
                  </span>
                  <span className="text-xs font-medium text-foreground truncate flex-1">
                    {event.companyName}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {event.label.split(" · ")[1] || ""}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(event.timestamp), { locale: da, addSuffix: true })}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default AdvisorDashboard;
