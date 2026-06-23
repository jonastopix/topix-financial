/**
 * Shared override helpers for ReportManualOverride and ReportReviewDialog.
 *
 * Single source of truth for:
 * - field definitions, labels, report types
 * - metric parsing & validation
 * - EN ↔ DA canonical key mapping
 * - persistence (saveManualOverride)
 */

import { supabase } from "@/integrations/supabase/client";
import { DANISH_MONTHS, type ReportData, hasManualOverride, getEffectiveMetrics, getEffectiveReportPeriodKey, isCompletedMonth } from "@/lib/financialUtils";

// ── Report types ──
export const REPORT_TYPES = [
  { value: "resultatopgørelse", label: "Resultatopgørelse" },
  { value: "saldobalance", label: "Saldobalance" },
  { value: "andet", label: "Andet" },
];

// ── Field definitions ──
export const PNL_FIELDS = [
  "omsaetning",
  "direkte_omkostninger",
  "daekningsbidrag",
  "loenninger",
  "salgsomkostninger",
  "lokaleomkostninger",
  "administrationsomkostninger",
  "afskrivninger",
  "ebitda",
  "resultat_foer_skat",
  "resultat_efter_skat",
];
export const BALANCE_FIELDS = [
  "bank_balance",
  "debitorer",
  "kreditorer",
  "egenkapital",
  "aktiver_i_alt",
  "gaeld_i_alt",
];
export const ALL_FIELDS = [...PNL_FIELDS, ...BALANCE_FIELDS];

export const FIELD_LABELS: Record<string, string> = {
  omsaetning: "Omsætning",
  direkte_omkostninger: "Direkte omkostninger",
  daekningsbidrag: "Dækningsbidrag",
  loenninger: "Lønomkostninger",
  salgsomkostninger: "Salgsomkostninger",
  lokaleomkostninger: "Lokaleomkostninger",
  administrationsomkostninger: "Administrationsomkostninger",
  afskrivninger: "Afskrivninger",
  ebitda: "EBITDA / Driftsresultat",
  resultat_foer_skat: "Resultat f. skat",
  resultat_efter_skat: "Resultat efter skat",
  bank_balance: "Bank / Likvider",
  debitorer: "Debitorer",
  kreditorer: "Kortfristet gæld",
  egenkapital: "Egenkapital",
  aktiver_i_alt: "Aktiver i alt",
  gaeld_i_alt: "Gæld i alt",
};

// ── Field descriptions (vist som tooltip ved hvert felt) ──
export const FIELD_DESCRIPTIONS: Record<string, string> = {
  omsaetning: "Virksomhedens samlede salg i perioden, før omkostninger. Indgår i beregningen af din dækningsgrad og resultatgrad.",
  direkte_omkostninger: "Vareforbrug og andre omkostninger direkte knyttet til salget (COGS).",
  daekningsbidrag: "Omsætning minus direkte omkostninger. Indgår i beregningen af din dækningsgrad.",
  loenninger: "Personaleomkostninger i perioden, inkl. løn, pension og feriepenge.",
  salgsomkostninger: "Omkostninger til salg og markedsføring, fx annoncering og provision.",
  lokaleomkostninger: "Husleje, el, varme og andre omkostninger til virksomhedens lokaler.",
  administrationsomkostninger: "Generelle driftsomkostninger som ikke hører under de øvrige, fx kontor, IT og revisor.",
  afskrivninger: "Periodens værdiforringelse på aktiver som maskiner, inventar og biler.",
  ebitda: "Resultat før renter, skat og afskrivninger. Et mål for den løbende drifts indtjening.",
  resultat_foer_skat: "Periodens resultat efter alle omkostninger og renter, men før skat. Indgår i beregningen af din resultatgrad.",
  resultat_efter_skat: "Periodens endelige resultat efter skat (bundlinjen).",
  bank_balance: "Virksomhedens likvide beholdning på bankkonti på opgørelsestidspunktet.",
  debitorer: "Tilgodehavender fra kunder, altså penge du har faktureret men endnu ikke modtaget. Indgår i vurderingen af din arbejdskapital.",
  kreditorer: "Den gæld der forfalder inden for et år, som den står i dit regnskab. Bruges som kontekst i AI-analysen.",
  egenkapital: "Virksomhedens værdi efter al gæld er trukket fra. Bruges til at beregne din soliditetsgrad, et af de mest værdifulde balancetal at udfylde.",
  aktiver_i_alt: "Den samlede værdi af alt virksomheden ejer. Bruges sammen med egenkapital til at beregne din soliditetsgrad.",
  gaeld_i_alt: "Virksomhedens samlede gæld, kort- og langfristet. Bruges som kontekst i AI-analysen.",
};

