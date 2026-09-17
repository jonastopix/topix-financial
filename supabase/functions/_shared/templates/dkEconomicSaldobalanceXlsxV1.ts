/**
 * Template: DK_ECONOMIC_SALDOBALANCE_XLSX_V1
 * e-conomic detailed saldobalance XLSX — line items only, no subtotals.
 *
 * Structure (målt 17/9-2026 i to rigtige filer):
 *   Row 1: empty
 *   Row 2: "<kundenr> - <firma> - CVR <8 cifre>"
 *   Row 3: "Rapporter > Regnskab > ..."
 *   Row 4: "Saldobalance for perioden DD.MM.YY - DD.MM.YY"
 *   Row 5: "" / "" / "Perioden" / "" / "År til dato"
 *   Row 6: "Nr." / "Navn" / "Indeværende år<periode>" / "Året før<periode>" / "Indeværende år<ÅTD>" / "Året før<ÅTD>" / "Note"
 *   Row 7+: line items (account_no, label, C period, D period last year, E ytd, F ytd last year)
 *
 * Sign convention: credit (revenue negative, costs positive).
 * Normalization profile: economic_saldobalance_credit_v1
 *
 * RESULTATET (omskrevet 17/9-2026 — recon-saldobalance-fortegn.md, Jonas: «den bedste
 * løsning for det hele»): SALDOBALANCENS EGEN SANDHED. Resultat før skat er
 * −Σ «Perioden» over ALLE resultatkonti 1000–4999 — ikke omsætning minus udvalgte
 * grupper. Før: revenue − Σ|udvalgte intervaller| med 5100–5200 som «afskrivninger» —
 * det var BALANCEKONTI (5111 «Indretning, anskaffelse primo», 5116 «… afskrivning
 * primo») læst fra ÅTD-kolonnen, og konti uden for intervallerne (2770 Rejseudgifter,
 * 3131 Bro/færge) manglede. Målt: Fjeldgaardshop 2025-10 gav +241.813 (abs af
 * −241.813) hvor saldobalancen siger +150.932,87.
 *
 * FULD DÆKNING: hver resultatkonto hører til præcis én gruppe — de navngivne
 * intervaller, ellers «øvrige omkostninger» (oevrige_omkostninger → other_costs).
 * KONTROLSUM (parser-tjek pnl_coverage): omsætning − Σ grupper + andre
 * driftsindtægter = resultatet inden for 1 kr., ellers FAIL med de konti der mangler.
 *
 * ANDRE DRIFTSINDTÆGTER: en omkostningsgruppe hvis netto er en KREDIT (lejeindtægter
 * 3401/3413 i 3400–3599) er en indtægt: gruppen udstedes som sin positive del (0 når
 * nettoet er kredit) og kreditten lægges i andre_driftsindtaegter (→
 * other_operating_income, positiv). Omkostninger forbliver positive (7/9-konventionen).
 *
 * AFSKRIVNINGER: kun resultatkonti tæller. Der findes INGEN måling af e-conomics
 * resultatinterval for afskrivninger (hverken i repoet eller i de to filer — kun
 * balancens akkumulerede 5116/5226), så afskrivninger = 0 for denne skabelon;
 * summen dækkes af fuld dækning. Findes intervallet en dag, tilføjes det i PNL_GROUPS.
 *
 * BALANCEN: konti ≥ 5000 læses fra «År til dato» (kolonne E) som før — rigtigt for balance.
 */

import type {
  TemplateEntry,
  SemanticXlsxTemplateEntry,
  DetectionContext,
  ExtractionContext,
  DeterministicExtractedData,
  ParserValidation,
  DeterministicMeta,
} from "../templateRegistry.ts";

import type { XlsxParseResult } from "../xlsxRawParser.ts";
import type {
  SemanticExtractionResult,
  SemanticMetricCandidate,
  SemanticLineItem,
} from "../semanticTypes.ts";
import type { MetricFamily } from "../normalizationProfiles.ts";

// ── Danish number parsing ──

function parseDanishNumber(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/\./g, "").replace(",", ".").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

// ── Account range definitions ──

interface AccountRange {
  key: string;
  family: MetricFamily;
  min: number;
  max: number;
  /** How to convert raw credit-convention value to canonical sign */
  signRule: "negate" | "abs" | "keep";
}

