import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronDown, ChevronRight, ChevronUp, FileText, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { useCompanyCommentary } from "@/hooks/useCompanyCommentary";
import { useReportCommitStates } from "@/hooks/useReportCommitStates";
import { useScrollToHash } from "@/hooks/useScrollToHash";
import { propagateReportCommit, clearReportReviewNotification } from "@/lib/reportCommit";
import {
  DANISH_MONTHS,
  SHORT_MONTHS,
  formatDKK,
  getEffectiveKeyFigures,
  getEffectiveReportPeriod,
  getEffectiveReportPeriodKey,
} from "@/lib/financialUtils";
import { buildReportsByMonth, buildYearGroups, deriveSlotState, type SlotState } from "@/lib/deliveryMonths";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ReportReviewDialog from "@/components/ReportReviewDialog";
import ReportManualOverride from "@/components/ReportManualOverride";
import PulseCheckinModal from "@/components/PulseCheckinModal";
import { HbAdvisorCompanyPrompt } from "../HbAdvisorCompanyPrompt";
import { HbCard } from "../HbCard";
import { HbButton } from "../HbButton";
import { hbControlClasses } from "../admin/HbField";
import { deriveReportCardView, type CardAction } from "./reportCardView";
import { HbReportUploadZone } from "./HbReportUploadZone";

/** Rapportering (/rapportering → /reports ved GO) — LEVERANCEN rendyrket
    (klik-valg B): upload, status/nudges, godkendelse, historik (inkl.
    analyser-uden-rapport), årsrapporter og advisor-papirkurven (portet
    1:1 fra gamle Reports som GO-forudsætning i). Trend/AI bor i KPI-
    konverteringen. Dialogerne (review/Ret data/pulse) er BEVIDST BRO —
    hærdet RP-1-flow åbnes uændret. Mola: stille kvitteringer; alvoren
    kommunikeres roligt men tydeligt i kortene (deriveReportCardView). */

type DbReport = Record<string, any>;

const SLOT_DOT: Record<SlotState, string> = {
  delivered: "bg-hb-evergreen border-hb-evergreen",
  pending: "border-hb-evergreen [background:linear-gradient(90deg,hsl(var(--hb-evergreen))_50%,transparent_50%)]",
  processing: "border-hb-rust/60 animate-pulse",
  error: "border-hb-rust bg-hb-rust/20",
  missing: "border-hb-line bg-hb-line/40",
  upcoming: "border-hb-line",
};

const SLOT_LABEL: Record<SlotState, string> = {
  delivered: "Godkendt",
  pending: "Afventer godkendelse",
  processing: "Behandles",
  error: "Fejl",
  missing: "Mangler",
  upcoming: "Kommende",
};

const toneClasses = { quiet: "text-hb-ink-soft", attention: "text-hb-rust", alert: "text-hb-rust font-medium" };

