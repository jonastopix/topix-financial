import { useCallback, useState, useRef, useEffect, Fragment } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Upload, FileSpreadsheet, X, CheckCircle2, Loader2, Check, Target, Info, AlertTriangle, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postActivityMessage } from "@/lib/chatActivity";
import { notifyReportUpload } from "@/lib/reportNotify";
import { sanitizeFileName, buildStoragePath } from "@/lib/reportFileAccess";
import { detectTemplate, extractKJAutoTemplate, templateResultToExtractedData } from "@/lib/excelTemplates";
import { extractPdfStructural } from "@/lib/pdfStructuralExtractor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// pdfjs-dist and xlsx are lazy-loaded inside async functions to reduce initial bundle

interface ExtractedData {
  report_type?: string;
  report_period?: string;
  company_name?: string;
  cvr_number?: string;
  key_figures?: Record<string, number>;
  line_items?: Array<{ name: string; period_amount: number; ytd_amount: number }>;
  validation?: {
    status?: string;
  };
  extraction_method?: string;
  normalized_metrics?: {
    cash?: number;
    equity_total?: number;
    equity_ratio_pct?: number;
    trade_receivables?: number;
    inventory?: number;
    revenue?: number;
  };
  // Canonical/structural fields
  metrics?: {
    revenue?: number | null;
    gross_profit?: number | null;
    cogs?: number | null;
    payroll?: number | null;
    ebt?: number | null;
    net_result?: number | null;
    cash?: number | null;
    assets_total?: number | null;
    equity_total?: number | null;
    equity_ratio_pct?: number | null;
    trade_receivables?: number | null;
    inventory?: number | null;
    current_liabilities?: number | null;
    [key: string]: number | null | undefined;
  };
  report_period_label?: string;
}

/**
 * Returns true ONLY for the e-conomic resultatopgørelse PDF family.
 * These PDFs require a structural payload — if extraction fails, the upload must stop client-side.
 * False for e-conomic saldobalance, Dinero, and unknown PDFs.
 */
function requiresStructuralPdfPayload(rawText: string): boolean {
  if (!/secure\.e-conomic\.com/i.test(rawText)) return false;
  if (/saldobalance/i.test(rawText)) return false;
  if (/\bAKTIVER\b/i.test(rawText) || /\bPASSIVER\b/i.test(rawText)) return false;
  if (/resultatopg/i.test(rawText)) return true;
  return false;
}

// ── Shared post-extraction pipeline (RP-2: no auto-AI, commentary is now explicit post-commit) ──
// Used by BOTH main upload and overwrite flows to avoid divergence.
async function runPostExtractionPipeline(params: {
  extractedData: any;
  reportId: string;
  userId: string;
  companyId: string | null;
  companyName: string | null;
  fileId: string;
  updateFile: (fileId: string, updates: Partial<UploadedFile>) => void;
  queryClient: any;
  toastFn: typeof toast;
  onPipelineComplete?: (reportId?: string) => void;
}) {
  const { extractedData, reportId, userId, companyId, companyName, fileId, updateFile, queryClient, toastFn, onPipelineComplete } = params;

  // RP-2: No auto-AI generation on upload. Commentary is now a separate explicit action
  // after facts are committed.
  // Re-read the report status set by the edge function.
  // CRITICAL A1 rule: frontend must NEVER overwrite DB status.
  const readReportData = async () => {
    const { data } = await supabase
      .from("financial_reports")
      .select("status, quality_signals")
      .eq("id", reportId)
      .single();
    return { status: data?.status as string | undefined, quality_signals: data?.quality_signals as any };
  };

  let reportData = await readReportData();

  // Handle tiny replication lag/race windows by retrying reads only.
  // Never write a fallback status from frontend.
  if (reportData.status === "processing") {
    for (let i = 0; i < 4 && reportData.status === "processing"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      reportData = await readReportData();
    }
  }

  const edgeFunctionStatus = reportData.status;
  // If status is still "processing" after retries, treat as needs_manual_entry
  // (edge function may have crashed before writing to DB)
  const isStuckProcessing = edgeFunctionStatus === "processing";
  const needsManualEntry = reportData.quality_signals?.needs_manual_entry === true || isStuckProcessing;
  const isError = edgeFunctionStatus === "error";

  // Always set UI status to "done" for processed reports (including needs_manual_entry)
  const uiStatus = isError ? "error" : (edgeFunctionStatus === "processed" || isStuckProcessing) ? "done" : "processing";
  updateFile(fileId, {
    status: uiStatus,
    milestonesCreated: 0,
    errorMessage: isError ? "Dokumentet kunne ikke genkendes som en finansiel rapport" : undefined,
  });

  // If stuck in processing: write needs_manual_entry to DB so Reports page shows the right CTA
  if (isStuckProcessing) {
    try {
      await supabase
        .from("financial_reports")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          quality_signals: {
            needs_manual_entry: true,
            validation_status: "FAIL",
            validation_errors: ["Extraction timed out or crashed without updating DB"],
            canonical_checks: [],
            ai_eligible: false,
            has_metrics: false,
            has_period: false,
            extraction_method: "stuck_processing_recovery",
            routing_branch: "stuck_processing_recovery",
          },
        } as any)
        .eq("id", reportId);
    } catch (e) {
      console.error("[runPostExtractionPipeline] Failed to recover stuck-processing report:", e);
    }
  }

  queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
  queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
  queryClient.invalidateQueries({ queryKey: ["financial-reports-chart"] });
  queryClient.invalidateQueries({ queryKey: ["report-commit-states"] });
  queryClient.invalidateQueries({ queryKey: ["company-facts"] });
  onPipelineComplete?.(reportId);

  if (isError) {
    toastFn.error("Dokument afvist", {
      description: "Filen blev ikke genkendt som en finansiel rapport.",
    });
  } else if (needsManualEntry) {
    // Build a contextual description based on what we know
    const sourceHint = extractedData?.source_system && extractedData.source_system !== "unknown"
      ? ` Vi genkender det som ${extractedData.source_system === "economic" ? "e-conomic" : extractedData.source_system}, men formatet er ukendt for os.`
      : "";
    const actionHint = extractedData?.extraction_method?.includes("pdf")
      ? " Prøv at eksportere som Excel i stedet."
      : "";

    toastFn("Tjek tallene manuelt", {
      description: `Vi kunne ikke aflæse alle tal automatisk.${sourceHint}${actionHint} Klik på rapporten for at indtaste de vigtigste tal — det tager 1-2 minutter.`,
    });
  } else {
    toastFn.success("Rapport behandlet ✓", {
      description: `${extractedData.report_type === "saldobalance" ? "Saldobalance" : "Resultatopgørelse"} for ${extractedData.report_period} — tryk "Klar til godkendelse" for at bekræfte tallene`,
    });
  }
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "processing" | "analyzing" | "done" | "error";
  extractedData?: ExtractedData;
  errorMessage?: string;
  reportId?: string;
  milestonesCreated?: number;
}

