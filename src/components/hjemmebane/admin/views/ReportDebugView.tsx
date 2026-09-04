import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, Sparkles, XCircle } from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { HbButton } from "../../HbButton";
import { HbCard } from "../../HbCard";
import { HbTag } from "../../HbTag";

/**
 * Report Debug i Hjemmebane (4/9) — konvertering af src/pages/ReportDebug.tsx
 * (målt 4/9: 440 linjer i fem komponenter, nul Radix-portaler — Collapsible
 * er Radix uden portal — ingen formularfelter). Query, afledningerne
 * (isErrorReport, isLegacy, aiGateReasons, aiRan, milestonesRan),
 * agent-kaldet (run-company-agent, dry_run) og alle tekster står som i den
 * gamle fil — kun udtrykket er nyt.
 *
 * HVAD SIDEN ER (målt 4/9): rådgiverens vej ind i ÉN rapports pipeline,
 * når noget er gået galt. Kun Review Queue linker til den; den nås også
 * ved at kende id'et. Den godkender intet (commit bor i
 * ReportReviewDialog/RapporteringView).
 *
 * SKALLEN er HbMemberShell (side-flow), som ReviewQueueView og de fem
 * andre konverteringer fra i dag: siden er Platform-arbejde, ikke en af
 * HbAdminShells otte indholdssektioner. Menuen røres ikke (se
 * ReportDebug.tsx).
 *
 * TO FORMER ER NYE I HUSET — søgt 4/9: `grep -rn "<details\|<pre"
 * src/components/hjemmebane` → intet. Begge bor her, så de kan LØFTES til
 * hjemmebane/ den dag en anden flade får brug for dem:
 *
 *   FOLDEN (HbFold nedenfor): VALGT native <details>/<summary>, ikke Radix
 *   Collapsible. Collapsible portalerer ikke og kunne være blevet, men den
 *   giver kun data-state og en trigger — det native element giver det
 *   samme plus tastatur og skærmlæser-semantik gratis, uden en import fra
 *   ui/. Udtrykket er HbTreeLists rækkeform: chevron der drejer, titel i
 *   blæk, hairline under, defaultOpen via `open`-attributten (som den
 *   gamle «1. Routing» var åben fra start). Én fold pr. sektion, syv
 *   sektioner som før, samme numre og titler.
 *
 *   JSON-BLOKKEN (HbJsonBlok): monospace på papir (bg-hb-paper, hairline,
 *   rounded-hb), xs-tekst i blæk, `max-h-96 overflow-auto` så den ruller
 *   inde i sig selv og aldrig sprænger kolonnen, `whitespace-pre-wrap
 *   break-all` som før. Samme adfærd: viser de første 400 tegn, «label
 *   (N chars)» folder hele ud. Teknisk indhold må se teknisk ud — men på
 *   papir, ikke på appens mørke muted-flade.
 *
 * STATUSBADGE (:18-24, emerald/yellow-500) er blevet StatusTag på HbTag:
 * ordet siger hvad det er (PASS, FAIL, UNSURE, true, false, —), tonen
 * siger kun om det er en fejl — evergreen for PASS/true, rust for
 * FAIL/false, papir med hairline for alt andet. Som ReviewQueueView.
 *
 * KV-PARRENE er HbCard med eyebrow-labels (virksomhedssidens læseblokke,
 * VirksomhedView blok 7): label i [11px] uppercase ink-soft, værdi i
 * blæk, mono hvor den gamle var mono. Tabellerne inde i sektionerne
 * (checks, metrics, correction log) er små tekniske tabeller og står som
 * <table> med hairlines og papir-hoved — det er data-gitre, ikke lister
 * man skimmer, så grid-listen er ikke brugt.
 *
 * FEJL- OG LEGACY-KORTENE: fejlet rapport i rust-tint (border-hb-rust/40,
 * bg-hb-rust/5), legacy-advarslen som en NOTE på papir med hairline —
 * Hjemmebane har ingen gul, og advarslen er en oplysning, ikke en fejl.
 */

// ── Helpers (ordret fra ReportDebug.tsx:15-16) ─────────────────────────
const fmt = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("da-DK", { maximumFractionDigits: 2 });

