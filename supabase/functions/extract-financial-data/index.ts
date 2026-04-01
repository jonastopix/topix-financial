import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCanonicalOutput, buildCanonicalFromSemantic } from "../_shared/canonicalEngine.ts";
import { tryDeterministicExtraction, tryDeterministicPdfExtraction, tryDeterministicCsvExtraction, tryDeterministicPdfStructuralExtraction, trySemanticExcelExtraction, trySemanticCsvExtraction, type DeterministicExtractionResult } from "../_shared/templateRegistry.ts";
import { detectSourceSystem, isAiAllowed, type SourceFingerprint } from "../_shared/sourceFingerprint.ts";
import { validatePdfStructuralPayload, computeSha256Deno } from "../_shared/pdfStructuralValidator.ts";
import type { PdfStructuralPayload } from "../_shared/pdfStructuralTypes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Server-side metadata extraction (override AI hallucinations) ─────────────
const DANISH_MONTHS: Record<string, string> = {
  "01": "Januar", "02": "Februar", "03": "Marts", "04": "April",
  "05": "Maj", "06": "Juni", "07": "Juli", "08": "August",
  "09": "September", "10": "Oktober", "11": "November", "12": "December",
};

const DANISH_MONTH_NAMES: Record<string, string> = {
  "januar": "01", "februar": "02", "marts": "03", "april": "04",
  "maj": "05", "juni": "06", "juli": "07", "august": "08",
  "september": "09", "oktober": "10", "november": "11", "december": "12",
  "jan": "01", "feb": "02", "mar": "03", "apr": "04",
  "jun": "06", "jul": "07", "aug": "08", "sep": "09",
  "okt": "10", "nov": "11", "dec": "12",
};

function extractPeriodFromText(text: string): string | null {
  // Strip "Hentet:" lines to prevent fetch timestamps from matching
  const cleanedText = text.replace(/^Hentet:.*$/gm, "");

  // Pattern 0 (highest priority): "Saldobalance pr.: 31/01-2026" or "Saldobalance pr. 31.01.26"
  const prMatch = cleanedText.match(/Saldobalance\s+pr\.?:?\s*\d{2}[.\/\-](\d{2})[.\/\-](\d{2,4})/i);
  if (prMatch) {
    let endYear = prMatch[2];
    if (endYear.length === 2) endYear = (parseInt(endYear) >= 50 ? "19" : "20") + endYear;
    const monthName = DANISH_MONTHS[prMatch[1]];
    if (monthName) return `${monthName} ${endYear}`;
  }

  // Pattern 1: "01.10.25 - 31.10.25" or "01-12-2025 til 31-12-2025" or "01/10/2025 - 31/10/2025"
  const dateRange = cleanedText.match(/(\d{2})[.\/-](\d{2})[.\/-](\d{2,4})\s*(?:[-–]|til)\s*\d{2}[.\/-](\d{2})[.\/-](\d{2,4})/);
  if (dateRange) {
    const endMonth = dateRange[4];
    let endYear = dateRange[5];
    if (endYear.length === 2) {
      endYear = (parseInt(endYear) >= 50 ? "19" : "20") + endYear;
    }
    const monthName = DANISH_MONTHS[endMonth];
    if (monthName) return `${monthName} ${endYear}`;
  }

  // Pattern 1.5: Multi-period column headers (e.g. "| Januar | Februar | År til dato |")
  // Detects Danish month names as column headers, excludes "År til dato",
  // and resolves the latest actual month column using nearby date rows.
  const multiPeriodResult = extractMultiPeriodColumn(cleanedText);
  if (multiPeriodResult) return multiPeriodResult;

  // Pattern 2: "Oktober 2025", "Okt 2025"
  const namedMonth = cleanedText.match(/\b(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|dec)\s+(\d{4})\b/i);
  if (namedMonth) {
    const monthNum = DANISH_MONTH_NAMES[namedMonth[1].toLowerCase()];
    if (monthNum) {
      const monthName = DANISH_MONTHS[monthNum];
      return `${monthName} ${namedMonth[2]}`;
    }
  }

  // Pattern 3: "10/2025" or "10-2025" — with negative lookbehind to skip DD-MM-YYYY dates
  const shortDate = cleanedText.match(/(?<!\d[.\/-])(\d{2})[\/\-](\d{4})\b/);
  if (shortDate) {
    const monthName = DANISH_MONTHS[shortDate[1]];
    if (monthName) return `${monthName} ${shortDate[2]}`;
  }

  return null;
}

/**
 * Detect multi-period saldobalance column headers like:
 *   | Januar | Februar | År til dato |
 *   | 01-01-2026 | 01-02-2026 | 01-01-2026 |
 *   | 31-01-2026 | 28-02-2026 | 28-02-2026 |
 *
 * Returns the latest actual month (excluding "År til dato") as "Month YYYY".
 */
function extractMultiPeriodColumn(text: string): string | null {
  const monthNames = [
    "januar", "februar", "marts", "april", "maj", "juni",
    "juli", "august", "september", "oktober", "november", "december",
  ];

  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();

    // Look for a line containing at least one Danish month name AND "år til dato"
    if (!/år\s+til\s+dato/i.test(lines[i])) continue;

    // Extract month names from this line (excluding "år til dato")
    const foundMonths: string[] = [];
    for (const m of monthNames) {
      // Use word boundary to match month names in column headers
      if (new RegExp(`\\b${m}\\b`, "i").test(line)) {
        foundMonths.push(m);
      }
    }

    if (foundMonths.length === 0) continue;

    // The latest month in the header is the rightmost actual month column
    // Sort by month index to find the latest
    const latestMonth = foundMonths.reduce((a, b) => {
      return monthNames.indexOf(a) > monthNames.indexOf(b) ? a : b;
    });

    const latestMonthIdx = monthNames.indexOf(latestMonth);

    // Now find the year from nearby date rows (next 1-3 lines)
    // Look for DD-MM-YYYY patterns and find one matching the latest month
    let year: string | null = null;
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const dateMatches = lines[j].match(/(\d{2})-(\d{2})-(\d{4})/g);
      if (!dateMatches) continue;

      for (const dm of dateMatches) {
        const parts = dm.match(/(\d{2})-(\d{2})-(\d{4})/);
        if (parts) {
          const monthNum = parseInt(parts[2], 10);
          // Match end-of-month date row for the latest month column
          if (monthNum === latestMonthIdx + 1) {
            year = parts[3];
            break;
          }
        }
      }
      if (year) break;
    }

    if (year) {
      const monthKey = String(latestMonthIdx + 1).padStart(2, "0");
      const monthLabel = DANISH_MONTHS[monthKey];
      if (monthLabel) {
        console.log(`[extractPeriodFromText] Multi-period columns detected: ${foundMonths.join(", ")} + År til dato → selected "${monthLabel} ${year}"`);
        return `${monthLabel} ${year}`;
      }
    }
  }

  return null;
}

