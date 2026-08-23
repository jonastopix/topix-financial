import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDKK } from "@/lib/financialUtils";
import { GROUP_LABELS, GROUP_ORDER, type BudgetTemplate } from "@/lib/budgetTemplates";
import {
  applyQuickstartRows,
  computeEbitda,
  copyBaseToScenario as engineCopyBaseToScenario,
  distributeEvenly,
  distributeSeasonally,
  generateAIScenario as engineGenerateAIScenario,
  saveScenarioEdits,
} from "@/lib/budgetEngine";
import { MONTHS, SCENARIOS, type BudgetRow, type ScenarioKey } from "@/components/budget/types";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbField, HbInput, hbControlClasses } from "../admin/HbField";
import { HbSegmented } from "../admin/HbSegmented";
import { QuietNote, TalStat, fmtNumber } from "./hbBudgetShared";

/** Scenarier-sektionen (design-blok §c5): HbSegmented som scenarievalg
    (scenarie-kort-teatret og Shield/Zap/TrendingDown-alarmfarverne arves
    ikke — scenarier er planer), TalStrip-nøgletal, quickstart, AI-forslag
    m. stille status, redigeringstabellen m. HbInput-mønstre og
    fordelings-hjælpelinjen. Al persistering går gennem budgetEngine
    (W2-W4); kvitteringer er stille (savedNote-mønstret). Handler-logikken
    spejler BudgetScenariosTab 1:1 — kun kvitteringsformen afviger. */

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

const cellInputClasses =
  "w-20 rounded-md border border-hb-line bg-hb-surface px-1.5 py-1 text-right text-xs text-hb-ink focus:outline-none focus:ring-2 focus:ring-hb-evergreen/50";