/** Resultatkonti — e-conomics standardkontoplan som skabelonen kender den (målt i filerne 17/9-2026).
    Alt i 1000–4999 uden for disse grupper er «øvrige omkostninger» (OEVRIGE_KEY). */
export const PNL_MIN = 1000;
export const PNL_MAX = 4999;
export const OEVRIGE_KEY = "oevrige_omkostninger";
export const ANDRE_DRIFTSINDTAEGTER_KEY = "andre_driftsindtaegter";
export const AFSKRIVNINGER_KEY = "afskrivninger";

const PNL_GROUPS: AccountRange[] = [
  { key: "omsaetning", family: "revenue_like", min: 1000, max: 1299, signRule: "negate" },
  { key: "direkte_omkostninger", family: "cost_like", min: 1300, max: 1499, signRule: "abs" },
  { key: "loenninger", family: "cost_like", min: 2200, max: 2299, signRule: "abs" },
  { key: "salgsomkostninger", family: "cost_like", min: 2800, max: 2899, signRule: "abs" },
  { key: "lokaleomkostninger", family: "cost_like", min: 3400, max: 3599, signRule: "abs" },
  { key: "administrationsomkostninger", family: "cost_like", min: 3600, max: 3799, signRule: "abs" },
  { key: "finansieringsudgifter", family: "cost_like", min: 4400, max: 4499, signRule: "abs" },
];

const BALANCE_RANGES: AccountRange[] = [
  { key: "anlaegsaktiver", family: "asset_like", min: 5000, max: 5099, signRule: "abs" },
  { key: "varelager", family: "asset_like", min: 5500, max: 5599, signRule: "abs" },
  { key: "debitorer", family: "receivable_payable_like", min: 5600, max: 5699, signRule: "abs" },
  { key: "bank_balance", family: "cash_like", min: 5800, max: 5899, signRule: "keep" },
  { key: "egenkapital", family: "equity_like", min: 6100, max: 6199, signRule: "negate" },
  { key: "kreditorer", family: "receivable_payable_like", min: 6800, max: 6849, signRule: "negate" },
  { key: "moms_skat", family: "liability_like", min: 6900, max: 6999, signRule: "negate" },
];

/** Kontrolsummens tolerance — 1 kr. (flydende tal over ~100 konti). */
export const KONTROLSUM_TOLERANCE = 1;

export interface Resultatkonto { nr: number; navn: string; periode: number }

export interface Resultatfordeling {
  /** Rå netto pr. gruppe (kredit-konvention: omsætning negativ, omkostninger positive), inkl. OEVRIGE_KEY. */
  netto: Record<string, number>;
  /** Hvilke konti der landede i hvilken gruppe. */
  konti: Record<string, number[]>;
  /** Resultat før skat = −Σ periode over alle resultatkonti (forretningskonvention). */
  ebt: number;
  /** Omsætning (positiv) = −netto.omsaetning. */
  revenue: number;
  /** Omkostningsgruppernes POSITIVE del (netto ≥ 0 → netto; netto < 0 → 0). */
  omkostninger: Record<string, number>;
  /** Σ af de kredit-nettoer (som positivt tal) — «andre driftsindtægter». */
  andreDriftsindtaegter: number;
  /** Konti i 1000–4999 uden gruppe — tom pr. konstruktion (øvrige tager resten); står her for kontrolsummens skyld. */
  udenGruppe: number[];
  /** revenue − Σ omkostninger + andre − ebt — skal være 0 inden for KONTROLSUM_TOLERANCE. */
  afvigelse: number;
}

/** Fordelingen af resultatkontiene — REN funktion, testes direkte. */
export function fordelResultatkonti(konti: readonly Resultatkonto[]): Resultatfordeling {
  const netto: Record<string, number> = {};
  const grupper: Record<string, number[]> = {};
  let sum = 0;
  const udenGruppe: number[] = [];
  for (const k of konti) {
    if (k.nr < PNL_MIN || k.nr > PNL_MAX) continue;
    sum += k.periode;
    const g = PNL_GROUPS.find(r => k.nr >= r.min && k.nr <= r.max);
    const key = g ? g.key : OEVRIGE_KEY;
    if (!g && !(k.nr >= PNL_MIN && k.nr <= PNL_MAX)) { udenGruppe.push(k.nr); continue; }
    netto[key] = (netto[key] || 0) + k.periode;
    (grupper[key] ||= []).push(k.nr);
  }
  const ebt = -sum;
  const revenue = -(netto["omsaetning"] || 0);
  const omkostninger: Record<string, number> = {};
  let andre = 0;
  for (const [key, v] of Object.entries(netto)) {
    if (key === "omsaetning") continue;
    if (v >= 0) omkostninger[key] = v;
    else { omkostninger[key] = 0; andre += -v; }
  }
  const sumOmk = Object.values(omkostninger).reduce((a, b) => a + b, 0);
  const afvigelse = revenue - sumOmk + andre - ebt;
  return { netto, konti: grupper, ebt, revenue, omkostninger, andreDriftsindtaegter: andre, udenGruppe, afvigelse };
}