export const RapporteringView = () => {
  const { user, companyId, companyName, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  useScrollToHash();

  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [highlightedReport, setHighlightedReport] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [overrideReport, setOverrideReport] = useState<DbReport | null>(null);
  const [reviewDialogState, setReviewDialogState] = useState<{
    open: boolean;
    reportId: string;
    reportLabel: string;
    cardState: string;
  }>({ open: false, reportId: "", reportLabel: "", cardState: "ready" });
  const [pulseState, setPulseState] = useState<{ open: boolean; periodKey?: string; periodLabel?: string }>({
    open: false,
  });
  const [pendingReviewReportId, setPendingReviewReportId] = useState<string | null>(null);

  const { data: facts = [] } = useCompanyFacts();
  const { data: commentaries = [] } = useCompanyCommentary();
  const commitStatesQuery = useReportCommitStates(companyId || undefined);

  // Samtale-id til advisor-upload-notifikationen (arvet fra Reports.loadData).
  const { data: conversationId = null } = useQuery({
    queryKey: ["rapportering", "conversation", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("conversations").select("id").eq("company_id", companyId!).maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!companyId,
    staleTime: 10 * 60_000,
  });

  const reportsQuery = useQuery({
    queryKey: ["rapportering", "reports", companyId, refreshKey],
    queryFn: async () => {
      const { data } = await (supabase
        .from("financial_reports")
        .select(
          "id, file_name, file_path, report_type, report_period, company_name, uploaded_at, status, extracted_data, normalized_data, manual_report_period_label, manual_report_period_key, manual_report_type, manual_normalized_data, manual_override_status, manual_override_note, manual_override_by, manual_override_at, manual_override_source, quality_signals",
        ) as any)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .neq("report_type", "aarsrapport")
        .order("uploaded_at", { ascending: false });
      return (data ?? []) as DbReport[];
    },
    enabled: !!user && !!companyId,
  });
  // Sorteres efter EFFEKTIV periode (manual override vinder over parsed),
  // nyeste måned øverst; rapporter uden periode-nøgle nederst i upload-orden
  // (query'en leverer uploaded_at DESC, og Array.sort er stabil).
  const dbReports = useMemo(() => {
    return [...(reportsQuery.data ?? [])].sort((a, b) => {
      const keyA = getEffectiveReportPeriodKey(a as any);
      const keyB = getEffectiveReportPeriodKey(b as any);
      if (keyA && keyB) return keyB.localeCompare(keyA);
      if (keyA) return -1;
      if (keyB) return 1;
      return 0;
    });
  }, [reportsQuery.data]);

  // Auto-refresh mens noget behandles (arvet adfærd).
  useEffect(() => {
    if (!dbReports.some((r) => r.status === "processing")) return;
    const timer = setInterval(() => setRefreshKey((k) => k + 1), 5000);
    return () => clearInterval(timer);
  }, [dbReports]);

  const committedReportIds = useMemo(() => new Set(facts.map((f) => f.source_report_id)), [facts]);
  const latestCommittedLabel = facts.length > 0 ? facts[facts.length - 1].period_label : null;

  // ── Deep link: ?reportId= → expand + scroll + highlight (arvet 1:1) ──────
  // Dependency-mønstret fra gamle Reports (searchParams + dbReports): et NYT
  // reportId-klik mens fladen er åben re-trigger. Param ryddes efter brug —
  // via navigate frem for setSearchParams, fordi setSearchParams smider
  // hash'en (og #upload/#annual-reports er Guide-kontrakt).
  const reportCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    const reportId = searchParams.get("reportId");
    if (reportId && dbReports.length > 0 && dbReports.some((r) => r.id === reportId)) {
      setExpandedReport(reportId);
      setHighlightedReport(reportId);
      setTimeout(() => {
        reportCardRefs.current.get(reportId)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
      navigate({ pathname: location.pathname, search: "", hash: location.hash }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, dbReports]);

  // ── RP-1-affyring (portet 1:1 fra Reports:611-641): pipeline-færdig →
  //    armér review; effekten åbner dialogen når commit-state er landet. ────
  const pendingScrollRef = useRef<string | null>(null);

  const handlePipelineComplete = async (reportId?: string) => {
    if (reportId) {
      pendingScrollRef.current = reportId;
      setExpandedReport(reportId);
    }
    setRefreshKey((k) => k + 1);
    if (reportId) {
      await commitStatesQuery.refetch();
      setPendingReviewReportId(reportId);
    }
  };

  // RP-1: Reactive auto-open review dialog for pending report
  useEffect(() => {
    if (!pendingReviewReportId) return;
    const entry = commitStatesQuery.data?.get(pendingReviewReportId);
    if (!entry) return; // not in map yet, wait for next data update
    if (entry.state === "ready" || entry.state === "update_available" || entry.state === "blocked") {
      const report = dbReports.find((r) => r.id === pendingReviewReportId);
      const label = report ? getEffectiveReportPeriod(report as any) || report.file_name : "";
      setReviewDialogState({ open: true, reportId: pendingReviewReportId, reportLabel: label, cardState: entry.state });
      setPendingReviewReportId(null);
    } else if (entry.state === "not_ready") {
      setPendingReviewReportId(null);
      // Open manual override so user can fix the period
      const report = dbReports.find((r) => r.id === pendingReviewReportId);
      if (report) setOverrideReport(report);
    }
  }, [pendingReviewReportId, commitStatesQuery.data, dbReports]);

  // Post-upload: scroll til den nye rapport når listen er genindlæst
  // (fladens highlight-mekanisme frem for gamle Reports' rå ring-klasser).
  useEffect(() => {
    const targetId = pendingScrollRef.current;
    if (!targetId || dbReports.length === 0) return;
    if (dbReports.some((r) => r.id === targetId)) {
      pendingScrollRef.current = null;
      setHighlightedReport(targetId);
      setTimeout(() => {
        reportCardRefs.current.get(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [dbReports]);

  // ── Godkend = commit ved "Gem og anvend" (portet 1:1 fra Reports) ────────
  const handleAppliedCommit = useCallback(
    async (reportId: string) => {
      try {
        const { data, error } = await supabase.rpc("get_report_commit_preview", { p_report_id: reportId });
        if (error) throw error;
        const preview = data as unknown as {
          can_commit: boolean;
          ownership_state: string | null;
          period_key: string | null;
          period_label: string | null;
          metrics_preview: Record<string, number> | null;
          state_reason: string | null;
          eligibility_reason: string | null;
        } | null;

        if (preview?.can_commit) {
          const { error: commitError } = await supabase.rpc("commit_report_facts", { p_report_id: reportId });
          if (commitError) throw commitError;
          toast.success("✓ Dine tal er opdateret", {
            description: `${preview?.period_label || "Perioden"} er nu en del af dit dashboard.`,
          });
          propagateReportCommit({
            queryClient,
            companyId,
            reportId,
            periodKey: preview?.period_key ?? null,
            periodLabel: preview?.period_label ?? null,
            metricsPreview: preview?.metrics_preview ?? {},
          });
          setRefreshKey((k) => k + 1);
        } else if (preview?.ownership_state === "other_report") {
          const report = dbReports.find((r) => r.id === reportId);
          const label =
            (report ? getEffectiveReportPeriod(report as any) || report.file_name : null) ||
            preview?.period_label ||
            reportId;
          setReviewDialogState({ open: true, reportId, reportLabel: label, cardState: "update_available" });
        } else {
          toast.error("Kan ikke godkende endnu", {
            description: preview?.state_reason || preview?.eligibility_reason || "Perioden er ikke klar til godkendelse.",
          });
        }
      } catch (err: any) {
        toast.error("Fejl ved godkendelse", { description: err.message || "Kunne ikke godkende rettelsen." });
      }
    },
    [queryClient, companyId, dbReports],
  );

  const openReview = (report: DbReport, cardState: string) => {
    const label = getEffectiveReportPeriod(report as any) || report.file_name;
    setReviewDialogState({ open: true, reportId: report.id, reportLabel: label, cardState });
  };

  const runAction = (action: CardAction, report: DbReport, cardState?: string) => {
    if (action === "review") openReview(report, cardState ?? "ready");
    else if (action === "override") setOverrideReport(report);
    else if (action === "upload") document.getElementById("upload")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // ── Afledninger til bånd/nudges/liste ────────────────────────────────────
  const yearGroups = useMemo(
    () => buildYearGroups(buildReportsByMonth(dbReports as any), committedReportIds),
    [dbReports, committedReportIds],
  );
  const currentYearGroup = yearGroups.find((g) => g.year === String(new Date().getFullYear()));

  const uncommittedProcessed = dbReports.filter(
    (r) => r.status === "processed" && !committedReportIds.has(r.id) && r.quality_signals?.needs_manual_entry !== true,
  );
  const manualEntryReports = dbReports.filter(
    (r) => r.status === "processed" && r.quality_signals?.needs_manual_entry === true && !committedReportIds.has(r.id),
  );

  const years = useMemo(
    () =>
      [...new Set(dbReports.map((r) => (getEffectiveReportPeriodKey(r as any) ?? "").split("-")[0]).filter(Boolean))].sort(
        (a, b) => b.localeCompare(a),
      ),
    [dbReports],
  );
  const displayedReports = yearFilter
    ? dbReports.filter((r) => (getEffectiveReportPeriodKey(r as any) ?? "").startsWith(yearFilter))
    : dbReports;

  // Analyser uden synlig rapport-række (sentinel-månederne) — mod ALLE rapporter.
  const visibleKeys = useMemo(
    () => new Set(dbReports.map((r) => getEffectiveReportPeriodKey(r as any)).filter(Boolean)),
    [dbReports],
  );
  const orphanAnalyses = commentaries.filter((c) => !c.is_stale && c.period_key && !visibleKeys.has(c.period_key));

  const fortrydUpload = async (report: DbReport) => {
    await (supabase.from("financial_reports").update({ deleted_at: new Date().toISOString() } as any).eq("id", report.id) as any);
    clearReportReviewNotification(report.id);
    setRefreshKey((k) => k + 1);
  };

  // ── "Slet rapport" (alle korttilstande, begge roller) — paritet m. gamle
  //    Reports' ubetingede knap; handler portet 1:1 fra handleDeleteReport.
  //    Lukker paritets-gap'et fra hb-slet-diagnose: uden denne kunne
  //    committed/manual/error-rapporter ikke soft-deletes på ny flade. ─────
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; report: DbReport | null }>({ open: false, report: null });
  const [deleting, setDeleting] = useState(false);

  const handleDeleteReport = async (report: DbReport) => {
    setDeleting(true);
    try {
      // Soft-delete: set deleted_at timestamp instead of removing data
      const { error } = await (supabase.from("financial_reports").update({ deleted_at: new Date().toISOString() } as any).eq("id", report.id) as any);
      if (error) throw error;

      // Slettet rapport: dispose ventende review-mail (best-effort; server-side gate er autoritativ)
      clearReportReviewNotification(report.id);

      setDeleteDialog({ open: false, report: null });
      setRefreshKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["budget-overview-v3"] });
      toast.success("Rapport flyttet til papirkurv", { description: `${report.report_period || report.file_name} kan gendannes af en administrator.` });
    } catch (err) {
      console.error("Soft-delete error:", err);
      toast.error("Fejl", { description: "Kunne ikke slette rapporten. Prøv igen." });
    } finally {
      setDeleting(false);
    }
  };

  // ── Papirkurv (advisor) — portet 1:1 fra gamle Reports før Rapportering-GO.
  //    Oprydningskæden i handlePermanentDelete er kopieret ordret. ──────────
  const [showTrash, setShowTrash] = useState(false);
  const [trashedReports, setTrashedReports] = useState<DbReport[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState<string | null>(null);

  const loadTrashedReports = useCallback(async () => {
    if (!isAdvisor || !companyId) return;
    const { data } = await (supabase
      .from("financial_reports")
      .select("id, file_name, file_path, report_type, report_period, company_name, uploaded_at, status, extracted_data, normalized_data") as any)
      .eq("company_id", companyId)
      .not("deleted_at", "is", null)
      .order("uploaded_at", { ascending: false });
    setTrashedReports(data || []);
  }, [isAdvisor, companyId]);

  useEffect(() => {
    if (showTrash) loadTrashedReports();
  }, [showTrash, loadTrashedReports]);

  const handleRestoreReport = async (report: DbReport) => {
    setRestoring(report.id);
    try {
      const { error } = await (supabase.from("financial_reports").update({ deleted_at: null, status: "processed" } as any).eq("id", report.id) as any);
      if (error) throw error;
      setTrashedReports((prev) => prev.filter((r) => r.id !== report.id));
      setRefreshKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["budget-overview-v3"] });
      toast.success("Rapport gendannet", { description: `${report.report_period || report.file_name} er gendannet.` });
    } catch (err) {
      console.error("Restore error:", err);
      toast.error("Fejl", { description: "Kunne ikke gendanne rapporten." });
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDelete = async (report: DbReport) => {
    setPermanentDeleting(report.id);
    try {
      await supabase.from("milestones").delete().eq("source_report", report.id);
      await (supabase.from("messages").delete() as any).eq("context_type", "report").eq("context_id", report.id);
      await supabase.from("advisor_notifications").delete().eq("reference_type", "report").eq("reference_id", report.id);
      if (report.file_path && report.file_path.includes("/")) {
        await supabase.storage.from("financial-documents").remove([report.file_path]);
      }
      // Delete commentaries linked to this report's facts (defensive — CASCADE also handles this)
      const { data: reportFacts } = await (supabase
        .from("financial_report_facts" as any)
        .select("id")
        .eq("source_report_id", report.id) as any);
      if (reportFacts && reportFacts.length > 0) {
        const factIds = reportFacts.map((f: any) => f.id);
        await (supabase
          .from("financial_commentaries" as any)
          .delete()
          .in("facts_id", factIds) as any);
      }
      const { error: factsDeleteError } = await (supabase.from("financial_report_facts" as any)
        .delete()
        .eq("source_report_id", report.id) as any);
      if (factsDeleteError) {
        console.error("Facts delete error:", factsDeleteError);
        throw new Error("Kunne ikke slette rapportens nøgletal. Prøv igen.");
      }
      const { error } = await supabase.from("financial_reports").delete().eq("id", report.id);
      if (error) throw error;
      setTrashedReports((prev) => prev.filter((r) => r.id !== report.id));
      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["company-commentaries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-overview-v3"] });
      toast.success("Permanent slettet", { description: `${report.report_period || report.file_name} er fjernet permanent.` });
    } catch (err) {
      console.error("Permanent delete error:", err);
      toast.error("Fejl", { description: "Kunne ikke slette rapporten permanent." });
    } finally {
      setPermanentDeleting(null);
    }
  };

  if (isAdvisor && !companyId) {
    return <HbAdvisorCompanyPrompt />;
  }

  const statusFor = (report: DbReport) => {
    // needs_manual_entry bor i quality_signals (status er 'processed') —
    // dommen fodres med den effektive tilstand.
    const effectiveStatus =
      report.status === "processed" && report.quality_signals?.needs_manual_entry === true && !committedReportIds.has(report.id)
        ? "needs_manual_entry"
        : report.status;
    return deriveReportCardView({
      status: effectiveStatus,
      isCommitted: committedReportIds.has(report.id),
      commitState: commitStatesQuery.data?.get(report.id)?.state as any,
      stateReason: commitStatesQuery.data?.get(report.id)?.state_reason ?? null,
    });
  };

  return (
    <div>
      {/* ── Header (Mola-strippens sprog) ── */}
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine tal</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          Rapportering
        </h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          {latestCommittedLabel ? `Senest godkendt: ${latestCommittedLabel}` : "Ingen godkendte tal endnu"}
        </p>
      </section>

      {/* ── Leveringsbånd (indeværende år) ── */}
      {currentYearGroup && (
        <HbCard className="mt-8 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              Levering {currentYearGroup.year}
            </p>
            <p className="text-sm text-hb-ink-soft">
              {currentYearGroup.delivered} af {currentYearGroup.total} måneder godkendt
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {currentYearGroup.months.map((slot) => {
              const state = deriveSlotState(slot, committedReportIds);
              return (
                <span key={slot.key} className="flex flex-col items-center gap-1" title={`${DANISH_MONTHS[slot.month]} — ${SLOT_LABEL[state]}`}>
                  <span className={cn("h-4 w-4 rounded-full border", SLOT_DOT[state])} />
                  <span className="text-[10px] text-hb-ink-soft">{SHORT_MONTHS[slot.month]}</span>
                </span>
              );
            })}
          </div>
        </HbCard>
      )}

      {/* ── Nudges (dæmpede kort) ── */}
      {uncommittedProcessed.length > 0 && (
        <HbCard className="mt-4 p-5">
          <p className="text-sm font-medium text-hb-ink">
            {uncommittedProcessed.length === 1
              ? "Én rapport afventer din godkendelse"
              : `${uncommittedProcessed.length} rapporter afventer din godkendelse`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {uncommittedProcessed.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-hb-ink-soft">
                  {getEffectiveReportPeriod(report as any) || report.file_name}
                </span>
                <button
                  type="button"
                  onClick={() => openReview(report, commitStatesQuery.data?.get(report.id)?.state ?? "ready")}
                  className="shrink-0 rounded-full border border-hb-line px-3 py-1 text-xs text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
                >
                  Gennemgå og godkend
                </button>
                <button
                  type="button"
                  onClick={() => void fortrydUpload(report)}
                  className="shrink-0 px-1 text-xs text-hb-ink-soft underline-offset-4 hover:text-hb-rust hover:underline"
                >
                  Fortryd upload
                </button>
              </li>
            ))}
          </ul>
        </HbCard>
      )}
      {manualEntryReports.length > 0 && (
        <HbCard className="mt-4 p-5">
          <p className="text-sm font-medium text-hb-ink">Rapporter der kræver manuel indtastning</p>
          <ul className="mt-2 space-y-1.5">
            {manualEntryReports.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-hb-ink-soft">
                  {getEffectiveReportPeriod(report as any) || report.file_name}
                </span>
                <button
                  type="button"
                  onClick={() => setOverrideReport(report)}
                  className="shrink-0 rounded-full border border-hb-line px-3 py-1 text-xs text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
                >
                  Indtast tallene
                </button>
              </li>
            ))}
          </ul>
        </HbCard>
      )}

      {/* ── Upload (anker bevaret; tour-anker bevidst udeladt) ── */}
      <div id="upload" className="mt-10 scroll-mt-24">
        <HbReportUploadZone
          userId={user?.id ?? null}
          companyId={companyId ?? null}
          companyName={companyName ?? null}
          conversationId={conversationId}
          onPipelineComplete={handlePipelineComplete}
        />
      </div>

      {/* ── Månedsrapporteringer ── */}
      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-editorial text-2xl font-medium text-hb-ink">Månedsrapporteringer</h2>
          {years.length > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setYearFilter(null)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm transition-colors",
                  yearFilter === null ? "bg-hb-sage font-medium text-hb-ink" : "text-hb-ink-soft hover:bg-hb-sage/30",
                )}
              >
                Alle
              </button>
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setYearFilter(year)}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm transition-colors",
                    yearFilter === year ? "bg-hb-sage font-medium text-hb-ink" : "text-hb-ink-soft hover:bg-hb-sage/30",
                  )}
                >
                  {year}
                </button>
              ))}
            </div>
          )}
        </div>

        {reportsQuery.isLoading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-hb-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter…
          </p>
        ) : displayedReports.length === 0 ? (
          <p className="mt-6 text-sm text-hb-ink-soft">
            Ingen rapporter endnu — upload din første ovenfor, så fylder vi historikken ud.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {displayedReports.map((report) => {
              const view = statusFor(report);
              const expanded = expandedReport === report.id;
              const keyFigures = getEffectiveKeyFigures(report as any) ?? {};
              const figureEntries = Object.entries(keyFigures).filter(([, v]) => typeof v === "number");
              return (
                <li
                  key={report.id}
                  ref={(el) => {
                    if (el) reportCardRefs.current.set(report.id, el);
                  }}
                >
                  <HbCard
                    className={cn(
                      "p-5 transition-shadow",
                      highlightedReport === report.id && "ring-2 ring-hb-evergreen/50",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setExpandedReport(expanded ? null : report.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {expanded ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-hb-ink-soft" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-hb-ink-soft" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] text-hb-ink">
                            {getEffectiveReportPeriod(report as any) || report.file_name}
                          </span>
                          <span className={cn("block text-sm", toneClasses[view.tone])}>
                            {view.label}
                            {view.detail ? ` — ${view.detail}` : ""}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        {view.secondary && (
                          <button
                            type="button"
                            onClick={() => runAction(view.secondary!.action, report, commitStatesQuery.data?.get(report.id)?.state)}
                            className="px-2 text-sm text-hb-ink-soft underline-offset-4 hover:text-hb-ink hover:underline"
                          >
                            {view.secondary.label}
                          </button>
                        )}
                        {view.primary && (
                          <HbButton
                            variant="secondary"
                            className="h-9 px-4 text-sm"
                            onClick={() => runAction(view.primary!.action, report, commitStatesQuery.data?.get(report.id)?.state)}
                          >
                            {view.primary.label}
                          </HbButton>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-4 border-t border-hb-line pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-hb-ink-soft">
                            {report.file_name} · uploadet{" "}
                            {new Date(report.uploaded_at).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          {/* Ubetinget slettevej (paritet m. gamle Reports:1485-1495) —
                              bor i detaljeområdet, IKKE i kort-dommen. */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteDialog({ open: true, report });
                            }}
                            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-hb-rust/70 transition-colors hover:text-hb-rust"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Slet rapport
                          </button>
                        </div>
                        {figureEntries.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {figureEntries.slice(0, 6).map(([name, value]) => (
                              <div key={name}>
                                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                                  {name.replace(/_/g, " ")}
                                </p>
                                <p className="mt-0.5 font-editorial text-lg font-medium text-hb-ink">
                                  {formatDKK(value as number)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </HbCard>
                </li>
              );
            })}
          </ul>
        )}

        {orphanAnalyses.length > 0 && (
          <div className="mt-8">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              Analyser uden tilknyttet rapport
            </p>
            <ul className="mt-2 space-y-1">
              {orphanAnalyses.map((c) => (
                <li key={c.period_key} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 text-hb-ink">{c.period_label ?? c.period_key}</span>
                  <Link to="/kpis" className="shrink-0 text-hb-rust underline-offset-4 hover:underline">
                    Se analyse
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <AnnualSection companyId={companyId ?? null} userId={user?.id ?? null} refreshKey={refreshKey} />

      {/* ── Papirkurv (advisor) — sammenfoldet som default ── */}
      {isAdvisor && companyId && (
        <section className="mt-14 border-t border-hb-line pt-10">
          <button
            type="button"
            onClick={() => setShowTrash((v) => !v)}
            className="flex items-center gap-2 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
          >
            <Archive className="h-4 w-4" />
            Papirkurv
            {showTrash ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {showTrash && (
            <div className="mt-4 space-y-3">
              {trashedReports.length === 0 ? (
                <HbCard className="p-8 text-center">
                  <Trash2 className="mx-auto mb-2 h-8 w-8 text-hb-ink-soft/30" />
                  <p className="text-sm text-hb-ink-soft">Papirkurven er tom</p>
                </HbCard>
              ) : (
                trashedReports.map((report) => (
                  <HbCard key={report.id} className="flex items-center justify-between p-4 opacity-70">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-4 w-4 shrink-0 text-hb-ink-soft" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-hb-ink">
                          {report.report_period || report.file_name}
                        </p>
                        <p className="text-xs text-hb-ink-soft">
                          {report.report_type} ·{" "}
                          {new Date(report.uploaded_at).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleRestoreReport(report)}
                        disabled={restoring === report.id}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-hb-evergreen transition-colors hover:text-hb-ink disabled:opacity-50"
                      >
                        <RotateCcw className={cn("h-3.5 w-3.5", restoring === report.id && "animate-spin")} />
                        Gendan
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePermanentDelete(report)}
                        disabled={permanentDeleting === report.id}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-hb-rust/80 transition-colors hover:text-hb-rust disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {permanentDeleting === report.id ? "Sletter..." : "Slet permanent"}
                      </button>
                    </div>
                  </HbCard>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Broer: dialogerne åbnes uændret (RP-1-hærdet flow) ── */}
      {overrideReport && (
        <ReportManualOverride
          report={overrideReport as any}
          open={!!overrideReport}
          onOpenChange={(open) => {
            if (!open) setOverrideReport(null);
          }}
          onSaved={() => setRefreshKey((k) => k + 1)}
          onApplied={handleAppliedCommit}
        />
      )}
      <ReportReviewDialog
        reportId={reviewDialogState.reportId}
        reportLabel={reviewDialogState.reportLabel}
        cardState={reviewDialogState.cardState}
        open={reviewDialogState.open}
        onOpenChange={(open) => {
          setReviewDialogState((prev) => ({ ...prev, open }));
          if (!open) {
            commitStatesQuery.refetch();
            setRefreshKey((k) => k + 1);
          }
        }}
        onCommitted={(periodKey, periodLabel) => {
          setTimeout(() => {
            setPulseState({ open: true, periodKey: periodKey || undefined, periodLabel: periodLabel || undefined });
          }, 250);
        }}
      />
      <PulseCheckinModal
        open={pulseState.open}
        onOpenChange={(open) => setPulseState((prev) => ({ ...prev, open }))}
        periodKeyOverride={pulseState.periodKey}
        periodLabelOverride={pulseState.periodLabel}
      />
      {/* Delete confirmation dialog (AlertDialog-mønstret fra gamle flade) */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !deleting && setDeleteDialog({ open, report: open ? deleteDialog.report : null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet rapport?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteDialog.report?.report_period || deleteDialog.report?.file_name}</strong>{" "}
              — Rapporten flyttes til papirkurven og kan gendannes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuller</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog.report && handleDeleteReport(deleteDialog.report)}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Sletter..." : "Flyt til papirkurv"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** Årsrapport-sektionen — fuld flow-paritet (upload → extract-annual-report,
    omsætnings-redigering → update-annual-report-revenue, slet m.
    facts-oprydning) i Hb-udtryk. Ankeret #annual-reports bevares. */
const AnnualSection = ({
  companyId,
  userId,
  refreshKey,
}: {
  companyId: string | null;
  userId: string | null;
  refreshKey: number;
}) => {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const currentYear = new Date().getFullYear();
  const [uploadYear, setUploadYear] = useState(String(currentYear - 1));
  const [uploading, setUploading] = useState(false);
  const [editingRevenue, setEditingRevenue] = useState<string | null>(null);
  const [manualRevenue, setManualRevenue] = useState("");
  const [savingRevenue, setSavingRevenue] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const annualQuery = useQuery({
    queryKey: ["rapportering", "annual", companyId, refreshKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_reports")
        .select("id, report_period, status, extracted_data")
        .eq("company_id", companyId!)
        .eq("report_type", "aarsrapport")
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false });
      return (data ?? []).map((r: any) => ({
        id: r.id,
        year: r.report_period?.replace("Årsrapport ", "") || "?",
        status: r.status,
        revenue: r.extracted_data?.nettoomsaetning as number | undefined,
      }));
    },
    enabled: !!companyId,
  });
  const annualReports = annualQuery.data ?? [];

  const handleUpload = async (file: File) => {
    if (!companyId || !userId) return;
    setUploading(true);
    try {
      const safeFileName = file.name
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[æÆ]/g, "ae").replace(/[øØ]/g, "oe").replace(/[åÅ]/g, "aa")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${companyId}/annual/${uploadYear}_${Date.now()}_${safeFileName}`;

      // Dedup: soft-delete eksisterende årsrapport for året (arvet adfærd).
      const existing = annualReports.find((r) => r.year === uploadYear);
      if (existing) {
        await supabase.from("financial_reports").update({ deleted_at: new Date().toISOString() } as any).eq("id", existing.id);
        clearReportReviewNotification(existing.id);
      }

      const { error: uploadErr } = await supabase.storage.from("financial-documents").upload(filePath, file);
      if (uploadErr) throw new Error(`Upload fejlede: ${uploadErr.message}`);

      const { data: reportRow, error: reportErr } = await (supabase
        .from("financial_reports")
        .insert({
          company_id: companyId,
          user_id: userId,
          file_name: file.name,
          file_path: filePath,
          report_type: "aarsrapport",
          report_period: `Årsrapport ${uploadYear}`,
          status: "processing",
        } as any)
        .select("id")
        .single() as any);
      if (reportErr || !reportRow) throw new Error(reportErr?.message || "Kunne ikke oprette rapport");

      const { data: result, error: fnErr } = await supabase.functions.invoke("extract-annual-report", {
        body: { report_id: reportRow.id, file_path: filePath, year: uploadYear, company_id: companyId, user_id: userId },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!result?.ok) throw new Error(result?.error || "Ekstraktion fejlede");

      const inserted = result.inserted ?? 0;
      const protected_count = result.protected_count ?? 0;
      toast.success(`Årsrapport ${uploadYear} importeret ✓`, {
        description:
          inserted === 12
            ? "12 måneder opdateret med historiske tal"
            : inserted > 0
              ? `${inserted} måneder opdateret (${protected_count} måneder havde allerede rigtige tal)`
              : `Ingen måneder opdateret — alle ${protected_count} måneder har allerede committede rapporter`,
      });

      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-budgets"] });
      void annualQuery.refetch();
    } catch (err: any) {
      toast.error("Upload fejlede", { description: err.message || "Ukendt fejl" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (reportId: string, year: string) => {
    try {
      await supabase.from("financial_reports").update({ deleted_at: new Date().toISOString() } as any).eq("id", reportId);
      clearReportReviewNotification(reportId);
      await (supabase.from("financial_report_facts" as any) as any)
        .delete()
        .eq("company_id", companyId!)
        .eq("source_type", "annual_report")
        .like("period_key", `${year}-%`);
      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      setConfirmDelete(null);
      void annualQuery.refetch();
    } catch (err: any) {
      toast.error("Kunne ikke slette", { description: err.message });
    }
  };

  const handleSaveRevenue = async (reportId: string, year: string) => {
    const val = parseFloat(manualRevenue.replace(/\./g, "").replace(",", "."));
    if (isNaN(val) || val < 0) {
      toast.error("Indtast et gyldigt beløb");
      return;
    }
    setSavingRevenue(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-annual-report-revenue", {
        body: { report_id: reportId, year, company_id: companyId, annual_revenue: val },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Opdatering fejlede");
      toast.success("Omsætning opdateret ✓", {
        description: `${new Intl.NumberFormat("da-DK").format(val)} kr. fordelt over ${data.updated} måneder`,
      });
      setEditingRevenue(null);
      setManualRevenue("");
      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["financial-reports-chart"] });
      void annualQuery.refetch();
    } catch (err: any) {
      toast.error("Kunne ikke gemme", { description: err.message || "Ukendt fejl" });
    } finally {
      setSavingRevenue(false);
    }
  };

  const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear - 1 - i));

  return (
    <section id="annual-reports" className="mt-14 scroll-mt-24 border-t border-hb-line pt-10">
      <h2 className="font-editorial text-2xl font-medium text-hb-ink">Historiske årsrapporter</h2>
      <p className="mt-1 max-w-2xl text-sm text-hb-ink-soft">
        Upload din årsrapport fra revisor (PDF) — tallene fordeles over 12 måneder og giver dine
        grafer historisk kontekst. Måneder med rigtige rapporter overskrives aldrig.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <select
          value={uploadYear}
          onChange={(e) => setUploadYear(e.target.value)}
          aria-label="Årsrapportens år"
          className={cn(hbControlClasses, "w-auto cursor-pointer py-2 text-sm")}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <HbButton variant="secondary" className="h-10 px-5 text-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Behandler…" : `Upload årsrapport ${uploadYear}`}
        </HbButton>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = "";
          }}
        />
      </div>

      {annualReports.length > 0 && (
        <ul className="mt-5 space-y-2">
          {annualReports.map((report) => (
            <li key={report.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-hb-line bg-hb-surface px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-hb-ink">Årsrapport {report.year}</span>
                <span className="block text-sm text-hb-ink-soft">
                  {report.status === "error"
                    ? "Kunne ikke behandles"
                    : report.revenue != null
                      ? `Omsætning: ${formatDKK(report.revenue)}`
                      : "Importeret"}
                </span>
              </span>
              {confirmDelete === report.id ? (
                <>
                  <span className="text-sm text-hb-ink">Slet årsrapport {report.year}?</span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(report.id, report.year)}
                    className="shrink-0 rounded-full bg-hb-rust px-3 py-1 text-xs font-medium text-white hover:bg-hb-rust/90"
                  >
                    Slet
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className="shrink-0 px-2 text-xs text-hb-ink-soft hover:text-hb-ink">
                    Fortryd
                  </button>
                </>
              ) : editingRevenue === report.id ? (
                <>
                  <input
                    value={manualRevenue}
                    onChange={(e) => setManualRevenue(e.target.value)}
                    placeholder="Årsomsætning i kr."
                    aria-label="Årsomsætning"
                    className={cn(hbControlClasses, "w-44 py-1.5 text-sm")}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveRevenue(report.id, report.year)}
                    disabled={savingRevenue}
                    className="shrink-0 rounded-full bg-hb-evergreen px-3 py-1 text-xs font-medium text-white hover:bg-hb-evergreen/90 disabled:opacity-50"
                  >
                    Gem
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRevenue(null);
                      setManualRevenue("");
                    }}
                    className="shrink-0 px-2 text-xs text-hb-ink-soft hover:text-hb-ink"
                  >
                    Fortryd
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRevenue(report.id);
                      setManualRevenue(report.revenue != null ? String(report.revenue) : "");
                    }}
                    className="shrink-0 px-2 text-sm text-hb-ink-soft underline-offset-4 hover:text-hb-ink hover:underline"
                  >
                    Ret omsætning
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(report.id)}
                    className="shrink-0 px-2 text-sm text-hb-ink-soft underline-offset-4 hover:text-hb-rust hover:underline"
                  >
                    Slet
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
