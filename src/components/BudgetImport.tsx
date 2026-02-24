import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, Check, X, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImportedCategory {
  key: string;
  label: string;
  monthly: number[];
  details: string[];
}

interface ImportResult {
  year: string;
  company_name: string;
  categories: ImportedCategory[];
}

interface BudgetImportProps {
  userId: string;
  onImportComplete: (result: ImportResult) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  omsaetning: "Omsætning",
  vareforbrug: "Vareforbrug",
  loenninger: "Lønninger",
  marketing: "Marketing",
  lokaler: "Lokaler",
  tech_software: "Tech & software",
  admin: "Admin & regnskab",
  betalingsgebyrer: "Betalingsgebyrer",
  andet: "Andet",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

const formatK = (v: number) => {
  if (v === 0) return "—";
  return `${Math.round(v / 1000)}k`;
};

const BudgetImport = ({ userId, onImportComplete }: BudgetImportProps) => {
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const parseExcelAsText = useCallback(async (file: File): Promise<string> => {
    // Read file as array buffer and convert to a text representation
    // We'll send the raw content to the AI which can handle various formats
    const text = await file.text();
    
    // If it's a CSV, return as-is
    if (file.name.endsWith(".csv")) return text;
    
    // For Excel files, we'll read as base64 and let the edge function handle it
    // Actually, let's use a simpler approach: read as ArrayBuffer and convert
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Upload venligst en Excel-fil (.xlsx, .xls) eller CSV");
      return;
    }

    setParsing(true);
    setPreview(null);

    try {
      // For Excel files, we need to extract text content
      // Use the document parser approach - upload to storage temporarily, then parse
      const fileContent = await parseExcelAsText(file);
      const isExcel = file.name.match(/\.(xlsx|xls)$/i);

      const { data, error } = await supabase.functions.invoke("import-budget-excel", {
        body: {
          fileContent: isExcel ? fileContent : fileContent,
          fileName: file.name,
          isBase64: !!isExcel,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPreview(data as ImportResult);
      toast.success("Budget analyseret! Gennemse og godkend nedenfor.");
    } catch (err: any) {
      console.error("Budget import error:", err);
      toast.error(err.message || "Kunne ikke analysere filen");
    } finally {
      setParsing(false);
    }
  }, [parseExcelAsText]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleConfirm = async () => {
    if (!preview) return;
    setSaving(true);

    try {
      // Delete existing budget for this year
      const periodPrefix = `${preview.year}-base-`;
      const { data: existing } = await supabase
        .from("budget_targets")
        .select("id, period")
        .eq("user_id", userId)
        .like("period", `${periodPrefix}%`);

      if (existing && existing.length > 0) {
        await supabase.from("budget_targets").delete().in("id", existing.map(e => e.id));
      }

      // Map imported categories to budget_targets rows
      const inserts = preview.categories.flatMap(cat =>
        cat.monthly.map((amount, monthIdx) => ({
          user_id: userId,
          category: cat.key,
          budget_amount: amount,
          period: `${preview.year}-base-${monthIdx}`,
        }))
      );

      const { error } = await supabase.from("budget_targets").insert(inserts);
      if (error) throw error;

      toast.success(`Budget ${preview.year} importeret!`);
      onImportComplete(preview);
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Kunne ikke gemme budgettet");
    } finally {
      setSaving(false);
    }
  };

  if (preview) {
    const totalRevenue = preview.categories
      .filter(c => c.key === "omsaetning")
      .reduce((sum, c) => sum + c.monthly.reduce((s, v) => s + v, 0), 0);
    const totalCosts = preview.categories
      .filter(c => c.key !== "omsaetning")
      .reduce((sum, c) => sum + c.monthly.reduce((s, v) => s + v, 0), 0);

    return (
      <div className="glass-card rounded-xl p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Budget {preview.year} — Preview
            </h3>
            {preview.company_name && (
              <p className="text-xs text-muted-foreground mt-0.5">{preview.company_name}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPreview(null)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5 inline mr-1" />
              Annuller
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 inline mr-1 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 inline mr-1" />
              )}
              Importér budget
            </button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Omsætning</p>
            <p className="text-lg font-bold text-primary">{(totalRevenue / 1000).toFixed(0)}k kr.</p>
          </div>
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Omkostninger</p>
            <p className="text-lg font-bold text-destructive">{(totalCosts / 1000).toFixed(0)}k kr.</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border/30">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resultat</p>
            <p className={`text-lg font-bold ${totalRevenue - totalCosts >= 0 ? "text-primary" : "text-destructive"}`}>
              {((totalRevenue - totalCosts) / 1000).toFixed(0)}k kr.
            </p>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="space-y-3">
          {preview.categories.map(cat => {
            const yearTotal = cat.monthly.reduce((s, v) => s + v, 0);
            return (
              <div key={cat.key} className="rounded-lg border border-border/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {CATEGORY_LABELS[cat.key] || cat.label}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({cat.details.length} poster: {cat.details.slice(0, 3).join(", ")}
                      {cat.details.length > 3 ? ` +${cat.details.length - 3}` : ""})
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {(yearTotal / 1000).toFixed(0)}k kr.
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-1">
                  {cat.monthly.map((val, i) => (
                    <div key={i} className="text-center">
                      <p className="text-[8px] text-muted-foreground">{MONTHS[i]}</p>
                      <p className="text-[10px] font-medium text-foreground">{formatK(val)}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`glass-card rounded-xl p-8 border-2 border-dashed transition-all cursor-pointer ${
        dragOver ? "border-primary bg-primary/5" : "border-border/30 hover:border-primary/50"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".xlsx,.xls,.csv";
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) handleFile(file);
        };
        input.click();
      }}
    >
      <div className="text-center">
        {parsing ? (
          <>
            <Loader2 className="h-10 w-10 text-primary mx-auto mb-3 animate-spin" />
            <p className="text-sm font-medium text-foreground">Analyserer budget med AI...</p>
            <p className="text-xs text-muted-foreground mt-1">Dette kan tage 10-30 sekunder</p>
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              Importér budget fra Excel
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Træk din Excel-fil hertil eller klik for at vælge — AI'en mapper kategorierne automatisk
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">
              Understøtter .xlsx, .xls og .csv
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default BudgetImport;