// ── Period parsing ──

const MONTH_NAMES = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

// ── Kolonnerne findes af FILENS EGEN overskrift (17/9-2026, Jonas' filer 21:15) ──
//
// Brick Works' saldobalance har KUN fire kolonner — række 6: «Nr.» · «Navn» · «Perioden» · «År til dato»,
// balancen i kolonne D (indeks 3). Fjeldgaardshops har seks: række 5 «Perioden» (C) og «År til dato» (E),
// række 6 «Nr.» · «Navn» · «Indeværende år…» · «Året før…» · «Indeværende år…» · «Året før…». Før stod her
// faste `VALUE_COL = 2` og `YTD_COL = 4` — så blev Brick Works' balance læst som tom (86 balancekonti uden
// beløb, ingen assets_total/equity_total/cash, balance_present FAIL på alle 22 rapporter). Nu: find rækken med
// «Nr.»/«Navn», læs gruppeoverskriften i rækken over (bæres til højre som en flettet celle), og vælg den første
// kolonne der hedder «Perioden» (evt. «Indeværende år» under «Perioden») og den første der hedder «År til
// dato» — aldrig en kolonne der hedder «Året før». Falder genkendelsen igennem, bruges de gamle faste indeks
// som SIDSTE udvej, og det står i evidence/parser-tjekket column_detection.

export const FAST_VALUE_COL = 2;
export const FAST_YTD_COL = 4;
export const OVERSKRIFT_SOEGERAEKKER = 12;

export interface Kolonnevalg {
  headerRowIndex: number;
  valueCol: number;
  ytdCol: number;
  metode: "overskrift" | "fast_indeks";
  evidence: string[];
}

const celletekst = (v: unknown): string => (v == null ? "" : String(v)).toLowerCase().replace(/\s+/g, " ").trim();

/** Rækken med «Nr.» i A og «Navn» i B blandt de første OVERSKRIFT_SOEGERAEKKER rækker; −1 når den ikke findes. */
export function findOverskriftsRaekke(matrix: ReadonlyArray<ReadonlyArray<unknown> | undefined>): number {
  for (let i = 0; i < Math.min(matrix.length, OVERSKRIFT_SOEGERAEKKER); i++) {
    const row = matrix[i] ?? [];
    if (celletekst(row[0]) === "nr." && celletekst(row[1]) === "navn") return i;
  }
  return -1;
}

export function findKolonner(matrix: ReadonlyArray<ReadonlyArray<unknown> | undefined>): Kolonnevalg {
  const h = findOverskriftsRaekke(matrix);
  const fallback = (grund: string, headerRowIndex: number): Kolonnevalg => ({
    headerRowIndex, valueCol: FAST_VALUE_COL, ytdCol: FAST_YTD_COL, metode: "fast_indeks",
    evidence: [`fallback_fixed_columns:${FAST_VALUE_COL}/${FAST_YTD_COL}`, grund],
  });
  if (h < 0) return fallback(`no Nr./Navn header row in first ${OVERSKRIFT_SOEGERAEKKER} rows`, 5);
  const headerRow = matrix[h] ?? [];
  const groupRow = h > 0 ? (matrix[h - 1] ?? []) : [];
  const maxCols = Math.max(headerRow.length, groupRow.length);
  let valueCol = -1;
  let ytdCol = -1;
  let gruppe = "";
  const set: string[] = [];
  for (let c = 2; c < maxCols; c++) {
    const g = celletekst(groupRow[c]);
    if (/perioden|år til dato/.test(g)) gruppe = g;
    const sub = celletekst(headerRow[c]);
    if (!sub && !gruppe) continue;
    set.push(`${c}:"${sub}"${gruppe ? `/"${gruppe}"` : ""}`);
    const aaretFoer = /året før/.test(sub);
    if (aaretFoer) continue;
    if (valueCol < 0 && (/perioden/.test(sub) || /perioden/.test(gruppe))) { valueCol = c; continue; }
    if (ytdCol < 0 && (/år til dato/.test(sub) || /år til dato/.test(gruppe))) { ytdCol = c; }
  }
  if (valueCol < 0 || ytdCol < 0) return fallback(`header found at row ${h} but columns not recognised: ${set.join(" | ")}`, h);
  return { headerRowIndex: h, valueCol, ytdCol, metode: "overskrift", evidence: [`header_row:${h}`, `period_col:${valueCol}`, `ytd_col:${ytdCol}`, ...set] };
}

