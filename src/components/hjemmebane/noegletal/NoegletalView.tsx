import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Check, Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { useKpiTargets } from "@/hooks/useKpiTargets";
import { useKpiBenchmarks } from "@/hooks/useKpiBenchmarks";
import { useScrollToHash } from "@/hooks/useScrollToHash";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { formatCompact, formatDKK, SHORT_MONTHS } from "@/lib/financialUtils";
import { KPI_DEFS, VALUE_EXTRACTORS, deriveKpiMetrics, type KpiMetric } from "@/lib/kpiDefs";
import { INDUSTRY_TEMPLATES, type BenchmarkTemplate } from "@/lib/appConfig";
import { HbFinancialAnalysis } from "./HbFinancialAnalysis";
import { usePeriodFilter } from "@/components/PeriodSelector";
import { HbAdvisorCompanyPrompt } from "../HbAdvisorCompanyPrompt";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbField, HbInput, HbSelect, hbControlClasses } from "../admin/HbField";
import { HbSegmented } from "../admin/HbSegmented";
import { deriveKpiTone, type KpiToneView } from "./kpiTone";
import { deriveMoMChange } from "./trendMoM";
import { momErGyldig, opgoerGrundlag, type DataBasis } from "@/lib/dataGrundlag";
import { ESTIMAT_FORKLARING, EstimatMaerke } from "../EstimatMaerke";

/** Nøgletal (/noegletal → /kpis ved GO) — FULD PARITET + trend/AI
    (klik-valg A): mål-hero, trend-overblik (nyt hjem fra Reports),
    KPI-kort, detail-view m. advisor-kommentar-laget bevaret 1:1
    (samme kpi_chart_comments-skrivning, samme notify-kpi-comment),
    benchmark-gauge, sammenligningstabel, AI-analysen i Hb-udtryk
    (HbFinancialAnalysis m. eget periodevalg — broen afviklet
    2026-08-05), mål/benchmark-panelet (begge roller — mål-adgangs-
    beslutningen 2026-08-05; advisor-write-policies i 20260805220000;
    døren bor i mål-hero'ens topline: Sæt mål/Ret mål/Skjul).
    Graf-farver = hb-tokens (synlige i eksport-klonen); PDF via
    exportKPIReport m. fladens egen papir-baggrund. Mola: stille
    kvitteringer; tal-afvigelser er attention, aldrig alarm (kpiTone). */

const HB_SERIES = [
  { key: "omsaetning", label: "Omsætning", color: "hsl(var(--hb-evergreen))" },
  { key: "daekningsbidrag", label: "Dækningsbidrag", color: "hsl(var(--hb-rust))" },
  { key: "resultat_foer_skat", label: "Resultat f. skat", color: "hsl(170 25% 45%)" },
  { key: "loenninger", label: "Lønninger", color: "hsl(20 30% 55%)" },
  { key: "bank_balance", label: "Bank", color: "hsl(var(--hb-ink-soft))" },
] as const;

/** Branche-tabellens (industry_benchmarks) nøgler → fladens def-nøgler.
    Gamle KPIs.tsx' sandhed (858-885): gross_margin_pct → DB-margin
    (calcDbMargin = VALUE_EXTRACTORS.db_margin), ebitda_margin_pct →
    Resultatmargin (calcResultMargin = VALUE_EXTRACTORS.ebitda_margin).
    Jf. hb-benchmark-kilde-recon.txt. */
const INDUSTRY_TO_DEF_KEY: Record<string, string> = {
  gross_margin_pct: "db_margin",
  ebitda_margin_pct: "ebitda_margin",
};

const hbTooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid hsl(var(--hb-line))",
    background: "hsl(var(--hb-surface))",
    color: "hsl(var(--hb-ink))",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
  labelStyle: { color: "hsl(var(--hb-ink))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--hb-ink-soft))" },
};

/** Hero-prikken: hit=●, near=◐, off=○, no_target=stiplet (StateDot-formsproget). */
const ToneDot = ({ view }: { view: KpiToneView }) => {
  if (view.state === "hit")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hb-evergreen">
        <Check className="h-3 w-3 text-white" />
      </span>
    );
  if (view.state === "near")
    return (
      <span className="h-5 w-5 shrink-0 rounded-full border border-hb-evergreen [background:linear-gradient(90deg,hsl(var(--hb-evergreen))_50%,transparent_50%)]" />
    );
  if (view.state === "off") return <span className="h-5 w-5 shrink-0 rounded-full border border-hb-rust" />;
  return <span className="h-5 w-5 shrink-0 rounded-full border border-dashed border-hb-line" />;
};