interface FileUploadZoneProps {
  title: string;
  description: string;
  accept?: string;
  conversationId?: string | null;
  userId?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  adminMode?: boolean;
  guideDefaultOpen?: boolean;
  onExtracted?: (data: ExtractedData) => void;
  onPipelineComplete?: (reportId?: string) => void;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function extractPdfPageImages(file: File): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];
    images.push(base64);
  }
  
  return images;
}

async function extractTextFromFile(file: File): Promise<{ text: string; pageImages?: string[] }> {
  const ext = file.name.toLowerCase().split(".").pop();
  if (file.type === "application/pdf" || ext === "pdf") {
    try {
      const pageImages = await extractPdfPageImages(file);
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const textParts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => {
            const str = item.str || "";
            if (item.hasEOL) return str + "\n";
            return str + " ";
          })
          .join("");
        textParts.push(`--- Side ${i} ---\n${pageText}`);
      }
      const fullText = textParts.join("\n\n").slice(0, 15000);
      return { text: fullText, pageImages };
    } catch (err) {
      console.error("PDF image extraction failed, falling back to text:", err);
      const text = await file.text();
      const readable = text
        .replace(/[^\x20-\x7E\xC0-\xFF\n\r\tæøåÆØÅ.,\-()]/g, " ")
        .replace(/\s{3,}/g, "\n")
        .trim();
      return { text: readable.slice(0, 15000) };
    }
  }
  if (ext === "xlsx" || ext === "xls") {
    try {
      const XLSX = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const csvParts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
        csvParts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
      }
      const fullText = csvParts.join("\n\n");
      return { text: fullText.slice(0, 30000) };
    } catch (err) {
      console.error("SheetJS parse failed, falling back to raw text:", err);
    }
  }
  const text = await file.text();
  return { text: text.slice(0, 30000) };
}

function getFriendlyErrorMessage(data: any): string {
  const err = data?.error || "";
  const source = data?.source_system || "";
  const status = data?.status || "";
  const systemLabel = (s: string) =>
    s === "economic" ? "e-conomic"
    : s === "dinero" ? "Dinero"
    : s === "combined_dk" ? "e-conomic"
    : s || "dit regnskabsprogram";
  if (err.includes("Known source without supported template") || status === "error" && source) {
    return `Vi kan se at filen kommer fra ${systemLabel(source)}, men denne rapporttype understøttes ikke endnu. Prøv at eksportere en standard resultatopgørelse eller saldobalance fra ${systemLabel(source)}.`;
  }
  if (status === "semantic_xlsx_fail" || status === "semantic_csv_fail") {
    return `Filen fra ${systemLabel(source)} kunne ikke læses korrekt. Kontrollér at det er en standard resultatopgørelse eller saldobalance, og prøv igen.`;
  }
  if (err.includes("Structural semantic extraction failed")) {
    return `PDF-filen fra ${systemLabel(source)} kunne ikke læses korrekt. Prøv at eksportere filen igen, eller upload en Excel-version i stedet.`;
  }
  if (err.includes("sign_convention") || err.includes("unknown convention")) {
    return "Fortegnskonventionen i filen kunne ikke bestemmes. Upload venligst en standardeksport direkte fra dit regnskabsprogram.";
  }
  if (err.includes("validation") || err.includes("missing")) {
    return "Rapporten mangler nødvendige nøgletal (fx omsætning eller resultat). Kontrollér at filen indeholder en komplet resultatopgørelse.";
  }
  return `Rapporten kunne ikke behandles automatisk. Kontrollér at filen er en standard eksport fra dit regnskabsprogram (e-conomic, Dinero, Billy el.lign.).`;
}