export const HbBudgetEditTable = ({
  scenarioData,
  setScenarioData,
  activeScenario,
  setActiveScenario,
  year,
  userId,
  companyId,
  selectedTemplate,
  labelOverrides,
  setLabelOverrides,
}: Props) => {
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, number[]>>({});
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showQuickstart, setShowQuickstart] = useState(true);
  const [quickValues, setQuickValues] = useState({ revenue: "", costs: "", payroll: "" });
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const rows = scenarioData[activeScenario];
  const scenarioConfig = SCENARIOS.find((s) => s.key === activeScenario)!;

  const revenueRows = rows.filter((r) => r.group === "indtaegter");
  const costRows = rows.filter((r) => r.group !== "indtaegter");
  const ebitda = computeEbitda(rows);

  const totalOmsaetning = revenueRows.reduce((sum, row) => sum + row.values.reduce((s, v) => s + v, 0), 0);
  const totalCosts = costRows.reduce((sum, row) => sum + Math.abs(row.values.reduce((s, v) => s + v, 0)), 0);
  const totalEbitda = ebitda.reduce((s, v) => s + v, 0);

  const baseEbitdaTotal = computeEbitda(scenarioData.base).reduce((s, v) => s + v, 0);
  const ebitdaDiffFromBase = totalEbitda - baseEbitdaTotal;

  const groupedRows = GROUP_ORDER.map((g) => ({
    group: g,
    label: GROUP_LABELS[g],
    rows: rows.filter((r) => r.group === g),
  }));

  const isScenarioEmpty = rows.every((r) => r.values.every((v) => v === 0));

  const note = (text: string) => {
    setSaveError(null);
    setSavedNote(text);
  };
  const fail = (text: string) => {
    setSavedNote(null);
    setSaveError(text);
  };

  const startEditing = () => {
    const vals: Record<string, number[]> = {};
    rows.forEach((r) => {
      vals[r.key] = [...r.values];
    });
    setEditValues(vals);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditValues({});
  };

  const saveEdits = async () => {
    const updatedScenario = scenarioData[activeScenario].map((row) => ({
      ...row,
      values: editValues[row.key] || row.values,
    }));

    setScenarioData((prev) => (prev ? { ...prev, [activeScenario]: updatedScenario } : prev));
    setEditing(false);
    setEditValues({});

    if (!userId || !companyId) return;

    try {
      await saveScenarioEdits({
        userId,
        companyId,
        year,
        scenario: activeScenario,
        rows: updatedScenario,
        labelOverrides,
        templateKeys: new Set(selectedTemplate?.categories.map((c) => c.key) || []),
      });
      note(`${scenarioConfig.label}-scenariet er gemt`);
    } catch (error) {
      console.error("Budget save error:", error);
      fail("Kunne ikke gemme budgettet — prøv igen");
    }
  };

  const updateCell = (key: string, monthIdx: number, value: string) => {
    const num = parseInt(value) || 0;
    setEditValues((prev) => {
      const updated = { ...prev };
      updated[key] = [...(updated[key] || [])];
      updated[key][monthIdx] = num;
      return updated;
    });
  };

  const copyBase = async (target: ScenarioKey) => {
    const copiedRows = scenarioData.base.map((r) => ({ ...r, values: [...r.values] }));
    setScenarioData((prev) => (prev ? { ...prev, [target]: copiedRows } : prev));

    if (!userId || !companyId) return;

    try {
      await engineCopyBaseToScenario({ userId, companyId, year, target, baseRows: scenarioData.base });
      note(`Base-budgettet er kopieret til ${SCENARIOS.find((s) => s.key === target)?.label}`);
    } catch {
      fail("Kunne ikke gemme scenariet — prøv igen");
    }
  };

  const generateAI = async (target: ScenarioKey) => {
    if (!userId || !companyId) return;
    const baseHasData = scenarioData.base.some((r) => r.values.some((v) => v !== 0));
    if (!baseHasData) {
      fail("Udfyld base-budgettet først — forslaget tager udgangspunkt i det");
      return;
    }

    setGenerating(true);
    try {
      const { updatedRows, reasoning, matchedCount, totalRowCount } = await engineGenerateAIScenario({
        userId,
        companyId,
        year,
        target,
        baseRows: scenarioData.base,
      });
      setScenarioData((prev) => (prev ? { ...prev, [target]: updatedRows } : prev));
      const summary = `Forslag klar — ${matchedCount} af ${totalRowCount} linjer justeret`;
      note(reasoning ? `${summary} · ${reasoning}` : summary);
      setActiveScenario(target);
    } catch (err: any) {
      console.error("AI scenario error:", err);
      fail(err?.message ? `Kunne ikke lave forslaget: ${err.message}` : "Kunne ikke lave forslaget");
    } finally {
      setGenerating(false);
    }
  };

  const applyQuickstart = () => {
    const rev = Number(quickValues.revenue) || 0;
    const costs = Number(quickValues.costs) || 0;
    const pay = Number(quickValues.payroll) || 0;
    if (rev === 0) return;

    const updated = applyQuickstartRows(scenarioData[activeScenario], {
      revenue: rev,
      costs,
      payroll: pay,
    });
    setScenarioData((prev) => (prev ? { ...prev, [activeScenario]: updated } : prev));
    setShowQuickstart(false);
    note("Tallene er fordelt på 12 måneder — finjustér i tabellen og gem");
  };

  const handleAddCategory = (group: string) => {
    if (!newCatLabel.trim()) return;
    const key = `manual_${newCatLabel.trim().toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const newRow: BudgetRow = {
      key,
      label: newCatLabel.trim(),
      values: Array(12).fill(0),
      isEditable: true,
      group,
    };
    setScenarioData((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const sc of Object.keys(updated) as ScenarioKey[]) {
        updated[sc] = [...updated[sc], { ...newRow, values: [...newRow.values] }];
      }
      return updated;
    });
    setAddingToGroup(null);
    setNewCatLabel("");
    note(`"${newRow.label}" er tilføjet — den gemmes sammen med scenariet`);
  };

  const handleDeleteCategory = (key: string) => {
    setScenarioData((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const sc of Object.keys(updated) as ScenarioKey[]) {
        updated[sc] = updated[sc].filter((r) => r.key !== key);
      }
      return updated;
    });
    setLabelOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    note("Linjen er fjernet — ændringen gemmes ved næste gem");
  };

  const commitRenameLabel = () => {
    if (!editingLabel || !editLabelValue.trim()) return;
    const key = editingLabel;
    const newLabel = editLabelValue.trim();
    setLabelOverrides((prev) => ({ ...prev, [key]: newLabel }));
    setScenarioData((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const sc of Object.keys(updated) as ScenarioKey[]) {
        updated[sc] = updated[sc].map((r) => (r.key === key ? { ...r, label: newLabel } : r));
      }
      return updated;
    });
    setEditingLabel(null);
    setEditLabelValue("");
  };

  const scenarioSummary = (key: ScenarioKey) => {
    const scRows = scenarioData[key];
    const revenue = scRows
      .filter((r) => r.group === "indtaegter")
      .reduce((s, r) => s + r.values.reduce((a, b) => a + b, 0), 0);
    const scEbitda = computeEbitda(scRows).reduce((s, v) => s + v, 0);
    return { revenue, ebitda: scEbitda };
  };

  return (
    <div className="space-y-5">
      {/* Scenarievalg */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HbSegmented
          value={activeScenario}
          options={SCENARIOS.map((s) => ({ value: s.key, label: s.label }))}
          onChange={(key) => {
            if (editing) cancelEditing();
            setActiveScenario(key);
          }}
          aria-label="Vælg scenarie"
        />
        <p className="text-sm text-hb-ink-soft">
          {scenarioConfig.description}
          {activeScenario !== "base" && ebitdaDiffFromBase !== 0 && (
            <> · {ebitdaDiffFromBase > 0 ? "+" : ""}{fmtNumber(ebitdaDiffFromBase)} kr. EBITDA vs. base</>
          )}
        </p>
      </div>

      {/* Nøgletal for aktivt scenarie */}
      <HbCard className="p-5">
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <TalStat label="Omsætning" value={formatDKK(totalOmsaetning)} />
          <TalStat label="Omkostninger" value={formatDKK(totalCosts)} />
          <TalStat
            label="EBITDA"
            value={formatDKK(totalEbitda)}
            attention={totalEbitda < 0}
            sub={
              activeScenario !== "base" && ebitdaDiffFromBase !== 0
                ? `${ebitdaDiffFromBase > 0 ? "+" : ""}${fmtNumber(ebitdaDiffFromBase)} kr. vs. base`
                : undefined
            }
          />
          <TalStat
            label="EBITDA-margin"
            value={totalOmsaetning > 0 ? `${Math.round((totalEbitda / totalOmsaetning) * 100)} %` : "—"}
            attention={totalEbitda < 0}
          />
        </div>
      </HbCard>

      {/* Tomt ikke-base-scenarie: rolig invitation */}
      {activeScenario !== "base" && isScenarioEmpty && (
        <HbCard className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-hb-ink-soft">
            Dette scenarie er tomt — start med en kopi af dit base-budget og justér derfra.
          </p>
          <HbButton variant="secondary" className="h-9 px-5 text-sm" onClick={() => void copyBase(activeScenario)}>
            Kopiér fra base
          </HbButton>
        </HbCard>
      )}

      {/* Quickstart */}
      {showQuickstart && totalOmsaetning === 0 && !editing && (
        <HbCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-editorial text-lg font-medium text-hb-ink">Kom i gang på 5 minutter</p>
              <p className="mt-1 text-sm text-hb-ink-soft">
                Indtast tre årstal — vi fordeler dem på 12 måneder, og du kan finjustere bagefter.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowQuickstart(false)}
              className="text-sm text-hb-ink-soft underline-offset-4 hover:underline"
            >
              Skjul
            </button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { key: "revenue" as const, label: "Omsætningsmål (kr/år)", placeholder: "F.eks. 3.000.000" },
              { key: "payroll" as const, label: "Lønbudget (kr/år)", placeholder: "F.eks. 900.000" },
              { key: "costs" as const, label: "Øvrige omkostninger (kr/år)", placeholder: "F.eks. 600.000" },
            ].map((f) => (
              <HbField key={f.key} label={f.label}>
                <HbInput
                  inputMode="numeric"
                  value={quickValues[f.key]}
                  onChange={(e) =>
                    setQuickValues((v) => ({ ...v, [f.key]: e.target.value.replace(/[^\d]/g, "") }))
                  }
                  placeholder={f.placeholder}
                />
              </HbField>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4">
            <HbButton className="h-9 px-5 text-sm" disabled={!quickValues.revenue} onClick={applyQuickstart}>
              Sæt budget-udgangspunkt
            </HbButton>
            <span className="text-xs text-hb-ink-soft">Alle tal kan justeres bagefter</span>
          </div>
        </HbCard>
      )}

      {/* Handlingsrække + kvittering */}
      <div className="flex flex-wrap items-center gap-3">
        {!editing ? (
          <HbButton className="h-9 px-5 text-sm" onClick={startEditing}>
            Redigér tal
          </HbButton>
        ) : (
          <>
            <HbButton className="h-9 px-5 text-sm" onClick={() => void saveEdits()}>
              Gem
            </HbButton>
            <HbButton variant="secondary" className="h-9 px-5 text-sm" onClick={cancelEditing}>
              Annullér
            </HbButton>
          </>
        )}
        {activeScenario !== "base" && !editing && (
          <>
            <HbButton
              variant="secondary"
              className="h-9 px-5 text-sm"
              disabled={generating}
              onClick={() => void generateAI(activeScenario)}
            >
              {generating ? "Laver forslag…" : "Foreslå scenarie"}
            </HbButton>
            <HbButton variant="secondary" className="h-9 px-5 text-sm" onClick={() => void copyBase(activeScenario)}>
              Kopiér base
            </HbButton>
          </>
        )}
        <QuietNote note={savedNote} error={saveError} />
      </div>
      {activeScenario !== "base" && (
        <p className="text-xs text-hb-ink-soft">
          Vi foreslår et {scenarioConfig.label.toLowerCase()}-budget ud fra dit base-budget — hver linje
          justeres og kan rettes bagefter.
        </p>
      )}

      {/* Redigeringstabellen */}
      <HbCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hb-line">
                <th className="sticky left-0 z-10 min-w-[200px] bg-hb-surface px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                  Linje
                </th>
                {MONTHS.map((m) => (
                  <th
                    key={m}
                    className="min-w-[72px] px-2 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft"
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group) => (
                <React.Fragment key={group.group}>
                  <tr className="bg-hb-sage/25">
                    <td
                      colSpan={13}
                      className="sticky left-0 z-10 bg-hb-sage/25 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft"
                    >
                      {group.label}
                    </td>
                  </tr>
                  {group.rows.map((row) => {
                    const isManual = row.key.startsWith("manual_");
                    const isRenamingThis = editingLabel === row.key;
                    const currentVals = editValues[row.key] ?? row.values;
                    const currentTotal = currentVals.reduce((s: number, v: number) => s + v, 0);
                    return (
                      <React.Fragment key={row.key}>
                        {editing && row.isEditable && (
                          <tr className="bg-hb-sand/40">
                            <td colSpan={13} className="px-4 py-1.5">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-hb-ink-soft">
                                <label>Årsbeløb:</label>
                                <input
                                  type="number"
                                  placeholder="F.eks. 300000"
                                  className={cn(cellInputClasses, "w-28 text-left")}
                                  onChange={(e) => {
                                    const annual = Number(e.target.value);
                                    if (annual <= 0) return;
                                    setEditValues((prev) => ({ ...prev, [row.key]: distributeEvenly(annual) }));
                                  }}
                                />
                                <button
                                  type="button"
                                  className="underline-offset-4 hover:text-hb-ink hover:underline"
                                  onClick={() => {
                                    if (currentTotal === 0) return;
                                    setEditValues((prev) => ({ ...prev, [row.key]: distributeEvenly(currentTotal) }));
                                  }}
                                >
                                  Fordel jævnt (÷12)
                                </button>
                                <button
                                  type="button"
                                  className="underline-offset-4 hover:text-hb-ink hover:underline"
                                  onClick={() => {
                                    if (currentTotal === 0) return;
                                    setEditValues((prev) => ({ ...prev, [row.key]: distributeSeasonally(currentTotal) }));
                                  }}
                                >
                                  Sæsonfordel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr className="group border-b border-hb-line/60">
                          <td className="sticky left-0 z-10 bg-hb-surface px-4 py-2.5 text-xs font-medium text-hb-ink">
                            {isRenamingThis ? (
                              <span className="flex items-center gap-2">
                                <input
                                  autoFocus
                                  value={editLabelValue}
                                  onChange={(e) => setEditLabelValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitRenameLabel();
                                    if (e.key === "Escape") setEditingLabel(null);
                                  }}
                                  className={cn(cellInputClasses, "w-32 text-left")}
                                />
                                <button type="button" onClick={commitRenameLabel} className="text-xs text-hb-evergreen underline-offset-4 hover:underline">
                                  Gem
                                </button>
                                <button type="button" onClick={() => setEditingLabel(null)} className="text-xs text-hb-ink-soft underline-offset-4 hover:underline">
                                  Fortryd
                                </button>
                              </span>
                            ) : (
                              <span className="flex items-center gap-2">
                                <span title={row.hint}>{row.label}</span>
                                {isManual && (
                                  <span className="rounded-full bg-hb-sage px-2 py-0.5 text-[10px] text-hb-ink">
                                    Manuel
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLabel(row.key);
                                    setEditLabelValue(row.label);
                                  }}
                                  className="text-[11px] text-hb-ink-soft opacity-0 underline-offset-4 transition-opacity hover:underline group-hover:opacity-100"
                                >
                                  Omdøb
                                </button>
                                {/* Enhver række kan slettes — også importerede
                                    (design §5: manual_-værnet var en død ende;
                                    har parseren opfundet en linje, skal medlemmet
                                    kunne fjerne den, ikke kun rette dens tal). */}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(row.key)}
                                  className="ml-auto text-[11px] text-hb-ink-soft opacity-0 underline-offset-4 transition-opacity hover:text-hb-rust hover:underline group-hover:opacity-100"
                                >
                                  Fjern
                                </button>
                              </span>
                            )}
                          </td>
                          {row.values.map((val, i) => (
                            <td key={i} className="px-2 py-2 text-right text-xs tabular-nums">
                              {editing && row.isEditable ? (
                                <input
                                  type="number"
                                  value={editValues[row.key]?.[i] ?? val}
                                  onChange={(e) => updateCell(row.key, i, e.target.value)}
                                  className={cellInputClasses}
                                />
                              ) : (
                                <span className={val === 0 ? "text-hb-ink-soft/60" : "text-hb-ink"}>
                                  {fmtNumber(val)}
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  <tr className="border-b border-hb-line/40">
                    <td colSpan={13} className="sticky left-0 z-10 bg-hb-surface px-4 py-1.5">
                      {addingToGroup === group.group ? (
                        <span className="flex items-center gap-2">
                          <input
                            autoFocus
                            placeholder="Navn på ny linje…"
                            value={newCatLabel}
                            onChange={(e) => setNewCatLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddCategory(group.group);
                              if (e.key === "Escape") {
                                setAddingToGroup(null);
                                setNewCatLabel("");
                              }
                            }}
                            className={cn(cellInputClasses, "w-44 text-left")}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddCategory(group.group)}
                            disabled={!newCatLabel.trim()}
                            className="text-xs text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50"
                          >
                            Tilføj
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingToGroup(null);
                              setNewCatLabel("");
                            }}
                            className="text-xs text-hb-ink-soft underline-offset-4 hover:underline"
                          >
                            Fortryd
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingToGroup(group.group)}
                          className="text-[11px] text-hb-ink-soft underline-offset-4 hover:text-hb-ink hover:underline"
                        >
                          + Tilføj linje
                        </button>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
              <tr className="border-t border-hb-line bg-hb-sand/40 font-medium">
                <td className="sticky left-0 z-10 bg-hb-sand/40 px-4 py-2.5 text-xs font-medium text-hb-ink">
                  EBITDA
                </td>
                {ebitda.map((val, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-2 py-2.5 text-right text-xs tabular-nums",
                      val < 0 ? "text-hb-rust" : "text-hb-ink",
                    )}
                  >
                    {fmtNumber(val)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-hb-line px-4 py-2 text-[11px] text-hb-ink-soft">
          Alle beløb i kr. pr. måned.
        </p>
      </HbCard>

      {/* Scenarie-sammenligning */}
      <HbCard className="p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
          Scenarie-sammenligning
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hb-line">
                <th className="py-2 pr-3 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                  Nøgletal
                </th>
                {SCENARIOS.map((sc) => (
                  <th
                    key={sc.key}
                    className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft"
                  >
                    {sc.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-hb-line/60">
                <td className="py-2.5 pr-3 text-hb-ink">Omsætning</td>
                {SCENARIOS.map((sc) => (
                  <td key={sc.key} className="px-3 py-2.5 text-right tabular-nums text-hb-ink">
                    {fmtNumber(scenarioSummary(sc.key).revenue)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-hb-line/60">
                <td className="py-2.5 pr-3 text-hb-ink">Omkostninger</td>
                {SCENARIOS.map((sc) => {
                  const scRows = scenarioData[sc.key];
                  const val = scRows
                    .filter((r) => r.group !== "indtaegter")
                    .reduce((s, r) => s + Math.abs(r.values.reduce((a, b) => a + b, 0)), 0);
                  return (
                    <td key={sc.key} className="px-3 py-2.5 text-right tabular-nums text-hb-ink">
                      {fmtNumber(val)}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="py-2.5 pr-3 font-medium text-hb-ink">EBITDA</td>
                {SCENARIOS.map((sc) => {
                  const val = scenarioSummary(sc.key).ebitda;
                  return (
                    <td
                      key={sc.key}
                      className={cn(
                        "px-3 py-2.5 text-right font-medium tabular-nums",
                        val < 0 ? "text-hb-rust" : "text-hb-ink",
                      )}
                    >
                      {fmtNumber(val)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-hb-ink-soft">Alle beløb i kr. pr. år.</p>
      </HbCard>
    </div>
  );
};
