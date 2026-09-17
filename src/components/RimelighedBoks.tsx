import { AlertTriangle } from "lucide-react";
import { ADVARSEL_INTRO, ADVARSEL_OVERSKRIFT, BEKRAEFT_TEKST, rimelighedAdvarsler, type RimelighedAdvarsel } from "@/lib/rimelighed";
import { ALL_FIELDS, DANISH_TO_CANONICAL, parseMetricValue } from "@/lib/reportOverrideHelpers";

/**
 * «Tal der ikke kan passe?» — advarselsboksen med det aktive «Ja, tallene er
 * rigtige — godkend alligevel» (D, 18/9-2026). Bruges af
 * ReportReviewDialog (preview og inline-rettelse) og ReportManualOverride.
 * Boksen viser dommens tekster ordret (lib/rimelighed) og ejer intet andet:
 * bekræftelsen bor hos forælderen, som gater commit/gem på den.
 *
 * Teksterne (til Jonas' godkendelse — udkastets README):
 *   overskrift  «Tal der ikke kan passe?»
 *   intro       «Kontrollen fandt tal der sjældent er rigtige. Tjek dem mod din rapport, før du godkender.»
 *   bekræftelse «Ja, tallene er rigtige — godkend alligevel»
 */
export const BEKRAEFTELSE_MANGLER = "Bekræft først at tallene er rigtige — sæt kryds ved «Ja, tallene er rigtige — godkend alligevel».";

/** Rapporttypen (dansk, fra financial_reports.report_type) → dommens statementType. */
export function statementTypeFraRapporttype(reportType: string | null | undefined): string {
  const rt = (reportType ?? "").toLowerCase();
  if (rt.includes("saldobalance") || rt.includes("saldo")) return "trial_balance";
  if (rt.includes("balance")) return "balance";
  return "pnl";
}

/** Advarslerne for det medlemmet har tastet (danske feltnøgler → canonical). Tomme felter tæller ikke. */
export function advarslerFraInputs(metricInputs: Record<string, string>, reportType: string | null | undefined): RimelighedAdvarsel[] {
  const m: Record<string, number | null> = {};
  for (const f of ALL_FIELDS) {
    const parsed = parseMetricValue(metricInputs[f] ?? "");
    const canonical = DANISH_TO_CANONICAL[f];
    if (canonical && typeof parsed === "number") m[canonical] = parsed;
  }
  return rimelighedAdvarsler(m, statementTypeFraRapporttype(reportType));
}

/** Advarslerne for et preview (canonical nøgler, som get_report_commit_preview afleverer dem). */
export function advarslerFraPreview(metrics: Record<string, number> | null | undefined, reportType: string | null | undefined): RimelighedAdvarsel[] {
  if (!metrics) return [];
  return rimelighedAdvarsler(metrics, statementTypeFraRapporttype(reportType));
}

const RimelighedBoks = ({ advarsler, bekraeftet, onBekraeft }: { advarsler: RimelighedAdvarsel[]; bekraeftet: boolean; onBekraeft: (v: boolean) => void }) => {
  if (advarsler.length === 0) return null;
  return (
    <div className="rounded-lg border border-hb-rust/40 bg-hb-rust/5 p-3" data-rimelighed={advarsler.length}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-hb-rust" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-hb-rust">{ADVARSEL_OVERSKRIFT}</p>
          <p className="mt-0.5 text-xs text-hb-ink-soft">{ADVARSEL_INTRO}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-hb-ink">
            {advarsler.map((a) => (
              <li key={a.name} data-rimelighed-advarsel={a.name}>{a.tekst}</li>
            ))}
          </ul>
        </div>
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-hb-ink">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--hb-evergreen))]" checked={bekraeftet} onChange={(e) => onBekraeft(e.target.checked)} data-rimelighed-bekraeft />
        <span>{BEKRAEFT_TEKST}</span>
      </label>
    </div>
  );
};

export default RimelighedBoks;