/** StatusBadge → HbTag. Tone: evergreen = ok, rust = fejl, papir = resten. */
const StatusTag = ({ status }: { status: string | null | undefined }) => {
  if (!status) return <HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 text-[11px] text-hb-ink-soft">—</HbTag>;
  const s = String(status).toUpperCase();
  const ok = s === "PASS" || s === "TRUE";
  const fejl = s === "FAIL" || s === "FALSE";
  return (
    <HbTag
      className={cn(
        "px-2 py-0.5 font-mono text-[11px]",
        ok ? "bg-hb-evergreen/10 text-hb-evergreen" : fejl ? "bg-hb-rust/10 text-hb-rust" : "border border-hb-line bg-hb-paper text-hb-ink",
      )}
    >
      {String(status)}
    </HbTag>
  );
};

/** NY FORM: JSON-blok på papir. Samme adfærd som JsonBlock (:26-41). */
const HbJsonBlok = ({ data, label }: { data: unknown; label: string }) => {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(data, null, 2);
  const preview = json?.slice(0, 400);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-hb-evergreen underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        {label} ({json?.length ?? 0} chars)
      </button>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-hb border border-hb-line bg-hb-paper p-3 font-mono text-xs leading-relaxed text-hb-ink">
        {open ? json : (preview + (json && json.length > 400 ? "\n..." : ""))}
      </pre>
    </div>
  );
};

