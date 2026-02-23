import { useCallback, useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
  status: "uploading" | "processing" | "done" | "error";
  extractedData?: ExtractedData;
  errorMessage?: string;
}

interface FileUploadZoneProps {
  title: string;
  description: string;
  accept?: string;
  onExtracted?: (data: ExtractedData) => void;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Simple PDF text extraction from binary
async function extractTextFromFile(file: File): Promise<string> {
  const text = await file.text();
  // For PDF: extract readable text segments
  if (file.type === "application/pdf") {
    // Extract text between BT/ET blocks and parentheses, plus readable strings
    const readable = text
      .replace(/[^\x20-\x7E\xC0-\xFF\n\r\tæøåÆØÅ.,\-()]/g, " ")
      .replace(/\s{3,}/g, "\n")
      .trim();
    return readable.slice(0, 15000); // Limit for AI context
  }
  return text.slice(0, 15000);
}

const FileUploadZone = ({
  title,
  description,
  accept = ".xlsx,.xls,.csv,.pdf",
  onExtracted,
}: FileUploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      const fileId = crypto.randomUUID();

      setUploadedFiles((prev) => [
        ...prev,
        { id: fileId, name: file.name, size: file.size, status: "uploading" },
      ]);

      try {
        // Read file content for AI
        const fileContent = await extractTextFromFile(file);

        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, status: "processing" } : f))
        );

        // Call AI extraction
        const { data, error } = await supabase.functions.invoke(
          "extract-financial-data",
          {
            body: { fileContent, reportId: null },
          }
        );

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, status: "done", extractedData: data } : f
          )
        );

        onExtracted?.(data);

        toast({
          title: "Dokument analyseret",
          description: `${data.report_type === "saldobalance" ? "Saldobalance" : "Resultatopgørelse"} for ${data.report_period} er udtrukket.`,
        });
      } catch (err) {
        console.error("Processing error:", err);
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, status: "error", errorMessage: err instanceof Error ? err.message : "Ukendt fejl" }
              : f
          )
        );
        toast({
          title: "Fejl ved analyse",
          description: err instanceof Error ? err.message : "Kunne ikke analysere dokumentet",
          variant: "destructive",
        });
      }
    },
    [onExtracted]
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
                    {file.status === "uploading" && "Uploader..."}
                    {file.status === "processing" && "Analyserer med AI..."}
                    {file.status === "done" && formatFileSize(file.size)}
                    {file.status === "error" && (file.errorMessage || "Fejl")}
                  </p>
                </div>
                {(file.status === "uploading" || file.status === "processing") && (
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
