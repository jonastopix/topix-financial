import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ArrowLeft, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { useState } from "react";

// -- Helpers --
const fmt = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("da-DK", { maximumFractionDigits: 2 });

const StatusBadge = ({ status }: { status: string | null }) => {
  if (!status) return <Badge variant="outline">—</Badge>;
  const s = status.toUpperCase();
  if (s === "PASS") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">PASS</Badge>;
  if (s === "FAIL") return <Badge variant="destructive">FAIL</Badge>;
  return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30">{status}</Badge>;
};

const JsonBlock = ({ data, label }: { data: unknown; label: string }) => {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(data, null, 2);
  const preview = json?.slice(0, 400);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="text-xs font-medium text-primary hover:underline mb-1 flex items-center gap-1">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label} ({json?.length ?? 0} chars)
      </button>
      <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-auto max-h-96 whitespace-pre-wrap break-all text-muted-foreground">
        {open ? json : (preview + (json && json.length > 400 ? "\n..." : ""))}
      </pre>
    </div>
  );
};

const Section = ({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 px-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left">
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 pb-1 px-1 space-y-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};

const KV = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-xs text-muted-foreground min-w-[140px]">{label}</span>
    <span className={`text-xs font-medium text-foreground ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
  </div>
);

export default function ReportDebug() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();

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

  if (isLoading) return (
    <AppLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    </AppLayout>
  );

  if (!report) return (
    <AppLayout>
      <div className="p-8 text-center text-muted-foreground">Rapport ikke fundet.</div>
    </AppLayout>
  );

  const norm = report.normalized_data as Record<string, any> | null;
  const isLegacy = !norm;
  const metrics = norm?.metrics as Record<string, number | null> | null;
  const validation = norm?.validation as Record<string, any> | null;
  const detMeta = norm?.deterministic_meta as Record<string, any> | null;
  const correctionLog = norm?.correction_log as any[] | null;
  const provenance = norm?.provenance as Record<string, any> | null;
  const aiPayload = norm?.ai_eligible_payload as Record<string, any> | null;
  const aiAnalysis = report.ai_analysis;

  // AI Gate reasoning
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

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Tilbage
        </Button>

        {/* Header */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-foreground">Report Debug</h1>
            <Badge variant="outline" className="font-mono text-[10px]">{report.id}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-6">
            <KV label="file_name" value={report.file_name} mono />
            <KV label="company_name" value={report.company_name} />
            <KV label="report_type" value={report.report_type} />
            <KV label="report_period" value={report.report_period} />
            <KV label="uploaded_at" value={report.uploaded_at ? format(new Date(report.uploaded_at), "d. MMM yyyy HH:mm", { locale: da }) : "—"} />
            <KV label="extraction_method" value={report.extraction_method} mono />
            <KV label="validation_status" value={<StatusBadge status={report.validation_status} />} />
            <KV label="status" value={<Badge variant="outline">{report.status}</Badge>} />
          </div>
        </div>

        {/* Legacy warning */}
        {isLegacy && (
          <div className="rounded-xl border-2 border-yellow-500/40 bg-yellow-500/10 p-5 space-y-3">
            <div className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold text-sm">Legacy rapport — ingen canonical data</span>
            </div>
            <p className="text-xs text-muted-foreground">Denne rapport blev behandlet før Phase 4. Canonical sektioner er ikke tilgængelige. Viser extracted_data som fallback.</p>
            <JsonBlock data={report.extracted_data} label="extracted_data (legacy fallback)" />
          </div>
        )}

        {/* Sections — only for canonical reports */}
        {!isLegacy && (
          <div className="space-y-3">
            {/* 1. Routing */}
            <Section title="1. Routing" defaultOpen>
              <div className="space-y-1 pl-2">
                <KV label="extraction_method" value={norm?.extraction_method} mono />
                <KV label="statement_type" value={norm?.statement_type} mono />
                <KV label="selected_period_basis" value={norm?.selected_period_basis} mono />
                <KV label="template_id" value={norm?.template_id || detMeta?.template_id} mono />
              </div>
              {detMeta && (
                <div className="mt-3 pl-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Deterministic Metadata</p>
                  <div className="space-y-1">
                    <KV label="detection_score" value={detMeta.detection_score} mono />
                    <KV label="parser_confidence" value={detMeta.parser_confidence} mono />
                    <KV label="parser_validation_status" value={<StatusBadge status={detMeta.parser_validation_status} />} />
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
            </Section>

            {/* 2. Raw vs Normalized */}
            <Section title="2. Raw vs Normalized">
              <JsonBlock data={report.raw_extracted_data} label="raw_extracted_data" />
              <JsonBlock data={norm} label="normalized_data (canonical output)" />
            </Section>

            {/* 3. Validation */}
            <Section title="3. Validation">
              <div className="space-y-2 pl-2">
                <KV label="validation.status" value={<StatusBadge status={validation?.status} />} />
                <KV label="validation_errors (DB)" value={
                  report.validation_errors?.length
                    ? report.validation_errors.join(", ")
                    : "Ingen"
                } />
              </div>
              {validation?.canonical_checks?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 pl-2">canonical_checks</p>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/50"><th className="px-3 py-1.5 text-left">Name</th><th className="px-3 py-1.5 text-left">Result</th><th className="px-3 py-1.5 text-left">Details</th></tr></thead>
                      <tbody>
                        {validation.canonical_checks.map((c: any, i: number) => (
                          <tr key={i} className="border-t border-border/50">
                            <td className="px-3 py-1.5 font-mono">{c.name}</td>
                            <td className="px-3 py-1.5"><StatusBadge status={c.result} /></td>
                            <td className="px-3 py-1.5 text-muted-foreground">{c.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {validation?.ai_checks?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 pl-2">ai_checks</p>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/50"><th className="px-3 py-1.5 text-left">Name</th><th className="px-3 py-1.5 text-left">Result</th><th className="px-3 py-1.5 text-left">Details</th></tr></thead>
                      <tbody>
                        {validation.ai_checks.map((c: any, i: number) => (
                          <tr key={i} className="border-t border-border/50">
                            <td className="px-3 py-1.5 font-mono">{c.name}</td>
                            <td className="px-3 py-1.5"><StatusBadge status={c.result} /></td>
                            <td className="px-3 py-1.5 text-muted-foreground">{c.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {validation?.server_checks?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 pl-2">server_checks</p>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/50"><th className="px-3 py-1.5 text-left">Name</th><th className="px-3 py-1.5 text-left">Result</th><th className="px-3 py-1.5 text-left">Details</th></tr></thead>
                      <tbody>
                        {validation.server_checks.map((c: any, i: number) => (
                          <tr key={i} className="border-t border-border/50">
                            <td className="px-3 py-1.5 font-mono">{c.name}</td>
                            <td className="px-3 py-1.5"><StatusBadge status={c.result} /></td>
                            <td className="px-3 py-1.5 text-muted-foreground">{c.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Section>

            {/* 4. Canonical Metrics */}
            <Section title="4. Canonical Metrics">
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/50"><th className="px-3 py-1.5 text-left">Metric</th><th className="px-3 py-1.5 text-right">Value</th></tr></thead>
                  <tbody>
                    {[
                      "revenue", "cogs", "gross_profit", "payroll", "ebitda", "ebit", "ebt", "net_result",
                      "assets_total", "inventory", "receivables_total", "cash",
                      "equity_total", "equity_ratio_pct", "debt_total", "current_liabilities", "liabilities_total",
                    ].map((key) => (
                      <tr key={key} className="border-t border-border/50">
                        <td className="px-3 py-1.5 font-mono">{key}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{fmt(metrics?.[key])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pl-2 mt-2">
                <KV label="ai_eligible" value={
                  norm?.ai_eligible
                    ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">true</Badge>
                    : <Badge variant="destructive">false</Badge>
                } />
              </div>
            </Section>

            {/* 5. Correction Log & Provenance */}
            <Section title="5. Correction Log & Provenance">
              {correctionLog && correctionLog.length > 0 ? (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/50">
                      <th className="px-3 py-1.5 text-left">Field</th>
                      <th className="px-3 py-1.5 text-left">Source</th>
                      <th className="px-3 py-1.5 text-right">Raw</th>
                      <th className="px-3 py-1.5 text-right">Normalized</th>
                      <th className="px-3 py-1.5 text-left">Rule</th>
                      <th className="px-3 py-1.5 text-left">Reason</th>
                    </tr></thead>
                    <tbody>
                      {correctionLog.map((c, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-3 py-1.5 font-mono">{c.field}</td>
                          <td className="px-3 py-1.5">{c.source}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmt(c.raw_value)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmt(c.normalized_value)}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{c.rule}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{c.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pl-2">Ingen korrektioner.</p>
              )}
              <JsonBlock data={provenance} label="provenance" />
            </Section>

            {/* 6. AI Gate */}
            <Section title="6. AI Gate">
              <div className="space-y-3 pl-2">
                {/* AI analysis status */}
                <div className="flex items-center gap-2">
                  {aiRan ? (
                    <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-xs font-medium text-emerald-700">AI-analyse blev kørt</span></>
                  ) : (
                    <><XCircle className="h-4 w-4 text-destructive" /><span className="text-xs font-medium text-destructive">AI-analyse blev IKKE kørt</span></>
                  )}
                </div>

                {/* Milestones status */}
                <div className="flex items-center gap-2">
                  {milestonesRan ? (
                    <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-xs font-medium text-emerald-700">Milestones blev genereret ({(aiAnalysis as any)?.milestones?.length} stk)</span></>
                  ) : aiRan ? (
                    <><AlertTriangle className="h-4 w-4 text-yellow-600" /><span className="text-xs font-medium text-yellow-700">AI kørte, men ingen milestones genereret</span></>
                  ) : (
                    <><XCircle className="h-4 w-4 text-destructive" /><span className="text-xs font-medium text-destructive">Milestones blev IKKE kørt (AI blokeret)</span></>
                  )}
                </div>

                {/* Gate reasons */}
                {aiGateReasons.length > 0 && !aiRan && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                    <p className="text-xs font-semibold text-destructive">Blokeringsårsager:</p>
                    {aiGateReasons.map((r, i) => (
                      <p key={i} className="text-xs text-destructive/80">• {r}</p>
                    ))}
                  </div>
                )}

                {/* ai_eligible_payload */}
                {aiPayload && <JsonBlock data={aiPayload} label="ai_eligible_payload" />}

                {/* ai_analysis */}
                {aiAnalysis && <JsonBlock data={aiAnalysis} label="ai_analysis" />}
              </div>
            </Section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
