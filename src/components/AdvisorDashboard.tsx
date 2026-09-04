import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as Sentry from "@sentry/react";
import { useAuth } from "@/hooks/useAuth";
import { computeMembershipTier } from "@/lib/membershipTier";
import { afgoerVirksomhedsSignaler, isFiguresFresh, type FactPunkt, type VirksomhedsInput } from "@/lib/virksomhedsSignaler";
import {
  MessageSquare, Clock, Building2, ChevronRight, CheckCircle2,
  Activity, Target, Search, List, LayoutGrid, UserCheck, Heart, AlertTriangle, Sparkles,
  FileText, Sprout,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { formatCompact } from "@/lib/financialUtils";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { momErGyldig, type DataBasis } from "@/lib/dataGrundlag";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import KPICard from "@/components/KPICard";
import AdvisorBroadcast from "@/components/AdvisorBroadcast";
import AdvisorAlertsPanel from "@/components/AdvisorAlertsPanel";

// ── Helpers ──

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  return formatDistanceToNow(new Date(dateStr), { locale: da, addSuffix: true });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function getMissingReportKey(): string {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  return `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
}

// isFiguresFresh er flyttet ordret til src/lib/virksomhedsSignaler.ts (#589)
// og importeres derfra — bunke «positive» nedenfor bruger den stadig.

// ── Types ──

interface ConversationRow {
  id: string;
  company_id: string | null;
  awaiting_reply_from: string | null;
  assigned_advisor_id: string | null;
  last_member_message_at: string | null;
  last_message_at: string | null;
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

interface CompanyMetricSummary {
  company_id: string;
  company_name: string;
  logo_url: string | null;
  has_verified_metrics: boolean;
  effective_period_label: string | null;
  effective_period_key: string | null;
  revenue: number | null;
  ebt: number | null;
  cash: number | null;
  missing_current_period: boolean;
}

interface InvestorCompanySummary extends CompanyMetricSummary {
  revenueTrendPct: number | null;
  latestPulse: { went_well: string; biggest_challenge: string; help_needed?: string | null; created_at: string; period_key: string | null } | null;
  needsAttention: boolean;
  unreadMessages: number;
  milestones: MilestoneData[];
  kpiTargets: KpiTargetData[];
  // ── Spor 2-overblik (additivt datalag) ──
  lastActiveAt: string | null;
  reflectionStatus: "with_reflection" | "report_no_reflection" | "no_report";
  goalHandoutDone: boolean;
  isNewMember: boolean;
  expiresAt: string | null;
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
    // Målingen bor i Sentry (browserTracingIntegration, main.tsx:36-42):
    // spannet "advisor-dashboard.load" bærer varigheden selv, og
    // svarstørrelsen sættes som attributten svar_kb. NB: tracesSampleRate
    // er 0,1 — omkring hver TIENDE indlæsning registreres. Det er nok til
    // at se en trend i Performance-visningen, ikke til at fejlsøge en
    // enkelt sag; leder du efter et konkret tal fra en bestemt dag, er det
    // derfor sandsynligvis ikke der.
    queryFn: () =>
      Sentry.startSpan({ name: "advisor-dashboard.load", op: "advisor.query" }, async (span) => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      const [
        convRes, companiesRes, factsRes,
        pulseRes, recentReportsRes,
        milestonesRes, kpiTargetsRes, companyMembersRes, advisorProfilesRes,
        recentMilestonesRes, recentHandoutsRes, companyInvitationsRes, goalHandoutRes,
      ] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, company_id, awaiting_reply_from, assigned_advisor_id, last_member_message_at, last_message_at")
          .order("last_message_at", { ascending: false }),
        supabase
          .from("companies")
          .select("id, name, logo_url, is_legat, contract_end_date, subscription_status, subscription_current_period_end, created_at")
          .order("name"),
        // ÉN KILDE TIL TALLENE (raadgiverfladen-design.md §11 pkt. 1, 4/9):
        // nøgletallene regnes af financial_report_facts, som resten af huset
        // (NoegletalView, virksomhedssiden via useCompanyFacts) — ikke længere
        // af financial_reports. Målt 3/9 kl. 23:56: nul uenigheder hvor begge
        // kilder har en værdi; flytningen ændrer ikke tal, kun hvilke perioder
        // der findes. FORVENTEDE FORSKELLE i drift, begge bevidste:
        //   - forsiden BEGYNDER at bruge estimater fra årsrapporter og
        //     baselines (144 punkter, data_basis = 'estimated') som den ikke
        //     havde — de tæller med som perioder og som seneste tal, og
        //     has_verified_metrics bliver sand for en virksomhed med kun
        //     estimater; M/M gates med momErGyldig nedenfor.
        //   - forsiden HOLDER OP med at bruge rapporter der aldrig blev
        //     committet (Brick Works, april 2026, 1.349.013 kr.).
        // Manuelle overrides (manual_report_period_key/manual_normalized_data)
        // er indregnet ved commit: resolve_report_commit_candidate (migration
        // 20260420190823, gentaget i 20260722130000) tager manual-grenen FØRST
        // og sætter period_key := manual_report_period_key. Derfor er
        // getEffectiveKeyFigures/getEffectiveReportPeriodKey uden aftager her.
        // Hentningen spejler den tidligere rapport-hentnings begrænsninger:
        // alle virksomheder (ingen .eq("company_id") — RLS «Advisors can view
        // all facts» bærer det), intet loft (rapporterne havde heller intet),
        // og kun de kolonner dommene læser (perf/advisor-dashboard-nyttelast).
        // Rapporternes deleted_at/status-filtre har ingen facts-pendant: facts
        // findes kun for committede, processerede rapporter, og hard-delete
        // fjerner dem (companyHardDelete.ts).
        // Aktivitetsfeedets tidligere egen facts-hentning (committed_at >= 14
        // dage, nyeste først, limit 20) er slået sammen med denne — feedets
        // filtre lægges ordret på i kode nedenfor (recentFacts).
        // data_basis-undtagelse: aktivitetsfeedet: viser HVORNÅR der blev committet, ikke talværdier — feed-linjerne er stadig en ufiltreret læser (estimat-markering af feed-linjer hører til visnings-PR'en); nøgletallene fra SAMME hentning læser data_basis og gates med momErGyldig
        (supabase
          .from("financial_report_facts")
          .select("company_id, period_key, period_label, metrics, data_basis, committed_at") as any),
        supabase
          .from("pulse_checkins")
          .select("company_id, period_key, went_well, biggest_challenge, help_needed, created_at")
          .order("created_at", { ascending: false })
          .limit(2000),
        (supabase
          .from("financial_reports")
          .select("id, company_id, uploaded_at, status, report_period")
          .is("deleted_at", null)
          .gte("uploaded_at", weekAgo)
          .order("uploaded_at", { ascending: false })
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
        // Bunke 5: nyligt fuldførte handouts (status='completed', completed_at >= 14 dage)
        (supabase
          .from("handouts")
          .select("user_id, module, completed_at")
          .eq("status", "completed")
          .gte("completed_at", twoWeeksAgo)
          .order("completed_at", { ascending: false })
          .limit(100) as any),
        // Pending-gate: virksomheder med hængende (ikke-accepterede) invitationer.
        (supabase
          .from("company_invitations")
          .select("company_id, status")
          .eq("status", "pending")
          .limit(2000) as any),
        // Spor 2: virksomheder der har udfyldt målsætnings-handoutet (modul 'overordnet').
        (supabase
          .from("handouts")
          .select("company_id, status")
          .eq("module", "overordnet")
          .eq("status", "completed")
          .limit(2000) as any),
      ]);

      const allConversations = (convRes.data || []) as ConversationRow[];
      const companies = (companiesRes.data || []) as CompanyRow[];
      // Facts-rækkerne som de kommer fra tabellen. metrics er kanoniske
      // engelske nøgler — factsToDanishMetrics oversætter til de danske
      // nøgler dommene bruger (omsaetning, resultat_foer_skat, bank_balance),
      // præcis som NoegletalView og useCompanyFacts' paritets-tjek gør.
      // period_key/period_label kommer direkte fra rækken (§11 pkt. 1).
      type FactRaekke = {
        company_id: string;
        period_key: string;
        period_label: string;
        metrics: Record<string, number | null> | null;
        data_basis: DataBasis;
        committed_at: string;
      };
      const facts = (factsRes.data || []) as FactRaekke[];
      // Aktivitetsfeedets udsnit — den tidligere egen hentnings filtre,
      // ordret: committed_at >= 14 dage, nyeste først, højst 20.
      const twoWeeksAgoMs = Date.parse(twoWeeksAgo);
      const recentFacts = facts
        .filter((f) => Date.parse(f.committed_at) >= twoWeeksAgoMs)
        .sort((a, b) => b.committed_at.localeCompare(a.committed_at))
        .slice(0, 20);
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

      // Latest pulse by company
      const latestPulseByCompany = new Map<string, { went_well: string; biggest_challenge: string; help_needed?: string | null; created_at: string; period_key: string | null }>();
      for (const p of (pulseRes.data || []) as any[]) {
        if (!latestPulseByCompany.has(p.company_id)) {
          latestPulseByCompany.set(p.company_id, {
            went_well: p.went_well || "",
            biggest_challenge: p.biggest_challenge || "",
            help_needed: p.help_needed || null,
            created_at: p.created_at,
            period_key: p.period_key ?? null,
          });
        }
      }

      // Alle refleksions-perioder pr. virksomhed (ikke kun den nyeste pulse), så
      // reflectionStatus kan spørge "findes en refleksion for RAPPORTENS periode",
      // uafhængigt af hvilken pulse der er nyest (rapport/refleksion er forskudt i takt).
      const pulsePeriodsByCompany = new Map<string, Set<string>>();
      for (const p of (pulseRes.data || []) as any[]) {
        if (!p.company_id || !p.period_key) continue;
        let set = pulsePeriodsByCompany.get(p.company_id);
        if (!set) { set = new Set<string>(); pulsePeriodsByCompany.set(p.company_id, set); }
        set.add(p.period_key);
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
      for (const c of allConversations) {
        if (c.company_id && c.awaiting_reply_from === "advisor") {
          unreadByCompany.set(c.company_id, (unreadByCompany.get(c.company_id) || 0) + 1);
        }
      }

      // Build report keys per company + KFs by period — af FACTS. Hver
      // periode bærer sit grundlag (data_basis) og sin label med, så M/M-
      // gaten og motoren kan læse dem uden nyt opslag. UNIQUE(company_id,
      // period_key) på facts gør «første vinder»-tjekket fra rapport-vejen
      // overflødigt.
      type PeriodeFact = { kf: Record<string, number>; data_basis: DataBasis; period_label: string };
      const reportKeysByCompany = new Map<string, Set<string>>();
      const kfByCompanyPeriod = new Map<string, Map<string, PeriodeFact>>();
      const latestKfByCompany = new Map<string, { key: string } & PeriodeFact>();

      for (const f of facts) {
        const key = f.period_key;
        if (!key) continue;
        if (!reportKeysByCompany.has(f.company_id)) reportKeysByCompany.set(f.company_id, new Set());
        reportKeysByCompany.get(f.company_id)!.add(key);

        const kf = factsToDanishMetrics(f.metrics);
        if (Object.keys(kf).length === 0) continue;
        const punkt: PeriodeFact = { kf, data_basis: f.data_basis, period_label: f.period_label };

        if (!kfByCompanyPeriod.has(f.company_id)) kfByCompanyPeriod.set(f.company_id, new Map());
        kfByCompanyPeriod.get(f.company_id)!.set(key, punkt);

        const latestExisting = latestKfByCompany.get(f.company_id);
        if (!latestExisting || key > latestExisting.key) {
          latestKfByCompany.set(f.company_id, { key, ...punkt });
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

      // Revenue trend per company — M/M af facts, gated på data_basis.
      // momErGyldig (src/lib/dataGrundlag, samme dom som NoegletalView:783)
      // er sand KUN når begge de to seneste punkter er 'measured'; ellers
      // intet M/M-tal (null). En M/M mod et /12-estimat måler afstanden til
      // en regnekonstruktion, ikke en måneds udvikling.
      // Regnestykket (arvet uændret fra rapport-vejen):
      //   pct = (seneste.omsaetning − forrige.omsaetning) / forrige.omsaetning × 100
      //   kun når begge > 0; ellers null. Nævneren er forrige (ikke abs) —
      //   motoren regner sin egen M/M med abs-nævner (valg 3), det er
      //   bevidst forskelligt og rører ikke denne.
      const revenueTrendByCompany = new Map<string, number | null>();
      for (const [compId, periodMap] of kfByCompanyPeriod) {
        const sortedKeys = [...periodMap.keys()].sort();
        const latest = periodMap.get(sortedKeys[sortedKeys.length - 1]);
        const prev = sortedKeys.length >= 2 ? periodMap.get(sortedKeys[sortedKeys.length - 2]) : undefined;
        if (latest && prev && momErGyldig([prev, latest])) {
          const latestRev = latest.kf.omsaetning;
          const prevRev = prev.kf.omsaetning;
          if (latestRev != null && prevRev != null && latestRev > 0 && prevRev > 0) {
            revenueTrendByCompany.set(compId, ((latestRev - prevRev) / prevRev) * 100);
          } else {
            revenueTrendByCompany.set(compId, null);
          }
        } else {
          revenueTrendByCompany.set(compId, null);
        }
      }

      const now = new Date();

      // ── Spor 2-datalag (additivt) ──
      // Målsætnings-handout udfyldt pr. virksomhed (modul 'overordnet', completed).
      const goalHandoutDoneCompanyIds = new Set<string>(
        (((goalHandoutRes as any)?.data || []) as any[]).map(h => h.company_id).filter(Boolean)
      );

      // Sidst aktiv pr. virksomhed = MAX(last_sign_in_at) over virksomhedens medlemmer
      // (ægte login via get_users_last_login-RPC). Fejl-robust: hvis RPC fejler/tom,
      // forbliver mappet tomt og feltet bliver null; resten af dashboardet braekker ikke.
      const usersByCompany = new Map<string, string[]>();
      for (const m of ((companyMembersRes.data || []) as any[])) {
        if (!m.company_id || !m.user_id) continue;
        const arr = usersByCompany.get(m.company_id) || [];
        arr.push(m.user_id);
        usersByCompany.set(m.company_id, arr);
      }
      const lastActiveByCompany = new Map<string, string>();
      try {
        const allMemberUserIds = [...new Set(((companyMembersRes.data || []) as any[]).map(m => m.user_id).filter(Boolean))];
        if (allMemberUserIds.length > 0) {
          const { data: loginRows } = await supabase.rpc("get_users_last_login" as any, { user_ids: allMemberUserIds });
          const loginByUser = new Map<string, string>();
          for (const row of ((loginRows || []) as any[])) {
            if (row.last_sign_in_at) loginByUser.set(row.user_id, row.last_sign_in_at);
          }
          for (const [companyId, userIds] of usersByCompany) {
            let maxLogin: string | null = null;
            for (const uid of userIds) {
              const ll = loginByUser.get(uid);
              if (ll && (maxLogin === null || ll > maxLogin)) maxLogin = ll; // ISO-strenge sorterer korrekt
            }
            if (maxLogin) lastActiveByCompany.set(companyId, maxLogin);
          }
        }
      } catch (e) {
        console.warn("[advisor-dashboard] get_users_last_login fejlede", e);
      }

      // Build InvestorCompanySummary[]
      const investorSummaries: InvestorCompanySummary[] = companies.filter(c => !legatCompanyIds.has(c.id)).map(c => {
        const latest = latestKfByCompany.get(c.id);
        const latestKey = latestReportKey.get(c.id) || null;
        const missingReport = companiesMissingReport.has(c.id);
        const revenue = latest?.kf.omsaetning ?? null;
        const ebt = latest?.kf.resultat_foer_skat ?? null;
        const cash = latest?.kf.bank_balance ?? null;
        const revenueTrendPct = revenueTrendByCompany.get(c.id) ?? null;
        const pulse = latestPulseByCompany.get(c.id) ?? null;

        // ── Spor 2-felter (additivt) ──
        // reflectionStatus: "no_report" når der slet ingen committet rapport er
        // (effective_period_key == null, sandeste "ingen rapport"-test). Ellers spørges
        // om der findes en refleksion for RAPPORTENS periode blandt ALLE virksomhedens
        // pulses (set-opslag), ikke om den NYESTE pulse tilfældigvis er for den periode.
        const reflectionStatus: "with_reflection" | "report_no_reflection" | "no_report" =
          latestKey == null
            ? "no_report"
            : (pulsePeriodsByCompany.get(c.id)?.has(latestKey) ? "with_reflection" : "report_no_reflection");
        const memberSince = (c as any).created_at ?? null;
        const isNewMember = memberSince != null && (now.getTime() - new Date(memberSince).getTime()) < 30 * 86400000;
        const tier = computeMembershipTier({
          contract_end_date: (c as any).contract_end_date,
          subscription_status: (c as any).subscription_status,
          subscription_current_period_end: (c as any).subscription_current_period_end,
        });
        const expiresAt = tier === "full"
          ? ((c as any).contract_end_date ?? null)
          : tier === "subscriber"
            ? ((c as any).subscription_current_period_end ?? null)
            : null;

        const needsAttention =
          (cash != null && cash < 0)
          || (revenueTrendPct != null && revenueTrendPct < -15)
          || (missingReport && !latestKey);

        return {
          company_id: c.id,
          company_name: c.name,
          logo_url: c.logo_url,
          has_verified_metrics: !!latest,
          // period_label direkte fra facts-rækken (§11 pkt. 1) — samme format
          // som før («Marts 2026»): commit skriver report_period/manual-label,
          // estimat-skriverne skriver DANISH_MONTHS[i] + år. Falder tilbage
          // til nøglen hvis den seneste nøgle ikke har en fact med tal.
          effective_period_label: latestKey ? (latest?.key === latestKey ? latest.period_label : latestKey) : null,
          effective_period_key: latestKey,
          revenue,
          ebt,
          cash,
          missing_current_period: missingReport,
          revenueTrendPct,
          latestPulse: pulse,
          needsAttention,
          unreadMessages: unreadByCompany.get(c.id) || 0,
          milestones: milestonesByCompany.get(c.id) || [],
          kpiTargets: kpiByCompany.get(c.id) || [],
          lastActiveAt: lastActiveByCompany.get(c.id) ?? null,
          reflectionStatus,
          goalHandoutDone: goalHandoutDoneCompanyIds.has(c.id),
          isNewMember,
          expiresAt,
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
      for (const f of recentFacts) {
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

      // Alerts-hentningen (notifications fra detect-financial-alerts) er fjernet
      // 3/9 sen aften: motoren dømmer ikke på alerts (virksomhedsSignaler.ts,
      // valg 4), og den havde ingen anden aftager i filen (grep: alertsByCompany
      // blev kun læst af bunke 4).

      // Udløbs-gate: skjul tier === "expired" fra dagligt arbejde (display-niveau).
      // Rører ikke kilden, så investorSummaries/companyMap/tællere forbliver hele.
      // no_date/full/subscriber beholdes (fail-open, test !== "expired").
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

      // Pending-gate: skjul virksomheder der KUN har en hængende invitation og INGEN
      // accepteret/aktiv bruger (samme display-niveau-mønster som expiredCompanyIds;
      // spejler Members.tsx' invitationStatus === 'pending'). En virksomhed med mindst
      // ét aktivt company_members-medlem er ALDRIG pending (selv med hængende invite).
      const companiesWithActiveMembers = new Set<string>(
        ((companyMembersRes.data || []) as any[]).map(m => m.company_id)
      );
      const pendingCompanyIds = new Set<string>();
      for (const inv of (((companyInvitationsRes as any)?.data || []) as any[])) {
        if (inv.company_id && !companiesWithActiveMembers.has(inv.company_id)) {
          pendingCompanyIds.add(inv.company_id);
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
      };
      const bWaiting: BucketItem[] = [];
      const bFresh: BucketItem[] = [];
      const bStale: BucketItem[] = [];
      const bStandsOut: BucketItem[] = [];
      const bPositive: BucketItem[] = [];

      for (const c of investorSummaries) {
        // Gates: spring udløbede + pending over (dækker alle fem bunker)
        if (expiredCompanyIds.has(c.company_id) || pendingCompanyIds.has(c.company_id)) continue;

        const conv = convByCompany.get(c.company_id)?.[0];
        const base = {
          company: { company_id: c.company_id, company_name: c.company_name, logo_url: c.logo_url },
          assigned_advisor_id: conv?.assigned_advisor_id ?? null,
          assigned_advisor_name: advisorProfiles.find(a => a.user_id === conv?.assigned_advisor_id)?.full_name ?? null,
        };

        // ── Bunke 1–4 kommer fra motoren (src/lib/virksomhedsSignaler.ts, #589):
        //    én dom i huset, ikke to. Inputtet bygges af det queryFn ALLEREDE
        //    har hentet — ingen ny query. Signalerne fordeles i de eksisterende
        //    bunker efter `koe`; subtext = signalets tekst, sortValue = alvor.
        //
        //    FORSKELLE I UDFALD efter omlægningen (3/9 sen aften):
        //      - «Ikke hørt fra længe» er VENDT (designets §3.5): kravet om
        //        has_verified_metrics er væk, og en virksomhed UDEN samtale får
        //        «Har aldrig skrevet» (alvor 95, øverst). Målt 1/9 var fjorten af
        //        treogtredive uden ét måltal — de dukker nu op. Køen bliver
        //        LÆNGERE; det er meningen: ingen må glemmes.
        //      - Sortering i «stale» er nu alvor (60 + dage over 21, loft 90;
        //        aldrig skrevet 95), ikke rå dage. Rækkefølgen er den samme for
        //        dem der har skrevet; de tavse ligger øverst.
        //      - «Venter på dit svar» sorteres på 70 + antal (før: antal).
        //      - «Friske tal» sorteres på fast 30 (før: committed_at-tidsstempel),
        //        så rækkefølgen inden for bunken er indlæsningsrækkefølgen.
        //      - «Stikker ud»: alerts er UDE (motorens valg 4); MoM regnes med
        //        Math.abs(prev) og uden kravet latestRev > 0 && prevRev > 0 fra
        //        revenueTrendByCompany; resultatfald ≥ 15 % MoM er NYT (alvor 70).
        //      - Budgetafvigelse kan IKKE komme på forsiden endnu: queryFn henter
        //        ikke budget_targets, så budgetOmsaetning er null (se nedenfor).
        const companyFacts = kfByCompanyPeriod.get(c.company_id);
        const factKeys = companyFacts ? [...companyFacts.keys()].sort() : [];
        const tilFactPunkt = (key: string | undefined): FactPunkt | null => {
          if (!key || !companyFacts) return null;
          const f = companyFacts.get(key);
          if (!f) return null;
          return {
            period_key: key,
            period_label: f.period_label,
            omsaetning: f.kf.omsaetning ?? null,
            resultat_foer_skat: f.kf.resultat_foer_skat ?? null,
            bank_balance: f.kf.bank_balance ?? null,
          };
        };
        // Motorens M/M (omsætningsfald/resultatfald i «stikker ud») gates med
        // SAMME momErGyldig-dom som revenueTrendByCompany: er et af de to
        // seneste punkter et estimat, får motoren forrigeFact = null, og dens
        // M/M-gren (`if (frisk && seneste && forrige)`) kører ikke — så et
        // 'estimated' punkt udløser aldrig et faldsignal mod et 'measured'
        // (§11 pkt. 1's betingelse). Motoren selv er urørt; FactPunkt bærer
        // ikke data_basis, så dommen falder her i fodringen.
        const senesteNoegle = factKeys[factKeys.length - 1];
        const forrigeNoegle = factKeys[factKeys.length - 2];
        const momGyldig =
          !!companyFacts && !!senesteNoegle && !!forrigeNoegle &&
          momErGyldig([companyFacts.get(forrigeNoegle)!, companyFacts.get(senesteNoegle)!]);
        const freshFact = recentFacts.find((f) => f.company_id === c.company_id);
        const signalInput: VirksomhedsInput = {
          senesteFact: tilFactPunkt(senesteNoegle),
          forrigeFact: momGyldig ? tilFactPunkt(forrigeNoegle) : null,
          // recentFacts bærer kun facts committet inden for 14 dage — præcis
          // det vindue «friske tal» dømmer på. Ældre → null → intet signal.
          senesteCommittedAt: freshFact?.committed_at ?? null,
          // queryFn henter IKKE budget_targets. Budgetafvigelse kan derfor ikke
          // komme på forsiden før den gør — bevidst null, ingen ny query her.
          budgetOmsaetning: null,
          forfaldneMilestones: 0, // motoren bruger dem ikke (valg 6); queryFn har kun aktive milestones
          loeftestaenger: 0, // queryFn henter ikke levers
          ulaesteBeskeder: c.unreadMessages,
          // null når der ingen samtale er — det er dét der gør «har aldrig skrevet» muligt.
          senesteBeskedAt: conv?.last_message_at ?? null,
          harCommittedeTal: c.has_verified_metrics,
          agentforslagVenter: 0, // queryFn henter ikke agent_proposals
        };
        for (const s of afgoerVirksomhedsSignaler(signalInput, now)) {
          const item: BucketItem = { ...base, subtext: s.tekst, sortValue: s.alvor };
          if (s.koe === "ikke_hoert_fra_laenge") bStale.push(item);
          else if (s.koe === "venter_paa_svar") bWaiting.push(item);
          else if (s.koe === "stikker_ud") bStandsOut.push(item);
          else if (s.koe === "friske_tal") bFresh.push(item);
          // agentforslag_venter: ingen bunke på forsiden endnu (queryFn giver 0).
        }

        // Bunke 5: Positive muligheder (opnået milestone / nyt handout / kraftig vækst)
        {
          const positives: string[] = [];
          let freshness = 0;
          const ms = recentlyCompletedMilestones.get(c.company_id);
          if (ms) { positives.push(`Milestone nået: ${ms}`); freshness = Math.max(freshness, 1); }
          const ho = recentlyCompletedHandoutsByCompany.get(c.company_id);
          if (ho) { positives.push(`Udfyldte handout: ${MODULE_LABELS[ho.module] || ho.module}`); freshness = Math.max(freshness, new Date(ho.completed_at).getTime()); }
          // Kraftig vækst tæller kun hvis fact-perioden er nylig (~3 mdr).
          if (isFiguresFresh(c.effective_period_key, now) && c.revenueTrendPct != null && c.revenueTrendPct >= 10) { positives.push(`Omsætning steg ${Math.round(c.revenueTrendPct)}% MoM`); freshness = Math.max(freshness, 1); }
          if (positives.length > 0) {
            bPositive.push({ ...base, subtext: positives.join(" · "), sortValue: freshness });
          }
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

      const svarBytes = [
        convRes, companiesRes, factsRes, pulseRes, recentReportsRes,
        milestonesRes, kpiTargetsRes, companyMembersRes, advisorProfilesRes,
        recentMilestonesRes, recentHandoutsRes, companyInvitationsRes, goalHandoutRes,
        memberProfilesRes,
      ].reduce((sum, res) => {
        try {
          return sum + (JSON.stringify((res as { data?: unknown })?.data ?? null)?.length ?? 0);
        } catch {
          return sum;
        }
      }, 0);
      span.setAttribute("svar_kb", Math.round(svarBytes / 1024));
      // Lokal udvikling: samme miljø-betingelse som Sentry-opsætningen
      // (main.tsx:39 enabled: PROD) — konsol-linjen lever kun udenfor prod.
      if (!import.meta.env.PROD) {
        console.info(`[advisor-dashboard] hentning: ~${Math.round(svarBytes / 1024)} kB svar`);
      }

      return {
        investorSummaries, companyMap, activityFeed, convByCompany, expiredCompanyIds, pendingCompanyIds,
        buckets, advisorProfiles,
        allConversations, companyToUser, companies, legatCompanyIds,
        companyMemberNameMap,
        recentReportsData: (recentReportsRes.data || []) as { id: string; company_id: string }[],
      };
      }),
    enabled: !!user,
    staleTime: 2 * 60_000,
  });

  const investorSummaries = data?.investorSummaries || [];
  const expiredCompanyIds: Set<string> = data?.expiredCompanyIds || new Set<string>();
  const pendingCompanyIds: Set<string> = data?.pendingCompanyIds || new Set<string>();
  // Fælles skjul-gate: holder expired + pending synkrone, så intet tæller/visning glemmes.
  const isHiddenCompany = (id: string) => expiredCompanyIds.has(id) || pendingCompanyIds.has(id);
  const companyMap = data?.companyMap || new Map();
  const activityFeed = data?.activityFeed || [];
  const convByCompany = data?.convByCompany || new Map<string, ConversationRow[]>();
  const buckets = data?.buckets || { waiting: [], fresh: [], stale: [], standsOut: [], positive: [] };
  const advisorProfiles = data?.advisorProfiles || [];

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


  // Count assigned conversations per advisor.
  // Udløbede + pending virksomheder ekskluderes (samme gate som bunker + portefølje).
  const latestConvs = investorSummaries
    .filter((company) => !isHiddenCompany(company.company_id))
    .map((company) => allConvsByCompany.get(company.company_id))
    .filter((conv): conv is ConversationRow => !!conv);

  const assignmentCounts = latestConvs.reduce((acc, conv) => {
    if (conv.assigned_advisor_id) {
      acc[conv.assigned_advisor_id] = (acc[conv.assigned_advisor_id] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const myAssignments = assignmentCounts[user?.id || ""] || 0;
  const totalAssigned = Object.values(assignmentCounts).reduce((s, n) => s + n, 0);

  // Unassigned: company convs without advisor
  const unassignedCompanies = investorSummaries.filter(c =>
    !isHiddenCompany(c.company_id) &&
    !allConvsByCompany.get(c.company_id)?.assigned_advisor_id
  ).length;

  const unassignedCount = unassignedCompanies;

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
  const filteredMembers = useMemo(() => {
    let list = [...investorSummaries];
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      list = list.filter(c => c.company_name.toLowerCase().includes(q));
    } else {
      // Skjul udløbede + pending fra den u-søgte default-liste; aktiv søgning afslører dem.
      list = list.filter(c => !isHiddenCompany(c.company_id));
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
  }, [investorSummaries, memberSearch, memberFilter, expiredCompanyIds, pendingCompanyIds]);

  const unbesvaredCount = investorSummaries.filter(c => c.unreadMessages > 0 && !isHiddenCompany(c.company_id)).length;
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
          // Accent pr. bunke efter hastighed, token-baseret (ingen hardcodede farver).
          // Venstre kolonne = kræver opmærksomhed; højre = muligheder + blødt vedligehold.
          // primary = den fremhævede handling pr. bunke (dialog -> chat, tal -> se virksomhed).
          const LEFT = [
            { key: "waiting", title: "Venter på dit svar", items: buckets.waiting, Icon: MessageSquare, border: "border-l-destructive", head: "bg-destructive/10 text-destructive", icon: "text-destructive", primary: "chat" },
            { key: "standsOut", title: "Noget stikker ud i tallene", items: buckets.standsOut, Icon: AlertTriangle, border: "border-l-chart-warning", head: "bg-chart-warning/10 text-chart-warning", icon: "text-chart-warning", primary: "company" },
          ];
          const RIGHT = [
            { key: "fresh", title: "Friske tal, fortjener sparring", items: buckets.fresh, Icon: FileText, border: "border-l-chart-positive", head: "bg-chart-positive/10 text-chart-positive", icon: "text-chart-positive", primary: "company" },
            { key: "positive", title: "Positive muligheder", items: buckets.positive, Icon: Sparkles, border: "border-l-chart-positive/60", head: "bg-chart-positive/5 text-chart-positive", icon: "text-chart-positive", primary: "company" },
            { key: "stale", title: "Ikke hørt fra længe", items: buckets.stale, Icon: Clock, border: "border-l-border", head: "bg-muted text-muted-foreground", icon: "text-muted-foreground", primary: "chat" },
          ];
          const totalItems = [...LEFT, ...RIGHT].reduce((n, b) => n + b.items.length, 0);
          if (totalItems === 0) {
            return (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/30 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                Ingen virksomheder kræver handling lige nu
              </div>
            );
          }
          const renderBucket = (b: any) => (
            <div key={b.key} className={`glass-card rounded-xl overflow-hidden border-l-2 ${b.border}`}>
              <div className={`flex items-center gap-2 px-4 py-2.5 ${b.head}`}>
                <b.Icon className={`h-4 w-4 shrink-0 ${b.icon}`} />
                <h3 className="text-xs font-semibold uppercase tracking-wider flex-1 min-w-0 truncate">{b.title}</h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-background/60">{b.items.length}</span>
              </div>
              <div className="divide-y divide-border/30">
                {b.items.map((item: any) => {
                  const convId = convByCompany.get(item.company.company_id)?.[0]?.id;
                  const userId = data?.companyToUser?.get(item.company.company_id);
                  // Fremhæv bunkens primære handling; fald tilbage til den anden hvis
                  // den ønskede knap ikke findes, så ingen række står uden primær.
                  const chatOK = !!convId;
                  const companyOK = !!userId;
                  let chatPrimary = false, companyPrimary = false;
                  if (b.primary === "chat") { chatPrimary = chatOK; companyPrimary = !chatOK && companyOK; }
                  else { companyPrimary = companyOK; chatPrimary = !companyOK && chatOK; }
                  const PRIMARY_CLS = "text-[10px] font-medium px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors";
                  const SECONDARY_CLS = "text-[10px] font-medium px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-muted-foreground";
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
                            className={chatPrimary ? PRIMARY_CLS : SECONDARY_CLS}
                          >
                            Åbn chat
                          </button>
                        )}
                        {userId && (
                          <button
                            onClick={() => navigate(`/members/${userId}`)}
                            className={companyPrimary ? PRIMARY_CLS : SECONDARY_CLS}
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
          );
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="space-y-4">{LEFT.filter(b => b.items.length > 0).map(renderBucket)}</div>
              <div className="space-y-4">{RIGHT.filter(b => b.items.length > 0).map(renderBucket)}</div>
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
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Rapportering og refleksion</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Onboarding</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Sidst aktiv</th>
                <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Udløber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filteredMembers.map(c => {
                const userId = data?.companyToUser?.get(c.company_id);
                const conv = allConvsByCompany.get(c.company_id);
                const assignedName = advisorProfiles.find(a => a.user_id === conv?.assigned_advisor_id)?.full_name;
                const personName = data?.companyMemberNameMap?.get(c.company_id) || null;
                const lastActiveDays = c.lastActiveAt ? Math.floor((Date.now() - new Date(c.lastActiveAt).getTime()) / 86400000) : null;
                const milestonesWithDeadline = c.milestones.filter(m => m.deadline).length;
                const expDays = daysUntil(c.expiresAt);

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
                    {/* Kolonne 1: Virksomhed + person + advisor-badge */}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                          {c.logo_url
                            ? <img src={c.logo_url} alt="" className="h-full w-full object-contain" />
                            : <span className="text-[9px] font-bold text-muted-foreground">{c.company_name.slice(0, 2).toUpperCase()}</span>
                          }
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium text-foreground truncate max-w-[140px]">{c.company_name}</p>
                            {c.unreadMessages > 0 && (
                              <span className="h-4 min-w-[16px] px-1 rounded-full bg-chart-warning text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                {c.unreadMessages}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                            {personName || "Ingen kontaktperson"}
                            {assignedName && <span className="text-muted-foreground/70"> · {assignedName.split(" ")[0]}</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Kolonne 2: Rapportering og refleksion */}
                    <td className="py-2.5 px-3">
                      {c.reflectionStatus === "with_reflection" ? (
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-chart-positive shrink-0" />
                          <span className="text-[11px] text-foreground truncate">{c.effective_period_label}, reflekteret</span>
                        </div>
                      ) : c.reflectionStatus === "report_no_reflection" ? (
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-chart-warning shrink-0" />
                          <span className="text-[11px] text-chart-warning truncate">{c.effective_period_label}, mangler refleksion</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                          <span className="text-[11px] text-destructive truncate">Mangler rapportering</span>
                        </div>
                      )}
                    </td>
                    {/* Kolonne 3: Onboarding (kun nye medlemmer) */}
                    <td className="py-2.5 px-3 hidden md:table-cell">
                      {c.isNewMember ? (
                        <div className="flex items-start gap-1.5">
                          <Sprout className="h-3.5 w-3.5 text-chart-positive shrink-0 mt-0.5" />
                          <div className="text-[10px] leading-tight">
                            <p className={c.goalHandoutDone ? "text-chart-positive" : "text-destructive"}>
                              {c.goalHandoutDone ? "Målsætning udfyldt" : "Mangler målsætning"}
                            </p>
                            <p className={milestonesWithDeadline >= 2 ? "text-chart-positive" : "text-chart-warning"}>
                              {milestonesWithDeadline} af 2 milestones
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50">Etableret</span>
                      )}
                    </td>
                    {/* Kolonne 4: Sidst aktiv (ægte login) */}
                    <td className="py-2.5 px-3 hidden sm:table-cell">
                      {c.lastActiveAt && lastActiveDays != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${lastActiveDays < 7 ? "bg-chart-positive" : lastActiveDays <= 21 ? "bg-chart-warning" : "bg-destructive"}`} />
                          <span className="text-[11px] text-muted-foreground truncate">{timeAgo(c.lastActiveAt)}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/50">Aldrig</span>
                      )}
                    </td>
                    {/* Kolonne 5: Udløber */}
                    <td className="py-2.5 px-3 text-right hidden sm:table-cell">
                      {!c.expiresAt ? (
                        <span className="text-[11px] text-muted-foreground/40">-</span>
                      ) : expDays != null && expDays < 30 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-chart-warning">
                          <Clock className="h-3 w-3" /> {formatDate(c.expiresAt)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">{formatDate(c.expiresAt)}</span>
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