const FileUploadZone = ({
  title,
  description,
  accept = ".xlsx,.xls,.csv,.pdf",
  conversationId,
  userId,
  companyId,
  companyName,
  adminMode = false,
  guideDefaultOpen = false,
  onExtracted,
  onPipelineComplete,
}: FileUploadZoneProps) => {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [overwriteDialog, setOverwriteDialog] = useState<{
    open: boolean;
    period: string;
    pendingFile: File | null;
    pendingFileContent: string;
    pendingPageImages?: string[];
    pendingExcelBase64?: string;
    pendingReportId: string;
    pendingFileId: string;
  }>({ open: false, period: "", pendingFile: null, pendingFileContent: "", pendingReportId: "", pendingFileId: "" });

  const updateFile = (fileId: string, updates: Partial<UploadedFile>) => {
    setUploadedFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, ...updates } : f))
    );
  };

  const processFile = useCallback(
    async (file: File) => {
      const fileId = crypto.randomUUID();
      const reportType = "andet";

      setUploadedFiles((prev) => [
        ...prev,
        { id: fileId, name: file.name, size: file.size, status: "uploading" },
      ]);

      try {
        // === STEP 1: Create report record in DB ===
        if (!userId) throw new Error("Du skal være logget ind for at uploade");
        if (!companyId) throw new Error("Din konto er ikke tilknyttet en virksomhed endnu. Prøv at logge ud og ind igen, eller kontakt support.");

        const insertData: any = {
            user_id: userId,
            file_name: file.name,
            file_path: `uploads/${userId}/${fileId}/${file.name}`,
            report_type: reportType,
            status: "processing",
          };
        insertData.company_id = companyId;

        const { data: reportRecord, error: insertError } = await supabase
          .from("financial_reports")
          .insert(insertData)
          .select()
          .single();

        if (insertError || !reportRecord) throw new Error(insertError?.message || "Kunne ikke oprette rapport");
        updateFile(fileId, { reportId: reportRecord.id });

        // === STEP 1b: Upload original file to Storage (MANDATORY) ===
        const storagePath = buildStoragePath(companyId || "unknown", reportRecord.id, file.name);
        const { error: storageError } = await supabase.storage
          .from("financial-documents")
          .upload(storagePath, file, { upsert: true });
        
        if (storageError) {
          console.error("Storage upload failed:", storageError.message);
          await supabase.from("financial_reports").delete().eq("id", reportRecord.id);
          throw new Error("Kunne ikke uploade filen til lageret. Prøv igen.");
        }

        await supabase
          .from("financial_reports")
          .update({ file_path: storagePath } as any)
          .eq("id", reportRecord.id);

        // === STEP 2: Extract data (deterministic template or AI) ===
        updateFile(fileId, { status: "processing" });

        let extractedData: any;
        const ext = file.name.toLowerCase().split(".").pop();

        if (ext === "xlsx" || ext === "xls") {
          try {
            const XLSX = await import("xlsx");
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
            
            if (detectTemplate(workbook)) {
              
              
              await supabase
                .from("financial_reports")
                .update({
                  status: "error",
                  validation_status: "FAIL",
                  validation_errors: ["Denne filtype (multi-sheet regnskabsrapport med DATA + P&L Top Line ark) understøttes ikke endnu. Upload venligst en enkelt-sheet saldobalance/resultatopgørelse."],
                  processed_at: new Date().toISOString(),
                } as any)
                .eq("id", reportRecord.id);

              updateFile(fileId, {
                status: "error",
                errorMessage: "Denne filtype (multi-sheet regnskabsrapport) understøttes ikke endnu. Upload venligst en enkelt-sheet saldobalance/resultatopgørelse.",
              });

              toast.error("Filtype ikke understøttet", {
                description: "Multi-sheet regnskabsrapporter (DATA + P&L Top Line) understøttes ikke endnu. Upload venligst en enkelt-sheet saldobalance/resultatopgørelse.",
              });
              
              onPipelineComplete?.(reportRecord.id);
              return;
            }
          } catch (templateErr) {
            
          }
        }

        if (!extractedData) {
          const extracted = await extractTextFromFile(file);
          const ext2 = file.name.toLowerCase().split(".").pop();
          const isExcel = ext2 === "xlsx" || ext2 === "xls";
          const isPdf = ext2 === "pdf" || file.type === "application/pdf";
          const excelBase64 = isExcel ? await fileToBase64(file) : undefined;

          let pdfStructural: any = undefined;
          if (isPdf) {
            try {
              pdfStructural = await extractPdfStructural(file);
              
            } catch (structErr: any) {
              if (requiresStructuralPdfPayload(extracted.text)) {
                const errMessage = structErr?.message || String(structErr);

                // Password-protected PDFs: give a clear, specific error immediately
                if (errMessage.includes("password")) {
                  updateFile(fileId, {
                    status: "error",
                    errorMessage: "Filen er beskyttet med adgangskode. Eksportér rapporten igen uden adgangskodebeskyttelse, eller upload en Excel-version.",
                  });
                  toast.error("Beskyttet PDF", {
                    description: "Filen kræver en adgangskode og kan ikke læses. Eksportér uden adgangskodebeskyttelse.",
                  });
                  await supabase.from("financial_reports").update({
                    status: "error",
                    validation_errors: ["PDF is password protected"],
                    processed_at: new Date().toISOString(),
                  } as any).eq("id", reportRecord.id);
                  onPipelineComplete?.(reportRecord.id);
                  return;
                }

                const diagnosticMarker = errMessage.includes("worker")
                  ? "pdfjs_worker_loading"
                  : errMessage.includes("password")
                  ? "pdf_password_protected"
                  : errMessage.includes("getTextContent")
                  ? "text_content_extraction"
                  : "payload_construction";

                console.error(`[PdfStructural] FAIL for structural-required source [${diagnosticMarker}]:`, errMessage);

                await supabase.from("financial_reports").update({
                  status: "processed",
                  extraction_contract_version: "v1",
                  quality_signals: {
                    needs_manual_entry: true,
                    has_metrics: false,
                    has_period: false,
                    extraction_method: "structural_client_fail",
                    routing_branch: `structural_client_fail_${diagnosticMarker}`,
                    validation_status: "FAIL",
                    validation_errors: [`PDF structural extraction failed: ${diagnosticMarker}`],
                    canonical_checks: [],
                    ai_eligible: false,
                  },
                  validation_status: "FAIL",
                  validation_errors: [`PDF structural extraction failed: ${diagnosticMarker}`],
                  processed_at: new Date().toISOString(),
                } as any).eq("id", reportRecord.id);

                extractedData = { needs_manual_entry: true, status: "processed" };
                toast("Manuel indtastning påkrævet", {
                  description: "PDF-strukturen kunne ikke læses — du kan indtaste tallene manuelt",
                });
              } else {
                
              }
            }
          }

          const { data: aiData, error: extractError } = await supabase.functions.invoke(
            "extract-financial-data",
            { body: { fileContent: extracted.text, pageImages: extracted.pageImages, excelBase64, pdfStructural, reportId: reportRecord.id, fileName: file.name, knownCompanyName: companyName || undefined } }
          );

          if (extractError) {
            const errMsg = typeof extractError === "object" && "context" in (extractError as any)
              ? (extractError as any).context
              : extractError;
            const dupData = aiData ?? (typeof errMsg === "object" ? errMsg : null);
            
            if (dupData?.duplicate) {
              setOverwriteDialog({
                open: true,
                period: dupData.existing_period,
                pendingFile: file,
                pendingFileContent: extracted.text,
                pendingPageImages: extracted.pageImages,
                pendingExcelBase64: excelBase64,
                pendingReportId: "",
                pendingFileId: fileId,
              });
              return;
            }
            throw extractError;
          }
          if (aiData?.duplicate) {
            setOverwriteDialog({
              open: true,
              period: aiData.existing_period,
              pendingFile: file,
              pendingFileContent: extracted.text,
              pendingPageImages: extracted.pageImages,
              pendingExcelBase64: excelBase64,
              pendingReportId: "",
              pendingFileId: fileId,
            });
            return;
          }
          if (aiData?.error) {
            // Check if the DB was still saved successfully with needs_manual_entry
            // The edge function may return an error in the response body even when
            // the DB record was correctly set to processed+needs_manual_entry.
            const isKnownFallback =
              aiData?.status === "semantic_xlsx_fail" ||
              aiData?.status === "semantic_csv_fail" ||
              aiData?.status === "structural_parse_fail" ||
              aiData?.status === "structural_payload_missing" ||
              aiData?.status === "error" ||
              aiData?.status === "processed" ||
              aiData?.needs_manual_entry === true ||
              aiData?.error?.includes("Known source without supported template") ||
              aiData?.error?.includes("Structural semantic extraction failed") ||
              aiData?.error?.includes("Deterministic parsing failed") ||
              aiData?.error?.includes("AI returned no tool call");

            if (isKnownFallback) {
              
              extractedData = aiData;
            } else {
              const friendlyMsg = getFriendlyErrorMessage(aiData);
              throw new Error(friendlyMsg);
            }
          } else {
            extractedData = aiData;
          }
        }

        updateFile(fileId, { extractedData });
        onExtracted?.(extractedData);

        // Post compact activity: report uploaded (skip in admin mode)
        if (!adminMode && conversationId && userId) {
          const reportLabel = extractedData.report_type === "saldobalance" ? "Saldobalance" : "Resultatopgørelse";
          const period = extractedData.report_period || "ukendt periode";
          const omsaetning = (extractedData as any)?.normalized_data?.omsaetning ?? (extractedData as any)?.extracted_data?.omsaetning ?? null;
          const resultat = (extractedData as any)?.normalized_data?.resultat_foer_skat ?? (extractedData as any)?.extracted_data?.resultat_foer_skat ?? null;
          const lines = [`📄 **${reportLabel}** uploadet for **${period}**`];
          if (omsaetning != null) {
            lines.push(`Omsætning: ${Number(omsaetning).toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.`);
          }
          if (resultat != null) {
            const sign = Number(resultat) >= 0 ? "+" : "";
            lines.push(`Resultat: ${sign}${Number(resultat).toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.`);
          }
          const content = lines.join("\n");
          const messageId = await postActivityMessage({
            conversationId,
            senderId: userId,
            content,
            contextType: "report",
            contextId: reportRecord.id,
            contextMeta: {
              title: `${reportLabel} · ${period}`,
              report_id: reportRecord.id,
              report_period: period,
              file_path: storagePath,
              file_name: file.name,
            },
          });
          if (messageId) {
            notifyReportUpload(reportRecord.id, messageId);
          }
        }

        // === STEP 3: Post-extraction pipeline (RP-2: no auto-AI) ===
        await runPostExtractionPipeline({
          extractedData,
          reportId: reportRecord.id,
          userId: userId!,
          companyId,
          companyName,
          fileId,
          updateFile,
          queryClient,
          toastFn: toast,
          onPipelineComplete,
        });

      } catch (err) {
        console.error("Pipeline error:", err);
        const userMsg = err instanceof Error ? err.message : "Kunne ikke behandle dokumentet";
        updateFile(fileId, {
          status: "error",
          errorMessage: userMsg,
        });
        toast.error("Kunne ikke behandle rapporten", {
          description: userMsg,
        });
      }
    },
    [userId, companyId, conversationId, adminMode, onExtracted, onPipelineComplete]
  );

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
  const ALLOWED_TYPES = [
    "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
  ];
  const ALLOWED_EXTENSIONS = [".pdf", ".xls", ".xlsx", ".csv"];

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((file) => {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          toast.error("Filen er for stor", {
            description: `${file.name} er ${formatFileSize(file.size)}. Maks. 25 MB.`,
          });
          return;
        }

        // Validate file type
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        const isValidType = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(ext);
        if (!isValidType) {
          toast.error("Ikke-understøttet filtype", {
            description: `${file.name} er ikke en gyldig fil. Upload Excel, CSV eller PDF.`,
          });
          return;
        }

        // Check for duplicate (same name already uploading/done)
        const isDuplicate = uploadedFiles.some(
          (f) => f.name === file.name && (f.status === "uploading" || f.status === "processing" || f.status === "analyzing" || f.status === "done")
        );
        if (isDuplicate) {
          toast.error("Duplikat", {
            description: `${file.name} er allerede uploadet.`,
          });
          return;
        }

        const nameLower = file.name.toLowerCase();
        const looksLikeBudget = /budget|forecast|prognose|plan\b/i.test(nameLower);
        if (looksLikeBudget) {
          toast.error("Er dette et budget?", {
            description: `"${file.name}" ligner et budget eller en prognose. Upload kun faktiske regnskabsrapporter — ikke budgetter.`,
          });
        }

        processFile(file);
      });
    },
    [processFile, uploadedFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleClick = () => inputRef.current?.click();

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleOverwrite = useCallback(async () => {
    const { pendingFile, pendingFileContent, pendingPageImages, pendingExcelBase64, pendingFileId } = overwriteDialog;
    setOverwriteDialog((prev) => ({ ...prev, open: false }));

    if (!pendingFile || !userId) return;

    updateFile(pendingFileId, { status: "processing" });

    try {
      // Use "andet" as placeholder — AI determines the real type from content
      const reportType = "andet";

      // Create a new report record for the overwrite
      const insertData: any = {
          user_id: userId,
          file_name: pendingFile.name,
          file_path: `uploads/${userId}/${pendingFileId}/${pendingFile.name}`,
          report_type: reportType,
          status: "processing",
        };
      insertData.company_id = companyId;

      const { data: reportRecord, error: insertError } = await supabase
        .from("financial_reports")
        .insert(insertData)
        .select()
        .single();

      if (insertError || !reportRecord) throw new Error(insertError?.message || "Kunne ikke oprette rapport");
      updateFile(pendingFileId, { reportId: reportRecord.id });

      // Upload original file to storage (mandatory for overwrite too)
      const overwriteStoragePath = buildStoragePath(companyId || "unknown", reportRecord.id, pendingFile.name);
      const { error: storageErr } = await supabase.storage
        .from("financial-documents")
        .upload(overwriteStoragePath, pendingFile, { upsert: true });
      
      if (storageErr) {
        console.error("Overwrite storage upload failed:", storageErr.message);
        await supabase.from("financial_reports").delete().eq("id", reportRecord.id);
        throw new Error("Kunne ikke uploade filen til lageret. Prøv igen.");
      }
      await supabase
        .from("financial_reports")
        .update({ file_path: overwriteStoragePath } as any)
        .eq("id", reportRecord.id);

      const { data: extractedData, error: extractError } = await supabase.functions.invoke(
        "extract-financial-data",
        { body: { fileContent: pendingFileContent, pageImages: pendingPageImages, excelBase64: pendingExcelBase64, reportId: reportRecord.id, fileName: pendingFile.name, overwrite: true, knownCompanyName: companyName || undefined } }
      );

      if (extractError) throw extractError;
      if (extractedData?.error) {
        const isKnownFallback =
          extractedData?.status === "semantic_xlsx_fail" ||
          extractedData?.status === "semantic_csv_fail" ||
          extractedData?.status === "structural_parse_fail" ||
          extractedData?.status === "structural_payload_missing" ||
          extractedData?.status === "error" ||
          extractedData?.status === "processed" ||
          extractedData?.needs_manual_entry === true ||
          extractedData?.error?.includes("Known source without supported template") ||
          extractedData?.error?.includes("Structural semantic extraction failed") ||
          extractedData?.error?.includes("Deterministic parsing failed") ||
          extractedData?.error?.includes("AI returned no tool call");

        if (!isKnownFallback) {
          const friendlyMsg = getFriendlyErrorMessage(extractedData);
          throw new Error(friendlyMsg);
        }
        
      }

      updateFile(pendingFileId, { extractedData });
      onExtracted?.(extractedData);

      // Post compact activity (skip in admin mode)
      if (!adminMode && conversationId && userId) {
        const reportLabel = extractedData.report_type === "saldobalance" ? "Saldobalance" : "Resultatopgørelse";
        const period = extractedData.report_period || "ukendt periode";
        const omsaetning = (extractedData as any)?.normalized_data?.omsaetning ?? (extractedData as any)?.extracted_data?.omsaetning ?? null;
        const resultat = (extractedData as any)?.normalized_data?.resultat_foer_skat ?? (extractedData as any)?.extracted_data?.resultat_foer_skat ?? null;
        const lines = [`📄 Rapport overskrevet: **${reportLabel}** for **${period}**`];
        if (omsaetning != null) {
          lines.push(`Omsætning: ${Number(omsaetning).toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.`);
        }
        if (resultat != null) {
          const sign = Number(resultat) >= 0 ? "+" : "";
          lines.push(`Resultat: ${sign}${Number(resultat).toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.`);
        }
        const content = lines.join("\n");
        const messageId = await postActivityMessage({
          conversationId,
          senderId: userId,
          content,
          contextType: "report",
          contextId: reportRecord.id,
          contextMeta: {
            title: `${reportLabel} · ${period}`,
            report_id: reportRecord.id,
            report_period: period,
            file_path: overwriteStoragePath,
            file_name: pendingFile.name,
          },
        });
        if (messageId) {
          notifyReportUpload(reportRecord.id, messageId);
        }
      }

      // === Post-extraction pipeline (AI + milestones + done) ===
      await runPostExtractionPipeline({
        extractedData,
        reportId: reportRecord.id,
        userId: userId!,
        companyId,
        companyName,
        fileId: pendingFileId,
        updateFile,
        queryClient,
        toastFn: toast,
        onPipelineComplete,
      });
    } catch (err: any) {
      console.error("Overwrite error:", err);
      updateFile(pendingFileId, { status: "error", errorMessage: err.message });
      toast.error("Fejl", { description: err.message });
    }
  }, [overwriteDialog, userId, title, conversationId, onExtracted, onPipelineComplete]);

  const handleCancelOverwrite = () => {
    const { pendingFileId } = overwriteDialog;
    setOverwriteDialog((prev) => ({ ...prev, open: false }));
    removeFile(pendingFileId);
  };

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <h3 className="font-display font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4">{description}</p>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/40 hover:bg-secondary/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          className={`p-3 rounded-xl mb-3 transition-colors ${
            isDragging ? "bg-primary/10" : "bg-muted"
          }`}
        >
          <Upload
            className={`h-6 w-6 transition-colors ${
              isDragging ? "text-primary" : "text-muted-foreground"
            }`}
          />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">
          {isDragging ? "Slip filen her..." : isMobile ? "Tryk for at vælge fil" : "Træk og slip filer her"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isMobile ? "PDF eller Excel fra dit regnskabsprogram" : <>eller <span className="text-primary font-medium">klik for at vælge</span></>}
        </p>
        <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">
          Excel, CSV eller PDF
        </p>
      </div>

      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploadedFiles.map((file) => (
            <div key={file.id}>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 group">
                <div className={`p-2 rounded-lg ${file.status === "error" ? "bg-destructive/10" : "bg-primary/10"}`}>
                  <FileSpreadsheet className={`h-4 w-4 ${file.status === "error" ? "text-destructive" : "text-primary"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  {(file.status === "done" || file.status === "error") && (
                    <p className="text-xs text-muted-foreground">
                      {file.status === "done" && (
                        <span className="flex items-center gap-2">
                          {formatFileSize(file.size)}
                          {file.milestonesCreated ? (
                            <span className="inline-flex items-center gap-1 text-primary">
                              <Target className="h-3 w-3" />
                              {file.milestonesCreated} milestones
                            </span>
                          ) : null}
                        </span>
                      )}
                      {file.status === "error" && (
                        <span className="leading-snug">
                          {file.errorMessage?.includes("ikke genkendt") ? (
                            <span className="text-destructive">{file.errorMessage}</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">
                              {file.errorMessage || "Vi kunne ikke læse filen automatisk."}{" "}
                              <a
                                href="/reports"
                                className="underline font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200"
                              >
                                Gå til Rapportering for at indtaste tallene manuelt →
                              </a>
                            </span>
                          )}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                {file.status === "done" && (
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(file.id);
                  }}
                  className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Prominent fremdriftsindikator for de aktive tilstande */}
              {(file.status === "uploading" || file.status === "processing") && (
                <ParsingProgress status={file.status} />
              )}

              {/* Show extracted data inline */}
              {file.status === "done" && file.extractedData && (
                <ExtractedDataPreview data={file.extractedData} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload guide */}
      <Collapsible defaultOpen={guideDefaultOpen} className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-4">
        <CollapsibleTrigger className="group flex w-full items-center justify-between text-left">
          <span className="text-xs font-medium text-muted-foreground">
            Sådan eksporterer du
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3">
          <div className="mt-3 space-y-2 text-xs">
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="font-medium text-foreground mb-1">e-conomic</p>
              <p className="text-muted-foreground">
                <strong className="text-foreground">Balance Excel</strong> — Regnskab → Rapporter → Balance → Excel (anbefalet)<br />
                <strong className="text-foreground">Saldobalance Excel</strong> — Regnskab → Rapporter → Saldobalance → Excel<br />
                <strong className="text-foreground">Resultatopgørelse PDF</strong> — Regnskab → Rapporter → Resultatopgørelse → PDF
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="font-medium text-foreground mb-1">Dinero</p>
              <p className="text-muted-foreground">
                Rapporter → Resultatopgørelse → Eksportér som CSV eller PDF.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="font-medium text-foreground mb-1">Billy</p>
              <p className="text-muted-foreground">
                Rapporter → Resultatopgørelse → Download Excel.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="font-medium text-foreground mb-1">Andre systemer</p>
              <p className="text-muted-foreground">
                Upload en resultatopgørelse eller saldobalance som PDF eller Excel. Kan vi ikke læse filen automatisk, guider vi dig til at indtaste de vigtigste tal manuelt.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 pt-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Custom-formaterede Excel-rapporter kan give upræcise resultater. Brug standardeksport fra dit regnskabsprogram for bedste resultat.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={overwriteDialog.open} onOpenChange={(open) => !open && handleCancelOverwrite()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rapport allerede indsendt</AlertDialogTitle>
            <AlertDialogDescription>
              Der er allerede indsendt en rapport for <strong>{overwriteDialog.period}</strong>. Vil du overskrive den eksisterende rapport med den nye?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelOverwrite}>Annuller</AlertDialogCancel>
            <AlertDialogAction onClick={handleOverwrite}>Overskriv</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function ExtractedDataPreview({ data }: { data: ExtractedData }) {
  // Compatibility adapter: legacy key_figures → canonical metrics → empty
  const kf: Record<string, number | undefined> = (() => {
    if (data.key_figures && Object.keys(data.key_figures).length > 0) {
      return data.key_figures;
    }
    if (data.metrics) {
      const m = data.metrics;
      return {
        omsaetning: m.revenue ?? undefined,
        daekningsbidrag: m.gross_profit ?? undefined,
        resultat_foer_skat: m.ebt ?? undefined,
        aktiver_i_alt: m.assets_total ?? undefined,
        bank_balance: m.cash ?? undefined,
        kreditorer: m.current_liabilities ?? undefined,
      };
    }
    return {};
  })();

  const formatDKK = (n?: number) =>
    n != null ? `${n.toLocaleString("da-DK")} DKK` : "—";

  // Calculate financial indicators from normalized metrics (if available)
  const normalized = data.normalized_metrics ?? (data.metrics ? {
    cash: data.metrics.cash ?? undefined,
    equity_total: data.metrics.equity_total ?? undefined,
    equity_ratio_pct: data.metrics.equity_ratio_pct ?? undefined,
    trade_receivables: data.metrics.trade_receivables ?? undefined,
    inventory: data.metrics.inventory ?? undefined,
    revenue: data.metrics.revenue ?? undefined,
  } : undefined);
  const hasNegativeCash = normalized?.cash !== undefined && normalized.cash < 0;
  const hasPositiveEquity = normalized?.equity_total !== undefined && normalized.equity_total > 0;
  
  // High working capital = receivables + inventory is high relative to revenue (> 60%)
  const workingCapitalRatio = 
    normalized?.trade_receivables && normalized?.inventory && normalized?.revenue
      ? ((normalized.trade_receivables + normalized.inventory) / normalized.revenue) * 100
      : null;
  const hasHighWorkingCapital = workingCapitalRatio !== null && workingCapitalRatio > 60;

  return (
    <div className="mt-2 p-4 rounded-lg bg-secondary/30 border border-border/50 animate-fade-in space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {data.report_type ?? "Rapport"}
          </p>
          <p className="text-sm font-display font-semibold text-foreground">
            {data.company_name ?? "Ukendt virksomhed"}{" "}
            {data.cvr_number && (
              <span className="text-muted-foreground font-normal">
                · CVR {data.cvr_number}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
            {data.report_period ?? data.report_period_label ?? "—"}
          </span>
          {data.extraction_method === "deterministic" ? (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              Automatisk aflæst
            </span>
          ) : (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              AI-aflæst — gennemgå tal
            </span>
          )}
        </div>
      </div>

            {/* Validation & Financial Indicators */}
            {(() => {
              // For v2 extractions, check extraction_method instead of validation.status
              // Deterministic extractions are always valid by definition
              const isDeterministic = data.extraction_method === "deterministic";
              const validationStatus = data.validation?.status;
              
              if (isDeterministic || validationStatus === "PASS") {
                // Show success badges
                return (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      <CheckCircle2 className="h-3 w-3" />
                      {isDeterministic ? "Automatisk aflæst" : "Data valideret"}
                    </span>
                  {hasPositiveEquity && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      Positiv egenkapital
                    </span>
                  )}
                  {hasNegativeCash && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      Bankovertræk
                    </span>
                  )}
                  {hasHighWorkingCapital && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      Høj kapitalbinding
                    </span>
                  )}
                </div>
              );
              }
              
              // Only show warning if truly not deterministic AND not PASS
              return (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    Vi er ikke sikre på alle tal — gennemgå dem inden godkendelse.
                  </p>
                </div>
              );
            })()}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MiniStat label="Omsætning" value={formatDKK(kf?.omsaetning)} sub={kf?.omsaetning_aar != null ? `Å.t.d: ${formatDKK(kf.omsaetning_aar)}` : undefined} />
        <MiniStat label="Dækningsbidrag" value={formatDKK(kf?.daekningsbidrag)} sub={kf?.daekningsbidrag_aar != null ? `Å.t.d: ${formatDKK(kf.daekningsbidrag_aar)}` : undefined} />
        <MiniStat label="Resultat f. skat" value={formatDKK(kf?.resultat_foer_skat)} sub={kf?.resultat_foer_skat_aar != null ? `Å.t.d: ${formatDKK(kf.resultat_foer_skat_aar)}` : undefined} />
        {kf?.aktiver_i_alt != null && <MiniStat label="Aktiver" value={formatDKK(kf.aktiver_i_alt)} />}
        {kf?.bank_balance != null && <MiniStat label="Bank" value={formatDKK(kf.bank_balance)} />}
        {kf?.kreditorer != null && <MiniStat label="Kreditorer" value={formatDKK(kf.kreditorer)} />}
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-card/50">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-sm font-display font-semibold text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// Tre-trins fremdriftsindikator for de aktive parsing-tilstande.
// Ren præsentation af status der allerede findes — skriver aldrig status.
const PARSING_STEPS: { key: "uploading" | "processing"; label: string }[] = [
  { key: "uploading", label: "Uploader filen" },
  { key: "processing", label: "Læser tallene i dit regnskab" },
];

function ParsingProgress({ status }: { status: "uploading" | "processing" }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const currentIndex = PARSING_STEPS.findIndex((s) => s.key === status);

  return (
    <div className="mt-2 p-4 rounded-lg border border-border bg-card/50">
      <div className="flex items-start">
        {PARSING_STEPS.map((step, i) => {
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;
          return (
            <Fragment key={step.key}>
              <div className="flex flex-col items-center gap-1.5 text-center w-24 flex-shrink-0">
                <div
                  className={`flex items-center justify-center h-9 w-9 rounded-full border-2 transition-colors ${
                    isDone
                      ? "bg-primary border-primary text-primary-foreground"
                      : isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-transparent text-muted-foreground"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-xs font-medium">{i + 1}</span>
                  )}
                </div>
                <span
                  className={`text-[11px] leading-tight ${
                    isActive
                      ? "text-foreground font-medium"
                      : isDone
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < PARSING_STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mt-[17px] rounded transition-colors ${
                    i < currentIndex ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </Fragment>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground text-center">
        {elapsed} sek. <span className="text-muted-foreground/70">(typisk 20-40 sek.)</span>
      </p>
    </div>
  );
}

export default FileUploadZone;