// ── EN ↔ DA canonical key mapping ──
// Authoritative mapping used by both review dialog and manual override.

/** Canonical EN → Danish override key */
export const CANONICAL_TO_DANISH: Record<string, string> = {
  revenue: "omsaetning",
  gross_profit: "daekningsbidrag",
  payroll: "loenninger",
  ebitda: "ebitda",
  ebt: "resultat_foer_skat",
  net_result: "resultat_efter_skat",
  assets_total: "aktiver_i_alt",
  equity_total: "egenkapital",
  cash: "bank_balance",
  trade_receivables: "debitorer",
  current_liabilities: "kreditorer",
  debt_total: "gaeld_i_alt",
  cogs: "direkte_omkostninger",
  sales_costs: "salgsomkostninger",
  facility_costs: "lokaleomkostninger",
  admin_costs: "administrationsomkostninger",
  depreciation: "afskrivninger",
};

/** Danish override key → Canonical EN key (reverse of above) */
export const DANISH_TO_CANONICAL: Record<string, string> = Object.fromEntries(
  Object.entries(CANONICAL_TO_DANISH).map(([en, da]) => [da, en])
);

/**
 * Convert canonical EN metrics preview to DA-key Record for override form inputs.
 * Null/undefined values become empty strings (for form inputs).
 */
export function canonicalPreviewToDanishInputs(
  metricsPreview: Record<string, number> | null | undefined
): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const f of ALL_FIELDS) {
    inputs[f] = "";
  }
  if (!metricsPreview) return inputs;
  for (const [enKey, value] of Object.entries(metricsPreview)) {
    const daKey = CANONICAL_TO_DANISH[enKey];
    if (daKey && ALL_FIELDS.includes(daKey) && value != null) {
      inputs[daKey] = String(value);
    }
  }
  return inputs;
}

// ── Parsing ──

/** Parse a metric input: empty/blank → null, number → number, invalid → undefined (error) */
export function parseMetricValue(raw: string): number | null | undefined {
  let s = raw.trim();
  if (s === "") return null;

  // Normaliser typografiske minustegn (unicode-minus, en-dash, em-dash) til ASCII
  s = s.replace(/[\u2212\u2013\u2014]/g, "-");

  // Regnskaber skriver negative tal i parentes: (2.500.000)
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  // Fjern whitespace (alm., NBSP, thin space) brugt som tusindtalsseparator
  s = s.replace(/[\s\u00A0\u202F]/g, "");

  // Dansk format: punktum = tusind, komma = decimal
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  if (cleaned === "") return undefined;   // forhindrer Number("")=0 ved fx "()"
  const num = Number(cleaned);
  if (isNaN(num)) return undefined;
  return negative ? -num : num;
}

