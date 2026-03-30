import { useState, useEffect, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AdvisorCompanyPrompt from "@/components/AdvisorCompanyPrompt";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Flame,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Users,
  Pencil,
  Save,
  X,
  Info,
  MessageSquare,
  Download,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatCompact, calcTotalExpenses, calcDbMargin, calcResultMargin, SHORT_MONTHS } from "@/lib/financialUtils";
import IndustryBenchmarkGauge from "@/components/IndustryBenchmarkGauge";
import type { GaugeEntry } from "@/components/IndustryBenchmarkGauge";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { toast } from "sonner";
import { KPI_FALLBACK_TARGETS, KPI_DEFAULT_BENCHMARKS, INDUSTRY_TEMPLATES } from "@/lib/appConfig";
import type { BenchmarkTemplate } from "@/lib/appConfig";

interface KPIMetric {
  key: string;
  label: string;
  value: string;
  numValue: number;
  target: string;
  targetNum: number;
  change: string;
  changePct: number;
  trend: "up" | "down";
  unit: string;
  icon: any;
  description: string;
  lowerIsBetter: boolean;
  history: { month: string; periodKey: string; value: number }[];
  benchmark: { value: number; label: string; source: string };
}

interface KPITargetRow {
  kpi_key: string;
  target_value: number;
  target_label: string;
  lower_is_better: boolean;
}

interface KPIBenchmarkRow {
  kpi_key: string;
  benchmark_value: number;
  benchmark_label: string;
  source_label: string;
}

// Re-exported from central config
const FALLBACK_TARGETS = KPI_FALLBACK_TARGETS;
const DEFAULT_BENCHMARKS = KPI_DEFAULT_BENCHMARKS;

const KPI_DEFS = [
  { key: "omsaetning", label: "Omsætning", unit: "DKK", icon: DollarSign, description: "Månedlig omsætning", lowerIsBetter: false },
  { key: "db_margin", label: "DB Margin", unit: "%", icon: TrendingUp, description: "Dækningsgrad (Omsætning − direkte omk.)", lowerIsBetter: false },
  { key: "loenninger", label: "Lønninger", unit: "DKK", icon: Users, description: "Månedlige lønomkostninger", lowerIsBetter: true },
  { key: "resultat", label: "Resultat", unit: "DKK", icon: Target, description: "Resultat før skat", lowerIsBetter: false },
  { key: "omkostninger", label: "Omk. total", unit: "DKK", icon: Flame, description: "Samlede omkostninger", lowerIsBetter: true },
  { key: "ebitda_margin", label: "Resultat Margin", unit: "%", icon: BarChart3, description: "Resultat før skat i % af omsætning", lowerIsBetter: false },
];

const VALUE_EXTRACTORS: Record<string, (kf: Record<string, number>) => number | null> = {
  omsaetning: (kf) => kf.omsaetning ?? null,
  db_margin: (kf) => calcDbMargin(kf) ?? null,
  loenninger: (kf) => kf.loenninger != null ? Math.abs(kf.loenninger) : null,
  resultat: (kf) => kf.resultat_foer_skat ?? null,
  omkostninger: (kf) => { const v = calcTotalExpenses(kf); return v > 0 ? v : null; },
  ebitda_margin: (kf) => calcResultMargin(kf) ?? null,
};

const tooltipStyle = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

interface CustomDotProps {
  cx?: number; cy?: number; payload?: { periodKey: string; month: string };
  hasComment: boolean;
  isAdvisor: boolean;
  onClick: (periodKey: string, periodLabel: string, x: number, y: number) => void;
}

const CustomDot = ({ cx = 0, cy = 0, payload, hasComment, isAdvisor, onClick }: CustomDotProps) => {
  if (!payload) return null;
  return (
    <g>
      <circle
        cx={cx} cy={cy} r={hasComment ? 6 : 4}
        fill={hasComment ? "hsl(var(--primary))" : "hsl(160, 84%, 39%)"}
        stroke={hasComment ? "hsl(var(--background))" : "none"}
        strokeWidth={2}
        style={{ cursor: isAdvisor ? "pointer" : "default" }}
        onClick={() => isAdvisor && onClick(payload.periodKey, payload.month, cx, cy)}
      />
      {hasComment && (
        <circle cx={cx + 5} cy={cy - 5} r={3} fill="hsl(var(--primary))" />
      )}
    </g>
  );
};

