/**
 * Rapport-uploadens MASKINLAG — udskilt fra FileUploadZone.tsx som REN
 * FLYTNING (rapportering-design-blokken §a4): funktionskropperne er
 * identiske, inkl. A1-kommentarerne ordret. Deles af FileUploadZone
 * (gammelt UI, BulkImport/gamle Reports — adfærd uændret) og
 * HbReportUploadZone (den nye rapporterings-flade).
 * A1-reglen er lagets grundlov: frontend must NEVER overwrite DB status.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExtractedData {
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

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "processing" | "analyzing" | "done" | "error";
  extractedData?: ExtractedData;
  errorMessage?: string;
  reportId?: string;
  milestonesCreated?: number;
}

/**
 * Returns true ONLY for the e-conomic resultatopgørelse PDF family.
 * These PDFs require a structural payload — if extraction fails, the upload must stop client-side.
 * False for e-conomic saldobalance, Dinero, and unknown PDFs.
 */
export function requiresStructuralPdfPayload(rawText: string): boolean {
  if (!/secure\.e-conomic\.com/i.test(rawText)) return false;
  if (/saldobalance/i.test(rawText)) return false;
  if (/\bAKTIVER\b/i.test(rawText) || /\bPASSIVER\b/i.test(rawText)) return false;
  if (/resultatopg/i.test(rawText)) return true;
  return false;
}

// ── Shared post-extraction pipeline (RP-2: no auto-AI, commentary is now explicit post-commit) ──
// Used by BOTH main upload and overwrite flows to avoid divergence.
export async function runPostExtractionPipeline(params: {
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
      description: `${extractedData.report_type === "saldobalance" ? "Saldobalance" : "Resultatopgørelse"} for ${extractedData.report_period} — gennemgangen åbner automatisk`,
    });
  }
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function extractPdfPageImages(file: File): Promise<string[]> {
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

export async function extractTextFromFile(file: File): Promise<{ text: string; pageImages?: string[] }> {
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

export function getFriendlyErrorMessage(data: any): string {
  const err = data?.error || "";
  const source = data?.source_system || "";
  const status = data?.status || "";
  const systemLabel = (s: string) =>
    s === "economic" ? "e-conomic"
    : s === "dinero" ? "Dinero"
    : s === "combined_dk" ? "e-conomic"
    : s || "dit regnskabsprogram";
  // Periode-gate fra server: vis den klare besked uændret i stedet for den generiske default
  if (status === "period_not_completed" && err) {
    return err;
  }
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
