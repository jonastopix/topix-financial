import * as XLSX from "xlsx";

// ── Types ──

type ExtractStatus = "PASS" | "FAIL";

export type TemplateExtractResult = {
  status: ExtractStatus;
  errors: { code: string; message: string }[];
  meta?: {
    companyName: string | null;
    cvr: string | null;
    periodText: string | null;
    period?: { start: string | null; end: string | null };
    template: "KJ_AUTO_REGNSKABSRAPPORT_V1";
  };
  metrics?: {
    turnover: { month: number; ytd: number };
    db1: { month: number; ytd: number };
    db2: { month: number; ytd: number };
    ebt: { month: number; ytd: number };
  };
  sources?: Record<string, string>;
};

// ── Template definition ──

const TEMPLATE = {
  templateName: "KJ_AUTO_REGNSKABSRAPPORT_V1" as const,
  sheets: {
    data: "DATA",
    top: "P&L Top Line",
  },
  cells: {
    companyName: { sheet: "DATA", addr: "A2" },
    cvr: { sheet: "DATA", addr: "A5" },
    periodText: { sheet: "P&L Top Line", addr: "C3" },
    turnover_month: { sheet: "P&L Top Line", addr: "C28" },
    turnover_ytd: { sheet: "P&L Top Line", addr: "J28" },
    db1_month: { sheet: "P&L Top Line", addr: "C173" },
    db1_ytd: { sheet: "P&L Top Line", addr: "J173" },
    db2_month: { sheet: "P&L Top Line", addr: "C30" },
    db2_ytd: { sheet: "P&L Top Line", addr: "J30" },
    ebt_month: { sheet: "DATA", addr: "C346" },
    ebt_ytd: { sheet: "DATA", addr: "F346" },
    turnover_check_month: { sheet: "P&L Top Line", addr: "C29" },
    turnover_check_ytd: { sheet: "P&L Top Line", addr: "J29" },
  },
};

// ── Helpers ──

function normalizeNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const cleaned = s.replace(/\s+/g, "").replace(/\./g, "").replace(/,/g, ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stripCvr(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const m = text.match(/CVR\D*(\d{6,10})/i);
  return m ? m[1] : null;
}

function parsePeriod(periodText: string | null): { start: string | null; end: string | null } {
  if (!periodText) return { start: null, end: null };
  const m = periodText.match(/(\d{1,2}\.\d{1,2}\.\d{2,4})\s*[-–]\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/);
  if (!m) return { start: null, end: null };
  const toISO = (d: string) => {
    const [dd, mm, yy] = d.split(".");
    if (!dd || !mm || !yy) return null;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  };
  return { start: toISO(m[1]) ?? null, end: toISO(m[2]) ?? null };
}

function nearlyEqual(a: number, b: number, tol = 0.01): boolean {
  return Math.abs(a - b) <= tol;
}

// ── Cell access with minimal formula evaluation ──

function getCell(wb: XLSX.WorkBook, sheetName: string, addr: string): XLSX.CellObject | null {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  return (ws[addr] as XLSX.CellObject | undefined) ?? null;
}

function evalFormula(
  wb: XLSX.WorkBook,
  currentSheetName: string,
  formula: string,
  seen: Set<string>
): number | null {
  const f = formula.trim();
  if (!f.startsWith("=")) return null;
  const key = `${currentSheetName}:${f}`;
  if (seen.has(key)) return null;
  seen.add(key);

  // Sheet reference: =DATA!C346 or ='P&L Top Line'!C28
  const refMatch = f.match(/^=\s*(?:'([^']+)'|([A-Za-z0-9 &._-]+))!\s*([A-Z]{1,3}\d{1,7})\s*$/);
  if (refMatch) {
    const sheet = refMatch[1] ?? refMatch[2];
    const addr = refMatch[3];
    if (!sheet || !addr) return null;
    return getNumericCell(wb, sheet, addr, seen);
  }

  // =SUM(...)
  const sumMatch = f.match(/^=\s*SUM\s*\((.*)\)\s*$/i);
  if (sumMatch) {
    const inside = sumMatch[1]?.trim();
    if (!inside) return null;
    const parts = inside.split(",").map((p) => p.trim()).filter(Boolean);
    let total = 0;
    for (const part of parts) {
      const rangeMatch = part.match(/^([A-Z]{1,3}\d{1,7})\s*:\s*([A-Z]{1,3}\d{1,7})$/);
      if (rangeMatch) {
        const cells = expandRange(rangeMatch[1], rangeMatch[2]);
        for (const addr of cells) {
          const v = getNumericCell(wb, currentSheetName, addr, seen);
          if (v === null) return null;
          total += v;
        }
        continue;
      }
      const cellMatch = part.match(/^([A-Z]{1,3}\d{1,7})$/);
      if (cellMatch) {
        const v = getNumericCell(wb, currentSheetName, cellMatch[1], seen);
        if (v === null) return null;
        total += v;
        continue;
      }
      const sheetRefMatch = part.match(/^(?:'([^']+)'|([A-Za-z0-9 &._-]+))!\s*([A-Z]{1,3}\d{1,7})$/);
      if (sheetRefMatch) {
        const sheet = sheetRefMatch[1] ?? sheetRefMatch[2];
        const addr = sheetRefMatch[3];
        if (!sheet || !addr) return null;
        const v = getNumericCell(wb, sheet, addr, seen);
        if (v === null) return null;
        total += v;
        continue;
      }
      return null;
    }
    return total;
  }

  return null;
}

function expandRange(a1: string, a2: string): string[] {
  const start = XLSX.utils.decode_cell(a1);
  const end = XLSX.utils.decode_cell(a2);
  const out: string[] = [];
  for (let r = Math.min(start.r, end.r); r <= Math.max(start.r, end.r); r++) {
    for (let c = Math.min(start.c, end.c); c <= Math.max(start.c, end.c); c++) {
      out.push(XLSX.utils.encode_cell({ r, c }));
    }
  }
  return out;
}

function getNumericCell(wb: XLSX.WorkBook, sheetName: string, addr: string, seen = new Set<string>()): number | null {
  const cell = getCell(wb, sheetName, addr);
  if (!cell) return null;
  const cached = normalizeNumber((cell as any).v);
  if (cached !== null) return cached;
  const formula = (cell as any).f as string | undefined;
  if (formula) {
    return evalFormula(wb, sheetName, `=${formula.replace(/^=/, "")}`, seen);
  }
  return null;
}

function getStringCell(wb: XLSX.WorkBook, sheetName: string, addr: string): string | null {
  const cell = getCell(wb, sheetName, addr);
  if (!cell) return null;
  const v = (cell as any).v;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

// ── Public API ──

/** Check if workbook matches KJ Auto template */
export function detectTemplate(wb: XLSX.WorkBook): boolean {
  return !!wb.Sheets[TEMPLATE.sheets.data] && !!wb.Sheets[TEMPLATE.sheets.top];
}

/** Extract data deterministically from KJ Auto template */
export function extractKJAutoTemplate(wb: XLSX.WorkBook): TemplateExtractResult {
  const errors: TemplateExtractResult["errors"] = [];

  // Sheet presence
  if (!wb.Sheets[TEMPLATE.sheets.data]) {
    errors.push({ code: "MISSING_SHEET", message: `Mangler arket "${TEMPLATE.sheets.data}"` });
  }
  if (!wb.Sheets[TEMPLATE.sheets.top]) {
    errors.push({ code: "MISSING_SHEET", message: `Mangler arket "${TEMPLATE.sheets.top}"` });
  }
  if (errors.length) return { status: "FAIL", errors };

  // Meta
  const companyName = getStringCell(wb, TEMPLATE.cells.companyName.sheet, TEMPLATE.cells.companyName.addr);
  const cvrRaw = getStringCell(wb, TEMPLATE.cells.cvr.sheet, TEMPLATE.cells.cvr.addr);
  const cvr = stripCvr(cvrRaw);
  const periodText = getStringCell(wb, TEMPLATE.cells.periodText.sheet, TEMPLATE.cells.periodText.addr);
  const period = parsePeriod(periodText);

  if (!cvr) {
    errors.push({ code: "CVR_NOT_FOUND", message: `CVR kunne ikke parses fra ${TEMPLATE.cells.cvr.sheet}!${TEMPLATE.cells.cvr.addr}` });
  }

  // Metrics
  const turnoverMonth = getNumericCell(wb, TEMPLATE.cells.turnover_month.sheet, TEMPLATE.cells.turnover_month.addr);
  const turnoverYtd = getNumericCell(wb, TEMPLATE.cells.turnover_ytd.sheet, TEMPLATE.cells.turnover_ytd.addr);
  const db1Month = getNumericCell(wb, TEMPLATE.cells.db1_month.sheet, TEMPLATE.cells.db1_month.addr);
  const db1Ytd = getNumericCell(wb, TEMPLATE.cells.db1_ytd.sheet, TEMPLATE.cells.db1_ytd.addr);
  const db2Month = getNumericCell(wb, TEMPLATE.cells.db2_month.sheet, TEMPLATE.cells.db2_month.addr);
  const db2Ytd = getNumericCell(wb, TEMPLATE.cells.db2_ytd.sheet, TEMPLATE.cells.db2_ytd.addr);
  const ebtMonth = getNumericCell(wb, TEMPLATE.cells.ebt_month.sheet, TEMPLATE.cells.ebt_month.addr)
    ?? getNumericCell(wb, "P&L Top Line", "C370");
  const ebtYtd = getNumericCell(wb, TEMPLATE.cells.ebt_ytd.sheet, TEMPLATE.cells.ebt_ytd.addr)
    ?? getNumericCell(wb, "P&L Top Line", "J370");

  const required: Array<[string, number | null]> = [
    ["turnoverMonth", turnoverMonth],
    ["turnoverYtd", turnoverYtd],
    ["db1Month", db1Month],
    ["db1Ytd", db1Ytd],
    ["db2Month", db2Month],
    ["db2Ytd", db2Ytd],
    ["ebtMonth", ebtMonth],
    ["ebtYtd", ebtYtd],
  ];

  for (const [name, val] of required) {
    if (val === null) errors.push({ code: "MISSING_VALUE", message: `Mangler værdi: ${name}` });
  }

  // Sanity checks
  const turnCheckMonth = getNumericCell(wb, TEMPLATE.cells.turnover_check_month.sheet, TEMPLATE.cells.turnover_check_month.addr);
  const turnCheckYtd = getNumericCell(wb, TEMPLATE.cells.turnover_check_ytd.sheet, TEMPLATE.cells.turnover_check_ytd.addr);

  if (turnoverMonth !== null && turnCheckMonth !== null && !nearlyEqual(turnoverMonth, turnCheckMonth, 0.5)) {
    errors.push({ code: "TURNOVER_MISMATCH", message: `Omsætning C28 matcher ikke C29 (måned): ${turnoverMonth} vs ${turnCheckMonth}` });
  }
  if (turnoverYtd !== null && turnCheckYtd !== null && !nearlyEqual(turnoverYtd, turnCheckYtd, 0.5)) {
    errors.push({ code: "TURNOVER_MISMATCH_YTD", message: `Omsætning J28 matcher ikke J29 (ÅTD): ${turnoverYtd} vs ${turnCheckYtd}` });
  }

  const buildSources = () => {
    const s: Record<string, string> = {};
    for (const [key, def] of Object.entries(TEMPLATE.cells)) {
      s[key] = `${def.sheet}!${def.addr}`;
    }
    return s;
  };

  const meta = {
    companyName: companyName ?? null,
    cvr: cvr ?? null,
    periodText: periodText ?? null,
    period,
    template: TEMPLATE.templateName,
  };

  if (errors.length) {
    return { status: "FAIL", errors, meta, sources: buildSources() };
  }

  return {
    status: "PASS",
    errors: [],
    meta,
    metrics: {
      turnover: { month: turnoverMonth!, ytd: turnoverYtd! },
      db1: { month: db1Month!, ytd: db1Ytd! },
      db2: { month: db2Month!, ytd: db2Ytd! },
      ebt: { month: ebtMonth!, ytd: ebtYtd! },
    },
    sources: buildSources(),
  };
}

// ── Danish month mapping for period text ──

const DANISH_MONTHS: Record<string, string> = {
  "januar": "01", "februar": "02", "marts": "03", "april": "04",
  "maj": "05", "juni": "06", "juli": "07", "august": "08",
  "september": "09", "oktober": "10", "november": "11", "december": "12",
};

/**
 * Convert template result to ExtractedData format compatible with the existing pipeline.
 * Returns null if result is FAIL.
 */
export function templateResultToExtractedData(
  result: TemplateExtractResult
): {
  report_type: string;
  report_period: string;
  company_name: string;
  cvr_number: string;
  key_figures: Record<string, number>;
  line_items: Array<{ name: string; period_amount: number; ytd_amount: number }>;
  extraction_method: "deterministic";
} | null {
  if (result.status !== "PASS" || !result.metrics || !result.meta) return null;

  const { metrics, meta } = result;

  // Parse period text to "Måned YYYY" format
  let reportPeriod = meta.periodText || "Ukendt periode";
  if (meta.period?.end) {
    const endDate = meta.period.end; // YYYY-MM-DD
    const [y, m] = endDate.split("-");
    const monthName = Object.entries(DANISH_MONTHS).find(([, v]) => v === m)?.[0];
    if (monthName && y) {
      reportPeriod = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${y}`;
    }
  }

  return {
    report_type: "resultatopgørelse",
    report_period: reportPeriod,
    company_name: meta.companyName || "Ukendt virksomhed",
    cvr_number: meta.cvr || "",
    extraction_method: "deterministic",
    key_figures: {
      omsaetning: Math.abs(metrics.turnover.month),
      omsaetning_aar: Math.abs(metrics.turnover.ytd),
      daekningsbidrag: metrics.db1.month,
      daekningsbidrag_aar: metrics.db1.ytd,
      daekningsbidrag_ii: metrics.db2.month,
      daekningsbidrag_ii_aar: metrics.db2.ytd,
      resultat_foer_skat: metrics.ebt.month,
      resultat_foer_skat_aar: metrics.ebt.ytd,
    },
    line_items: [
      { name: "Omsætning", period_amount: metrics.turnover.month, ytd_amount: metrics.turnover.ytd },
      { name: "Dækningsbidrag I", period_amount: metrics.db1.month, ytd_amount: metrics.db1.ytd },
      { name: "Dækningsbidrag II", period_amount: metrics.db2.month, ytd_amount: metrics.db2.ytd },
      { name: "Resultat før skat", period_amount: metrics.ebt.month, ytd_amount: metrics.ebt.ytd },
    ],
  };
}