const KPIs = () => {
  const { user, companyId, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const { data: facts = [], isLoading: factsLoading } = useCompanyFacts();
  const [userTargets, setUserTargets] = useState<Record<string, KPITargetRow>>({});
  const [userBenchmarks, setUserBenchmarks] = useState<Record<string, KPIBenchmarkRow>>({});
  const [loading, setLoading] = useState(true);
  const [selectedKPI, setSelectedKPI] = useState<string>("omsaetning");
  const [editingTargets, setEditingTargets] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, { value: string; label: string }>>({});
  const [editingBenchmarks, setEditingBenchmarks] = useState(false);
  const [editBenchmarkValues, setEditBenchmarkValues] = useState<Record<string, { value: string; label: string; source: string }>>({});
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { exportKPIReport } = await import("@/lib/exportPdf");
      const { data: companyRow } = await supabase.from("companies").select("name").eq("id", companyId!).maybeSingle();
      const companyName = companyRow?.name || "rapport";
      const date = new Date().toLocaleDateString("da-DK", { month: "short", year: "numeric" }).replace(" ", "-");
      await exportKPIReport("kpi-export-area", `${companyName}-kpi-${date}.pdf`);
    } catch (e) {
      toast.error("PDF-eksport fejlede. Prøv igen.");
    }
    setExporting(false);
  };

  const { data: budgetData } = useQuery({
    queryKey: ["budget-for-kpi-targets", companyId],
    queryFn: async () => {
      const { data } = await (supabase
        .from("budget_targets")
        .select("category, budget_amount, period") as any)
        .eq("company_id", companyId!)
        .like("period", `${new Date().getFullYear()}-base-%`);
      return (data || []) as { category: string; budget_amount: number; period: string }[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  // Fetch company industry benchmarks
  const { data: industryBenchmarkData } = useQuery({
    queryKey: ["industry-benchmarks-for-company", companyId],
    queryFn: async () => {
      const { data: company } = await supabase
        .from("companies")
        .select("industry_code, industry_label")
        .eq("id", companyId!)
        .maybeSingle();
      if (!company?.industry_code) return null;

      const { data: benchmarks } = await supabase
        .from("industry_benchmarks")
        .select("kpi_key, benchmark_value, benchmark_label, benchmark_min, benchmark_max, source_label")
        .eq("industry_code", company.industry_code);

      return {
        industryCode: company.industry_code,
        industryLabel: company.industry_label,
        benchmarks: (benchmarks || []) as {
          kpi_key: string;
          benchmark_value: number;
          benchmark_label: string;
          benchmark_min: number;
          benchmark_max: number;
          source_label: string;
        }[],
      };
    },
    enabled: !!companyId && !isAdvisor,
    staleTime: 10 * 60_000,
  });

  const { data: chartComments = [], refetch: refetchComments } = useQuery({
    queryKey: ["kpi-chart-comments", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("kpi_chart_comments" as any)
        .select("id, period_key, period_label, kpi_key, content, author_id, created_at") as any)
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data || []) as any as { id: string; period_key: string; period_label: string; kpi_key: string; content: string; author_id: string; created_at: string }[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const [commentPopover, setCommentPopover] = useState<{
    periodKey: string;
    periodLabel: string;
    x: number;
    y: number;
  } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  const budgetTotals = useMemo(() => {
    if (!budgetData?.length) return null;
    const revenue = budgetData
      .filter(b => b.category === "omsaetning")
      .reduce((s, b) => s + b.budget_amount, 0);
    const costs = budgetData
      .filter(b => b.category !== "omsaetning" && !b.category.startsWith("__"))
      .reduce((s, b) => s + b.budget_amount, 0);
    const ebitda = revenue - costs;
    return { revenue: Math.round(revenue), ebitda: Math.round(ebitda) };
  }, [budgetData]);

  useEffect(() => {
    if (!user || !companyId) return;
    const load = async () => {
      const [targetsRes, benchmarksRes] = await Promise.all([
        supabase
          .from("kpi_targets")
          .select("kpi_key, target_value, target_label, lower_is_better")
          .eq("company_id", companyId),
        supabase
          .from("kpi_benchmarks")
          .select("kpi_key, benchmark_value, benchmark_label, source_label")
          .eq("company_id", companyId),
      ]);

      const tMap: Record<string, KPITargetRow> = {};
      (targetsRes.data || []).forEach((t: any) => {
        tMap[t.kpi_key] = t;
      });
      setUserTargets(tMap);

      const bMap: Record<string, KPIBenchmarkRow> = {};
      (benchmarksRes.data || []).forEach((b: any) => {
        bMap[b.kpi_key] = b;
      });
      setUserBenchmarks(bMap);
      setLoading(false);
    };
    load();
  }, [user, companyId]);

  // Resolve target for a KPI key
  const getTarget = (key: string) => {
    const ut = userTargets[key];
    if (ut) return { value: Number(ut.target_value), label: ut.target_label };
    return FALLBACK_TARGETS[key] || { value: 0, label: "—" };
  };

  // Build sorted monthly data points from facts
  const monthlyData = useMemo(() => {
    return facts.map((f) => {
      const kf = factsToDanishMetrics(f.metrics);
      const [, monthStr] = f.period_key.split("-");
      const monthIdx = parseInt(monthStr, 10) - 1;
      const monthLabel = SHORT_MONTHS[monthIdx] || monthStr;
      return { sortKey: f.period_key, month: monthLabel, kf };
    });
    // Already sorted by period_key from useCompanyFacts
  }, [facts]);

  // Derive KPI metrics
  const kpiMetrics: KPIMetric[] = useMemo(() => {
    if (monthlyData.length === 0) return [];
    const latest = monthlyData[monthlyData.length - 1].kf;
    const prev = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].kf : null;

    return KPI_DEFS.map((def) => {
      const extract = VALUE_EXTRACTORS[def.key];
      const currentVal = extract(latest);
      if (currentVal == null) return null;
      const prevVal = prev ? extract(prev) : null;
      const changePct = prevVal != null && currentVal != null && prevVal !== 0
        ? ((currentVal - prevVal) / Math.abs(prevVal)) * 100 : 0;
      const trendIsGood = def.lowerIsBetter ? changePct <= 0 : changePct >= 0;
      const target = getTarget(def.key);

      const history = monthlyData.map((d) => ({
        month: d.month,
        periodKey: d.sortKey,
        value: Math.round(extract(d.kf) ?? 0),
      }));

      const formatted = Math.abs(currentVal) >= 1000
        ? currentVal.toLocaleString("da-DK", { maximumFractionDigits: 0 })
        : currentVal.toFixed(1);

      const ub = userBenchmarks[def.key];
      const benchmark = ub
        ? { value: Number(ub.benchmark_value), label: ub.benchmark_label, source: ub.source_label }
        : DEFAULT_BENCHMARKS[def.key] || { value: 0, label: "—", source: "" };

      return {
        key: def.key,
        label: def.label,
        value: formatted,
        numValue: currentVal,
        target: target.label,
        targetNum: target.value,
        change: `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`,
        changePct,
        trend: trendIsGood ? "up" : "down",
        unit: def.unit,
        icon: def.icon,
        description: def.description,
        lowerIsBetter: def.lowerIsBetter,
        history,
        benchmark,
      };
    }).filter(Boolean) as KPIMetric[];
  }, [monthlyData, userTargets, userBenchmarks]);

  // Target editing
  const startEditingTargets = () => {
    const vals: Record<string, { value: string; label: string }> = {};
    KPI_DEFS.forEach((def) => {
      const t = getTarget(def.key);
      vals[def.key] = { value: String(t.value), label: t.label };
    });
    setEditValues(vals);
    setEditingTargets(true);
  };

  const cancelEditingTargets = () => {
    setEditingTargets(false);
    setEditValues({});
  };

  const saveTargets = async () => {
    if (!user) return;
    setSaving(true);

    const upserts = KPI_DEFS.map((def) => {
      const ev = editValues[def.key];
      const numVal = parseFloat(ev?.value || "0") || 0;
      const label = ev?.label?.trim() || String(numVal);
      return {
        user_id: user.id,
        company_id: companyId,
        kpi_key: def.key,
        target_value: numVal,
        target_label: label,
        lower_is_better: def.lowerIsBetter,
      };
    });

    const { error } = await supabase.from("kpi_targets").upsert(upserts, { onConflict: "company_id,kpi_key" });

    if (error) {
      toast.error("Kunne ikke gemme targets");
      console.error(error);
    } else {
      // Update local state
      const tMap: Record<string, KPITargetRow> = {};
      upserts.forEach((u) => {
        tMap[u.kpi_key] = u;
      });
      setUserTargets(tMap);
      toast.success("KPI-targets gemt");
    }

    setEditingTargets(false);
    setEditValues({});
    setSaving(false);
  };

  // Benchmark editing
  const getBenchmark = (key: string) => {
    const ub = userBenchmarks[key];
    if (ub) return { value: Number(ub.benchmark_value), label: ub.benchmark_label, source: ub.source_label };
    return DEFAULT_BENCHMARKS[key] || { value: 0, label: "—", source: "" };
  };

  const startEditingBenchmarks = () => {
    const vals: Record<string, { value: string; label: string; source: string }> = {};
    KPI_DEFS.forEach((def) => {
      const b = getBenchmark(def.key);
      vals[def.key] = { value: String(b.value), label: b.label, source: b.source };
    });
    setEditBenchmarkValues(vals);
    setEditingBenchmarks(true);
  };

  const cancelEditingBenchmarks = () => {
    setEditingBenchmarks(false);
    setEditBenchmarkValues({});
  };

  const saveBenchmarks = async () => {
    if (!user) return;
    setSaving(true);

    const upserts = KPI_DEFS.map((def) => {
      const ev = editBenchmarkValues[def.key];
      const numVal = parseFloat(ev?.value || "0") || 0;
      const label = ev?.label?.trim() || String(numVal);
      const source = ev?.source?.trim() || "Branchestandard";
      return {
        user_id: user.id,
        company_id: companyId,
        kpi_key: def.key,
        benchmark_value: numVal,
        benchmark_label: label,
        source_label: source,
      };
    });

    const { error } = await supabase.from("kpi_benchmarks").upsert(upserts, { onConflict: "company_id,kpi_key" });

    if (error) {
      toast.error("Kunne ikke gemme benchmarks");
      console.error(error);
    } else {
      const bMap: Record<string, KPIBenchmarkRow> = {};
      upserts.forEach((u) => {
        bMap[u.kpi_key] = u;
      });
      setUserBenchmarks(bMap);
      toast.success("Benchmarks gemt");
    }

    setEditingBenchmarks(false);
    setEditBenchmarkValues({});
    setSaving(false);
  };

  if (isAdvisor && !companyId) {
    return (
      <AppLayout>
        <AdvisorCompanyPrompt />
      </AppLayout>
    );
  }

  if (loading || factsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (kpiMetrics.length === 0) {
    return (
      <AppLayout>
        <div className="mb-8">
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            KPI'er
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Følg dine vigtigste nøgletal mod targets</p>
        </div>
        <div className="glass-card rounded-xl p-12 text-center animate-fade-in">
          <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Ingen rapportdata endnu</p>
          <p className="text-xs text-muted-foreground mt-1">Upload din første rapport under Rapportering for at se KPI'er her</p>
        </div>
      </AppLayout>
    );
  }

  const activeMetric = kpiMetrics.find((m) => m.key === selectedKPI) || kpiMetrics[0];

  const activeCommentsByPeriod = (() => {
    const map: Record<string, { id: string; content: string; author_id: string }> = {};
    chartComments
      .filter(c => c.kpi_key === selectedKPI)
      .forEach(c => { map[c.period_key] = c; });
    return map;
  })();

  const handleSaveComment = async () => {
    if (!commentPopover || !companyId || !user || !commentDraft.trim()) return;
    setSavingComment(true);
    const { error } = await (supabase
      .from("kpi_chart_comments" as any)
      .upsert({
        company_id: companyId,
        period_key: commentPopover.periodKey,
        period_label: commentPopover.periodLabel,
        kpi_key: selectedKPI,
        content: commentDraft.trim(),
        author_id: user.id,
      }, { onConflict: "company_id,period_key,kpi_key" }) as any);
    setSavingComment(false);
    if (error) { toast.error("Kunne ikke gemme kommentar"); return; }
    setCommentPopover(null);
    setCommentDraft("");
    refetchComments();

    // Notify founder via in-app notification — non-blocking
    supabase.functions.invoke("notify-kpi-comment", {
      body: {
        company_id: companyId,
        period_label: commentPopover.periodKey,
        kpi_key: selectedKPI,
      },
    }).catch(() => {});
  };

  const handleDeleteComment = async (periodKey: string) => {
    if (!companyId) return;
    await (supabase
      .from("kpi_chart_comments" as any)
      .delete()
      .eq("company_id", companyId)
      .eq("period_key", periodKey)
      .eq("kpi_key", selectedKPI) as any);
    refetchComments();
  };

  function getTargetStatus(metric: KPIMetric): { hit: boolean; pct: number } {
    if (!metric.targetNum) return { hit: false, pct: 0 };
    const hit = metric.lowerIsBetter
      ? metric.numValue <= metric.targetNum
      : metric.numValue >= metric.targetNum;
    const pct = metric.lowerIsBetter
      ? Math.min((metric.targetNum / Math.max(metric.numValue, 1)) * 100, 100)
      : Math.min((metric.numValue / metric.targetNum) * 100, 100);
    return { hit, pct };
  }

  const targetStatus = getTargetStatus(activeMetric);
  const hitsCount = kpiMetrics.filter((m) => getTargetStatus(m).hit).length;

  const prevDataPoint = activeMetric.history.length >= 2
    ? activeMetric.history[activeMetric.history.length - 2]
    : null;
  const prevValue = prevDataPoint?.value ?? null;
  const prevChange = prevValue != null && prevValue !== 0 && activeMetric.numValue != null
    ? ((activeMetric.numValue - prevValue) / Math.abs(prevValue)) * 100
    : null;

  // Progress hero computation
  const latestKF = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1] : null;
  const latestActual: Record<string, number | null> = {};
  if (latestKF) {
    KPI_DEFS.forEach(def => {
      latestActual[def.key] = VALUE_EXTRACTORS[def.key]?.(latestKF.kf) ?? null;
    });
  }
  const latestPeriodLabel = latestKF?.month || "";

  const kpiProgress = KPI_DEFS.map(def => {
    const target = getTarget(def.key);
    const actual = latestActual[def.key];
    if (!target || actual == null || target.value <= 0) return null;
    const pct = def.lowerIsBetter
      ? Math.max(0, 100 - ((actual - target.value) / target.value) * 100)
      : Math.min(150, (actual / target.value) * 100);
    return { def, target, actual, pct };
  }).filter(Boolean) as { def: typeof KPI_DEFS[0]; target: { value: number; label: string }; actual: number; pct: number }[];

  const avgProgress = kpiProgress.length > 0
    ? kpiProgress.reduce((s, k) => s + Math.min(100, k.pct), 0) / kpiProgress.length
    : null;

  return (
    <TooltipProvider>
    <AppLayout>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            KPI'er
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Følg dine vigtigste nøgletal mod targets · baseret på {monthlyData.length} rapporter
          </p>
        </div>
        {!editingTargets && !editingBenchmarks ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/80 transition-colors disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {exporting ? "Eksporterer..." : "Download PDF"}
            </button>
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              {showAdvanced ? "Skjul avanceret" : "Avanceret"}
            </button>
            {showAdvanced && (
              <>
                <button
                  onClick={startEditingBenchmarks}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Benchmarks
                </button>
                <button
                  onClick={startEditingTargets}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Targets
                </button>
              </>
            )}
          </div>
        ) : editingTargets ? (
          <div className="flex items-center gap-2">
            <button onClick={cancelEditingTargets} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
            <button onClick={saveTargets} disabled={saving} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Gem targets
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={cancelEditingBenchmarks} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
            <button onClick={saveBenchmarks} disabled={saving} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Gem benchmarks
            </button>
          </div>
        )}
      </div>

      <div id="kpi-export-area">
      {/* Progress hero */}
      {kpiProgress.length > 0 && (
        <div className="glass-card rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-semibold text-foreground">
                Din fremgang mod årets mål
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Baseret på seneste rapport · {latestPeriodLabel}
              </p>
            </div>
            {avgProgress != null && (
              <div className="text-right">
                <p className="text-3xl font-display font-bold text-primary">
                  {Math.round(avgProgress)}%
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  samlet fremgang
                </p>
              </div>
            )}
          </div>
          <div className="space-y-4">
            {kpiProgress.map(k => {
              const { def, target, actual, pct } = k;
              const Icon = def.icon;
              const isGood = pct >= 100;
              const isClose = pct >= 70 && pct < 100;

              return (
                <div key={def.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        {def.label}
                      </span>
                      {target.label && (
                        <span className="text-[10px] text-muted-foreground">
                          · {target.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {def.unit === "DKK"
                          ? `${formatCompact(actual)} / ${formatCompact(target.value)}`
                          : `${actual.toFixed(1)}${def.unit} / ${target.value}${def.unit}`
                        }
                      </span>
                      <span className={`text-xs font-bold min-w-[40px] text-right ${
                        isGood ? "text-primary" :
                        isClose ? "text-chart-warning" :
                        "text-muted-foreground"
                      }`}>
                        {Math.round(Math.min(150, pct))}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isGood ? "bg-primary" :
                        isClose ? "bg-chart-warning" :
                        "bg-muted-foreground/40"
                      }`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  {isGood && (
                    <p className="text-[10px] text-primary mt-1">
                      ✓ Mål nået — {Math.round(pct - 100)}% over target
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {kpiProgress.length === 0 && !editingTargets && (
        <div className="glass-card rounded-xl p-5 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Sæt dine KPI-mål
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Definer hvad du vil opnå i år — så viser vi din fremgang her.
            </p>
          </div>
          <button
            onClick={startEditingTargets}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
          >
            Sæt mål →
          </button>
        </div>
      )}

      {/* Target editing panel */}
      {showAdvanced && editingTargets && (
        <div className="glass-card rounded-xl p-5 mb-6 animate-fade-in border-primary/30">
          <h3 className="font-display font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Rediger KPI-targets
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {KPI_DEFS.map((def) => {
              const ev = editValues[def.key] || { value: "0", label: "" };
              const Icon = def.icon;
              return (
                <div key={def.key} className="p-3 rounded-lg bg-secondary/50 border border-border/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">{def.label}</span>
                    {def.lowerIsBetter && (
                      <span className="text-[9px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">lavere = bedre</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Værdi</label>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <input
                          type="number"
                          value={ev.value}
                          onChange={(e) =>
                            setEditValues((prev) => ({
                              ...prev,
                              [def.key]: { ...prev[def.key], value: e.target.value },
                            }))
                          }
                          className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        {budgetTotals && (def.key === "omsaetning" || def.key === "resultat") && (
                          <button
                            onClick={() => {
                              const val = def.key === "omsaetning"
                                ? Math.round(budgetTotals.revenue / 12)
                                : Math.round(budgetTotals.ebitda / 12);
                              setEditValues((prev) => ({
                                ...prev,
                                [def.key]: { ...prev[def.key], value: String(val) },
                              }));
                            }}
                            className="text-[10px] px-2 py-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
                            title="Hent månedligt gennemsnit fra dit budget"
                          >
                            Fra budget
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Label</label>
                      <input
                        type="text"
                        value={ev.label}
                        maxLength={30}
                        onChange={(e) =>
                          setEditValues((prev) => ({
                            ...prev,
                            [def.key]: { ...prev[def.key], label: e.target.value },
                          }))
                        }
                        placeholder={`f.eks. ${def.lowerIsBetter ? "< " : ""}${ev.value}`}
                        className="w-full mt-0.5 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Benchmark editing panel */}
      {showAdvanced && editingBenchmarks && (
        <div className="glass-card rounded-xl p-5 mb-6 animate-fade-in border-accent/30">
          <h3 className="font-display font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent-foreground" />
            Rediger branchebenchmarks
          </h3>

          {/* Industry template selector */}
          <div className="mb-5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 block">Vælg brancheskabelon</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {INDUSTRY_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => {
                    const vals: Record<string, { value: string; label: string; source: string }> = {};
                    KPI_DEFS.forEach((def) => {
                      const b = tpl.benchmarks[def.key];
                      if (b) vals[def.key] = { value: String(b.value), label: b.label, source: b.source };
                    });
                    setEditBenchmarkValues(vals);
                    toast.success(`Skabelon "${tpl.name}" indlæst`);
                  }}
                  className="p-2.5 rounded-lg border border-border/50 bg-background hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                >
                  <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors block">{tpl.name}</span>
                  <span className="text-[9px] text-muted-foreground leading-tight block mt-0.5">{tpl.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border/30 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {KPI_DEFS.map((def) => {
              const ev = editBenchmarkValues[def.key] || { value: "0", label: "", source: "" };
              const Icon = def.icon;
              return (
                <div key={def.key} className="p-3 rounded-lg bg-secondary/50 border border-border/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">{def.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Værdi</label>
                      <input
                        type="number"
                        value={ev.value}
                        onChange={(e) =>
                          setEditBenchmarkValues((prev) => ({
                            ...prev,
                            [def.key]: { ...prev[def.key], value: e.target.value },
                          }))
                        }
                        className="w-full mt-0.5 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Label</label>
                      <input
                        type="text"
                        value={ev.label}
                        maxLength={30}
                        onChange={(e) =>
                          setEditBenchmarkValues((prev) => ({
                            ...prev,
                            [def.key]: { ...prev[def.key], label: e.target.value },
                          }))
                        }
                        placeholder={ev.value}
                        className="w-full mt-0.5 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Kilde</label>
                      <input
                        type="text"
                        value={ev.source}
                        maxLength={40}
                        onChange={(e) =>
                          setEditBenchmarkValues((prev) => ({
                            ...prev,
                            [def.key]: { ...prev[def.key], source: e.target.value },
                          }))
                        }
                        placeholder="Branchestandard"
                        className="w-full mt-0.5 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* Target progress banner */}
      <div className="glass-card rounded-xl p-5 mb-6 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-display font-semibold text-foreground text-sm">Target Oversigt</h3>
              <p className="text-xs text-muted-foreground">{hitsCount} af {kpiMetrics.length} targets nået</p>
            </div>
          </div>
          <span className={`text-xl font-display font-bold ${hitsCount >= 4 ? "text-primary" : "text-chart-warning"}`}>
            {Math.round((hitsCount / kpiMetrics.length) * 100)}%
          </span>
        </div>
        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700"
            style={{ width: `${(hitsCount / kpiMetrics.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Industry benchmark gauge */}
      {industryBenchmarkData && (() => {
        const latestKFEntry = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].kf : null;
        if (!latestKFEntry) return null;

        const gaugeEntries = industryBenchmarkData.benchmarks
          .map(b => {
            let actualValue: number | null = null;
            let label = "";
            const unit = "%";
            if (b.kpi_key === "gross_margin_pct") {
              actualValue = calcDbMargin(latestKFEntry);
              label = "DB-margin";
            } else if (b.kpi_key === "ebitda_margin_pct") {
              actualValue = calcResultMargin(latestKFEntry);
              label = "Resultatmargin";
            }
            if (actualValue == null) return null;
            return {
              kpi_key: b.kpi_key, label, actualValue,
              benchmarkValue: Number(b.benchmark_value),
              benchmarkMin: Number(b.benchmark_min),
              benchmarkMax: Number(b.benchmark_max),
              benchmarkLabel: b.benchmark_label, unit,
              sourceLabel: b.source_label,
            } as GaugeEntry;
          })
          .filter(Boolean) as GaugeEntry[];

        if (gaugeEntries.length === 0) return null;
        return (
          <IndustryBenchmarkGauge
            industryLabel={industryBenchmarkData.industryLabel || ""}
            entries={gaugeEntries}
          />
        );
      })()}

      {/* KPI cards grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {kpiMetrics.map((metric) => {
          const Icon = metric.icon;
          const status = getTargetStatus(metric);
          const isSelected = selectedKPI === metric.key;

          return (
            <button
              key={metric.key}
              onClick={() => setSelectedKPI(metric.key)}
              className={`glass-card rounded-xl p-4 text-left transition-all animate-fade-in ${
                isSelected ? "border-primary/40 ring-1 ring-primary/20" : "hover:border-primary/20"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">{metric.label}</span>
                </div>
                {metric.targetNum > 0 && (
                  status.hit ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-chart-warning" />
                  )
                )}
              </div>
              <p className="text-lg font-display font-bold text-foreground">
                {metric.value} <span className="text-xs font-normal text-muted-foreground">{metric.unit}</span>
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  metric.trend === "up" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                }`}>
                  {metric.trend === "up" ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                  {metric.change}
                </span>
              </div>
              {metric.targetNum > 0 && (
                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-0.5">
                    <span>Mål: {metric.target}</span>
                    <span>{Math.round(status.pct)}%</span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${status.hit ? "bg-primary" : "bg-chart-warning"}`}
                      style={{ width: `${status.pct}%` }}
                    />
                  </div>
                  {budgetTotals && !editingTargets && (() => {
                    const budgetVal = metric.key === "omsaetning"
                      ? Math.round(budgetTotals.revenue / 12)
                      : metric.key === "resultat"
                      ? Math.round(budgetTotals.ebitda / 12)
                      : null;
                    if (!budgetVal || !metric.targetNum) return null;
                    const diff = Math.abs(metric.targetNum - budgetVal) / Math.max(budgetVal, 1);
                    if (diff < 0.1) return null;
                    return (
                      <p className="text-[9px] text-chart-warning mt-1">
                        Budget: {new Intl.NumberFormat("da-DK", {
                          style: "currency", currency: "DKK", maximumFractionDigits: 0
                        }).format(budgetVal)}/md
                      </p>
                    );
                  })()}
                </div>
              )}
              {metric.benchmark.value > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <span className="px-1.5 py-0.5 rounded bg-accent/50 text-accent-foreground font-medium inline-flex items-center gap-1 cursor-help">
                        Benchmark: {metric.benchmark.label}
                        <Info className="h-2.5 w-2.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px]">
                      <p className="font-medium text-xs">{metric.benchmark.source || "Branchestandard"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Baseret på danske SMV-data. Brug som vejledning — din situation kan afvige.
                      </p>
                    </TooltipContent>
                  </UITooltip>
                  {(() => {
                    const aboveBenchmark = metric.lowerIsBetter
                      ? metric.numValue <= metric.benchmark.value
                      : metric.numValue >= metric.benchmark.value;
                    return aboveBenchmark
                      ? <CheckCircle2 className="h-2.5 w-2.5 text-primary" />
                      : <AlertTriangle className="h-2.5 w-2.5 text-chart-warning" />;
                  })()}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail view */}
      <div className="glass-card rounded-xl p-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
          <div className="flex items-center gap-3">
            <activeMetric.icon className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-display font-semibold text-foreground">
                {activeMetric.label} Trend
              </h3>
              <p className="text-xs text-muted-foreground">{activeMetric.description} · {monthlyData.length} perioder</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Nuværende</p>
              <p className="text-lg font-display font-bold text-foreground">{activeMetric.value}</p>
            </div>
            {prevDataPoint && (
              <div className="text-right mt-1">
                <p className="text-[10px] text-muted-foreground">{prevDataPoint.month}</p>
                <p className="text-sm text-muted-foreground">
                  {prevValue != null ? prevValue.toLocaleString("da-DK", { maximumFractionDigits: 0 }) : "—"}
                </p>
                {prevChange != null && (
                  <p className={`text-[10px] font-medium ${
                    (activeMetric.lowerIsBetter ? prevChange <= 0 : prevChange >= 0)
                      ? "text-primary"
                      : "text-destructive"
                  }`}>
                    {prevChange >= 0 ? "+" : ""}{prevChange.toFixed(1)}%
                  </p>
                )}
              </div>
            )}
            {activeMetric.targetNum > 0 && (
              <>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className={`text-lg font-display font-bold ${targetStatus.hit ? "text-primary" : "text-chart-warning"}`}>
                    {activeMetric.target}
                  </p>
                </div>
              </>
            )}
            {activeMetric.benchmark.value > 0 && (
              <>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Benchmark</p>
                  <p className="text-lg font-display font-bold text-accent-foreground">{activeMetric.benchmark.label}</p>
                  <p className="text-[9px] text-muted-foreground">{activeMetric.benchmark.source}</p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="h-72 relative">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activeMetric.history} margin={{ top: 10, right: 10, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="kpiGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              {activeMetric.targetNum > 0 && (
                <ReferenceLine y={activeMetric.targetNum} stroke="hsl(160, 84%, 39%)" strokeDasharray="4 2"
                  label={{ value: `Target: ${activeMetric.target}`, position: "insideBottomRight", fill: "hsl(160, 84%, 39%)", fontSize: 10 }} />
              )}
              {activeMetric.benchmark.value > 0 && (
                <ReferenceLine y={activeMetric.benchmark.value} stroke="hsl(var(--primary))" strokeDasharray="6 3"
                  label={{ value: `Benchmark: ${activeMetric.benchmark.label}`, position: "insideTopRight", fill: "hsl(var(--primary))", fontSize: 10 }} />
              )}
              {/* Vertical reference lines for periods with comments */}
              {Object.keys(activeCommentsByPeriod).map(pk => {
                const point = activeMetric.history.find(h => h.periodKey === pk);
                if (!point) return null;
                return (
                  <ReferenceLine key={pk} x={point.month} stroke="hsl(var(--primary))"
                    strokeDasharray="3 3" strokeOpacity={0.5} />
                );
              })}
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(160, 84%, 39%)"
                strokeWidth={2.5}
                fill="url(#kpiGradient)"
                name={activeMetric.label}
                dot={(props: any) => (
                  <CustomDot
                    {...props}
                    hasComment={!!activeCommentsByPeriod[props.payload?.periodKey]}
                    isAdvisor={isAdvisor}
                    onClick={(pk: string, label: string, x: number, y: number) => {
                      const existing = activeCommentsByPeriod[pk];
                      setCommentDraft(existing?.content || "");
                      setCommentPopover({ periodKey: pk, periodLabel: label, x, y });
                    }}
                  />
                )}
                activeDot={{ r: 6, fill: "hsl(160, 84%, 39%)", strokeWidth: 2, stroke: "hsl(var(--background))" }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Comment popover — advisors only */}
          {isAdvisor && commentPopover && (
            <div
              className="absolute z-10 bg-card border border-border rounded-xl shadow-lg p-4 w-72"
              style={{ left: Math.min(commentPopover.x, 280), top: Math.max(commentPopover.y - 120, 0) }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground">
                  Kommentar · {commentPopover.periodLabel}
                </p>
                <button onClick={() => setCommentPopover(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors text-xs">✕</button>
              </div>
              <textarea
                value={commentDraft}
                onChange={e => setCommentDraft(e.target.value)}
                placeholder="Skriv en observation eller anbefaling til founder..."
                className="w-full text-sm bg-secondary border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveComment}
                  disabled={savingComment || !commentDraft.trim()}
                  className="flex-1 text-xs font-medium py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingComment ? "Gemmer..." : "Gem"}
                </button>
                {activeCommentsByPeriod[commentPopover.periodKey] && (
                  <button
                    onClick={() => { handleDeleteComment(commentPopover.periodKey); setCommentPopover(null); }}
                    className="text-xs font-medium py-2 px-3 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    Slet
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Comment badges below chart — visible to both advisors and founders */}
        {Object.entries(activeCommentsByPeriod).length > 0 && (
          <div className="mt-3 space-y-2">
            {Object.entries(activeCommentsByPeriod).map(([pk, comment]) => {
              const point = activeMetric.history.find(h => h.periodKey === pk);
              return (
                <div key={pk} className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/15">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare className="h-3 w-3 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-primary mb-0.5">{point?.month || pk}</p>
                    <p className="text-xs text-foreground leading-relaxed">{comment.content}</p>
                  </div>
                  {isAdvisor && (
                    <button
                      onClick={() => { setCommentDraft(comment.content); setCommentPopover({ periodKey: pk, periodLabel: point?.month || pk, x: 0, y: 0 }); }}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors flex-shrink-0 mt-0.5"
                    >
                      Rediger
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Period comparison table */}
        {showAdvanced && <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Måned</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Værdi</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Ændring</th>
                {activeMetric.targetNum > 0 && (
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">vs. Target</th>
                )}
                <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">vs. Benchmark</th>
              </tr>
            </thead>
            <tbody>
              {activeMetric.history.map((point, i) => {
                const prev = i > 0 ? activeMetric.history[i - 1].value : point.value;
                const change = prev !== 0 ? ((point.value - prev) / Math.abs(prev)) * 100 : 0;
                const vsTarget = activeMetric.lowerIsBetter
                  ? point.value <= activeMetric.targetNum
                  : point.value >= activeMetric.targetNum;

                return (
                  <tr key={point.month} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="py-2 px-2 text-foreground font-medium">{point.month}</td>
                    <td className="py-2 px-2 text-right font-display text-foreground">
                      {point.value > 1000 ? formatCompact(point.value) : point.value.toFixed(1)}
                    </td>
                    <td className={`py-2 px-2 text-right font-display text-xs ${
                      i === 0 ? "text-muted-foreground" : change > 0 ? "text-primary" : "text-destructive"
                    }`}>
                      {i === 0 ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
                    </td>
                    {activeMetric.targetNum > 0 && (
                      <td className="py-2 px-2 text-right">
                        {vsTarget ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary inline-block" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-chart-warning inline-block" />
                        )}
                      </td>
                    )}
                    <td className="py-2 px-2 text-right">
                      {(() => {
                        const bv = activeMetric.benchmark.value;
                        if (!bv) return <span className="text-muted-foreground text-xs">—</span>;
                        const diff = activeMetric.lowerIsBetter
                          ? ((bv - point.value) / bv) * 100
                          : ((point.value - bv) / bv) * 100;
                        return (
                          <span className={`text-xs font-display ${diff >= 0 ? "text-primary" : "text-destructive"}`}>
                            {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-8 mb-2">
        Benchmarks er vejledende og baseret på aggregerede data fra danske virksomheder.
        Hover over et benchmark for at se kilden.
      </p>
    </AppLayout>
    </TooltipProvider>
  );
};

export default KPIs;