/** Parse a period key string to month/year */
export function parseMonth(key: string | null): { month: number; year: number } {
  if (!key) return { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
  const [y, m] = key.split("-").map(Number);
  return { month: m || 1, year: y || new Date().getFullYear() };
}

// ── Validation ──

export interface ValidateForApplyParams {
  month: number;
  year: number;
  reportType: string;
  metricInputs: Record<string, string>;
  report: ReportData;
}

/**
 * Validate for "Gem og anvend" / "Gem rettelser".
 * Returns error string or null if valid.
 */
export function validateForApply(params: ValidateForApplyParams): string | null {
  const { month, year, reportType, metricInputs, report } = params;
  const isApplied = hasManualOverride(report);
  const existingMetrics = getEffectiveMetrics(report)?.metrics ?? {};
  const existingPeriodKey = getEffectiveReportPeriodKey(report);

  if (month < 1 || month > 12) return "Ugyldig måned";
  if (year < 2000 || year > 2100) return "Ugyldigt årstal";

  // Block current month and future months — a month is only reportable once it's complete
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  if (!isCompletedMonth(periodKey)) {
    const monthNames = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];
    return `${monthNames[month - 1]} ${year} er ikke afsluttet endnu — du kan kun rapportere for afsluttede måneder`;
  }

  const periodChanged = (() => {
    const newKey = `${year}-${String(month).padStart(2, "0")}`;
    return existingPeriodKey !== newKey;
  })();

  const hasMetricOverride = ALL_FIELDS.some(f => {
    const parsed = parseMetricValue(metricInputs[f] ?? "");
    if (parsed === undefined) return false;
    const origVal = existingMetrics[f] ?? null;
    return parsed !== origVal;
  });

  const typeChanged = reportType !== (report.report_type || "andet");

  if (!isApplied && !periodChanged && !hasMetricOverride && !typeChanged) {
    return "Mindst én ændring (periode, type eller nøgletal) kræves for at anvende";
  }

  if (isApplied) {
    const manualMetrics = (report.manual_normalized_data as any)?.metrics ?? {};
    const manualPeriodChanged = report.manual_report_period_key !== `${year}-${String(month).padStart(2, "0")}`;
    const manualTypeChanged = report.manual_report_type !== reportType;
    const manualMetricChanged = ALL_FIELDS.some(f => {
      const parsed = parseMetricValue(metricInputs[f] ?? "");
      if (parsed === undefined) return false;
      return parsed !== (manualMetrics[f] ?? null);
    });
    const noteChanged = false; // Note validation handled separately if needed

    if (!manualPeriodChanged && !manualTypeChanged && !manualMetricChanged && !noteChanged) {
      return "Ingen ændringer at gemme";
    }
  }

  for (const f of ALL_FIELDS) {
    const parsed = parseMetricValue(metricInputs[f] ?? "");
    if (parsed === undefined) return `"${FIELD_LABELS[f]}" er ikke et gyldigt tal`;
  }

  return null;
}

// ── Override source ──
export function getOverrideSource(isAdmin: boolean, isAdvisor: boolean): string {
  if (isAdmin) return "admin";
  if (isAdvisor) return "advisor";
  return "member";
}

// ── Persistence ──

export interface SaveManualOverrideParams {
  reportId: string;
  userId: string;
  metricInputs: Record<string, string>;
  month: number;
  year: number;
  reportType: string;
  note: string;
  overrideSource: string;
  status: "draft" | "applied";
}

export async function saveManualOverride(params: SaveManualOverrideParams): Promise<void> {
  const { reportId, userId, metricInputs, month, year, reportType, note, overrideSource, status } = params;

  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  const periodLabel = `${DANISH_MONTHS[month - 1]} ${year}`;

  const metricsObj: Record<string, number | null> = {};
  for (const f of ALL_FIELDS) {
    const parsed = parseMetricValue(metricInputs[f] ?? "");
    metricsObj[f] = parsed === undefined ? null : parsed;
  }

  const manualNormalizedData = {
    metrics: metricsObj,
    override_source: "manual_correction",
  };

  const { error } = await (supabase
    .from("financial_reports")
    .update({
      manual_report_period_label: periodLabel,
      manual_report_period_key: periodKey,
      manual_report_type: reportType,
      manual_normalized_data: manualNormalizedData,
      manual_override_note: note.trim() || null,
      manual_override_by: userId,
      manual_override_at: new Date().toISOString(),
      manual_override_source: overrideSource,
      manual_override_status: status,
      // Promote error-status reports to processed so commit becomes possible
      ...(status === "applied" ? { status: "processed" } : {}),
    } as any)
    .eq("id", reportId) as any);

  if (error) throw error;
}

export async function resetManualOverride(params: {
  reportId: string;
  userId: string;
  overrideSource: string;
}): Promise<void> {
  const { reportId, userId, overrideSource } = params;

  const { error } = await (supabase
    .from("financial_reports")
    .update({
      manual_report_period_label: null,
      manual_report_period_key: null,
      manual_report_type: null,
      manual_normalized_data: null,
      manual_override_note: null,
      manual_override_by: userId,
      manual_override_at: new Date().toISOString(),
      manual_override_source: overrideSource,
      manual_override_status: null,
    } as any)
    .eq("id", reportId) as any);

  if (error) throw error;
}
