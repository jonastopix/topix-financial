import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { isConversationActionable } from "@/lib/advisorActionHelpers";
import { computeMembershipTier } from "@/lib/membershipTier";
import {
  MessageSquare, Clock, Building2, ChevronRight, CheckCircle2,
  Activity, Target, Search, List, LayoutGrid, UserCheck, Heart, AlertTriangle, Sparkles,
  MoreHorizontal,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DANISH_MONTHS, REPORT_OVERRIDE_SELECT, getEffectiveReportPeriodKey, getEffectiveKeyFigures, formatCompact, type ReportData } from "@/lib/financialUtils";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import type { GroupCompanySummary } from "@/lib/groupDashboardUtils";
import KPICard from "@/components/KPICard";
import AdvisorBroadcast from "@/components/AdvisorBroadcast";
import AdvisorAlertsPanel from "@/components/AdvisorAlertsPanel";

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
  unreadAgentMessages: number;
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
              Refleksion ✓
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
        unreadAgentMsgsRes, recentHandoutsRes,
      ] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, company_id, awaiting_reply_from, assigned_advisor_id, conversation_status, follow_up_at, last_member_message_at, last_message_at, acknowledged_at")
          .order("last_message_at", { ascending: false }),
        supabase
          .from("companies")
          .select("id, name, logo_url, is_legat, contract_end_date, subscription_status, subscription_current_period_end")
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
        supabase
          .from("messages")
          .select("conversation_id")
          .is("read_at", null)
          .eq("message_type", "system")
          .eq("context_type", "agent")
          .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
        // Bunke 5: nyligt fuldførte handouts (status='completed', completed_at >= 14 dage)
        (supabase
          .from("handouts")
          .select("user_id, module, completed_at")
          .eq("status", "completed")
          .gte("completed_at", twoWeeksAgo)
          .order("completed_at", { ascending: false })
          .limit(100) as any),
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

      // Recently completed handouts (last 14 days) by company. Handouts er user-nøglede,
      // så vi mapper user_id -> company_id via det eksisterende userToCompany. Nyeste pr. company.
      const recentlyCompletedHandoutsByCompany = new Map<string, { module: string; completed_at: string }>();
      for (const h of ((recentHandoutsRes as any)?.data || []) as any[]) {
        const companyId = userToCompany.get(h.user_id);
        if (companyId && !recentlyCompletedHandoutsByCompany.has(companyId)) {
          recentlyCompletedHandoutsByCompany.set(companyId, { module: h.module, completed_at: h.completed_at });
        }
      }

      // Unread messages per company
      const unreadByCompany = new Map<string, number>();
      for (const c of conversations) {
        if (c.company_id && c.awaiting_reply_from === "advisor") {
          unreadByCompany.set(c.company_id, (unreadByCompany.get(c.company_id) || 0) + 1);
        }
      }

      // Unread agent messages per company
      const unreadAgentByCompany = new Map<string, number>();
      const convIdToCompanyId = new Map<string, string>();
      for (const c of conversations) {
        if (c.company_id && c.id) convIdToCompanyId.set(c.id, c.company_id);
      }
      for (const msg of (unreadAgentMsgsRes.data || []) as any[]) {
        const compId = convIdToCompanyId.get(msg.conversation_id);
        if (compId) unreadAgentByCompany.set(compId, (unreadAgentByCompany.get(compId) || 0) + 1);
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
          unreadAgentMessages: unreadAgentByCompany.get(c.id) || 0,
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

      // Fetch recent unread financial alerts (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: alertsData } = await supabase
        .from("notifications")
        .select("company_id, type, title, created_at")
        .in("type", ["alert_revenue_drop", "alert_negative_cash", "alert_result_negative"])
        .is("read_at", null)
        .gte("created_at", thirtyDaysAgo);
      const alertsByCompany = new Map<string, { type: string; title: string }[]>();
      for (const alert of alertsData ?? []) {
        if (!alert.company_id) continue;
        if (!alertsByCompany.has(alert.company_id)) alertsByCompany.set(alert.company_id, []);
        alertsByCompany.get(alert.company_id)!.push({ type: alert.type, title: alert.title });
      }

      // ── Holdbar, virksomheds-bred kvittering (advisor_company_acknowledgments) ──
      // Hent denne advisors kvitteringer. RLS scoper allerede til auth.uid; eksplicit
      // .eq for klarhed. Gælder VIRKSOMHEDEN, så den dækker alle action-bunker.
      const { data: acksData } = await (supabase
        .from("advisor_company_acknowledgments" as any)
        .select("company_id, snoozed_until, basis_at")
        .eq("advisor_id", user!.id) as any);
      const ackByCompany = new Map<string, { snoozed_until: string | null; basis_at: string }>();
      for (const a of ((acksData as any[]) || [])) {
        ackByCompany.set(a.company_id, { snoozed_until: a.snoozed_until, basis_at: a.basis_at });
      }

      // Nyeste signal-tidsstempel pr. virksomhed (til "klaret indtil noget nyt").
      // max af: seneste medlems-besked, ny committed fact, ny upload, ny alert.
      // (Agent-beskeder hentes uden created_at; deres friskhed proxies af committed_at,
      // da AI-indsigt genereres ved commit.)
      const newestSignalAtByCompany = new Map<string, number>();
      const bumpSignal = (companyId: string | null | undefined, ts: string | null | undefined) => {
        if (!companyId || !ts) return;
        const ms = new Date(ts).getTime();
        if (Number.isNaN(ms)) return;
        const cur = newestSignalAtByCompany.get(companyId);
        if (cur == null || ms > cur) newestSignalAtByCompany.set(companyId, ms);
      };
      for (const c of conversations) bumpSignal(c.company_id, c.last_member_message_at);
      for (const f of ((recentFactsRes.data as any[]) || [])) bumpSignal(f.company_id, f.committed_at);
      for (const r of ((recentReportsRes.data as any[]) || [])) bumpSignal(r.company_id, r.uploaded_at);
      for (const a of ((alertsData as any[]) || [])) bumpSignal(a.company_id, a.created_at);

      // Skjul-gate: en virksomhed skjules fra action-bunkerne hvis (a) snooze-vinduet
      // er aktivt, eller (b) den er "klaret" og intet signal er NYERE end basis_at.
      // Rører IKKE unreadMessages/awaiting_reply_from, kun action-bunkerne gates.
      const acknowledgedHiddenCompanyIds = new Set<string>();
      for (const [companyId, ack] of ackByCompany) {
        if (ack.snoozed_until && new Date(ack.snoozed_until).getTime() > now.getTime()) {
          acknowledgedHiddenCompanyIds.add(companyId); // "Påmind"-vindue aktivt
          continue;
        }
        if (!ack.snoozed_until) {
          const newest = newestSignalAtByCompany.get(companyId) ?? 0;
          if (newest <= new Date(ack.basis_at).getTime()) {
            acknowledgedHiddenCompanyIds.add(companyId); // "Klaret", intet nyt sket
          }
        }
      }

      // Udløbs-gate: skjul tier === "expired" fra dagligt arbejde (display-niveau).
      // Selvstændigt Set, ortogonalt til acknowledgedHiddenCompanyIds; rører ikke
      // kilden, så investorSummaries/companyMap/tællere forbliver hele. no_date/full/
      // subscriber beholdes (fail-open, test !== "expired").
      const expiredCompanyIds = new Set<string>();
      for (const c of (companies as any[])) {
        if (computeMembershipTier({
          contract_end_date: c.contract_end_date,
          subscription_status: c.subscription_status,
          subscription_current_period_end: c.subscription_current_period_end,
        }) === "expired") {
          expiredCompanyIds.add(c.id);
        }
      }

      // Priority queue — score each company
      // ── Fem handlingsbunker (afløser den ene scorede liste + proaktiv sparring) ──
      // ÉN gennemløbning af investorSummaries udleder bunke-medlemskab pr. virksomhed
      // (kan stå i FLERE). Begge gates anvendes ÉN gang på virksomheds-sættet, så en
      // kvitteret/udløbet virksomhed forsvinder fra ALLE fem bunker.
      const MODULE_LABELS: Record<string, string> = {
        overordnet: "Overordnet", bogholderi: "Bogholderi", administration: "Administration",
        salg: "Salg", marketing: "Marketing",
      };
      type BucketItem = {
        company: { company_id: string; company_name: string; logo_url: string | null };
        subtext: string;
        assigned_advisor_id: string | null;
        assigned_advisor_name: string | null;
        sortValue: number;
        isGroup?: boolean;
      };
      const bWaiting: BucketItem[] = [];
      const bFresh: BucketItem[] = [];
      const bStale: BucketItem[] = [];
      const bStandsOut: BucketItem[] = [];
      const bPositive: BucketItem[] = [];

      for (const c of investorSummaries) {
        // Gates: spring kvitterede + udløbede over (dækker alle fem bunker)
        if (acknowledgedHiddenCompanyIds.has(c.company_id)) continue;
        if (expiredCompanyIds.has(c.company_id)) continue;

        const conv = convByCompany.get(c.company_id)?.[0];
        const base = {
          company: { company_id: c.company_id, company_name: c.company_name, logo_url: c.logo_url },
          assigned_advisor_id: conv?.assigned_advisor_id ?? null,
          assigned_advisor_name: advisorProfiles.find(a => a.user_id === conv?.assigned_advisor_id)?.full_name ?? null,
        };

        // Bunke 1: Venter på dit svar (ulæst besked ELLER opfølgning forfalden)
        if (c.unreadMessages > 0) {
          bWaiting.push({ ...base, subtext: `${c.unreadMessages} ulæst${c.unreadMessages > 1 ? "e" : ""} besked${c.unreadMessages > 1 ? "er" : ""}`, sortValue: c.unreadMessages });
        } else if (conv?.follow_up_at && new Date(conv.follow_up_at) <= now) {
          const d = new Date(conv.follow_up_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
          bWaiting.push({ ...base, subtext: `Opfølgning forfalden (${d})`, sortValue: 0 });
        }

        // Bunke 2: Friske tal (committet rapport inden for 14 dage, T8)
        const freshFact = (recentFactsRes.data || []).find((f: any) => f.company_id === c.company_id && f.committed_at >= twoWeeksAgo);
        if (freshFact) {
          bFresh.push({ ...base, subtext: `Ny rapport for ${c.effective_period_label || "seneste periode"}`, sortValue: new Date(freshFact.committed_at).getTime() });
        }

        // Bunke 3: Ikke hørt fra længe (>21 dage, kun virksomheder med data, T12)
        const lastContact = conv?.last_message_at;
        const daysSinceContact = lastContact ? Math.floor((now.getTime() - new Date(lastContact).getTime()) / 86400000) : 999;
        if (c.has_verified_metrics && lastContact && daysSinceContact > 21) {
          bStale.push({ ...base, subtext: `Ingen dialog i ${daysSinceContact} dage`, sortValue: daysSinceContact });
        }

        // Bunke 4: Stikker ud i tallene (bankovertræk / omsætningsdyk / alerts)
        {
          const reasons: string[] = [];
          let severity = 0;
          if (c.cash != null && c.cash < 0) { reasons.push("Bankovertræk"); severity = Math.max(severity, 90); }
          if (c.revenueTrendPct != null && c.revenueTrendPct <= -15) { reasons.push(`Omsætning faldt ${Math.abs(Math.round(c.revenueTrendPct))}% MoM`); severity = Math.max(severity, 80); }
          const alerts = alertsByCompany.get(c.company_id) ?? [];
          if (alerts.some(a => a.type === "alert_result_negative")) { reasons.push("Negativt resultat"); severity = Math.max(severity, 60); }
          if (reasons.length === 0 && alerts.some(a => a.type === "alert_revenue_drop")) { reasons.push("Omsætningsfald detekteret"); severity = Math.max(severity, 75); }
          if (reasons.length > 0) {
            bStandsOut.push({ ...base, subtext: reasons.join(" · "), sortValue: severity });
          }
        }

        // Bunke 5: Positive muligheder (opnået milestone / nyt handout / kraftig vækst)
        {
          const positives: string[] = [];
          let freshness = 0;
          const ms = recentlyCompletedMilestones.get(c.company_id);
          if (ms) { positives.push(`Milestone nået: ${ms}`); freshness = Math.max(freshness, 1); }
          const ho = recentlyCompletedHandoutsByCompany.get(c.company_id);
          if (ho) { positives.push(`Udfyldte handout: ${MODULE_LABELS[ho.module] || ho.module}`); freshness = Math.max(freshness, new Date(ho.completed_at).getTime()); }
          if (c.revenueTrendPct != null && c.revenueTrendPct >= 10) { positives.push(`Omsætning steg ${Math.round(c.revenueTrendPct)}% MoM`); freshness = Math.max(freshness, 1); }
          if (positives.length > 0) {
            bPositive.push({ ...base, subtext: positives.join(" · "), sortValue: freshness });
          }
        }
      }

      // Koncern-samtaler → bunke 1 (venter). Company-gates gælder ikke koncerner.
      for (const gc of groupConvsMapped as any[]) {
        const groupName = groupNameMap.get(gc.group_id) || "Koncern";
        const gBase = {
          company: { company_id: `group_${gc.group_id}`, company_name: groupName, logo_url: null },
          assigned_advisor_id: gc.assigned_advisor_id ?? null,
          assigned_advisor_name: advisorProfiles.find((a: any) => a.user_id === gc.assigned_advisor_id)?.full_name ?? null,
          isGroup: true,
        };
        if (gc.awaiting_reply_from === "advisor") {
          bWaiting.push({ ...gBase, subtext: "Ulæst besked fra koncern", sortValue: 1 });
        } else if (gc.follow_up_at && new Date(gc.follow_up_at) <= now) {
          const d = new Date(gc.follow_up_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
          bWaiting.push({ ...gBase, subtext: `Opfølgning forfalden (${d})`, sortValue: 0 });
        }
      }

      const bySortDesc = (a: BucketItem, b: BucketItem) => b.sortValue - a.sortValue;
      const buckets = {
        waiting: bWaiting.sort(bySortDesc),
        fresh: bFresh.sort(bySortDesc),
        stale: bStale.sort(bySortDesc),
        standsOut: bStandsOut.sort(bySortDesc),
        positive: bPositive.sort(bySortDesc),
      };

      const groupedCompanyIds = new Set<string>(
        ((groupCompaniesRes as any)?.data || []).map((r: any) => r.company_id)
      );



      return {
        actionQueue, overdueFollowUps, upcomingFollowUps,
        investorSummaries, companyMap, activityFeed, convByCompany, newestSignalAtByCompany, expiredCompanyIds,
        buckets, advisorProfiles,
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
  const expiredCompanyIds: Set<string> = data?.expiredCompanyIds || new Set<string>();
  const companyMap = data?.companyMap || new Map();
  const activityFeed = data?.activityFeed || [];
  const convByCompany = data?.convByCompany || new Map<string, ConversationRow[]>();
  const buckets = data?.buckets || { waiting: [], fresh: [], stale: [], standsOut: [], positive: [] };
  const advisorProfiles = data?.advisorProfiles || [];

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

    // Report review reason — navigate to member's specific report
    if (reason?.includes("godkendelse")) {
      const userId = data?.companyToUser?.get(companyId);
      const recentReport = (data?.recentReportsData || []).find((r: any) => r.company_id === companyId);
      if (userId) {
        navigate(recentReport?.id
          ? `/members/${userId}?reportId=${recentReport.id}&section=reports`
          : `/members/${userId}?section=reports`
        );
      }
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
  const [dismissedItems, setDismissedItems] = useState(() => new Set<string>());

  const dismissItem = (companyId: string) => {
    setDismissedItems(prev => new Set([...prev, companyId]));
  };

  // Holdbar, virksomheds-bred kvittering. Afløser den kosmetiske dismissItem som
  // sandhed (dismissItem beholdes kun som optimistisk umiddelbar skjul).
  //   mode "cleared"   → "Klaret indtil noget nyt" (snoozed_until = null)
  //   mode { days: N } → "Påmind om N dage" (snoozed_until = nu + N dage)
  // basis_at = nyeste signal-tidsstempel netop nu, så "klaret" slipper virksomheden
  // fri igen når et NYERE signal opstår.
  const acknowledgeCompany = async (companyId: string, mode: "cleared" | { days: number }) => {
    if (!user) return;
    const basisMs = data?.newestSignalAtByCompany?.get(companyId);
    const basis_at = basisMs ? new Date(basisMs).toISOString() : new Date().toISOString();
    const snoozed_until = mode === "cleared"
      ? null
      : new Date(Date.now() + mode.days * 86400000).toISOString();
    dismissItem(companyId); // optimistisk: skjul straks; DB er sandheden
    const { error } = await (supabase
      .from("advisor_company_acknowledgments" as any)
      .upsert({
        advisor_id: user.id,
        company_id: companyId,
        snoozed_until,
        basis_at,
        acknowledged_at: new Date().toISOString(),
      } as any, { onConflict: "advisor_id,company_id" }) as any);
    if (error) {
      toast.error("Kunne ikke gemme kvitteringen", { description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["advisor-dashboard"] });
  };

  const filteredMembers = useMemo(() => {
    let list = [...investorSummaries];
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      list = list.filter(c => c.company_name.toLowerCase().includes(q));
    } else {
      // Skjul udløbede fra den u-søgte default-liste; aktiv søgning afslører dem.
      list = list.filter(c => !expiredCompanyIds.has(c.company_id));
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
  }, [investorSummaries, memberSearch, memberFilter, expiredCompanyIds]);

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
        {(() => {
          const BUCKET_DEFS = [
            { key: "waiting", title: "Venter på dit svar", items: buckets.waiting },
            { key: "fresh", title: "Friske tal, fortjener sparring", items: buckets.fresh },
            { key: "stale", title: "Ikke hørt fra længe", items: buckets.stale },
            { key: "standsOut", title: "Noget stikker ud i tallene", items: buckets.standsOut },
            { key: "positive", title: "Positive muligheder", items: buckets.positive },
          ].map(b => ({ ...b, items: (b.items as any[]).filter(it => !dismissedItems.has(it.company.company_id)) }));
          const totalItems = BUCKET_DEFS.reduce((n, b) => n + b.items.length, 0);
          if (totalItems === 0) {
            return (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/30 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                Ingen virksomheder kræver handling lige nu
              </div>
            );
          }
          // Enkel funktionel rendering; det visuelle pass kommer separat.
          return (
            <div className="space-y-4">
              {BUCKET_DEFS.filter(b => b.items.length > 0).map(b => (
                <div key={b.key}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                    {b.title} ({b.items.length})
                  </p>
                  <div className="glass-card rounded-xl divide-y divide-border/30 overflow-hidden">
                    {b.items.map((item: any) => {
                      const convId = convByCompany.get(item.company.company_id)?.[0]?.id;
                      const userId = data?.companyToUser?.get(item.company.company_id);
                      const isGroup = !!item.isGroup;
                      return (
                        <div key={`${b.key}-${item.company.company_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
                          <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                            {item.company.logo_url
                              ? <img src={item.company.logo_url} alt="" className="h-full w-full object-contain" />
                              : <span className="text-[9px] font-bold text-muted-foreground">{item.company.company_name.slice(0, 2).toUpperCase()}</span>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{item.company.company_name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{item.subtext}</p>
                          </div>
                          {item.assigned_advisor_name && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                              {item.assigned_advisor_name.split(" ")[0]}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {convId && (
                              <button
                                onClick={() => navigate(`/chat?conversationId=${convId}`)}
                                className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                Åbn chat
                              </button>
                            )}
                            {userId && !isGroup && (
                              <button
                                onClick={() => navigate(`/members/${userId}`)}
                                className="text-[10px] font-medium px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-muted-foreground"
                              >
                                Se virksomhed
                              </button>
                            )}
                            {!isGroup && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="h-6 w-6 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors flex items-center justify-center text-muted-foreground">
                                    <MoreHorizontal className="h-3 w-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => acknowledgeCompany(item.company.company_id, "cleared")} className="px-3 py-2 text-xs text-left hover:bg-accent/50 transition-colors text-foreground cursor-pointer">
                                    ✓ Klaret, indtil noget nyt
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => acknowledgeCompany(item.company.company_id, { days: 2 })} className="px-3 py-2 text-xs text-left hover:bg-accent/50 transition-colors text-foreground cursor-pointer">
                                    ⏰ Påmind om 2 dage
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => acknowledgeCompany(item.company.company_id, { days: 7 })} className="px-3 py-2 text-xs text-left hover:bg-accent/50 transition-colors text-foreground cursor-pointer">
                                    ⏰ Påmind om 7 dage
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
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
                <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Signal</th>
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
                        const convId = convByCompany.get(c.company_id)?.[0]?.id;
                        if (convId) {
                          navigate(`/chat?conversationId=${convId}`);
                          return;
                        }
                      }
                      if (userId) navigate(`/members/${userId}`);
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
                      <p className="text-[11px] text-foreground truncate max-w-[110px]">
                        {data?.companyMemberNameMap?.get(c.company_id) || "—"}
                      </p>
                      {convByCompany.get(c.company_id)?.[0]?.last_message_at && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {timeAgo(convByCompany.get(c.company_id)?.[0]?.last_message_at ?? null)}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      {hasCurrentReport ? (
                        <span className="text-[10px] text-primary font-medium">{c.effective_period_label}</span>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-medium">Mangler</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-1">
                        {c.unreadMessages > 0 && (
                          <span className="h-4 min-w-[16px] px-1 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center" title="Ulæste beskeder">
                            {c.unreadMessages}
                          </span>
                        )}
                        {!hasCurrentReport && (
                          <span className="text-[9px] font-medium text-amber-600 px-1.5 py-0.5 rounded bg-amber-500/10" title="Mangler rapport">
                            !
                          </span>
                        )}
                        {hasCurrentReport && hasPulse30 && c.revenueTrendPct != null && (
                          <span className={`text-[10px] font-semibold ${c.revenueTrendPct > 5 ? "text-primary" : c.revenueTrendPct < -5 ? "text-destructive" : "text-muted-foreground"}`}>
                            {c.revenueTrendPct > 0 ? "↑" : c.revenueTrendPct < 0 ? "↓" : "→"}{Math.min(200, Math.abs(c.revenueTrendPct)).toFixed(0)}%
                          </span>
                        )}
                        {!c.unreadMessages && hasCurrentReport && !hasPulse30 && (
                          <span className="text-[9px] text-muted-foreground/40">OK</span>
                        )}
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
                <tr><td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">Ingen virksomheder matcher filteret</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 mt-2 px-1">
          <span className="text-[9px] text-muted-foreground ml-auto">{filteredMembers.length} virksomheder</span>
        </div>
      </div>
    </div>
  );
};

export default AdvisorDashboard;
