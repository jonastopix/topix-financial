import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isConversationActionable } from "@/lib/advisorActionHelpers";
import {
  MessageSquare, Clock, Building2, ChevronRight, CheckCircle2,
  Activity, Target, Search, List, LayoutGrid,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DANISH_MONTHS, REPORT_OVERRIDE_SELECT, getEffectiveReportPeriodKey, getEffectiveKeyFigures, formatCompact, type ReportData } from "@/lib/financialUtils";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import type { GroupCompanySummary } from "@/lib/groupDashboardUtils";
import KPICard from "@/components/KPICard";

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

interface MilestoneData {
  title: string;
  deadline: string | null;
  progress: number;
}

interface KpiTargetData {
  kpi_key: string;
  target_value: number;
  target_label: string;
}

interface InvestorCompanySummary extends GroupCompanySummary {
  revenueTrendPct: number | null;
  ebitdaMargin: number | null;
  budgetRevenue: number | null;
  budgetVsActualPct: number | null;
  latestPulse: { went_well: string; biggest_challenge: string; created_at: string } | null;
  needsAttention: boolean;
  unreadMessages: number;
  milestones: MilestoneData[];
  kpiTargets: KpiTargetData[];
}

// ── MemberCard ──

function MemberCard({
  company: c,
  onCompanyClick,
  convByCompany,
}: {
  company: InvestorCompanySummary;
  onCompanyClick: (id: string, name: string) => void;
  convByCompany: Map<string, ConversationRow[]>;
}) {
  const conv = convByCompany.get(c.company_id)?.[0];
  const lastMsg = conv?.last_member_message_at;
  const hasPulse = !!c.latestPulse &&
    new Date(c.latestPulse.created_at) > new Date(Date.now() - 30 * 86400000);

  return (
    <div
      className={`glass-card rounded-xl p-4 border transition-all ${
        c.unreadMessages > 0
          ? "border-chart-warning/40 bg-chart-warning/5"
          : "border-border/30"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
            {c.logo_url ? (
              <img src={c.logo_url} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground">
                {c.company_name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {c.company_name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {c.effective_period_label || "Ingen rapport"}
              {lastMsg && ` · Besked ${timeAgo(lastMsg)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {c.unreadMessages > 0 && (
            <span className="h-5 min-w-[20px] px-1 rounded-full bg-chart-warning text-white text-[10px] font-bold flex items-center justify-center">
              {c.unreadMessages}
            </span>
          )}
          {hasPulse && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
              Pulse ✓
            </span>
          )}
        </div>
      </div>

        {/* Financial KPIs */}
        {c.has_verified_metrics && (
          <div className="grid grid-cols-2 gap-2 mb-3 p-2.5 rounded-lg bg-secondary/30">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Omsætning</p>
              <p className="text-xs font-semibold text-foreground">
                {c.revenue != null ? formatCompact(c.revenue) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Resultat</p>
              <p className={`text-xs font-semibold ${
                c.ebt == null ? "text-muted-foreground" :
                c.ebt >= 0 ? "text-primary" : "text-destructive"
              }`}>
                {c.ebt != null ? formatCompact(c.ebt) : "—"}
              </p>
            </div>
            {c.revenueTrendPct != null && (
              <div className="col-span-2">
                <div className="flex items-center gap-1">
                  <span className={`text-xs font-semibold ${
                    c.revenueTrendPct > 0 ? "text-primary" : "text-destructive"
                  }`}>
                    {c.revenueTrendPct > 0 ? "↑" : "↓"}
                    {Math.abs(c.revenueTrendPct).toFixed(0)}% MoM
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

      {/* KPI targets vs actual */}
      {c.kpiTargets.length > 0 && c.has_verified_metrics && (
        <div className="mb-3 space-y-1">
          {c.kpiTargets.slice(0, 2).map(kpi => {
            const actual = kpi.kpi_key === "omsaetning" ? c.revenue :
                          kpi.kpi_key === "resultat" ? c.ebt : null;
            const pct = actual != null && kpi.target_value > 0
              ? (actual / kpi.target_value) * 100 : null;
            return (
              <div key={kpi.kpi_key} className="flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground w-20 truncate">
                  {kpi.target_label || kpi.kpi_key}
                </p>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct == null ? "w-0" :
                      pct >= 100 ? "bg-primary" :
                      pct >= 70 ? "bg-chart-warning" :
                      "bg-destructive/60"
                    }`}
                    style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground w-8 text-right">
                  {pct != null ? `${Math.round(pct)}%` : "—"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Active milestones */}
      {c.milestones.length > 0 && (
        <div className="mb-3 space-y-1">
          {c.milestones.slice(0, 2).map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                m.progress >= 100 ? "bg-primary" :
                m.deadline && new Date(m.deadline) < new Date()
                  ? "bg-destructive" : "bg-chart-warning"
              }`} />
              <p className="text-[11px] text-muted-foreground truncate flex-1">
                {m.title}
              </p>
              {m.deadline && (
                <p className="text-[9px] text-muted-foreground shrink-0">
                  {new Date(m.deadline).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pulse teaser */}
      {c.latestPulse?.biggest_challenge && (
        <div className="pt-2 border-t border-border/20">
          <p className="text-[10px] text-muted-foreground/70 italic line-clamp-1">
            "{c.latestPulse.biggest_challenge}"
          </p>
        </div>
      )}

      {/* Action */}
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => onCompanyClick(c.company_id, c.company_name)}
          className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Åbn →
        </button>
      </div>
    </div>
  );
}

// ── Component ──

const AdvisorDashboard = () => {
  const { user, setCompanyOverride } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["advisor-dashboard", user?.id],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const currentYear = new Date().getFullYear();

      const [
        convRes, companiesRes, reportsRes, notesRes,
        budgetRes, pulseRes, recentReportsRes, recentFactsRes,
        milestonesRes, kpiTargetsRes, companyMembersRes,
      ] = await Promise.all([
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
        supabase
          .from("pulse_checkins")
          .select("company_id, went_well, biggest_challenge, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
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
        // Milestones — active ones
        supabase
          .from("milestones")
          .select("user_id, title, deadline, progress, status")
          .eq("status", "active")
          .order("deadline", { ascending: true }),
        // KPI targets per company
        (supabase
          .from("kpi_targets")
          .select("company_id, kpi_key, target_value, target_label") as any),
        // Company members to map user_id → company_id
        (supabase
          .from("company_members")
          .select("user_id, company_id") as any),
      ]);

      const conversations = (convRes.data || []) as ConversationRow[];
      const companies = (companiesRes.data || []) as CompanyRow[];
      const reports = (reportsRes.data || []) as (ReportData & { company_id: string })[];

      const companyMap = new Map(companies.map(c => [c.id, c]));

      // user_id → company_id
      const userToCompany = new Map<string, string>();
      for (const m of (companyMembersRes.data || []) as any[]) {
        userToCompany.set(m.user_id, m.company_id);
      }

      // company_id → active milestones[]
      const milestonesByCompany = new Map<string, MilestoneData[]>();
      for (const m of (milestonesRes.data || []) as any[]) {
        const cid = userToCompany.get(m.user_id);
        if (!cid) continue;
        if (!milestonesByCompany.has(cid)) milestonesByCompany.set(cid, []);
        milestonesByCompany.get(cid)!.push({ title: m.title, deadline: m.deadline, progress: m.progress });
      }

      // company_id → kpi targets[]
      const kpiByCompany = new Map<string, KpiTargetData[]>();
      for (const k of (kpiTargetsRes.data || []) as any[]) {
        if (!kpiByCompany.has(k.company_id)) kpiByCompany.set(k.company_id, []);
        kpiByCompany.get(k.company_id)!.push({ kpi_key: k.kpi_key, target_value: k.target_value, target_label: k.target_label });
      }

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
          if (latestRev != null && prevRev != null && latestRev > 0 && prevRev > 0) {
            revenueTrendByCompany.set(compId, ((latestRev - prevRev) / prevRev) * 100);
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
          milestones: milestonesByCompany.get(c.id) || [],
          kpiTargets: kpiByCompany.get(c.id) || [],
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

      // Conversations grouped by company
      const convByCompany = new Map<string, ConversationRow[]>();
      for (const c of conversations) {
        if (c.company_id) {
          if (!convByCompany.has(c.company_id)) convByCompany.set(c.company_id, []);
          convByCompany.get(c.company_id)!.push(c);
        }
      }

      // Priority queue — score each company
      const priorityItems = investorSummaries
        .map(c => {
          const reasons: { label: string; urgency: "high" | "medium" }[] = [];
          let score = 0;

          if (c.unreadMessages > 0) {
            reasons.push({ label: `${c.unreadMessages} ulæst${c.unreadMessages > 1 ? "e" : ""} besked${c.unreadMessages > 1 ? "er" : ""}`, urgency: "high" });
            score += 100;
          }
          if (c.cash != null && c.cash < 0) {
            reasons.push({ label: "Bankovertræk", urgency: "high" });
            score += 90;
          }
          if (c.revenueTrendPct != null && c.revenueTrendPct <= -15) {
            reasons.push({ label: `Omsætning faldt ${Math.abs(Math.round(c.revenueTrendPct))}% MoM`, urgency: "high" });
            score += 80;
          }
          const hasRecentUpload = (recentReportsRes.data || []).some((r: any) => r.company_id === c.company_id);
          const alreadyCommitted = !c.missing_current_period && c.has_verified_metrics;
          if (hasRecentUpload && !alreadyCommitted) {
            reasons.push({ label: "Rapport klar til godkendelse", urgency: "high" });
            score += 70;
          }
          const conv = convByCompany.get(c.company_id)?.[0];
          if (conv?.follow_up_at && new Date(conv.follow_up_at) <= now) {
            const d = new Date(conv.follow_up_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
            reasons.push({ label: `Opfølgning forfalden (${d})`, urgency: "medium" });
            score += 50;
          }
          if (c.missing_current_period && !c.has_report) {
            reasons.push({ label: "Ingen rapport endnu", urgency: "medium" });
            score += 30;
          }

          return { company: { company_id: c.company_id, company_name: c.company_name, logo_url: c.logo_url }, reasons, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      return {
        actionQueue, overdueFollowUps, upcomingFollowUps,
        investorSummaries, companyMap, activityFeed, convByCompany,
        priorityItems,
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
  const convByCompany = data?.convByCompany || new Map<string, ConversationRow[]>();

  const hasFollowUps = overdueFollowUps.length > 0 || upcomingFollowUps.length > 0;

  // KPI aggregates
  const total = investorSummaries.length;
  const reportedThisMonth = investorSummaries.filter(c => c.has_verified_metrics && !c.missing_current_period).length;

  const engagementScores = investorSummaries.map(c => {
    const hasPulse = !!c.latestPulse && new Date(c.latestPulse.created_at) > new Date(Date.now() - 30 * 86400000);
    let score = 0;
    if (c.has_verified_metrics && !c.missing_current_period) score++;
    if (hasPulse) score++;
    if (c.milestones.length > 0) score++;
    if (c.kpiTargets.length > 0) score++;
    return score;
  });
  const avgEngagement = total > 0 ? engagementScores.reduce((s, v) => s + v, 0) / total : 0;
  const fullyEngaged = engagementScores.filter(s => s >= 3).length;

  const withFoundation = investorSummaries.filter(c => c.kpiTargets.length > 0 && c.milestones.length > 0).length;

  const withPositiveTrend = investorSummaries.filter(c => c.revenueTrendPct != null && c.revenueTrendPct > 0).length;
  const withNegativeTrend = investorSummaries.filter(c => c.revenueTrendPct != null && c.revenueTrendPct < -5).length;
  const withTrendData = investorSummaries.filter(c => c.revenueTrendPct != null).length;

  // Pulse companies (last 60 days)
  const pulseCompanies = investorSummaries
    .filter(c => c.latestPulse && new Date(c.latestPulse.created_at) > new Date(Date.now() - 60 * 86400000))
    .sort((a, b) => b.latestPulse!.created_at.localeCompare(a.latestPulse!.created_at))
    .slice(0, 6);

  const getCompanyName = (companyId: string | null): string => {
    if (!companyId) return "Ukendt";
    return companyMap.get(companyId)?.name || "Ukendt";
  };

  // Member list state
  const [memberSearch, setMemberSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<"alle" | "ubesvaret" | "aktive" | "passive">("alle");
  const [memberView, setMemberView] = useState<"table" | "cards">("table");

  const filteredMembers = useMemo(() => {
    let list = [...investorSummaries];
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      list = list.filter(c => c.company_name.toLowerCase().includes(q));
    }
    if (memberFilter === "ubesvaret") {
      list = list.filter(c => c.unreadMessages > 0);
    } else if (memberFilter === "aktive") {
      list = list.filter(c =>
        c.has_verified_metrics ||
        c.unreadMessages > 0 ||
        (c.latestPulse && new Date(c.latestPulse.created_at) > new Date(Date.now() - 30 * 86400000))
      );
    } else if (memberFilter === "passive") {
      list = list.filter(c =>
        !c.has_verified_metrics &&
        c.unreadMessages === 0 &&
        (!c.latestPulse || new Date(c.latestPulse.created_at) < new Date(Date.now() - 30 * 86400000))
      );
    }
    return list.sort((a, b) => {
      if (b.unreadMessages !== a.unreadMessages) return b.unreadMessages - a.unreadMessages;
      return a.company_name.localeCompare(b.company_name, "da");
    });
  }, [investorSummaries, memberSearch, memberFilter]);

  const unbesvaredCount = investorSummaries.filter(c => c.unreadMessages > 0).length;
  const showKpiColumn = filteredMembers.filter(c => c.kpiTargets.length > 0).length / Math.max(1, filteredMembers.length) >= 0.2;

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
      {/* ── TOP: Portfolio KPI bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title="Rapporterer aktivt" value={`${reportedThisMonth} / ${total}`} subtitle="sendt rapport denne måned" accentColor={total > 0 && reportedThisMonth / total >= 0.7 ? "emerald" : "amber"} />
        <KPICard title="Platform-engagement" value={`${fullyEngaged} / ${total}`} subtitle={`bruger 3+ funktioner · snit ${avgEngagement.toFixed(1)}/4`} accentColor={total > 0 && fullyEngaged / total >= 0.5 ? "emerald" : "blue"} />
        <KPICard title="Fundament på plads" value={`${withFoundation} / ${total}`} subtitle="KPI-mål + milestones sat" accentColor={total > 0 && withFoundation / total >= 0.6 ? "emerald" : "amber"} />
        <KPICard title="Omsætningstrend" value={withTrendData > 0 ? `${withPositiveTrend} ↑ · ${withNegativeTrend} ↓` : "Ingen data"} subtitle={withTrendData > 0 ? `af ${withTrendData} med sammenlignbare tal` : "kræver 2+ måneders rapporter"} accentColor={withNegativeTrend > withPositiveTrend ? "rose" : "emerald"} />
      </div>

      {/* ── Two-column layout ── */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT: Members */}
        <div className="flex-1 min-w-0 lg:w-2/3">
          {/* Toolbar: search + filter + view toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Søg virksomhed..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border bg-secondary/50 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-1">
              {([
                { key: "alle", label: "Alle" },
                { key: "ubesvaret", label: "Ubesvaret" },
                { key: "aktive", label: "Aktive" },
                { key: "passive", label: "Passive" },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setMemberFilter(tab.key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    memberFilter === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {tab.label}
                  {tab.key === "ubesvaret" && unbesvaredCount > 0 && (
                    <span className="ml-1 text-[9px] opacity-70">({unbesvaredCount})</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setMemberView("table")}
                className={`p-1.5 rounded transition-colors ${memberView === "table" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                title="Tabelvisning"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setMemberView("cards")}
                className={`p-1.5 rounded transition-colors ${memberView === "cards" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                title="Kortvisning"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <span className="text-[10px] text-muted-foreground ml-1">
                {filteredMembers.length}/{investorSummaries.length}
              </span>
            </div>
          </div>

          {/* Member content */}
          {memberView === "table" ? (
            <>
              {/* Engagement snapshot */}
              {(() => {
                const currentPeriodKey = getMissingReportKey();
                const reportedCount = filteredMembers.filter(c =>
                  !c.missing_current_period && c.has_verified_metrics).length;
                const pulseCount = filteredMembers.filter(c =>
                  c.latestPulse && new Date(c.latestPulse.created_at) > new Date(Date.now() - 30 * 86400000)).length;
                return (
                  <div className="flex items-center gap-4 mb-3 text-[11px] text-muted-foreground">
                    <span>
                      <span className="font-semibold text-primary">{reportedCount}</span>
                      /{filteredMembers.length} rapporteret denne måned
                    </span>
                    <span>·</span>
                    <span>
                      <span className="font-semibold text-chart-info">{pulseCount}</span>
                      /{filteredMembers.length} pulse seneste 30 dage
                    </span>
                  </div>
                );
              })()}
              <div className="glass-card rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left py-2 px-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Virksomhed</th>
                      <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Rapport</th>
                      <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Omsætning MoM</th>
                      {showKpiColumn && <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">KPI mål</th>}
                      <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Engagement</th>
                      <th className="py-2 px-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {filteredMembers.map(c => {
                      const currentPeriodKey = getMissingReportKey();
                      const hasCurrentReport = c.effective_period_key === currentPeriodKey
                        || (c.effective_period_key != null && !c.missing_current_period);
                      const hasPulse30 = !!c.latestPulse && new Date(c.latestPulse.created_at) > new Date(Date.now() - 30 * 86400000);
                      const hasChat = (convByCompany.get(c.company_id)?.[0]?.last_member_message_at) != null;
                      const hasMilestones = c.milestones.length > 0;
                      const hasKpiTargets = c.kpiTargets.length > 0;
                      const primaryKpi = c.kpiTargets.find(k => k.kpi_key === "omsaetning") || c.kpiTargets[0];
                      const kpiPct = primaryKpi && c.revenue != null && primaryKpi.target_value > 0
                        ? Math.min(100, (c.revenue / primaryKpi.target_value) * 100)
                        : null;

                      return (
                        <tr
                          key={c.company_id}
                          className="hover:bg-accent/20 transition-colors group cursor-pointer"
                          onClick={() => setCompanyOverride(c.company_id, c.company_name)}
                        >
                          {/* Virksomhed */}
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                                {c.logo_url
                                  ? <img src={c.logo_url} alt="" className="h-full w-full object-contain" />
                                  : <span className="text-[9px] font-bold text-muted-foreground">{c.company_name.slice(0, 2).toUpperCase()}</span>
                                }
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate max-w-[160px]">{c.company_name}</p>
                              </div>
                              {c.unreadMessages > 0 && (
                                <span className="h-4 min-w-[16px] px-1 rounded-full bg-chart-warning text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                  {c.unreadMessages}
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Rapport denne måned */}
                          <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                            {hasCurrentReport ? (
                              <div className="flex items-center justify-center gap-1">
                                <div className="h-2 w-2 rounded-full bg-primary" />
                                <span className="text-[10px] text-primary font-medium">
                                  {c.effective_period_label}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/50">
                                Ikke rapporteret
                              </span>
                            )}
                          </td>
                          {/* Trend */}
                          <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                            {c.revenueTrendPct != null ? (
                              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                                c.revenueTrendPct > 5 ? "text-primary" :
                                c.revenueTrendPct < -5 ? "text-destructive" :
                                "text-muted-foreground"
                              }`}>
                                {c.revenueTrendPct > 0 ? "↑" : c.revenueTrendPct < 0 ? "↓" : "→"}
                                {Math.min(200, Math.abs(c.revenueTrendPct)).toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/30">—</span>
                            )}
                          </td>
                          {/* KPI-fremskridt */}
                          {showKpiColumn && (
                            <td className="py-2.5 px-3 hidden md:table-cell">
                              {kpiPct != null ? (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[80px]">
                                    <div
                                      className={`h-full rounded-full ${
                                        kpiPct >= 100 ? "bg-primary" :
                                        kpiPct >= 70 ? "bg-chart-warning" :
                                        "bg-destructive/50"
                                      }`}
                                      style={{ width: `${kpiPct}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {Math.round(kpiPct)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/30">Ingen mål</span>
                              )}
                            </td>
                          )}
                          {/* Engagement */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1">
                              {[
                                { active: hasCurrentReport, color: "bg-primary", label: "R", title: "Rapport" },
                                { active: hasPulse30, color: "bg-chart-info", label: "P", title: "Pulse" },
                                { active: hasChat, color: "bg-purple-500", label: "C", title: "Chat" },
                                { active: hasMilestones, color: "bg-chart-warning", label: "M", title: "Milestones" },
                                { active: hasKpiTargets, color: "bg-teal-500", label: "K", title: "KPI" },
                              ].map((dot, i) => (
                                <span
                                  key={i}
                                  title={dot.title}
                                  className={`inline-flex items-center justify-center h-4 w-4 rounded text-[8px] font-bold transition-colors ${
                                    dot.active
                                      ? `${dot.color} text-white`
                                      : "bg-muted-foreground/10 text-muted-foreground/30"
                                  }`}
                                >
                                  {dot.label}
                                </span>
                              ))}
                            </div>
                          </td>
                          {/* Action */}
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] text-muted-foreground/40 group-hover:text-primary transition-colors">Se data →</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredMembers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    {memberSearch ? "Ingen resultater for søgningen" : "Ingen medlemmer matcher dette filter"}
                  </p>
                )}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-2 px-1 flex-wrap">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Engagement:</p>
                {[
                  { color: "bg-primary", label: "R = Rapport denne måned" },
                  { color: "bg-chart-info", label: "P = Pulse" },
                  { color: "bg-purple-500", label: "C = Chat" },
                  { color: "bg-chart-warning", label: "M = Milestones" },
                  { color: "bg-teal-500", label: "K = KPI mål" },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1">
                    <div className={`h-1.5 w-1.5 rounded-full ${item.color}`} />
                    <span className="text-[9px] text-muted-foreground">{item.label}</span>
                  </div>
                ))}
                <span className="text-[9px] text-muted-foreground ml-2">
                  · MoM = måned-over-måned omsætningsvækst
                </span>
              </div>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredMembers.map(c => (
                <MemberCard
                  key={c.company_id}
                  company={c}
                  onCompanyClick={setCompanyOverride}
                  convByCompany={convByCompany}
                />
              ))}
              {filteredMembers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8 col-span-2">
                  {memberSearch ? "Ingen resultater for søgningen" : "Ingen medlemmer matcher dette filter"}
                </p>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Sidebar (1/3) */}
        <div className="lg:w-[340px] shrink-0 space-y-5 lg:sticky lg:top-4 lg:self-start">
          {/* Action queue */}
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                Afventer svar
              </p>
              {actionQueue.length > 0 && (
                <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-chart-warning text-white text-[10px] font-bold flex items-center justify-center">
                  {actionQueue.length}
                </span>
              )}
            </div>
            {actionQueue.length > 0 ? (
              <div className="space-y-1">
                {actionQueue.map(conv => (
                  <Link
                    key={conv.id}
                    to={`/chat?conversationId=${conv.id}`}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-accent/50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {getCompanyName(conv.company_id)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {conv.last_member_message_at ? timeAgo(conv.last_member_message_at) : "Afventer"}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-foreground">Alle er besvaret ✓</span>
              </div>
            )}
          </div>

          {/* Pulse */}
          {pulseCompanies.length > 0 && (
            <div className="glass-card rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                Seneste pulse
              </p>
              <div className="space-y-3">
                {pulseCompanies.slice(0, 4).map(c => (
                  <button
                    key={c.company_id}
                    className="w-full text-left group"
                    onClick={() => setCompanyOverride(c.company_id, c.company_name)}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-medium text-foreground truncate">
                        {c.company_name}
                      </p>
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(c.latestPulse!.created_at), { locale: da, addSuffix: true })}
                      </span>
                    </div>
                    {c.latestPulse?.biggest_challenge && (
                      <p className="text-[10px] text-muted-foreground italic line-clamp-2 leading-relaxed">
                        "{c.latestPulse.biggest_challenge}"
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Follow-ups */}
          {hasFollowUps && (
            <div className="glass-card rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Opfølgninger
              </p>
              <div className="space-y-1">
                {overdueFollowUps.length > 0 && (
                  <>
                    <p className="text-[10px] font-medium text-destructive uppercase tracking-wider mb-1">Forfalden</p>
                    {overdueFollowUps.map(conv => (
                      <Link
                        key={conv.id}
                        to={`/chat?conversationId=${conv.id}`}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent/50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {getCompanyName(conv.company_id)}
                          </p>
                        </div>
                        <span className="text-[10px] text-destructive font-medium shrink-0">
                          {conv.follow_up_at ? new Date(conv.follow_up_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : ""}
                        </span>
                      </Link>
                    ))}
                  </>
                )}
                {upcomingFollowUps.length > 0 && (
                  <>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 mt-2">Kommende</p>
                    {upcomingFollowUps.map(conv => (
                      <Link
                        key={conv.id}
                        to={`/chat?conversationId=${conv.id}`}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent/50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {getCompanyName(conv.company_id)}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                          {conv.follow_up_at ? new Date(conv.follow_up_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : ""}
                        </span>
                      </Link>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Activity feed */}
          {activityFeed.length > 0 && (
            <div className="glass-card rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                Seneste 7 dage
              </p>
              <div className="space-y-0.5">
                {activityFeed.map((event: any) => {
                  const iconConfig = {
                    report_uploaded: { color: "text-chart-info", bg: "bg-chart-info/10", label: "Rapport" },
                    report_committed: { color: "text-primary", bg: "bg-primary/10", label: "Godkendt" },
                  }[event.type as string] as { color: string; bg: string; label: string };
                  return (
                    <button
                      key={event.id}
                      onClick={() => setCompanyOverride(event.companyId, event.companyName)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/30 transition-colors text-left"
                    >
                      <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${iconConfig.bg} ${iconConfig.color}`}>
                        {iconConfig.label}
                      </span>
                      <span className="text-[11px] font-medium text-foreground truncate flex-1">
                        {event.companyName}
                      </span>
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(event.timestamp), { locale: da, addSuffix: true })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdvisorDashboard;
