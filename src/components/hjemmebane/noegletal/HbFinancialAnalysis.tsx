import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFinancialAnalysis } from "@/hooks/useFinancialAnalysis";
import { deriveDefaultExpanded, type KeyFinding, type TrendItem } from "@/lib/financialAnalysis";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSelect } from "../admin/HbField";

/** HbFinancialAnalysis — Hjemmebane-visningslaget over useFinancialAnalysis
    (design-blok hb-ai-design.md, godkendt 2026-08-05). Maskinen inkl.
    messages-idempotensen bor i hook'en (én sandhed) — dette lag vælger kun
    udtryk: stille statuslinje (Mola, savedNote-mønsteret) i stedet for
    toasts, rolige kort i stedet for alert-flader. Alvor bæres af
    rust-markør/kant/åbenhed/ord — ALDRIG farvede flader (kpiTone-
    princippet: tal-alvor er attention, ikke alarm; alert er forbeholdt
    fejl-tilstande). Eksisterende analyse forbliver synlig under generering
    (bevidst udtryksforskel fra gamle komponent). Sektionen står UDE af
    kpi-export-area (K1) — PDF-eksporten røres ikke. */

interface HbFinancialAnalysisProps {
  conversationId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  /** Controlled valgt periode (parent ejer den; null = auto-vælg seneste m. analyse) */
  selectedPeriodKey?: string | null;
  onSelectPeriod?: (key: string) => void;
}

/** Severity-markøren: kritisk = udfyldt rust + default-åben + ordet;
    advarsel = rust-outline; positiv = udfyldt evergreen (ToneDot-trappen). */
const SeverityDot = ({ severity }: { severity: KeyFinding["severity"] }) => {
  if (severity === "kritisk") return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-hb-rust" />;
  if (severity === "advarsel") return <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-hb-rust" />;
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-hb-evergreen" />;
};

const severityLabel: Record<KeyFinding["severity"], { text: string; cls: string }> = {
  kritisk: { text: "Kritisk", cls: "text-hb-rust" },
  advarsel: { text: "Advarsel", cls: "text-hb-ink-soft" },
  positiv: { text: "Positiv", cls: "text-hb-ink-soft" },
};

