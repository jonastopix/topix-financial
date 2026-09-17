/**
 * DK_DINERO_RESULTATOPGOERELSE_V1
 * Dinero Resultatopgørelse CSV template
 *
 * - Semicolon-separated CSV with header: Konto;Kontonavn;Beløb
 * - Bookkeeping sign convention (revenue negative/credit, expenses positive/debit)
 * - Label-first classification with account-range fallback
 * - Ambiguity detection: lines matching 2+ classes → unclassified + logged
 * - Conservative metric derivation (no sum-all-lines shortcuts)
 *
 * Phase 7: Added extractSemanticFromCsv() — structural-first semantic path.
 *
 * FORTEGN OG DÆKNING (17/9-2026, C's mønster fra saldobalance-XLSX'en; se _shared/kontogrupper.ts):
 * begge veje fordeler via fordelKontogrupper — netto med fortegn pr. klasse, kredit-netto i en
 * omkostningsklasse → andre_driftsindtaegter (financial_costs-klassen → finansielle_indtaegter),
 * uklassificerede og tvetydige linjer → oevrige_omkostninger, kontrolsum pnl_coverage. Før blev
 * hver klasse abs'et og linjer uden klasse sprunget over.
 *
 * FILNAVNET VEJER IKKE (10/9-2026, Jonas). Fra 9/3 til 10/9 afgjorde detect()
 * på filnavnet: «resultat» gav +20 og «balance» gav 0 — uden begrundelse i
 * kode eller commit. Fingerprintet (sourceFingerprint.ts) genkender Dinero
 * på INDHOLDET (overskriften Konto;Kontonavn;Beløb), og skabelonen afviste
 * derefter på NAVNET. Målt i prod 10/9: tre strandinger (Rezycl 23/8,
 * Booking Innovation 9/7 og 9/8) hed «Saldobalance.csv» / «Saldobalance maj
 * 26.csv» og bar præcis den overskrift skabelonen kræver. Nu afgør
 * indholdet: rækker med et FIRECIFRET kontonummer og et beløb er
 * resultatlinjer — det er skabelonens egen model (RANGE_CLASSES 1000–9999),
 * og præcis den regel extract() og extractSemanticFromCsv() allerede brugte
 * (`/^\d{4}$/`) til at springe balancekonti over. En saldobalance med både
 * resultat- og balancekonti læses derfor som sin resultatopgørelse, og
 * antallet af oversprungne balancelinjer står i parser_validation. En fil
 * UDEN firecifrede konti (ren balance) når ikke 80 og går til manuel
 * indtastning som før. GRÆNSEN: en kontoplan hvor balancekonti er firecifrede
 * ville blive læst som resultatkonti — det var også tilfældet før, for alle
 * filer der ikke hed «balance».
 */

import type {
  TemplateEntry,
  SemanticCsvTemplateEntry,
  DetectionContext,
  ExtractionContext,
  DeterministicExtractedData,
  ParserValidation,
} from "../templateRegistry.ts";
import type { CsvParseResult } from "../csvRawParser.ts";
import type {
  SemanticExtractionResult,
  SemanticMetricCandidate,
  SemanticLineItem,
} from "../semanticTypes.ts";
import type { MetricFamily } from "../normalizationProfiles.ts";
import { fordelKontogrupper, keyFiguresAf, kontrolsumTjek, OEVRIGE_CLS, type GruppeFordeling } from "../kontogrupper.ts";

// ── Label patterns per class (PRIMARY classification) ──

const LABEL_CLASSES: Record<string, string[]> = {
  revenue: ["salg", "omsætning", "indtægt", "honorar"],
  cogs: ["vareforbrug", "direkte omkostning"],
  payroll: ["løn", "am-indkomst", "atp", "feriepenge", "pension", "a-skat"],
  facility_costs: ["husleje", "lokale", "elforbrug", "elektricitet", "vand", "varme", "rengøring"],
  vehicle_costs: ["parkering", "færge", "transport", "kørsel", "brændstof"],
  sales_costs: ["reklame", "markedsføring", "annoncering", "messe", "repræsentation", "gaver"],
  admin_costs: ["bogføring", "konsulent", "porto", "software", "forsikring", "telefon", "kontingent", "kontor", "fremmed arbejde", "underleverandør"],
  depreciation: ["afskrivning", "småanskaffelse"],
  financial_costs: ["rente", "renteudgift", "renteindtægt", "bankgebyr", "finansiel", "kursregulering"],
  tax: ["selskabsskat", "skat af årets resultat", "årets skat"],
};

