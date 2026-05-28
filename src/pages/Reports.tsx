import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useReportCommitStates } from "@/hooks/useReportCommitStates";
import ReportReviewDialog from "@/components/ReportReviewDialog";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { notifyChatMessage } from "@/lib/chatNotify";
import FileUploadZone from "@/components/FileUploadZone";
import AIFinancialAnalysis from "@/components/AIFinancialAnalysis";
import DeliveryOverview from "@/components/DeliveryOverview";
import PeriodSelector, { usePeriodFilter } from "@/components/PeriodSelector";
import ReportManualOverride from "@/components/ReportManualOverride";
import { useScrollToHash } from "@/hooks/useScrollToHash";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Send,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Trash2,
  RotateCcw,
  Archive,
  Bug,
  Pencil,
  Upload,
  BookMarked,
  Loader2,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import type { Json } from "@/integrations/supabase/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getEffectiveReportPeriodKey, getEffectiveMetrics, getEffectiveReportPeriod,
  hasManualOverride, formatDKK, formatCompact,
  SHORT_MONTHS, reportStatusConfig, type ReportData,
} from "@/lib/financialUtils";
import AdvisorCompanyPrompt from "@/components/AdvisorCompanyPrompt";
import { openReportFile, isLegacyPath, uploadReportFile } from "@/lib/reportFileAccess";

interface DbReport {
  id: string;
  file_name: string;
  file_path: string;
  report_type: string;
  report_period: string | null;
  company_name: string | null;
  uploaded_at: string;
  status: string;
  extracted_data: Json | null;
  normalized_data: Json | null;
  manual_report_period_label: string | null;
  manual_report_period_key: string | null;
  manual_report_type: string | null;
  manual_normalized_data: Json | null;
  manual_override_status: string | null;
  manual_override_note: string | null;
  manual_override_by: string | null;
  manual_override_at: string | null;
  manual_override_source: string | null;
  quality_signals: Json | null;
}