export const HbFinancialAnalysis = ({
  conversationId,
  companyId,
  userId,
  selectedPeriodKey = null,
  onSelectPeriod,
}: HbFinancialAnalysisProps) => {
  // HOOKS-REGLEN: alle hooks i topblokken — ingen betinget return over dem.
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set());
  const [showAllTrends, setShowAllTrends] = useState(false);
  const [openSections, setOpenSections] = useState({ trends: false, questions: false, nextSteps: false });

  const {
    availablePeriods,
    effectivePeriodKey,
    analysis,
    sortedFindings,
    isStale,
    dataSufficiency,
    needsMoreData,
    loading,
    handleGenerate,
  } = useFinancialAnalysis({
    conversationId,
    companyId,
    userId,
    selectedPeriodKey,
    onSelectPeriod,
    // Stille kvitteringer — ingen toasts på Hb-fladen.
    onGenerated: () => {
      setStatusError(null);
      setStatusNote(`Analyse klar · ${new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`);
    },
    onError: (m) => {
      setStatusNote(null);
      setStatusError(m);
    },
  });

  // Default-fold-dommen deles med gamle komponent (deriveDefaultExpanded).
  useEffect(() => {
    setExpandedFindings(new Set(deriveDefaultExpanded(sortedFindings)));
  }, [sortedFindings]);

  const toggleFinding = (i: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const toggleSection = (key: "trends" | "questions" | "nextSteps") => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const startGenerate = () => {
    setStatusNote(null);
    setStatusError(null);
    void handleGenerate();
  };

  return (
    <div className="space-y-4">
      {/* ── Topline: periodevalg (eget valg består via parent) + generér + stille status ── */}
      <div className="flex flex-wrap items-center gap-3">
        {availablePeriods.length > 0 && (
          <HbSelect
            aria-label="Analyseperiode"
            value={effectivePeriodKey ?? ""}
            onChange={(e) => onSelectPeriod?.(e.target.value)}
            className="w-auto min-w-[180px] py-2 text-sm"
          >
            {availablePeriods.map((p) => (
              <option key={p.period_key} value={p.period_key}>
                {p.period_label}
              </option>
            ))}
          </HbSelect>
        )}
        {effectivePeriodKey && dataSufficiency.sufficient && (
          <HbButton onClick={startGenerate} disabled={loading} className="h-9 px-5 text-sm">
            {analysis ? "Generer ny" : "Generer analyse"}
          </HbButton>
        )}
        <p className="text-xs text-hb-ink-soft" aria-live="polite">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> genererer…
            </span>
          ) : statusError ? (
            <span className="text-hb-rust">{statusError}</span>
          ) : (
            statusNote
          )}
        </p>
      </div>

      {/* ── Rolige tomme-/utilstrækkelig-tilstande (aldrig alert-flader) ── */}
      {availablePeriods.length === 0 && (
        <HbCard className="p-6">
          <p className="text-sm text-hb-ink-soft">
            Ingen godkendte tal endnu — upload og godkend en rapport, så kan analysen laves.
          </p>
        </HbCard>
      )}
      {effectivePeriodKey && !dataSufficiency.sufficient && !loading && (
        <HbCard className="p-6">
          <p className="text-sm leading-relaxed text-hb-ink">
            <span className="font-medium text-hb-rust">Ikke nok data</span> til analyse for denne periode.
            Tilføj mindst omsætning, dækningsbidrag og resultat via rapportens review-dialog.
          </p>
        </HbCard>
      )}
      {needsMoreData && !loading && (
        <HbCard className="p-6">
          <p className="text-sm leading-relaxed text-hb-ink">
            De godkendte tal indeholder ikke nok nøgletal til en komplet analyse — ret data via
            rapportens review-dialog og kør analysen igen.
          </p>
        </HbCard>
      )}

      {/* ── Analysen (forbliver synlig under generering — statuslinjen bærer ventetiden) ── */}
      {analysis && (
        <>
          {isStale && (
            <p className="flex items-center gap-2 text-xs text-hb-ink-soft">
              <span className="h-2 w-2 shrink-0 rounded-full bg-hb-rust" aria-hidden />
              Analysen er fra før seneste dataopdatering — generér igen for aktuelle tal
            </p>
          )}

          {/* Overblik */}
          <HbCard className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Overblik</p>
            <p className="mt-2 text-sm leading-relaxed text-hb-ink">{analysis.overview}</p>
          </HbCard>

          {/* Nøglefund — accordion; kritiske åbnes som standard (delt dom) */}
          <HbCard className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Nøglefund</p>
            <div className="mt-3 space-y-2.5">
              {sortedFindings.map((finding, i) => {
                const isExpanded = expandedFindings.has(i);
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-hb border border-hb-line bg-hb-surface",
                      finding.severity === "kritisk" && "border-l-2 border-l-hb-rust",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFinding(i)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center gap-3 p-4 text-left"
                    >
                      <SeverityDot severity={finding.severity} />
                      <p className="min-w-0 flex-1 text-sm font-medium text-hb-ink">{finding.title}</p>
                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-medium uppercase tracking-[0.14em]",
                          severityLabel[finding.severity].cls,
                        )}
                      >
                        {severityLabel[finding.severity].text}
                      </span>
                      <ChevronDown
                        className={cn("h-4 w-4 shrink-0 text-hb-ink-soft transition-transform", !isExpanded && "-rotate-90")}
                      />
                    </button>
                    {isExpanded && (
                      <div className="space-y-3 border-t border-hb-line/60 px-4 pb-4 pt-3">
                        <p className="text-sm leading-relaxed text-hb-ink">{finding.analysis}</p>
                        <div className="border-l-2 border-hb-line pl-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                            Anbefaling
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-hb-ink">{finding.recommendation}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </HbCard>

          {/* Trend-analyse (foldet som standard; slice-dommen arvet) */}
          <HbFoldSection
            title={`Trend-analyse · ${analysis.positive_trends.length} fokus, ${analysis.challenges.length} udfordringer`}
            isOpen={openSections.trends}
            onToggle={() => toggleSection("trends")}
          >
            <div className="space-y-5">
              <div>
                <p className="text-xs font-medium text-hb-ink">Fokusområder</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {(showAllTrends ? analysis.positive_trends : analysis.positive_trends.slice(0, 3)).map((trend, i) => (
                    <HbTrendCard key={i} trend={trend} type="positive" />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-hb-ink">Udfordringer</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {(showAllTrends ? analysis.challenges : analysis.challenges.slice(0, 3)).map((trend, i) => (
                    <HbTrendCard key={i} trend={trend} type="challenge" />
                  ))}
                </div>
              </div>
              {(analysis.positive_trends.length > 3 || analysis.challenges.length > 3) && (
                <button
                  type="button"
                  onClick={() => setShowAllTrends(!showAllTrends)}
                  className="text-xs text-hb-ink-soft underline-offset-4 hover:underline"
                >
                  {showAllTrends ? "Vis færre" : "Vis alle trends"}
                </button>
              )}
            </div>
          </HbFoldSection>

          {/* Spørgsmål til teamet (foldet som standard) */}
          <HbFoldSection
            title={`Spørgsmål til teamet · ${analysis.strategic_questions.length}`}
            isOpen={openSections.questions}
            onToggle={() => toggleSection("questions")}
          >
            <ol className="space-y-2.5">
              {analysis.strategic_questions.map((q, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-hb-ink">
                  <span className="shrink-0 text-hb-ink-soft">{i + 1}.</span>
                  {q}
                </li>
              ))}
            </ol>
          </HbFoldSection>

          {/* Næste skridt (foldet som standard) */}
          <HbFoldSection
            title={`Næste skridt · ${analysis.next_steps.length}`}
            isOpen={openSections.nextSteps}
            onToggle={() => toggleSection("nextSteps")}
          >
            <ul className="space-y-2.5">
              {analysis.next_steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-hb-ink">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-hb-evergreen" />
                  {step}
                </li>
              ))}
            </ul>
          </HbFoldSection>
        </>
      )}
    </div>
  );
};

function HbFoldSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <HbCard>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 p-5 text-left"
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{title}</span>
        <ChevronDown className={cn("h-4 w-4 text-hb-ink-soft transition-transform", !isOpen && "-rotate-90")} />
      </button>
      {isOpen && <div className="px-5 pb-5">{children}</div>}
    </HbCard>
  );
}

/** Trend-kort i stille udtryk — udfordringers metric i rust-TEKST, aldrig flade. */
function HbTrendCard({ trend, type }: { trend: TrendItem; type: "positive" | "challenge" }) {
  const isPositive = type === "positive";
  return (
    <div className="rounded-hb border border-hb-line bg-hb-surface p-4">
      <p className="text-sm font-medium text-hb-ink">{trend.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-hb-ink-soft">{trend.description}</p>
      <div className="mt-3 flex items-center justify-between">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            isPositive ? "text-hb-ink" : "text-hb-rust",
          )}
        >
          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend.metric}
        </span>
        <span className="text-[10px] text-hb-ink-soft">{trend.period}</span>
      </div>
    </div>
  );
}