/** NY FORM: fold på native <details>. Samme numre og titler som Section (:43-56). */
const HbFold = ({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) => (
  <details open={defaultOpen} className="group rounded-hb border border-hb-line bg-hb-surface">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[15px] font-medium text-hb-ink transition-colors hover:bg-hb-sage/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60 [&::-webkit-details-marker]:hidden">
      <ChevronRight className="h-4 w-4 shrink-0 text-hb-ink-soft transition-transform group-open:rotate-90" />
      {title}
    </summary>
    <div className="space-y-3 border-t border-hb-line px-4 pb-4 pt-3">{children}</div>
  </details>
);

/** KV-par: eyebrow-label + værdi (virksomhedssidens læseblokke). */
const KV = ({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
    <div className={cn("mt-0.5 break-words text-sm text-hb-ink", mono && "font-mono text-xs")}>{value ?? "—"}</div>
  </div>
);

/** Lille teknisk tabel: hairlines, papir-hoved, mono hvor den gamle var mono. */
const Tabel = ({ hoved, raekker }: { hoved: { label: string; hoejre?: boolean }[]; raekker: ReactNode[][] }) => (
  <div className="overflow-x-auto rounded-hb border border-hb-line">
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-hb-paper text-hb-ink-soft">
          {hoved.map((h) => (
            <th key={h.label} className={cn("px-3 py-1.5 text-left font-medium", h.hoejre && "text-right")}>{h.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {raekker.map((celler, i) => (
          <tr key={i} className="border-t border-hb-line/70 text-hb-ink">
            {celler.map((c, j) => (
              <td key={j} className={cn("px-3 py-1.5 align-top", hoved[j]?.hoejre && "text-right")}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Undertitel = ({ children }: { children: ReactNode }) => (
  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{children}</p>
);

/** De tre check-tabeller (:228-284) har samme tre kolonner. */
const CheckTabel = ({ checks }: { checks: any[] }) => (
  <Tabel
    hoved={[{ label: "Name" }, { label: "Result" }, { label: "Details" }]}
    raekker={checks.map((c) => [
      <span className="font-mono">{c.name}</span>,
      <StatusTag status={c.result} />,
      <span className="text-hb-ink-soft">{c.details}</span>,
    ])}
  />
);

const METRIC_KEYS = [
  "revenue", "cogs", "gross_profit", "payroll", "ebitda", "ebit", "ebt", "net_result",
  "assets_total", "inventory", "receivables_total", "cash",
  "equity_total", "equity_ratio_pct", "debt_total", "current_liabilities", "liabilities_total",
];

export const ReportDebugView = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [agentRunning, setAgentRunning] = useState(false);

  // Query ordret fra ReportDebug.tsx:70-82.
  const { data: report, isLoading } = useQuery({
    queryKey: ["report-debug", reportId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("financial_reports")
        .select("*") as any)
        .eq("id", reportId)
        .single();
      if (error) throw error;
      return data as Record<string, any>;
    },
    enabled: !!reportId,
  });

  const tilbage = (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="inline-flex items-center gap-2 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
    >
      <ArrowLeft className="h-4 w-4" /> Tilbage
    </button>
  );

  if (isLoading) {
    return (
      <div>
        {tilbage}
        <div aria-hidden className="mt-6">
          <div className="h-4 w-24 animate-pulse rounded bg-hb-line/60" />
          <div className="mt-4 h-10 w-2/3 animate-pulse rounded bg-hb-line/60" />
          <div className="mt-8 h-32 animate-pulse rounded-hb bg-hb-line/40" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div>
        {tilbage}
        <p className="mt-8 text-center text-sm text-hb-ink-soft">Rapport ikke fundet.</p>
      </div>
    );
  }

  // Afledninger ordret fra :98-119.
  const norm = report.normalized_data as Record<string, any> | null;
  const isErrorReport = report.status === 'error' && !norm;
  const isLegacy = !norm && !isErrorReport;
  const metrics = norm?.metrics as Record<string, number | null> | null;
  const validation = norm?.validation as Record<string, any> | null;
  const detMeta = norm?.deterministic_meta as Record<string, any> | null;
  const correctionLog = norm?.correction_log as any[] | null;
  const provenance = norm?.provenance as Record<string, any> | null;
  const aiPayload = norm?.ai_eligible_payload as Record<string, any> | null;
  const aiAnalysis = report.ai_analysis;

  const aiGateReasons: string[] = [];
  if (isLegacy) {
    aiGateReasons.push("Legacy rapport uden canonical data");
  } else {
    if (validation?.status !== "PASS") aiGateReasons.push(`validation_status = "${validation?.status}" (kræver PASS)`);
    if (norm?.ai_eligible === false) aiGateReasons.push("ai_eligible = false");
    if (!aiPayload) aiGateReasons.push("ai_eligible_payload er null");
  }
  const aiRan = !!aiAnalysis && typeof aiAnalysis === "object";
  const milestonesRan = aiRan && (aiAnalysis as any)?.milestones && (aiAnalysis as any).milestones.length > 0;

  // Agent-kaldet ordret fra :400-427.
  const koerAgentToert = async () => {
    setAgentRunning(true);
    try {
      const { data: agentData, error: agentError } = await supabase.functions.invoke("run-company-agent", {
        body: {
          company_id: report.company_id,
          trigger: "report_committed",
          period_key: report.report_period_key || report.report_period,
          period_label: report.report_period,
          dry_run: true,
        },
      });
      if (agentError) throw agentError;
      if (!agentData?.ok) {
        throw new Error(agentData?.error || "Agenten producerede intet output");
      }
      if (agentData?.dry_run !== true) {
        throw new Error("Kørslen var IKKE tør — funktionen i prod kender ikke dry_run endnu. Skrivninger kan være udført; verificér deploy.");
      }
      toast.success("Tør-kørsel gennemført ✓", {
        description: `${agentData?.proposals ?? 0} forslag registreret i agent_runs — intet er skrevet.`,
      });
    } catch (err) {
      toast.error("Agent fejlede", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setAgentRunning(false);
    }
  };

  return (
    <div className="max-w-4xl">
      {tilbage}

      {/* ── Header (:130-145) ── */}
      <section className="mt-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Platform</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Report Debug</h1>
          <HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 font-mono text-[10px] text-hb-ink-soft">{report.id}</HbTag>
        </div>
      </section>

      <HbCard className="mt-8 p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <KV label="file_name" value={report.file_name} mono />
          <KV label="company_name" value={report.company_name} />
          <KV label="report_type" value={report.report_type} />
          <KV label="report_period" value={report.report_period} />
          <KV label="uploaded_at" value={report.uploaded_at ? format(new Date(report.uploaded_at), "d. MMM yyyy HH:mm", { locale: da }) : "—"} />
          <KV label="extraction_method" value={report.extraction_method} mono />
          <KV label="validation_status" value={<StatusTag status={report.validation_status} />} />
          <KV label="status" value={<HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 font-mono text-[11px] text-hb-ink">{report.status}</HbTag>} />
        </div>
      </HbCard>

      {/* ── Fejlet rapport (:148-167) — rust ── */}
      {isErrorReport && (
        <div className="mt-6 space-y-3 rounded-hb border border-hb-rust/40 bg-hb-rust/5 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-hb-rust">
            <XCircle className="h-5 w-5" />
            Fejlet rapport
          </p>
          <p className="text-xs text-hb-ink-soft">
            Denne rapport fejlede under behandling. extraction_method: <span className="font-mono text-hb-ink">{report.extraction_method || "—"}</span>
          </p>
          {report.validation_errors?.length > 0 && (
            <div className="text-xs text-hb-ink-soft">
              <p className="mb-1 font-medium text-hb-ink">Fejl:</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {report.validation_errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <HbJsonBlok data={report.raw_extracted_data} label="raw_extracted_data (routing trace)" />
        </div>
      )}

      {/* ── Legacy (:170-179) — en note på papir ── */}
      {isLegacy && (
        <div className="mt-6 space-y-3 rounded-hb border border-hb-line bg-hb-paper p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-hb-ink">
            <AlertTriangle className="h-5 w-5 text-hb-ink-soft" />
            Legacy rapport — ingen canonical data
          </p>
          <p className="text-xs text-hb-ink-soft">Denne rapport blev behandlet før Phase 4. Canonical sektioner er ikke tilgængelige. Viser extracted_data som fallback.</p>
          <HbJsonBlok data={report.extracted_data} label="extracted_data (legacy fallback)" />
        </div>
      )}

      {/* ── Sektionerne — kun for canonical rapporter (:182-436) ── */}
      {!isLegacy && (
        <div className="mt-6 space-y-3">
          {/* 1. Routing */}
          <HbFold title="1. Routing" defaultOpen>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
              <KV label="extraction_method" value={norm?.extraction_method} mono />
              <KV label="statement_type" value={norm?.statement_type} mono />
              <KV label="selected_period_basis" value={norm?.selected_period_basis} mono />
              <KV label="template_id" value={norm?.template_id || detMeta?.template_id} mono />
            </div>
            {detMeta && (
              <div>
                <Undertitel>Deterministic Metadata</Undertitel>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                  <KV label="detection_score" value={detMeta.detection_score} mono />
                  <KV label="parser_confidence" value={detMeta.parser_confidence} mono />
                  <KV label="parser_validation_status" value={<StatusTag status={detMeta.parser_validation_status} />} />
                  <KV label="parser_validation_errors" value={
                    detMeta.parser_validation_errors?.length
                      ? detMeta.parser_validation_errors.join(", ")
                      : "Ingen"
                  } />
                  <KV label="raw_line_count" value={detMeta.raw_line_count} mono />
                  <KV label="normalized_line_count" value={detMeta.normalized_line_count} mono />
                  {detMeta.column_basis_rule && <KV label="column_basis_rule" value={detMeta.column_basis_rule} mono />}
                </div>
              </div>
            )}
          </HbFold>

          {/* 2. Raw vs Normalized */}
          <HbFold title="2. Raw vs Normalized">
            <HbJsonBlok data={report.raw_extracted_data} label="raw_extracted_data" />
            <HbJsonBlok data={norm} label="normalized_data (canonical output)" />
          </HbFold>

          {/* 3. Validation */}
          <HbFold title="3. Validation">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <KV label="validation.status" value={<StatusTag status={validation?.status} />} />
              <KV label="validation_errors (DB)" value={
                report.validation_errors?.length
                  ? report.validation_errors.join(", ")
                  : "Ingen"
              } />
            </div>
            {validation?.canonical_checks?.length > 0 && (
              <div>
                <Undertitel>canonical_checks</Undertitel>
                <div className="mt-1.5"><CheckTabel checks={validation.canonical_checks} /></div>
              </div>
            )}
            {validation?.ai_checks?.length > 0 && (
              <div>
                <Undertitel>ai_checks</Undertitel>
                <div className="mt-1.5"><CheckTabel checks={validation.ai_checks} /></div>
              </div>
            )}
            {validation?.server_checks?.length > 0 && (
              <div>
                <Undertitel>server_checks</Undertitel>
                <div className="mt-1.5"><CheckTabel checks={validation.server_checks} /></div>
              </div>
            )}
          </HbFold>

          {/* 4. Canonical Metrics */}
          <HbFold title="4. Canonical Metrics">
            <Tabel
              hoved={[{ label: "Metric" }, { label: "Value", hoejre: true }]}
              raekker={METRIC_KEYS.map((key) => [
                <span className="font-mono">{key}</span>,
                <span className="font-mono">{fmt(metrics?.[key])}</span>,
              ])}
            />
            <KV label="ai_eligible" value={<StatusTag status={norm?.ai_eligible ? "true" : "false"} />} />
          </HbFold>

          {/* 5. Correction Log & Provenance */}
          <HbFold title="5. Correction Log & Provenance">
            {correctionLog && correctionLog.length > 0 ? (
              <Tabel
                hoved={[
                  { label: "Field" }, { label: "Source" }, { label: "Raw", hoejre: true },
                  { label: "Normalized", hoejre: true }, { label: "Rule" }, { label: "Reason" },
                ]}
                raekker={correctionLog.map((c) => [
                  <span className="font-mono">{c.field}</span>,
                  c.source,
                  <span className="font-mono">{fmt(c.raw_value)}</span>,
                  <span className="font-mono">{fmt(c.normalized_value)}</span>,
                  <span className="text-hb-ink-soft">{c.rule}</span>,
                  <span className="text-hb-ink-soft">{c.reason}</span>,
                ])}
              />
            ) : (
              <p className="text-xs text-hb-ink-soft">Ingen korrektioner.</p>
            )}
            <HbJsonBlok data={provenance} label="provenance" />
          </HbFold>

          {/* 6. AI Gate */}
          <HbFold title="6. AI Gate">
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-xs font-medium">
                {aiRan ? (
                  <><CheckCircle2 className="h-4 w-4 text-hb-evergreen" /><span className="text-hb-evergreen">AI-analyse blev kørt</span></>
                ) : (
                  <><XCircle className="h-4 w-4 text-hb-rust" /><span className="text-hb-rust">AI-analyse blev IKKE kørt</span></>
                )}
              </p>
              <p className="flex items-center gap-2 text-xs font-medium">
                {milestonesRan ? (
                  <><CheckCircle2 className="h-4 w-4 text-hb-evergreen" /><span className="text-hb-evergreen">Milestones blev genereret ({(aiAnalysis as any)?.milestones?.length} stk)</span></>
                ) : aiRan ? (
                  <><AlertTriangle className="h-4 w-4 text-hb-ink-soft" /><span className="text-hb-ink">AI kørte, men ingen milestones genereret</span></>
                ) : (
                  <><XCircle className="h-4 w-4 text-hb-rust" /><span className="text-hb-rust">Milestones blev IKKE kørt (AI blokeret)</span></>
                )}
              </p>
              {aiGateReasons.length > 0 && !aiRan && (
                <div className="space-y-1 rounded-hb border border-hb-rust/30 bg-hb-rust/5 p-3">
                  <p className="text-xs font-medium text-hb-rust">Blokeringsårsager:</p>
                  {aiGateReasons.map((r, i) => (
                    <p key={i} className="text-xs text-hb-rust/80">• {r}</p>
                  ))}
                </div>
              )}
              {aiPayload && <HbJsonBlok data={aiPayload} label="ai_eligible_payload" />}
              {aiAnalysis && <HbJsonBlok data={aiAnalysis} label="ai_analysis" />}
            </div>
          </HbFold>

          {/* 7. Agent (:390-434) */}
          <HbCard className="p-5">
            <p className="flex items-center gap-2 text-[15px] font-medium text-hb-ink">
              <Sparkles className="h-4 w-4 text-hb-evergreen" />
              Agent
            </p>
            <p className="mt-1 text-xs text-hb-ink-soft">
              Kør agenten tørt for denne rapport — skrivekald registreres som forslag i
              kørselsloggen (agent_runs) og udføres ikke. Intet når medlemmet.
            </p>
            <HbButton onClick={koerAgentToert} disabled={agentRunning} className="mt-3 h-9 gap-2 px-4 text-sm">
              {agentRunning ? <Check className="h-3.5 w-3.5 animate-pulse" /> : <Sparkles className="h-3.5 w-3.5" />}
              {agentRunning ? "Kører..." : "Kør agent (tørt)"}
            </HbButton>
          </HbCard>
        </div>
      )}
    </div>
  );
};
