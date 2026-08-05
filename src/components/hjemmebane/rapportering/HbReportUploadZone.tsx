import * as React from "react";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { notifyReportUpload } from "@/lib/reportNotify";
import { buildStoragePath } from "@/lib/reportFileAccess";
import { detectTemplate } from "@/lib/excelTemplates";
import { extractPdfStructural } from "@/lib/pdfStructuralExtractor";
import {
  extractTextFromFile,
  fileToBase64,
  getFriendlyErrorMessage,
  requiresStructuralPdfPayload,
  runPostExtractionPipeline,
  type UploadedFile,
} from "@/lib/reportUploadEngine";
import { HbCard } from "../HbCard";

/** Hb-upload-zonen (rapportering-design §a4): NYT roligt UI over det
    udskilte maskinlag — samme orkestrering som FileUploadZone.processFile
    (insert → storage → klient-ekstraktion → extract-financial-data →
    runPostExtractionPipeline), samme duplicate/overwrite-flow (inline
    bekræftelse, ingen portal-dialog). Fladens egne beskeder er stille
    tekstlinjer; engine-lagets kvitteringer (pipeline-toasts) består som
    bogført bro-vilkår. A1-reglen bor i engine — her skrives ALDRIG status
    ud over de fejlveje, gamle processFile også skriver. */