// ── Account number ranges per class (SECONDARY fallback) ──

const RANGE_CLASSES: [string, number, number][] = [
  ["revenue", 1000, 1999],
  ["cogs", 2000, 2999],
  ["payroll", 3000, 3999],
  ["sales_costs", 4000, 4999],
  ["facility_costs", 5000, 5999],
  ["vehicle_costs", 6000, 6999],
  ["admin_costs", 7000, 7999],
  ["depreciation", 8000, 8099],
  ["financial_costs", 8100, 8999],
  ["tax", 9000, 9999],
];

// ── Canonical class → line_items class constant ──

const CLASS_TO_LINE_CLASS: Record<string, string> = {
  revenue: "REVENUE",
  cogs: "COGS",
  payroll: "OPEX",
  facility_costs: "OPEX",
  vehicle_costs: "OPEX",
  sales_costs: "OPEX",
  admin_costs: "OPEX",
  depreciation: "DEPR",
  financial_costs: "FIN_EXPENSE",
  tax: "TAX",
};

// ── Class → normalization family mapping ──

const CLASS_TO_FAMILY: Record<string, MetricFamily> = {
  revenue: "revenue_like",
  cogs: "cost_like",
  payroll: "cost_like",
  facility_costs: "cost_like",
  vehicle_costs: "cost_like",
  sales_costs: "cost_like",
  admin_costs: "cost_like",
  depreciation: "cost_like",
  financial_costs: "cost_like",
  tax: "cost_like",
};

// ── Class → semantic source_field_id mapping ──

const CLASS_TO_FIELD_ID: Record<string, string> = {
  revenue: "omsaetning",
  cogs: "direkte_omkostninger",
  payroll: "loenninger",
  facility_costs: "lokaleomkostninger",
  vehicle_costs: "transportomkostninger",
  sales_costs: "salgsomkostninger",
  admin_costs: "administrationsomkostninger",
  depreciation: "afskrivninger",
  financial_costs: "finansielle_omkostninger",
  tax: "skat",
};

// ── Parse Danish number format ──

