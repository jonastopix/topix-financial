import { useState } from "react";
import {
  Pencil, Save, X, Sparkles, Copy, Info, Plus, Trash2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/budgetTemplates";
import type { BudgetTemplate } from "@/lib/budgetTemplates";
import { ScenarioKPI } from "./BudgetHelpers";
import {
  MONTHS, SCENARIOS, formatK,
  type BudgetRow, type ScenarioKey,
} from "./types";

interface Props {
  scenarioData: Record<ScenarioKey, BudgetRow[]>;
  setScenarioData: React.Dispatch<React.SetStateAction<Record<ScenarioKey, BudgetRow[]> | null>>;
  activeScenario: ScenarioKey;
  setActiveScenario: (s: ScenarioKey) => void;
  year: string;
  userId: string | undefined;
  companyId: string | undefined;
  selectedTemplate: BudgetTemplate | null;
  labelOverrides: Record<string, string>;
  setLabelOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export default function BudgetScenariosTab({
  scenarioData, setScenarioData,
  activeScenario, setActiveScenario,
  year, userId, companyId,
  selectedTemplate,
  labelOverrides, setLabelOverrides,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, number[]>>({});
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");
  const [generatingScenario, setGeneratingScenario] = useState<ScenarioKey | null>(null);

  const rows = scenarioData[activeScenario];
  const scenarioConfig = SCENARIOS.find(s => s.key === activeScenario)!;

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

    if (!userId || !companyId) return;

    const periodPrefix = `${year}-${activeScenario}-`;

    const res = await (supabase
      .from("budget_targets")
      .select("id, period, category") as any)
      .eq("company_id", companyId);
    const existing = (res.data || []) as { id: string; period: string; category: string }[];

    const toDelete = existing.filter(e =>
      e.period.startsWith(periodPrefix) ||
      e.category.startsWith("__label__") ||
      e.category.startsWith("__group__")
    );
    if (toDelete.length > 0) {
      await supabase.from("budget_targets").delete().in("id", toDelete.map(e => e.id));
    }

    const inserts = updatedScenario.flatMap(row =>
      row.values.map((val, monthIdx) => ({
        user_id: userId,
        company_id: companyId,
        category: row.key,
        budget_amount: val,
        period: `${year}-${activeScenario}-${monthIdx}`,
      }))
    );

    const labelInserts = Object.entries(labelOverrides).map(([key, label]) => ({
      user_id: userId,
      company_id: companyId,
      category: `__label__${key}`,
      budget_amount: 0,
      period: label,
    }));

    const templateKeys = new Set(selectedTemplate?.categories.map(c => c.key) || []);
    const groupInserts = updatedScenario
      .filter(r => !templateKeys.has(r.key))
      .map(r => ({
        user_id: userId,
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

  const copyBaseToScenario = async (target: ScenarioKey) => {
    const copiedRows = scenarioData.base.map(r => ({ ...r, values: [...r.values] }));
    setScenarioData(prev => prev ? { ...prev, [target]: copiedRows } : prev);

    if (!userId || !companyId) return;

    const periodPrefix = `${year}-${target}-`;
    const res = await (supabase.from("budget_targets").select("id, period") as any).eq("company_id", companyId);
    const existing = (res.data || []) as { id: string; period: string }[];
    const toDelete = existing.filter(e => e.period.startsWith(periodPrefix));
    if (toDelete.length > 0) {
      await supabase.from("budget_targets").delete().in("id", toDelete.map(e => e.id));
    }

    const inserts = copiedRows.flatMap(row =>
      row.values.map((val, monthIdx) => ({
        user_id: userId,
        company_id: companyId,
        category: row.key,
        budget_amount: val,
        period: `${year}-${target}-${monthIdx}`,
      }))
    );
    const { error } = await supabase.from("budget_targets").insert(inserts as any);
    if (error) {
      toast.error("Kunne ikke gemme scenarie");
    } else {
      toast.success(`Base-budget kopieret og gemt til ${SCENARIOS.find(s => s.key === target)?.label}`);
    }
  };

  const generateAIScenario = async (target: ScenarioKey) => {
    if (!userId || !companyId) return;
    const baseHasData = scenarioData.base.some(r => r.values.some(v => v !== 0));
    if (!baseHasData) {
      toast.error("Udfyld base-budgettet først");
      return;
    }

    setGeneratingScenario(target);
    try {
      const baseRows = scenarioData.base.map(r => ({
        key: r.key, label: r.label, group: r.group, values: r.values,
      }));

      const { data, error } = await supabase.functions.invoke("generate-budget-scenarios", {
        body: { baseRows, scenario: target },
      });

      if (error) throw error;
      if (!data?.categories) throw new Error("Ingen data returneret fra AI");

      const updatedRows = scenarioData.base.map(r => {
        const aiCat = data.categories.find((c: any) => c.key === r.key || c.key === r.label);
        return { ...r, values: aiCat?.monthly || [...r.values] };
      });

      setScenarioData(prev => prev ? { ...prev, [target]: updatedRows } : prev);

      const periodPrefix = `${year}-${target}-`;
      const res = await (supabase.from("budget_targets").select("id, period") as any).eq("company_id", companyId);
      const existing = (res.data || []) as { id: string; period: string }[];
      const toDelete = existing.filter(e => e.period.startsWith(periodPrefix));
      if (toDelete.length > 0) {
        await supabase.from("budget_targets").delete().in("id", toDelete.map(e => e.id));
      }

      const inserts = updatedRows.flatMap(row =>
        row.values.map((val, monthIdx) => ({
          user_id: userId,
          company_id: companyId,
          category: row.key,
          budget_amount: val,
          period: `${year}-${target}-${monthIdx}`,
        }))
      );
      await supabase.from("budget_targets").insert(inserts as any);

      const label = SCENARIOS.find(s => s.key === target)?.label;
      toast.success(`AI har genereret ${label}-scenarie`, {
        description: data.reasoning || undefined,
        duration: 6000,
      });
      setActiveScenario(target);
    } catch (err: any) {
      console.error("AI scenario error:", err);
      toast.error("Kunne ikke generere scenarie", { description: err.message });
    } finally {
      setGeneratingScenario(null);
    }
  };

  const handleAddCategory = (group: string) => {
    if (!newCatLabel.trim()) return;
    const key = `manual_${newCatLabel.trim().toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const newRow: BudgetRow = {
      key, label: newCatLabel.trim(), values: Array(12).fill(0), isEditable: true, group,
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
    if (!editingLabel || !editLabelValue.trim()) return;
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

  const isScenarioEmpty = rows.every(r => r.values.every(v => v === 0));

  return (
    <div className="space-y-6">
      {activeScenario !== "base" && isScenarioEmpty && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Dette scenarie er tomt
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Start med en kopi af dit base-budget og justér derfra.
            </p>
          </div>
          <button
            onClick={() => copyBaseToScenario(activeScenario)}
            className="shrink-0 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            Kopier fra base
          </button>
        </div>
      )}

      {/* Scenario cards */}
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

      {/* Active scenario detail */}
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
              <>
                <button
                  onClick={() => generateAIScenario(activeScenario)}
                  disabled={!!generatingScenario}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  {generatingScenario === activeScenario ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Genererer...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      AI-generér
                    </>
                  )}
                </button>
                <button
                  onClick={() => copyBaseToScenario(activeScenario)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Kopiér base
                </button>
              </>
            )}
            {!editing ? (
              <button
                onClick={startEditing}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Redigér
              </button>
            ) : (
              <>
                <button onClick={saveEdits} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Save className="h-3.5 w-3.5" /> Gem
                </button>
                <button onClick={cancelEditing} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3.5 w-3.5" /> Annullér
                </button>
              </>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <ScenarioKPI label="Omsætning" value={totalOmsaetning} color={scenarioConfig.color} />
          <ScenarioKPI label="Omkostninger" value={totalCosts} color="text-foreground" />
          <ScenarioKPI label="EBITDA" value={totalEbitda} color={scenarioConfig.color} diff={activeScenario !== "base" ? ebitdaDiffFromBase : undefined} />
          <ScenarioKPI label="EBITDA-margin" value={totalOmsaetning > 0 ? Math.round((totalEbitda / totalOmsaetning) * 100) : 0} color={scenarioConfig.color} suffix="%" />
        </div>

        {/* Budget table */}
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
                          {editing && row.isEditable && (() => {
                            const currentVals = editValues[row.key] ?? row.values;
                            const currentTotal = currentVals.reduce((s, v) => s + v, 0);
                            return (
                              <td colSpan={12} className="py-0 px-1">
                                <div className="flex items-center gap-2 mb-1 px-1">
                                  <label className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    Årsbeløb:
                                  </label>
                                  <input
                                    type="number"
                                    placeholder="F.eks. 300000"
                                    className="w-28 px-2 py-0.5 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                                    onChange={(e) => {
                                      const annual = Number(e.target.value);
                                      if (annual <= 0) return;
                                      const monthly = Math.round(annual / 12);
                                      const newValues = Array(12).fill(monthly);
                                      newValues[11] += annual - monthly * 12;
                                      setEditValues(prev => ({ ...prev, [row.key]: newValues }));
                                    }}
                                  />
                                  <span className="text-[10px] text-muted-foreground">→ fordeles</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (currentTotal === 0) return;
                                      const monthly = Math.round(currentTotal / 12);
                                      const newValues = Array(12).fill(monthly);
                                      newValues[11] += currentTotal - monthly * 12;
                                      setEditValues(prev => ({ ...prev, [row.key]: newValues }));
                                    }}
                                    className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                  >
                                    Fordel jævnt (÷12)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (currentTotal === 0) return;
                                      const t = currentTotal;
                                      const seasonal = [
                                        Math.round(t * 0.065), Math.round(t * 0.065), Math.round(t * 0.070),
                                        Math.round(t * 0.085), Math.round(t * 0.090), Math.round(t * 0.090),
                                        Math.round(t * 0.090), Math.round(t * 0.085), Math.round(t * 0.085),
                                        Math.round(t * 0.085), Math.round(t * 0.080), Math.round(t * 0.110),
                                      ];
                                      seasonal[11] += t - seasonal.reduce((s, v) => s + v, 0);
                                      setEditValues(prev => ({ ...prev, [row.key]: seasonal }));
                                    }}
                                    className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                  >
                                    Sæsonfordel
                                  </button>
                                </div>
                              </td>
                            );
                          })()}
                        </tr>
                        <tr key={`${row.key}-cells`} className="border-b border-border/30">
                          <td className="py-0 px-3 sticky left-0 bg-card z-10"></td>
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

      {/* Scenario comparison table */}
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
    </div>
  );
}