interface ChatMsg {
  id: string;
  sender_id: string;
  content: string;
  message_type: string;
  context_id: string | null;
  created_at: string;
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; label: string; className: string; bg: string }> = {
  processed: { icon: CheckCircle2, ...reportStatusConfig.processed },
  processing: { icon: Clock, ...reportStatusConfig.processing },
  error: { icon: Pencil, label: "Afventer dine tal", className: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/30" },
};

const Reports = () => {
  useScrollToHash();
  const { user, companyId, isAdvisor: rawAdvisor, isAdmin } = useAuth();
  const { viewingAsMember } = useViewMode();
  const queryClient = useQueryClient();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [dbReports, setDbReports] = useState<DbReport[]>([]);
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const trendPeriod = usePeriodFilter();
  const { data: companyFacts = [] } = useCompanyFacts();
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMsg[]>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [advisorProfiles, setAdvisorProfiles] = useState<Record<string, string>>({});
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [overrideReport, setOverrideReport] = useState<DbReport | null>(null);
  
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; report: DbReport | null }>({ open: false, report: null });
  const [deleting, setDeleting] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashedReports, setTrashedReports] = useState<DbReport[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState<string | null>(null);
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [annualUploadYear, setAnnualUploadYear] = useState<"2024" | "2025">("2024");
  const [annualUploading, setAnnualUploading] = useState(false);
  const [annualReports, setAnnualReports] = useState<{ id: string; year: string; status: string; inserted?: number; metrics_preview?: any; success_log?: { year?: string; inserted_count?: number; protected_count?: number; total_months?: number; completed_at?: string; metrics_keys?: string[] } | null; error_log?: { step?: string; message?: string; at?: string; [k: string]: any } | null }[]>([]);
  const [expandedAnnualError, setExpandedAnnualError] = useState<string | null>(null);
  const [expandedAnnualSuccess, setExpandedAnnualSuccess] = useState<string | null>(null);
  const [editingAnnualField, setEditingAnnualField] = useState<{ reportId: string; year: string } | null>(null);
  const [manualRevenue, setManualRevenue] = useState("");
  const [savingManualRevenue, setSavingManualRevenue] = useState(false);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    dbReports.forEach(r => {
      const key = getEffectiveReportPeriodKey(r as any);
      if (key) years.add(key.split("-")[0]);
    });
    return [...years].sort().reverse();
  }, [dbReports]);

  const displayedReports = yearFilter
    ? dbReports.filter(r => {
        const key = getEffectiveReportPeriodKey(r as any);
        return key?.startsWith(yearFilter);
      })
    : dbReports;

  // RP-1: Review dialog + server-driven card states
  const [reviewDialogState, setReviewDialogState] = useState<{ open: boolean; reportId: string; reportLabel: string; cardState: string }>({ open: false, reportId: "", reportLabel: "", cardState: "ready" });
  const commitStatesQuery = useReportCommitStates(companyId || undefined);
  const [pendingReviewReportId, setPendingReviewReportId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    const [reportsRes, convRes] = await Promise.all([
      (supabase
        .from("financial_reports")
        .select("id, file_name, file_path, report_type, report_period, company_name, uploaded_at, status, extracted_data, normalized_data, manual_report_period_label, manual_report_period_key, manual_report_type, manual_normalized_data, manual_override_status, manual_override_note, manual_override_by, manual_override_at, manual_override_source, quality_signals") as any)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .neq("report_type", "aarsrapport")
        .order("uploaded_at", { ascending: false }),
      companyId
        ? supabase.from("conversations").select("id").eq("company_id", companyId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const reportsList = reportsRes.data || [];
    setDbReports(reportsList);
    setConversationId(convRes.data?.id || null);

    if (reportsList.length > 0 && convRes.data?.id) {
      const ids = reportsList.map((r) => r.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convRes.data.id)
        .eq("context_type", "report")
        .in("context_id", ids)
        .order("created_at", { ascending: true });

      const grouped: Record<string, ChatMsg[]> = {};
      const advisorIds = new Set<string>();
      (msgs || []).forEach((m: any) => {
        const rid = m.context_id as string;
        if (rid) {
          if (!grouped[rid]) grouped[rid] = [];
          grouped[rid].push(m as ChatMsg);
          if (m.sender_id !== user.id) advisorIds.add(m.sender_id);
        }
      });
      setChatMessages(grouped);

      if (advisorIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", Array.from(advisorIds));
        const map: Record<string, string> = {};
        (profiles || []).forEach((p) => { map[p.user_id] = p.full_name; });
        setAdvisorProfiles(map);
      }
    }
  }, [user, companyId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  useEffect(() => {
    if (uploadExpanded) {
      const el = document.getElementById("upload");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [uploadExpanded]);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("financial_reports")
      .select("id, report_period, status, extracted_data")
      .eq("company_id", companyId)
      .eq("report_type", "aarsrapport")
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setAnnualReports(data.map((r: any) => ({
            id: r.id,
            year: r.report_period?.replace("Årsrapport ", "") || "?",
            status: r.status,
            metrics_preview: r.extracted_data || {},
            success_log: r.status === "processed" ? (r.extracted_data?.success_log ?? null) : null,
            error_log: r.status === "error" ? (r.extracted_data?.error_log ?? null) : null,
          })));
        }
      });
  }, [companyId, refreshKey]);

  const handleAnnualUpload = async (file: File) => {
    if (!companyId || !user) return;
    setAnnualUploading(true);
    try {
      // Sanitize filename
      const safeFileName = file.name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[æÆ]/g, "ae").replace(/[øØ]/g, "oe").replace(/[åÅ]/g, "aa")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${companyId}/annual/${annualUploadYear}_${Date.now()}_${safeFileName}`;

      // Dedup: soft-delete any existing annual report for this year
      const existing = annualReports.find(r => r.year === annualUploadYear);
      if (existing) {
        await supabase.from("financial_reports")
          .update({ deleted_at: new Date().toISOString() } as any)
          .eq("id", existing.id);
      }

      // Upload file
      const { error: uploadErr } = await supabase.storage
        .from("financial-documents")
        .upload(filePath, file);
      if (uploadErr) throw new Error(`Upload fejlede: ${uploadErr.message}`);

      // Create report record
      const { data: reportRow, error: reportErr } = await (supabase
        .from("financial_reports")
        .insert({
          company_id: companyId,
          user_id: user.id,
          file_name: file.name,
          file_path: filePath,
          report_type: "aarsrapport",
          report_period: `Årsrapport ${annualUploadYear}`,
          status: "processing",
        } as any)
        .select("id")
        .single() as any);
      if (reportErr || !reportRow) throw new Error(reportErr?.message || "Kunne ikke oprette rapport");

      // Extract + process in one call
      const { data: result, error: fnErr } = await supabase.functions.invoke("extract-annual-report", {
        body: { report_id: reportRow.id, file_path: filePath, year: annualUploadYear, company_id: companyId, user_id: user.id },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!result?.ok) throw new Error(result?.error || "Ekstraktion fejlede");

      const inserted = result.inserted ?? 0;
      const protected_count = result.protected_count ?? 0;

      const desc = inserted === 12
        ? `12 måneder opdateret med historiske tal`
        : inserted > 0
          ? `${inserted} måneder opdateret (${protected_count} måneder havde allerede rigtige tal)`
          : `Ingen måneder opdateret — alle ${protected_count} måneder har allerede committede rapporter`;

      toast.success(`Årsrapport ${annualUploadYear} importeret ✓`, { description: desc });

      setAnnualReports(prev => [
        {
          id: reportRow.id,
          year: annualUploadYear,
          status: "processed",
          inserted,
          metrics_preview: result.extracted || {},
          success_log: {
            year: annualUploadYear,
            inserted_count: inserted,
            protected_count,
            total_months: 12,
            completed_at: new Date().toISOString(),
            metrics_keys: Array.isArray(result.extracted) ? [] : Object.keys(result.extracted ?? {}),
            revenue_status: result.extracted?.success_log?.revenue_status,
            revenue_alt_label: result.extracted?.success_log?.revenue_alt_label ?? null,
            is_gross_profit_only: result.extracted?.success_log?.is_gross_profit_only ?? false,
            derived_fields: result.extracted?.success_log?.derived_fields ?? [],
          } as any,
        },
        ...prev.filter(r => r.year !== annualUploadYear),
      ]);

      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-budgets"] });
    } catch (err: any) {
      toast.error("Upload fejlede", { description: err.message || "Ukendt fejl" });
    } finally {
      setAnnualUploading(false);
    }
  };

  const handleDeleteAnnualReport = async (reportId: string, year: string) => {
    try {
      await supabase.from("financial_reports")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", reportId);
      await (supabase.from("financial_report_facts" as any) as any)
        .delete()
        .eq("company_id", companyId!)
        .eq("source_type", "annual_report")
        .like("period_key", `${year}-%`);
      setAnnualReports(prev => prev.filter(r => r.id !== reportId));
      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      toast.success(`Årsrapport ${year} slettet`);
    } catch (err: any) {
      toast.error("Kunne ikke slette", { description: err.message });
    }
  };

  const handleSaveManualRevenue = async (reportId: string, year: string) => {
    const val = parseFloat(manualRevenue.replace(/\./g, "").replace(",", "."));
    if (isNaN(val) || val < 0) {
      toast.error("Indtast et gyldigt beløb");
      return;
    }
    setSavingManualRevenue(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-annual-report-revenue", {
        body: {
          report_id: reportId,
          year,
          company_id: companyId,
          annual_revenue: val,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Opdatering fejlede");

      // Update local state to reflect new revenue
      setAnnualReports(prev => prev.map(r =>
        r.id === reportId
          ? { ...r, metrics_preview: { ...(r.metrics_preview || {}), nettoomsaetning: val } }
          : r
      ));

      toast.success("Omsætning opdateret ✓", {
        description: `${new Intl.NumberFormat("da-DK").format(val)} kr. fordelt over ${data.updated} måneder`,
      });

      setEditingAnnualField(null);
      setManualRevenue("");

      // Bust all relevant caches
      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["company-facts", companyId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-budgets", companyId] });
      queryClient.invalidateQueries({ queryKey: ["financial-reports-chart"] });
      queryClient.invalidateQueries({ queryKey: ["company-commentaries", companyId] });
    } catch (err: any) {
      toast.error("Kunne ikke gemme", { description: err.message || "Ukendt fejl" });
    } finally {
      setSavingManualRevenue(false);
    }
  };

  // Auto-refresh while any report is processing
  useEffect(() => {
    const hasProcessing = dbReports.some(r => r.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 4000);

    return () => clearInterval(interval);
  }, [dbReports]);

  // Deep link: auto-expand report from ?reportId= query param
  const reportCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    const reportId = searchParams.get("reportId");
    if (reportId && dbReports.length > 0) {
      const exists = dbReports.find(r => r.id === reportId);
      if (exists) {
        setExpandedReport(reportId);
        setTimeout(() => {
          const el = reportCardRefs.current.get(reportId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring-2", "ring-primary/40");
            setTimeout(() => el.classList.remove("ring-2", "ring-primary/40"), 3000);
          }
        }, 300);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, dbReports]);

  const hasAnyPeriodData = useMemo(() =>
    dbReports.some(r => !!getEffectiveReportPeriodKey(r as any)),
  [dbReports]);

  // (delivery overview logic is now in DeliveryOverview component)


  // Build trend data for charts — reads from facts layer for consistency
  const trendData = useMemo(() => {
    const allKeys = companyFacts.map(f => f.period_key).sort();
    const filteredKeys = trendPeriod.filterKeys(allKeys);
    return filteredKeys
      .map((key) => {
        const fact = companyFacts.find(f => f.period_key === key);
        if (!fact) return null;
        const kf = factsToDanishMetrics(fact.metrics);
        const [year, monthStr] = key.split("-");
        const monthIdx = parseInt(monthStr, 10) - 1;
        return {
          key,
          label: `${SHORT_MONTHS[monthIdx]} ${year}`,
          omsaetning: kf.omsaetning ?? null,
          daekningsbidrag: kf.daekningsbidrag ?? null,
          resultat_foer_skat: kf.resultat_foer_skat ?? null,
          loenninger: kf.loenninger ?? null,
          bank_balance: kf.bank_balance ?? null,
        };
      })
      .filter(Boolean) as any[];
  }, [companyFacts, trendPeriod.mode, trendPeriod.customFrom, trendPeriod.customTo]);

  const trendPeriodLabel = useMemo(() => {
    return trendPeriod.getPeriodLabel(trendData.map((d: any) => d.key));
  }, [trendData, trendPeriod]);

  const handleSubmitComment = async (reportId: string, reportName: string) => {
    const content = (commentInputs[reportId] || "").trim();
    if (!content || !user || !conversationId) return;
    if (content.length > 2000) return;

    setSubmittingComment(reportId);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        message_type: "user",
        context_type: "report",
        context_id: reportId,
        context_meta: { title: reportName },
      } as any)
      .select()
      .single();

    if (!error && data) {
      setChatMessages((prev) => ({
        ...prev,
        [reportId]: [...(prev[reportId] || []), data as unknown as ChatMsg],
      }));
      setCommentInputs((prev) => ({ ...prev, [reportId]: "" }));
      // Server-side: Slack + advisor notification
      notifyChatMessage((data as any).id);
    }
    setSubmittingComment(null);
  };

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
      const report = dbReports.find(r => r.id === pendingReviewReportId);
      const label = report ? (getEffectiveReportPeriod(report) || report.file_name) : "";
      setReviewDialogState({ open: true, reportId: pendingReviewReportId, reportLabel: label, cardState: entry.state });
      setPendingReviewReportId(null);
    } else if (entry.state === "not_ready") {
      setPendingReviewReportId(null);
      // Open manual override so user can fix the period
      const report = dbReports.find(r => r.id === pendingReviewReportId);
      if (report) setOverrideReport(report);
    }
  }, [pendingReviewReportId, commitStatesQuery.data, dbReports]);

  // Post-upload: scroll to newly created report after data reloads
  useEffect(() => {
    const targetId = pendingScrollRef.current;
    if (!targetId || dbReports.length === 0) return;
    const exists = dbReports.find(r => r.id === targetId);
    if (exists) {
      pendingScrollRef.current = null;
      setTimeout(() => {
        const el = reportCardRefs.current.get(targetId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-primary/40");
          setTimeout(() => el.classList.remove("ring-2", "ring-primary/40"), 3000);
        }
      }, 300);
    }
  }, [dbReports]);

  const handleDeleteReport = useCallback(async (report: DbReport) => {
    setDeleting(true);
    try {
      // Soft-delete: set deleted_at timestamp instead of removing data
      const { error } = await (supabase.from("financial_reports").update({ deleted_at: new Date().toISOString() } as any).eq("id", report.id) as any);
      if (error) throw error;

      setDbReports((prev) => prev.filter((r) => r.id !== report.id));
      setDeleteDialog({ open: false, report: null });
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
  }, [queryClient]);

  // Load trashed reports (advisor only)
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

  const handleViewOriginalFile = async (report: DbReport) => {
    if (!report.file_path) return;
    await openReportFile(report.file_path);
  };

  const handleReuploadOriginal = async (report: DbReport, file: File) => {
    if (!companyId) return;
    const newPath = await uploadReportFile(file, companyId, report.id);
    if (newPath) {
      setDbReports(prev => prev.map(r => r.id === report.id ? { ...r, file_path: newPath } : r));
      toast.success("Fil uploadet", { description: "Originalfilen er nu tilknyttet rapporten." });
    } else {
      toast.error("Upload fejlede", { description: "Kunne ikke uploade filen. Prøv igen." });
    }
  };

  const renderEffectiveKeyFigures = (report: DbReport) => {
    const effectiveResult = getEffectiveMetrics(report as unknown as ReportData);
    if (!effectiveResult) return null;
    const kf = effectiveResult.metrics;

    const stats = [
      { label: "Omsætning", value: formatDKK(kf.omsaetning) },
      { label: "Dækningsbidrag", value: formatDKK(kf.daekningsbidrag) },
      { label: "Lønninger", value: formatDKK(kf.loenninger) },
      { label: "Resultat f. skat", value: formatDKK(kf.resultat_foer_skat) },
      kf.aktiver_i_alt != null ? { label: "Aktiver", value: formatDKK(kf.aktiver_i_alt) } : null,
      kf.egenkapital != null ? { label: "Egenkapital", value: formatDKK(kf.egenkapital) } : null,
      kf.bank_balance != null ? { label: "Bank", value: formatDKK(kf.bank_balance) } : null,
      kf.debitorer != null ? { label: "Debitorer", value: formatDKK(kf.debitorer) } : null,
      kf.kreditorer != null ? { label: "Kreditorer", value: formatDKK(kf.kreditorer) } : null,
    ].filter(Boolean) as { label: string; value: string }[];

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border/50 bg-background/50 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>
    );
  };

  const processedReports = dbReports.filter(r => r.status === "processed" && r.file_path !== "_sentinel");
  const reportCount = processedReports.length;
  const committedReportIds = new Set(companyFacts.map(f => f.source_report_id));
  const uncommittedProcessed = processedReports.filter(r => !committedReportIds.has(r.id));

  if (isAdvisor && !companyId) {
    return (
      <AppLayout>
        <AdvisorCompanyPrompt />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
            Rapportering
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload regnskaber og følg virksomhedens udvikling
          </p>
        </div>
        {reportCount >= 1 && (
          <Button onClick={() => setUploadExpanded(true)} className="flex-shrink-0 gap-2">
            <Upload className="h-4 w-4" />
            Upload ny rapport
          </Button>
        )}
      </div>

      {/* Awaiting-approval banner: uploads not yet committed */}
      {uncommittedProcessed.length > 0 && (
        <div className="rounded-lg border border-blue-300/50 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-950/20 p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-blue-700 dark:text-blue-300">
                {uncommittedProcessed.length === 1
                  ? "1 rapport afventer din godkendelse"
                  : `${uncommittedProcessed.length} rapporter afventer din godkendelse`}
              </p>
              <p className="text-sm text-blue-600/80 dark:text-blue-400/80 mt-0.5">
                Du har uploadet tal der endnu ikke er godkendt. Færdiggør for at få dem i drift, eller annuller uploaden.
              </p>
              <div className="space-y-2 mt-3">
                {uncommittedProcessed.map((report) => {
                  const label = getEffectiveReportPeriod(report) || report.file_name;
                  return (
                    <div key={report.id} className="flex items-center justify-between gap-3 rounded-md bg-blue-100/40 dark:bg-blue-900/20 px-3 py-2">
                      <span className="text-sm text-blue-800 dark:text-blue-200 truncate">{label}</span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <Button
                          size="sm"
                          onClick={() => setReviewDialogState({ open: true, reportId: report.id, reportLabel: label, cardState: "ready" })}
                        >
                          Færdiggør
                        </Button>
                        <button
                          type="button"
                          onClick={async () => {
                            await (supabase.from("financial_reports").update({ deleted_at: new Date().toISOString() } as any).eq("id", report.id) as any);
                            queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
                            queryClient.invalidateQueries({ queryKey: ["company-facts"] });
                            queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
                            setRefreshKey(k => k + 1);
                          }}
                          className="text-xs text-blue-700/80 dark:text-blue-300/70 hover:text-blue-900 dark:hover:text-blue-100 transition-colors"
                        >
                          Annuller upload
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Member-Centric Delivery Overview ── */}
      {reportCount >= 1 && (
        <div className="mb-6">
          <DeliveryOverview reports={dbReports} committedReportIds={committedReportIds} onUploadClick={() => setUploadExpanded(true)} />
        </div>
      )}

      {/* Manual entry banner */}
      {(() => {
        const pendingManualEntryCount = dbReports.filter(r =>
          (r.quality_signals as any)?.needs_manual_entry === true || r.status === "error"
        ).length;
        if (pendingManualEntryCount === 0) return null;
        return (
          <div className="rounded-lg border border-amber-300/50 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-950/20 p-4 mb-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-300">
                {pendingManualEntryCount === 1
                  ? "1 rapport afventer dine nøgletal"
                  : `${pendingManualEntryCount} rapporter afventer dine nøgletal`}
              </p>
              <p className="text-sm text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                Vi kunne ikke læse disse dokumenter automatisk. Det tager kun 2 minutter at
                indtaste tallene manuelt — det sikrer at din AI-analyse bliver korrekt.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Upload section — primary action after delivery status */}
      {reportCount === 0 ? (
        <div id="upload" className="mb-8" data-tour="upload-zone">
          <FileUploadZone
            title="Upload finansiel rapport"
            description="Saldobalance, resultatopgørelse eller andet regnskab — systemet genkender typen automatisk"
            accept=".xlsx,.xls,.csv,.pdf"
            conversationId={conversationId}
            userId={user?.id || null}
            companyId={companyId || null}
            onPipelineComplete={handlePipelineComplete}
          />
           <p className="text-center text-xs text-muted-foreground mt-3">
            Understøtter PDF og Excel fra e-conomic, Dinero, Billy og de fleste andre regnskabssystemer
          </p>
          <div className="text-center mt-4">
            <p className="text-xs text-muted-foreground mb-1.5">Har du et årsregnskab? Sæt en baseline med 5 nøgletal i stedet.</p>
            <Link to="/annual-baseline" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline transition-colors">
              <TrendingUp className="h-3.5 w-3.5" />
              Hurtigstart med årstal →
            </Link>
          </div>
        </div>
      ) : (
        <div id="upload" data-tour="upload-zone">
          {uploadExpanded && (
            <button
              onClick={() => setUploadExpanded(false)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              Luk upload
            </button>
          )}
          {uploadExpanded && (
            <div className="mb-8">
              <FileUploadZone
                title="Upload finansiel rapport"
                description="Saldobalance, resultatopgørelse eller andet regnskab — systemet genkender typen automatisk"
                accept=".xlsx,.xls,.csv,.pdf"
                conversationId={conversationId}
                userId={user?.id || null}
                companyId={companyId || null}
                onPipelineComplete={handlePipelineComplete}
              />
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-3">
            <Link to="/annual-baseline" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Hurtigstart med årstal →
            </Link>
          </div>
        </div>
      )}

      {/* ── Trend Charts ── */}
      {reportCount >= 3 && hasAnyPeriodData && (() => {
        const SERIES = [
          { key: "omsaetning", label: "Omsætning", color: "hsl(var(--chart-positive))" },
          { key: "daekningsbidrag", label: "Dækningsbidrag", color: "hsl(var(--chart-warning))" },
          { key: "resultat_foer_skat", label: "Resultat f. skat", color: "hsl(var(--chart-info))" },
          { key: "loenninger", label: "Lønninger", color: "hsl(var(--chart-negative))" },
          { key: "bank_balance", label: "Bank", color: "hsl(var(--chart-neutral))" },
        ];

        const getLineProps = (seriesKey: string, baseColor: string) => {
          if (!activeSeries) {
            const isMain = seriesKey === "omsaetning";
            return { strokeWidth: isMain ? 2.5 : 1, opacity: isMain ? 1 : 0.4, strokeDasharray: isMain ? undefined : "4 4" };
          }
          const isActive = activeSeries === seriesKey;
          return { strokeWidth: isActive ? 3 : 0.8, opacity: isActive ? 1 : 0.15, strokeDasharray: undefined };
        };

        return (
        <div className="bg-card border border-border shadow-sm rounded-xl p-6 mb-8 animate-fade-in">
          <h2 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Finansiel udvikling
          </h2>
          <div className="mt-3 mb-4">
            <PeriodSelector
              mode={trendPeriod.mode}
              onModeChange={trendPeriod.setMode}
              customFrom={trendPeriod.customFrom}
              customTo={trendPeriod.customTo}
              onCustomFromChange={trendPeriod.setCustomFrom}
              onCustomToChange={trendPeriod.setCustomTo}
              periodLabel={trendPeriodLabel}
            />
          </div>

          {trendData.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Ingen data i valgt periode
            </div>
          ) : (<>
          <p className="text-xs text-muted-foreground mb-4">Klik på en serie for at fremhæve</p>

          {/* Custom legend with click */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            {SERIES.map(s => {
              const isActive = activeSeries === s.key;
              const isDefault = !activeSeries && s.key === "omsaetning";
              const highlighted = isActive || isDefault;
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSeries(prev => prev === s.key ? null : s.key)}
                  className={`group flex items-center gap-1.5 text-[11px] tracking-wide transition-all duration-200 ${
                    highlighted
                      ? "opacity-100"
                      : "opacity-40 hover:opacity-80"
                  }`}
                >
                  <span
                    className={`rounded-full transition-all duration-200 ${highlighted ? "w-2 h-2" : "w-1.5 h-1.5 group-hover:w-2 group-hover:h-2"}`}
                    style={{ background: s.color }}
                  />
                  <span
                    className={`font-medium transition-colors duration-200 ${highlighted ? "" : "text-muted-foreground"}`}
                    style={highlighted ? { color: s.color } : undefined}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 18, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  {SERIES.map(s => (
                    <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatDKK(value), SERIES.find(s => s.key === name)?.label || name]}
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600 }}
                  itemStyle={{ color: "hsl(var(--muted-foreground))" }}
                />
                {SERIES.map(s => {
                  const props = getLineProps(s.key, s.color);
                  const isActive = activeSeries === s.key;
                  const isDefaultMain = !activeSeries && s.key === "omsaetning";
                  const showLabels = isActive || isDefaultMain;
                  return (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      stroke={s.color}
                      strokeWidth={props.strokeWidth}
                      opacity={props.opacity}
                      strokeDasharray={props.strokeDasharray}
                      fill={isActive || isDefaultMain ? `url(#grad-${s.key})` : "none"}
                      dot={isActive ? { r: 3, fill: s.color, strokeWidth: 0 } : false}
                      activeDot={isActive ? { r: 5 } : { r: 3 }}
                      connectNulls
                      label={showLabels ? ({ x, y, value }: any) => {
                        if (value == null) return null;
                        return (
                          <text
                            x={x}
                            y={y - 10}
                            textAnchor="middle"
                            fill={s.color}
                            fontSize={9}
                            fontWeight={500}
                            opacity={0.85}
                          >
                            {formatCompact(value)}
                          </text>
                        );
                      } : false}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Month-over-month change indicators */}
          {trendData.length >= 2 && (() => {
            const latest = trendData[trendData.length - 1];
            const prev = trendData[trendData.length - 2];
            const changes = [
              { label: "Omsætning", curr: latest.omsaetning, prev: prev.omsaetning },
              { label: "Dækningsbidrag", curr: latest.daekningsbidrag, prev: prev.daekningsbidrag },
              { label: "Resultat f. skat", curr: latest.resultat_foer_skat, prev: prev.resultat_foer_skat },
            ].filter(c => c.curr != null && c.prev != null && c.prev !== 0);

            if (changes.length === 0) return null;

            return (
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/30">
                {changes.map(c => {
                  const pct = ((c.curr - c.prev) / Math.abs(c.prev)) * 100;
                  const isUp = pct > 0;
                  const isFlat = Math.abs(pct) < 1;
                  return (
                    <div key={c.label} className="flex items-center gap-2 rounded-lg bg-secondary/30 p-3">
                      {isFlat ? (
                        <Minus className="h-4 w-4 text-muted-foreground" />
                      ) : isUp ? (
                        <TrendingUp className="h-4 w-4 text-primary" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-destructive" />
                      )}
                      <div>
                        <p className="text-[10px] text-muted-foreground">{c.label}</p>
                        <p className={`text-sm font-semibold ${isFlat ? "text-muted-foreground" : isUp ? "text-primary" : "text-destructive"}`}>
                          {isUp ? "+" : ""}{pct.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          </>)}
        </div>
        );
      })()}

      {/* AI Financial Analysis */}
      {processedReports.length > 0 && (
        <div className="mb-10">
          <AIFinancialAnalysis conversationId={conversationId} companyId={companyId} userId={user?.id || null} />
        </div>
      )}

      {/* Real DB Reports */}
      <h2 className="font-display font-semibold text-foreground text-lg mb-4 flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        Rapporter
      </h2>

      {dbReports.length === 0 ? (
        <div className="bg-card border border-border shadow-sm rounded-xl p-12 text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm text-foreground font-medium mb-1">Upload din første rapport for at komme i gang</p>
          <p className="text-xs text-muted-foreground">
            Vi understøtter PDF og Excel fra e-conomic, Dinero, Billy og de fleste andre systemer
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {availableYears.length >= 2 && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <button
                onClick={() => setYearFilter(null)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  !yearFilter
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Alle
              </button>
              {availableYears.map(year => (
                <button
                  key={year}
                  onClick={() => setYearFilter(year)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    yearFilter === year
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          )}
          {displayedReports.map((report) => {
            const needsManualEntry = (report.quality_signals as any)?.needs_manual_entry === true;
            const isTrueError = false; // All error reports now route through manual entry — no dead ends
            const hasNeedsManualFlag = (report.quality_signals as any)?.needs_manual_entry === true;
            const isUnrecoverableError = false; // All error reports get manual entry path — no dead ends
            const config = isUnrecoverableError
              ? { icon: AlertCircle, label: "Ikke genkendt", className: "text-destructive", bg: "bg-destructive/10" }
              : needsManualEntry
              ? { icon: Pencil, label: "Afventer dine tal", className: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/30" }
              : (statusConfig[report.status] || statusConfig.processing);
            const Icon = config.icon;
            const isExpanded = expandedReport === report.id;
            const msgs = chatMessages[report.id] || [];
            const aiMsgs = msgs.filter((m) => m.message_type === "ai");
            const userMsgs = msgs.filter((m) => m.message_type === "user");

            return (
              <div key={report.id} ref={(el) => { if (el) reportCardRefs.current.set(report.id, el); }} className={`bg-card border shadow-sm rounded-xl animate-fade-in overflow-hidden transition-all duration-300 ${needsManualEntry ? "border-amber-300/50 dark:border-amber-500/30" : isUnrecoverableError ? "border-destructive/30" : "border-border"}`}>
                <button
                  onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                  className="w-full p-5 text-left hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-lg bg-muted flex-shrink-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                          {getEffectiveReportPeriod(report) || report.file_name}
                          {hasManualOverride(report) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                              <Pencil className="h-2.5 w-2.5" />
                              Manuelt rettet
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground capitalize">{report.report_type}</span>
                          {report.company_name && (
                            <span className="text-xs text-muted-foreground">· {report.company_name}</span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            · {format(new Date(report.uploaded_at), "d. MMM yyyy", { locale: da })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      {(() => {
                        const cs = commitStatesQuery.data?.get(report.id);
                        if (cs?.state === "ready") {
                          const isV2Warning = cs.extraction_contract_version === 'v2' && cs.validation_status && cs.validation_status !== 'PASS';
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReviewDialogState({
                                  open: true,
                                  reportId: report.id,
                                  reportLabel: getEffectiveReportPeriod(report) || report.file_name,
                                  cardState: "ready"
                                });
                              }}
                              className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${isV2Warning ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                            >
                              {isV2Warning ? (
                                <AlertTriangle className="h-2.5 w-2.5" />
                              ) : (
                                <CheckCircle2 className="h-2.5 w-2.5" />
                              )}
                              {isV2Warning ? 'Klar — tryk for at godkende' : 'Tryk for at godkende →'}
                            </button>
                          );
                        }
                        if (cs?.state === "update_available") {
                          return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Committed ✓
                            </span>
                          );
                        }
                        if (cs?.state === "blocked") {
                          return (
                            <span className="text-[10px] text-muted-foreground italic">
                              Periode ejet af anden rapport
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {aiMsgs.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                          <Sparkles className="h-3 w-3" />
                          AI analyse
                        </span>
                      )}
                      {msgs.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          {msgs.length}
                        </span>
                      )}
                      <div className="text-right">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${config.bg} ${config.className}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {config.label}
                        </span>
                        {report.status === "processing" && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            AI analyserer rapporten — klar om ca. 30 sekunder
                          </p>
                        )}
                      </div>
                      {isAdmin && (
                        <a
                          href={`/admin/report-debug/${report.id}`}
                          onClick={(e) => { e.stopPropagation(); }}
                          title="Debug rapport"
                          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Bug className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border/50 px-5 py-5 space-y-4">
                    {/* True error guidance */}
                    {isUnrecoverableError && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <p className="text-sm text-destructive font-medium mb-1">
                          Filen blev ikke genkendt som en finansiel rapport
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Slet denne rapport og upload en resultatopgørelse eller saldobalance fra dit regnskabsprogram.
                        </p>
                      </div>
                    )}
                    {report.status === "error" && !isUnrecoverableError && (
                      <div className="rounded-lg border border-amber-300/40 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-950/10 p-3">
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">
                          Vi kunne ikke læse dokumentet automatisk
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Ingen grund til bekymring — klik "Indtast nøgletal" nedenfor og udfyld de vigtigste tal fra din rapport. Det tager 2 minutter.
                        </p>
                      </div>
                    )}
                    {/* Manual entry guidance */}
                    {needsManualEntry && !getEffectiveMetrics(report as unknown as ReportData) && (
                      <div className="rounded-lg border border-amber-300/40 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-950/10 p-3">
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          Vi kunne ikke læse dokumentet automatisk. Klik for at indtaste tallene.
                        </p>
                      </div>
                    )}
                    {/* Actions row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {report.file_path && !isLegacyPath(report.file_path) ? (
                          <button
                            onClick={() => handleViewOriginalFile(report)}
                            className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Se original fil
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Originalfil ikke tilgængelig (uploadet før fillagring)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {(needsManualEntry || report.status === "error") && !isUnrecoverableError && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setReviewDialogState({ open: true, reportId: report.id, reportLabel: getEffectiveReportPeriod(report) || report.file_name, cardState: "ready" }); }}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Indtast nøgletal →
                          </button>
                        )}
                        {!needsManualEntry && (() => {
                          const cs = commitStatesQuery.data?.get(report.id);
                          if (cs?.state === "ready") {
                            return (
                              <button
                                onClick={(e) => { e.stopPropagation(); setReviewDialogState({ open: true, reportId: report.id, reportLabel: getEffectiveReportPeriod(report) || report.file_name, cardState: "ready" }); }}
                                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Godkend data
                              </button>
                            );
                          }
                          if (cs?.state === "update_available") {
                            return (
                              <button
                                onClick={(e) => { e.stopPropagation(); setReviewDialogState({ open: true, reportId: report.id, reportLabel: getEffectiveReportPeriod(report) || report.file_name, cardState: "update_available" }); }}
                                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Opdater committed data
                              </button>
                            );
                          }
                          return null;
                        })()}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOverrideReport(report);
                          }}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
                            (() => {
                              const cs = commitStatesQuery.data?.get(report.id);
                              return cs?.state === "ready" || cs?.state === "update_available";
                            })()
                              ? "text-foreground/70 hover:text-foreground"
                              : "px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                          }`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Ret data manuelt
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteDialog({ open: true, report });
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive/70 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Slet rapport
                        </button>
                      </div>
                    </div>
                    {getEffectiveMetrics(report as unknown as ReportData) && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Nøgletal
                        </h4>
                        {renderEffectiveKeyFigures(report)}
                      </div>
                    )}

                    {aiMsgs.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 text-primary" />
                          AI-analyse
                        </h4>
                        <div className="space-y-2">
                          {aiMsgs.map((msg) => (
                            <div key={msg.id} className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                              <p className="text-[10px] text-muted-foreground mt-2">
                                {format(new Date(msg.created_at), "d. MMM yyyy HH:mm", { locale: da })}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {userMsgs.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <MessageSquare className="h-3 w-3" />
                          Kommentarer ({userMsgs.length})
                        </h4>
                        <div className="space-y-2">
                          {userMsgs.map((msg) => {
                            const isOwn = msg.sender_id === user?.id;
                            const authorName = isOwn ? "Dig" : (advisorProfiles[msg.sender_id] || "Advisor");
                            return (
                              <div key={msg.id} className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                                <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                                  <span className="text-[9px] font-medium text-foreground">
                                    {authorName === "Dig" ? "Du" : authorName.split(" ").map(w => w[0]).join("")}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-semibold text-foreground">{authorName}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(msg.created_at), "d. MMM yyyy HH:mm", { locale: da })}
                                    </span>
                                  </div>
                                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{msg.content}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-3 border-t border-border/30">
                      <textarea
                        value={commentInputs[report.id] || ""}
                        onChange={(e) =>
                          setCommentInputs((prev) => ({ ...prev, [report.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmitComment(report.id, getEffectiveReportPeriod(report as any) || report.file_name);
                          }
                        }}
                        placeholder="Skriv en kommentar — sendes i chatten"
                        maxLength={2000}
                        rows={1}
                        className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => handleSubmitComment(report.id, getEffectiveReportPeriod(report as any) || report.file_name)}
                        disabled={!(commentInputs[report.id] || "").trim() || submittingComment === report.id}
                        className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>

                    {!report.extracted_data && aiMsgs.length === 0 && userMsgs.length === 0 && (
                      <div className="text-center py-4">
                        <Sparkles className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Rapporten behandles — nøgletal vises når den er klar</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !deleting && setDeleteDialog({ open, report: open ? deleteDialog.report : null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet rapport?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteDialog.report?.report_period || deleteDialog.report?.file_name}</strong> flyttes til papirkurven.
              <p className="mt-2 text-xs text-muted-foreground">Rapporten og alle tilknyttede data bevares og kan gendannes af en administrator.</p>
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

      {/* ── Annual Reports Section ── */}
      {!isAdvisor && (
        <div id="annual-reports" className="bg-card border border-border shadow-sm rounded-xl p-6 mb-8 scroll-mt-24">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
                <BookMarked className="h-5 w-5 text-primary" />
                Historiske årsrapporter
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Upload din årsrapport fra revisor (PDF) for at berige dine historiske data. Tallene fordeles jævnt over årets 12 måneder.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-muted-foreground">Regnskabsår:</span>
            {(["2024", "2025"] as const).map(y => (
              <button
                key={y}
                onClick={() => setAnnualUploadYear(y)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  annualUploadYear === y
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {annualReports.length > 0 && (
            <div className="space-y-2 mb-4">
              {annualReports.map(r => {
                const isError = r.status === "error";
                const isProcessing = r.status === "processing";
                const isErrorExpanded = expandedAnnualError === r.id;
                const isSuccessExpanded = expandedAnnualSuccess === r.id;
                const sl = r.success_log;
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border ${
                      isError
                        ? "bg-destructive/5 border-destructive/30"
                        : "bg-secondary/30 border-border/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      {isError ? (
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                      ) : isProcessing ? (
                        <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">Årsrapport {r.year}</p>
                        <p className={`text-xs ${isError ? "text-destructive" : "text-muted-foreground"}`}>
                          {isError
                            ? `Fejl${r.error_log?.step ? ` i trin: ${r.error_log.step}` : ""}${r.error_log?.message ? ` — ${r.error_log.message}` : ""}`
                            : isProcessing
                              ? "Behandles…"
                              : sl?.inserted_count != null
                                ? `${sl.inserted_count} af ${sl.total_months ?? 12} månedstal oprettet${(sl.protected_count ?? 0) > 0 ? ` · ${sl.protected_count} beskyttet` : ""} · år ${sl.year ?? r.year}`
                                : r.inserted != null
                                  ? `${r.inserted} måneder opdateret`
                                  : "Importeret — fordelt over 12 måneder"}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          isError
                            ? "bg-destructive/10 text-destructive"
                            : isProcessing
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary/10 text-primary"
                        }`}
                      >
                        {isError ? "Fejlet" : isProcessing ? "Behandles" : "Aktiv"}
                      </span>
                      {isError && r.error_log && (
                        <button
                          onClick={() => setExpandedAnnualError(isErrorExpanded ? null : r.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          title={isErrorExpanded ? "Skjul detaljer" : "Vis detaljer"}
                        >
                          {isErrorExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                      {!isError && !isProcessing && sl && (
                        <button
                          onClick={() => setExpandedAnnualSuccess(isSuccessExpanded ? null : r.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          title={isSuccessExpanded ? "Skjul status" : "Vis status"}
                        >
                          {isSuccessExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteAnnualReport(r.id, r.year)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Slet årsrapport"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {isError && isErrorExpanded && r.error_log && (
                      <div className="px-3 pb-3 -mt-1">
                        <div className="rounded-md bg-background/60 border border-destructive/20 p-3 space-y-1.5 text-xs">
                          {r.error_log.step && (
                            <div><span className="text-muted-foreground">Trin: </span><span className="font-mono text-foreground">{r.error_log.step}</span></div>
                          )}
                          {r.error_log.message && (
                            <div><span className="text-muted-foreground">Fejlbesked: </span><span className="font-mono text-foreground break-all">{r.error_log.message}</span></div>
                          )}
                          {r.error_log.code && (
                            <div><span className="text-muted-foreground">DB-kode: </span><span className="font-mono text-foreground">{String(r.error_log.code)}</span></div>
                          )}
                          {r.error_log.details && (
                            <div><span className="text-muted-foreground">Detaljer: </span><span className="font-mono text-foreground break-all">{String(r.error_log.details)}</span></div>
                          )}
                          {r.error_log.hint && (
                            <div><span className="text-muted-foreground">Hint: </span><span className="font-mono text-foreground break-all">{String(r.error_log.hint)}</span></div>
                          )}
                          {r.error_log.http_status && (
                            <div><span className="text-muted-foreground">HTTP: </span><span className="font-mono text-foreground">{String(r.error_log.http_status)}</span></div>
                          )}
                          {r.error_log.at && (
                            <div><span className="text-muted-foreground">Tidspunkt: </span><span className="font-mono text-foreground">{r.error_log.at}</span></div>
                          )}
                          <p className="text-muted-foreground pt-1.5 border-t border-border/50">
                            Slet rapporten og prøv at uploade igen. Hvis fejlen gentager sig, kontakt support med ovenstående detaljer.
                          </p>
                        </div>
                      </div>
                    )}
                    {!isError && !isProcessing && isSuccessExpanded && sl && (
                      <div className="px-3 pb-3 -mt-1">
                        <div className="rounded-md bg-background/60 border border-primary/20 p-3 space-y-1.5 text-xs">
                          <div className="flex items-center gap-2 pb-1.5 border-b border-border/50">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                            <span className="font-medium text-foreground">Importstatus</span>
                          </div>
                          <div><span className="text-muted-foreground">Anvendt regnskabsår: </span><span className="font-mono text-foreground">{sl.year ?? r.year}</span></div>
                          <div><span className="text-muted-foreground">Månedstal oprettet: </span><span className="font-mono text-foreground">{sl.inserted_count ?? 0} af {sl.total_months ?? 12}</span></div>
                          {(sl.protected_count ?? 0) > 0 && (
                            <div><span className="text-muted-foreground">Beskyttede måneder (havde rigtige tal): </span><span className="font-mono text-foreground">{sl.protected_count}</span></div>
                          )}
                          {sl.metrics_keys && sl.metrics_keys.length > 0 && (
                            <div><span className="text-muted-foreground">Udtrukne nøgletal: </span><span className="font-mono text-foreground break-all">{sl.metrics_keys.join(", ")}</span></div>
                          )}
                          {(() => {
                            const hasRevenue = r.metrics_preview?.nettoomsaetning != null &&
                              r.metrics_preview.nettoomsaetning !== 0;
                            const isEditing = editingAnnualField?.reportId === r.id;
                            if (isEditing) {
                              return (
                                <div className="mt-2 pt-2 border-t border-border/30">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Indtast årets omsætning manuelt
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={manualRevenue}
                                      onChange={e => setManualRevenue(e.target.value)}
                                      placeholder="eks. 1.250.000"
                                      className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                      autoFocus
                                      onKeyDown={e => {
                                        if (e.key === "Enter") handleSaveManualRevenue(r.id, r.year);
                                        if (e.key === "Escape") { setEditingAnnualField(null); setManualRevenue(""); }
                                      }}
                                    />
                                    <button
                                      onClick={() => handleSaveManualRevenue(r.id, r.year)}
                                      disabled={savingManualRevenue}
                                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                    >
                                      {savingManualRevenue ? "Gemmer..." : "Gem"}
                                    </button>
                                    <button
                                      onClick={() => { setEditingAnnualField(null); setManualRevenue(""); }}
                                      className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors"
                                    >
                                      Annullér
                                    </button>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    Beløbet fordeles automatisk med 1/12 pr. måned over {r.year}
                                  </p>
                                </div>
                              );
                            }
                            return (
                              <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between">
                                <div>
                                  <p className="text-[10px] text-muted-foreground">
                                    Omsætning: {hasRevenue
                                      ? `${new Intl.NumberFormat("da-DK").format(r.metrics_preview!.nettoomsaetning!)} kr.`
                                      : <span className="text-amber-600 dark:text-amber-400">Ikke fundet i rapporten</span>
                                    }
                                  </p>
                                </div>
                                <button
                                  onClick={() => {
                                    setEditingAnnualField({ reportId: r.id, year: r.year });
                                    setManualRevenue(hasRevenue ? String(r.metrics_preview!.nettoomsaetning) : "");
                                  }}
                                  className="text-[10px] text-primary hover:underline flex items-center gap-1"
                                >
                                  <Pencil className="h-3 w-3" />
                                  {hasRevenue ? "Ret" : "Tilføj omsætning"}
                                </button>
                              </div>
                            );
                          })()}
                          {sl.completed_at && (
                            <div><span className="text-muted-foreground">Gennemført: </span><span className="font-mono text-foreground">{new Date(sl.completed_at).toLocaleString("da-DK")}</span></div>
                          )}
                          <p className="text-muted-foreground pt-1.5 border-t border-border/50">
                            Beløbene er fordelt jævnt (1/12) over årets 12 måneder og er nu synlige i Dashboard, KPI'er og AI-chat.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && file.type === "application/pdf") handleAnnualUpload(file);
              else toast.error("Kun PDF-filer understøttes");
            }}
            onClick={() => !annualUploading && document.getElementById("annual-report-upload")?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              annualUploading
                ? "border-primary/30 bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-accent/20"
            }`}
          >
            <input
              id="annual-report-upload"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAnnualUpload(file);
                e.target.value = "";
              }}
            />
            {annualUploading ? (
              <>
                <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Behandler årsrapport {annualUploadYear}…</p>
                <p className="text-xs text-muted-foreground mt-1">AI læser tallene — det tager 15-30 sekunder</p>
              </>
            ) : (
              <>
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">
                  Upload årsrapport {annualUploadYear} som PDF
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Træk PDF hertil eller klik for at vælge · Fra revisor, BDO, Deloitte, PWC mv.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Trash section for advisors */}
      {isAdvisor && (
        <div className="mt-12">
          <button
            onClick={() => setShowTrash(!showTrash)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <Archive className="h-4 w-4" />
            Papirkurv
            {showTrash ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {showTrash && (
            <div className="space-y-3">
              {trashedReports.length === 0 ? (
                <div className="glass-card rounded-xl p-8 text-center">
                  <Trash2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Papirkurven er tom</p>
                </div>
              ) : (
                trashedReports.map((report) => (
                  <div key={report.id} className="glass-card rounded-xl p-4 flex items-center justify-between opacity-70">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-muted">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {report.report_period || report.file_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {report.report_type} · {format(new Date(report.uploaded_at), "d. MMM yyyy", { locale: da })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleRestoreReport(report)}
                        disabled={restoring === report.id}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className={`h-3.5 w-3.5 ${restoring === report.id ? "animate-spin" : ""}`} />
                        Gendan
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(report)}
                        disabled={permanentDeleting === report.id}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive/70 hover:text-destructive transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {permanentDeleting === report.id ? "Sletter..." : "Slet permanent"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
      {/* Manual Override Drawer */}
      {overrideReport && (
        <ReportManualOverride
          report={overrideReport}
          open={!!overrideReport}
          onOpenChange={(open) => { if (!open) setOverrideReport(null); }}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}
      {/* RP-1: Review Dialog */}
      <ReportReviewDialog
        reportId={reviewDialogState.reportId}
        reportLabel={reviewDialogState.reportLabel}
        cardState={reviewDialogState.cardState}
        open={reviewDialogState.open}
        onOpenChange={(open) => {
          setReviewDialogState(prev => ({ ...prev, open }));
          if (!open) {
            // Refresh commit states + report list after closing
            commitStatesQuery.refetch();
            setRefreshKey(k => k + 1);
          }
        }}
      />
    </AppLayout>
  );
};

export default Reports;