function extractCvrFromText(text: string): string | null {
  // Pattern 1: "CVR: 12345678" or "CVR 12345678" or "CVR-nr. 12345678"
  const cvrLabeled = text.match(/CVR[\s\-.:nNrR]*\s*(\d{8})\b/i);
  if (cvrLabeled) return cvrLabeled[1];

  // Pattern 2: 8-digit number after "SE" or "Reg" prefix
  const seLabeled = text.match(/\b(?:SE|Reg\.?\s*(?:nr\.?)?)\s*(\d{8})\b/i);
  if (seLabeled) return seLabeled[1];

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL ACCOUNTING ENGINE: Now in _shared/canonicalEngine.ts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns true only for PDF families where structural payload is architecturally required.
 * Currently: e-conomic resultatopgørelse PDF only.
 * Saldobalance, Dinero, and unknown PDFs are NOT structural-required.
 * This mirrors the frontend requiresStructuralPdfPayload() in FileUploadZone.tsx.
 */
export function requiresStructuralPdfPayload(
  fingerprint: SourceFingerprint | null,
  rawText: string
): boolean {
  // No fingerprint or not e-conomic → not required
  if (!fingerprint || fingerprint.source_system !== "economic") return false;
  // Saldobalance/balance exclusion (case-insensitive)
  if (/saldobalance/i.test(rawText)) return false;
  if (/\baktiver\b/i.test(rawText) || /\bpassiver\b/i.test(rawText)) return false;
  // e-conomic resultatopgørelse → required
  if (/resultatopg/i.test(rawText)) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE A1: V2 PERSIST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the DB update payload for early-exit paths (known-source failures).
 * V2 cohort: readable financial doc → processed/v2/quality_signals.
 * V1: existing error behavior.
 */
function getEarlyExitPersistPayload(
  isV2Cohort: boolean,
  extractionMethod: string,
  routingBranch: string,
  errors: string[],
  routingTrace: Record<string, any>,
): Record<string, any> {
  // ALWAYS return status="processed" with needs_manual_entry for known-source failures.
  // The user will be guided to enter data manually instead of seeing a dead-end error.
  return {
    extraction_method: extractionMethod,
    raw_extracted_data: { routing_trace: routingTrace },
    processed_at: new Date().toISOString(),
    status: "processed",
    extraction_contract_version: isV2Cohort ? "v2" : "v1",
    validation_status: "FAIL",
    validation_errors: errors,
    quality_signals: {
      needs_manual_entry: true,
      validation_status: "FAIL",
      validation_errors: errors,
      canonical_checks: [],
      ai_eligible: false,
      has_metrics: false,
      has_period: false,
      extraction_method: extractionMethod,
      routing_branch: routingBranch,
    },
  };
}

/**
 * Determine if a document is a readable financial document.
 * Known sources are always financial. Unknown sources are financial only
 * if extraction produced meaningful key_figures.
 * Known sources: always readable.
 * Unknown sources via AI fallback: require ≥4 non-zero metrics AND
 * at least one anchor metric (revenue, gross_profit, ebt) to prevent
 * AI-hallucinated metrics from classifying non-financial docs as financial.
 */
function isReadableFinancialDoc(
  sourceFingerprint: SourceFingerprint | null,
  extractedData: any,
  extractionMethod?: string,
  validationStatus?: string,
): boolean {
  // Known source system → always trust (validation is advisory for known sources)
  if (sourceFingerprint && sourceFingerprint.source_system !== "unknown") {
    return true;
  }
  if (!extractedData) return false;

  // For unknown sources with AI fallback: validation MUST pass.
  // AI can hallucinate plausible-looking metrics from non-financial documents,
  // so metric-count thresholds alone are insufficient. Only trust AI output
  // when the canonical validation pipeline independently confirms the data.
  if (!sourceFingerprint || sourceFingerprint.source_system === "unknown") {
    if (validationStatus !== "PASS") {
      console.log(`[isReadableFinancialDoc] Unknown source + validation=${validationStatus} → rejected (AI hallucination guard)`);
      return false;
    }
    return true;
  }

  // Fallback for any other case
  const kf = extractedData.key_figures || extractedData.metrics;
  if (!kf || typeof kf !== "object") return false;
  const numericValues = Object.values(kf).filter((v) => typeof v === "number" && v !== 0);
  return numericValues.length >= 2;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Parse request body ──
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Bad request: malformed JSON body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const { reportId, fileContent, pageImages, fileName, overwrite, knownCompanyName, excelBase64, pdfStructural } = body;

    // ── ACCESS CHECK: verify caller can access this report ──
    const callerId = claimsData.claims.sub;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (reportId !== undefined && reportId !== null) {
      // Validate reportId format
      if (typeof reportId !== 'string' || !uuidPattern.test(reportId)) {
        return new Response(JSON.stringify({ error: 'Bad request: invalid reportId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // RLS-scoped access check — uses caller's JWT, not service role
      const { data: accessCheck, error: accessError } = await authClient
        .from("financial_reports")
        .select("id")
        .eq("id", reportId)
        .maybeSingle();

      if (accessError) {
        console.error(`[extract-financial-data] Access check query error for report ${reportId} by user ${callerId}:`, accessError.message);
        return new Response(JSON.stringify({ error: 'Internal error during access check' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!accessCheck) {
        console.warn(`[extract-financial-data] Access denied: report=${reportId} caller=${callerId}`);
        return new Response(JSON.stringify({ error: 'Forbidden: no access to this report' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else if (overwrite) {
      // No reportId but overwrite requested — this requires persistence, which needs a reportId
      return new Response(JSON.stringify({ error: 'Bad request: overwrite requires a valid reportId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Debug logging for incoming content
    console.log(`[extract-financial-data] fileName: ${fileName}, fileContent length: ${fileContent?.length ?? 0}, pageImages: ${pageImages?.length ?? 0}, excelBase64: ${excelBase64?.length ?? 0}`);
    if (fileContent) {
      console.log(`[extract-financial-data] First 300 chars: ${fileContent.slice(0, 300)}`);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE A1: V2 SCOPED ROLLOUT RESOLUTION
    // ═══════════════════════════════════════════════════════════════════════════
    let isV2Cohort = false;
    let v2ReportCompanyId: string | null = null;
    {
      let rolloutConfig: any = null;
      try {
        const { data: configRow } = await supabase
          .from("app_config")
          .select("config_value")
          .eq("config_key", "extraction_v2_rollout")
          .maybeSingle();
        rolloutConfig = configRow?.config_value;
      } catch (e) {
        console.warn("[V2Rollout] Failed to read config, defaulting to V1:", e);
      }

      if (rolloutConfig?.enabled && reportId) {
        const { data: reportRow } = await supabase
          .from("financial_reports")
          .select("company_id")
          .eq("id", reportId)
          .single();

        v2ReportCompanyId = reportRow?.company_id ?? null;

        if (v2ReportCompanyId) {
          const scope = rolloutConfig.scope || {};
          const companyIds: string[] = scope.company_ids || [];
          const groupIds: string[] = scope.group_ids || [];
          const allCompanies: boolean = scope.all_companies || false;
          const reviewPathDeployed: boolean = rolloutConfig.review_path_deployed || false;

          // company_ids always works (for internal testing pre-A2)
          if (companyIds.includes(v2ReportCompanyId)) {
            isV2Cohort = true;
            console.log(`[V2Rollout] Company ${v2ReportCompanyId} in explicit company_ids → V2`);
          }
          // group_ids and all_companies only active when review_path_deployed = true
          else if (reviewPathDeployed) {
            if (allCompanies) {
              isV2Cohort = true;
              console.log(`[V2Rollout] all_companies=true + review_path_deployed → V2`);
            } else if (groupIds.length > 0) {
              const { data: groupMatch } = await supabase
                .from("group_companies")
                .select("group_id")
                .eq("company_id", v2ReportCompanyId)
                .in("group_id", groupIds)
                .limit(1);
              if (groupMatch && groupMatch.length > 0) {
                isV2Cohort = true;
                console.log(`[V2Rollout] Company ${v2ReportCompanyId} in group ${groupMatch[0].group_id} → V2`);
              }
            }
          }
        }
      }

      if (!isV2Cohort) {
        console.log(`[V2Rollout] Company ${v2ReportCompanyId || 'unknown'} → V1 (default)`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 4: DETERMINISTIC FIRST ROUTING
    // ═══════════════════════════════════════════════════════════════════════════
    
    const isExcelFile = fileName && (fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls'));
    const isPdfFile = fileName && fileName.toLowerCase().endsWith('.pdf');
    const isCsvFile = fileName && fileName.toLowerCase().endsWith('.csv');

    let extractedData: any = null;
    let rawAiOutput: any = null;
    let extractionMethod = "ai_extraction";
    let detResult: DeterministicExtractionResult | null = null;
    const routingTrace: Record<string, any> = {
      file_name: fileName || null,
      is_excel_file: !!isExcelFile,
      is_pdf_file: !!isPdfFile,
      is_csv_file: !!isCsvFile,
      excel_base64_length: excelBase64?.length ?? 0,
      file_content_length: fileContent?.length ?? 0,
      deterministic_attempted: false,
      deterministic_result: null,
      deterministic_template_id: null,
      deterministic_error: null,
      branch: null,
      source_fingerprint: null as SourceFingerprint | null,
      pdf_structural_received: !!pdfStructural,
      pdf_structural_validated: false,
      pdf_structural_hash_verified: false,
      pdf_structural_errors: null as string[] | null,
      v2_cohort: isV2Cohort,
    };

    // ── LAG -1: SOURCE FINGERPRINTING (gates AI fallback) ──
    // PHASE 8: Pass raw structural payload to fingerprinting for structural-first
    // account range detection. The payload is not yet hash-verified at this point,
    // but structural-based detection is used as a SIGNAL only (not for extraction).
    // This is safe because fingerprinting only reads token text/positions — no data trust.
    let sourceFingerprint: SourceFingerprint | null = null;
    {
      const fpFileType: "pdf" | "xlsx" | "csv" = isCsvFile ? "csv" : isPdfFile ? "pdf" : "xlsx";
      // For XLSX: try to parse header rows for fingerprinting
      let fpHeaderRows: any[][] | undefined;
      if (isExcelFile && excelBase64) {
        try {
          const binaryString = atob(excelBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
          const XLSX_MOD = await import("npm:xlsx@0.18.5");
          const wb = XLSX_MOD.read(bytes, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows: any[][] = XLSX_MOD.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
          fpHeaderRows = rows.slice(0, 10);
        } catch { /* fingerprinting is best-effort */ }
      }

      // Pass raw structural payload for structural-first fingerprinting (PDF only)
      const fpStructural = (isPdfFile && pdfStructural) ? pdfStructural as PdfStructuralPayload : undefined;

      sourceFingerprint = detectSourceSystem(
        fileName || "unknown",
        fpFileType,
        fileContent || undefined,
        fpHeaderRows,
        fpStructural,
      );
      routingTrace.source_fingerprint = sourceFingerprint;
      console.log(`[SourceFingerprint] system=${sourceFingerprint.source_system}, doc=${sourceFingerprint.document_type}, confidence=${sourceFingerprint.confidence}, ai_allowed=${isAiAllowed(sourceFingerprint)}`);
    }

    // ── LAG 0: TRY DETERMINISTIC EXTRACTION FIRST ──
    if (isExcelFile && excelBase64) {
      // ── SEMANTIC-FIRST XLSX ROUTING (Phase 6) ──
      console.log("[Routing] Attempting semantic-first Excel extraction...");
      const semanticXlsxResult = trySemanticExcelExtraction(excelBase64, fileName);
      if (semanticXlsxResult.type === "success") {
        routingTrace.deterministic_attempted = true;
        routingTrace.deterministic_result = "semantic_xlsx_success";
        routingTrace.deterministic_template_id = semanticXlsxResult.template_id;
        routingTrace.branch = "semantic_xlsx_success";
        extractionMethod = "deterministic_template";

        const canonicalFromSemantic = buildCanonicalFromSemantic(semanticXlsxResult.semantic);
        extractedData = {
          ...canonicalFromSemantic,
          _deterministic_meta: semanticXlsxResult.semantic._deterministic_meta,
        };
        rawAiOutput = {
          deterministic: true,
          semantic: true,
          template_id: semanticXlsxResult.template_id,
          routing_trace: routingTrace,
        };
        console.log(`[Routing] Semantic XLSX success: ${semanticXlsxResult.template_id}`);
      } else if (semanticXlsxResult.type === "semantic_fail") {
        // ── Phase 6b: Migrated template semantic_fail → hard fail for known sources ──
        if (sourceFingerprint && !isAiAllowed(sourceFingerprint)) {
          routingTrace.deterministic_attempted = true;
          routingTrace.deterministic_result = "semantic_xlsx_fail";
          routingTrace.deterministic_template_id = semanticXlsxResult.template_id;
          routingTrace.branch = "semantic_xlsx_hard_fail";
          routingTrace.deterministic_error = semanticXlsxResult.error;
          console.error(`[Routing] Semantic XLSX HARD FAIL for known source ${sourceFingerprint.source_system}: ${semanticXlsxResult.error}`);

          if (reportId) {
            const earlyExitErrors = [`Semantic XLSX extraction failed for known source ${sourceFingerprint.source_system}: ${semanticXlsxResult.error}`];
            await supabase
              .from("financial_reports")
              .update(getEarlyExitPersistPayload(isV2Cohort, "semantic_xlsx_fail", "semantic_xlsx_hard_fail", earlyExitErrors, routingTrace))
              .eq("id", reportId);
          }

          return new Response(
            JSON.stringify({
              error: "Semantic XLSX extraction failed",
              status: "semantic_xlsx_fail",
              source_system: sourceFingerprint.source_system,
              template_id: semanticXlsxResult.template_id,
              details: semanticXlsxResult.error,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Unknown source: fall back to legacy
        console.log(`[Routing] Semantic XLSX semantic_fail for unknown source, falling back to legacy deterministic...`);
        routingTrace.deterministic_attempted = true;
        detResult = await tryDeterministicExtraction(excelBase64, fileName);
      } else {
        // no_match or no_semantic_support: fall back to legacy
        console.log(`[Routing] Semantic XLSX ${semanticXlsxResult.type}, falling back to legacy deterministic...`);
        routingTrace.deterministic_attempted = true;
        detResult = await tryDeterministicExtraction(excelBase64, fileName);
      }
    } else if (isPdfFile && fileContent) {
      routingTrace.deterministic_attempted = true;

      // ── Family-specific structural requirement ──
      // Only e-conomic resultatopgørelse PDFs are structural-required.
      // Saldobalance/balance, Dinero, unknown PDFs are NOT structural-required.
      const structuralRequired = requiresStructuralPdfPayload(sourceFingerprint, fileContent);

      // ── STRUCTURAL PDF PAYLOAD VALIDATION & PERSISTENCE ──
      let validatedStructural: PdfStructuralPayload | null = null;
      if (pdfStructural) {
        const validationResult = validatePdfStructuralPayload(pdfStructural);
        routingTrace.pdf_structural_validated = validationResult.valid;
        routingTrace.pdf_structural_errors = validationResult.errors.length > 0 ? validationResult.errors : null;

        if (!validationResult.valid) {
          console.warn(`[PdfStructural] Validation failed: ${validationResult.errors.join("; ")}`);

          // ── TRUST MODEL: structural-required family + invalid structural = HARD FAIL ──
          if (structuralRequired) {
            routingTrace.branch = "structural_parse_fail_validation";
            console.error(`[PdfStructural] HARD FAIL: known source ${sourceFingerprint!.source_system} + invalid structural payload`);

            if (reportId) {
              const earlyExitErrors = [`Structural payload validation failed for known source ${sourceFingerprint!.source_system}: ${validationResult.errors.join("; ")}`];
              await supabase
                .from("financial_reports")
                .update(getEarlyExitPersistPayload(isV2Cohort, "structural_parse_fail", "structural_parse_fail_validation", earlyExitErrors, routingTrace))
                .eq("id", reportId);
            }

            return new Response(
              JSON.stringify({
                error: "Structural payload validation failed",
                status: "structural_parse_fail",
                source_system: sourceFingerprint!.source_system,
                details: validationResult.errors,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          // Unknown source: log warning, allow text fallback below
        } else {
          // ── Content hash verification against stored binary ──
          let hashVerified = false;
          let hashError: string | null = null;

          try {
            if (reportId) {
              const { data: report } = await supabase
                .from("financial_reports")
                .select("file_path")
                .eq("id", reportId)
                .single();

              if (report?.file_path) {
                const { data: fileData, error: dlError } = await supabase.storage
                  .from("financial-documents")
                  .download(report.file_path);

                if (!dlError && fileData) {
                  const storedBytes = new Uint8Array(await fileData.arrayBuffer());
                  const storedHash = await computeSha256Deno(storedBytes);
                  const payloadHash = (pdfStructural as PdfStructuralPayload).metadata.content_hash;

                  if (storedHash === payloadHash) {
                    hashVerified = true;
                    routingTrace.pdf_structural_hash_verified = true;
                    validatedStructural = pdfStructural as PdfStructuralPayload;
                    console.log(`[PdfStructural] Hash verified: ${storedHash.slice(0, 12)}...`);
                  } else {
                    hashError = `Content hash mismatch: stored=${storedHash.slice(0, 12)}... payload=${payloadHash.slice(0, 12)}...`;
                    console.error(`[PdfStructural] ${hashError}`);
                    routingTrace.pdf_structural_errors = [hashError];
                  }
                } else {
                  console.warn(`[PdfStructural] Could not download stored file for hash verification: ${dlError?.message}`);
                   // Race condition: file not yet propagated. Only allow for non-structural-required families.
                  if (!structuralRequired) {
                    validatedStructural = pdfStructural as PdfStructuralPayload;
                    routingTrace.pdf_structural_hash_verified = false;
                  } else {
                    hashError = `Could not verify hash for structural-required family: ${dlError?.message}`;
                    routingTrace.pdf_structural_errors = [hashError];
                  }
                }
              }
            }
          } catch (hashErr) {
            console.warn("[PdfStructural] Hash verification error:", hashErr);
            if (!structuralRequired) {
              validatedStructural = pdfStructural as PdfStructuralPayload;
              routingTrace.pdf_structural_hash_verified = false;
            } else {
              hashError = `Hash verification exception for structural-required family`;
              routingTrace.pdf_structural_errors = [hashError];
            }
          }

          // ── TRUST MODEL: structural-required family + hash mismatch/failure = HARD FAIL ──
          if (structuralRequired && !hashVerified) {
            routingTrace.branch = "structural_parse_fail_hash";
            console.error(`[PdfStructural] HARD FAIL: known source ${sourceFingerprint!.source_system} + hash verification failed`);

            if (reportId) {
              const earlyExitErrors = [`Structural payload hash verification failed for known source ${sourceFingerprint!.source_system}: ${hashError || "unknown"}`];
              await supabase
                .from("financial_reports")
                .update(getEarlyExitPersistPayload(isV2Cohort, "structural_parse_fail", "structural_parse_fail_hash", earlyExitErrors, routingTrace))
                .eq("id", reportId);
            }

            return new Response(
              JSON.stringify({
                error: "Structural payload hash verification failed",
                status: "structural_parse_fail",
                source_system: sourceFingerprint!.source_system,
                details: hashError,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Persist validated structural payload immediately if available
      if (validatedStructural && reportId) {
        try {
          await supabase
            .from("financial_reports")
            .update({
              raw_extracted_data: {
                pdf_structural_payload: validatedStructural,
                pdf_structural_validated_at: new Date().toISOString(),
                pdf_structural_version: "1.0",
                routing_trace: routingTrace,
              },
            })
            .eq("id", reportId);
          console.log(`[PdfStructural] Payload persisted for report ${reportId}`);
        } catch (persistErr) {
          console.warn("[PdfStructural] Persistence error:", persistErr);
        }
      }

      // ── STRUCTURAL-FIRST ROUTING (Phase 5) ──
      // When validatedStructural exists and template supports semantic extraction,
      // the structural path is MANDATORY — no text fallback in the same request.
      if (validatedStructural) {
        console.log("[Routing] Attempting structural-first PDF extraction...");
        const structResult = tryDeterministicPdfStructuralExtraction(validatedStructural, fileContent, fileName);
        routingTrace.deterministic_attempted = true;

        switch (structResult.type) {
          case "success": {
            routingTrace.deterministic_result = "structural_success";
            routingTrace.deterministic_template_id = structResult.template_id;
            routingTrace.branch = "deterministic_structural_success";
            extractionMethod = "deterministic_structural";

            // Build canonical output from semantic result
            const canonicalFromSemantic = buildCanonicalFromSemantic(structResult.semantic);
            extractedData = {
              ...canonicalFromSemantic,
              _deterministic_meta: structResult.semantic._deterministic_meta,
            };
            rawAiOutput = {
              deterministic: true,
              structural: true,
              template_id: structResult.template_id,
              routing_trace: routingTrace,
            };

            console.log(`[Routing] Structural-first success: ${structResult.template_id}`);
            break;
          }
          case "semantic_fail": {
            routingTrace.deterministic_result = "structural_semantic_fail";
            routingTrace.deterministic_template_id = structResult.template_id;
            routingTrace.deterministic_error = structResult.error;
            routingTrace.branch = "structural_semantic_fail";
            console.warn(`[Routing] Structural semantic extraction failed: ${structResult.error}`);

            // For structural-required families: this is a hard fail — no text fallback
            if (structuralRequired) {
              if (reportId) {
                const earlyExitErrors = [`Structural semantic extraction failed for ${structResult.template_id}: ${structResult.error}`];
                await supabase
                  .from("financial_reports")
                  .update(getEarlyExitPersistPayload(isV2Cohort, "structural_semantic_fail", "structural_semantic_fail", earlyExitErrors, routingTrace))
                  .eq("id", reportId);
              }

              return new Response(
                JSON.stringify({
                  error: "Structural semantic extraction failed",
                  template_id: structResult.template_id,
                  details: structResult.error,
                  status: "error",
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            // Unknown source: fall through to legacy text path below
            break;
          }
          case "no_semantic_support":
            // Template matched but doesn't support structural path yet — use legacy text path
            console.log("[Routing] Template matched but no semantic support, falling back to legacy text path");
            detResult = tryDeterministicPdfExtraction(fileContent, fileName);
            break;
          case "no_match":
            // No template matched — fall through to legacy text path
            console.log("[Routing] No template matched for structural extraction, trying legacy text path");
            detResult = tryDeterministicPdfExtraction(fileContent, fileName);
            break;
        }
      } else {
        // No structural payload — check if this family REQUIRES structural
        if (structuralRequired) {
          // Structural-required family MUST have structural payload — hard fail
          routingTrace.branch = "structural_payload_missing";
          console.error(`[Routing] HARD FAIL: Structural-required PDF family (${sourceFingerprint!.source_system}/${sourceFingerprint!.document_type}) requires structural payload but none was provided`);

          if (reportId) {
            const earlyExitErrors = [`Known PDF source ${sourceFingerprint!.source_system} requires structural payload — client-side extraction failed or was not sent`];
            await supabase
              .from("financial_reports")
              .update(getEarlyExitPersistPayload(isV2Cohort, "structural_payload_missing", "structural_payload_missing", earlyExitErrors, routingTrace))
              .eq("id", reportId);
          }

          return new Response(
            JSON.stringify({
              error: "Known PDF source requires structural payload",
              status: "structural_payload_missing",
              source_system: sourceFingerprint!.source_system,
              details: "Client-side PDF structural extraction failed or was not included in the request",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Non-structural-required family or unknown source — legacy text path allowed
        console.log("[Routing] No structural payload (non-structural-required family), attempting legacy deterministic PDF extraction...");
        detResult = tryDeterministicPdfExtraction(fileContent, fileName);
      }
    } else if (isCsvFile && fileContent) {
      // ── SEMANTIC-FIRST CSV ROUTING (Phase 7) ──
      console.log("[Routing] Attempting semantic-first CSV extraction...");
      const semanticCsvResult = trySemanticCsvExtraction(fileContent, fileName);
      if (semanticCsvResult.type === "success") {
        routingTrace.deterministic_attempted = true;
        routingTrace.deterministic_result = "semantic_csv_success";
        routingTrace.deterministic_template_id = semanticCsvResult.template_id;
        routingTrace.branch = "semantic_csv_success";
        extractionMethod = "deterministic_template";

        const canonicalFromSemantic = buildCanonicalFromSemantic(semanticCsvResult.semantic);
        extractedData = {
          ...canonicalFromSemantic,
          _deterministic_meta: semanticCsvResult.semantic._deterministic_meta,
        };
        rawAiOutput = {
          deterministic: true,
          semantic: true,
          template_id: semanticCsvResult.template_id,
          routing_trace: routingTrace,
        };
        console.log(`[Routing] Semantic CSV success: ${semanticCsvResult.template_id}`);
      } else if (semanticCsvResult.type === "semantic_fail") {
        // ── Phase 6b: Migrated template semantic_fail → hard fail for known sources ──
        if (sourceFingerprint && !isAiAllowed(sourceFingerprint)) {
          routingTrace.deterministic_attempted = true;
          routingTrace.deterministic_result = "semantic_csv_fail";
          routingTrace.deterministic_template_id = semanticCsvResult.template_id;
          routingTrace.branch = "semantic_csv_hard_fail";
          routingTrace.deterministic_error = semanticCsvResult.error;
          console.error(`[Routing] Semantic CSV HARD FAIL for known source ${sourceFingerprint.source_system}: ${semanticCsvResult.error}`);

          if (reportId) {
            const earlyExitErrors = [`Semantic CSV extraction failed for known source ${sourceFingerprint.source_system}: ${semanticCsvResult.error}`];
            await supabase
              .from("financial_reports")
              .update(getEarlyExitPersistPayload(isV2Cohort, "semantic_csv_fail", "semantic_csv_hard_fail", earlyExitErrors, routingTrace))
              .eq("id", reportId);
          }

          return new Response(
            JSON.stringify({
              error: "Semantic CSV extraction failed",
              status: "semantic_csv_fail",
              source_system: sourceFingerprint.source_system,
              template_id: semanticCsvResult.template_id,
              details: semanticCsvResult.error,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Unknown source: fall back to legacy
        console.log(`[Routing] Semantic CSV semantic_fail for unknown source, falling back to legacy deterministic...`);
        routingTrace.deterministic_attempted = true;
        detResult = tryDeterministicCsvExtraction(fileContent, fileName);
      } else {
        // no_match or no_semantic_support: fall back to legacy
        console.log(`[Routing] Semantic CSV ${semanticCsvResult.type}, falling back to legacy deterministic...`);
        routingTrace.deterministic_attempted = true;
        detResult = tryDeterministicCsvExtraction(fileContent, fileName);
      }
    }

    if (detResult) {
      switch (detResult.type) {
        case "success":
          routingTrace.deterministic_result = "success";
          routingTrace.deterministic_template_id = detResult.template_id;
          routingTrace.branch = "deterministic_success";
          extractedData = detResult.extractedData;
          rawAiOutput = { deterministic: true, template_id: detResult.template_id, routing_trace: routingTrace };
          extractionMethod = "deterministic_template";
          console.log(`[Routing] Deterministic success: ${detResult.template_id}`);
          break;

        case "structural_fail":
          routingTrace.deterministic_result = "structural_fail";
          routingTrace.deterministic_template_id = detResult.template_id;
          routingTrace.deterministic_error = detResult.error;
          routingTrace.branch = "deterministic_structural_fail";
          console.log(`[Routing] Structural failure for ${detResult.template_id}: ${detResult.error}`);
          extractionMethod = "deterministic_failed";

          if (reportId) {
            const earlyExitErrors = [`Deterministic parsing failed: ${detResult.error}`];
            await supabase
              .from("financial_reports")
              .update(getEarlyExitPersistPayload(isV2Cohort, extractionMethod, "deterministic_structural_fail", earlyExitErrors, routingTrace))
              .eq("id", reportId);
          }

          return new Response(
            JSON.stringify({
              error: "Deterministic parsing failed",
              template_id: detResult.template_id,
              details: detResult.error,
              status: "error",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );

        case "no_match":
          routingTrace.deterministic_result = "no_match";
          // ── KNOWN SOURCE + NO TEMPLATE = FAIL LOUD ──
          if (sourceFingerprint && !isAiAllowed(sourceFingerprint)) {
            routingTrace.branch = "known_source_unsupported_variant";
            console.log(`[Routing] Known source ${sourceFingerprint.source_system} but no template matched → FAIL LOUD (AI forbidden)`);

            if (reportId) {
              const earlyExitErrors = [`Known source ${sourceFingerprint.source_system} detected but no supported template matched. AI fallback is forbidden for known sources.`];
              await supabase
                .from("financial_reports")
                .update(getEarlyExitPersistPayload(isV2Cohort, "known_source_unsupported_variant", "known_source_unsupported_variant", earlyExitErrors, routingTrace))
                .eq("id", reportId);
            }

            return new Response(
              JSON.stringify({
                error: "Known source without supported template",
                source_system: sourceFingerprint.source_system,
                document_type: sourceFingerprint.document_type,
                status: "error",
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          routingTrace.branch = "ai_fallback_no_match";
          console.log("[Routing] No template match → AI extraction (unknown source, AI allowed)");
          break;
      }
    } else if (!routingTrace.branch) {
      // Only set fallback branch if no semantic/structural path already succeeded
      routingTrace.branch = "ai_fallback_not_attempted";
    }

    console.log(`[RoutingTrace] ${JSON.stringify(routingTrace)}`);

    // ── LAG 1: AI EXTRACTION (if deterministic didn't succeed) ──
    if (!extractedData) {
      // Final AI gate check
      if (sourceFingerprint && !isAiAllowed(sourceFingerprint)) {
        console.error(`[Routing] AI gate violation: source=${sourceFingerprint.source_system} should never reach AI path`);
        return new Response(
          JSON.stringify({ error: "Internal routing error: known source reached AI path", status: "error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[Routing] Using AI extraction path");
      
      // Company name instruction for AI
      const companyNameInstruction = knownCompanyName 
        ? `\n\nVIGTIGT: Virksomhedens navn er "${knownCompanyName}". Brug dette navn i company_name feltet.`
        : "";
      
      // Build AI prompt for extraction
      const systemPrompt = `Du er en erfaren CFO der læser danske finansielle rapporter fra bogføringssystemer som e-conomic, Dinero, Billy osv.${companyNameInstruction}

DIN ROLLE: Du aflæser tal PRÆCIST som de fremgår af dokumentet og normaliserer dem til en standardiseret format. Du opfinder ALDRIG tal.

═══════════════════════════════════════════════════
TRIN 1: IDENTIFICÉR RAPPORTTYPEN
═══════════════════════════════════════════════════
- "resultatopgørelse": Viser omsætning, omkostninger, bruttofortjeneste, resultat. Typisk fra e-conomic.
- "saldobalance": Viser kontonumre med debet/kredit-kolonner, balance-poster.
- Filnavnet "${fileName || ''}" kan give hint, men INDHOLDET bestemmer typen.
- Se også efter: "Resultat" (Billy), "Income Statement" (engelsk), 
  "Driftsregnskab" (revisorer), "P&L" — alle er resultatopgørelser
- "Trial Balance", "Råbalance", "Kontoplan med saldi" = saldobalance

═══════════════════════════════════════════════════
TRIN 2: FORSTÅ KOLONNE-STRUKTUREN
═══════════════════════════════════════════════════
Danske resultatopgørelser har typisk to til fire talkolonner.
Identificér kolonnestrukturen fra overskrifterne:

e-conomic (4 kolonner):
  Kolonne 1: "Perioden Faktisk" eller bare "Faktisk" — BRUG DENNE
  Kolonne 2: "Perioden Året før" — ignorer
  Kolonne 3: "År til dato Faktisk" — brug kun til _aar-felter
  Kolonne 4: "År til dato Året før" — ignorer

Billy (2-3 kolonner):
  Kolonne 1: "Periode" eller "Denne periode" — BRUG DENNE
  Kolonne 2: "År til dato" eller "Akkumuleret" — brug til _aar-felter
  Kolonne 3 (hvis til stede): "Foregående år" — ignorer

Visma / Uniconta (varierer):
  Se efter kolonner med månedsnavn ("Januar", "Februar" etc.) = periodekolonne
  Se efter "YTD", "År til dato" eller "Akkumuleret" = YTD-kolonne
  Brug altid den kolonne der svarer til den specifikke rapportperiode

Revisor-Excel (varierer):
  Ofte kun én kolonne med tal — brug den direkte
  Ignorer eventuelle budgetkolonner (typisk mærket "Budget" eller "Bud.")

KRITISK REGEL: Vælg ALTID kolonnen med den ENKLE MÅNEDS tal (ikke akkumuleret)
til periode-felterne. Hvis du er i tvivl — sæt validation.status = "UNSURE".

KOLONNE-TJEK: Inden du returnerer, verificér:
- Er omsætning for perioden rimelig for én måned? (typisk 50.000 - 5.000.000 DKK)
- Er tallene IKKE identiske med år-til-dato? (ellers har du valgt forkert kolonne)
- Giver omsætning - direkte_omk ≈ daekningsbidrag? (ellers forkert kolonne)

═══════════════════════════════════════════════════
TRIN 3: REGNSKABSKONVENTIONER FOR FORTEGN
═══════════════════════════════════════════════════
I dansk bogføring er fortegnskonventionen FORSKELLIG for saldobalancer og resultatopgørelser:

A) OMSÆTNING/INDTÆGTER:
   - I resultatopgørelser: typisk POSITIVE tal
   - I saldobalancer: typisk NEGATIVE tal (kreditside)
   - → RETURNÉR ALTID SOM POSITIVT TAL (brug absolutværdi)

B) OMKOSTNINGER (løn, varekøb, marketing, lokaler, admin, afskrivninger):
   - → RETURNÉR ALTID SOM POSITIVT TAL (brug absolutværdi)

   LOKALER (lokaler):
   - Inkludér ALT under "Lokaleomkostninger": husleje, el, vand, varme, rengøring
   - Selv hvis der kun er én linje under gruppen — medtag summen
   - Brug gruppesum-linjen "Lokaleomkostninger i alt" hvis den findes
   - Returnér 0 eksplicit hvis gruppen er tom — returnér ALDRIG null for denne post

C) DÆKNINGSBIDRAG:
   - I resultatopgørelser: POSITIVT = overskud, NEGATIVT = underskud
   - I saldobalancer: fortegnet er OMVENDT! NEGATIVT = overskud (kredit > debet), POSITIVT = underskud
   - → RETURNÉR I "NORMAL" KONVENTION: positivt = overskud, negativt = underskud
   - Dvs. for saldobalancer: VEND fortegnet (gang med -1)

D) RESULTAT (resultat_foer_skat, resultat_efter_skat, driftsresultat):
   - ⚠️ VIGTIGT: Fortegnskonventionen AFHÆNGER AF RAPPORTTYPEN ⚠️
   - I RESULTATOPGØRELSER: Aflæs DIREKTE — negativt = tab, positivt = overskud
   - I SALDOBALANCER: Fortegnet er OMVENDT! Negativt = OVERSKUD (kredit > debet), positivt = TAB
   - → RETURNÉR I "NORMAL" KONVENTION: positivt = overskud, negativt = tab
   - Dvs. for saldobalancer: VEND fortegnet (gang med -1)
   - Find linjen "Resultat før skat" eller "Resultat for skat" og aflæs PRÆCIST fra den korrekte kolonne

E) BALANCE-POSTER (aktiver, passiver, egenkapital, bank):
   - Aktiver: returnér som positive
   - Passiver/gæld: returnér som positive (selvom de står som negative/kredit)
   - Bank/likvider: BEHOLD ORIGINALT FORTEGN (negativt = overtræk/kassekredit)
   - Egenkapital: behold fortegn som det er (negativ egenkapital er mulig)

═══════════════════════════════════════════════════
TRIN 4: PERIODE vs. ÅR TIL DATO
═══════════════════════════════════════════════════
- Felter UDEN "_aar" = PERIODENS tal (én enkelt måned fra Kolonne 1)
- Felter MED "_aar" = År-til-dato tal (fra Kolonne 3)
- Hvis en post viser 0,00 i periodekolonnen, er værdien 0 — brug IKKE år-til-dato!

⚠️ VIGTIGT FOR SALDOBALANCER:
I en saldobalance er der to typer kolonner:
- RESULTATPOSTER (omsætning, omkostninger, resultat): Brug PERIODEN-kolonnen
- BALANCEPOSTER (aktiver, passiver, bank, debitorer, kreditorer, egenkapital): 
  Brug ÅR-TIL-DATO-kolonnen — ikke periodekolonnen!
  Begrundelse: Periodekolonnen viser kun månedens bevægelse, ikke den samlede saldo.
  Eksempel: Debitorer 50.000 i periode betyder at debitor STEG med 50.000 den måned.
  Debitorer 300.000 i år-til-dato er den faktiske saldo vi vil have.

═══════════════════════════════════════════════════
TRIN 5: RAPPORTPERIODE
═══════════════════════════════════════════════════
- Skriv som "December 2025", "Oktober 2025" osv.
- Bestem ud fra datoer i dokumenthovedet (f.eks. "01.12.25 - 31.12.25" = December 2025)

═══════════════════════════════════════════════════
TRIN 6: DANSK TALFORMAT
═══════════════════════════════════════════════════
Dokumenter bruger dansk talformat:
- Tusindtalsseparator: "." (punkt) — f.eks. 1.234.567
- Decimalseparator: "," (komma) — f.eks. 1.234,56
- Negative tal kan angives med minus "-1.234,56" ELLER parenteser "(1.234,56)"
- Parenteser = negativt tal: (1.234,56) = -1234.56
- Returnér som rene tal UDEN tusindtalsseparatorer: 1234567.89 (brug punktum som decimalseparator i output).

═══════════════════════════════════════════════════
TRIN 7: LINE_ITEMS MED KLASSIFICERING
═══════════════════════════════════════════════════
Medtag de 15-25 vigtigste poster. For HVER linje:
- name: postens navn som det fremgår
- period_amount: PERIODENS tal (behold originalt fortegn)
- ytd_amount: ÅR-TIL-DATO tal (behold originalt fortegn)
- raw_sign: "PLUS" hvis tallet er positivt i dokumentet, "MINUS" hvis negativt
- account_no: kontonummer hvis det fremgår, ellers null
- class: klassificér posten som én af:
  REVENUE, COGS, OPEX, DEPR, FIN_INCOME, FIN_EXPENSE, TAX, ASSET, LIABILITY, EQUITY
  Hvis du er usikker → sæt class til "UKLASSIFICERET"

═══════════════════════════════════════════════════
TRIN 8: VALIDERING (KØR INDEN DU RETURNERER)
═══════════════════════════════════════════════════
Før du kalder funktionen, kør disse checks og rapportér i validation-objektet:

1. daekningsbidrag_sum: Tjek at omsaetning - direkte_omkostninger ≈ daekningsbidrag (tolerance 2 kr.)
2. resultat_consistency: Tjek at resultat_foer_skat ≤ daekningsbidrag (i en resultatopgørelse)
3. balance_equation: Tjek at aktiver_i_alt ≈ passiver_i_alt (kun saldobalance, tolerance 2 kr.)

Sæt validation.status til:
- "PASS" hvis alle relevante checks bestod
- "FAIL" hvis mindst ét check fejlede
- "UNSURE" hvis du er i tvivl om et tals korrekthed

4. saldobalance_kolonne_check: For saldobalancer: check at bank, debitorer og kreditorer er hentet fra 
   ÅR-TIL-DATO kolonnen, ikke periodekolonnen. Balanceposter ændrer sig ikke
   med 50-100% fra måned til måned — hvis de gør, er det sandsynligvis 
   periodekolonnen der er brugt fejlagtigt.

Hvis du er i tvivl om et tal eller en kolonne → sæt validation.status = "UNSURE" og beskriv usikkerheden i checks.`;

      // Build user message — prefer images (vision) for accurate table reading
      let userContent: any;
      if (pageImages && Array.isArray(pageImages) && pageImages.length > 0) {
        const imageParts = pageImages.map((base64: string) => ({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${base64}` },
        }));
        userContent = [
          { type: "text", text: `Filnavn: ${fileName || 'ukendt'}\n\nHerunder er siderne fra dokumentet som billeder. Aflæs tabellerne VISUELT og vær omhyggelig med at skelne "Perioden"/"Faktisk" kolonnen (venstre) fra "År til dato" kolonnen (højre). Supplerende tekstudtræk:\n\n${(fileContent || '').slice(0, 5000)}` },
          ...imageParts,
        ];
        console.log(`Sending ${pageImages.length} page images to AI (vision mode)`);
      } else {
        userContent = `Filnavn: ${fileName || 'ukendt'}\n\nHer er det rå indhold fra dokumentet:\n\n${fileContent}`;
        console.log("Sending text-only content to AI (no images available)");
      }

      const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_financial_data",
                description:
                  "Udtrækker nøjagtigt aflæste nøgletal fra en dansk saldobalance eller resultatopgørelse med validering",
                parameters: {
                  type: "object",
                  properties: {
                    report_type: {
                      type: "string",
                      enum: ["saldobalance", "resultatopgørelse"],
                      description: "Bestem ud fra indholdet — IKKE kun filnavnet",
                    },
                    report_period: {
                      type: "string",
                      description: "F.eks. 'Oktober 2025'. Angiv den måned rapporten primært dækker.",
                    },
                    company_name: { type: "string" },
                    cvr_number: { type: "string" },
                    key_figures: {
                      type: "object",
                      properties: {
                        omsaetning: { type: "number" },
                        omsaetning_aar: { type: "number" },
                        direkte_omkostninger: { type: "number" },
                        daekningsbidrag: { type: "number" },
                        daekningsbidrag_aar: { type: "number" },
                        loenninger: { type: "number" },
                        marketing: { type: "number", description: "Salgs- og marketingomkostninger samlet" },
                        lokaler: { type: "number", description: "Lokaleomkostninger samlet (husleje, el, vand, etc.)" },
                        admin: { type: "number", description: "Administrative omkostninger samlet (kontor, telefon, forsikring, revisor, etc.)" },
                        afskrivninger: { type: "number", description: "Af- og nedskrivninger" },
                        tech_software: { type: "number", description: "IT, software, hosting" },
                        resultat_foer_skat: { type: "number" },
                        resultat_foer_skat_aar: { type: "number" },
                        resultat_efter_skat: { type: "number" },
                        resultat_efter_skat_aar: { type: "number" },
                        aktiver_i_alt: { type: "number" },
                        passiver_i_alt: { type: "number" },
                        egenkapital: { type: "number" },
                        bank_balance: { type: "number" },
                        debitorer: { type: "number" },
                        kreditorer: { type: "number" },
                      },
                    },
                    line_items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "Postens navn som det fremgår i dokumentet" },
                          period_amount: { type: "number", description: "Periodens tal (originalt fortegn)" },
                          ytd_amount: { type: "number", description: "År-til-dato tal (originalt fortegn)" },
                          raw_sign: {
                            type: "string",
                            enum: ["PLUS", "MINUS"],
                            description: "Det originale fortegn i dokumentet for period_amount",
                          },
                          account_no: {
                            type: "string",
                            description: "Kontonummer hvis det fremgår, ellers null",
                          },
                          class: {
                            type: "string",
                            enum: ["REVENUE", "COGS", "OPEX", "DEPR", "FIN_INCOME", "FIN_EXPENSE", "TAX", "ASSET", "LIABILITY", "EQUITY", "UKLASSIFICERET"],
                            description: "Standardiseret regnskabsklassificering",
                          },
                        },
                        required: ["name", "period_amount", "ytd_amount", "raw_sign", "class"],
                      },
                    },
                    validation: {
                      type: "object",
                      description: "AI-sidens valideringsresultat af de udtrukkede tal",
                      properties: {
                        status: {
                          type: "string",
                          enum: ["PASS", "FAIL", "UNSURE"],
                          description: "Overordnet status: PASS=alle checks ok, FAIL=mindst ét fejlede, UNSURE=i tvivl om et tal",
                        },
                        checks: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string", description: "Check-navn: daekningsbidrag_sum, resultat_consistency, balance_equation" },
                              result: { type: "string", enum: ["PASS", "FAIL", "SKIP"] },
                              details: { type: "string", description: "Kort forklaring af resultatet" },
                            },
                            required: ["name", "result", "details"],
                          },
                        },
                      },
                      required: ["status", "checks"],
                    },
                  },
                  required: [
                    "report_type",
                    "report_period",
                    "company_name",
                    "cvr_number",
                    "key_figures",
                    "line_items",
                    "validation",
                  ],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_financial_data" },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "For mange forespørgsler. Prøv igen om lidt." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditter opbrugt. Tilføj flere i indstillinger." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

      const aiResult = await response.json();
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

      if (!toolCall) {
        throw new Error("AI returned no tool call");
      }

      extractedData = JSON.parse(toolCall.function.arguments);
      
      // Capture raw AI output BEFORE any post-processing (for audit trail)
      rawAiOutput = JSON.parse(JSON.stringify(extractedData));
      rawAiOutput.routing_trace = routingTrace;

      // Override company name if provided by caller (prevents AI hallucination)
      if (knownCompanyName) {
        console.log(`Overriding AI company_name "${extractedData.company_name}" with known: "${knownCompanyName}"`);
        extractedData.company_name = knownCompanyName;
      }

      // Server-side period extraction from document text (prevents AI hallucination)
      if (fileContent) {
        const periodFromText = extractPeriodFromText(fileContent);
        if (periodFromText && periodFromText !== extractedData.report_period) {
          console.log(`Overriding AI report_period "${extractedData.report_period}" with parsed: "${periodFromText}"`);
          extractedData.report_period = periodFromText;
        }
        const cvrFromText = extractCvrFromText(fileContent);
        if (cvrFromText && cvrFromText !== extractedData.cvr_number) {
          console.log(`Overriding AI cvr_number "${extractedData.cvr_number}" with parsed: "${cvrFromText}"`);
          extractedData.cvr_number = cvrFromText;
        }
      }
    }  // End AI extraction block

    // ═══════════════════════════════════════════════════════════════════════════
    // CANONICAL ENGINE — SEMANTIC PATHS ALREADY HAVE CANONICAL; LEGACY NEEDS IT
    // ═══════════════════════════════════════════════════════════════════════════
    const SEMANTIC_SUCCESS_BRANCHES = [
      "deterministic_structural_success",
      "semantic_xlsx_success",
      "semantic_csv_success",
    ] as const;

    const isSemanticCanonical =
      extractionMethod === "deterministic_structural" ||
      SEMANTIC_SUCCESS_BRANCHES.includes(routingTrace.branch as any) ||
      (rawAiOutput?.semantic === true && extractedData != null);

    let canonical: any;

    if (isSemanticCanonical) {
      // Semantic/structural path already produced canonical via buildCanonicalFromSemantic().
      // extractedData IS the canonical output — do NOT overwrite with legacy engine.
      canonical = extractedData;
      console.log("[Canonical] Using pre-built semantic canonical (skipping legacy buildCanonicalOutput)");
    } else {
      // Legacy AI or legacy deterministic path — run the old canonical engine
      canonical = buildCanonicalOutput(extractedData, rawAiOutput, extractionMethod);

      // Apply canonical validation back to extractedData for backward compat
      extractedData.validation = {
        status: canonical.validation.status,
        server_checks: canonical.validation.canonical_checks,
        ai_checks: canonical.validation.ai_checks,
        corrections: canonical.correction_log,
        errors: canonical.validation.canonical_checks
          .filter((c: any) => c.result === "FAIL")
          .map((c: any) => `${c.name}: ${c.details}`),
      };

      // Apply normalized metrics back to key_figures for backward compat
      if (extractedData.key_figures && canonical.metrics) {
        const kfMap: Record<string, string> = {
          revenue: "omsaetning", cogs: "direkte_omkostninger", gross_profit: "daekningsbidrag",
          payroll: "loenninger", sales_costs: "marketing", facility_costs: "lokaler",
          admin_costs: "admin", depreciation: "afskrivninger", ebt: "resultat_foer_skat",
          net_result: "resultat_efter_skat", assets_total: "aktiver_i_alt",
          liabilities_total: "passiver_i_alt", equity_total: "egenkapital",
          cash: "bank_balance", trade_receivables: "debitorer", current_liabilities: "kreditorer",
          inventory: "varelager",
        };
        for (const [eng, dk] of Object.entries(kfMap)) {
          const val = (canonical.metrics as any)[eng];
          if (val != null) extractedData.key_figures[dk] = val;
        }
      }
    }

    const finalStatus = canonical.validation?.status ?? "FAIL";
    const allErrors = (canonical.validation?.canonical_checks ?? [])
      .filter((c: any) => c.result === "FAIL")
      .map((c: any) => `${c.name}: ${c.details}`);

    // Log canonical summary
    console.log(`[Canonical] Period: ${extractedData.report_period} | Type: ${canonical.statement_type} | Basis: ${canonical.selected_period_basis}`);
    console.log(`[Canonical] Status: ${finalStatus} | ai_eligible: ${canonical.ai_eligible} | Corrections: ${canonical.correction_log.length}`);
    for (const check of canonical.validation.canonical_checks) {
      const icon = check.result === "FAIL" ? "✗" : check.result === "PASS" ? "✓" : "~";
      console.log(`  ${icon} ${check.name}: ${check.details}`);
    }

    // Check for duplicate report (same company, same period)
    if (reportId) {
      const { data: currentReport } = await supabase
        .from("financial_reports")
        .select("company_id")
        .eq("id", reportId)
        .single();

      if (currentReport) {
        const { data: existing } = await supabase
          .from("financial_reports")
          .select("id, report_period")
          .eq("company_id", currentReport.company_id)
          .eq("report_period", extractedData.report_period)
          .eq("status", "processed")
          .is("deleted_at", null)
          .neq("id", reportId);

        if (existing && existing.length > 0 && !overwrite) {
          await supabase.from("financial_reports").delete().eq("id", reportId);
          return new Response(
            JSON.stringify({
              duplicate: true,
              existing_period: extractedData.report_period,
              existing_report_id: existing[0].id,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (existing && existing.length > 0 && overwrite) {
          for (const old of existing) {
            await supabase.from("milestones").delete().eq("source_report", old.id);
            await supabase
              .from("financial_reports")
              .update({ deleted_at: new Date().toISOString(), status: "processed" })
              .eq("id", old.id);
          }
          console.log(`Soft-deleted ${existing.length} existing report(s) for ${extractedData.report_period}`);
        }
      }

      // Determine final DB status based on document type
      // Financial docs: ALWAYS "processed" (manual entry fallback if validation fails)
      // Non-financial/garbage docs: "error" (truly unrecognizable)
      const isFinancialDoc = isReadableFinancialDoc(sourceFingerprint, extractedData, extractionMethod, finalStatus);
      const isV2Persist = isV2Cohort && isFinancialDoc;
      let dbStatus: string;
      let needsManualEntry = false;
      if (isFinancialDoc) {
        dbStatus = "processed";
        if (finalStatus !== "PASS") {
          needsManualEntry = true;
        }
        console.log(`[StatusResolve] Financial doc → status=processed (validation=${finalStatus}, needsManualEntry=${needsManualEntry})`);
      } else {
        // Non-financial doc (APV, images, random PDFs) → error
        dbStatus = "error";
        console.log(`[StatusResolve] Non-financial doc → status=error`);
      }

      // Prepare DB update — map canonical field names to DB columns for semantic path
      const dbReportType = isSemanticCanonical
        ? (canonical.statement_type === "pnl" ? "resultatopgørelse"
          : canonical.statement_type === "trial_balance" ? "saldobalance"
          : canonical.statement_type === "balance" ? "balance"
          : "andet")
        : extractedData.report_type;

      // FIX C: Convert semantic period metadata to Danish month label for DB/commit compatibility
      const dbReportPeriod = (() => {
        if (!isSemanticCanonical) return extractedData.report_period;

        const DK_MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];
        const rawLabel = canonical.report_period_label;

        // Check if already a Danish month label (e.g., "Februar 2026")
        if (rawLabel && /^(Januar|Februar|Marts|April|Maj|Juni|Juli|August|September|Oktober|November|December)\s+\d{4}$/i.test(rawLabel)) {
          console.log(`[PeriodResolve] Already Danish label: "${rawLabel}"`);
          return rawLabel;
        }

        // Generic date-to-Danish-month converter supporting multiple formats
        const tryConvertDate = (s: string | null): string | null => {
          if (!s) return null;

          // Format: DD/MM-YYYY or DD/MM YYYY (slash separator)
          const slashMatch = s.match(/(\d{2})\/(\d{2})[-\s]*(\d{4})\s*$/);
          if (slashMatch) {
            const mo = parseInt(slashMatch[2], 10);
            if (mo >= 1 && mo <= 12) return `${DK_MONTHS[mo - 1]} ${slashMatch[3]}`;
          }

          // Format: DD.MM.YY or DD.MM.YYYY (dot separator, common in e-conomic)
          const dotMatch = s.match(/(\d{2})\.(\d{2})\.(\d{2,4})\s*$/);
          if (dotMatch) {
            const mo = parseInt(dotMatch[2], 10);
            let yr = dotMatch[3];
            if (yr.length === 2) yr = (parseInt(yr) >= 50 ? "19" : "20") + yr;
            if (mo >= 1 && mo <= 12) return `${DK_MONTHS[mo - 1]} ${yr}`;
          }

          // Format: DD-MM-YYYY (dash separator)
          const dashMatch = s.match(/(\d{2})-(\d{2})-(\d{4})\s*$/);
          if (dashMatch) {
            const mo = parseInt(dashMatch[2], 10);
            if (mo >= 1 && mo <= 12) return `${DK_MONTHS[mo - 1]} ${dashMatch[3]}`;
          }

          // Format: YYYY-MM-DD (ISO)
          const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})$/);
          if (isoMatch) {
            const mo = parseInt(isoMatch[2], 10);
            if (mo >= 1 && mo <= 12) return `${DK_MONTHS[mo - 1]} ${isoMatch[1]}`;
          }

          return null;
        };

        // Priority 1: parse from report_period_label (end date of range)
        const fromLabel = tryConvertDate(rawLabel);
        if (fromLabel) {
          console.log(`[PeriodResolve] From report_period_label "${rawLabel}" → "${fromLabel}"`);
          return fromLabel;
        }

        // Priority 2: parse from period_end
        const fromEnd = tryConvertDate(canonical.period_end);
        if (fromEnd) {
          console.log(`[PeriodResolve] From period_end "${canonical.period_end}" → "${fromEnd}"`);
          return fromEnd;
        }

        // Priority 3: parse from period_start (last resort for metadata)
        const fromStart = tryConvertDate(canonical.period_start);
        if (fromStart) {
          console.log(`[PeriodResolve] From period_start "${canonical.period_start}" → "${fromStart}"`);
          return fromStart;
        }

        // Priority 4: server-side text parse fallback
        if (fileContent) {
          const textPeriod = extractPeriodFromText(fileContent);
          if (textPeriod) {
            console.log(`[PeriodResolve] From text fallback → "${textPeriod}"`);
            return textPeriod;
          }
        }

        // All resolution attempts failed — log explicitly
        console.error(`[PeriodResolve] FAILED: Could not resolve period. report_period_label="${rawLabel}", period_end="${canonical.period_end}", period_start="${canonical.period_start}", fileContent available=${!!fileContent}`);
        return rawLabel || null;
      })();

      const dbCompanyName = isSemanticCanonical
        ? canonical.company_name
        : extractedData.company_name;

      const dbCvrNumber = isSemanticCanonical
        ? canonical.cvr
        : extractedData.cvr_number;

      const updatePayload: any = {
        report_type: dbReportType,
        report_period: dbReportPeriod,
        company_name: dbCompanyName,
        cvr_number: dbCvrNumber,
        extracted_data: extractedData,
        processed_at: new Date().toISOString(),
        status: dbStatus,
        extraction_method: extractionMethod,
        validation_status: finalStatus,
        validation_errors: allErrors.length > 0 ? allErrors : null,
        raw_extracted_data: rawAiOutput,
        // Phase 4: Full canonical output in normalized_data
        normalized_data: canonical,
        // Phase A1: V2 persisted marker + quality signals
        // Only use v2 marker for readable financial docs; non-financial stays v1
        extraction_contract_version: isV2Persist ? "v2" : "v1",
        quality_signals: (isV2Persist || needsManualEntry) ? {
          needs_manual_entry: needsManualEntry,
          validation_status: finalStatus,
          validation_errors: allErrors.length > 0 ? allErrors : null,
          canonical_checks: canonical.validation?.canonical_checks ?? [],
          ai_eligible: canonical.ai_eligible ?? false,
          has_metrics: !!(canonical.metrics && Object.keys(canonical.metrics).length > 0),
          has_period: !!(dbReportPeriod && dbReportPeriod.length > 0),
          extraction_method: extractionMethod,
          routing_branch: routingTrace.branch,
        } : null,
      };

      // Add deterministic metadata if present
      if (extractedData?._deterministic_meta) {
        updatePayload.raw_extracted_data = {
          ...rawAiOutput,
          deterministic_meta: extractedData._deterministic_meta,
        };
      }

      const { error: updateError } = await supabase
        .from("financial_reports")
        .update(updatePayload)
        .eq("id", reportId);

      if (updateError) {
        console.error("DB update error:", updateError);
      }

      // ── Phase 2: Member notifications for report events ──
      // Communication layer: consume reporting truth, never redefine it
      if (!updateError && reportId) {
        try {
          // Look up report owner
          const { data: reportRow } = await supabase
            .from("financial_reports")
            .select("user_id, company_id")
            .eq("id", reportId)
            .single();

          if (reportRow?.user_id) {
            const { writeNotification } = await import("../_shared/notificationWriter.ts");

            if (dbStatus === "error") {
              // report_error: action_required, immediate (non-financial doc)
              await writeNotification(supabase, {
                user_id: reportRow.user_id,
                type: "report_error",
                priority: "action_required",
                title: "Din rapport kunne ikke behandles",
                body: `Vi kunne ikke læse "${fileName || "filen"}". Prøv at eksportere direkte fra dit regnskabsprogram (e-conomic, Dinero eller Billy) og upload igen. Kontakt support hvis fejlen fortsætter.`,
                reference_type: "report",
                reference_id: reportId,
                deep_link: `/reports?reportId=${reportId}`,
                company_id: reportRow.company_id || undefined,
                dedup_key: `report_error:${reportId}`,
              });
              console.log(`[Phase2] report_error notification for user ${reportRow.user_id}`);
            } else if (needsManualEntry) {
              // Extraction failed but doc is financial — guide user to manual entry
              await writeNotification(supabase, {
                user_id: reportRow.user_id,
                type: "report_review_ready",
                priority: "action_required",
                title: "Indtast tal manuelt — 2 minutter",
                body: `Vi kunne ikke læse "${fileName || "filen"}" automatisk. Klik her for at indtaste de vigtigste tal manuelt — så aktiverer vi din AI-analyse med det samme.`,
                reference_type: "report",
                reference_id: reportId,
                deep_link: `/reports?reportId=${reportId}`,
                company_id: reportRow.company_id || undefined,
                dedup_key: `report_manual_entry:${reportId}`,
              });
              console.log(`[Phase2] report_manual_entry notification for user ${reportRow.user_id}`);
            } else {
              // Check reviewability via resolve_report_commit_candidate
              const { data: candidate, error: rpcErr } = await supabase
                .rpc("resolve_report_commit_candidate", { p_report_id: reportId });

              if (!rpcErr && candidate?.eligible === true) {
                await writeNotification(supabase, {
                  user_id: reportRow.user_id,
                  type: "report_review_ready",
                  priority: "action_required",
                  title: candidate.period_label
                    ? `${candidate.period_label} — gennemgå dine tal`
                    : "Din rapport er klar til gennemsyn",
                  body: candidate.period_label
                    ? `Vi har trukket tallene ud fra din ${candidate.period_label}-rapport. Gennemgå og godkend dem — det tager under 1 minut. Herefter aktiveres din AI-analyse.`
                    : "Vi har behandlet din rapport. Gennemgå tallene og godkend dem for at aktivere din AI-analyse.",
                  reference_type: "report",
                  reference_id: reportId,
                  deep_link: `/reports?reportId=${reportId}`,
                  company_id: reportRow.company_id || undefined,
                  dedup_key: `report_review_ready:${reportId}`,
                });
                console.log(`[Phase2] report_review_ready notification for user ${reportRow.user_id}`);
              } else {
                console.log(`[Phase2] Report ${reportId} not eligible for review (eligible=${candidate?.eligible}, rpcErr=${rpcErr?.message})`);
              }
            }
          }
        } catch (notifErr) {
          console.error("[Phase2] Report notification error (non-blocking):", notifErr);
        }
      }
    }

    // Return extractedData + canonical for client-side use
    // Guard: only attach as sub-property when canonical is a separate object (legacy path)
    // When isSemanticCanonical, canonical === extractedData, so attaching would create a circular reference
    if (canonical !== extractedData) {
      extractedData.canonical = canonical;
    }

    return new Response(JSON.stringify(extractedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-financial-data error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