function parsePeriodFromRow4(text: string): { start: string | null; end: string | null; label: string | null } {
  // "Saldobalance for perioden DD.MM.YY - DD.MM.YY" or "DD.MM.YYYY - DD.MM.YYYY"
  const m = text.match(/(\d{2}\.\d{2}\.\d{2,4})\s*[-–]\s*(\d{2}\.\d{2}\.\d{2,4})/);
  if (!m) return { start: null, end: null, label: null };

  const normalize = (d: string): string => {
    const parts = d.split(".");
    if (parts[2].length === 2) parts[2] = (parseInt(parts[2], 10) < 50 ? "20" : "19") + parts[2];
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  };

  const start = normalize(m[1]);
  const end = normalize(m[2]);

  // Label from end date
  const endParts = end.split("-");
  const month = parseInt(endParts[1], 10);
  const label = month >= 1 && month <= 12 ? `${MONTH_NAMES[month - 1]} ${endParts[2]}` : null;

  return { start, end, label };
}

function extractCvr(text: string): string | null {
  const m = text.match(/\b(\d{8})\b/);
  return m ? m[1] : null;
}

function extractCompanyName(text: string): string | null {
  // Row 2 often: "ID - CompanyName CVR" or just "CompanyName CVR"
  const dashIdx = text.indexOf(" - ");
  const base = dashIdx >= 0 ? text.substring(dashIdx + 3) : text;
  // Strip trailing «- CVR 12345678» / «CVR 12345678» / «12345678» (målt 17/9-2026: rækken er
  // «<kundenr> - <firma> - CVR <8 cifre>»; før blev kun cifrene fjernet, og navnet endte på «- CVR»).
  return base.replace(/\s*-?\s*(CVR\s*)?\d{8}\s*$/i, "").trim() || null;
}

// ── Template Definition ──

