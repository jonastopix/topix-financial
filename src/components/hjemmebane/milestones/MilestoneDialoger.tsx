import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { BookOpen, CalendarIcon, Check, Pencil, Sparkles } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MILESTONE_CATEGORIES, CATEGORY_OPTIONS, type MilestoneCategory } from "@/lib/milestoneCategories";
import { MILESTONE_SUGGESTIONS } from "@/lib/milestoneSuggestions";
import type { Milestone, NyMilestone } from "./useMilestones";

/**
 * ⚠️ ETAPE 2 — PORTALERNE. Alt i denne fil er de GAMLE Radix-portaler
 * (Dialog, AlertDialog, Popover, Select) med appens tokens, flyttet
 * ORDRET fra src/pages/Milestones.tsx (:277-407, opret) og
 * src/components/MilestonesList.tsx (:213-231 slet; :264-516 detalje/
 * rediger). De portalerer til <body>, UDEN FOR .theme-hjemmebane, og
 * arver derfor appens mørke tokens (HbOnboardingTjekliste.tsx:31-34 om
 * hvorfor). Det ser mørkt ud, og det er ACCEPTERET i etape 1 (4/9):
 * de skal blive ved med at virke uændret, indtil etape 2 bygger dem i
 * skallens eget DOM-træ (HbSidebarDrawer-/HbOnboardingTjekliste-mønstret).
 * Rør ikke udtrykket her — det er ikke Hb, og det skal ikke være det.
 */

const CategoryBadge = ({ category }: { category: MilestoneCategory }) => {
  const cfg = MILESTONE_CATEGORIES[category] || MILESTONE_CATEGORIES.other;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full", cfg.badgeClass)}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
};

// ── Slet (AlertDialog) — MilestonesList.tsx:213-231 ─────────────────────

export const SletMilestoneDialog = ({
  ms, open, onOpenChange, onSlet,
}: { ms: Milestone | null; open: boolean; onOpenChange: (v: boolean) => void; onSlet: () => void }) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Slet milestone?</AlertDialogTitle>
        <AlertDialogDescription>
          Er du sikker på, at du vil slette {ms ? `«${ms.title}»` : "denne milestone"}? Denne handling kan ikke fortrydes.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Annuller</AlertDialogCancel>
        <AlertDialogAction onClick={onSlet} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Slet</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

// ── Opret (Dialog + Select + Popover) — Milestones.tsx:277-407 ──────────

const tomNy = (): NyMilestone => ({
  title: "", description: "", baseline: "", category: "other", deadline: undefined, targetValue: "", unit: "",
});