interface HbReportUploadZoneProps {
  userId: string | null;
  companyId: string | null;
  companyName: string | null;
  conversationId: string | null;
  onPipelineComplete?: (reportId?: string) => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = [".pdf", ".xls", ".xlsx", ".csv"];

const statusLine = (file: UploadedFile): string => {
  switch (file.status) {
    case "uploading":
      return "Uploader…";
    case "processing":
    case "analyzing":
      return "Behandles…";
    case "done":
      return "Klar — se rapporten i listen nedenfor";
    case "error":
      return file.errorMessage || "Kunne ikke behandles";
  }
};

export const HbReportUploadZone = ({
  userId,
  companyId,
  companyName,
  conversationId,
  onPipelineComplete,
}: HbReportUploadZoneProps) => {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [duplicate, setDuplicate] = useState<{
    period: string;
    file: File;
    fileContent: string;
    pageImages?: string[];
    excelBase64?: string;
    fileId: string;
  } | null>(null);

  const updateFile = (fileId: string, updates: Partial<UploadedFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, ...updates } : f)));
  };

  const processFile = useCallback(
    async (file: File) => {
      const fileId = crypto.randomUUID();
      setFiles((prev) => [...prev, { id: fileId, name: file.name, size: file.size, status: "uploading" }]);

      try {
        if (!userId) throw new Error("Du skal være logget ind for at uploade");
        if (!companyId) throw new Error("Din konto er ikke tilknyttet en virksomhed endnu. Prøv at logge ud og ind igen, eller kontakt support.");

        // === STEP 1: opret rapport-række (status skrives af serveren herfra — A1) ===
        const { data: reportRecord, error: insertError } = await supabase
          .from("financial_reports")
          .insert({
            user_id: userId,
            file_name: file.name,
            file_path: `uploads/${userId}/${fileId}/${file.name}`,
            report_type: "andet",
            status: "processing",
            company_id: companyId,
          } as any)
          .select()
          .single();
        if (insertError || !reportRecord) throw new Error(insertError?.message || "Kunne ikke oprette rapport");
        updateFile(fileId, { reportId: reportRecord.id });

        // === STEP 1b: upload originalfilen (obligatorisk) ===
        const storagePath = buildStoragePath(companyId, reportRecord.id, file.name);
        const { error: storageError } = await supabase.storage
          .from("financial-documents")
          .upload(storagePath, file, { upsert: true });
        if (storageError) {
          await supabase.from("financial_reports").delete().eq("id", reportRecord.id);
          throw new Error("Kunne ikke uploade filen til lageret. Prøv igen.");
        }
        await supabase.from("financial_reports").update({ file_path: storagePath } as any).eq("id", reportRecord.id);

        // === STEP 2: klient-ekstraktion (samme grene som gamle processFile) ===
        updateFile(fileId, { status: "processing" });
        const ext = file.name.toLowerCase().split(".").pop();

        if (ext === "xlsx" || ext === "xls") {
          try {
            const XLSX = await import("xlsx");
            const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
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
              onPipelineComplete?.(reportRecord.id);
              return;
            }
          } catch {
            /* template-detektion er best-effort */
          }
        }

        const extracted = await extractTextFromFile(file);
        const isExcel = ext === "xlsx" || ext === "xls";
        const isPdf = ext === "pdf" || file.type === "application/pdf";
        const excelBase64 = isExcel ? await fileToBase64(file) : undefined;

        let extractedData: any;
        let pdfStructural: any = undefined;
        if (isPdf) {
          try {
            pdfStructural = await extractPdfStructural(file);
          } catch (structErr: any) {
            if (requiresStructuralPdfPayload(extracted.text)) {
              const errMessage = structErr?.message || String(structErr);
              if (errMessage.includes("password")) {
                updateFile(fileId, {
                  status: "error",
                  errorMessage: "Filen er beskyttet med adgangskode. Eksportér rapporten igen uden adgangskodebeskyttelse, eller upload en Excel-version.",
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
            }
          }
        }

        if (!extractedData) {
          const { data: aiData, error: extractError } = await supabase.functions.invoke(
            "extract-financial-data",
            { body: { fileContent: extracted.text, pageImages: extracted.pageImages, excelBase64, pdfStructural, reportId: reportRecord.id, fileName: file.name, knownCompanyName: companyName || undefined } },
          );

          const dupData = extractError
            ? (aiData ?? (typeof (extractError as any)?.context === "object" ? (extractError as any).context : null))
            : aiData;
          if (dupData?.duplicate) {
            setDuplicate({
              period: dupData.existing_period,
              file,
              fileContent: extracted.text,
              pageImages: extracted.pageImages,
              excelBase64,
              fileId,
            });
            return;
          }
          if (extractError) throw extractError;

          if (aiData?.error) {
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
              throw new Error(getFriendlyErrorMessage(aiData));
            }
          } else {
            extractedData = aiData;
          }
        }

        updateFile(fileId, { extractedData });
        if (conversationId && userId) {
          notifyReportUpload(reportRecord.id, crypto.randomUUID());
        }

        // === STEP 3: delt post-extraction pipeline (engine) ===
        await runPostExtractionPipeline({
          extractedData,
          reportId: reportRecord.id,
          userId,
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
        updateFile(fileId, { status: "error", errorMessage: userMsg });
      }
    },
    [userId, companyId, companyName, conversationId, onPipelineComplete, queryClient],
  );

  /** Overskriv (duplicate-flowet) — samme trin som FileUploadZone.handleOverwrite. */
  const confirmOverwrite = useCallback(async () => {
    if (!duplicate || !userId) return;
    const { file, fileContent, pageImages, excelBase64, fileId } = duplicate;
    setDuplicate(null);
    updateFile(fileId, { status: "processing" });

    try {
      const { data: reportRecord, error: insertError } = await supabase
        .from("financial_reports")
        .insert({
          user_id: userId,
          file_name: file.name,
          file_path: `uploads/${userId}/${fileId}/${file.name}`,
          report_type: "andet",
          status: "processing",
          company_id: companyId,
        } as any)
        .select()
        .single();
      if (insertError || !reportRecord) throw new Error(insertError?.message || "Kunne ikke oprette rapport");
      updateFile(fileId, { reportId: reportRecord.id });

      const storagePath = buildStoragePath(companyId || "unknown", reportRecord.id, file.name);
      const { error: storageErr } = await supabase.storage
        .from("financial-documents")
        .upload(storagePath, file, { upsert: true });
      if (storageErr) {
        await supabase.from("financial_reports").delete().eq("id", reportRecord.id);
        throw new Error("Kunne ikke uploade filen til lageret. Prøv igen.");
      }
      await supabase.from("financial_reports").update({ file_path: storagePath } as any).eq("id", reportRecord.id);

      const { data: extractedData, error: extractError } = await supabase.functions.invoke(
        "extract-financial-data",
        { body: { fileContent, pageImages, excelBase64, reportId: reportRecord.id, fileName: file.name, overwrite: true, knownCompanyName: companyName || undefined } },
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
        if (!isKnownFallback) throw new Error(getFriendlyErrorMessage(extractedData));
      }

      updateFile(fileId, { extractedData });
      await runPostExtractionPipeline({
        extractedData,
        reportId: reportRecord.id,
        userId,
        companyId,
        companyName,
        fileId,
        updateFile,
        queryClient,
        toastFn: toast,
        onPipelineComplete,
      });
    } catch (err) {
      const userMsg = err instanceof Error ? err.message : "Kunne ikke behandle dokumentet";
      updateFile(fileId, { status: "error", errorMessage: userMsg });
    }
  }, [duplicate, userId, companyId, companyName, onPipelineComplete, queryClient]);

  const cancelOverwrite = () => {
    if (duplicate) {
      updateFile(duplicate.fileId, { status: "error", errorMessage: "Upload annulleret — perioden findes allerede." });
    }
    setDuplicate(null);
  };

  const handleFiles = (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      const ext = `.${file.name.toLowerCase().split(".").pop()}`;
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setFiles((prev) => [
          ...prev,
          { id: crypto.randomUUID(), name: file.name, size: file.size, status: "error", errorMessage: "Filtypen understøttes ikke — upload PDF, Excel eller CSV." },
        ]);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFiles((prev) => [
          ...prev,
          { id: crypto.randomUUID(), name: file.name, size: file.size, status: "error", errorMessage: "Filen er for stor (maks. 25 MB)." },
        ]);
        continue;
      }
      void processFile(file);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full items-center gap-4 rounded-hb border border-dashed px-6 py-6 text-left transition-colors",
          dragOver ? "border-hb-evergreen bg-hb-sage/40" : "border-hb-line bg-hb-surface hover:bg-hb-sage/20",
        )}
      >
        <FileUp className="h-5 w-5 shrink-0 text-hb-ink-soft" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] text-hb-ink">Upload din månedsrapport</span>
          <span className="block text-sm text-hb-ink-soft">
            Saldobalance eller resultatopgørelse — PDF, Excel eller CSV. Klik eller træk hertil.
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {duplicate && (
        <HbCard className="mt-3 flex flex-wrap items-center gap-3 p-4">
          <p className="min-w-0 flex-1 text-sm text-hb-ink">
            Der findes allerede en rapport for {duplicate.period}. Vil du overskrive den?
          </p>
          <button
            type="button"
            onClick={() => void confirmOverwrite()}
            className="shrink-0 rounded-full bg-hb-evergreen px-4 py-1.5 text-sm font-medium text-white hover:bg-hb-evergreen/90"
          >
            Overskriv
          </button>
          <button
            type="button"
            onClick={cancelOverwrite}
            className="shrink-0 px-2 text-sm text-hb-ink-soft hover:text-hb-ink"
          >
            Fortryd
          </button>
        </HbCard>
      )}

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 rounded-lg border border-hb-line bg-hb-surface px-4 py-2.5">
              {(file.status === "uploading" || file.status === "processing" || file.status === "analyzing") && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-hb-ink-soft" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-hb-ink">{file.name}</span>
                <span className={cn("block text-xs", file.status === "error" ? "text-hb-rust" : "text-hb-ink-soft")}>
                  {statusLine(file)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
