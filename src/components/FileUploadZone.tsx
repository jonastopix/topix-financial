import { useCallback, useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, CheckCircle2, Loader2, Sparkles, Target, Info, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { postActivityMessage } from "@/lib/chatActivity";
import { createAdvisorNotification } from "@/lib/advisorNotifications";
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import { detectTemplate, extractKJAutoTemplate, templateResultToExtractedData } from "@/lib/excelTemplates";
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

// Set worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

interface ExtractedData {
  report_type: string;
  report_period: string;
  company_name: string;
  cvr_number: string;
  key_figures: Record<string, number>;
  line_items: Array<{ name: string; period_amount: number; ytd_amount: number }>;
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
  onExtracted?: (data: ExtractedData) => void;
  onPipelineComplete?: () => void;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

async function extractPdfPageImages(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];
  
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High res for readability
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    // Convert to JPEG for smaller payload
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];
    images.push(base64);
  }
  
  console.log(`PDF rendered ${images.length} page images`);
  return images;
}

async function extractTextFromFile(file: File): Promise<{ text: string; pageImages?: string[] }> {
  const ext = file.name.toLowerCase().split(".").pop();

  // ── PDF: vision-based extraction ──
  if (file.type === "application/pdf" || ext === "pdf") {
    try {
      const pageImages = await extractPdfPageImages(file);
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

  // ── Excel (.xlsx / .xls): parse with SheetJS to readable CSV ──
  if (ext === "xlsx" || ext === "xls") {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const csvParts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
        csvParts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
      }
      const fullText = csvParts.join("\n\n");
      console.log(`Excel parsed via SheetJS: ${fullText.length} chars, first 200: ${fullText.slice(0, 200)}`);
      return { text: fullText.slice(0, 30000) };
    } catch (err) {
      console.error("SheetJS parse failed, falling back to raw text:", err);
    }
  }

  // ── CSV / other text files ──
  const text = await file.text();
  return { text: text.slice(0, 30000) };
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
  onExtracted,
  onPipelineComplete,
}: FileUploadZoneProps) => {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [overwriteDialog, setOverwriteDialog] = useState<{
    open: boolean;
    period: string;
    pendingFile: File | null;
    pendingFileContent: string;
    pendingPageImages?: string[];
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
      // Use "andet" as placeholder — AI determines the real type from content and updates DB
      const reportType = "andet";

      setUploadedFiles((prev) => [
        ...prev,
        { id: fileId, name: file.name, size: file.size, status: "uploading" },
      ]);

      try {
        // === STEP 1: Create report record in DB ===
        if (!userId) throw new Error("Du skal være logget ind for at uploade");

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

        // === STEP 1b: Upload original file to Storage ===
        const storagePath = `${companyId}/${reportRecord.id}/${file.name}`;
        const { error: storageError } = await supabase.storage
          .from("financial-documents")
          .upload(storagePath, file, { upsert: true });
        
        if (!storageError) {
          // Update file_path in DB to the actual storage path
          await supabase
            .from("financial_reports")
            .update({ file_path: storagePath } as any)
            .eq("id", reportRecord.id);
        } else {
          console.warn("Storage upload failed (continuing pipeline):", storageError.message);
        }

        // === STEP 2: Extract data (deterministic template or AI) ===
        updateFile(fileId, { status: "processing" });

        let extractedData: any;
        const ext = file.name.toLowerCase().split(".").pop();

        // Try deterministic template extraction for Excel files
        if (ext === "xlsx" || ext === "xls") {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: "array" });

            if (detectTemplate(workbook)) {
              console.log("🔧 Template detected: KJ_AUTO_REGNSKABSRAPPORT_V1 — using deterministic extraction");
              const templateResult = extractKJAutoTemplate(workbook);
              console.log("Template extraction result:", templateResult.status, templateResult.errors);

              if (templateResult.status === "PASS") {
                const deterministicData = templateResultToExtractedData(templateResult);
                if (deterministicData) {
                  // Save extracted data directly to DB
                  const { error: updateError } = await supabase
                    .from("financial_reports")
                    .update({
                      extracted_data: deterministicData as any,
                      report_period: deterministicData.report_period,
                      report_type: deterministicData.report_type,
                      company_name: deterministicData.company_name,
                      cvr_number: deterministicData.cvr_number,
                      status: "processed",
                      processed_at: new Date().toISOString(),
                    } as any)
                    .eq("id", reportRecord.id);

                  if (updateError) {
                    console.error("DB update error after deterministic extraction:", updateError);
                    throw new Error("Kunne ikke gemme deterministisk data: " + updateError.message);
                  }

                  extractedData = deterministicData;
                  console.log("✅ Deterministic extraction successful:", deterministicData.report_period, deterministicData.company_name);
                }
              } else {
                console.warn("⚠️ Template detected but extraction FAILED, falling back to AI:", templateResult.errors);
              }
            }
          } catch (templateErr) {
            console.warn("Template extraction error, falling back to AI:", templateErr);
          }
        }

        // Fallback: AI-based extraction
        if (!extractedData) {
          const extracted = await extractTextFromFile(file);

          // In adminMode, always overwrite duplicates automatically
          const { data: aiData, error: extractError } = await supabase.functions.invoke(
            "extract-financial-data",
            { body: { fileContent: extracted.text, pageImages: extracted.pageImages, reportId: reportRecord.id, fileName: file.name, overwrite: adminMode, knownCompanyName: companyName || undefined } }
          );

          // Handle duplicate (409)
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
              pendingReportId: "",
              pendingFileId: fileId,
            });
            return;
          }
          if (aiData?.error) throw new Error(aiData.error);

          extractedData = aiData;
        }

        updateFile(fileId, { extractedData });
        onExtracted?.(extractedData);

        // Post activity: report uploaded (skip in admin mode)
        if (!adminMode && conversationId && userId) {
          const reportLabel = extractedData.report_type === "saldobalance" ? "Saldobalance" : "Resultatopgørelse";
          await postActivityMessage({
            conversationId,
            senderId: userId,
            content: `📄 Ny rapport uploadet: **${reportLabel}** for ${extractedData.report_period}\n${extractedData.company_name} · CVR ${extractedData.cvr_number}`,
            contextType: "report",
            contextId: reportRecord.id,
            contextMeta: { title: `${reportLabel} · ${extractedData.report_period}` },
          });
        }

        // Create advisor notification (skip in admin mode)
        if (!adminMode && userId && companyId) {
          const reportLabel = extractedData.report_type === "saldobalance" ? "Saldobalance" : "Resultatopgørelse";
          await createAdvisorNotification({
            type: "report_uploaded",
            title: `Ny ${reportLabel.toLowerCase()} fra ${extractedData.company_name || "medlem"}`,
            body: `${reportLabel} for ${extractedData.report_period}`,
            companyId,
            memberId: userId,
            referenceId: reportRecord.id,
            referenceType: "report",
          });
        }

        // === STEP 3: AI Financial Analysis ===
        updateFile(fileId, { status: "analyzing" });

        // Fetch historical reports for trend analysis
        const historicalQuery = companyId
          ? (supabase.from("financial_reports").select("extracted_data, report_period") as any).eq("company_id", companyId).eq("status", "processed").is("deleted_at", null).neq("id", reportRecord.id).order("uploaded_at", { ascending: true }).limit(12)
          : supabase.from("financial_reports").select("extracted_data, report_period").eq("user_id", userId).eq("status", "processed").is("deleted_at", null).neq("id", reportRecord.id).order("uploaded_at", { ascending: true }).limit(12);
        const { data: historicalReports } = await historicalQuery;

        const historicalData = (historicalReports || [])
          .filter((r) => r.extracted_data)
          .map((r) => {
            const ed = r.extracted_data as any;
            return { period: r.report_period || ed?.report_period, ...ed?.key_figures };
          });

        const { data: analysis, error: aiError } = await supabase.functions.invoke(
          "ai-financial-feedback",
          {
            body: {
              financialData: extractedData.key_figures,
              historicalData: historicalData.length > 0 ? historicalData : undefined,
              companyContext: {
                name: companyName || extractedData.company_name,
                cvr: extractedData.cvr_number,
              },
              companyId: companyId,
            },
          }
        );

        if (aiError) {
          console.error("AI feedback error:", aiError);
          // Don't fail the whole pipeline - report is saved
        }

        // === STEP 3b: Save AI analysis to DB ===
        if (analysis && !analysis.error) {
          await supabase
            .from("financial_reports")
            .update({ ai_analysis: analysis } as any)
            .eq("id", reportRecord.id);
        }

        // === STEP 4: Create milestones from AI findings ===
        let milestonesCreated = 0;
        if (analysis && !analysis.error && analysis.key_findings) {
          const milestonesToCreate = analysis.key_findings
            .filter((f: any) => f.severity === "advarsel" || f.severity === "kritisk")
            .slice(0, 3)
            .map((f: any) => {
              const ms: any = {
                user_id: userId,
                title: f.recommendation?.slice(0, 200) || f.title,
                description: f.analysis,
                source: "ai",
                source_report: reportRecord.id,
                status: "active",
                progress: 0,
              };
              ms.company_id = companyId;
              return ms;
            });

          if (milestonesToCreate.length > 0) {
            const { error: msError } = await supabase
              .from("milestones")
              .insert(milestonesToCreate as any);
            if (!msError) milestonesCreated = milestonesToCreate.length;
          }
        }

        // === STEP 5: Post AI analysis to chat (skip in admin mode) ===
        if (!adminMode && analysis && !analysis.error && conversationId && userId) {
          const summaryParts: string[] = [];
          summaryParts.push(`📊 **AI Finansiel Analyse · ${extractedData.report_period}**\n`);
          summaryParts.push(analysis.overview || "");

          if (analysis.key_findings?.length > 0) {
            summaryParts.push(`\n\n**Nøglefund:**`);
            analysis.key_findings.forEach((f: any, i: number) => {
              const icon = f.severity === "positiv" ? "✅" : f.severity === "advarsel" ? "⚠️" : "🔴";
              summaryParts.push(`${icon} ${i + 1}. ${f.title} — ${f.recommendation}`);
            });
          }

          if (analysis.next_steps?.length > 0) {
            summaryParts.push(`\n\n**Næste skridt:**`);
            analysis.next_steps.forEach((s: string, i: number) => {
              summaryParts.push(`${i + 1}. ${s}`);
            });
          }

          if (milestonesCreated > 0) {
            summaryParts.push(`\n\n🎯 ${milestonesCreated} nye milestones er automatisk oprettet.`);
          }

          await postActivityMessage({
            conversationId,
            senderId: userId,
            content: summaryParts.join("\n"),
            contextType: "report",
            contextId: reportRecord.id,
            contextMeta: { title: `AI Analyse · ${extractedData.report_period}` },
          });
        }

        // === DONE ===
        updateFile(fileId, { status: "done", milestonesCreated });
        // Invalidate all financial data queries so dashboard, charts, KPIs update immediately
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
        queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
        queryClient.invalidateQueries({ queryKey: ["financial-reports-chart"] });
        onPipelineComplete?.();

        toast({
          title: "Rapport behandlet",
          description: `${extractedData.report_type === "saldobalance" ? "Saldobalance" : "Resultatopgørelse"} for ${extractedData.report_period}${analysis && !analysis.error ? " · AI-analyse gennemført" : ""}${milestonesCreated > 0 ? ` · ${milestonesCreated} milestones oprettet` : ""}`,
        });
      } catch (err) {
        console.error("Pipeline error:", err);
        updateFile(fileId, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Ukendt fejl",
        });
        toast({
          title: "Fejl ved behandling",
          description: err instanceof Error ? err.message : "Kunne ikke behandle dokumentet",
          variant: "destructive",
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
          toast({
            title: "Filen er for stor",
            description: `${file.name} er ${formatFileSize(file.size)}. Maks. 25 MB.`,
            variant: "destructive",
          });
          return;
        }

        // Validate file type
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        const isValidType = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(ext);
        if (!isValidType) {
          toast({
            title: "Ikke-understøttet filtype",
            description: `${file.name} er ikke en gyldig fil. Upload Excel, CSV eller PDF.`,
            variant: "destructive",
          });
          return;
        }

        // Check for duplicate (same name already uploading/done)
        const isDuplicate = uploadedFiles.some(
          (f) => f.name === file.name && (f.status === "uploading" || f.status === "processing" || f.status === "analyzing" || f.status === "done")
        );
        if (isDuplicate) {
          toast({
            title: "Duplikat",
            description: `${file.name} er allerede uploadet.`,
            variant: "destructive",
          });
          return;
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
    const { pendingFile, pendingFileContent, pendingPageImages, pendingFileId } = overwriteDialog;
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

      const { data: extractedData, error: extractError } = await supabase.functions.invoke(
        "extract-financial-data",
        { body: { fileContent: pendingFileContent, pageImages: pendingPageImages, reportId: reportRecord.id, fileName: pendingFile.name, overwrite: true, knownCompanyName: companyName || undefined } }
      );

      if (extractError) throw extractError;
      if (extractedData?.error) throw new Error(extractedData.error);

      updateFile(pendingFileId, { extractedData });
      onExtracted?.(extractedData);

      // Post activity (skip in admin mode)
      if (!adminMode && conversationId && userId) {
        const reportLabel = extractedData.report_type === "saldobalance" ? "Saldobalance" : "Resultatopgørelse";
        await postActivityMessage({
          conversationId,
          senderId: userId,
          content: `📄 Rapport overskrevet: **${reportLabel}** for ${extractedData.report_period}\n${extractedData.company_name} · CVR ${extractedData.cvr_number}`,
          contextType: "report",
          contextId: reportRecord.id,
          contextMeta: { title: `${reportLabel} · ${extractedData.report_period}` },
        });
      }

      updateFile(pendingFileId, { status: "done" });
      // Invalidate all financial data queries
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
      queryClient.invalidateQueries({ queryKey: ["financial-reports-chart"] });
      toast({ title: "Rapport overskrevet", description: `Rapporten for ${extractedData.report_period} er blevet opdateret.` });
      onPipelineComplete?.();
    } catch (err: any) {
      console.error("Overwrite error:", err);
      updateFile(pendingFileId, { status: "error", errorMessage: err.message });
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
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
          {isDragging ? "Slip filen her..." : "Træk og slip filer her"}
        </p>
        <p className="text-xs text-muted-foreground">
          eller <span className="text-primary font-medium">klik for at vælge</span>
        </p>
        <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">
          Excel, CSV eller PDF
        </p>
      </div>

      {/* Upload guide */}
      <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="text-xs font-medium text-foreground">Anbefalede filtyper</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { name: "e-conomic", desc: "Saldobalance / Resultatopgørelse" },
            { name: "Dinero", desc: "Resultatopgørelse (PDF/Excel)" },
            { name: "Billy", desc: "Resultatopgørelse (Excel)" },
          ].map((s) => (
            <div key={s.name} className="flex items-start gap-2 rounded-md bg-background/60 border border-border/40 px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">{s.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 pt-1">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Custom-formaterede Excel-rapporter kan give upræcise resultater. Brug standardeksport fra dit regnskabsprogram for bedste resultat.
          </p>
        </div>
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
                  <p className="text-xs text-muted-foreground">
                    {file.status === "uploading" && "Opretter rapport..."}
                    {file.status === "processing" && "Udtrækker nøgletal..."}
                    {file.status === "analyzing" && (
                      <span className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-primary" />
                        Genererer AI-analyse og milestones...
                      </span>
                    )}
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
                    {file.status === "error" && (file.errorMessage || "Fejl")}
                  </p>
                </div>
                {(file.status === "uploading" || file.status === "processing" || file.status === "analyzing") && (
                  <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
                )}
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

              {/* Show extracted data inline */}
              {file.status === "done" && file.extractedData && (
                <ExtractedDataPreview data={file.extractedData} />
              )}
            </div>
          ))}
        </div>
      )}

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
  const kf = data.key_figures;
  const formatDKK = (n?: number) =>
    n != null ? `${n.toLocaleString("da-DK")} DKK` : "—";

  return (
    <div className="mt-2 p-4 rounded-lg bg-secondary/30 border border-border/50 animate-fade-in space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {data.report_type}
          </p>
          <p className="text-sm font-display font-semibold text-foreground">
            {data.company_name}{" "}
            <span className="text-muted-foreground font-normal">
              · CVR {data.cvr_number}
            </span>
          </p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {data.report_period}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MiniStat label="Omsætning" value={formatDKK(kf.omsaetning)} sub={`Å.t.d: ${formatDKK(kf.omsaetning_aar)}`} />
        <MiniStat label="Dækningsbidrag" value={formatDKK(kf.daekningsbidrag)} sub={`Å.t.d: ${formatDKK(kf.daekningsbidrag_aar)}`} />
        <MiniStat label="Resultat f. skat" value={formatDKK(kf.resultat_foer_skat)} sub={`Å.t.d: ${formatDKK(kf.resultat_foer_skat_aar)}`} />
        {kf.aktiver_i_alt != null && <MiniStat label="Aktiver" value={formatDKK(kf.aktiver_i_alt)} />}
        {kf.bank_balance != null && <MiniStat label="Bank" value={formatDKK(kf.bank_balance)} />}
        {kf.kreditorer != null && <MiniStat label="Kreditorer" value={formatDKK(kf.kreditorer)} />}
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

export default FileUploadZone;