export const OpretMilestoneDialog = ({
  open, onOpenChange, forudfyldt, onOpret,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Startforslag fra den tomme tilstand (Milestones.tsx:85-94). */
  forudfyldt: Partial<NyMilestone> | null;
  onOpret: (ny: NyMilestone) => Promise<boolean>;
}) => {
  const [ny, setNy] = useState<NyMilestone>(tomNy);
  const [saving, setSaving] = useState(false);
  const saet = <K extends keyof NyMilestone>(k: K, v: NyMilestone[K]) => setNy((n) => ({ ...n, [k]: v }));

  useEffect(() => {
    if (open) setNy({ ...tomNy(), ...(forudfyldt ?? {}) });
  }, [open, forudfyldt]);

  const luk = () => onOpenChange(false);
  const handleCreate = async () => {
    setSaving(true);
    const ok = await onOpret(ny);
    setSaving(false);
    if (ok) luk();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opret ny milestone</DialogTitle>
          <DialogDescription>Definer dit mål og vælg en kategori.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Titel *</label>
            <input
              value={ny.title}
              onChange={(e) => saet("title", e.target.value)}
              placeholder="F.eks. Nå 1M i omsætning"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Beskrivelse</label>
            <textarea
              value={ny.description}
              onChange={(e) => saet("description", e.target.value)}
              placeholder="Uddyb dit mål..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Kategori</label>
            <Select value={ny.category} onValueChange={(v) => saet("category", v as MilestoneCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Suggestion chips – only when title is empty */}
          {!ny.title.trim() && MILESTONE_SUGGESTIONS[ny.category]?.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground block">Forslag</label>
              <div className="flex flex-wrap gap-1.5">
                {MILESTONE_SUGGESTIONS[ny.category].map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => { saet("title", s.title); saet("description", s.description); if (s.baselineHint) saet("baseline", ""); }}
                    className="text-xs px-2.5 py-1 rounded-full bg-secondary text-foreground hover:bg-accent transition-colors text-left"
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Nuværende status / baseline</label>
            <input
              value={ny.baseline}
              onChange={(e) => saet("baseline", e.target.value)}
              placeholder={
                MILESTONE_SUGGESTIONS[ny.category]?.find((s) => s.title === ny.title)?.baselineHint
                || "F.eks. 800.000 kr. i omsætning"
              }
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          {/* Målbar milestone — valgfrit */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Gør den målbar <span className="text-muted-foreground/50 normal-case font-normal">(valgfri)</span>
              </label>
              <p className="text-[11px] text-muted-foreground mt-1">
                F.eks. &quot;10 salgskald&quot; eller &quot;500.000 kr.&quot; i stedet for en procent-slider.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Mål</label>
                <input
                  type="number"
                  min={0}
                  value={ny.targetValue}
                  onChange={(e) => saet("targetValue", e.target.value)}
                  placeholder="10"
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Enhed</label>
                <input
                  type="text"
                  value={ny.unit}
                  onChange={(e) => saet("unit", e.target.value)}
                  placeholder="salgskald, timer, kr., kunder..."
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            {ny.targetValue && ny.unit && (
              <p className="text-[11px] text-primary">
                Milestone viser: 0 / {ny.targetValue} {ny.unit}
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Deadline</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !ny.deadline && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {ny.deadline ? format(ny.deadline, "d. MMM yyyy", { locale: da }) : "Vælg deadline"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={ny.deadline} onSelect={(d) => saet("deadline", d ?? undefined)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={luk}>Annuller</Button>
          <Button onClick={handleCreate} disabled={!ny.title.trim() || saving}>
            {saving ? "Opretter..." : "Opret"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Detalje/rediger (Dialog + Select + Popover) — MilestonesList.tsx:264-516 ──

const statusFarve = {
  done: "text-primary",
  "in-progress": "text-chart-warning",
  pending: "text-muted-foreground",
  parked: "text-muted-foreground/60",
} as const;
const statusBar = {
  done: "bg-primary",
  "in-progress": "bg-chart-warning",
  pending: "bg-muted-foreground/30",
  parked: "bg-muted-foreground/20",
} as const;

export const MilestoneDetaljeDialog = ({
  ms, open, onOpenChange, onQuickProgress, onUpdateField, onUpdateCurrentValue,
}: {
  ms: Milestone | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onQuickProgress: (id: string, p: number) => void;
  onUpdateField: (id: string, fields: Record<string, unknown>) => Promise<void>;
  onUpdateCurrentValue: (id: string, newValue: number) => Promise<void>;
}) => {
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<MilestoneCategory>("other");
  const [descDraft, setDescDraft] = useState("");
  const [detailDeadline, setDetailDeadline] = useState<Date | undefined>(undefined);
  const [savingField, setSavingField] = useState(false);

  // Sync local state when ms changes from outside (MilestonesList.tsx:149-152).
  useEffect(() => { setTitleDraft(ms?.title ?? ""); }, [ms?.title]);
  useEffect(() => { setCategoryDraft(ms?.category ?? "other"); }, [ms?.category]);
  useEffect(() => { setDescDraft(ms?.description || ""); }, [ms?.description]);
  useEffect(() => { setDetailDeadline(ms?.deadline || undefined); }, [ms?.deadline]);
  useEffect(() => { if (!open) { setEditingTitle(false); setEditingDescription(false); } }, [open]);

  if (!ms) return null;
  const farve = statusFarve[ms.status];
  const bar = statusBar[ms.status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left leading-snug">
            {editingTitle ? (
              <div className="space-y-2">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!titleDraft.trim()) return;
                      setSavingField(true);
                      await onUpdateField(ms.id, { title: titleDraft.trim() });
                      setEditingTitle(false);
                      setSavingField(false);
                    }}
                    disabled={savingField}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" /> {savingField ? "Gemmer..." : "Gem"}
                  </button>
                  <button onClick={() => { setTitleDraft(ms.title); setEditingTitle(false); }} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors">
                    Annuller
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setTitleDraft(ms.title); setEditingTitle(true); }}>
                <span className="flex-1">{ms.title}</span>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Editable category */}
            <Select value={categoryDraft} onValueChange={async (v) => {
              const val = v as MilestoneCategory;
              setCategoryDraft(val);
              setSavingField(true);
              await onUpdateField(ms.id, { category: val });
              setSavingField(false);
            }}>
              <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:ml-1 [&>svg]:h-3 [&>svg]:w-3">
                <CategoryBadge category={categoryDraft} />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ms.source === "ai" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-2.5 w-2.5" /> AI
              </span>
            )}
            {ms.source === "handout" && (
              ms.source_report ? (
                <Link
                  to={`/handouts?module=${ms.source_report}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                >
                  <BookOpen className="h-2.5 w-2.5" /> Fra handout
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <BookOpen className="h-2.5 w-2.5" /> Fra handout
                </span>
              )
            )}
            {/* Editable deadline */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1 hover:bg-muted">
                  <CalendarIcon className="h-3 w-3" />
                  {detailDeadline ? format(detailDeadline, "d. MMM yyyy", { locale: da }) : "Sæt deadline"}
                  <Pencil className="h-2.5 w-2.5 ml-1 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={detailDeadline}
                  onSelect={async (d) => {
                    setDetailDeadline(d || undefined);
                    setSavingField(true);
                    await onUpdateField(ms.id, { deadline: d || null });
                    setSavingField(false);
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            {ms.target_value && ms.unit ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Fremgang</span>
                  <span className={`text-sm font-semibold ${farve}`}>
                    {ms.current_value ?? 0} / {ms.target_value} {ms.unit}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 mb-3">
                  <div className={`h-2 rounded-full transition-all ${bar}`} style={{ width: `${ms.progress}%` }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">Nuværende:</span>
                  <input
                    type="number"
                    min={0}
                    max={ms.target_value * 2}
                    step={ms.target_value >= 100 ? 10 : 1}
                    defaultValue={ms.current_value ?? 0}
                    onBlur={async (e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val) && val !== ms.current_value) await onUpdateCurrentValue(ms.id, val);
                    }}
                    className="w-24 px-2 py-1 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <span className="text-xs text-muted-foreground">{ms.unit}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground shrink-0">Mål:</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={ms.target_value ?? 0}
                    onBlur={async (e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val) && val > 0 && val !== ms.target_value) await onUpdateField(ms.id, { target_value: val });
                    }}
                    className="w-24 px-2 py-1 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <input
                    type="text"
                    defaultValue={ms.unit ?? ""}
                    placeholder="enhed"
                    onBlur={async (e) => {
                      const val = e.target.value.trim();
                      if (val !== ms.unit) await onUpdateField(ms.id, { unit: val });
                    }}
                    className="w-24 px-2 py-1 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Fremgang</span>
                  <span className={`text-sm font-semibold ${farve}`}>{ms.progress}%</span>
                </div>
                <input
                  type="range" min={0} max={100}
                  value={ms.progress}
                  onChange={(e) => onQuickProgress(ms.id, Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none bg-muted cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>Ikke startet</span><span>I gang</span><span>Færdig</span>
                </div>
              </>
            )}
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Udgangspunkt / baseline</p>
            <input
              defaultValue={ms.baseline || ""}
              placeholder="F.eks. 800.000 kr. i omsætning"
              onBlur={async (e) => {
                const val = e.target.value.trim();
                if (val !== (ms.baseline || "")) await onUpdateField(ms.id, { baseline: val });
              }}
              className="w-full text-sm text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5"
            />
          </div>
          {/* Editable description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Beskrivelse</p>
              {!editingDescription && (
                <button
                  onClick={() => { setDescDraft(ms.description || ""); setEditingDescription(true); }}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-2.5 w-2.5" /> Rediger
                </button>
              )}
            </div>
            {editingDescription ? (
              <div className="space-y-2">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  placeholder="Tilføj beskrivelse..."
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setSavingField(true);
                      await onUpdateField(ms.id, { description: descDraft.trim() });
                      setEditingDescription(false);
                      setSavingField(false);
                    }}
                    disabled={savingField}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" /> {savingField ? "Gemmer..." : "Gem"}
                  </button>
                  <button
                    onClick={() => setEditingDescription(false)}
                    className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                  >
                    Annuller
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {ms.description || <span className="text-muted-foreground italic">Ingen beskrivelse endnu</span>}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
