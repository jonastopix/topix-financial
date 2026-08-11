/**
 * Ugens fokus: dommen om hvilke KPI-mål der er ude af kurs.
 *
 * Udskilt som ren funktion fordi generate-weekly-focus er 618 linjer
 * uden en eneste test, og fordi den skriver ugentlige AI-analyser til
 * alle medlemmer.
 *
 * KRITISK: en KPI skal vurderes mod DET TAL MEDLEMMET SER. Derfor
 * UDLEDES værdien her på samme måde som VALUE_EXTRACTORS i
 * src/lib/kpiDefs.ts — ikke ved opslag på en procentnøgle.
 *
 * Frem til 11-08-2026 slog kortlægningen op på nøgler der enten var
 * forkerte eller ikke fandtes. Målt i produktion, 266 committede
 * perioder:
 *   resultat      → net_result   (mangler i 178 perioder; medlemmet
 *                                 sætter målet mod ebt, som findes i
 *                                 266 af 266)
 *   db_margin     → gross_margin_pct   (0 perioder — nøglen skrives
 *                                 aldrig til facts)
 *   ebitda_margin → ebitda_margin_pct  (0 perioder — nøglen findes
 *                                 ikke i repoet overhovedet)
 * Tre af fem mål blev altså stille sprunget over ved hver kørsel.
 *
 * NAVNENE ER ARVEGODS: KPI-nøglen "ebitda_margin" viser i UI'et
 * "Resultat Margin" = resultat før skat i % af omsætning
 * (calcResultMargin, som eksplicit IKKE er EBITDA-margin, jf.
 * financialUtils.ts:203-204). Nøglen er bevaret, fordi den står i
 * kpi_targets, men udlederen følger UI'et.
 */
export type MetricBag = Record<string, number | null | undefined>;

const num = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Udledere pr. KPI-nøgle. Spejler VALUE_EXTRACTORS i kpiDefs.ts.
 * Returnerer null når grundlaget mangler — et mål kan ikke vurderes
 * uden sit tal.
 */
export const KPI_EXTRACTORS: Record<string, (m: MetricBag) => number | null> = {
  omsaetning: (m) => num(m.revenue),

  loenninger: (m) => {
    const v = num(m.payroll);
    return v === null ? null : Math.abs(v);
  },

  // Dækningsgrad: dækningsbidrag i % af omsætning (calcDbMargin)
  db_margin: (m) => {
    const rev = num(m.revenue);
    const gp = num(m.gross_profit);
    if (rev === null || gp === null || rev === 0) return null;
    return (gp / rev) * 100;
  },

  // UI: "Resultat" = resultat før skat (kpiDefs.ts:57)
  resultat: (m) => num(m.ebt),

  // UI: "Resultat Margin" = resultat før skat i % af omsætning
  // (calcResultMargin). Nøglenavnet ebitda_margin er arvegods.
  ebitda_margin: (m) => {
    const rev = num(m.revenue);
    const ebt = num(m.ebt);
    if (rev === null || ebt === null || rev === 0) return null;
    return (ebt / rev) * 100;
  },

  // UI: "Omk. total" = summen af omkostningsnøglerne i absolut værdi
  // (calcTotalExpenses, financialUtils.ts:186-193). Fortegn varierer
  // mellem kilder, derfor Math.abs pr. led. Kun positiv sum tæller —
  // nul betyder at ingen omkostninger blev læst, ikke at der ingen var.
  omkostninger: (m) => {
    const dele = [
      m.payroll, m.cogs, m.sales_costs,
      m.facility_costs, m.admin_costs, m.depreciation,
    ];
    let sum = 0;
    let fundet = false;
    for (const d of dele) {
      const v = num(d);
      if (v !== null) { sum += Math.abs(v); fundet = true; }
    }
    if (!fundet || sum <= 0) return null;
    return sum;
  },
};

export interface KpiTarget {
  kpi_key: string;
  target_value: number;
  lower_is_better: boolean;
}

export interface OffTargetKpi {
  kpi_key: string;
  actual: number;
  target: number;
  deviation_pct: number;
}

/**
 * Returnerer de mål der afviger mere end 15% i den forkerte retning.
 * Ukendte kpi_key'er og manglende metrics springes over — et mål kan
 * ikke vurderes uden sit tal.
 */
export function evaluateKpiTargets(
  targets: KpiTarget[],
  metrics: MetricBag,
): OffTargetKpi[] {
  const out: OffTargetKpi[] = [];
  for (const kpi of targets) {
    const extractor = KPI_EXTRACTORS[kpi.kpi_key];
    if (!extractor) continue;
    const actual = extractor(metrics);
    if (actual === null) continue;

    const deviation =
      Math.abs((actual - kpi.target_value) / Math.abs(kpi.target_value || 1)) * 100;
    const offTarget = kpi.lower_is_better
      ? actual > kpi.target_value * 1.15
      : actual < kpi.target_value * 0.85;

    if (offTarget && deviation > 15) {
      out.push({
        kpi_key: kpi.kpi_key,
        actual: Math.round(actual * 10) / 10,
        target: kpi.target_value,
        deviation_pct: Math.round(deviation * 10) / 10,
      });
    }
  }
  return out;
}
