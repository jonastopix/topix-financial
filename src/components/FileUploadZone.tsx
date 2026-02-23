import { useCallback, useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, CheckCircle2, Loader2, Sparkles, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { postActivityMessage } from "@/lib/chatActivity";

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
  onExtracted?: (data: ExtractedData) => void;
  onPipelineComplete?: () => void;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

async function extractTextFromFile(file: File): Promise<string> {
  const text = await file.text();
  if (file.type === "application/pdf") {
    const readable = text
      .replace(/[^\x20-\x7E\xC0-\xFF\n\r\tæøåÆØÅ.,\-()]/g, " ")
      .replace(/\s{3,}/g, "\n")
      .trim();
    return readable.slice(0, 15000);
  }
  return text.slice(0, 15000);
}

const FileUploadZone = ({
  title,
  description,
  accept = ".xlsx,.xls,.csv,.pdf",
  conversationId,
  userId,
  onExtracted,
  onPipelineComplete,
}: FileUploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateFile = (fileId: string, updates: Partial<UploadedFile>) => {
    setUploadedFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, ...updates } : f))
    );
  };

  const processFile = useCallback(
    async (file: File) => {
      const fileId = crypto.randomUUID();
      const reportType = title.toLowerCase().includes("saldo") ? "saldobalance" : "resultatopgørelse";

      setUploadedFiles((prev) => [
        ...prev,
        { id: fileId, name: file.name, size: file.size, status: "uploading" },
      ]);

      try {
        // === STEP 1: Create report record in DB ===
        if (!userId) throw new Error("Du skal være logget ind for at uploade");

        const { data: reportRecord, error: insertError } = await supabase
          .from("financial_reports")
          .insert({
            user_id: userId,
            file_name: file.name,
            file_path: `uploads/${userId}/${fileId}/${file.name}`,
            report_type: reportType,
            status: "processing",
          })
          .select()
          .single();

        if (insertError || !reportRecord) throw new Error(insertError?.message || "Kunne ikke oprette rapport");
        updateFile(fileId, { reportId: reportRecord.id });

        // === STEP 2: Extract data via AI ===
        updateFile(fileId, { status: "processing" });
        const fileContent = await extractTextFromFile(file);

        const { data: extractedData, error: extractError } = await supabase.functions.invoke(
          "extract-financial-data",
          { body: { fileContent, reportId: reportRecord.id, fileName: file.name } }
        );

        if (extractError) throw extractError;
        if (extractedData?.error) throw new Error(extractedData.error);

        updateFile(fileId, { extractedData });
        onExtracted?.(extractedData);

        // Post activity: report uploaded
        if (conversationId && userId) {
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

        // === STEP 3: AI Financial Analysis ===
        updateFile(fileId, { status: "analyzing" });

        // Fetch historical reports for trend analysis
        const { data: historicalReports } = await supabase
          .from("financial_reports")
          .select("extracted_data, report_period")
          .eq("user_id", userId)
          .eq("status", "processed")
          .neq("id", reportRecord.id)
          .order("uploaded_at", { ascending: true })
          .limit(12);

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
                name: extractedData.company_name,
                cvr: extractedData.cvr_number,
              },
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
            .map((f: any) => ({
              user_id: userId,
              title: f.recommendation?.slice(0, 200) || f.title,
              description: f.analysis,
              source: "ai",
              source_report: reportRecord.id,
              status: "active",
              progress: 0,
            }));

          if (milestonesToCreate.length > 0) {
            const { error: msError } = await supabase
              .from("milestones")
              .insert(milestonesToCreate);
            if (!msError) milestonesCreated = milestonesToCreate.length;
          }
        }

        // === STEP 5: Post AI analysis to chat ===
        if (analysis && !analysis.error && conversationId && userId) {
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
    [userId, conversationId, onExtracted, onPipelineComplete, title]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach(processFile);
    },
    [processFile]
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
                    {file.status === "processing" && "Udtrækker nøgletal med AI..."}
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