export const NoegletalView = () => {
  useScrollToHash();
  const { user, companyId, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;

  const { data: facts = [], isLoading: factsLoading } = useCompanyFacts();
  const { targets, isLoading: targetsLoading, setTargets } = useKpiTargets(companyId ?? undefined);
  const { benchmarks: benchmarksResolved, isLoading: benchmarksLoading, setBenchmarks } = useKpiBenchmarks(companyId ?? undefined);

  const [selectedKPI, setSelectedKPI] = useState<string>("omsaetning");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, { value: string; label: string }>>({});
  const [editBenchmarkValues, setEditBenchmarkValues] = useState<Record<string, { value: string; label: string; source: string }>>({});
  // Valgt brancheskabelon (t.name) — kun visning; nulstilles ved panelåbning
  // og ved manuel benchmark-rettelse (ærlig tilbagemelding).
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const [aiPeriodKey, setAiPeriodKey] = useState<string | null>(null);
  const trendPeriod = usePeriodFilter();

  // ── Data-afledninger (samme maskine som gamle KPIs) ─────────────────────
  const monthlyData = useMemo(
    () =>
      facts.map((f) => {
        const kf = factsToDanishMetrics(f.metrics);
        const [, monthStr] = f.period_key.split("-");
        const monthIdx = parseInt(monthStr, 10) - 1;
        // data_basis bæres med på hvert punkt (dataGrundlag-kontrakten) —
        // ingen komponent læser det endnu; visnings-PR'en gør.
        return { sortKey: f.period_key, month: SHORT_MONTHS[monthIdx] || monthStr, kf, data_basis: f.data_basis };
      }),
    [facts],
  );
  const kpiMetrics: KpiMetric[] = useMemo(
    () => deriveKpiMetrics(facts, targets, benchmarksResolved),
    [facts, targets, benchmarksResolved],
  );
  const getTarget = (key: string) => targets[key] ?? { value: 0, label: "—" };

  const latestKF = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1] : null;
  // Grundlags-opgørelsen til tælleren + "er seneste periode et estimat?"
  // til branchesammenligningen (facts er sorteret stigende på period_key).
  const grundlag = opgoerGrundlag(facts);
  const senesteErEstimat = facts.length > 0 && facts[facts.length - 1].data_basis === "estimated";
  const heroEntries = KPI_DEFS.map((def) => {
    const actual = latestKF ? (VALUE_EXTRACTORS[def.key]?.(latestKF.kf) ?? null) : null;
    const target = getTarget(def.key);
    const tone = deriveKpiTone({ actual, target: target.value > 0 ? target.value : null, lowerIsBetter: def.lowerIsBetter });
    return { def, actual, target, tone };
  });
  const withTargets = heroEntries.filter((e) => e.tone.state !== "no_target");
  const avgProgress =
    withTargets.length > 0
      ? withTargets.reduce((s, e) => s + Math.min(100, e.tone.pct ?? 0), 0) / withTargets.length
      : null;

  // Trend (porteret fra Reports — facts-laget, usePeriodFilter-hooken)
  const trendData = useMemo(() => {
    const allKeys = facts.map((f) => f.period_key).sort();
    const filteredKeys = trendPeriod.filterKeys(allKeys);
    return filteredKeys
      .map((key) => {
        const fact = facts.find((f) => f.period_key === key);
        if (!fact) return null;
        const kf = factsToDanishMetrics(fact.metrics);
        const [year, monthStr] = key.split("-");
        const monthIdx = parseInt(monthStr, 10) - 1;
        return {
          key,
          label: `${SHORT_MONTHS[monthIdx]} ${year}`,
          // data_basis på hvert punkt: M/M-gaten (momErGyldig) læser den nu,
          // graf-markeringen kommer i visnings-PR'en (segmenterSerie).
          data_basis: fact.data_basis,
          omsaetning: kf.omsaetning ?? null,
          daekningsbidrag: kf.daekningsbidrag ?? null,
          resultat_foer_skat: kf.resultat_foer_skat ?? null,
          loenninger: kf.loenninger ?? null,
          bank_balance: kf.bank_balance ?? null,
        };
      })
      .filter(Boolean) as ({ data_basis: DataBasis } & Record<string, any>)[];
  }, [facts, trendPeriod.mode, trendPeriod.customFrom, trendPeriod.customTo]);

  // Samtale-id til AI-analysens beskedkobling (arvet fra Reports.loadData).
  const { data: conversationId = null } = useQuery({
    queryKey: ["noegletal", "conversation", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("conversations").select("id").eq("company_id", companyId!).maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!companyId,
    staleTime: 10 * 60_000,
  });

  // ── Chart-kommentarer (advisor-samtale-fladen — bevaret 1:1) ────────────
  const { data: chartComments = [], refetch: refetchComments } = useQuery({
    queryKey: ["kpi-chart-comments", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("kpi_chart_comments" as any)
        .select("id, period_key, period_label, kpi_key, content, author_id, created_at") as any)
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data || []) as { id: string; period_key: string; period_label: string; kpi_key: string; content: string; author_id: string; created_at: string }[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const [commentPopover, setCommentPopover] = useState<{ periodKey: string; periodLabel: string; x: number; y: number } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const commentsForSelected = chartComments.filter((c) => c.kpi_key === selectedKPI);
  const commentedKeys = new Set(commentsForSelected.map((c) => c.period_key));

  /** Funktionelt identisk m. gamle handleSaveComment (samme upsert, samme
      notify-kpi-comment-invoke) — kun kvitteringen er stille/inline. */
  const handleSaveComment = async () => {
    if (!commentPopover || !companyId || !user || !commentDraft.trim()) return;
    setSavingComment(true);
    setCommentError(null);
    const { error } = await (supabase
      .from("kpi_chart_comments" as any)
      .upsert(
        {
          company_id: companyId,
          period_key: commentPopover.periodKey,
          period_label: commentPopover.periodLabel,
          kpi_key: selectedKPI,
          content: commentDraft.trim(),
          author_id: user.id,
        },
        { onConflict: "company_id,period_key,kpi_key" },
      ) as any);
    setSavingComment(false);
    if (error) {
      setCommentError("Kunne ikke gemme kommentaren");
      return;
    }
    setCommentPopover(null);
    setCommentDraft("");
    refetchComments();
    supabase.functions
      .invoke("notify-kpi-comment", {
        body: { company_id: companyId, period_label: commentPopover.periodKey, kpi_key: selectedKPI },
      })
      .catch(() => {});
  };

  // ── PDF (strategi b: fladens egen papir-baggrund, færdig rgb-værdi) ─────
  const handleExport = async () => {
    setExporting(true);
    try {
      const { exportKPIReport } = await import("@/lib/exportPdf");
      const { data: companyRow } = await supabase.from("companies").select("name").eq("id", companyId!).maybeSingle();
      const companyName = companyRow?.name || "rapport";
      const date = new Date().toLocaleDateString("da-DK", { month: "short", year: "numeric" }).replace(" ", "-");
      const exportEl = document.getElementById("kpi-export-area");
      const backgroundColor = exportEl ? getComputedStyle(exportEl).backgroundColor : undefined;
      await exportKPIReport("kpi-export-area", `${companyName}-kpi-${date}.pdf`, { backgroundColor });
    } catch {
      setSaveError("PDF-eksport fejlede. Prøv igen.");
    }
    setExporting(false);
  };

  // ── Mål/benchmark-panelet (begge roller — mål-adgangs-beslutningen) ─────
  const startEditing = () => {
    const targetVals: Record<string, { value: string; label: string }> = {};
    const benchVals: Record<string, { value: string; label: string; source: string }> = {};
    KPI_DEFS.forEach((def) => {
      const t = getTarget(def.key);
      targetVals[def.key] = { value: String(t.value), label: t.label };
      const b = benchmarksResolved[def.key] ?? { value: 0, label: "—", source: "" };
      benchVals[def.key] = { value: String(b.value), label: b.label, source: b.source };
    });
    setEditValues(targetVals);
    setEditBenchmarkValues(benchVals);
    setSelectedTemplate(null);
  };

  const saveAdvanced = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);

    const targetUpserts = KPI_DEFS.map((def) => {
      const ev = editValues[def.key];
      const numVal = parseFloat(ev?.value || "0") || 0;
      return {
        user_id: user.id,
        company_id: companyId,
        kpi_key: def.key,
        target_value: numVal,
        target_label: ev?.label?.trim() || String(numVal),
        lower_is_better: def.lowerIsBetter,
      };
    });
    const benchUpserts = KPI_DEFS.map((def) => {
      const ev = editBenchmarkValues[def.key];
      const numVal = parseFloat(ev?.value || "0") || 0;
      return {
        user_id: user.id,
        company_id: companyId,
        kpi_key: def.key,
        benchmark_value: numVal,
        benchmark_label: ev?.label?.trim() || String(numVal),
        source_label: ev?.source?.trim() || "Estimat, The Boardroom",
      };
    });

    const [targetRes, benchRes] = await Promise.all([
      supabase.from("kpi_targets").upsert(targetUpserts, { onConflict: "company_id,kpi_key" }),
      supabase.from("kpi_benchmarks").upsert(benchUpserts, { onConflict: "company_id,kpi_key" }),
    ]);

    if (targetRes.error || benchRes.error) {
      setSaveError((targetRes.error ?? benchRes.error)?.message ?? "Kunne ikke gemme");
    } else {
      const mergedTargets: Record<string, { value: number; label: string }> = {};
      targetUpserts.forEach((u) => (mergedTargets[u.kpi_key] = { value: u.target_value, label: u.target_label }));
      setTargets(mergedTargets);
      const mergedBench: Record<string, { value: number; label: string; source: string }> = {};
      benchUpserts.forEach((u) => (mergedBench[u.kpi_key] = { value: u.benchmark_value, label: u.benchmark_label, source: u.source_label }));
      setBenchmarks(mergedBench);
      setSavedNote(`Gemt · ${new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`);
    }
    setSaving(false);
  };

  const applyTemplate = (template: BenchmarkTemplate) => {
    setEditBenchmarkValues((prev) => {
      const next = { ...prev };
      Object.entries(template.benchmarks).forEach(([key, b]) => {
        next[key] = { value: String(b.value), label: b.label, source: b.source };
      });
      return next;
    });
    setSelectedTemplate(template.name);
  };

  /** Fælles benchmark-felt-handler: manuel rettelse fraviger en valgt
      skabelon, så select'en må ikke længere påstå den (ærlig
      tilbagemelding). Mål-felter rører ikke skabelon-state — skabelonen
      dækker kun benchmarks. */
  const updateBenchmarkField = (key: string, patch: Partial<{ value: string; label: string }>) => {
    setEditBenchmarkValues((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setSelectedTemplate(null);
  };

  // ── Benchmark-gauge-data (begge roller — benchmark-synligheds-
  //    beslutningen 2026-08-05; samme kilde som gamle) ──────────────────────
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
        industryLabel: company.industry_label as string | null,
        benchmarks: (benchmarks || []) as { kpi_key: string; benchmark_value: number; benchmark_label: string; benchmark_min: number; benchmark_max: number; source_label: string }[],
      };
    },
    enabled: !!companyId,
    staleTime: 10 * 60_000,
  });

  // Ren state-afledning — står FØR de tidlige returns så scroll-effekten
  // kan gate på den.
  const editingReady = Object.keys(editValues).length > 0;

  // Mål/benchmark-panelet ligger nederst — uden scroll tror brugeren at
  // intet skete. setTimeout(0) så den betinget renderede sektion findes i
  // DOM først. Kun ved ÅBNING: guarden gør at "Skjul" aldrig scroller.
  // SKAL stå før de tidlige returns (React #310 — hotfix 2026-08-05).
  const advancedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showAdvanced || !editingReady) return;
    const t = setTimeout(() => {
      advancedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => clearTimeout(t);
  }, [showAdvanced, editingReady]);

  /** Åbner mål/benchmark-panelet (hero-knappen lukker selv m.
      setShowAdvanced(false) når panelet er åbent). */
  const openAdvanced = () => {
    if (!showAdvanced) startEditing();
    setShowAdvanced(true);
    setSavedNote(null);
    setSaveError(null);
  };

  if (isAdvisor && !companyId) {
    return <HbAdvisorCompanyPrompt />;
  }

  if (factsLoading || targetsLoading || benchmarksLoading) {
    return <p className="text-sm text-hb-ink-soft">Henter dine nøgletal…</p>;
  }

  const activeMetric = kpiMetrics.find((m) => m.key === selectedKPI) ?? kpiMetrics[0];
  const activeUnit = KPI_DEFS.find((d) => d.key === activeMetric?.key)?.unit;

  // Gauge-rækker: branche-nøgler mappes til fladens def-nøgler
  // (INDUSTRY_TO_DEF_KEY, gamle sides sandhed). Kun RENDERBARE rækker
  // tæller — sektionen gater på dem, ikke på rå benchmarks.length
  // (tomt-kort-fejlen, jf. hb-benchmark-kilde-recon.txt).
  const gaugeRows = (industryBenchmarkData?.benchmarks ?? []).flatMap((b) => {
    const defKey = INDUSTRY_TO_DEF_KEY[b.kpi_key];
    const metric = defKey ? kpiMetrics.find((m) => m.key === defKey) : undefined;
    if (!metric || b.benchmark_max <= b.benchmark_min) return [];
    return [{ b, metric }];
  });

  /** Prik-renderer til BÅDE dot og activeDot: recharts' active-dot-lag
      renderes oven på dots-laget uden egne handlers, så det øverste lag
      skal selv bære klikket (fix-recon (a)). Spejler gamle CustomDot
      (KPIs.tsx:79-101) inkl. onTouchEnd og prefill af eksisterende
      kommentar; medlemmer uændret (cursor default, intet klik). */
  const renderCommentDot = (props: any) => {
    const { cx = 0, cy = 0, payload } = props;
    if (!payload) return <g key={`dot-${props.index}`} />;
    const hasComment = commentedKeys.has(payload.periodKey);
    const openPopover = () => {
      const existing = commentsForSelected.find((c) => c.period_key === payload.periodKey);
      setCommentDraft(existing?.content || "");
      setCommentPopover({ periodKey: payload.periodKey, periodLabel: payload.month, x: cx, y: cy });
    };
    return (
      <g key={`dot-${payload.periodKey}`}>
        <circle
          cx={cx}
          cy={cy}
          r={hasComment ? 6 : 4}
          fill={hasComment ? "hsl(var(--hb-rust))" : "hsl(var(--hb-evergreen))"}
          stroke={hasComment ? "hsl(var(--hb-surface))" : "none"}
          strokeWidth={2}
          style={{ cursor: isAdvisor ? "pointer" : "default" }}
          onClick={() => isAdvisor && openPopover()}
          onTouchEnd={(e) => {
            if (!isAdvisor) return;
            e.preventDefault();
            openPopover();
          }}
        />
      </g>
    );
  };

  return (
    <div>
      {/* ── 1. Header ── */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine tal</p>
          <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
            Nøgletal
          </h1>
          {/* Tælleren skelner målt fra estimeret (data_basis-kontrakten:
              visninger må vise estimater, men skal sige det). Estimaterne
              er en funktion medlemmet selv har valgt (årsrapport-upload) —
              teksten oplyser roligt, den advarer ikke. Forklaringen står
              ÉT sted: ESTIMAT_FORKLARING, delt med alle mærker. */}
          <p className="mt-3 text-sm text-hb-ink-soft">
            {monthlyData.length === 0
              ? "Ingen godkendte tal endnu"
              : grundlag.estimerede === 0
                ? `Baseret på ${grundlag.samlet} måneder · senest ${monthlyData[monthlyData.length - 1].month}`
                : grundlag.maalte === 0
                  ? `Baseret på ${grundlag.estimerede} estimerede måneder · senest ${monthlyData[monthlyData.length - 1].month}`
                  : `Baseret på ${grundlag.maalte === 1 ? "1 målt måned" : `${grundlag.maalte} målte måneder`} og ${grundlag.estimerede === 1 ? "1 estimeret" : `${grundlag.estimerede} estimerede`} · senest ${monthlyData[monthlyData.length - 1].month}`}
          </p>
          {grundlag.estimerede > 0 && (
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-hb-ink-soft">
              {ESTIMAT_FORKLARING}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || monthlyData.length === 0}
            className="flex items-center gap-1.5 text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-ink hover:underline disabled:opacity-40"
          >
            {exporting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {exporting ? "Eksporterer…" : "Download PDF"}
          </button>
        </div>
      </section>

      {monthlyData.length === 0 ? (
        <HbCard className="mt-8 p-6">
          <p className="text-sm leading-relaxed text-hb-ink-soft">
            Nøgletallene fyldes ud, når din første rapport er godkendt.{" "}
            <Link to="/rapportering" className="text-hb-rust underline-offset-4 hover:underline">
              Gå til rapportering
            </Link>
          </p>
        </HbCard>
      ) : (
        <div id="kpi-export-area" className="bg-hb-paper">
          {/* ── 2. Mål-hero (#goals — Guide-kontrakt) ── */}
          <section id="goals" className="mt-8 scroll-mt-24">
            <HbCard className="p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine mål</p>
                <div className="flex items-baseline gap-4">
                  {avgProgress != null && (
                    <p className="text-sm text-hb-ink-soft">
                      Samlet målopfyldelse:{" "}
                      <span className="font-editorial text-lg font-medium text-hb-ink">{Math.round(avgProgress)} %</span>
                    </p>
                  )}
                  {/* Mål/benchmark-døren bor HOS målene (begge roller —
                      mål-adgangs-beslutningen 2026-08-05; advisor-write-
                      policies i 20260805220000). Ignoreres af PDF-eksporten. */}
                  <button
                    type="button"
                    data-html2canvas-ignore={true}
                    onClick={() => (showAdvanced ? setShowAdvanced(false) : openAdvanced())}
                    className="text-sm text-hb-rust underline-offset-4 hover:underline"
                  >
                    {showAdvanced ? "Skjul" : withTargets.length === 0 ? "Sæt mål" : "Ret mål"}
                  </button>
                </div>
              </div>
              {withTargets.length === 0 ? (
                <p className="mt-3 text-sm text-hb-ink-soft">Ingen mål sat endnu.</p>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {heroEntries.map(({ def, actual, target, tone }) => (
                    <div key={def.key} className="flex items-center gap-3">
                      <ToneDot view={tone} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{def.label}</p>
                        <p className="mt-0.5 truncate text-sm">
                          <span className="font-editorial text-lg font-medium text-hb-ink">
                            {actual != null ? (def.unit === "%" ? `${actual.toFixed(1)} %` : formatCompact(actual)) : "—"}
                          </span>
                          {tone.state !== "no_target" && (
                            <span className={cn("ml-1.5", tone.tone === "quiet" ? "text-hb-ink-soft" : "text-hb-rust")}>
                              mål {target.label}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </HbCard>
          </section>

          {/* ── 3. Trend-overblik (nyt hjem) ── */}
          <HbSection eyebrow="Finansiel udvikling" className="mt-10">
            {trendData.length < 2 ? (
              <p className="text-sm text-hb-ink-soft">
                Trends kræver mindst to måneders tal —{" "}
                <Link to="/rapportering" className="text-hb-rust underline-offset-4 hover:underline">
                  upload din næste rapport
                </Link>
                .
              </p>
            ) : (
              <HbCard className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <HbSegmented
                    aria-label="Trend-periode"
                    value={trendPeriod.mode}
                    options={[
                      { value: "last12", label: "Seneste 12" },
                      { value: "ytd", label: "I år" },
                      { value: "custom", label: "Frit" },
                    ]}
                    onChange={(mode) => trendPeriod.setMode(mode as any)}
                  />
                  {trendPeriod.mode === "custom" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="month"
                        value={trendPeriod.customFrom ?? ""}
                        onChange={(e) => trendPeriod.setCustomFrom(e.target.value || null)}
                        aria-label="Fra måned"
                        className={cn(hbControlClasses, "w-auto py-1.5 text-sm")}
                      />
                      <span className="text-sm text-hb-ink-soft">–</span>
                      <input
                        type="month"
                        value={trendPeriod.customTo ?? ""}
                        onChange={(e) => trendPeriod.setCustomTo(e.target.value || null)}
                        aria-label="Til måned"
                        className={cn(hbControlClasses, "w-auto py-1.5 text-sm")}
                      />
                    </div>
                  )}
                </div>

                {/* Klikbar legend (arvet mønster) */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {HB_SERIES.map((s) => {
                    const highlighted = activeSeries === s.key || (!activeSeries && s.key === "omsaetning");
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setActiveSeries((prev) => (prev === s.key ? null : s.key))}
                        className={cn(
                          "flex items-center gap-1.5 text-[11px] font-medium tracking-wide transition-opacity",
                          highlighted ? "opacity-100" : "opacity-40 hover:opacity-80",
                        )}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                        <span style={highlighted ? { color: s.color } : undefined} className={highlighted ? "" : "text-hb-ink-soft"}>
                          {s.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 18, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        {HB_SERIES.map((s) => (
                          <linearGradient key={`hbgrad-${s.key}`} id={`hbgrad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--hb-line))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--hb-ink-soft))" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: "hsl(var(--hb-ink-soft))" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value: number, name: string) => [formatDKK(value), HB_SERIES.find((s) => s.key === name)?.label || name]}
                        {...hbTooltipStyle}
                      />
                      {HB_SERIES.map((s) => {
                        const isActive = activeSeries === s.key;
                        const isDefaultMain = !activeSeries && s.key === "omsaetning";
                        const highlighted = isActive || isDefaultMain;
                        return (
                          <Area
                            key={s.key}
                            type="monotone"
                            dataKey={s.key}
                            stroke={s.color}
                            strokeWidth={highlighted ? 2.5 : 0.8}
                            opacity={highlighted ? 1 : activeSeries ? 0.15 : 0.4}
                            strokeDasharray={highlighted ? undefined : "4 4"}
                            fill={highlighted ? `url(#hbgrad-${s.key})` : "none"}
                            dot={isActive ? { r: 3, fill: s.color, strokeWidth: 0 } : false}
                            activeDot={{ r: isActive ? 5 : 3 }}
                            connectNulls
                          />
                        );
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* M/M-indikatorer (deriveMoMChange-dommen) — gated af
                    momErGyldig: en M/M mod et /12-estimat måler afstanden
                    til en regnekonstruktion, ikke en måneds udvikling
                    (data_basis-kontrakten). Beregningen kører slet ikke
                    når grundlaget er ugyldigt. */}
                {momErGyldig(trendData) && (
                  <div className="mt-4 grid grid-cols-1 gap-3 border-t border-hb-line pt-4 sm:grid-cols-3">
                    {(["omsaetning", "daekningsbidrag", "resultat_foer_skat"] as const).map((key) => {
                      const change = deriveMoMChange(trendData.map((d) => d[key]));
                      if (change.pct == null) return null;
                      const label = HB_SERIES.find((s) => s.key === key)?.label ?? key;
                      return (
                        <div key={key} className="flex items-center gap-2.5">
                          {change.direction === "flat" ? (
                            <Minus className="h-4 w-4 text-hb-ink-soft" />
                          ) : change.direction === "up" ? (
                            <TrendingUp className="h-4 w-4 text-hb-evergreen" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-hb-rust" />
                          )}
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
                            <p className={cn("font-editorial text-lg font-medium", change.direction === "down" ? "text-hb-rust" : "text-hb-ink")}>
                              {change.pct > 0 ? "+" : ""}
                              {change.pct.toFixed(1)} % M/M
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </HbCard>
            )}
          </HbSection>

          {/* ── 4. KPI-kort-grid ── */}
          <HbSection eyebrow="Nøgletal" className="mt-10">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {kpiMetrics.map((metric) => {
                const def = KPI_DEFS.find((d) => d.key === metric.key)!;
                const tone = deriveKpiTone({
                  actual: metric.numValue,
                  target: metric.targetNum > 0 ? metric.targetNum : null,
                  lowerIsBetter: def.lowerIsBetter,
                });
                const selected = metric.key === selectedKPI;
                const toneCls = tone.tone === "quiet" ? "text-hb-ink-soft" : "text-hb-rust";
                // VIRKSOMHEDSSAT benchmark (samme data som panelet
                // redigerer/gemmer) — kalibrerings-løkken lukker: sæt → se.
                const bench = benchmarksResolved[metric.key];
                const benchLabel =
                  bench && bench.value > 0
                    ? def.unit === "%"
                      ? `${bench.value} %`
                      : formatCompact(bench.value)
                    : null;
                return (
                  <button
                    key={metric.key}
                    type="button"
                    onClick={() => setSelectedKPI(metric.key)}
                    className={cn(
                      "rounded-hb border bg-hb-surface p-4 text-left transition-colors",
                      selected ? "border-hb-evergreen" : "border-hb-line hover:bg-hb-sage/20",
                    )}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{metric.label}</p>
                    <p className="mt-1 font-editorial text-2xl font-medium text-hb-ink">
                      {def.unit === "%" ? `${metric.numValue.toFixed(1)} %` : metric.value}
                    </p>
                    {/* Mål dømmer, benchmark oplyser — benchmark farver ALDRIG
                        toner, prikker eller domme; den er stille kontekst
                        (ink-soft), uanset kortets tone. */}
                    <p className="mt-0.5 text-xs">
                      {tone.state !== "no_target" && <span className={toneCls}>{`mål ${metric.target}`}</span>}
                      {benchLabel && (
                        <span className="text-hb-ink-soft">
                          {tone.state !== "no_target" ? " · " : ""}branche {benchLabel}
                        </span>
                      )}
                      {/* "—" (changePct null: intet gyldigt M/M-grundlag) er en
                          ikke-dom og må aldrig arve målets rust-tone — den ville
                          ligne et rødt tal. */}
                      <span className={metric.changePct == null ? "text-hb-ink-soft" : toneCls}>
                        {tone.state !== "no_target" || benchLabel ? " · " : ""}
                        {metric.change}
                      </span>
                    </p>
                  </button>
                );
              })}
            </div>
          </HbSection>

          {/* ── 5. Detail-view (advisor-samtale-fladen) ── */}
          {activeMetric && activeMetric.history.length > 0 && (
            <HbSection eyebrow={`Udvikling · ${activeMetric.label}`} className="mt-10">
              <HbCard className="relative p-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activeMetric.history} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
                      <defs>
                        <linearGradient id="hbgrad-detail" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--hb-evergreen))" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(var(--hb-evergreen))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--hb-line))" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--hb-ink-soft))" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={activeUnit === "%" ? (v: number) => `${v} %` : formatCompact} tick={{ fontSize: 11, fill: "hsl(var(--hb-ink-soft))" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value: number) => [activeUnit === "%" ? `${value.toFixed(1)} %` : formatDKK(value), activeMetric.label]} {...hbTooltipStyle} />
                      {commentsForSelected.map((c) => (
                        <ReferenceLine key={c.id} x={activeMetric.history.find((h) => h.periodKey === c.period_key)?.month} stroke="hsl(var(--hb-rust))" strokeDasharray="4 4" opacity={0.5} />
                      ))}
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--hb-evergreen))"
                        strokeWidth={2.5}
                        fill="url(#hbgrad-detail)"
                        connectNulls
                        dot={renderCommentDot}
                        activeDot={renderCommentDot}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Kommentar-popover — advisors only. INGEN portal: absolut
                    Hb-kort i fladens eget DOM (theme-scope-lektionen). */}
                {isAdvisor && commentPopover && (
                  <div
                    className="absolute z-20 w-72 rounded-hb border border-hb-line bg-hb-surface p-4 shadow-lg"
                    style={{ left: Math.min(commentPopover.x, 600), top: commentPopover.y + 40 }}
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                      Kommentar · {commentPopover.periodLabel}
                    </p>
                    <textarea
                      autoFocus
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      rows={3}
                      aria-label="Kommentar til perioden"
                      className={cn(hbControlClasses, "mt-2 resize-y text-sm")}
                    />
                    {commentError && <p className="mt-1.5 text-xs text-hb-rust">{commentError}</p>}
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCommentPopover(null);
                          setCommentDraft("");
                        }}
                        className="px-2 text-sm text-hb-ink-soft hover:text-hb-ink"
                      >
                        Fortryd
                      </button>
                      <HbButton variant="secondary" className="h-8 px-3.5 text-sm" onClick={() => void handleSaveComment()} disabled={savingComment}>
                        {savingComment ? "Gemmer…" : "Gem"}
                      </HbButton>
                    </div>
                  </div>
                )}

                {/* Kommentar-badges — begge roller */}
                {commentsForSelected.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-hb-line pt-4">
                    {commentsForSelected.map((c) => (
                      <div key={c.id} className="flex items-start gap-2.5 text-sm">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-hb-rust" />
                        <p className="min-w-0 leading-relaxed text-hb-ink">
                          <span className="font-medium">{c.period_label}:</span>{" "}
                          <span className="text-hb-ink-soft">{c.content}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </HbCard>
            </HbSection>
          )}

          {/* ── 6. Branche-benchmark (begge roller — benchmark-synligheds-
              beslutningen 2026-08-05) ── */}
          {gaugeRows.length > 0 && industryBenchmarkData && (
            <HbSection eyebrow={`Branchesammenligning${industryBenchmarkData.industryLabel ? ` · ${industryBenchmarkData.industryLabel}` : ""}`} className="mt-10">
              <HbCard className="space-y-4 p-6">
                {gaugeRows.map(({ b, metric }) => {
                  const pos = Math.max(0, Math.min(100, ((metric.numValue - b.benchmark_min) / (b.benchmark_max - b.benchmark_min)) * 100));
                  const benchPos = Math.max(0, Math.min(100, ((b.benchmark_value - b.benchmark_min) / (b.benchmark_max - b.benchmark_min)) * 100));
                  return (
                    <div key={b.kpi_key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{metric.label}</p>
                        <p className="text-xs text-hb-ink-soft">
                          dig: <span className="font-medium text-hb-ink">{metric.value}</span>
                          {/* "dig"-tallet er seneste faktarække — er den et estimat,
                              må prikken ikke stå umærket mod brancheintervaller
                              kalibreret til rigtige månedstal. */}
                          {senesteErEstimat && <EstimatMaerke className="ml-1.5 align-middle" />} · branche: {b.benchmark_label}
                        </p>
                      </div>
                      <div className="relative mt-1.5 h-1.5 rounded-full bg-hb-sage/60">
                        <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-hb-ink-soft/50" style={{ left: `${benchPos}%` }} aria-hidden />
                        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-hb-evergreen" style={{ left: `${pos}%` }} aria-hidden />
                      </div>
                    </div>
                  );
                })}
              </HbCard>
            </HbSection>
          )}

          {/* ── 7. Sammenligningstabel (M/M) ── */}
          {monthlyData.length >= 2 && (
            <HbSection eyebrow="Måned for måned" className="mt-10">
              <HbCard className="overflow-x-auto p-0">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-hb-line text-left">
                      <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Nøgletal</th>
                      {monthlyData.slice(-6).map((m) => (
                        <th key={m.sortKey} className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                          {m.month}
                          {/* Kort mærkat, ikke en sætning — forklaringen bor i title. */}
                          {m.data_basis === "estimated" && <EstimatMaerke kompakt className="block" />}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {KPI_DEFS.map((def) => (
                      <tr key={def.key} className="border-b border-hb-line/60 last:border-b-0">
                        <td className="px-4 py-2.5 text-hb-ink">{def.label}</td>
                        {monthlyData.slice(-6).map((m) => {
                          const v = VALUE_EXTRACTORS[def.key]?.(m.kf) ?? null;
                          return (
                            <td key={m.sortKey} className="px-4 py-2.5 text-right font-editorial text-hb-ink">
                              {v != null ? (def.unit === "%" ? `${v.toFixed(1)} %` : formatCompact(v)) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </HbCard>
            </HbSection>
          )}
        </div>
      )}

      {/* ── 8. AI-analysen (Hb-visningslag over useFinancialAnalysis —
          uden for eksport-DOM'en, klik-valg K1) ── */}
      {monthlyData.length > 0 && (
        <HbSection eyebrow="AI-analyse" className="mt-10">
          <HbFinancialAnalysis
            conversationId={conversationId}
            companyId={companyId}
            userId={user?.id || null}
            selectedPeriodKey={aiPeriodKey}
            onSelectPeriod={setAiPeriodKey}
          />
        </HbSection>
      )}

      {/* ── 9. Mål og benchmarks-panelet (begge roller — mål-adgangs-
          beslutningen). Wrapper-div bærer scroll-ref'en (HbSection
          forwarder ikke ref). ── */}
      {showAdvanced && editingReady && (
        <div ref={advancedRef} className="scroll-mt-24">
        <HbSection eyebrow="Mål og benchmarks" className="mt-10">
          <HbCard className="p-6">
            <HbField
              label="Brancheskabelon"
              htmlFor="kpi-template"
              help="Udfylder benchmark-felterne — du kan rette bagefter."
            >
              <HbSelect
                id="kpi-template"
                value={selectedTemplate ?? ""}
                onChange={(e) => {
                  const template = INDUSTRY_TEMPLATES.find((t) => t.name === e.target.value);
                  if (template) applyTemplate(template);
                }}
              >
                <option value="">Vælg skabelon…</option>
                {INDUSTRY_TEMPLATES.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </HbSelect>
            </HbField>

            <div className="mt-6 space-y-5">
              {KPI_DEFS.map((def) => {
                // Model A: branchetallet som stille kalibrering ved mål-feltet
                // (læst fra edit-state så skabelonvalg afspejles øjeblikkeligt).
                // Målet forbliver aktivt valg — INGEN auto-udfyldning fra
                // benchmark (model C fravalgt, beslutning 2026-08-05).
                const benchNum = parseFloat(editBenchmarkValues[def.key]?.value || "0") || 0;
                const benchHelp =
                  benchNum > 0
                    ? `branche: ${def.unit === "%" ? `${editBenchmarkValues[def.key].value} %` : formatCompact(benchNum)}`
                    : undefined;
                return (
                <div key={def.key} className="grid gap-3 sm:grid-cols-2">
                  <HbField label={`${def.label} · mål`} htmlFor={`target-${def.key}`} help={benchHelp}>
                    <div className="flex gap-2">
                      <HbInput
                        id={`target-${def.key}`}
                        value={editValues[def.key]?.value ?? ""}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [def.key]: { ...prev[def.key], value: e.target.value } }))
                        }
                        placeholder="Værdi"
                        className="text-sm"
                      />
                      <HbInput
                        value={editValues[def.key]?.label ?? ""}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [def.key]: { ...prev[def.key], label: e.target.value } }))
                        }
                        placeholder="Visningslabel"
                        aria-label={`${def.label} mål-label`}
                        className="text-sm"
                      />
                    </div>
                  </HbField>
                  <HbField label={`${def.label} · benchmark`} htmlFor={`bench-${def.key}`}>
                    <div className="flex gap-2">
                      <HbInput
                        id={`bench-${def.key}`}
                        value={editBenchmarkValues[def.key]?.value ?? ""}
                        onChange={(e) => updateBenchmarkField(def.key, { value: e.target.value })}
                        placeholder="Værdi"
                        className="text-sm"
                      />
                      <HbInput
                        value={editBenchmarkValues[def.key]?.label ?? ""}
                        onChange={(e) => updateBenchmarkField(def.key, { label: e.target.value })}
                        placeholder="Visningslabel"
                        aria-label={`${def.label} benchmark-label`}
                        className="text-sm"
                      />
                    </div>
                  </HbField>
                </div>
                );
              })}
            </div>

            <div className="mt-6 flex items-center gap-4 border-t border-hb-line pt-4">
              <HbButton onClick={() => void saveAdvanced()} disabled={saving} className="h-9 px-5 text-sm">
                {saving ? "Gemmer…" : "Gem mål og benchmarks"}
              </HbButton>
              <p className="text-xs text-hb-ink-soft">
                {saveError ? <span className="text-hb-rust">{saveError}</span> : savedNote}
              </p>
            </div>
          </HbCard>
        </HbSection>
        </div>
      )}
    </div>
  );
};
