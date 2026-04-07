import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, Check, X, Loader2, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImportedCategory {
  key: string;
  label: string;
  monthly: number[];
  details: string[];
}

interface YearData {
  year: string;
  categories: ImportedCategory[];
}

interface ImportResult {
  year: string;
  company_name: string;
  categories: ImportedCategory[];
}

interface MultiYearResult {
  company_name: string;
  years: YearData[];
}

interface BudgetImportProps {
  userId: string;
  companyId: string;
  onImportComplete: (result: ImportResult) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  omsaetning: "Omsætning",
  vareforbrug: "Vareforbrug",
  fragt_levering: "Fragt & levering",
  underleverandoerer: "Underleverandører",
  betalingsgebyrer: "Betalingsgebyrer",
  loenninger: "Lønninger",
  freelance_konsulenter: "Freelancere & konsulenter",
  uddannelse: "Uddannelse & kurser",
  digital_marketing: "Digital marketing",
  seo_content: "SEO & content",
  email_marketing: "E-mail marketing",
  lokal_marketing: "Lokal marketing",
  marketing: "Marketing",
  salg_kundepleje: "Salg & kundepleje",
  rejser_repraesentant: "Rejser & repræsentation",
  platform_tech: "Platform & tech",
  tech_software: "Tech & software",
  hosting_infra: "Hosting & infrastruktur",
  booking_tech: "Booking & kassesystem",
  lager_logistik: "Lager & logistik",
  koeretoej_braendstof: "Køretøjer & brændstof",
  maskiner_vaerktoj: "Maskiner & værktøj",
  lokaler: "Lokaler",
  lokaler_husleje: "Husleje (butik/kontor)",
  lokaler_vaerksted: "Værksted & produktionslokale",
  forsikring: "Forsikringer",
  forsikring_abonnementer: "Forsikring & abonnementer",
  admin_regnskab: "Administration & regnskab",
  admin: "Admin & regnskab",
  telefon_internet: "Telefon & internet",
  raavarerfood: "Råvarer & food cost",
  udstyr_inventar: "Udstyr & inventar",
  musik_rettigheder: "Musik & underholdning",
  andet: "Andet",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

const formatK = (v: number) => {
  if (v === 0) return "—";
  return `${Math.round(v / 1000)}k`;
};

const BudgetImport = ({ userId, companyId, onImportComplete }: BudgetImportProps) => {
  const [parsing, setParsing] = useState(false);
  const [multiYear, setMultiYear] = useState<MultiYearResult | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const preview: ImportResult | null =
    multiYear && selectedYear
      ? {
          year: selectedYear,
          company_name: multiYear.company_name,
          categories: multiYear.years.find((y) => y.year === selectedYear)?.categories || [],
        }
      : null;

  const parseExcelAsText = useCallback(async (file: File): Promise<string> => {
    if (file.name.endsWith(".csv")) return file.text();
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
    setMultiYear(null);
    setSelectedYear(null);

    try {
      const fileContent = await parseExcelAsText(file);
      const isExcel = file.name.match(/\.(xlsx|xls)$/i);

      const { data, error } = await supabase.functions.invoke("import-budget-excel", {
        body: { fileContent, fileName: file.name, isBase64: !!isExcel },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Handle both old single-year and new multi-year format
      const result: MultiYearResult = data.years
        ? { company_name: data.company_name, years: data.years }
        : { company_name: data.company_name, years: [{ year: data.year, categories: data.categories }] };

      setMultiYear(result);

      if (result.years.length === 1) {
        setSelectedYear(result.years[0].year);
        toast.success("Budget analyseret! Gennemse og godkend nedenfor.");
      } else {
        toast.success(`Fandt ${result.years.length} budgetår — vælg hvilket der skal importeres.`);
      }
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
      const { data: existing } = await supabase
        .from("budget_targets")
        .select("id, period")
        .eq("user_id", userId)
        .eq("company_id", companyId)
        .or(
          `period.like.${preview.year}-base-%,` +
          `period.like.${preview.year}-optimistisk-%,` +
          `period.like.${preview.year}-pessimistisk-%`
        );

      if (existing && existing.length > 0) {
        await supabase.from("budget_targets").delete().in("id", existing.map((e) => e.id));
      }

      const inserts = preview.categories.flatMap((cat) =>
        (["base", "optimistisk", "pessimistisk"] as const).flatMap((scenario) =>
          cat.monthly.map((amount, monthIdx) => ({
            user_id: userId,
            company_id: companyId,
            category: cat.key,
            budget_amount: amount,
            period: `${preview.year}-${scenario}-${monthIdx}`,
          }))
        )
      );

      // Deduplicate inserts: if same company_id+user_id+category+period appears multiple times,
      // keep only the last occurrence (sum amounts for duplicate keys)
      const insertMap = new Map<string, typeof inserts[0]>();
      for (const row of inserts) {
        const key = `${row.company_id}:${row.user_id}:${row.category}:${row.period}`;
        if (insertMap.has(key)) {
          const existing = insertMap.get(key)!;
          insertMap.set(key, { ...existing, budget_amount: existing.budget_amount + row.budget_amount });
        } else {
          insertMap.set(key, row);
        }
      }
      const dedupedInserts = Array.from(insertMap.values());

      const { error } = await supabase.from("budget_targets").upsert(dedupedInserts, {
        onConflict: "company_id,user_id,category,period",
        ignoreDuplicates: false,
      });
      if (error) throw error;

      toast.success(`Budget ${preview.year} importeret!`);
      onImportComplete(preview);
    } catch (err: any) {
      console.error("Save error:", err);
      const msg = err?.message || err?.details || err?.hint || JSON.stringify(err);
      toast.error(`Kunne ikke gemme budgettet: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // Year picker when multiple years found
  if (multiYear && multiYear.years.length > 1 && !selectedYear) {
    return (
      <div className="glass-card rounded-xl p-6 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-foreground">Vælg budgetår</h3>
        </div>
        {multiYear.company_name && (
          <p className="text-xs text-muted-foreground mb-4">{multiYear.company_name}</p>
        )}
        <p className="text-sm text-muted-foreground mb-4">
          Filen indeholder {multiYear.years.length} budgetår. Vælg det år du vil importere:
        </p>
        <div className="grid grid-cols-2 gap-3">
          {multiYear.years.map((y) => {
            const totalRev = y.categories
              .filter((c) => c.key === "omsaetning")
              .reduce((s, c) => s + c.monthly.reduce((a, b) => a + b, 0), 0);
            const totalCost = y.categories
              .filter((c) => c.key !== "omsaetning")
              .reduce((s, c) => s + c.monthly.reduce((a, b) => a + b, 0), 0);
            return (
              <button
                key={y.year}
                onClick={() => setSelectedYear(y.year)}
                className="p-4 rounded-lg border border-border/30 hover:border-primary hover:bg-primary/5 transition-all text-left group"
              >
                <p className="text-lg font-bold text-foreground group-hover:text-primary">{y.year}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Omsætning: {(totalRev / 1000).toFixed(0)}k kr.
                </p>
                <p className="text-xs text-muted-foreground">
                  Omkostninger: {(totalCost / 1000).toFixed(0)}k kr.
                </p>
                <p className="text-xs text-muted-foreground">{y.categories.length} kategorier</p>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => { setMultiYear(null); setSelectedYear(null); }}
          className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Upload en anden fil
        </button>
      </div>
    );
  }

  if (preview) {
    const totalRevenue = preview.categories
      .filter((c) => c.key === "omsaetning")
      .reduce((sum, c) => sum + c.monthly.reduce((s, v) => s + v, 0), 0);
    const totalCosts = preview.categories
      .filter((c) => c.key !== "omsaetning")
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
            {multiYear && multiYear.years.length > 1 && (
              <button
                onClick={() => setSelectedYear(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <Calendar className="h-3.5 w-3.5 inline mr-1" />
                Skift år
              </button>
            )}
            <button
              onClick={() => { setMultiYear(null); setSelectedYear(null); }}
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
          {preview.categories.map((cat) => {
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
            <p className="text-sm font-medium text-foreground">Importér budget fra Excel</p>
            <p className="text-xs text-muted-foreground mt-1">
              Træk din Excel-fil hertil eller klik for at vælge — AI'en mapper kategorierne automatisk
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">
              Understøtter .xlsx, .xls og .csv • Flere budgetår understøttes
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default BudgetImport;
