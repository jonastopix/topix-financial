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

  // Pattern 2: "Oktober 2025", "Okt 2025"
  const namedMonth = cleanedText.match(/\b(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|dec)\s+(\d{4})\b/i);
  if (namedMonth) {
    const monthNum = DANISH_MONTH_NAMES[namedMonth[1].toLowerCase()];
    if (monthNum) {
      const monthName = DANISH_MONTHS[monthNum];
      return `${monthName} ${namedMonth[2]}`;
    }
  }

  // Pattern 3: "10/2025" or "10-2025"
  const shortDate = cleanedText.match(/\b(\d{2})[\/\-](\d{4})\b/);
  if (shortDate) {
    const monthName = DANISH_MONTHS[shortDate[1]];
    if (monthName) return `${monthName} ${shortDate[2]}`;
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
    };

    // ── LAG -1: SOURCE FINGERPRINTING (gates AI fallback) ──
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
      sourceFingerprint = detectSourceSystem(
        fileName || "unknown",
        fpFileType,
        fileContent || undefined,
        fpHeaderRows
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
            await supabase
              .from("financial_reports")
              .update({
                status: "error",
                extraction_method: "semantic_xlsx_fail",
                validation_status: "FAIL",
                validation_errors: [`Semantic XLSX extraction failed for known source ${sourceFingerprint.source_system}: ${semanticXlsxResult.error}`],
                raw_extracted_data: { routing_trace: routingTrace },
                processed_at: new Date().toISOString(),
              })
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
              await supabase
                .from("financial_reports")
                .update({
                  status: "error",
                  extraction_method: "structural_parse_fail",
                  validation_status: "FAIL",
                  validation_errors: [`Structural payload validation failed for known source ${sourceFingerprint!.source_system}: ${validationResult.errors.join("; ")}`],
                  raw_extracted_data: { routing_trace: routingTrace },
                  processed_at: new Date().toISOString(),
                })
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
                    hashError = `Could not verify hash for known source: ${dlError?.message}`;
                    routingTrace.pdf_structural_errors = [hashError];
                  }
                }
              }
            }
          } catch (hashErr) {
            console.warn("[PdfStructural] Hash verification error:", hashErr);
            if (!isKnownSource) {
              validatedStructural = pdfStructural as PdfStructuralPayload;
              routingTrace.pdf_structural_hash_verified = false;
            } else {
              hashError = `Hash verification exception for known source`;
              routingTrace.pdf_structural_errors = [hashError];
            }
          }

          // ── TRUST MODEL: known source + hash mismatch/failure = HARD FAIL ──
          if (isKnownSource && !hashVerified) {
            routingTrace.branch = "structural_parse_fail_hash";
            console.error(`[PdfStructural] HARD FAIL: known source ${sourceFingerprint!.source_system} + hash verification failed`);

            if (reportId) {
              await supabase
                .from("financial_reports")
                .update({
                  status: "error",
                  extraction_method: "structural_parse_fail",
                  validation_status: "FAIL",
                  validation_errors: [`Structural payload hash verification failed for known source ${sourceFingerprint!.source_system}: ${hashError || "unknown"}`],
                  raw_extracted_data: { routing_trace: routingTrace },
                  processed_at: new Date().toISOString(),
                })
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

            // For known sources: this is a hard fail — no text fallback
            if (sourceFingerprint && !isAiAllowed(sourceFingerprint)) {
              if (reportId) {
                await supabase
                  .from("financial_reports")
                  .update({
                    status: "error",
                    extraction_method: "structural_semantic_fail",
                    validation_status: "FAIL",
                    validation_errors: [`Structural semantic extraction failed for ${structResult.template_id}: ${structResult.error}`],
                    raw_extracted_data: { routing_trace: routingTrace },
                    processed_at: new Date().toISOString(),
                  })
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
        // No structural payload — check if this is a known source that REQUIRES structural
        const isKnownPdfSource = sourceFingerprint != null && !isAiAllowed(sourceFingerprint);
        if (isKnownPdfSource) {
          // Known PDF source MUST have structural payload — hard fail
          routingTrace.branch = "structural_payload_missing";
          console.error(`[Routing] HARD FAIL: Known PDF source ${sourceFingerprint!.source_system} requires structural payload but none was provided`);

          if (reportId) {
            await supabase
              .from("financial_reports")
              .update({
                status: "error",
                extraction_method: "structural_payload_missing",
                validation_status: "FAIL",
                validation_errors: [`Known PDF source ${sourceFingerprint!.source_system} requires structural payload — client-side extraction failed or was not sent`],
                raw_extracted_data: { routing_trace: routingTrace },
                processed_at: new Date().toISOString(),
              })
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

        // Unknown source — legacy text path allowed (migration bridge)
        console.log("[Routing] No structural payload (unknown source), attempting legacy deterministic PDF extraction...");
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
            await supabase
              .from("financial_reports")
              .update({
                status: "error",
                extraction_method: "semantic_csv_fail",
                validation_status: "FAIL",
                validation_errors: [`Semantic CSV extraction failed for known source ${sourceFingerprint.source_system}: ${semanticCsvResult.error}`],
                raw_extracted_data: { routing_trace: routingTrace },
                processed_at: new Date().toISOString(),
              })
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
            await supabase
              .from("financial_reports")
              .update({
                status: "error",
                extraction_method: extractionMethod,
                validation_status: "FAIL",
                validation_errors: [`Deterministic parsing failed: ${detResult.error}`],
                raw_extracted_data: { routing_trace: routingTrace },
                processed_at: new Date().toISOString(),
              })
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
              await supabase
                .from("financial_reports")
                .update({
                  status: "error",
                  extraction_method: "known_source_unsupported_variant",
                  validation_status: "FAIL",
                  validation_errors: [`Known source ${sourceFingerprint.source_system} detected but no supported template matched. AI fallback is forbidden for known sources.`],
                  raw_extracted_data: { routing_trace: routingTrace },
                  processed_at: new Date().toISOString(),
                })
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
    } else {
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

═══════════════════════════════════════════════════
TRIN 2: FORSTÅ KOLONNE-STRUKTUREN
═══════════════════════════════════════════════════
Danske resultatopgørelser har typisk FIRE talkolonner:
  Kolonne 1: "Perioden Faktisk" — den enkelte måneds tal
  Kolonne 2: "Perioden Året før" — samme måned sidste år  
  Kolonne 3: "År til dato Faktisk" — akkumuleret indeværende år
  Kolonne 4: "År til dato Året før" — akkumuleret sidste år

DU SKAL BRUGE:
- Kolonne 1 ("Perioden Faktisk") til alle periodefeltter (omsaetning, loenninger, resultat_foer_skat osv.)
- Kolonne 3 ("År til dato Faktisk") til alle _aar-felter (omsaetning_aar, resultat_foer_skat_aar osv.)

KRITISK: Læs kolonnenumrene fra VENSTRE mod HØJRE. Forveksl IKKE "Perioden Faktisk" med "Perioden Året før"!

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
    // CANONICAL ENGINE — ONE CALL FOR BOTH PATHS
    // ═══════════════════════════════════════════════════════════════════════════
    const canonical = buildCanonicalOutput(extractedData, rawAiOutput, extractionMethod);
    const finalStatus = canonical.validation.status;
    const allErrors = canonical.validation.canonical_checks
      .filter(c => c.result === "FAIL")
      .map(c => `${c.name}: ${c.details}`);

    // Apply canonical validation back to extractedData for backward compat
    extractedData.validation = {
      status: finalStatus,
      server_checks: canonical.validation.canonical_checks,
      ai_checks: canonical.validation.ai_checks,
      corrections: canonical.correction_log,
      errors: allErrors,
    };

    // Apply normalized metrics back to key_figures for backward compat
    if (extractedData.key_figures && canonical.metrics) {
      // Keep original Danish key_figures but update values from canonical normalization
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

      // Determine final DB status based on validation
      // - PASS -> processed
      // - FAIL/UNSURE -> error
      const dbStatus = finalStatus === "PASS" ? "processed" : "error";

      // Prepare DB update
      const updatePayload: any = {
        report_type: extractedData.report_type,
        report_period: extractedData.report_period,
        company_name: extractedData.company_name,
        cvr_number: extractedData.cvr_number,
        extracted_data: extractedData,
        processed_at: new Date().toISOString(),
        status: dbStatus,
        extraction_method: extractionMethod,
        validation_status: finalStatus,
        validation_errors: allErrors.length > 0 ? allErrors : null,
        raw_extracted_data: rawAiOutput,
        // Phase 4: Full canonical output in normalized_data
        normalized_data: canonical,
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
    }

    // Return extractedData + canonical for client-side use
    extractedData.canonical = canonical;

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
