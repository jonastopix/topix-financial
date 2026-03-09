/**
 * Financial Parser - Deterministisk regnskabsparser til DK Combined Balance/P&L rapporter
 * 
 * Denne parser håndterer Excel-rapporter med kombineret resultatopgørelse og balance,
 * hvor fortegn følger regnskabsmæssige konventioner (negative tal = kredit/overskud).
 */

// ── Type Definitions ──

export type ReportTemplate = 
  | "DK_COMBINED_BALANCE_PNL_V1" 
  | "UNKNOWN";

export interface RawLine {
  account_no: number | null;
  label: string;
  raw_value: number | null;
  row_number: number;
}

export interface NormalizedLine {
  account_no: number | null;
  label: string;
  raw_value: number | null;
  normalized_value: number | null;
  section: "PNL" | "BALANCE_ASSET" | "BALANCE_LIABILITY" | "HEADER" | "UNKNOWN";
  class: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface KPIMetrics {
  // P&L
  revenue: number | null;
  cogs: number | null;
  gross_profit: number | null;
  gross_margin_pct: number | null;
  payroll: number | null;
  payroll_related: number | null;
  other_staff_costs: number | null;
  sales_costs: number | null;
  facility_costs: number | null;
  admin_costs: number | null;
  vehicle_costs: number | null;
  ebitda: number | null;
  depreciation: number | null;
  ebit: number | null;
  financial_costs: number | null;
  extraordinary_items: number | null;
  ebt: number | null;
  ebt_margin_pct: number | null;
  net_result: number | null;
  
