import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isConversationActionable } from "@/lib/advisorActionHelpers";
import {
  MessageSquare, Clock, Building2, ChevronRight, CheckCircle2,
  Activity, Target, Search, List, LayoutGrid, UserCheck, Heart, AlertTriangle, Sparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { DANISH_MONTHS, REPORT_OVERRIDE_SELECT, getEffectiveReportPeriodKey, getEffectiveKeyFigures, formatCompact, type ReportData } from "@/lib/financialUtils";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import type { GroupCompanySummary } from "@/lib/groupDashboardUtils";
import KPICard from "@/components/KPICard";
import AdvisorPriorityQueue from "@/components/AdvisorPriorityQueue";
import AdvisorBroadcast from "@/components/AdvisorBroadcast";
import AdvisorAlertsPanel from "@/components/AdvisorAlertsPanel";
import AdvisorSparringQueue from "@/components/AdvisorSparringQueue";

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
  latestPulse: { went_well: string; biggest_challenge: string; help_needed?: string | null; created_at: string } | null;
  needsAttention: boolean;
  unreadMessages: number;
  milestones: MilestoneData[];
  kpiTargets: KpiTargetData[];
  hasWeeklyFocus: boolean;
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
  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["advisor-dashboard", user?.id, "assignment-display-v2"],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      const currentYear = new Date().getFullYear();

      const [
        convRes, companiesRes, reportsRes, notesRes,
        budgetRes, pulseRes, recentReportsRes, recentFactsRes,
        milestonesRes, kpiTargetsRes, companyMembersRes, advisorProfilesRes,
        recentMilestonesRes, groupConvsRes, groupsRes, groupCompaniesRes, weeklyFocusRes,
      ] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, company_id, awaiting_reply_from, assigned_advisor_id, conversation_status, follow_up_at, last_member_message_at, last_message_at, acknowledged_at")
          .order("last_message_at", { ascending: false }),
        supabase
          .from("companies")
          .select("id, name, logo_url, is_legat")
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
          .select("company_id, went_well, biggest_challenge, help_needed, created_at")
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
          .gte("committed_at", twoWeeksAgo)
          .order("committed_at", { ascending: false })
          .limit(20) as any),
        supabase
          .from("milestones")
          .select("company_id, title, deadline, progress, status")
          .eq("status", "active")
          .order("deadline", { ascending: true }),
        (supabase
          .from("kpi_targets")
          .select("company_id, kpi_key, target_value, target_label") as any),
        (supabase
          .from("company_members")
          .select("user_id, company_id") as any),
        supabase.rpc("get_all_advisor_profiles"),
        supabase
          .from("milestones")
          .select("company_id, title, updated_at, status")
          .eq("status", "completed")
          .gte("updated_at", twoWeeksAgo)
          .order("updated_at", { ascending: false })
          .limit(50),
        (supabase
          .from("group_conversations" as any)
          .select("id, group_id, awaiting_reply_from, assigned_advisor_id, conversation_status, follow_up_at, last_member_message_at, last_message_at, acknowledged_at")
          .order("last_message_at", { ascending: false })),
        supabase
          .from("groups")
          .select("id, name"),
        (supabase.from("group_companies" as any).select("company_id")),
        (supabase
          .from("weekly_focus")
          .select("company_id")
          .eq("status", "active")
          .gte("generated_at", new Date(Date.now() - 14 * 86400000).toISOString()) as any),
      ]);

      // Map group conversations into the same shape as company conversations
      const groupNameMap = new Map<string, string>();
      for (const g of ((groupsRes.data || []) as any[])) {
        groupNameMap.set(g.id, g.name);
      }
      const groupConvsMapped = ((groupConvsRes as any)?.data || []).map((gc: any) => ({
        ...gc,
        company_id: `group_${gc.group_id}`,
        id: `group_${gc.id}`,
      })) as ConversationRow[];

      const allConversations = [
        ...(convRes.data || []) as ConversationRow[],
        ...groupConvsMapped,
      ];
      const conversations = allConversations.filter((conversation) => conversation.conversation_status === "open");
      const companies = (companiesRes.data || []) as CompanyRow[];
      const reports = (reportsRes.data || []) as (ReportData & { company_id: string })[];
      const advisorProfiles = ((advisorProfilesRes.data || []) as any[]).map((advisor) => ({
        user_id: advisor.user_id,
        full_name: advisor.full_name || "Ukendt",
      }));

      const companyMap = new Map(companies.map(c => [c.id, c]));
      const legatCompanyIds = new Set(
        (companiesRes.data || [])
          .filter((c: any) => c.is_legat)
          .map((c: any) => c.id)
      );
      // Add groups as pseudo-companies so they resolve in companyMap
      for (const [gid, gname] of groupNameMap) {
        companyMap.set(`group_${gid}`, { id: `group_${gid}`, name: gname, logo_url: null });
      }

      // user_id → company_id
      const userToCompany = new Map<string, string>();
      for (const m of (companyMembersRes.data || []) as any[]) {
        userToCompany.set(m.user_id, m.company_id);
      }

      const companyToUser = new Map<string, string>();
      for (const m of (companyMembersRes.data || []) as any[]) {
        companyToUser.set(m.company_id, m.user_id);
      }

      // Fetch member profiles for name display
      const memberUserIds = [...companyToUser.values()].filter(Boolean);
      const memberProfilesRes = memberUserIds.length > 0
        ? await supabase.from("profiles").select("user_id, full_name").in("user_id", memberUserIds)
        : { data: [] as { user_id: string; full_name: string | null }[] };
      const companyMemberNameMap = new Map<string, string>();
      for (const [companyId, userId] of companyToUser.entries()) {
        const profile = (memberProfilesRes.data || []).find(p => p.user_id === userId);
        if (profile?.full_name) companyMemberNameMap.set(companyId, profile.full_name);
      }

      // company_id → active milestones[]
      const milestonesByCompany = new Map<string, MilestoneData[]>();
      for (const m of (milestonesRes.data || []) as any[]) {
        const cid = m.company_id;
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
      const latestPulseByCompany = new Map<string, { went_well: string; biggest_challenge: string; help_needed?: string | null; created_at: string }>();
      for (const p of (pulseRes.data || []) as any[]) {
        if (!latestPulseByCompany.has(p.company_id)) {
          latestPulseByCompany.set(p.company_id, {
            went_well: p.went_well || "",
            biggest_challenge: p.biggest_challenge || "",
            help_needed: p.help_needed || null,
            created_at: p.created_at,
          });
        }
      }

      // Recently completed milestones (last 7 days)
      const recentlyCompletedMilestones = new Map<string, string>();
      for (const m of (recentMilestonesRes.data || []) as any[]) {
        const companyId = m.company_id;
        if (companyId && !recentlyCompletedMilestones.has(companyId)) {
          recentlyCompletedMilestones.set(companyId, m.title);
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

      // Weekly focus companies (active in last 14 days)
      const weeklyFocusCompanies = new Set<string>(
        ((weeklyFocusRes as any)?.data || []).map((r: any) => r.company_id)
      );

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

      const investorSummaries: InvestorCompanySummary[] = companies.filter(c => !legatCompanyIds.has(c.id)).map(c => {
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
          hasWeeklyFocus: weeklyFocusCompanies.has(c.id),
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
      for (const c of allConversations) {
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

          // Signal: No pulse check-in this month (after day 15)
          const dayOfMonth = now.getDate();
          const hasPulseThisMonth = c.latestPulse != null &&
            new Date(c.latestPulse.created_at) > new Date(now.getFullYear(), now.getMonth(), 1);
          if (!hasPulseThisMonth && dayOfMonth > 15 && c.has_verified_metrics) {
            reasons.push({ label: "Ingen pulse check-in denne måned", urgency: "medium" });
            score += 25;
          }

           // Milestone-signal moved to sparring queue

          const primaryConv = convByCompany.get(c.company_id)?.[0];
          const assignedAdvisor = advisorProfiles.find((advisor) => advisor.user_id === primaryConv?.assigned_advisor_id);
          return {
            company: { company_id: c.company_id, company_name: c.company_name, logo_url: c.logo_url },
            reasons,
            score,
            assigned_advisor_id: primaryConv?.assigned_advisor_id ?? null,
            assigned_advisor_name: assignedAdvisor?.full_name ?? null,
          };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      // Sparring items — proactive signals for companies NOT in priority queue
      const sparringItems = investorSummaries
        .map(c => {
          const signals: { label: string; hint: string }[] = [];

          // T8: Rapport committet inden for 14 dage
          const hasCommit14 = (recentFactsRes.data || []).some((f: any) =>
            f.company_id === c.company_id && f.committed_at >= twoWeeksAgo
          );
          if (hasCommit14) {
            signals.push({
              label: "Ny rapport godkendt",
              hint: "God tid til at gennemgå tallene og give sparring mens de er friske",
            });
          }

          // T9: Positiv momentum — sænket til >5%
          if (c.revenueTrendPct != null && c.revenueTrendPct >= 5) {
            signals.push({
              label: `Omsætning steg ${Math.round(c.revenueTrendPct)}% MoM`,
              hint: "Hvad driver væksten? Kan vi skalere det?",
            });
          }

          // T10: Pulse udfyldt denne måned — med ELLER uden help_needed
          const pulseThisMonth = c.latestPulse != null &&
            new Date(c.latestPulse.created_at) > new Date(now.getFullYear(), now.getMonth(), 1);
          if (pulseThisMonth) {
            if (c.latestPulse?.help_needed) {
              signals.push({
                label: "Beder om hjælp",
                hint: c.latestPulse.help_needed,
              });
            } else if (c.latestPulse?.biggest_challenge) {
              signals.push({
                label: "Pulse udfyldt",
                hint: `Største udfordring: "${c.latestPulse.biggest_challenge.slice(0, 60)}${c.latestPulse.biggest_challenge.length > 60 ? "..." : ""}"`,
              });
            } else {
              signals.push({
                label: "Pulse udfyldt",
                hint: "Founder har tjekket ind — god anledning til at følge op",
              });
            }
          }

          // T11: Milestone fuldført inden for 14 dage
          const completedTitle = recentlyCompletedMilestones.get(c.company_id);
          if (completedTitle) {
            signals.push({
              label: `Milestone nået`,
              hint: `"${completedTitle}" — anerkend fremgangen og sæt næste mål`,
            });
          }

          // Ingen milestones sat
          if (c.milestones.length === 0 && c.has_verified_metrics) {
            signals.push({
              label: "Ingen milestones",
              hint: "Founder har data men ingen mål — hjælp med at sætte den første milestone",
            });
          }

          // Pulse ikke udfyldt efter den 15.
          if (!pulseThisMonth && now.getDate() > 15 && c.has_verified_metrics) {
            signals.push({
              label: "Pulse ikke udfyldt endnu",
              hint: "Vi er efter den 15. — god anledning til at rykke for check-in",
            });
          }

          // T12: Ingen kontakt i over 21 dage — fires uafhængigt af andre signals
          {
            const sparConv = convByCompany.get(c.company_id)?.[0];
            const lastContact = sparConv?.last_message_at;
            const daysSinceContact = lastContact
              ? Math.floor((now.getTime() - new Date(lastContact).getTime()) / 86400000)
              : 999;
            if (daysSinceContact > 21 && c.has_verified_metrics) {
              signals.push({
                label: `Ingen kontakt i ${daysSinceContact} dage`,
                hint: "God anledning til at tjekke ind — upload din seneste tanke om tallene",
              });
            }
          }

          const conv = convByCompany.get(c.company_id)?.[0];
          const assignedAdvisor = advisorProfiles.find(a => a.user_id === conv?.assigned_advisor_id);
          return {
            company: { company_id: c.company_id, company_name: c.company_name, logo_url: c.logo_url },
            signals,
            assigned_advisor_id: conv?.assigned_advisor_id ?? null,
            assigned_advisor_name: assignedAdvisor?.full_name ?? null,
          };
        })
        .filter(item => item.signals.length > 0)
        .filter(item => !priorityItems.some(p => p.company.company_id === item.company.company_id))
        .sort((a, b) => {
          const score = (s: typeof a) => {
            let n = 0;
            if (s.signals.some(x => x.label === "Beder om hjælp")) n += 40;
            if (s.signals.some(x => x.label === "Ny rapport godkendt")) n += 30;
            if (s.signals.some(x => x.label === "Pulse udfyldt")) n += 25;
            if (s.signals.some(x => x.label.startsWith("Omsætning steg"))) n += 20;
            if (s.signals.some(x => x.label === "Milestone nået")) n += 15;
            if (s.signals.some(x => x.label.startsWith("Ingen kontakt i"))) n += 10;
            if (s.signals.some(x => x.label === "Pulse ikke udfyldt endnu")) n += 5;
            // "Ingen milestones" gets 0 — always shown last
            return n;
          };
          return score(b) - score(a);
        })
        .slice(0, 10);

      // Group priority items — same logic as companies but from group_conversations
      const groupPriorityItems = groupConvsMapped
        .map((gc: any) => {
          const reasons: { label: string; urgency: "high" | "medium" }[] = [];
          let score = 0;
          const groupName = groupNameMap.get(gc.group_id) || "Koncern";

          if (gc.awaiting_reply_from === "advisor") {
            reasons.push({ label: "Ulæst besked fra koncern", urgency: "high" });
            score += 100;
          }
          if (gc.follow_up_at && new Date(gc.follow_up_at) <= now) {
            const d = new Date(gc.follow_up_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
            reasons.push({ label: `Opfølgning forfalden (${d})`, urgency: "medium" });
            score += 50;
          }

          if (score === 0) return null;

          const assignedAdvisor = advisorProfiles.find((a: any) => a.user_id === gc.assigned_advisor_id);
          return {
            company: {
              company_id: `group_${gc.group_id}`,
              company_name: groupName,
              logo_url: null,
            },
            reasons,
            score,
            assigned_advisor_id: gc.assigned_advisor_id ?? null,
            assigned_advisor_name: assignedAdvisor?.full_name ?? null,
          };
        })
        .filter(Boolean) as typeof priorityItems;

      // Group sparring items
      const groupSparringItems = groupConvsMapped
        .filter((gc: any) => !groupPriorityItems.some(p => p.company.company_id === `group_${gc.group_id}`))
        .map((gc: any) => {
          const signals: { label: string; hint: string }[] = [];
          const groupName = groupNameMap.get(gc.group_id) || "Koncern";

          const monthKey = `${now.getFullYear()}-${now.getMonth()}-${Math.floor(now.getDate() / 7)}`;
          const hash = (gc.group_id + monthKey).split("").reduce((a: number, ch: string) => a + ch.charCodeAt(0), 0);
          if (hash % 4 === 0) {
            signals.push({
              label: "Proaktiv sparring",
              hint: "Ingen akutte signaler — god anledning til at tjekke ind med koncernen",
            });
          }

          if (signals.length === 0) return null;
          const assignedAdvisor = advisorProfiles.find(a => a.user_id === gc.assigned_advisor_id);
          return {
            company: { company_id: `group_${gc.group_id}`, company_name: groupName, logo_url: null },
            signals,
            assigned_advisor_id: gc.assigned_advisor_id ?? null,
            assigned_advisor_name: assignedAdvisor?.full_name ?? null,
          };
        })
        .filter(Boolean) as typeof sparringItems;

      const allPriorityItems = [...priorityItems, ...groupPriorityItems]
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      const allSparringItems = [...sparringItems, ...groupSparringItems].slice(0, 15);

      const groupedCompanyIds = new Set<string>(
        ((groupCompaniesRes as any)?.data || []).map((r: any) => r.company_id)
      );



      return {
        actionQueue, overdueFollowUps, upcomingFollowUps,
        investorSummaries, companyMap, activityFeed, convByCompany,
        priorityItems: allPriorityItems, advisorProfiles, sparringItems: allSparringItems,
        allConversations, groupedCompanyIds, companyToUser, companies, legatCompanyIds,
        companyMemberNameMap,
        recentReportsData: (recentReportsRes.data || []) as { id: string; company_id: string }[],
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
  const priorityItems = data?.priorityItems || [];
  const advisorProfiles = data?.advisorProfiles || [];
  const sparringItems = data?.sparringItems || [];

  const hasFollowUps = overdueFollowUps.length > 0 || upcomingFollowUps.length > 0;

  // KPI aggregates
  const total = investorSummaries.length;
  const reportedThisMonth = investorSummaries.filter(c => c.has_verified_metrics && !c.missing_current_period).length;

  // Build a map using ALL conversations (not just open) for assignment tracking
  const allConvsByCompany = useMemo(() => {
    const m = new Map<string, ConversationRow>();
    for (const conv of (data?.allConversations || [])) {
      if (!conv.company_id) continue;
      // Prefer a conversation that has an assigned_advisor_id
      const existing = m.get(conv.company_id);
      if (!existing || (!existing.assigned_advisor_id && conv.assigned_advisor_id)) {
        m.set(conv.company_id, conv);
      }
    }
    return m;
  }, [data?.allConversations]);

  const groupedCompanyIds = data?.groupedCompanyIds || new Set<string>();

  // Count assigned conversations per advisor (companies + groups)
  const latestConvs = investorSummaries
    .map((company) => allConvsByCompany.get(company.company_id))
    .filter((conv): conv is ConversationRow => !!conv);

  // Add group conversations to assignment tracking
  const groupConvsForCounting = (data?.allConversations || [])
    .filter(c => c.company_id?.startsWith("group_"));

  const allTrackedConvs = [...latestConvs, ...groupConvsForCounting];

  const assignmentCounts = allTrackedConvs.reduce((acc, conv) => {
    if (conv.assigned_advisor_id) {
      acc[conv.assigned_advisor_id] = (acc[conv.assigned_advisor_id] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const myAssignments = assignmentCounts[user?.id || ""] || 0;
  const totalAssigned = Object.values(assignmentCounts).reduce((s, n) => s + n, 0);

  // Unassigned: company convs without advisor (excluding grouped companies) + group convs without advisor
  const unassignedCompanies = investorSummaries.filter(c =>
    !groupedCompanyIds.has(c.company_id) &&
    !allConvsByCompany.get(c.company_id)?.assigned_advisor_id
  ).length;

  const unassignedGroups = groupConvsForCounting.filter(
    c => !c.assigned_advisor_id
  ).length;

  const unassignedCount = unassignedCompanies + unassignedGroups;

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

  // Smart company click — navigate to chat for message/alert reasons
  const getCompanyConvId = (companyId: string): string | null => {
    return convByCompany.get(companyId)?.[0]?.id ?? null;
  };

  const handleAdvisorCompanyClick = (companyId: string, companyName: string, reason?: string) => {
    // Group conversations — navigate directly to group chat
    if (companyId.startsWith("group_")) {
      const groupConvId = data?.allConversations?.find(c => c.company_id === companyId)?.id;
      if (groupConvId) navigate(`/chat?conversationId=${groupConvId}`);
      return;
    }

    // Chat-specific reasons — navigate directly to chat
    const isChatReason = reason && (
      reason.includes("besked") ||
      reason.includes("advisor_replied") ||
      reason.includes("chat")
    );
    if (isChatReason) {
      const convId = getCompanyConvId(companyId);
      if (convId) {
        navigate(`/chat?conversationId=${convId}`);
        return;
      }
    }

    // Report review reason — navigate to reports
    if (reason?.includes("godkendelse")) {
      navigate("/reports");
      return;
    }

    // Default: navigate to MemberDetail for full company overview
    const userId = data?.companyToUser?.get(companyId);
    if (userId) {
      navigate(`/members/${userId}`);
      return;
    }

    // Fallback to chat if no user found
    const convId = getCompanyConvId(companyId);
    if (convId) navigate(`/chat?conversationId=${convId}`);
  };

  // Member list state
  const [memberSearch, setMemberSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<"alle" | "ubesvaret" | "aktive" | "passive">("alle");
  const [memberView, setMemberView] = useState<"table" | "cards">("table");
  const [showAllQueue, setShowAllQueue] = useState(false);

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
      const scoreA =
        (a.unreadMessages > 0 ? 100 : 0) +
        (a.needsAttention ? 50 : 0) +
        (a.missing_current_period ? 20 : 0) +
        (a.revenueTrendPct != null && a.revenueTrendPct < -15 ? 30 : 0);
      const scoreB =
        (b.unreadMessages > 0 ? 100 : 0) +
        (b.needsAttention ? 50 : 0) +
        (b.missing_current_period ? 20 : 0) +
        (b.revenueTrendPct != null && b.revenueTrendPct < -15 ? 30 : 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.company_name.localeCompare(b.company_name, "da");
    });
  }, [investorSummaries, memberSearch, memberFilter]);

  const unbesvaredCount = investorSummaries.filter(c => c.unreadMessages > 0).length;
  const showKpiColumn = filteredMembers.filter(c => c.kpiTargets.length > 0).length / Math.max(1, filteredMembers.length) >= 0.2;


  const handleAssignAdvisor = async (companyId: string, advisorUserId: string | null) => {
    const conv = convByCompany.get(companyId)?.[0];
    if (!conv) return;
    await supabase.from("conversations")
      .update({ assigned_advisor_id: advisorUserId })
      .eq("id", conv.id);
    queryClient.invalidateQueries({ queryKey: ["advisor-dashboard"] });
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
    <div className="space-y-6">
      {/* Section 1: Action list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-chart-warning" />
            Kræver handling
          </h2>
          {/* Advisor distribution — moved here, compact */}
          <div className="flex items-center gap-1.5">
            {advisorProfiles.map(a => {
              const count = assignmentCounts[a.user_id] || 0;
              const isMe = a.user_id === user?.id;
              return (
                <span key={a.user_id} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isMe ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {a.full_name.split(" ")[0]} {count}
                </span>
              );
            })}
            {unassignedCount > 0 && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                {unassignedCount} uden ejer
              </span>
            )}
          </div>
        </div>
        {priorityItems.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/30 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            Ingen virksomheder kræver handling lige nu
          </div>
        ) : (
          <div className="glass-card rounded-xl divide-y divide-border/30 overflow-hidden">
            {priorityItems.slice(0, 15).map(item => {
              const primaryReason = item.reasons[0];
              const label = primaryReason?.label || "";
              const isDirectChatReason = label.includes("besked") || label.includes("Opfølgning") || label.includes("pulse");
              const isReportReason = label.includes("godkendelse");
              const convId = convByCompany.get(item.company.company_id)?.[0]?.id;
              const userId = data?.companyToUser?.get(item.company.company_id);
              const recentReportId = (data?.recentReportsData || []).find((r: any) => r.company_id === item.company.company_id)?.id;
              return (
                <div key={item.company.company_id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
                  <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                    {item.company.logo_url
                      ? <img src={item.company.logo_url} alt="" className="h-full w-full object-contain" />
                      : <span className="text-[9px] font-bold text-muted-foreground">{item.company.company_name.slice(0, 2).toUpperCase()}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.company.company_name}</p>
                    <p className={`text-[11px] truncate ${primaryReason?.urgency === "high" ? "text-destructive" : "text-chart-warning"}`}>
                      {primaryReason?.label}
                    </p>
                  </div>
                  {item.assigned_advisor_name && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                      {item.assigned_advisor_name.split(" ")[0]}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isDirectChatReason && convId && (
                      <button
                        onClick={() => navigate(`/chat?conversationId=${convId}`)}
                        className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Åbn chat
                      </button>
                    )}
                    {isReportReason && userId && (
                      <button
                        onClick={() => navigate(
                          recentReportId
                            ? `/members/${userId}?reportId=${recentReportId}&section=reports`
                            : `/members/${userId}?section=reports`
                        )}
                        className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Se rapport
                      </button>
                    )}
                    {!isDirectChatReason && !isReportReason && convId && (
                      <button
                        onClick={() => navigate(`/chat?conversationId=${convId}`)}
                        className="text-[10px] font-medium px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-muted-foreground"
                      >
                        Åbn chat
                      </button>
                    )}
                    {userId && (
                      <button
                        onClick={() => navigate(`/members/${userId}`)}
                        className="text-[10px] font-medium px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-muted-foreground"
                      >
                        Se virksomhed
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Proaktiv sparring */}
        {sparringItems.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              Proaktiv sparring
            </p>
            <div className="glass-card rounded-xl divide-y divide-border/30 overflow-hidden">
              {sparringItems.slice(0, 8).map(item => {
                const primarySignal = item.signals[0];
                const convId = convByCompany.get(item.company.company_id)?.[0]?.id;
                const userId = data?.companyToUser?.get(item.company.company_id);
                return (
                  <div key={item.company.company_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors">
                    <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                      {item.company.logo_url
                        ? <img src={item.company.logo_url} alt="" className="h-full w-full object-contain" />
                        : <span className="text-[9px] font-bold text-muted-foreground">{item.company.company_name.slice(0, 2).toUpperCase()}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.company.company_name}</p>
                      {primarySignal && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          <span className="text-primary/80">{primarySignal.label}</span>
                          {primarySignal.hint && <span> — {primarySignal.hint}</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {convId && (
                        <button
                          onClick={() => navigate(`/chat?conversationId=${convId}`)}
                          className="text-[10px] font-medium px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-muted-foreground"
                        >
                          Åbn chat
                        </button>
                      )}
                      {userId && (
                        <button
                          onClick={() => navigate(`/members/${userId}`)}
                          className="text-[10px] font-medium px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-muted-foreground"
                        >
                          Se virksomhed
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Portfolio table */}
      <div id="member-list">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-foreground">Alle virksomheder</h2>
          <div className="flex items-center gap-1 sm:ml-4">
            {(["alle", "ubesvaret", "aktive", "passive"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setMemberFilter(tab)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  memberFilter === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {tab === "alle" ? "Alle" : tab === "ubesvaret" ? "Ubesvaret" : tab === "aktive" ? "Aktive" : "Passive"}
                {tab === "ubesvaret" && unbesvaredCount > 0 && <span className="ml-1 opacity-70">({unbesvaredCount})</span>}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="Søg virksomhed..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border bg-secondary/50 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left py-2 px-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Virksomhed</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Person</th>
                <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Rapport</th>
                <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Trend</th>
                <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Engagement</th>
                <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Advisor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filteredMembers.map(c => {
                const hasCurrentReport = c.effective_period_key != null && !c.missing_current_period;
                const hasPulse30 = !!c.latestPulse && new Date(c.latestPulse.created_at) > new Date(Date.now() - 30 * 86400000);
                const hasChat = !!convByCompany.get(c.company_id)?.[0]?.last_member_message_at;
                const hasMilestones = c.milestones.length > 0;
                const hasKpiTargets = c.kpiTargets.length > 0;
                const userId = data?.companyToUser?.get(c.company_id);
                const conv = allConvsByCompany.get(c.company_id);
                const assignedName = advisorProfiles.find(a => a.user_id === conv?.assigned_advisor_id)?.full_name;

                return (
                  <tr
                    key={c.company_id}
                    className="hover:bg-accent/20 transition-colors cursor-pointer group"
                    onClick={() => {
                      if (c.unreadMessages > 0) {
                        handleAdvisorCompanyClick(c.company_id, c.company_name, "besked");
                      } else if (userId) {
                        navigate(`/members/${userId}`);
                      }
                    }}
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                          {c.logo_url
                            ? <img src={c.logo_url} alt="" className="h-full w-full object-contain" />
                            : <span className="text-[9px] font-bold text-muted-foreground">{c.company_name.slice(0, 2).toUpperCase()}</span>
                          }
                        </div>
                        <p className="text-xs font-medium text-foreground truncate max-w-[140px]">{c.company_name}</p>
                        {c.unreadMessages > 0 && (
                          <span className="h-4 min-w-[16px] px-1 rounded-full bg-chart-warning text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                            {c.unreadMessages}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 hidden sm:table-cell">
                      <p className="text-[11px] text-muted-foreground truncate max-w-[100px]">
                        {data?.companyMemberNameMap?.get(c.company_id) || "—"}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      {hasCurrentReport ? (
                        <span className="text-[10px] text-primary font-medium">{c.effective_period_label}</span>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-medium">Mangler</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center hidden md:table-cell">
                      {c.revenueTrendPct != null ? (
                        <span className={`text-xs font-semibold ${c.revenueTrendPct > 5 ? "text-primary" : c.revenueTrendPct < -5 ? "text-destructive" : "text-muted-foreground"}`}>
                          {c.revenueTrendPct > 0 ? "↑" : c.revenueTrendPct < 0 ? "↓" : "→"}{Math.min(200, Math.abs(c.revenueTrendPct)).toFixed(0)}%
                        </span>
                      ) : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-1">
                        {[
                          { active: hasCurrentReport, color: "bg-primary", title: "Rapport" },
                          { active: hasPulse30, color: "bg-chart-info", title: "Pulse" },
                          { active: hasChat, color: "bg-purple-500", title: "Chat" },
                          { active: hasMilestones, color: "bg-chart-warning", title: "Milestones" },
                          { active: hasKpiTargets, color: "bg-teal-500", title: "KPI mål" },
                        ].map((dot, i) => (
                          <div key={i} title={dot.title} className={`h-2 w-2 rounded-full ${dot.active ? dot.color : "bg-muted-foreground/15"}`} />
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right hidden sm:table-cell">
                      {assignedName ? (
                        <span className="text-[10px] font-medium text-muted-foreground">{assignedName.split(" ")[0]}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/30">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredMembers.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">Ingen virksomheder matcher filteret</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 mt-2 px-1">
          <p className="text-[9px] text-muted-foreground">Engagement-dots: Rapport · Pulse · Chat · Milestones · KPI mål</p>
          <span className="text-[9px] text-muted-foreground ml-auto">{filteredMembers.length} virksomheder</span>
        </div>
      </div>
    </div>
  );
};

export default AdvisorDashboard;
