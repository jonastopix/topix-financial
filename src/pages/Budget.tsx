import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseReportPeriodToKey, formatCompact } from "@/lib/financialUtils";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Calculator, TrendingUp, TrendingDown, DollarSign, Building2, Users, Megaphone,
  Pencil, Save, X, ChevronRight, BarChart3, Layers, Sparkles, Shield, Zap, Copy, Info, Upload,
  Plus, Trash2,
} from "lucide-react";
import BudgetImport from "@/components/BudgetImport";
import BudgetFromAccounts from "@/components/BudgetFromAccounts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  BUDGET_TEMPLATES, GROUP_LABELS, GROUP_ORDER,
  type BudgetTemplate, type BudgetCategory,
} from "@/lib/budgetTemplates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

interface BudgetRow {
  key: string;
  label: string;
  values: number[];
  isEditable?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  group: string;
  hint?: string;
}

type ScenarioKey = "base" | "optimistisk" | "pessimistisk";

interface Scenario {
  key: ScenarioKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
}

const SCENARIOS: Scenario[] = [
  { key: "base", label: "Base", description: "Dit reelle budget – udgangspunktet", icon: Shield, color: "text-primary", bg: "bg-primary/10", border: "border-primary/30" },
  { key: "optimistisk", label: "Optimistisk", description: "Hvad hvis alt går bedre end forventet?", icon: Zap, color: "text-chart-warning", bg: "bg-chart-warning/10", border: "border-chart-warning/30" },
  { key: "pessimistisk", label: "Pessimistisk", description: "Worst case – hvad kan du tåle?", icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" },
];

function catToRow(cat: BudgetCategory): BudgetRow {
  return { key: cat.key, label: cat.label, values: Array(12).fill(0), isEditable: true, icon: cat.icon, group: cat.group, hint: cat.hint };
}

const formatK = (v: number) => {
  if (v === 0) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(v / 1000))}k`;
};

// ─── Template Picker ───
function TemplatePicker({ onSelect, userId, onImportComplete }: { onSelect: (t: BudgetTemplate) => void; userId: string; onImportComplete: (result: any) => void }) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Import options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
        <BudgetImport userId={userId} onImportComplete={onImportComplete} />
        <BudgetFromAccounts userId={userId} onImportComplete={onImportComplete} />
      </div>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 border-t border-border/30" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Eller vælg en skabelon</span>
        <div className="flex-1 border-t border-border/30" />
      </div>

      <div className="text-center mb-8">
        <h2 className="text-xl font-display font-bold text-foreground mb-2">Vælg en budgetskabelon</h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Vælg den skabelon der passer bedst til din virksomhed. Kategorierne er tilpasset din branche — du kan altid justere bagefter.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BUDGET_TEMPLATES.map((tmpl) => {
          const Icon = tmpl.icon;
          const groups = GROUP_ORDER.filter(g => tmpl.categories.some(c => c.group === g));

          return (
            <button
              key={tmpl.key}
              onClick={() => onSelect(tmpl)}
              className="p-5 rounded-xl border-2 border-border/30 bg-secondary/20 hover:bg-secondary/50 hover:border-primary/30 text-left transition-all group"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-foreground">{tmpl.label}</span>
                  {tmpl.segment && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {tmpl.segment}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{tmpl.description}</p>

              <div className="space-y-1.5">
                {groups.map(g => {
                  const cats = tmpl.categories.filter(c => c.group === g);
                  return (
                    <div key={g} className="flex items-start gap-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider min-w-[80px] pt-0.5">{GROUP_LABELS[g]?.split(" ")[0]}</span>
                      <div className="flex flex-wrap gap-1">
                        {cats.map(c => (
                          <span key={c.key} className="text-[10px] px-1.5 py-0.5 rounded bg-card border border-border/50 text-foreground/70">
                            {c.label.split(" / ")[0].split(" & ")[0]}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Vælg skabelon <ChevronRight className="h-3 w-3" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Budget Page ───
const Budget = () => {
  const { user, companyId } = useAuth();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>("base");
  const [selectedTemplate, setSelectedTemplate] = useState<BudgetTemplate | null>(null);
  const [scenarioData, setScenarioData] = useState<Record<ScenarioKey, BudgetRow[]> | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, number[]>>({});
  const [dbLoaded, setDbLoaded] = useState(false);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");

  // Load from DB
  useEffect(() => {
    if (!user || !companyId) return;

    const loadBudget = async () => {
      const res = await (supabase
        .from("budget_targets")
        .select("category, budget_amount, period") as any)
        .eq("company_id", companyId);
      const data = (res.data || []) as { category: string; budget_amount: number; period: string }[];

      if (!data || data.length === 0) {
        setDbLoaded(true);
        return;
      }

      // Detect which template was used based on stored categories
      const templateMarker = data.find(d => d.category === "__template__");
      let template: BudgetTemplate | undefined;

      if (templateMarker) {
        template = BUDGET_TEMPLATES.find(t => t.key === templateMarker.period);
      }

      if (!template) {
        const storedKeys = new Set(data.map(d => d.category).filter(c => c !== "__template__" && !c.startsWith("__label__")));
        let bestMatch = BUDGET_TEMPLATES[0];
        let bestScore = 0;
        for (const tmpl of BUDGET_TEMPLATES) {
          const score = tmpl.categories.filter(c => storedKeys.has(c.key)).length;
          if (score > bestScore) { bestScore = score; bestMatch = tmpl; }
        }
        template = bestMatch;
      }

      setSelectedTemplate(template);

      // Collect all unique category keys from data (excluding markers)
      const allCatKeys = new Set(data.map(d => d.category).filter(c => c !== "__template__" && !c.startsWith("__label__")));
      
      // Build rows from template + any extra keys (manual categories)
      const templateKeys = new Set(template.categories.map(c => c.key));
      const extraKeys = [...allCatKeys].filter(k => !templateKeys.has(k));
      
      // Detect groups for extra keys from period format: year-scenario-monthIdx
      // We need to also load __group__ markers
      const groupMarkers = data.filter(d => d.category.startsWith("__group__"));
      const extraGroupMap: Record<string, string> = {};
      groupMarkers.forEach(g => {
        // format: __group__<key> with period = groupName
        const key = g.category.replace("__group__", "");
        extraGroupMap[key] = g.period;
      });

      const extraCategories: BudgetCategory[] = extraKeys.map(key => ({
        key,
        label: key.replace(/_/g, " "),
        group: (extraGroupMap[key] || "variable") as BudgetCategory["group"],
      }));

      const allCategories = [...template.categories, ...extraCategories];

      const newData: Record<ScenarioKey, BudgetRow[]> = {
        base: allCategories.map(catToRow),
        optimistisk: allCategories.map(catToRow),
        pessimistisk: allCategories.map(catToRow),
      };

      // Load label overrides
      const labelMarkers = data.filter(d => d.category.startsWith("__label__"));
      const loadedLabels: Record<string, string> = {};
      labelMarkers.forEach(m => {
        const key = m.category.replace("__label__", "");
        loadedLabels[key] = m.period; // period stores the label text
      });
      setLabelOverrides(loadedLabels);

      // Apply labels to rows
      Object.entries(loadedLabels).forEach(([key, label]) => {
        for (const sc of Object.values(newData)) {
          const row = sc.find(r => r.key === key);
          if (row) row.label = label;
        }
      });
      // Also apply labels to extra categories
      extraCategories.forEach(ec => {
        if (loadedLabels[ec.key]) ec.label = loadedLabels[ec.key];
      });

      data.forEach(item => {
        if (item.category === "__template__" || item.category.startsWith("__label__") || item.category.startsWith("__group__")) return;
        const parts = item.period.split("-");
        if (parts.length < 3) return;
        const [, scenario, monthIdxStr] = parts;
        const monthIdx = parseInt(monthIdxStr, 10);
        if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return;
        const sc = scenario as ScenarioKey;
        if (!newData[sc]) return;

        const row = newData[sc].find(r => r.key === item.category);
        if (row) {
          row.values[monthIdx] = Number(item.budget_amount);
        }
      });

      setScenarioData(newData);
      setDbLoaded(true);
    };

    loadBudget();
  }, [user, companyId]);

  const handleTemplateSelect = async (tmpl: BudgetTemplate) => {
    setSelectedTemplate(tmpl);
    const data: Record<ScenarioKey, BudgetRow[]> = {
      base: tmpl.categories.map(catToRow),
      optimistisk: tmpl.categories.map(catToRow),
      pessimistisk: tmpl.categories.map(catToRow),
    };
    setScenarioData(data);

    // Store template choice
    if (user && companyId) {
      await supabase.from("budget_targets").insert({
        user_id: user.id,
        company_id: companyId,
        category: "__template__",
        budget_amount: 0,
        period: tmpl.key,
      } as any);
    }

    toast.success(`Skabelon "${tmpl.label}" valgt`);
  };

  const handleImportComplete = useCallback((result: any) => {
    // After import, auto-select a generic template that matches best
    // and reload data
    const tmpl = BUDGET_TEMPLATES[0]; // fallback
    setSelectedTemplate(tmpl);
    
    // Build scenario data from import result
    const importedRows: BudgetRow[] = (result.categories || []).map((cat: any) => ({
      key: cat.key,
      label: cat.label,
      values: cat.monthly || Array(12).fill(0),
      isEditable: true,
      group: cat.key === "omsaetning" ? "indtaegter" : 
             cat.key === "loenninger" ? "personale" :
             cat.key === "marketing" ? "salg_marketing" :
             cat.key === "lokaler" ? "faste" :
             cat.key === "tech_software" ? "drift" :
             cat.key === "admin" ? "faste" :
             "variable",
    }));
    
    setScenarioData({
      base: importedRows,
      optimistisk: importedRows.map(r => ({ ...r, values: [...r.values] })),
      pessimistisk: importedRows.map(r => ({ ...r, values: [...r.values] })),
    });
    setYear(result.year || "2025");
  }, []);

  const handleChangeTemplate = () => {
    setSelectedTemplate(null);
    setScenarioData(null);
    setLabelOverrides({});
  };

  // ─── Add manual category ───
  const handleAddCategory = (group: string) => {
    if (!newCatLabel.trim() || !scenarioData) return;
    const key = `manual_${newCatLabel.trim().toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const newRow: BudgetRow = {
      key,
      label: newCatLabel.trim(),
      values: Array(12).fill(0),
      isEditable: true,
      group,
    };
    setScenarioData(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const sc of Object.keys(updated) as ScenarioKey[]) {
        updated[sc] = [...updated[sc], { ...newRow, values: [...newRow.values] }];
      }
      return updated;
    });
    setAddingToGroup(null);
    setNewCatLabel("");
    toast.success(`"${newRow.label}" tilføjet`);
  };

  const handleDeleteCategory = (key: string) => {
    if (!scenarioData) return;
    setScenarioData(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const sc of Object.keys(updated) as ScenarioKey[]) {
        updated[sc] = updated[sc].filter(r => r.key !== key);
      }
      return updated;
    });
    setLabelOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Kategori slettet");
  };

  const startRenameLabel = (key: string, currentLabel: string) => {
    setEditingLabel(key);
    setEditLabelValue(currentLabel);
  };

  const commitRenameLabel = () => {
    if (!editingLabel || !editLabelValue.trim() || !scenarioData) return;
    const key = editingLabel;
    const newLabel = editLabelValue.trim();
    setLabelOverrides(prev => ({ ...prev, [key]: newLabel }));
    setScenarioData(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const sc of Object.keys(updated) as ScenarioKey[]) {
        updated[sc] = updated[sc].map(r => r.key === key ? { ...r, label: newLabel } : r);
      }
      return updated;
    });
    setEditingLabel(null);
    setEditLabelValue("");
  };

  // If no template selected and no data loaded, show picker
  if (dbLoaded && !selectedTemplate && !scenarioData) {
    return (
      <AppLayout>
        <div className="mb-8">
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Budgettering
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Planlæg og følg op på dine finansielle mål
          </p>
        </div>
        <TemplatePicker onSelect={handleTemplateSelect} userId={user?.id || ""} onImportComplete={handleImportComplete} />
      </AppLayout>
    );
  }

  if (!scenarioData) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppLayout>
    );
  }

  const rows = scenarioData[activeScenario];
  const scenarioConfig = SCENARIOS.find(s => s.key === activeScenario)!;

  // ─── Calculations ───
  const revenueRows = rows.filter(r => r.group === "indtaegter");
  const costRows = rows.filter(r => r.group !== "indtaegter");

  const ebitda = MONTHS.map((_, i) => {
    const revenue = revenueRows.reduce((sum, row) => sum + row.values[i], 0);
    const costs = costRows.reduce((sum, row) => sum + row.values[i], 0);
    return revenue - Math.abs(costs);
  });

  const totalOmsaetning = revenueRows.reduce((sum, row) => sum + row.values.reduce((s, v) => s + v, 0), 0);
  const totalCosts = costRows.reduce((sum, row) => sum + Math.abs(row.values.reduce((s, v) => s + v, 0)), 0);
  const totalEbitda = ebitda.reduce((s, v) => s + v, 0);

  const baseEbitdaTotal = (() => {
    const baseRevenue = scenarioData.base.filter(r => r.group === "indtaegter");
    const baseCosts = scenarioData.base.filter(r => r.group !== "indtaegter");
    return MONTHS.map((_, i) => {
      const rev = baseRevenue.reduce((sum, row) => sum + row.values[i], 0);
      const cost = baseCosts.reduce((sum, row) => sum + Math.abs(row.values[i]), 0);
      return rev - cost;
    }).reduce((s, v) => s + v, 0);
  })();

  const ebitdaDiffFromBase = totalEbitda - baseEbitdaTotal;

  // Group rows for display
  const groupedRows = GROUP_ORDER
    .map(g => ({ group: g, label: GROUP_LABELS[g], rows: rows.filter(r => r.group === g) }));

  const startEditing = () => {
    const vals: Record<string, number[]> = {};
    rows.forEach(r => { vals[r.key] = [...r.values]; });
    setEditValues(vals);
    setEditing(true);
  };

  const cancelEditing = () => { setEditing(false); setEditValues({}); };

  const saveEdits = async () => {
    const updatedScenario = scenarioData[activeScenario].map(row => ({
      ...row,
      values: editValues[row.key] || row.values,
    }));

    setScenarioData(prev => prev ? { ...prev, [activeScenario]: updatedScenario } : prev);
    setEditing(false);
    setEditValues({});

    if (!user || !companyId) return;

    const periodPrefix = `${year}-${activeScenario}-`;

    const res = await (supabase
      .from("budget_targets")
      .select("id, period, category") as any)
      .eq("company_id", companyId);
    const existing = (res.data || []) as { id: string; period: string; category: string }[];

    // Delete scenario data + label/group markers
    const toDelete = existing.filter(e => 
      e.period.startsWith(periodPrefix) || 
      e.category.startsWith("__label__") || 
      e.category.startsWith("__group__")
    );
    if (toDelete.length > 0) {
      await supabase.from("budget_targets").delete().in("id", toDelete.map(e => e.id));
    }

    // Budget values
    const inserts = updatedScenario.flatMap(row =>
      row.values.map((val, monthIdx) => ({
        user_id: user.id,
        company_id: companyId,
        category: row.key,
        budget_amount: val,
        period: `${year}-${activeScenario}-${monthIdx}`,
      }))
    );

    // Label overrides
    const labelInserts = Object.entries(labelOverrides).map(([key, label]) => ({
      user_id: user.id,
      company_id: companyId,
      category: `__label__${key}`,
      budget_amount: 0,
      period: label,
    }));

    // Group markers for manual categories (keys not in any template)
    const templateKeys = new Set(selectedTemplate?.categories.map(c => c.key) || []);
    const groupInserts = updatedScenario
      .filter(r => !templateKeys.has(r.key))
      .map(r => ({
        user_id: user.id,
        company_id: companyId,
        category: `__group__${r.key}`,
        budget_amount: 0,
        period: r.group,
      }));

    const allInserts = [...inserts, ...labelInserts, ...groupInserts];
    const { error } = await supabase.from("budget_targets").insert(allInserts as any);
    if (error) {
      toast.error("Kunne ikke gemme budget");
      console.error("Budget save error:", error);
    } else {
      toast.success(`${scenarioConfig.label}-scenarie gemt`);
    }
  };

  const updateCell = (key: string, monthIdx: number, value: string) => {
    const num = parseInt(value) || 0;
    setEditValues(prev => {
      const updated = { ...prev };
      updated[key] = [...(updated[key] || [])];
      updated[key][monthIdx] = num;
      return updated;
    });
  };

  const copyBaseToScenario = (target: ScenarioKey) => {
    setScenarioData(prev => prev ? {
      ...prev,
      [target]: prev.base.map(r => ({ ...r, values: [...r.values] })),
    } : prev);
    toast.success(`Base-budget kopieret til ${SCENARIOS.find(s => s.key === target)?.label}`);
  };

  // ─── Grouped cost summary for overview ───
  const costByGroup = GROUP_ORDER.filter(g => g !== "indtaegter").map(g => {
    const groupRows = rows.filter(r => r.group === g);
    const total = groupRows.reduce((sum, row) => sum + Math.abs(row.values.reduce((s, v) => s + v, 0)), 0);
    return { group: g, label: GROUP_LABELS[g], total, count: groupRows.length };
  }).filter(g => g.total > 0 || g.count > 0);

  return (
    <AppLayout>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Budgettering
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              {selectedTemplate ? (
                <>
                  Skabelon: <span className="font-medium text-foreground">{selectedTemplate.label}</span>
                  {selectedTemplate.segment && (
                    <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {selectedTemplate.segment}
                    </span>
                  )}
                </>
              ) : "Planlæg og følg op på dine finansielle mål"}
            </p>
            {selectedTemplate && (
              <button
                onClick={handleChangeTemplate}
                className="text-[10px] text-primary hover:underline"
              >
                Skift skabelon
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px] h-9 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              {[0, 1, 2].map(offset => {
                const y = String(new Date().getFullYear() + offset - 1);
                return <SelectItem key={y} value={y}>{y}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="oversigt" className="space-y-6">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="oversigt" className="text-xs">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Oversigt
          </TabsTrigger>
          <TabsTrigger value="scenarier" className="text-xs">
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Scenarier
          </TabsTrigger>
          <TabsTrigger value="maaned" className="text-xs">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Månedsoversigt
          </TabsTrigger>
          <TabsTrigger value="import" className="text-xs">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Importér
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="oversigt" className="space-y-6">
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-foreground">Budget {year}</h2>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Konsolideret overblik</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryKPI icon={TrendingUp} label="Total omsætning" value={`${(totalOmsaetning / 1000).toFixed(0)}k kr.`} />
              <SummaryKPI icon={TrendingDown} label="Samlede omkostninger" value={`${(totalCosts / 1000).toFixed(0)}k kr.`} />
              <SummaryKPI icon={DollarSign} label="EBITDA" value={`${(totalEbitda / 1000).toFixed(0)}k kr.`} valueColor={totalEbitda >= 0 ? "text-primary" : "text-destructive"} />
              <SummaryKPI icon={Calculator} label="EBITDA-margin" value={totalOmsaetning > 0 ? `${((totalEbitda / totalOmsaetning) * 100).toFixed(1)}%` : "—"} valueColor={totalEbitda >= 0 ? "text-primary" : "text-destructive"} />
            </div>
          </div>

          <div className="glass-card rounded-xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-4">Omkostninger fordelt på grupper</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {costByGroup.map(g => (
                <CostGroupCard key={g.group} label={g.label} amount={g.total} count={g.count} />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Scenarios Tab */}
        <TabsContent value="scenarier" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SCENARIOS.map((sc) => {
              const isActive = activeScenario === sc.key;
              const Icon = sc.icon;
              const scRows = scenarioData[sc.key];
              const scRevenue = scRows.filter(r => r.group === "indtaegter").reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0);
              const scCosts = scRows.filter(r => r.group !== "indtaegter").reduce((s, r) => s + Math.abs(r.values.reduce((a, b) => a + b, 0)), 0);
              const scEbitda = scRevenue - scCosts;

              return (
                <button
                  key={sc.key}
                  onClick={() => { if (editing) cancelEditing(); setActiveScenario(sc.key); }}
                  className={`p-5 rounded-xl border-2 text-left transition-all ${
                    isActive ? `${sc.border} ${sc.bg}` : "border-border/30 bg-secondary/20 hover:bg-secondary/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 ${isActive ? sc.color : "text-muted-foreground"}`} />
                    <span className={`text-sm font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{sc.label}</span>
                    {isActive && (
                      <span className={`ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>Aktiv</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{sc.description}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Omsætning</p>
                      <p className="text-sm font-display font-bold text-foreground">{(scRevenue / 1000).toFixed(0)}k</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">EBITDA</p>
                      <p className={`text-sm font-display font-bold ${scEbitda >= 0 ? "text-primary" : "text-destructive"}`}>{(scEbitda / 1000).toFixed(0)}k</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className={`glass-card rounded-xl p-6 border-l-4 ${scenarioConfig.border}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <scenarioConfig.icon className={`h-5 w-5 ${scenarioConfig.color}`} />
                <div>
                  <h3 className="font-display font-semibold text-foreground">{scenarioConfig.label}-scenarie · {year}</h3>
                  <p className="text-xs text-muted-foreground">{scenarioConfig.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeScenario !== "base" && (
                  <button onClick={() => copyBaseToScenario(activeScenario)} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
                    <Copy className="h-3.5 w-3.5" />Kopiér base
                  </button>
                )}
                {!editing ? (
                  <button onClick={startEditing} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors">
                    <Pencil className="h-3.5 w-3.5" />Rediger
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={cancelEditing} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={saveEdits} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                      <Save className="h-3.5 w-3.5" />Gem
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <ScenarioKPI label="Omsætning" value={totalOmsaetning} color={scenarioConfig.color} />
              <ScenarioKPI label="Omkostninger" value={-totalCosts} color={scenarioConfig.color} />
              <ScenarioKPI label="EBITDA" value={totalEbitda} color={totalEbitda >= 0 ? "text-primary" : "text-destructive"} diff={activeScenario !== "base" ? ebitdaDiffFromBase : undefined} />
              <ScenarioKPI label="EBITDA-margin" value={totalOmsaetning > 0 ? Math.round((totalEbitda / totalOmsaetning) * 100) : 0} color={totalEbitda >= 0 ? "text-primary" : "text-destructive"} suffix="%" />
            </div>

            <TooltipProvider>
              <div className="overflow-x-auto rounded-lg border border-border/30">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider sticky left-0 bg-secondary/30 min-w-[200px] z-10">Linje</th>
                      {MONTHS.map(m => (
                        <th key={m} className="text-right py-2.5 px-2.5 text-muted-foreground font-medium text-xs uppercase tracking-wider min-w-[65px]">{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedRows.map(group => (
                      <>
                        <tr key={`group-${group.group}`} className="bg-muted/30">
                          <td colSpan={13} className="py-2 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider sticky left-0 bg-muted/30 z-10">
                            {group.label}
                          </td>
                        </tr>
                        {group.rows.map(row => {
                          const RowIcon = row.icon;
                          const isManual = row.key.startsWith("manual_");
                          const isRenamingThis = editingLabel === row.key;
                          return (
                            <tr key={row.key} className="group border-b border-border/30 hover:bg-secondary/20 transition-colors">
                              <td className="py-2.5 px-3 text-foreground font-medium text-xs sticky left-0 bg-card z-10">
                                <div className="flex items-center gap-1.5">
                                  {RowIcon && <RowIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                                  {isRenamingThis ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        autoFocus
                                        value={editLabelValue}
                                        onChange={e => setEditLabelValue(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") commitRenameLabel(); if (e.key === "Escape") setEditingLabel(null); }}
                                        className="w-28 bg-secondary border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                      />
                                      <button onClick={commitRenameLabel} className="text-primary hover:text-primary/80"><Save className="h-3 w-3" /></button>
                                      <button onClick={() => setEditingLabel(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                                    </div>
                                  ) : (
                                    <>
                                      <span>{row.label}</span>
                                      {isManual && <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">Manuelt</span>}
                                      <button
                                        onClick={() => startRenameLabel(row.key, row.label)}
                                        className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                        title="Omdøb"
                                      >
                                        <Pencil className="h-2.5 w-2.5" />
                                      </button>
                                    </>
                                  )}
                                  {row.hint && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 cursor-help" />
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="max-w-[200px] text-xs">
                                        {row.hint}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  {isManual && (
                                    <button
                                      onClick={() => handleDeleteCategory(row.key)}
                                      className="text-muted-foreground hover:text-destructive transition-colors ml-auto"
                                      title="Slet kategori"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </td>
                              {row.values.map((val, i) => (
                                <td key={i} className="py-2.5 px-2.5 text-right font-display text-xs">
                                  {editing && row.isEditable ? (
                                    <input
                                      type="number"
                                      value={editValues[row.key]?.[i] ?? val}
                                      onChange={(e) => updateCell(row.key, i, e.target.value)}
                                      className="w-16 text-right bg-secondary border border-border rounded px-1 py-0.5 text-foreground text-xs font-display focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                  ) : (
                                    <span className={val === 0 ? "text-muted-foreground" : "text-foreground"}>{formatK(val)}</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                        {/* Add category button */}
                        <tr key={`add-${group.group}`} className="border-b border-border/10">
                          <td colSpan={13} className="py-1 px-3 sticky left-0 bg-card z-10">
                            {addingToGroup === group.group ? (
                              <div className="flex items-center gap-2 py-1">
                                <input
                                  autoFocus
                                  placeholder="Kategori-navn..."
                                  value={newCatLabel}
                                  onChange={e => setNewCatLabel(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") handleAddCategory(group.group); if (e.key === "Escape") { setAddingToGroup(null); setNewCatLabel(""); } }}
                                  className="w-40 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <button
                                  onClick={() => handleAddCategory(group.group)}
                                  disabled={!newCatLabel.trim()}
                                  className="text-xs font-medium px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                >
                                  Tilføj
                                </button>
                                <button
                                  onClick={() => { setAddingToGroup(null); setNewCatLabel(""); }}
                                  className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAddingToGroup(group.group)}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1"
                              >
                                <Plus className="h-3 w-3" /> Tilføj kategori
                              </button>
                            )}
                          </td>
                        </tr>
                      </>
                    ))}
                    <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                      <td className="py-2.5 px-3 text-foreground font-bold text-xs sticky left-0 bg-secondary/20 z-10">EBITDA</td>
                      {ebitda.map((val, i) => (
                        <td key={i} className={`py-2.5 px-2.5 text-right font-display text-xs font-bold ${val >= 0 ? "text-primary" : "text-destructive"}`}>{formatK(val)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </TooltipProvider>
          </div>

          <div className="glass-card rounded-xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Scenarie-sammenligning
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Nøgletal</th>
                    {SCENARIOS.map(sc => (
                      <th key={sc.key} className="text-right py-3 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        <span className="flex items-center justify-end gap-1">
                          <sc.icon className={`h-3 w-3 ${sc.color}`} />{sc.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="hover:bg-secondary/30 transition-colors">
                    <td className="py-3 px-3 text-foreground font-medium">Omsætning</td>
                    {SCENARIOS.map(sc => {
                      const val = scenarioData[sc.key].filter(r => r.group === "indtaegter").reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0);
                      return <td key={sc.key} className="py-3 px-3 text-right font-display">{(val / 1000).toFixed(0)}k</td>;
                    })}
                  </tr>
                  <tr className="hover:bg-secondary/30 transition-colors">
                    <td className="py-3 px-3 text-foreground font-medium">Omkostninger</td>
                    {SCENARIOS.map(sc => {
                      const val = scenarioData[sc.key].filter(r => r.group !== "indtaegter").reduce((s, r) => s + Math.abs(r.values.reduce((a, b) => a + b, 0)), 0);
                      return <td key={sc.key} className="py-3 px-3 text-right font-display">{(val / 1000).toFixed(0)}k</td>;
                    })}
                  </tr>
                  <tr className="font-semibold border-t-2 border-border">
                    <td className="py-3 px-3 text-foreground font-bold">EBITDA</td>
                    {SCENARIOS.map(sc => {
                      const rev = scenarioData[sc.key].filter(r => r.group === "indtaegter").reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0);
                      const cost = scenarioData[sc.key].filter(r => r.group !== "indtaegter").reduce((s, r) => s + Math.abs(r.values.reduce((a, b) => a + b, 0)), 0);
                      const val = rev - cost;
                      return <td key={sc.key} className={`py-3 px-3 text-right font-display font-bold ${val >= 0 ? "text-primary" : "text-destructive"}`}>{(val / 1000).toFixed(0)}k</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Monthly Grid Tab — Budget vs. Actual */}
        <TabsContent value="maaned" className="space-y-4">
          <BudgetVsActualTab scenarioData={scenarioData} year={year} userId={user?.id} />
        </TabsContent>

        {/* Import Tab */}
        <TabsContent value="import">
          <BudgetImport userId={user?.id || ""} onImportComplete={handleImportComplete} />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

// ─── Budget category key → report key_figures key mapping ───
const BUDGET_TO_REPORT_KEY: Record<string, string> = {
  omsaetning: "omsaetning",
  direkte_omk: "direkte_omkostninger",
  vareforbrug: "direkte_omkostninger",
  loenninger: "loenninger",
  marketing: "marketing",
  digital_marketing: "marketing",
  lokaler: "lokaler",
  admin: "admin",
  admin_regnskab: "admin",
  tech_software: "tech_software",
  platform_tech: "tech_software",
};

// Categories where higher actual is favorable (revenue)
const REVENUE_GROUPS = new Set(["indtaegter"]);

function BudgetVsActualTab({
  scenarioData,
  year,
  userId,
}: {
  scenarioData: Record<ScenarioKey, BudgetRow[]>;
  year: string;
  userId: string | undefined;
}) {
  const { data: reports } = useQuery({
    queryKey: ["financial-reports-actuals", userId, year],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_reports")
        .select("report_period, extracted_data")
        .eq("user_id", userId!)
        .eq("status", "processed");
      return data || [];
    },
  });

  // Build actuals map: monthIndex (0-11) → { budgetCategoryKey → value }
  const actualsMap = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    if (!reports) return map;

    for (const report of reports) {
      const periodKey = parseReportPeriodToKey(report.report_period);
      if (!periodKey) continue;
      const [reportYear, monthStr] = periodKey.split("-");
      if (reportYear !== year) continue;
      const monthIdx = parseInt(monthStr, 10) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;

      const ed = report.extracted_data as Record<string, any> | null;
      const kf = ed?.key_figures as Record<string, number> | null;
      if (!kf) continue;

      if (!map[monthIdx]) map[monthIdx] = {};
      // Map each known key_figure to the corresponding budget keys
      for (const [budgetKey, reportKey] of Object.entries(BUDGET_TO_REPORT_KEY)) {
        if (kf[reportKey] != null) {
          map[monthIdx][budgetKey] = Math.abs(kf[reportKey]);
        }
      }
    }
    return map;
  }, [reports, year]);

  const baseRows = scenarioData.base;
  const hasAnyActuals = Object.keys(actualsMap).length > 0;

  // Group rows
  const groupedRows = GROUP_ORDER
    .map(g => ({ group: g, label: GROUP_LABELS[g], rows: baseRows.filter(r => r.group === g) }))
    .filter(g => g.rows.length > 0);

  // Compute EBITDA per month
  const revenueRows = baseRows.filter(r => r.group === "indtaegter");
  const costRows = baseRows.filter(r => r.group !== "indtaegter");

  const budgetEbitda = MONTHS.map((_, i) => {
    const rev = revenueRows.reduce((s, r) => s + r.values[i], 0);
    const cost = costRows.reduce((s, r) => s + Math.abs(r.values[i]), 0);
    return rev - cost;
  });

  const actualEbitda = MONTHS.map((_, i) => {
    if (!actualsMap[i]) return null;
    const rev = revenueRows.reduce((s, r) => s + (actualsMap[i]?.[r.key] ?? 0), 0);
    const cost = costRows.reduce((s, r) => s + (actualsMap[i]?.[r.key] ?? 0), 0);
    return rev - cost;
  });

  // Summary totals
  const totalBudgetRevenue = revenueRows.reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0);
  const totalBudgetCosts = costRows.reduce((s, r) => s + Math.abs(r.values.reduce((a, b) => a + b, 0)), 0);
  const totalBudgetEbitda = totalBudgetRevenue - totalBudgetCosts;

  const totalActualRevenue = MONTHS.reduce((s, _, i) => s + revenueRows.reduce((rs, r) => rs + (actualsMap[i]?.[r.key] ?? 0), 0), 0);
  const totalActualCosts = MONTHS.reduce((s, _, i) => s + costRows.reduce((rs, r) => rs + (actualsMap[i]?.[r.key] ?? 0), 0), 0);
  const totalActualEbitda = totalActualRevenue - totalActualCosts;

  function varianceColor(budget: number, actual: number | null, isRevenue: boolean): string {
    if (actual == null) return "text-muted-foreground";
    const diff = isRevenue ? actual - budget : budget - actual;
    const pct = budget !== 0 ? (diff / Math.abs(budget)) * 100 : 0;
    if (diff >= 0) return "text-primary";
    if (Math.abs(pct) > 10) return "text-destructive";
    return "text-chart-warning";
  }

  function varianceIcon(budget: number, actual: number | null, isRevenue: boolean) {
    if (actual == null) return null;
    const diff = isRevenue ? actual - budget : budget - actual;
    const pct = budget !== 0 ? (diff / Math.abs(budget)) * 100 : 0;
    if (diff >= 0) return <CheckCircle2 className="h-3 w-3 text-primary inline" />;
    if (Math.abs(pct) > 10) return <AlertTriangle className="h-3 w-3 text-destructive inline" />;
    return <AlertTriangle className="h-3 w-3 text-chart-warning inline" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Budget vs. Realiseret · {year}
        </h2>
        {!hasAnyActuals && (
          <span className="text-xs text-muted-foreground">Ingen rapporter for {year} endnu</span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BvaSummaryCard label="Omsætning" budget={totalBudgetRevenue} actual={hasAnyActuals ? totalActualRevenue : null} isRevenue />
        <BvaSummaryCard label="Omkostninger" budget={totalBudgetCosts} actual={hasAnyActuals ? totalActualCosts : null} isRevenue={false} />
        <BvaSummaryCard label="EBITDA" budget={totalBudgetEbitda} actual={hasAnyActuals ? totalActualEbitda : null} isRevenue />
      </div>

      {/* Main table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider sticky left-0 bg-secondary/30 min-w-[180px] z-10">Kategori</th>
                {MONTHS.map(m => (
                  <th key={m} className="text-right py-2.5 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider min-w-[75px]">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map(group => (
                <>
                  <tr key={`bva-group-${group.group}`} className="bg-muted/30">
                    <td colSpan={13} className="py-2 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider sticky left-0 bg-muted/30 z-10">
                      {group.label}
                    </td>
                  </tr>
                  {group.rows.map(row => {
                    const isRevenue = REVENUE_GROUPS.has(row.group);
                    const RowIcon = row.icon;
                    return (
                      <tr key={row.key} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                        <td className="py-2 px-3 text-foreground font-medium text-xs sticky left-0 bg-card z-10">
                          <div className="flex items-center gap-1.5">
                            {RowIcon && <RowIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                            <span>{row.label}</span>
                          </div>
                        </td>
                        {row.values.map((budgetVal, i) => {
                          const actualVal = actualsMap[i]?.[row.key] ?? null;
                          const color = varianceColor(budgetVal, actualVal, isRevenue);
                          return (
                            <td key={i} className="py-1.5 px-2 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-xs font-display text-muted-foreground">{budgetVal === 0 ? "—" : formatK(budgetVal)}</span>
                                <span className={`text-xs font-display font-semibold ${actualVal != null ? color : "text-muted-foreground/50"}`}>
                                  {actualVal != null ? formatK(actualVal) : "--"}
                                </span>
                                {actualVal != null && budgetVal !== 0 && (
                                  <span className={`text-[10px] ${color} flex items-center gap-0.5`}>
                                    {varianceIcon(budgetVal, actualVal, isRevenue)}
                                    {(() => {
                                      const diff = isRevenue ? actualVal - budgetVal : budgetVal - actualVal;
                                      const pct = (diff / Math.abs(budgetVal)) * 100;
                                      return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
                                    })()}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </>
              ))}
              {/* EBITDA row */}
              <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                <td className="py-2.5 px-3 text-foreground font-bold text-xs sticky left-0 bg-secondary/20 z-10">EBITDA</td>
                {budgetEbitda.map((bVal, i) => {
                  const aVal = actualEbitda[i];
                  const color = varianceColor(bVal, aVal, true);
                  return (
                    <td key={i} className="py-1.5 px-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-xs font-display font-bold ${bVal >= 0 ? "text-primary" : "text-destructive"}`}>{formatK(bVal)}</span>
                        <span className={`text-xs font-display font-bold ${aVal != null ? color : "text-muted-foreground/50"}`}>
                          {aVal != null ? formatK(aVal) : "--"}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {/* Legend */}
        <div className="px-4 py-2 border-t border-border/30 flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" /> Budget</span>
          <span className="flex items-center gap-1"><span className="font-bold text-foreground">Fed</span> Realiseret</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /> Favorable</span>
          <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-chart-warning" /> {'<10% afvigelse'}</span>
          <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-destructive" /> {'>10% afvigelse'}</span>
        </div>
      </div>
    </div>
  );
}

function BvaSummaryCard({ label, budget, actual, isRevenue }: { label: string; budget: number; actual: number | null; isRevenue: boolean }) {
  const hasActual = actual != null && actual !== 0;
  const diff = hasActual ? (isRevenue ? actual - budget : budget - actual) : 0;
  const pct = hasActual && budget !== 0 ? (diff / Math.abs(budget)) * 100 : 0;
  const favorable = diff >= 0;

  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border/30">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground">Budget</p>
          <p className="text-sm font-display font-bold text-foreground">{formatK(budget)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Realiseret</p>
          <p className={`text-sm font-display font-bold ${!hasActual ? "text-muted-foreground" : favorable ? "text-primary" : "text-destructive"}`}>
            {hasActual ? formatK(actual) : "—"}
          </p>
        </div>
      </div>
      {hasActual && (
        <div className={`mt-2 text-xs font-medium ${favorable ? "text-primary" : "text-destructive"}`}>
          {pct > 0 ? "+" : ""}{pct.toFixed(1)}% afvigelse
        </div>
      )}
    </div>
  );
}

function SummaryKPI({ icon: Icon, label, value, valueColor }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; valueColor?: string }) {
  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border/30 hover:bg-secondary/70 transition-colors cursor-pointer">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-lg font-display font-bold ${valueColor || "text-foreground"}`}>{value}</p>
    </div>
  );
}

function ScenarioKPI({ label, value, color, diff, suffix }: { label: string; value: number; color: string; diff?: number; suffix?: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/30 border border-border/20">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-display font-bold ${value >= 0 ? (color || "text-foreground") : "text-destructive"}`}>
        {suffix ? `${value}${suffix}` : `${(value / 1000).toFixed(0)}k kr.`}
      </p>
      {diff !== undefined && diff !== 0 && (
        <p className={`text-[10px] font-medium mt-0.5 ${diff >= 0 ? "text-primary" : "text-destructive"}`}>
          {diff > 0 ? "+" : ""}{(diff / 1000).toFixed(0)}k vs. base
        </p>
      )}
    </div>
  );
}

function CostGroupCard({ label, amount, count }: { label: string; amount: number; count: number }) {
  return (
    <div className="p-4 rounded-xl bg-secondary/30 border border-border/20 hover:bg-secondary/50 transition-colors cursor-pointer group">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-base font-display font-bold text-foreground">{amount > 0 ? `${(amount / 1000).toFixed(0)}k kr.` : "—"}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{count} poster</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

export default Budget;