  // Balance
  assets_total: number | null;
  inventory: number | null;
  receivables_total: number | null;
  trade_receivables: number | null;
  unbilled_wip: number | null;
  cash: number | null;
  equity_total: number | null;
  equity_ratio_pct: number | null;
  related_party_net: number | null;
  provisions_total: number | null;
  current_liabilities: number | null;
  debt_total: number | null;
  vat_payable: number | null;
  liabilities_total: number | null;
}

export interface ValidationResult {
  validation_status: "PASS" | "FAIL";
  validation_errors: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface ParsedFinancialReport {
  template_id: ReportTemplate;
  company_name: string | null;
  period_start: string | null;
  period_end: string | null;
  raw_lines: RawLine[];
  normalized_lines: NormalizedLine[];
  metrics: KPIMetrics;
  validation: ValidationResult;
}

// ── Constants ──

// P&L labels der skal flippes (negative raw → positive normalized)
const PNL_FLIP_LABELS = [
  "omsætning ialt",
  "dækningsbidrag",
  "resultat før afskrivninger",
  "indtjeningsbidrag",
  "resultat før finansielle poster",
  "resultat før ekstraordinære poster",
  "resultat før skat",
  "årets resultat",
];

// Omkostnings-labels (skal være absolute)
const COST_LABELS = [
  "vareforbrug ialt",
  "lønninger ialt",
  "pensioner & sociale bidrag ialt",
  "øvrige personaleudgifter ialt",
  "salgsomkostninger ialt",
  "lokaleomkostninger ialt",
  "administrationsomkostninger ialt",
  "autodrift ialt",
  "afskrivninger ialt",
  "finansieringsudgifter ialt",
  "ekstraordinære poster ialt",
];

// Passiv-labels der skal flippes til positive
const LIABILITY_FLIP_LABELS = [
  "egenkapital ialt",
  "hensættelser ialt",
  "langfristet gæld ialt",
  "kortfristet gæld ialt",
  "gæld ialt",
  "passiver ialt",
  "moms ialt",
];

// Cash/likviditets-labels (behold negativt fortegn = overtræk)
const CASH_LABELS = [
  "likvide beholdninger ialt",
  "bank",
];

// KPI mapping (label → field name)
const KPI_LABEL_MAP: Record<string, keyof KPIMetrics> = {
  "omsætning ialt": "revenue",
  "vareforbrug ialt": "cogs",
  "dækningsbidrag": "gross_profit",
  "lønninger ialt": "payroll",
  "pensioner & sociale bidrag ialt": "payroll_related",
  "øvrige personaleudgifter ialt": "other_staff_costs",
  "salgsomkostninger ialt": "sales_costs",
  "lokaleomkostninger ialt": "facility_costs",
  "administrationsomkostninger ialt": "admin_costs",
  "autodrift ialt": "vehicle_costs",
  "resultat før afskrivninger": "ebitda",
  "afskrivninger ialt": "depreciation",
  "indtjeningsbidrag": "ebit",
  "finansieringsudgifter ialt": "financial_costs",
  "ekstraordinære poster ialt": "extraordinary_items",
  "resultat før skat": "ebt",
  "årets resultat": "net_result",
  "aktiver ialt": "assets_total",
  "varelager": "inventory",
  "tilgodehavender ialt": "receivables_total",
  "tilgodehavender fra salg & tjenesteydelser": "trade_receivables",
  "igangværende arbejde manglende fakturering": "unbilled_wip",
  "likvide beholdninger ialt": "cash",
  "egenkapital ialt": "equity_total",
  "mellemregning ialt": "related_party_net",
  "hensættelser ialt": "provisions_total",
  "kortfristet gæld ialt": "current_liabilities",
  "gæld ialt": "debt_total",
  "moms ialt": "vat_payable",
  "passiver ialt": "liabilities_total",
};

// ── LAG 1: Template Detection ──

export function detectReportTemplate(rows: any[][]): ReportTemplate {
  if (!rows || rows.length < 6) return "UNKNOWN";

  try {
    // Check row 1: virksomhedsnavn (ikke tom)
    const row1 = rows[0]?.[0];
    if (!row1 || typeof row1 !== "string" || row1.trim() === "") {
      return "UNKNOWN";
    }

    // Check row 2: indeholder "Balance"
    const row2 = rows[1]?.[0];
    if (!row2 || typeof row2 !== "string" || !row2.toLowerCase().includes("balance")) {
      return "UNKNOWN";
    }

    // Check row 5: header med "Nummer", "Navn" og periode
    const row5 = rows[4];
    if (!row5 || row5.length < 3) return "UNKNOWN";
    
    const hasNummer = row5[0]?.toString().toLowerCase().includes("nummer");
    const hasNavn = row5[1]?.toString().toLowerCase().includes("navn");
    const hasPeriod = row5[2] && row5[2].toString().trim() !== "";

    if (!hasNummer || !hasNavn || !hasPeriod) {
      return "UNKNOWN";
    }

    // Check kontoplan: skal have konto 998+ (P&L) og 6000+ (balance)
    let hasPnL = false;
    let hasBalance = false;

    for (let i = 5; i < Math.min(rows.length, 200); i++) {
      const accountNo = rows[i]?.[0];
      if (typeof accountNo === "number") {
        if (accountNo >= 998 && accountNo < 6000) hasPnL = true;
        if (accountNo >= 6000) hasBalance = true;
      }
    }

    if (hasPnL && hasBalance) {
      return "DK_COMBINED_BALANCE_PNL_V1";
    }

    return "UNKNOWN";
  } catch (error) {
    console.error("Template detection failed:", error);
    return "UNKNOWN";
  }
}

// ── LAG 2: Raw Extraction ──

export function extractRawLines(rows: any[][], template: ReportTemplate): RawLine[] {
  if (template !== "DK_COMBINED_BALANCE_PNL_V1") return [];

  const rawLines: RawLine[] = [];

  // Start fra række 5 (index 5), efter header
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const accountNo = typeof row[0] === "number" ? row[0] : null;
    const label = row[1]?.toString().trim() || "";
    const rawValue = typeof row[2] === "number" ? row[2] : null;

    // Skip tomme rækker eller rækker uden label
    if (!label || label === "") continue;

    // Skip header-rækker (indeholder "Nummer", "Navn" osv.)
    if (label.toLowerCase().includes("nummer") || label.toLowerCase().includes("navn")) continue;

    rawLines.push({
      account_no: accountNo,
      label,
      raw_value: rawValue,
      row_number: i + 1,
    });
  }