function parseDanishAmount(s: string): number | null {
  if (!s || s.trim() === "") return null;
  // Remove thousand separators (dots), replace decimal comma with dot
  const cleaned = s.trim().replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ── Classify a single line ──

interface ClassifiedLine {
  kontonr: number | null;
  kontonavn: string;
  rawAmount: number;
  cls: string;
  method: "label" | "range" | "unclassified";
  ambiguous: boolean;
  matchedClasses?: string[];
}

function classifyLine(kontonavn: string, kontonr: number | null): {
  cls: string;
  method: "label" | "range" | "unclassified";
  ambiguous: boolean;
  matchedClasses?: string[];
} {
  const label = kontonavn.toLowerCase().trim();

  // Primary: label matching — find ALL matching classes
  const matchedClasses: string[] = [];
  for (const [cls, patterns] of Object.entries(LABEL_CLASSES)) {
    for (const pattern of patterns) {
      if (label.includes(pattern)) {
        if (!matchedClasses.includes(cls)) matchedClasses.push(cls);
        break; // Don't double-count same class from multiple patterns
      }
    }
  }

  if (matchedClasses.length > 1) {
    console.log(
      `[Dinero] AMBIGUOUS label match for "${kontonavn}": ${matchedClasses.join(", ")} → unclassified`
    );
    return { cls: "unclassified", method: "unclassified", ambiguous: true, matchedClasses };
  }

  if (matchedClasses.length === 1) {
    return { cls: matchedClasses[0], method: "label", ambiguous: false };
  }

  // Secondary: range fallback
  if (kontonr != null) {
    for (const [cls, min, max] of RANGE_CLASSES) {
      if (kontonr >= min && kontonr <= max) {
        return { cls, method: "range", ambiguous: false };
      }
    }
  }

  return { cls: "unclassified", method: "unclassified", ambiguous: false };
}

// ── Indholdsreglen (10/9-2026): hvad der er en resultatlinje ──

/**
 * Skabelonens egen model for en resultatlinje: firecifret kontonummer
 * (RANGE_CLASSES dækker 1000–9999) og et beløb der kan læses. Samme regel som
 * extract() og extractSemanticFromCsv() bruger til at springe balancekonti over.
 */
function erResultatRaekke(kontonr: unknown, beloeb: unknown): boolean {
  const nr = String(kontonr ?? "").trim();
  return /^\d{4}$/.test(nr) && parseDanishAmount(String(beloeb ?? "")) != null;
}

/** Kontonavnet rammer mindst én af LABEL_CLASSES. */
function harKendtLabel(kontonavn: unknown): boolean {
  const label = String(kontonavn ?? "").toLowerCase().trim();
  if (!label) return false;
  return Object.values(LABEL_CLASSES).some((patterns) => patterns.some((p) => label.includes(p)));
}

/** «Balancelinje»: et kontonummer der ikke er firecifret, men et beløb der kan læses. */
function erBalanceRaekke(kontonrStr: string, rawAmount: number | null): boolean {
  return kontonrStr !== "" && !/^\d{4}$/.test(kontonrStr) && rawAmount != null;
}

// ── Template ──

export const dkDineroResultatopgoerelseCsvV1: SemanticCsvTemplateEntry = {
  template_id: "DK_DINERO_RESULTATOPGOERELSE_V1",
  label: "Dinero Resultatopgørelse CSV",
  supported_file_types: ["csv"],
  statement_type: "pnl",

  detect(ctx: DetectionContext): number {
    if (ctx.fileType !== "csv") return 0;

    let score = 0;

    // ── Structural CSV detection (preferred when csvHeaders available) ──
    if (ctx.csvHeaders && ctx.csvHeaders.length > 0) {
      // Hard requirement: headers must match exactly
      const headersMatch =
        ctx.csvHeaders.length >= 3 &&
        ctx.csvHeaders[0]?.trim() === "Konto" &&
        ctx.csvHeaders[1]?.trim() === "Kontonavn" &&
        ctx.csvHeaders[2]?.trim() === "Beløb";
      if (!headersMatch) return 0;
      score += 40;

      // Delimiter evidence
      if (ctx.csvDelimiter === ";") score += 10;

      // INDHOLDET afgør, ikke filnavnet (10/9-2026, filhovedet): mindst tre
      // resultatlinjer — firecifret kontonummer og et beløb. headerRows er
      // CSV'ens datarækker (buildCsvDetectionContext).
      const pnlRows = (ctx.headerRows || []).filter((row) => erResultatRaekke(row?.[0], row?.[2]));
      if (pnlRows.length >= 3) score += 20;

      // Label recognition — kun blandt resultatlinjerne, så balancekonti
      // (fx «Skyldig A-skat») ikke tæller som løn.
      const recognizedCount = pnlRows.filter((row) => harKendtLabel(row?.[1])).length;
      if (recognizedCount >= 5) score += 15;

      return score; // loft 85: 40 + 10 + 20 + 15
    }

    // ── Legacy raw-text detection (for non-migrated callers) ──
    const text = ctx.rawText;
    if (!text) return 0;

    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, ""));

    // Hard requirement: header must match exactly
    const headerLine = lines[0]?.trim();
    if (headerLine !== "Konto;Kontonavn;Beløb") return 0;
    score += 40;

    // Semicolon separator in >= 3 data lines
    const semiLines = lines.slice(1).filter((l) => l.includes(";")).length;
    if (semiLines >= 3) score += 10;

    // INDHOLDET afgør, ikke filnavnet (10/9-2026, filhovedet): samme regel
    // som den strukturelle vej ovenfor.
    const pnlLines = lines
      .slice(1)
      .map((l) => l.split(";"))
      .filter((parts) => parts.length >= 3 && erResultatRaekke(parts[0], parts[2]));
    if (pnlLines.length >= 3) score += 20;

    // Label recognition — kun blandt resultatlinjerne
    const recognizedCount = pnlLines.filter((parts) => harKendtLabel(parts[1])).length;
    if (recognizedCount >= 5) score += 15;

    return score; // loft 85: 40 + 10 + 20 + 15
  },

  extract(
    ctx: ExtractionContext
  ): { success: true; data: DeterministicExtractedData } | { success: false; error: string } {
    const text = ctx.rawText;
    if (!text) return { success: false, error: "No CSV text content" };

    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, ""));

    // Skip header
    const dataLines = lines.slice(1).filter((l) => l.trim().length > 0);

    // Parse and classify each line
    const classified: ClassifiedLine[] = [];
    let ambiguousCount = 0;
    let balanceSkipped = 0; // balancekonti (ikke-firecifret kontonr) — springes over

    for (const line of dataLines) {
      const parts = line.split(";");
      if (parts.length < 3) continue;

      const kontonrStr = parts[0]?.trim() || "";
      const kontonavn = parts[1]?.trim() || "";
      const amountStr = parts[2]?.trim() || "";

      const kontonr = /^\d{4}$/.test(kontonrStr) ? parseInt(kontonrStr) : null;
      const rawAmount = parseDanishAmount(amountStr);

      if (erBalanceRaekke(kontonrStr, rawAmount)) balanceSkipped++;
      if (kontonr == null || rawAmount == null) continue;

      const classification = classifyLine(kontonavn, kontonr);
      if (classification.ambiguous) ambiguousCount++;

      classified.push({
        kontonr,
        kontonavn,
        rawAmount,
        ...classification,
      });
    }

    console.log(
      `[Dinero] Parsed ${classified.length} lines, ${ambiguousCount} ambiguous, ${balanceSkipped} balance lines skipped`
    );

    // Structural fail: less than 3 valid account lines
    if (classified.length < 3) {
      return { success: false, error: `Only ${classified.length} valid lines (minimum 3)` };
    }

    // ── Sign convention check ──
    const revenueLines = classified.filter((l) => l.cls === "revenue");
    const nonZeroRevenue = revenueLines.filter((l) => l.rawAmount !== 0);
    let signConventionOk = true;

    if (nonZeroRevenue.length > 0) {
      const hasNegativeRevenue = nonZeroRevenue.some((l) => l.rawAmount < 0);
      if (!hasNegativeRevenue) {
        signConventionOk = false;
        console.log("[Dinero] Sign convention FAIL: no negative revenue found");
      }
    }
    // If all revenue is 0, skip convention check (no revenue this period)

    // ── Fordelingen (kontogrupper.ts): netto med fortegn, kredit-netto → indtægt, alt tæller ──
    const fordeling = fordelKontogrupper(
      classified.map((l) => ({ cls: l.cls, rawAmount: l.rawAmount, ambiguous: l.ambiguous })),
      "CREDIT",
    );

    // Track which ambiguous lines could have affected specific classes
    const ambiguousClasses = new Set<string>();
    for (const line of classified) {
      if (line.ambiguous && line.matchedClasses) {
        for (const c of line.matchedClasses) ambiguousClasses.add(c);
      }
    }

    // Track defaulted-to-zero fields and their reason
    const defaultedFields: { field: string; reason: "absent" | "ambiguous_conflict" }[] = [];

    const revenue = fordeling.revenue;
    const cogs = fordeling.omkostninger.cogs ?? null;
    const grossProfit = fordeling.grossProfit;

    // ── Depreciation / financial costs: 0 når ingen linje matcher; tvetydighed markeres (beløbet
    // ligger i øvrige omkostninger og tæller i ebt — før blev ebt null) ──
    const depreciationUnsure = fordeling.antal.depreciation == null && ambiguousClasses.has("depreciation");
    if (fordeling.antal.depreciation == null && !depreciationUnsure) {
      defaultedFields.push({ field: "depreciation", reason: "absent" });
      console.log("[Dinero] depreciation missing → assumed 0 (no matching lines, no ambiguity)");
    }
    const financialCostsUnsure = fordeling.antal.financial_costs == null && ambiguousClasses.has("financial_costs");
    if (fordeling.antal.financial_costs == null && !financialCostsUnsure) {
      defaultedFields.push({ field: "financial_costs", reason: "absent" });
      console.log("[Dinero] financial_costs missing → assumed 0 (no matching lines, no ambiguity)");
    }
    const depreciation = fordeling.omkostninger.depreciation ?? 0;
    const financialCosts = fordeling.omkostninger.financial_costs ?? 0;
    const ebt = fordeling.ebt;

    // ── Build key_figures (Danish names for canonical engine mapping) ──
    const keyFigures: Record<string, number | null> = keyFiguresAf(fordeling);

    // ── Build line_items ──
    const lineItems = classified.map((line) => ({
      name: line.kontonavn,
      period_amount:
        line.cls === "revenue" ? Math.abs(line.rawAmount) : Math.abs(line.rawAmount),
      ytd_amount: null as number | null,
      raw_sign: line.rawAmount < 0 ? "MINUS" : line.rawAmount > 0 ? "PLUS" : "ZERO",
      account_no: line.kontonr?.toString() || null,
      class: CLASS_TO_LINE_CLASS[line.cls] || "UKLASSIFICERET",
    }));

    // ── Validation checks ──
    const checks: ParserValidation["checks"] = [];

    // 1. Revenue present
    checks.push({
      name: "revenue_present",
      result: revenue != null && revenue > 0 ? "PASS" : "FAIL",
      details:
        revenue != null
          ? `Revenue: ${revenue.toFixed(2)}`
          : "No revenue lines found",
    });

    // 2. Sign convention
    checks.push({
      name: "sign_convention",
      result: signConventionOk ? "PASS" : "FAIL",
      details: signConventionOk
        ? "Bookkeeping convention confirmed (negative revenue)"
        : "Sign convention unclear: no negative revenue found",
    });

    // 3. Gross profit sum
    if (revenue != null && cogs != null && grossProfit != null) {
      const diff = Math.abs(revenue - cogs - grossProfit);
      checks.push({
        name: "gross_profit_sum",
        result: diff <= 2 ? "PASS" : "FAIL",
        details: `${revenue} - ${cogs} = ${grossProfit} (diff: ${diff.toFixed(2)})`,
      });
    } else {
      checks.push({
        name: "gross_profit_sum",
        result: "SKIP",
        details: "Missing revenue or cogs",
      });
    }

    // 4. Depreciation status
    checks.push({
      name: "depreciation_present",
      result: depreciationUnsure ? "FAIL" : "PASS",
      details: depreciationUnsure
        ? "UNSURE: depreciation ambiguous due to label conflict → counted in other_costs"
        : depreciation === 0 && defaultedFields.some(f => f.field === "depreciation")
          ? "assumed 0 — no depreciation lines found, no ambiguity"
          : `Depreciation: ${depreciation?.toFixed(2)}`,
    });

    // 5. Financial costs status
    checks.push({
      name: "financial_costs_present",
      result: financialCostsUnsure ? "FAIL" : "PASS",
      details: financialCostsUnsure
        ? "UNSURE: financial_costs ambiguous due to label conflict → counted in other_costs"
        : financialCosts === 0 && defaultedFields.some(f => f.field === "financial_costs")
          ? "assumed 0 — no financial cost lines found, no ambiguity"
          : `Financial costs: ${financialCosts?.toFixed(2)}`,
    });

    // 6. EBT present
    checks.push({
      name: "ebt_present",
      result: ebt != null ? "PASS" : "FAIL",
      details:
        ebt != null
          ? `EBT: ${ebt.toFixed(2)}`
          : "EBT is null (missing revenue or cogs)",
    });

    // 6b. Kontrolsum: hver linje tæller én gang (kontogrupper.ts — 0 pr. konstruktion, se filhovedet dér)
    checks.push(kontrolsumTjek(fordeling));

    // 7. Ambiguous lines — warning, not blocking unless affecting core derived metrics
    const ambiguityAffectsCore = depreciationUnsure || financialCostsUnsure;
    checks.push({
      name: "ambiguous_lines",
      result: ambiguityAffectsCore ? "FAIL" : (ambiguousCount > 0 ? "PASS" : "PASS"),
      details:
        ambiguousCount === 0
          ? "No ambiguous label matches"
          : ambiguityAffectsCore
            ? `${ambiguousCount} ambiguous lines affecting core metrics (depreciation/financial_costs) → FAIL (amounts counted in other_costs)`
            : `${ambiguousCount} ambiguous lines (non-core only) → accepted, counted in other_costs`,
    });

    // 9. Balancelinjer sprunget over (saldobalance læst som sin resultatopgørelse) — kun når der var nogen
    if (balanceSkipped > 0) {
      checks.push({
        name: "balance_lines_skipped",
        result: "PASS",
        details: `${balanceSkipped} linjer med ikke-firecifret kontonummer sprunget over (balancekonti)`,
      });
    }

    // 8. Defaulted fields summary
    if (defaultedFields.length > 0) {
      checks.push({
        name: "defaulted_fields",
        result: "PASS",
        details: defaultedFields.map(f => `${f.field}: ${f.reason}`).join("; "),
      });
    }

    const parserStatus =
      checks.some((c) => c.result === "FAIL") ? "FAIL" : "PASS";
    const parserErrors = checks
      .filter((c) => c.result === "FAIL")
      .map((c) => `${c.name}: ${c.details}`);

    const validation: ParserValidation = {
      parser_status: parserStatus as "PASS" | "FAIL",
      checks,
    };

    // ── Build output ──
    const data: DeterministicExtractedData = {
      report_type: "resultatopgørelse",
      company_name: null, // Not available in Dinero CSV
      cvr_number: null,
      period_start: null,
      period_end: null,
      report_period: null,
      key_figures: keyFigures,
      line_items: lineItems,
      validation,
      _deterministic_meta: {
        template_id: "DK_DINERO_RESULTATOPGOERELSE_V1",
        parser_confidence: parserStatus === "PASS" ? "HIGH" : "MEDIUM",
        detection_score: 0, // Set by registry
        parser_validation_status: parserStatus as "PASS" | "FAIL",
        parser_validation_errors: parserErrors,
        raw_line_count: classified.length,
        normalized_line_count: classified.length, // alle linjer tæller (uklassificerede → other_costs)
        column_basis_rule: "single",
      },
    };

    return { success: true, data };
  },

  // ── Phase 7: Semantic CSV Extraction (structural-first) ──
  extractSemanticFromCsv(csvResult: CsvParseResult): SemanticExtractionResult | null {
    // Consume CsvParseResult only — no raw csvText parsing
    if (csvResult.total_rows < 3) return null;

    // Verify expected structure: 3 columns (Konto, Kontonavn, Beløb)
    if (csvResult.headers.length < 3) {
      console.log("[Dinero Semantic CSV] Insufficient columns → reject");
      return null;
    }

    // ── Parse and classify each row from structural model ──
    const classified: ClassifiedLine[] = [];
    let ambiguousCount = 0;
    let balanceSkipped = 0; // balancekonti (ikke-firecifret kontonr) — springes over

    for (const row of csvResult.rows) {
      if (row.cells.length < 3) continue;

      const kontonrStr = row.cells[0].raw_value.trim();
      const kontonavn = row.cells[1].raw_value.trim();
      const amountStr = row.cells[2].raw_value.trim();

      const kontonr = /^\d{4}$/.test(kontonrStr) ? parseInt(kontonrStr) : null;
      const rawAmount = parseDanishAmount(amountStr);

      if (erBalanceRaekke(kontonrStr, rawAmount)) balanceSkipped++;
      if (kontonr == null || rawAmount == null) continue;

      const classification = classifyLine(kontonavn, kontonr);
      if (classification.ambiguous) ambiguousCount++;

      classified.push({
        kontonr,
        kontonavn,
        rawAmount,
        ...classification,
      });
    }

    console.log(`[Dinero Semantic CSV] Parsed ${classified.length} lines, ${ambiguousCount} ambiguous, ${balanceSkipped} balance lines skipped`);

    if (classified.length < 3) {
      console.log("[Dinero Semantic CSV] Insufficient valid lines → reject");
      return null;
    }

    // ── Fordelingen (kontogrupper.ts) — samme dom som legacy-vejen ──
    const fordeling: GruppeFordeling = fordelKontogrupper(
      classified.map((l) => ({ cls: l.cls, rawAmount: l.rawAmount, ambiguous: l.ambiguous })),
      "CREDIT",
    );
    const sums = fordeling.netto;
    const counts = fordeling.antal;

    // ── Sign convention evidence ──
    const revenueLines = classified.filter((l) => l.cls === "revenue");
    const nonZeroRevenue = revenueLines.filter((l) => l.rawAmount !== 0);
    const hasNegativeRevenue = nonZeroRevenue.some((l) => l.rawAmount < 0);

    const metricCandidates: SemanticMetricCandidate[] = [];
    const confidence = ambiguousCount > 0 ? "MEDIUM" : "HIGH";
    const kandidat = (
      fieldId: string,
      family: MetricFamily,
      value: number,
      signConvention: "credit" | "business",
      label: string,
      evidence: string[],
    ): SemanticMetricCandidate => ({
      source_field_id: fieldId,
      normalization_family: family,
      raw_value: value,
      raw_sign: value < 0 ? "negative" : value > 0 ? "positive" : "zero",
      sign_convention: signConvention,
      source_label: label,
      source_row_index: null,
      source_column_slot: 2, // Beløb column
      source_cell_address: null,
      basis: "period",
      confidence,
      evidence,
      proposed_canonical_target: null, // Advisory only, NOT used
    });

    // Omsætningen: rå kredit-netto (negativ) — profilen vender (revenue_like NEGATE).
    if (counts.revenue != null) {
      metricCandidates.push(kandidat("omsaetning", "revenue_like", -sums.revenue, "credit",
        `revenue (aggregated ${counts.revenue} lines)`, [`${counts.revenue} lines classified as revenue`]));
    }
    // Skat: rå kredit-netto (positiv omkostning) — profilen abs'er ikke længere; KEEP på cost_like.
    if (counts.tax != null) {
      metricCandidates.push(kandidat("skat", "cost_like", -sums.tax, "credit",
        `tax (aggregated ${counts.tax} lines)`, [`${counts.tax} lines classified as tax`]));
    }
    // Omkostningsgrupperne: den POSITIVE del, markeret «business» (fordelingen har allerede vendt
    // fortegnet — motorens tjek 17 kræver at den ikke vendes igen). Kredit-netto → 0 her og
    // beløbet i andre_driftsindtaegter / finansielle_indtaegter nedenfor.
    for (const [cls, value] of Object.entries(fordeling.omkostninger)) {
      const fieldId = cls === OEVRIGE_CLS ? "oevrige_omkostninger" : CLASS_TO_FIELD_ID[cls];
      if (!fieldId) continue;
      const flyttet = fordeling.kreditKlasser.includes(cls);
      metricCandidates.push(kandidat(fieldId, "cost_like", value, "business",
        `${cls} (aggregated ${counts[cls]} lines${flyttet ? ", credit net → income" : ""})`,
        [`${counts[cls]} lines classified as ${cls}`, ...(flyttet ? [`net ${sums[cls].toFixed(2)} is a credit → 0 here, amount in income`] : [])]));
    }
    if (fordeling.andreDriftsindtaegter > 0) {
      metricCandidates.push(kandidat("andre_driftsindtaegter", "revenue_like", fordeling.andreDriftsindtaegter, "business",
        "other operating income (credit net of cost groups)", [`credit groups: ${fordeling.kreditKlasser.filter((k) => k !== "financial_costs").join(", ")}`]));
    }
    if (fordeling.finansielleIndtaegter > 0) {
      metricCandidates.push(kandidat("finansielle_indtaegter", "revenue_like", fordeling.finansielleIndtaegter, "business",
        "financial income (credit net of financial_costs class)", ["financial_costs class net is a credit"]));
    }
    // Resultat efter skat: motoren afleder net_result af ebt KUN når ingen skat-kandidat findes (skat har
    // ingen kanonisk nøgle). Med skattelinjer regnede den semantiske vej derfor aldrig net_result (målt
    // 17/9, legacy-vejen gjorde) — her udstedes fordelingens net (ebt − skat) som skabelon-afledt (business,
    // profilens feltregel KEEP), præcis som saldobalance-XLSX'en udsteder sit resultat.
    if (counts.tax != null && fordeling.netResult != null) {
      metricCandidates.push(kandidat("resultat_efter_skat", "profit_like", fordeling.netResult, "business",
        "net result (ebt − tax, derived in template)", [`ebt ${fordeling.ebt} − tax ${fordeling.skat}`]));
    }

    // ── Default-zero candidates for absent non-ambiguous fields ──
    // Matches legacy behavior: if no lines classified as depreciation/financial_costs
    // AND no ambiguity affecting those classes, emit raw_value=0 so derivations work.
    const ambiguousClasses = new Set<string>();
    for (const line of classified) {
      if (line.ambiguous && line.matchedClasses) {
        for (const c of line.matchedClasses) ambiguousClasses.add(c);
      }
    }

    const defaultZeroClasses = ["depreciation", "financial_costs"];
    for (const cls of defaultZeroClasses) {
      if (counts[cls] == null && !ambiguousClasses.has(cls)) {
        const fieldId = CLASS_TO_FIELD_ID[cls];
        const family = CLASS_TO_FAMILY[cls];
        if (fieldId && family) {
          metricCandidates.push({
            source_field_id: fieldId,
            normalization_family: family,
            raw_value: 0,
            raw_sign: "zero",
            sign_convention: "business",
            source_label: `${cls} (defaulted to 0 — no matching lines, no ambiguity)`,
            source_row_index: null,
            source_column_slot: null,
            source_cell_address: null,
            basis: "period",
            confidence: "HIGH",
            evidence: [`${cls} absent, no ambiguity → default 0`],
            proposed_canonical_target: null,
          });
        }
      }
    }

    // ── Build SemanticLineItems ──
    const lineItems: SemanticLineItem[] = classified.map((line) => ({
      source_field_id: `acct_${line.kontonr}`,
      source_label: line.kontonavn,
      raw_value: line.rawAmount, // Document sign preserved
      basis: "period" as const,
      account_no: line.kontonr?.toString() || null,
      source_row_index: null,
    }));

    // ── Validation checks ──
    const checks: SemanticExtractionResult["parser_validation"]["checks"] = [];

    checks.push({
      name: "revenue_present",
      result: sums.revenue != null ? "PASS" : "FAIL",
      details: sums.revenue != null ? `Revenue raw sum: ${sums.revenue}` : "No revenue lines",
    });

    checks.push({
      name: "sign_convention",
      result: hasNegativeRevenue ? "PASS" : nonZeroRevenue.length === 0 ? "SKIP" : "FAIL",
      details: hasNegativeRevenue
        ? "Credit convention confirmed (negative revenue)"
        : nonZeroRevenue.length === 0
          ? "No non-zero revenue lines"
          : "No negative revenue found — unexpected for Dinero credit convention",
    });

    checks.push({
      name: "minimum_classes",
      result: Object.keys(sums).length >= 3 ? "PASS" : "FAIL",
      details: `${Object.keys(sums).length} classes found`,
    });

    checks.push(kontrolsumTjek(fordeling));

    if (balanceSkipped > 0) {
      checks.push({
        name: "balance_lines_skipped",
        result: "PASS",
        details: `${balanceSkipped} linjer med ikke-firecifret kontonummer sprunget over (balancekonti)`,
      });
    }

    const parserStatus = checks.some(c => c.result === "FAIL") ? "FAIL" as const : "PASS" as const;

    return {
      source_system: "dinero",
      document_type: "resultatopgoerelse",
      template_id: "DK_DINERO_RESULTATOPGOERELSE_V1",
      sign_convention: "credit",
      normalization_profile_id: "dinero_pnl_credit_v1",

      company_name: null,
      cvr: null,
      period_start: null,
      period_end: null,
      report_period_label: null,

      metric_candidates: metricCandidates,
      line_items: lineItems,
      basis_profile: {
        mode: "single",
        selected_period_basis: "period",
      },
      parser_validation: {
        parser_status: parserStatus,
        checks,
      },
      _deterministic_meta: {
        template_id: "DK_DINERO_RESULTATOPGOERELSE_V1",
        parser_confidence: parserStatus === "PASS" ? "HIGH" : "MEDIUM",
        detection_score: 0, // Set by registry
        raw_line_count: classified.length,
        normalized_line_count: classified.length, // alle linjer tæller (uklassificerede → other_costs)
        column_basis_rule: "single",
      },
    };
  },
};