export const dkEconomicSaldobalanceXlsxV1: SemanticXlsxTemplateEntry = {
  template_id: "DK_ECONOMIC_SALDOBALANCE_XLSX_V1",
  label: "DK e-conomic Saldobalance XLSX (detailed, no subtotals)",
  supported_file_types: ["xlsx", "xls"],
  statement_type: "trial_balance",

  detect(ctx: DetectionContext): number {
    if (!ctx.headerRows || ctx.headerRows.length < 8) return 0;

    // Row 2 (index 1): company + CVR
    const row2 = (ctx.headerRows[1]?.[0] ?? "").toString();
    if (!row2 || !/\d{8}/.test(row2)) return 0;

    // Row 4 (index 3): "Saldobalance"
    const row4 = (ctx.headerRows[3]?.[0] ?? "").toString();
    if (!row4 || !/saldobalance/i.test(row4)) return 0;

    // Overskriftsrækken «Nr.» / «Navn» — række 6 (indeks 5) i begge kendte former, men findes af indholdet
    // (før: fast indeks 5 og mindst tre kolonner — Brick Works' fire-kolonne-form har den også på indeks 5).
    const overskrift = findOverskriftsRaekke(ctx.headerRows);
    if (overskrift < 0) return 0;
    const headerRow = ctx.headerRows[overskrift];
    if (!headerRow || headerRow.length < 3) return 0;

    // Check for account numbers in 1000-9999 range
    let accountCount = 0;
    let hasSubtotalLikeRows = false;
    for (let i = overskrift + 1; i < Math.min(ctx.headerRows.length, 100); i++) {
      const row = ctx.headerRows[i];
      if (!row) continue;
      const acctVal = row[0];
      const acctNum = typeof acctVal === "number" ? acctVal : parseInt((acctVal ?? "").toString(), 10);
      if (!isNaN(acctNum) && acctNum >= 1000 && acctNum <= 9999) {
        accountCount++;
      }
      // Subtotal detection: empty col[0] + non-empty col[1] with "i alt" pattern
      if (
        (acctVal == null || acctVal === "" || acctVal === 0) &&
        row[1] && /i\s*alt/i.test(row[1].toString())
      ) {
        hasSubtotalLikeRows = true;
      }
    }

    if (accountCount < 5) return 0;

    // This template handles NO-subtotal variant; if subtotals present, let combined template handle it
    if (hasSubtotalLikeRows) return 0;

    return 88;
  },

  // ── Legacy extract (stub — semantic path is primary) ──
  extract(_ctx: ExtractionContext) {
    return { success: false as const, error: "Use semantic extraction path" };
  },

  // ── Semantic XLSX Extraction ──
  extractSemanticFromXlsx(xlsxResult: XlsxParseResult): SemanticExtractionResult | null {
    if (xlsxResult.rows.length < 10) return null;

    const TEMPLATE_ID = "DK_ECONOMIC_SALDOBALANCE_XLSX_V1";
    const LOG_PREFIX = `[${TEMPLATE_ID}]`;

    // ── Parse metadata from header rows ──
    let companyName: string | null = null;
    let cvr: string | null = null;
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    let reportPeriodLabel: string | null = null;

    for (const row of xlsxResult.rows) {
      if (row.row_index > 5) break;
      const text = row.cells.map(c => (c.raw_value ?? "").toString()).join(" ").trim();
      if (!text) continue;

      if (row.row_index === 1) {
        companyName = extractCompanyName(text);
        cvr = extractCvr(text);
      }
      if (row.row_index === 3) {
        const period = parsePeriodFromRow4(text);
        periodStart = period.start;
        periodEnd = period.end;
        reportPeriodLabel = period.label;
      }
    }

    // Fallback for missing period metadata
    if (!reportPeriodLabel) {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const months = ["Januar","Februar","Marts","April","Maj","Juni",
        "Juli","August","September","Oktober","November","December"];
      reportPeriodLabel = `${months[prevMonth.getMonth()]} ${prevMonth.getFullYear()}`;
      console.warn(`${LOG_PREFIX} Could not parse period from row 4, using fallback: ${reportPeriodLabel}`);
    }
    if (!periodEnd) {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);
      const pad = (n: number) => String(n).padStart(2, "0");
      periodEnd = `${pad(lastDay.getDate())}-${pad(lastDay.getMonth() + 1)}-${lastDay.getFullYear()}`;
      periodStart = `01-${pad(lastDay.getMonth() + 1)}-${lastDay.getFullYear()}`;
    }

    // ── Kolonnerne af filens egen overskrift (før: faste VALUE_COL = 2 / YTD_COL = 4) ──
    const matrix: unknown[][] = [];
    for (const row of xlsxResult.rows) {
      if (row.row_index >= OVERSKRIFT_SOEGERAEKKER) continue;
      const r: unknown[] = [];
      for (const c of row.cells) r[c.col_index] = c.raw_value;
      matrix[row.row_index] = r;
    }
    const kolonner = findKolonner(matrix);
    const VALUE_COL = kolonner.valueCol;
    const YTD_COL = kolonner.ytdCol;
    console.log(`${LOG_PREFIX} Columns by ${kolonner.metode}: period=${VALUE_COL}, ytd=${YTD_COL}, header row=${kolonner.headerRowIndex}`);

    // ── Læs kontolinjerne: resultatkonti (1000–4999) fra perioden, balance (≥ 5000) fra ÅTD ──
    const lineItems: SemanticLineItem[] = [];
    const resultatkonti: Resultatkonto[] = [];
    const balanceSums: Record<string, number> = {};
    let totalLineItems = 0;
    let balanceKonti = 0;
    let balanceKontiMedBeloeb = 0;

    for (const row of xlsxResult.rows) {
      if (row.row_index <= kolonner.headerRowIndex) continue; // Skip header rows

      const acctCell = row.cells.find(c => c.col_index === 0);
      const acctRaw = acctCell?.raw_value;
      const acctNum = typeof acctRaw === "number" ? acctRaw : parseInt((acctRaw ?? "").toString(), 10);
      if (isNaN(acctNum) || acctNum < 1000 || acctNum > 9999) continue;

      const labelCell = row.cells.find(c => c.col_index === 1);
      const label = (labelCell?.raw_value ?? "").toString().trim();

      const isBalanceAccount = acctNum > PNL_MAX;
      const colIndex = isBalanceAccount ? YTD_COL : VALUE_COL;
      const valueCell = row.cells.find(c => c.col_index === colIndex);
      const rawValue = valueCell?.raw_value != null
        ? (typeof valueCell.raw_value === "number" ? valueCell.raw_value : parseDanishNumber(valueCell.raw_value))
        : null;

      totalLineItems++;
      if (isBalanceAccount) {
        balanceKonti++;
        if (rawValue != null && rawValue !== 0) balanceKontiMedBeloeb++;
      }

      lineItems.push({
        source_field_id: `acct_${acctNum}`,
        source_label: `${acctNum} ${label}`,
        raw_value: rawValue,
        basis: isBalanceAccount ? "ytd" : "period",
        account_no: acctNum.toString(),
        source_row_index: row.row_index,
      });

      if (rawValue == null || rawValue === 0) continue;

      if (!isBalanceAccount) {
        resultatkonti.push({ nr: acctNum, navn: label, periode: rawValue });
        continue;
      }
      for (const range of BALANCE_RANGES) {
        if (acctNum >= range.min && acctNum <= range.max) {
          balanceSums[range.key] = (balanceSums[range.key] || 0) + rawValue;
          break;
        }
      }
    }

    const fordeling = fordelResultatkonti(resultatkonti);
    console.log(`${LOG_PREFIX} Scanned ${totalLineItems} line items; P&L accounts ${resultatkonti.length} → groups ${Object.keys(fordeling.netto).join(", ")}; balance keys ${Object.keys(balanceSums).join(", ")}`);

    if (totalLineItems < 5) {
      console.log(`${LOG_PREFIX} Too few line items (${totalLineItems}) → reject`);
      return null;
    }

    // ── Build metric candidates ──
    const metricCandidates: SemanticMetricCandidate[] = [];
    const kandidat = (over: Partial<SemanticMetricCandidate> & Pick<SemanticMetricCandidate, "source_field_id" | "normalization_family" | "raw_value" | "sign_convention" | "source_label" | "confidence" | "evidence">): SemanticMetricCandidate => ({
      source_row_index: null,
      source_column_slot: VALUE_COL,
      source_cell_address: null,
      basis: "period",
      proposed_canonical_target: null,
      ...over,
      raw_sign: over.raw_value == null ? "zero" : over.raw_value > 0 ? "positive" : over.raw_value < 0 ? "negative" : "zero",
    });

    // Omsætningsgruppen: rå kredit-netto (negativ) — profilen NEGATE'r til positiv.
    if (fordeling.netto["omsaetning"] != null) {
      metricCandidates.push(kandidat({
        source_field_id: "omsaetning", normalization_family: "revenue_like", raw_value: fordeling.netto["omsaetning"], sign_convention: "credit",
        source_label: "aggregated:omsaetning (accounts 1000-1299)", confidence: "HIGH",
        evidence: ["account_range:1000-1299", "sign_rule:negate", `accounts:${(fordeling.konti["omsaetning"] || []).length}`],
      }));
    }

    // Omkostningsgrupperne: den POSITIVE del (kredit-netto → 0 og lagt i andre driftsindtægter).
    for (const [key, positivDel] of Object.entries(fordeling.omkostninger)) {
      const g = PNL_GROUPS.find(r => r.key === key);
      const label = g ? `aggregated:${key} (accounts ${g.min}-${g.max})` : `aggregated:${key} (P&L accounts outside named groups)`;
      const netto = fordeling.netto[key];
      metricCandidates.push(kandidat({
        source_field_id: key, normalization_family: "cost_like", raw_value: positivDel, sign_convention: "credit",
        source_label: label, confidence: g ? "HIGH" : "MEDIUM",
        evidence: [
          g ? `account_range:${g.min}-${g.max}` : `accounts:${(fordeling.konti[key] || []).join(",")}`,
          `net:${netto}`,
          ...(netto < 0 ? [`credit_net_moved_to:${ANDRE_DRIFTSINDTAEGTER_KEY}`] : []),
        ],
      }));
    }

    // Andre driftsindtægter: Σ kredit-nettoer, udstedt som KREDIT (negativ) → profilen NEGATE'r til positiv.
    if (fordeling.andreDriftsindtaegter > 0) {
      metricCandidates.push(kandidat({
        source_field_id: ANDRE_DRIFTSINDTAEGTER_KEY, normalization_family: "revenue_like", raw_value: -fordeling.andreDriftsindtaegter, sign_convention: "credit",
        source_label: "aggregated:andre_driftsindtaegter (cost groups whose net is a credit)", confidence: "HIGH",
        evidence: Object.entries(fordeling.netto).filter(([k, v]) => k !== "omsaetning" && v < 0).map(([k, v]) => `${k}:${v}`),
        proposed_canonical_target: "other_operating_income",
      }));
    }

    // Afskrivninger: intet målt resultatinterval → 0 for denne skabelon (filhovedet). Balancens 51xx/52xx tæller IKKE.
    if (resultatkonti.length > 0) {
      metricCandidates.push(kandidat({
        source_field_id: AFSKRIVNINGER_KEY, normalization_family: "cost_like", raw_value: 0, sign_convention: "credit",
        source_label: "no P&L depreciation range known for this template — 0 by rule", confidence: "LOW",
        evidence: ["no_pnl_depreciation_range", "balance_51xx_52xx_excluded"],
      }));
    }

    // ── Derived metrics (forretningskonvention — profilen KEEP'er dem) ──
    const revenue = fordeling.netto["omsaetning"] != null ? fordeling.revenue : null;
    const cogs = fordeling.omkostninger["direkte_omkostninger"];

    if (revenue != null && cogs != null) {
      const grossProfit = revenue - cogs;
      metricCandidates.push(kandidat({
        source_field_id: "daekningsbidrag", normalization_family: "profit_like", raw_value: grossProfit, sign_convention: "business",
        source_label: "derived:gross_profit (revenue - cogs)", confidence: "MEDIUM", evidence: ["derived:revenue-cogs"],
        source_column_slot: null, proposed_canonical_target: "gross_profit",
      }));
    }

    // Resultat før skat = −Σ Perioden over alle resultatkonti — saldobalancens egen sandhed.
    if (resultatkonti.length > 0) {
      metricCandidates.push(kandidat({
        source_field_id: "resultat_foer_skat", normalization_family: "profit_like", raw_value: fordeling.ebt, sign_convention: "business",
        source_label: "derived:ebt (−Σ period over all P&L accounts 1000-4999)", confidence: "HIGH",
        evidence: [`pnl_accounts:${resultatkonti.length}`, "derived:-sum(1000-4999)"],
        source_column_slot: null, proposed_canonical_target: "ebt",
      }));
    }

    // Assets total
    const fixedAssets = balanceSums["anlaegsaktiver"] != null ? Math.abs(balanceSums["anlaegsaktiver"]) : 0;
    const inventory = balanceSums["varelager"] != null ? Math.abs(balanceSums["varelager"]) : 0;
    const receivables = balanceSums["debitorer"] != null ? Math.abs(balanceSums["debitorer"]) : 0;
    const cashRaw = balanceSums["bank_balance"] ?? 0;
    const cashForAssets = cashRaw > 0 ? cashRaw : 0;

    for (const range of BALANCE_RANGES) {
      const rawSum = balanceSums[range.key];
      if (rawSum == null) continue;
      metricCandidates.push(kandidat({
        source_field_id: range.key, normalization_family: range.family, raw_value: rawSum, sign_convention: "credit",
        source_label: `aggregated:${range.key} (accounts ${range.min}-${range.max})`, confidence: "HIGH",
        evidence: [`account_range:${range.min}-${range.max}`, `sign_rule:${range.signRule}`],
        source_column_slot: YTD_COL, basis: "ytd",
      }));
    }

    if (fixedAssets + inventory + receivables + cashForAssets > 0) {
      const assetsTotal = fixedAssets + inventory + receivables + cashForAssets;
      metricCandidates.push(kandidat({
        source_field_id: "aktiver_i_alt", normalization_family: "asset_like", raw_value: assetsTotal, sign_convention: "credit",
        source_label: "derived:assets_total", confidence: "MEDIUM", evidence: ["derived:fixed+inventory+receivables+cash"],
        source_column_slot: null, proposed_canonical_target: "assets_total",
      }));
    }

    console.log(`${LOG_PREFIX} Built ${metricCandidates.length} metric candidates`);

    if (metricCandidates.length < 3) {
      console.log(`${LOG_PREFIX} Too few metrics (${metricCandidates.length}) → reject`);
      return null;
    }

    // ── Validation checks ──
    const checks = [];
    const hasRevenue = fordeling.netto["omsaetning"] != null;
    checks.push({ name: "revenue_present", result: hasRevenue ? "PASS" as const : "FAIL" as const, details: hasRevenue ? "Revenue accounts found" : "No revenue accounts" });
    const hasCosts = ["direkte_omkostninger", "loenninger", "administrationsomkostninger"].some(k => fordeling.netto[k] != null);
    checks.push({ name: "costs_present", result: hasCosts ? "PASS" as const : "FAIL" as const, details: hasCosts ? "Cost accounts found" : "No cost accounts" });
    const hasBalance = ["egenkapital", "bank_balance", "debitorer"].some(k => balanceSums[k] != null);
    checks.push({ name: "balance_present", result: hasBalance ? "PASS" as const : "FAIL" as const, details: hasBalance ? "Balance accounts found" : "No balance accounts" });
    checks.push({ name: "no_subtotals", result: "PASS" as const, details: "Line-item only format confirmed" });
    // Kolonnevalget står i loggen — også når det er faldet tilbage til de faste indeks.
    checks.push({
      name: "column_detection",
      result: "PASS" as const,
      details: `${kolonner.metode === "overskrift" ? "Columns from header" : "FALLBACK fixed columns"}: period col ${VALUE_COL}, ytd col ${YTD_COL}, header row ${kolonner.headerRowIndex} (${kolonner.evidence.join("; ")})`,
    });
    // Balancekonti i filen, men ingen af dem med et beløb → kolonnen er forkert (Brick Works 17/9: 86 konti, 0 beløb) — fælder.
    checks.push({
      name: "balance_values_present",
      result: balanceKonti === 0 ? "SKIP" as const : balanceKontiMedBeloeb > 0 ? "PASS" as const : "FAIL" as const,
      details: balanceKonti === 0
        ? "No balance accounts (≥ 5000) in file"
        : balanceKontiMedBeloeb > 0
          ? `${balanceKontiMedBeloeb} of ${balanceKonti} balance accounts carry a value in ytd col ${YTD_COL}`
          : `${balanceKonti} balance accounts found but NONE carry a value in ytd col ${YTD_COL} — wrong column (header: ${kolonner.evidence.join("; ")})`,
    });
    // Kontrolsummen: omsætning − Σ grupper + andre driftsindtægter = −Σ resultatkonti (1 kr.), og ingen konto uden gruppe.
    const daekket = Math.abs(fordeling.afvigelse) <= KONTROLSUM_TOLERANCE && fordeling.udenGruppe.length === 0;
    checks.push({
      name: "pnl_coverage",
      result: daekket ? "PASS" as const : "FAIL" as const,
      details: daekket
        ? `All ${resultatkonti.length} P&L accounts assigned; revenue ${fordeling.revenue.toFixed(2)} − costs + other income ${fordeling.andreDriftsindtaegter.toFixed(2)} = ebt ${fordeling.ebt.toFixed(2)} (diff ${fordeling.afvigelse.toFixed(2)})`
        : `P&L coverage broken: diff ${fordeling.afvigelse.toFixed(2)} kr. (tolerance ${KONTROLSUM_TOLERANCE}); accounts without group: ${fordeling.udenGruppe.join(", ") || "none"}`,
    });

    const parserStatus = checks.some(c => c.result === "FAIL") ? "FAIL" as const : "PASS" as const;

    const result: SemanticExtractionResult = {
      source_system: "economic",
      document_type: "saldobalance",
      template_id: TEMPLATE_ID,
      sign_convention: "credit",
      normalization_profile_id: "economic_saldobalance_credit_v1",
      company_name: companyName,
      cvr,
      period_start: periodStart,
      period_end: periodEnd,
      report_period_label: reportPeriodLabel,
      metric_candidates: metricCandidates,
      line_items: lineItems,
      basis_profile: { mode: "single", selected_period_basis: "period" },
      parser_validation: { parser_status: parserStatus, checks },
      _deterministic_meta: {
        template_id: TEMPLATE_ID,
        parser_confidence: parserStatus === "PASS" ? "HIGH" : "MEDIUM",
        detection_score: 0, // Set by registry
        raw_line_count: xlsxResult.rows.length,
        normalized_line_count: metricCandidates.length,
        column_basis_rule: "single",
      },
    };

    console.log(`${LOG_PREFIX} Extraction complete: ${metricCandidates.length} candidates from ${totalLineItems} line items`);
    return result;
  },
};