  return rawLines;
}

// ── LAG 3: Normalization Engine ──

export function normalizeFinancialData(
  rawLines: RawLine[],
  template: ReportTemplate
): NormalizedLine[] {
  if (template !== "DK_COMBINED_BALANCE_PNL_V1") return [];

  return rawLines.map((line) => {
    const labelLower = line.label.toLowerCase();
    let section: NormalizedLine["section"] = "UNKNOWN";
    let normalizedValue: number | null = line.raw_value;
    let classType: string | null = null;
    let confidence: NormalizedLine["confidence"] = "MEDIUM";

    // Determine section based on account number
    if (line.account_no !== null) {
      if (line.account_no >= 998 && line.account_no < 6000) {
        section = "PNL";
      } else if (line.account_no >= 6000 && line.account_no < 8000) {
        section = "BALANCE_ASSET";
      } else if (line.account_no >= 8000) {
        section = "BALANCE_LIABILITY";
      }
    }

    // Normalization rules
    if (section === "PNL") {
      // P&L flip rules
      if (PNL_FLIP_LABELS.some((l) => labelLower.includes(l))) {
        normalizedValue = line.raw_value !== null ? line.raw_value * -1 : null;
        classType = "PNL_RESULT";
        confidence = "HIGH";
      } else if (COST_LABELS.some((l) => labelLower.includes(l))) {
        normalizedValue = line.raw_value !== null ? Math.abs(line.raw_value) : null;
        classType = "PNL_COST";
        confidence = "HIGH";
      }
    } else if (section === "BALANCE_ASSET") {
      // Assets: keep as-is, except cash
      if (CASH_LABELS.some((l) => labelLower.includes(l))) {
        // Keep negative sign for bank overdraft
        normalizedValue = line.raw_value;
        classType = "CASH";
        confidence = "HIGH";
      } else {
        normalizedValue = line.raw_value;
        classType = "ASSET";
        confidence = "MEDIUM";
      }
    } else if (section === "BALANCE_LIABILITY") {
      // Special case: Mellemregning
      if (labelLower.includes("mellemregning")) {
        normalizedValue = line.raw_value; // Keep sign as-is
        classType = "RELATED_PARTY_NET";
        confidence = "HIGH";
      } else if (LIABILITY_FLIP_LABELS.some((l) => labelLower.includes(l))) {
        normalizedValue = line.raw_value !== null ? Math.abs(line.raw_value) : null;
        classType = "LIABILITY";
        confidence = "HIGH";
      } else {
        normalizedValue = line.raw_value !== null ? Math.abs(line.raw_value) : null;
        classType = "LIABILITY";
        confidence = "MEDIUM";
      }
    }

    return {
      account_no: line.account_no,
      label: line.label,
      raw_value: line.raw_value,
      normalized_value: normalizedValue,
      section,
      class: classType,
      confidence,
    };
  });
}

// ── LAG 4: KPI Mapping ──

export function mapToKPISchema(normalizedLines: NormalizedLine[]): KPIMetrics {
  const metrics: KPIMetrics = {
    revenue: null,
    cogs: null,
    gross_profit: null,
    gross_margin_pct: null,
    payroll: null,
    payroll_related: null,
    other_staff_costs: null,
    sales_costs: null,
    facility_costs: null,
    admin_costs: null,
    vehicle_costs: null,
    ebitda: null,
    depreciation: null,
    ebit: null,
    financial_costs: null,
    extraordinary_items: null,
    ebt: null,
    ebt_margin_pct: null,
    net_result: null,
    assets_total: null,
    inventory: null,
    receivables_total: null,
    trade_receivables: null,
    unbilled_wip: null,
    cash: null,
    equity_total: null,
    equity_ratio_pct: null,
    related_party_net: null,
    provisions_total: null,
    current_liabilities: null,
    debt_total: null,
    vat_payable: null,
    liabilities_total: null,
  };

  // Map normalized lines to KPI fields
  for (const line of normalizedLines) {
    const labelLower = line.label.toLowerCase();
    
    for (const [labelPattern, fieldName] of Object.entries(KPI_LABEL_MAP)) {
      if (labelLower.includes(labelPattern)) {
        metrics[fieldName] = line.normalized_value;
        break;
      }
    }
  }

  // Calculate derived metrics
  if (metrics.revenue !== null && metrics.gross_profit !== null && metrics.revenue !== 0) {
    metrics.gross_margin_pct = (metrics.gross_profit / metrics.revenue) * 100;
  }

  if (metrics.revenue !== null && metrics.ebt !== null && metrics.revenue !== 0) {
    metrics.ebt_margin_pct = (metrics.ebt / metrics.revenue) * 100;
  }

  if (metrics.equity_total !== null && metrics.assets_total !== null && metrics.assets_total !== 0) {
    metrics.equity_ratio_pct = (metrics.equity_total / metrics.assets_total) * 100;
  }

  return metrics;
}

// ── LAG 5: Validation Engine ──

export function validateFinancialData(metrics: KPIMetrics): ValidationResult {
  const errors: string[] = [];
  let confidence: ValidationResult["confidence"] = "HIGH";

  const tolerance = 0.01; // 1% tolerance

  // Helper function to check if values match within tolerance
  const withinTolerance = (a: number | null, b: number | null): boolean => {
    if (a === null || b === null) return false;
    if (a === 0 && b === 0) return true;
    const diff = Math.abs(a - b);
    const avg = (Math.abs(a) + Math.abs(b)) / 2;
    return avg === 0 ? diff === 0 : diff / avg <= tolerance;
  };

  // ── P&L Validations ──

  // Revenue - COGS = Gross Profit
  if (metrics.revenue !== null && metrics.cogs !== null && metrics.gross_profit !== null) {
    const calculated = metrics.revenue - metrics.cogs;
    if (!withinTolerance(calculated, metrics.gross_profit)) {
      errors.push(
        `P&L validation failed: Revenue (${metrics.revenue}) - COGS (${metrics.cogs}) ≠ Gross Profit (${metrics.gross_profit})`
      );
    }
  }

  // EBITDA - Depreciation = EBIT
  if (metrics.ebitda !== null && metrics.depreciation !== null && metrics.ebit !== null) {
    const calculated = metrics.ebitda - metrics.depreciation;
    if (!withinTolerance(calculated, metrics.ebit)) {
      errors.push(
        `P&L validation failed: EBITDA (${metrics.ebitda}) - Depreciation (${metrics.depreciation}) ≠ EBIT (${metrics.ebit})`
      );
    }
  }

  // ── Balance Validations ──

  // Assets = Liabilities (balance equation)
  if (metrics.assets_total !== null && metrics.liabilities_total !== null) {
    if (!withinTolerance(Math.abs(metrics.assets_total), Math.abs(metrics.liabilities_total))) {
      errors.push(
        `Balance validation failed: Assets (${metrics.assets_total}) ≠ Liabilities (${metrics.liabilities_total})`
      );
    }
  }

  // ── Data Integrity Checks ──

  // Revenue should be positive
  if (metrics.revenue !== null && metrics.revenue <= 0) {
    errors.push(`Data integrity failed: Revenue must be positive (${metrics.revenue})`);
    confidence = "LOW";
  }

  // Assets should be positive
  if (metrics.assets_total !== null && metrics.assets_total <= 0) {
    errors.push(`Data integrity failed: Assets must be positive (${metrics.assets_total})`);
    confidence = "LOW";
  }

  // Equity should exist
  if (metrics.equity_total === null) {
    errors.push("Data integrity failed: Equity total is missing");
    confidence = "MEDIUM";
  }

  // If validation passes but with warnings, lower confidence
  if (errors.length === 0 && (
    metrics.revenue === null || 
    metrics.assets_total === null || 
    metrics.equity_total === null
  )) {
    confidence = "MEDIUM";
  }

  return {
    validation_status: errors.length === 0 ? "PASS" : "FAIL",
    validation_errors: errors,
    confidence: errors.length === 0 ? confidence : "LOW",
  };
}

// ── Main Parse Function ──

export function parseFinancialReport(rows: any[][]): ParsedFinancialReport {
  // Lag 1: Template detection
  const template = detectReportTemplate(rows);

  if (template === "UNKNOWN") {
    return {
      template_id: "UNKNOWN",
      company_name: null,
      period_start: null,
      period_end: null,
      raw_lines: [],
      normalized_lines: [],
      metrics: {} as KPIMetrics,
      validation: {
        validation_status: "FAIL",
        validation_errors: ["Template not recognized"],
        confidence: "LOW",
      },
    };
  }

  // Extract metadata
  const companyName = rows[0]?.[0]?.toString().trim() || null;
  const periodHeader = rows[4]?.[2]?.toString().trim() || null;

  // Parse period (assuming format like "01-01-2026 til 31-01-2026")
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  if (periodHeader) {
    const match = periodHeader.match(/(\d{2}-\d{2}-\d{4})\s*til\s*(\d{2}-\d{2}-\d{4})/);
    if (match) {
      periodStart = match[1];
      periodEnd = match[2];
    }
  }

  // Lag 2: Raw extraction
  const rawLines = extractRawLines(rows, template);

  // Lag 3: Normalization
  const normalizedLines = normalizeFinancialData(rawLines, template);

  // Lag 4: KPI mapping
  const metrics = mapToKPISchema(normalizedLines);

  // Lag 5: Validation
  const validation = validateFinancialData(metrics);

  return {
    template_id: template,
    company_name: companyName,
    period_start: periodStart,
    period_end: periodEnd,
    raw_lines: rawLines,
    normalized_lines: normalizedLines,
    metrics,
    validation,
  };
}

