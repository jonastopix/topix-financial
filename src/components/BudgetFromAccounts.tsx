import { useState, useCallback } from "react";
import { Upload, Loader2, Check, X, TrendingUp, Percent, FileText, Sparkles, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

interface BudgetCategory {
  key: string;
  label: string;
  group: string;
  annual_amount: number;
  monthly: number[];
  source_lines: string[];
}

interface BudgetResult {
  source_year: string;
  company_name?: string;
  categories: BudgetCategory[];
}

interface BudgetFromAccountsProps {
  userId: string;
  companyId: string;
  onImportComplete: (result: { year: string; company_name: string; categories: { key: string; label: string; monthly: number[]; details: string[] }[] }) => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

const GROUP_LABELS: Record<string, string> = {
  indtaegter: "Indtægter",
  variable: "Variable",
  personale: "Personale",
  salg_marketing: "Salg & marketing",
  drift: "Drift",
  faste: "Faste",
};

const GROWTH_PRESETS = [0, 5, 10, 15, 20];

const formatK = (v: number) => {
  if (v === 0) return "—";
  return `${Math.round(v / 1000)}k`;
};

const BudgetFromAccounts = ({ userId, companyId, onImportComplete }: BudgetFromAccountsProps) => {
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<BudgetResult | null>(null);
  const [growthPercent, setGrowthPercent] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Overrides: keyed by "catKey-monthIdx", stores the user-edited value (already with growth)
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [addedCategories, setAddedCategories] = useState<BudgetCategory[]>([]);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newCatLabel, setNewCatLabel] = useState("");

  const extractTextFromPDF = useCallback(async (file: File): Promise<string> => {
    // Use pdfjs-dist to extract text
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => item.str).join(" ");
      pages.push(text);
    }

    return pages.join("\n\n");
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const isPdf = file.name.match(/\.pdf$/i);
    const isExcel = file.name.match(/\.(xlsx|xls|csv)$/i);

    if (!isPdf && !isExcel) {
      toast.error("Upload venligst en PDF eller Excel-fil med din resultatopgørelse");
      return;
    }

    setParsing(true);
    setResult(null);

    try {
      let fileContent: string;

      if (isPdf) {
        fileContent = await extractTextFromPDF(file);
        if (!fileContent || fileContent.trim().length < 50) {
          toast.error("Kunne ikke læse tekst fra PDF'en. Prøv en anden fil.");
          setParsing(false);
          return;
        }
      } else {
        // For Excel, read as base64
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        fileContent = `[Excel fil - base64 encoded]\n${btoa(binary)}`;
      }

      const { data, error } = await supabase.functions.invoke("generate-budget-from-accounts", {
        body: { fileContent },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data as BudgetResult);
      setGrowthPercent(0);
      setOverrides({});
      setLabelOverrides({});
      setAddedCategories([]);
      setAddingToGroup(null);
      setNewCatLabel("");
      toast.success("Regnskab analyseret! Vælg vækstprocent og godkend.");
    } catch (err: any) {
      console.error("Budget from accounts error:", err);
      toast.error(err.message || "Kunne ikke analysere regnskabet");
    } finally {
      setParsing(false);
    }
  }, [extractTextFromPDF]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const applyGrowth = (monthly: number[], isRevenue: boolean): number[] => {
    const factor = 1 + growthPercent / 100;
    const costFactor = isRevenue ? factor : 1 + (growthPercent / 100) * 0.5;
    return monthly.map(v => Math.round(v * (isRevenue ? factor : costFactor)));
  };

  // Get final monthly values: growth-applied, then overridden if user edited
  const getFinalMonthly = (cat: BudgetCategory, isRevenue: boolean): number[] => {
    const grown = applyGrowth(cat.monthly, isRevenue);
    return grown.map((v, i) => {
      const key = `${cat.key}-${i}`;
      return key in overrides ? overrides[key] : v;
    });
  };

  const handleCellEdit = (catKey: string, monthIdx: number, value: string) => {
    const num = Math.round(Number(value.replace(/[^0-9.-]/g, "")));
    if (isNaN(num)) return;
    setOverrides(prev => ({ ...prev, [`${catKey}-${monthIdx}`]: num }));
  };

  const handleAddCategory = (group: string) => {
    if (!newCatLabel.trim()) return;
    const key = `manual_${newCatLabel.trim().toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const newCat: BudgetCategory = {
      key,
      label: newCatLabel.trim(),
      group,
      annual_amount: 0,
      monthly: Array(12).fill(0),
      source_lines: ["Manuelt tilføjet"],
    };
    setAddedCategories(prev => [...prev, newCat]);
    setAddingToGroup(null);
    setNewCatLabel("");
  };

  const handleDeleteAddedCategory = (key: string) => {
    setAddedCategories(prev => prev.filter(c => c.key !== key));
    // Clean up any overrides/label overrides for this category
    setOverrides(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(`${key}-`)) delete next[k]; });
      return next;
    });
    setLabelOverrides(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleConfirm = async () => {
    if (!result) return;
    setSaving(true);

    try {
      const targetYear = String(Number(result.source_year) + 1);
      const periodPrefix = `${targetYear}-base-`;

      // Delete existing base budget for target year
      const { data: existing } = await supabase
        .from("budget_targets")
        .select("id, period")
        .eq("user_id", userId)
        .like("period", `${periodPrefix}%`);

      if (existing && existing.length > 0) {
        await supabase.from("budget_targets").delete().in("id", existing.map(e => e.id));
      }

      // Also delete template marker if exists
      await supabase
        .from("budget_targets")
        .delete()
        .eq("user_id", userId)
        .eq("category", "__template__");

      // Insert template marker
      await supabase.from("budget_targets").insert({
        user_id: userId,
        company_id: companyId,
        category: "__template__",
        budget_amount: 0,
        period: "webshop_b2c",
      } as any);

      // Insert budget rows with growth + overrides applied (AI + manual categories)
      const allCategories = [...result.categories, ...addedCategories];
      const inserts = allCategories.flatMap(cat => {
        const isRevenue = cat.group === "indtaegter";
        const final = getFinalMonthly(cat, isRevenue);
        return final.map((amount, monthIdx) => ({
          user_id: userId,
          company_id: companyId,
          category: cat.key,
          budget_amount: amount,
          period: `${targetYear}-base-${monthIdx}`,
        }));
      });

      const { error } = await supabase.from("budget_targets").insert(inserts);
      if (error) throw error;

      const targetYearStr = String(Number(result.source_year) + 1);
      toast.success(`Budget ${targetYearStr} importeret med ${growthPercent}% vækst!`);

      onImportComplete({
        year: targetYearStr,
        company_name: result.company_name || "",
        categories: allCategories.map(cat => {
          const isRevenue = cat.group === "indtaegter";
          return {
            key: cat.key,
            label: labelOverrides[cat.key] || cat.label,
            monthly: getFinalMonthly(cat, isRevenue),
            details: cat.source_lines,
          };
        }),
      });
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Kunne ikke gemme budgettet");
    } finally {
      setSaving(false);
    }
  };

  // Preview with growth applied
  if (result) {
    const targetYear = Number(result.source_year) + 1;

    const allCategories = [...result.categories, ...addedCategories];
    const revenueCategories = allCategories.filter(c => c.group === "indtaegter");
    const costCategories = allCategories.filter(c => c.group !== "indtaegter");

    const totalRevOrig = revenueCategories.reduce((s, c) => s + c.annual_amount, 0);
    const totalCostOrig = costCategories.reduce((s, c) => s + c.annual_amount, 0);

    const totalRevFinal = revenueCategories.reduce((s, c) => s + getFinalMonthly(c, true).reduce((a, b) => a + b, 0), 0);
    const totalCostFinal = costCategories.reduce((s, c) => s + getFinalMonthly(c, false).reduce((a, b) => a + b, 0), 0);

    const resultOrig = totalRevOrig - totalCostOrig;
    const resultFinal = totalRevFinal - totalCostFinal;
    const hasOverrides = Object.keys(overrides).length > 0;
    const hasLabelOverrides = Object.keys(labelOverrides).length > 0;
    const hasManualCategories = addedCategories.length > 0;
    const hasAnyOverrides = hasOverrides || hasLabelOverrides || hasManualCategories;

    // Group categories for display
    const groups = ["indtaegter", "variable", "personale", "salg_marketing", "drift", "faste"];

    return (
      <div className="glass-card rounded-xl p-6 animate-fade-in space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Budget {targetYear} — fra regnskab {result.source_year}
            </h3>
            {result.company_name && (
              <p className="text-xs text-muted-foreground mt-0.5">{result.company_name}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setResult(null); }}
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
              Godkend & importér
            </button>
          </div>
        </div>

        {/* Growth selector */}
        <div className="p-4 rounded-lg bg-secondary/50 border border-border/30">
          <div className="flex items-center gap-2 mb-3">
            <Percent className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Vækstprocent: {growthPercent}%</span>
            <span className="text-xs text-muted-foreground ml-auto">
              Omsætning vokser {growthPercent}%, omkostninger vokser {Math.round(growthPercent * 0.5)}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {GROWTH_PRESETS.map(g => (
                <button
                  key={g}
                  onClick={() => setGrowthPercent(g)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    growthPercent === g
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g === 0 ? "Flat" : `+${g}%`}
                </button>
              ))}
            </div>
            <div className="flex-1">
              <Slider
                value={[growthPercent]}
                onValueChange={([v]) => setGrowthPercent(v)}
                min={-20}
                max={50}
                step={1}
              />
            </div>
            <span className="text-sm font-mono font-bold text-foreground min-w-[3rem] text-right">
              {growthPercent > 0 ? "+" : ""}{growthPercent}%
            </span>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Omsætning {result.source_year}</p>
            <p className="text-sm font-bold text-foreground">{(totalRevOrig / 1000).toFixed(0)}k</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Omsætning {targetYear}</p>
            <p className="text-sm font-bold text-primary">{(totalRevFinal / 1000).toFixed(0)}k</p>
            {(growthPercent !== 0 || hasOverrides) && (
              <p className="text-[10px] text-primary">
                {totalRevFinal - totalRevOrig >= 0 ? "+" : ""}{((totalRevFinal - totalRevOrig) / 1000).toFixed(0)}k
              </p>
            )}
          </div>
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Omkostninger {targetYear}</p>
            <p className="text-sm font-bold text-destructive">{(totalCostFinal / 1000).toFixed(0)}k</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border/30">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resultat {targetYear}</p>
            <p className={`text-sm font-bold ${resultFinal >= 0 ? "text-primary" : "text-destructive"}`}>
              {(resultFinal / 1000).toFixed(0)}k
            </p>
            {(growthPercent !== 0 || hasOverrides) && (
              <p className={`text-[10px] ${resultFinal - resultOrig >= 0 ? "text-primary" : "text-destructive"}`}>
                {resultFinal - resultOrig >= 0 ? "+" : ""}{((resultFinal - resultOrig) / 1000).toFixed(0)}k vs. original
              </p>
            )}
          </div>
        </div>

        {/* Hint about editing */}
        {!hasAnyOverrides && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Pencil className="h-3 w-3" /> Klik på et beløb eller kategori-navn for at redigere
          </p>
        )}
        {hasAnyOverrides && (
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-primary flex items-center gap-1">
              <Pencil className="h-3 w-3" /> {Object.keys(overrides).length} beløb, {Object.keys(labelOverrides).length} navne, {addedCategories.length} kategorier ændret
            </p>
            <button
              onClick={() => { setOverrides({}); setLabelOverrides({}); setAddedCategories([]); setAddingToGroup(null); }}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              Nulstil rettelser
            </button>
          </div>
        )}

        {/* Category breakdown by group */}
        <div className="space-y-3">
          {groups.map(g => {
            const aiCats = result.categories.filter(c => c.group === g);
            const manualCats = addedCategories.filter(c => c.group === g);
            const cats = [...aiCats, ...manualCats];
            if (cats.length === 0 && addingToGroup !== g) return null;
            const isRevenue = g === "indtaegter";
            const isManualCat = (key: string) => addedCategories.some(c => c.key === key);

            return (
              <div key={g}>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  {GROUP_LABELS[g] || g}
                </p>
                <div className="space-y-2">
                  {cats.map(cat => {
                    const final = getFinalMonthly(cat, isRevenue);
                    const yearTotal = final.reduce((s, v) => s + v, 0);
                    const manual = isManualCat(cat.key);
                    return (
                      <div key={cat.key} className={`rounded-lg border p-3 ${manual ? "border-primary/30 bg-primary/5" : "border-border/30"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1">
                            {editingLabel === cat.key ? (
                              <Input
                                autoFocus
                                defaultValue={labelOverrides[cat.key] || cat.label}
                                className="h-6 px-1.5 text-sm font-medium w-40 border-primary"
                                onBlur={(e) => {
                                  const val = e.target.value.trim();
                                  if (val && val !== cat.label) {
                                    setLabelOverrides(prev => ({ ...prev, [cat.key]: val }));
                                  } else {
                                    setLabelOverrides(prev => { const n = { ...prev }; delete n[cat.key]; return n; });
                                  }
                                  setEditingLabel(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                  if (e.key === "Escape") setEditingLabel(null);
                                }}
                              />
                            ) : (
                              <span
                                onClick={() => setEditingLabel(cat.key)}
                                className={`text-sm font-medium cursor-pointer rounded px-1 transition-colors hover:bg-primary/10 ${
                                  cat.key in labelOverrides ? "text-primary ring-1 ring-primary/30" : "text-foreground"
                                }`}
                                title="Klik for at ændre navn"
                              >
                                {labelOverrides[cat.key] || cat.label}
                              </span>
                            )}
                            {manual ? (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 ml-1 border-primary/40 text-primary">
                                Manuelt
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground ml-2">
                                ({cat.source_lines.length} poster: {cat.source_lines.slice(0, 2).join(", ")}
                                {cat.source_lines.length > 2 ? ` +${cat.source_lines.length - 2}` : ""})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <span className="text-sm font-semibold text-foreground">{(yearTotal / 1000).toFixed(0)}k</span>
                              {!manual && (growthPercent !== 0 || hasOverrides) && (
                                <span className="text-[10px] text-muted-foreground ml-1.5">
                                  (orig. {(cat.annual_amount / 1000).toFixed(0)}k)
                                </span>
                              )}
                            </div>
                            {manual && (
                              <button
                                onClick={() => handleDeleteAddedCategory(cat.key)}
                                className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="Fjern kategori"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-12 gap-1">
                          {final.map((val, i) => {
                            const cellKey = `${cat.key}-${i}`;
                            const isEditing = editingCell === cellKey;
                            const isOverridden = cellKey in overrides;
                            return (
                              <div key={i} className="text-center">
                                <p className="text-[8px] text-muted-foreground">{MONTHS[i]}</p>
                                {isEditing ? (
                                  <Input
                                    autoFocus
                                    defaultValue={val}
                                    className="h-5 px-0.5 text-[10px] text-center font-medium border-primary w-full"
                                    onBlur={(e) => {
                                      handleCellEdit(cat.key, i, e.target.value);
                                      setEditingCell(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleCellEdit(cat.key, i, (e.target as HTMLInputElement).value);
                                        setEditingCell(null);
                                      } else if (e.key === "Escape") {
                                        setEditingCell(null);
                                      }
                                    }}
                                  />
                                ) : (
                                  <p
                                    onClick={() => setEditingCell(cellKey)}
                                    className={`text-[10px] font-medium cursor-pointer rounded px-0.5 transition-colors hover:bg-primary/10 ${
                                      isOverridden ? "text-primary ring-1 ring-primary/30" : "text-foreground"
                                    }`}
                                    title="Klik for at redigere"
                                  >
                                    {formatK(val)}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Inline add category form */}
                  {addingToGroup === g ? (
                    <div className="rounded-lg border border-dashed border-primary/40 p-3 bg-primary/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Input
                          autoFocus
                          placeholder="Kategori-navn..."
                          value={newCatLabel}
                          onChange={(e) => setNewCatLabel(e.target.value)}
                          className="h-7 text-sm flex-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddCategory(g);
                            if (e.key === "Escape") { setAddingToGroup(null); setNewCatLabel(""); }
                          }}
                        />
                        <button
                          onClick={() => handleAddCategory(g)}
                          disabled={!newCatLabel.trim()}
                          className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          Tilføj
                        </button>
                        <button
                          onClick={() => { setAddingToGroup(null); setNewCatLabel(""); }}
                          className="px-2 py-1 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Annuller
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Beløb kan redigeres efter tilføjelse</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingToGroup(g); setNewCatLabel(""); }}
                      className="w-full py-1.5 rounded-lg border border-dashed border-border/50 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Tilføj kategori
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Upload zone
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
        input.accept = ".pdf,.xlsx,.xls,.csv";
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
            <p className="text-sm font-medium text-foreground">AI analyserer dit regnskab...</p>
            <p className="text-xs text-muted-foreground mt-1">Læser alle linjer og genererer budget — kan tage 15-45 sek.</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mb-3">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
              <TrendingUp className="h-6 w-6 text-primary/40" />
            </div>
            <p className="text-sm font-medium text-foreground">Generér budget fra regnskab</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload din resultatopgørelse — AI'en læser hver linje og skaber et komplet budget med valgfri vækst
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">
              Understøtter PDF og Excel • Du vælger vækstprocent bagefter
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default BudgetFromAccounts;
