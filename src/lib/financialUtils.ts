import type { Json } from "@/integrations/supabase/types";
import { DANSK, omkostningerIAlt, omkostningsparKanoniskTilDansk } from "@/lib/omkostningsnoegler";

// ── Danish month names ──
export const DANISH_MONTHS = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

export const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

/** Lowercase Danish month name → 0-based index lookup */
export const DANISH_MONTHS_INDEX: Record<string, number> = {
  januar: 0, februar: 1, marts: 2, april: 3, maj: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, december: 11,
};

// ── Report period parsing ──
export function parseReportPeriodToKey(period: string | null): string | null {
  if (!period) return null;
  for (let i = 0; i < DANISH_MONTHS.length; i++) {
    if (period.toLowerCase().includes(DANISH_MONTHS[i].toLowerCase())) {
      const yearMatch = period.match(/\d{4}/);
      if (yearMatch) return `${yearMatch[0]}-${String(i + 1).padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * En måned er kun rapporterbar når den er HELT afsluttet — dvs. periode-key'en
 * ligger STRENGT før indeværende måned. Spejler server-RPC'en
 * resolve_report_commit_candidate (period_key >= to_char(now(),'YYYY-MM') blokeres).
 *
 * "YYYY-MM" sorterer leksikografisk = kronologisk, så streng-sammenligning er nok
 * og har ingen årsskifte-bug. `now` er valgfri for testbarhed.
 */
export function isCompletedMonth(periodKey: string, now: Date = new Date()): boolean {
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return periodKey < currentKey;
}

// ── Key figures extraction ──
export interface ReportData {
  report_type?: string;
  id: string;
  report_period: string | null;
  extracted_data: Json | null;
  normalized_data?: Json | null;
  status: string;
  // Manual override fields
  manual_report_period_label?: string | null;
  manual_report_period_key?: string | null;
  manual_report_type?: string | null;
  manual_normalized_data?: Json | null;
  manual_override_note?: string | null;
  manual_override_by?: string | null;
  manual_override_at?: string | null;
  manual_override_source?: string | null;
  manual_override_status?: string | null;
}

export function getKeyFigures(report: ReportData): Record<string, number> | null {
  // GUARDRAIL: warn if canonical data exists
  if ((report as any).normalized_data?.metrics) {
    console.warn('[canonical-first] getKeyFigures() called but normalized_data.metrics exists. Use getCanonicalOrLegacyMetrics() instead.');
  }
  if (!report.extracted_data || typeof report.extracted_data !== "object" || Array.isArray(report.extracted_data)) return null;
  return (report.extracted_data as Record<string, Json | undefined>).key_figures as Record<string, number> | null;
}

// ── Canonical-first metrics helper ──
export interface ReportMetricsResult {
  source: "canonical" | "legacy" | "manual";
  metrics: Record<string, number | null>;
}

/** De danske omkostningsnøgler, som de håndskrevne lister i getCanonicalOrLegacyMetrics/getEffectiveMetrics
    NÆVNER. Låst mod begge grene af danskeFladerTreNoegler.guard (selvbevis): en linje tilføjet eller fjernet
    i én af grenene uden at ændre sættet fælder værnet. */
export const NAEVNTE_DANSKE: ReadonlySet<string> = new Set([
  "direkte_omkostninger", "loenninger", "salgsomkostninger", "lokaleomkostninger",
  "administrationsomkostninger", "oevrige_omkostninger", "andre_driftsindtaegter", "afskrivninger",
]);
/** De danske omkostningsnøgler (omkostningsnoegler.omkostningsparKanoniskTilDansk), som listerne IKKE nævner
    — pension/sociale, øvrige personale og autodrift (3/10-2026). De tæller i totalen (calcTotalExpenses), men
    har ingen egen linje nogen steder (åbent punkt, OVERLEVERING DEL 2 «3. oktober»). */
export const KUN_I_TOTALEN: ReadonlySet<string> = new Set(
  Object.values(omkostningsparKanoniskTilDansk()).filter((da) => !NAEVNTE_DANSKE.has(da)),
);

/** Lægger KUN_I_TOTALEN-nøglerne til en grens svar, så ingen kanonisk omkostningsnøgle tabes her.
    `laes` får det kanoniske og det danske navn og vælger selv (kanonisk gren: m[en]; manuel gren: mnd.metrics[da]). */
function manglendeOmkostninger(laes: (en: string, da: string) => unknown): Record<string, number | null> {
  const ud: Record<string, number | null> = {};
  for (const [en, da] of Object.entries(omkostningsparKanoniskTilDansk())) {
    if (!KUN_I_TOTALEN.has(da)) continue;
    const v = laes(en, da);
    ud[da] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return ud;
}

export function getCanonicalOrLegacyMetrics(report: ReportData): ReportMetricsResult | null {
  const norm = report.normalized_data as Record<string, any> | null;
  if (norm?.metrics) {
    const m = norm.metrics;
    return {
      source: "canonical",
      metrics: {
        omsaetning: m.revenue ?? null,
        daekningsbidrag: m.gross_profit ?? null,
        loenninger: m.payroll ?? null,
        direkte_omkostninger: m.cogs ?? null,
        salgsomkostninger: m.sales_costs ?? null,
        lokaleomkostninger: m.facility_costs ?? null,
        administrationsomkostninger: m.admin_costs ?? null,
        oevrige_omkostninger: m.other_costs ?? null,
        andre_driftsindtaegter: m.other_operating_income ?? null,
        afskrivninger: m.depreciation ?? null,
        resultat_foer_skat: m.ebt ?? null,
        resultat_efter_skat: m.net_result ?? null,
        aktiver_i_alt: m.assets_total ?? null,
        egenkapital: m.equity_total ?? null,
        bank_balance: m.cash ?? null,        // sign preserved, no flip
        debitorer: m.trade_receivables ?? null,
        kreditorer: m.current_liabilities ?? null,
        // De omkostningsnøgler listen ovenfor ikke nævner (3/10-2026: pension/sociale, øvrige personale,
        // autodrift) — afledt af omkostningsnoegler.ts og lagt SIDST, så rækkefølgen ovenfor er uændret.
        ...manglendeOmkostninger((en) => m[en]),
      },
    };
  }
  // Legacy fallback
  const kf = getKeyFigures(report);
  if (kf) return { source: "legacy", metrics: kf };
  return null;
}

// ── Manual override helpers ──

/** Check if a report has an applied manual override */
export function hasManualOverride(report: ReportData): boolean {
  return report.manual_override_status === "applied";
}

/** Check if a report has a draft manual override */
export function hasManualDraft(report: ReportData): boolean {
  return report.manual_override_status === "draft";
}

/** Get effective report period label (manual override takes priority when applied) */
export function getEffectiveReportPeriod(report: ReportData): string | null {
  if (hasManualOverride(report) && report.manual_report_period_label) {
    return report.manual_report_period_label;
  }
  return report.report_period;
}

/** Get effective report period key in YYYY-MM format */
export function getEffectiveReportPeriodKey(report: ReportData): string | null {
  if (hasManualOverride(report) && report.manual_report_period_key) {
    return report.manual_report_period_key;
  }
  return parseReportPeriodToKey(report.report_period);
}

/** Get effective metrics — manual_normalized_data is the sole manual metrics source */
export function getEffectiveMetrics(report: ReportData): ReportMetricsResult | null {
  if (hasManualOverride(report) && report.manual_normalized_data) {
    const mnd = report.manual_normalized_data as Record<string, any>;
    if (mnd.metrics) {
      return {
        source: "manual",
        metrics: {
          omsaetning: mnd.metrics.omsaetning ?? null,
          daekningsbidrag: mnd.metrics.daekningsbidrag ?? null,
          loenninger: mnd.metrics.loenninger ?? null,
          direkte_omkostninger: mnd.metrics.direkte_omkostninger ?? null,
          salgsomkostninger: mnd.metrics.salgsomkostninger ?? null,
          lokaleomkostninger: mnd.metrics.lokaleomkostninger ?? null,
          administrationsomkostninger: mnd.metrics.administrationsomkostninger ?? null,
          oevrige_omkostninger: mnd.metrics.oevrige_omkostninger ?? null,
          andre_driftsindtaegter: mnd.metrics.andre_driftsindtaegter ?? null,
          afskrivninger: mnd.metrics.afskrivninger ?? null,
          resultat_foer_skat: mnd.metrics.resultat_foer_skat ?? null,
          resultat_efter_skat: mnd.metrics.resultat_efter_skat ?? null,
          aktiver_i_alt: mnd.metrics.aktiver_i_alt ?? null,
          egenkapital: mnd.metrics.egenkapital ?? null,
          bank_balance: mnd.metrics.bank_balance ?? null,
          debitorer: mnd.metrics.debitorer ?? null,
          kreditorer: mnd.metrics.kreditorer ?? null,
          ...manglendeOmkostninger((_en, da) => mnd.metrics[da]),
        },
      };
    }
  }
  // Fallback to canonical/legacy
  return getCanonicalOrLegacyMetrics(report);
}

/** Rapportkortets tal (RapporteringView): højst seks talværdier i hjælperens rækkefølge — UDEN KUN_I_TOTALEN.
    Kortet har ingen etiketmapning (det viser nøglenavnet), og før 3/10-2026 kom de tre nøgler aldrig med; de må
    ikke skubbe et af de seks tal ud på en tynd række. */
export const RAPPORTKORT_ANTAL = 6;
export function rapportkortTal(keyFigures: Record<string, number | null | undefined>): [string, number][] {
  return Object.entries(keyFigures)
    .filter((e): e is [string, number] => typeof e[1] === "number" && !KUN_I_TOTALEN.has(e[0]))
    .slice(0, RAPPORTKORT_ANTAL);
}

/** Get effective key figures (legacy compat — uses effective metrics) */
export function getEffectiveKeyFigures(report: ReportData): Record<string, number> | null {
  const result = getEffectiveMetrics(report);
  if (!result) return null;
  // Filter out null values for legacy compat
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(result.metrics)) {
    if (v != null) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ── Select fields for queries that need manual override data ──
export const REPORT_OVERRIDE_SELECT = "manual_report_period_label, manual_report_period_key, manual_report_type, manual_normalized_data, manual_override_status, manual_override_note, manual_override_by, manual_override_at, manual_override_source";

// ── Shared metric helpers (canonical expense model) ──

/** Canonical total expenses — the single shared definition across all surfaces.
 *  Σ|alle omkostningsnøgler| fra omkostningsnoegler.DANSK (17/9-2026: nu også øvrige
 *  omkostninger; andre driftsindtægter er en indtægt og trækkes ikke fra her). */
export function calcTotalExpenses(kf: Record<string, number | null>): number {
  return omkostningerIAlt(kf, DANSK);
}

/** DB margin (dækningsgrad) — gross profit as % of revenue */
export function calcDbMargin(kf: Record<string, number | null>): number | null {
  const rev = kf.omsaetning;
  const db = kf.daekningsbidrag;
  if (rev == null || db == null || rev === 0) return null;
  return (db / rev) * 100;
}

/** Result margin — resultat_foer_skat as % of revenue.
 *  NOTE: This is NOT EBITDA margin (it includes financial costs etc.). */
export function calcResultMargin(kf: Record<string, number | null>): number | null {
  const rev = kf.omsaetning;
  const result = kf.resultat_foer_skat;
  if (rev == null || result == null || rev === 0) return null;
  return (result / rev) * 100;
}

// ── DKK formatting ──
export const formatDKK = (n?: number | null) =>
  n != null
    ? `${n.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.`
    : "—";

export const formatDKKFull = (n: number) =>
  n.toLocaleString("da-DK", { maximumFractionDigits: 0 }) + " DKK";

export const formatCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
};

// ── Percentage change ──
export function pctChange(curr: number | undefined | null, prev: number | undefined | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

// ── Status config (shared between Reports, MemberDetail, DeliveryOverview) ──
export const reportStatusConfig: Record<string, { label: string; className: string; bg: string }> = {
  processed: { label: "Behandlet", className: "text-primary", bg: "bg-primary/10" },
  processing: { label: "Behandles", className: "text-chart-warning", bg: "bg-chart-warning/10" },
  error: { label: "Fejl", className: "text-destructive", bg: "bg-destructive/10" },
};
