import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { notifyChatMessage } from "@/lib/chatNotify";
import FileUploadZone from "@/components/FileUploadZone";
import AIFinancialAnalysis from "@/components/AIFinancialAnalysis";
import FinancialOverview from "@/components/FinancialOverview";
import PerformanceOverview from "@/components/PerformanceOverview";
import DeliveryOverview from "@/components/DeliveryOverview";
import PeriodSelector, { usePeriodFilter } from "@/components/PeriodSelector";
import ReportManualOverride from "@/components/ReportManualOverride";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
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
import { toast } from "@/hooks/use-toast";
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
  error: { icon: AlertCircle, ...reportStatusConfig.error },
};

const Reports = () => {
  const { user, companyId, isAdvisor, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [dbReports, setDbReports] = useState<DbReport[]>([]);
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const trendPeriod = usePeriodFilter();
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMsg[]>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [advisorProfiles, setAdvisorProfiles] = useState<Record<string, string>>({});
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; report: DbReport | null }>({ open: false, report: null });
  const [deleting, setDeleting] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashedReports, setTrashedReports] = useState<DbReport[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    const [reportsRes, convRes] = await Promise.all([
      (supabase
        .from("financial_reports")
        .select("id, file_name, file_path, report_type, report_period, company_name, uploaded_at, status, extracted_data, normalized_data, manual_report_period_label, manual_report_period_key, manual_report_type, manual_normalized_data, manual_override_status, manual_override_note, manual_override_by, manual_override_at, manual_override_source") as any)
        .eq("company_id", companyId)
        .is("deleted_at", null)
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

  const reportsByMonth = useMemo(() => {
    const map: Record<string, DbReport> = {};
    const sorted = [...dbReports].sort((a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());
    sorted.forEach((r) => {
      const key = getEffectiveReportPeriodKey(r);
      if (key) {
        const existing = map[key];
        if (!existing || r.status === "processed") {
          map[key] = r;
        }
      }
    });
    return map;
  }, [dbReports]);

  // (delivery overview logic is now in DeliveryOverview component)


  // Build trend data for charts (canonical-first)
  const trendData = useMemo(() => {
    const sortedKeys = Object.keys(reportsByMonth).sort();
    const filteredKeys = trendPeriod.filterKeys(sortedKeys);
    return filteredKeys
      .map((key) => {
        const r = reportsByMonth[key];
        if (r.status !== "processed") return null;
        const result = getCanonicalOrLegacyMetrics(r);
        if (!result) return null;
        const kf = result.metrics;
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
  }, [reportsByMonth, trendPeriod.mode, trendPeriod.customFrom, trendPeriod.customTo]);

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

  const handlePipelineComplete = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleDeleteReport = useCallback(async (report: DbReport) => {
    setDeleting(true);
    try {
      // Soft-delete: set deleted_at timestamp instead of removing data
      const { error } = await (supabase.from("financial_reports").update({ deleted_at: new Date().toISOString(), status: "deleted" } as any).eq("id", report.id) as any);
      if (error) throw error;

      setDbReports((prev) => prev.filter((r) => r.id !== report.id));
      setDeleteDialog({ open: false, report: null });
      toast({ title: "Rapport flyttet til papirkurv", description: `${report.report_period || report.file_name} kan gendannes af en administrator.` });
    } catch (err) {
      console.error("Soft-delete error:", err);
      toast({ title: "Fejl", description: "Kunne ikke slette rapporten. Prøv igen.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }, []);

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
      toast({ title: "Rapport gendannet", description: `${report.report_period || report.file_name} er gendannet.` });
    } catch (err) {
      console.error("Restore error:", err);
      toast({ title: "Fejl", description: "Kunne ikke gendanne rapporten.", variant: "destructive" });
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
      const { error } = await supabase.from("financial_reports").delete().eq("id", report.id);
      if (error) throw error;
      setTrashedReports((prev) => prev.filter((r) => r.id !== report.id));
      toast({ title: "Permanent slettet", description: `${report.report_period || report.file_name} er fjernet permanent.` });
    } catch (err) {
      console.error("Permanent delete error:", err);
      toast({ title: "Fejl", description: "Kunne ikke slette rapporten permanent.", variant: "destructive" });
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
      toast({ title: "Fil uploadet", description: "Originalfilen er nu tilknyttet rapporten." });
    } else {
      toast({ title: "Upload fejlede", description: "Kunne ikke uploade filen. Prøv igen.", variant: "destructive" });
    }
  };

  const renderExtractedData = (data: Json | null) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const obj = data as Record<string, Json | undefined>;
    const kf = obj.key_figures as Record<string, number> | undefined;
    if (!kf) return null;

    const stats = [
      { label: "Omsætning", value: formatDKK(kf.omsaetning), sub: kf.omsaetning_aar != null ? `Å.t.d: ${formatDKK(kf.omsaetning_aar)}` : undefined },
      { label: "Dækningsbidrag", value: formatDKK(kf.daekningsbidrag), sub: kf.daekningsbidrag_aar != null ? `Å.t.d: ${formatDKK(kf.daekningsbidrag_aar)}` : undefined },
      { label: "Lønninger", value: formatDKK(kf.loenninger) },
      { label: "Resultat f. skat", value: formatDKK(kf.resultat_foer_skat), sub: kf.resultat_foer_skat_aar != null ? `Å.t.d: ${formatDKK(kf.resultat_foer_skat_aar)}` : undefined },
      kf.aktiver_i_alt != null ? { label: "Aktiver", value: formatDKK(kf.aktiver_i_alt) } : null,
      kf.egenkapital != null ? { label: "Egenkapital", value: formatDKK(kf.egenkapital) } : null,
      kf.bank_balance != null ? { label: "Bank", value: formatDKK(kf.bank_balance) } : null,
      kf.debitorer != null ? { label: "Debitorer", value: formatDKK(kf.debitorer) } : null,
      kf.kreditorer != null ? { label: "Kreditorer", value: formatDKK(kf.kreditorer) } : null,
    ].filter(Boolean) as { label: string; value: string; sub?: string }[];

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border/50 bg-background/50 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{s.value}</p>
            {s.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>
    );
  };

  if (isAdvisor && !companyId) {
    return (
      <AppLayout>
        <AdvisorCompanyPrompt />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
          Rapportering
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload dokumenter, følg udviklingen og få AI-analyse
        </p>
      </div>

      {/* ── Member-Centric Delivery Overview ── */}
      <div className="mb-8">
        <DeliveryOverview reports={dbReports} />
      </div>

      {/* ── Trend Charts ── */}
      {Object.keys(reportsByMonth).length > 0 && (() => {
        const SERIES = [
          { key: "omsaetning", label: "Omsætning", color: "hsl(160, 84%, 39%)" },
          { key: "daekningsbidrag", label: "Dækningsbidrag", color: "hsl(38, 92%, 50%)" },
          { key: "resultat_foer_skat", label: "Resultat f. skat", color: "hsl(217, 91%, 60%)" },
          { key: "loenninger", label: "Lønninger", color: "hsl(280, 65%, 60%)" },
          { key: "bank_balance", label: "Bank", color: "hsl(190, 80%, 50%)" },
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
        <div className="glass-card rounded-xl p-6 mb-8 animate-fade-in">
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
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }}
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

      {/* Upload section */}
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

      {/* AI Financial Analysis */}
      <div className="mb-8">
        <AIFinancialAnalysis conversationId={conversationId} companyId={companyId} userId={user?.id || null} />
      </div>

      {/* Detaljeret Finansiel Oversigt */}
      <div className="mb-8">
        <FinancialOverview reports={dbReports} />
      </div>

      {/* Performance Oversigt */}
      <div className="mb-8">
        <PerformanceOverview reports={dbReports} />
      </div>

      {/* Real DB Reports */}
      <h2 className="font-display font-semibold text-foreground text-lg mb-4 flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        Rapporter & Feedback
      </h2>

      {dbReports.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-foreground font-medium mb-1">Ingen rapporter endnu</p>
          <p className="text-xs text-muted-foreground">
            Upload en saldobalance eller resultatopgørelse ovenfor for at komme i gang
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {dbReports.map((report) => {
            const config = statusConfig[report.status] || statusConfig.processing;
            const Icon = config.icon;
            const isExpanded = expandedReport === report.id;
            const msgs = chatMessages[report.id] || [];
            const aiMsgs = msgs.filter((m) => m.message_type === "ai" || m.message_type === "system");
            const userMsgs = msgs.filter((m) => m.message_type === "user");

            return (
              <div key={report.id} ref={(el) => { if (el) reportCardRefs.current.set(report.id, el); }} className="glass-card rounded-xl animate-fade-in overflow-hidden transition-all duration-300">
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
                        <p className="text-sm font-semibold text-foreground">
                          {report.report_period || report.file_name}
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
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${config.bg} ${config.className}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </span>
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
                  <div className="border-t border-border/50 px-5 py-5 space-y-5">
                    {/* Actions row */}
                    <div className="flex items-center justify-between">
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
                    {report.extracted_data && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Nøgletal
                        </h4>
                        {renderExtractedData(report.extracted_data)}
                      </div>
                    )}

                    {aiMsgs.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 text-primary" />
                          AI Analyse & Aktivitet
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
                            handleSubmitComment(report.id, report.report_period || report.file_name);
                          }
                        }}
                        placeholder="Skriv en kommentar (sendes til chatten)..."
                        maxLength={2000}
                        rows={1}
                        className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => handleSubmitComment(report.id, report.report_period || report.file_name)}
                        disabled={!(commentInputs[report.id] || "").trim() || submittingComment === report.id}
                        className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>

                    {!report.extracted_data && aiMsgs.length === 0 && userMsgs.length === 0 && (
                      <div className="text-center py-4">
                        <Sparkles className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Rapport behandles...</p>
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
    </AppLayout>
  );
};

export default Reports;
