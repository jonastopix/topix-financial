import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import confetti from "canvas-confetti";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { CheckCircle2, Circle, Clock, Sparkles, BookOpen, Pencil, Check, X, Trash2, CalendarIcon, Archive } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { postActivityMessage } from "@/lib/chatActivity";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { MILESTONE_CATEGORIES, CATEGORY_OPTIONS, type MilestoneCategory } from "@/lib/milestoneCategories";

export interface Milestone {
  id: string;
  title: string;
  deadline: Date | null;
  status: "done" | "in-progress" | "pending" | "parked";
  description: string | null;
  source: string;
  source_report: string | null;
  progress: number;
  category: MilestoneCategory;
  baseline: string | null;
  dbStatus?: string;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
}

const statusConfig = {
  done: { icon: CheckCircle2, className: "text-primary", bg: "bg-primary/10", barColor: "bg-primary" },
  "in-progress": { icon: Clock, className: "text-chart-warning", bg: "bg-chart-warning/10", barColor: "bg-chart-warning" },
  pending: { icon: Circle, className: "text-muted-foreground", bg: "bg-muted", barColor: "bg-muted-foreground/30" },
  parked: { icon: Archive, className: "text-muted-foreground/60", bg: "bg-muted/50", barColor: "bg-muted-foreground/20" },
};

function deriveStatus(progress: number, currentStatus?: string): "done" | "in-progress" | "pending" | "parked" {
  if (currentStatus === "parked") return "parked";
  if (progress >= 100) return "done";
  if (progress > 0) return "in-progress";
  return "pending";
}

function formatDeadline(d: Date | null) {
  if (!d) return "Ingen deadline";
  return format(d, "d. MMM yyyy", { locale: da });
}

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

interface Props {
  userId?: string | null;
  companyId?: string | null;
  conversationId?: string | null;
  refreshKey?: number;
  categoryFilter?: MilestoneCategory;
}

const ClickableProgressBar = ({
  progress, barColor, onProgressChange,
}: {
  progress: number;
  barColor: string;
  onProgressChange: (p: number) => void;
}) => {
  const barRef = useRef<HTMLDivElement>(null);

  const calcProgress = (clientX: number) => {
    if (!barRef.current) return progress;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.round(((clientX - rect.left) / rect.width) * 100);
    return Math.min(100, Math.max(0, Math.round(pct / 5) * 5));
  };

  const handleClick = (e: React.MouseEvent) => {
    onProgressChange(calcProgress(e.clientX));
  };

  return (
    <div
      ref={barRef}
      onClick={handleClick}
      className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden relative cursor-pointer group"
      title="Klik for at ændre fremgang"
    >
      <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${progress}%` }} />
      <div className="absolute inset-0 rounded-full ring-1 ring-transparent group-hover:ring-primary/20 transition-all" />
    </div>
  );
};

const MilestoneCard = ({
  ms, config,
  onDelete, onQuickProgress, onToggleComplete,
  onUpdateField, onUpdateCurrentValue,
}: {
  ms: Milestone;
  config: (typeof statusConfig)["done"];
  onDelete: () => void;
  onQuickProgress: (p: number) => void;
  onToggleComplete: () => void;
  onUpdateField: (id: string, fields: Record<string, any>) => Promise<void>;
  onUpdateCurrentValue: (id: string, newValue: number) => Promise<void>;
}) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(ms.title);
  const [categoryDraft, setCategoryDraft] = useState<MilestoneCategory>(ms.category);
  const [descDraft, setDescDraft] = useState(ms.description || "");
  const [detailDeadline, setDetailDeadline] = useState<Date | undefined>(ms.deadline || undefined);
  const [savingField, setSavingField] = useState(false);
  const prevStatusRef = useRef(ms.status);
  const Icon = config.icon;

  useEffect(() => {
    if (prevStatusRef.current !== "done" && ms.status === "done") {
      setJustCompleted(true);
      const t = setTimeout(() => setJustCompleted(false), 700);
      return () => clearTimeout(t);
    }
    prevStatusRef.current = ms.status;
  }, [ms.status]);

  // Sync local state when ms changes from outside
  useEffect(() => { setTitleDraft(ms.title); }, [ms.title]);
  useEffect(() => { setCategoryDraft(ms.category); }, [ms.category]);
  useEffect(() => { setDescDraft(ms.description || ""); }, [ms.description]);
  useEffect(() => { setDetailDeadline(ms.deadline || undefined); }, [ms.deadline]);

  return (
    <>
      <div
        className="group rounded-lg bg-secondary/50 hover:bg-secondary transition-colors overflow-hidden cursor-pointer"
        onClick={() => setDetailOpen(true)}
      >
        <div className="p-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-1.5 rounded-md ${config.bg} cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all`}
              onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
              title={ms.status === "done" ? "Marker som aktiv" : "Marker som færdig"}
            >
              <Icon className={cn("h-4 w-4", config.className, justCompleted && "animate-checkmark-pop")} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium truncate", ms.status === "done" ? "text-muted-foreground line-through" : "text-foreground")}>{ms.title}</p>
              <p className="text-xs text-muted-foreground">{formatDeadline(ms.deadline)}</p>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <CategoryBadge category={ms.category} />
              {ms.target_value && ms.unit && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  🎯 {ms.target_value} {ms.unit}
                </span>
              )}
              {ms.source === "ai" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-2.5 w-2.5" /> AI
                </span>
              )}
              {ms.source === "handout" && (
                ms.source_report ? (
                  <Link
                    to={`/handouts?module=${ms.source_report}`}
                    onClick={e => e.stopPropagation()}
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateField(ms.id, { status: ms.status === "parked" ? "active" : "parked" });
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-muted-foreground/60 hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                title={ms.status === "parked" ? "Genaktivér" : "Parker i køleskab"}
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setDetailOpen(true)} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Rediger">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive" title="Slet">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Slet milestone?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Er du sikker på, at du vil slette denne milestone? Denne handling kan ikke fortrydes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuller</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Slet</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
            {ms.baseline && (
              <div className="mb-1">
                <span className="text-[10px] text-muted-foreground">{ms.baseline}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              {ms.target_value && ms.unit ? (
                <>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${config.barColor}`}
                      style={{ width: `${ms.progress}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-semibold shrink-0 min-w-[40px] text-right ${config.className}`}>
                    {ms.current_value ?? 0}/{ms.target_value} {ms.unit}
                  </span>
                </>
              ) : (
                <>
                  <ClickableProgressBar progress={ms.progress} barColor={config.barColor} onProgressChange={onQuickProgress} />
                  <span className={`text-[10px] font-semibold min-w-[28px] text-right ${config.className}`}>{ms.progress}%</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
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
                  <div className={`p-1.5 rounded-md ${config.bg} flex-shrink-0`}>
                    <Icon className={`h-4 w-4 ${config.className}`} />
                  </div>
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
                    onClick={e => e.stopPropagation()}
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
                    <span className={`text-sm font-semibold ${config.className}`}>
                      {ms.current_value ?? 0} / {ms.target_value} {ms.unit}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 mb-3">
                    <div
                      className={`h-2 rounded-full transition-all ${config.barColor}`}
                      style={{ width: `${ms.progress}%` }}
                    />
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
                        if (!isNaN(val) && val !== ms.current_value) {
                          await onUpdateCurrentValue(ms.id, val);
                        }
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
                        if (!isNaN(val) && val > 0 && val !== ms.target_value) {
                          await onUpdateField(ms.id, { target_value: val });
                        }
                      }}
                      className="w-24 px-2 py-1 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <input
                      type="text"
                      defaultValue={ms.unit ?? ""}
                      placeholder="enhed"
                      onBlur={async (e) => {
                        const val = e.target.value.trim();
                        if (val !== ms.unit) {
                          await onUpdateField(ms.id, { unit: val });
                        }
                      }}
                      className="w-24 px-2 py-1 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Fremgang</span>
                    <span className={`text-sm font-semibold ${config.className}`}>{ms.progress}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100}
                    value={ms.progress}
                    onChange={(e) => onQuickProgress(Number(e.target.value))}
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
                  if (val !== (ms.baseline || "")) {
                    await onUpdateField(ms.id, { baseline: val });
                  }
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
    </>
  );
};

const MilestonesList = ({ userId, companyId, conversationId, refreshKey = 0, categoryFilter }: Props) => {
  const { user, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userId && !companyId) return;
    const fetchMilestones = async () => {
      setLoading(true);
      let query = supabase.from("milestones").select("*").order("created_at", { ascending: false });
      if (companyId) query = query.eq("company_id", companyId);
      else if (userId) query = query.eq("user_id", userId);
      const { data } = await query;

      const mapped: Milestone[] = (data || []).map((m: any) => ({
        id: m.id,
        title: m.title,
        deadline: m.deadline ? new Date(m.deadline) : null,
        dbStatus: m.status as string,
        status: m.status === "parked" ? "parked" as const : deriveStatus(m.progress ?? 0, m.status),
        description: m.description,
        source: m.source,
        source_report: m.source_report,
        progress: m.progress,
        category: (m.category || "other") as MilestoneCategory,
        baseline: m.baseline || null,
        target_value: m.target_value ?? null,
        current_value: m.current_value ?? null,
        unit: m.unit ?? null,
      }));
      setMilestones(mapped);
      setLoading(false);
    };
    fetchMilestones();
  }, [userId, companyId, refreshKey]);

  // ── Milestone deadline reminder notifications ──
  useEffect(() => {
    if (isAdvisor) return;
    if (!milestones || !user || !companyId) return;

    const now = new Date();
    const checkDays = [3, 7];

    for (const ms of milestones) {
      if (!ms.deadline || ms.progress >= 100) continue;

      const deadline = new Date(ms.deadline);
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (checkDays.includes(daysUntil)) {
        supabase.functions.invoke("send-slack-report-notification", {
          body: {
            event: "milestone_deadline_reminder",
            milestoneId: ms.id,
            milestoneTitle: ms.title,
            daysUntil,
            userId: user.id,
            companyId,
          },
        }).catch((err) => console.error("[Milestones] Deadline reminder failed:", err));
      }
    }
  }, [milestones, user, companyId, isAdvisor]);

  const filtered = categoryFilter
    ? milestones.filter((m) => m.category === categoryFilter)
    : milestones;
  const activeMilestones = filtered
    .filter((m) => m.status !== "done" && m.status !== "parked")
    .sort((a, b) => {
      const now = new Date().getTime();
      const URGENT_MS = 7 * 24 * 60 * 60 * 1000;

      const aUrgent = a.deadline && (a.deadline.getTime() - now) <= URGENT_MS && a.deadline.getTime() > now;
      const bUrgent = b.deadline && (b.deadline.getTime() - now) <= URGENT_MS && b.deadline.getTime() > now;

      if (aUrgent && bUrgent) return a.deadline!.getTime() - b.deadline!.getTime();
      if (aUrgent) return -1;
      if (bUrgent) return 1;

      if (a.status === "in-progress" && b.status !== "in-progress") return -1;
      if (b.status === "in-progress" && a.status !== "in-progress") return 1;

      if (a.deadline && !b.deadline) return -1;
      if (!a.deadline && b.deadline) return 1;
      if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();

      return 0;
    });
  const doneMilestones = filtered.filter((m) => m.status === "done");
  const parkedMilestones = filtered.filter((m) => m.status === "parked");

  const quickUpdateProgress = async (id: string, newProgress: number) => {
    const oldMs = milestones.find((m) => m.id === id);
    if (!oldMs) return;
    if (oldMs.dbStatus === "parked") return; // Don't update progress on parked milestones
    const wasNotDone = oldMs.progress < 100;
    const newStatus = deriveStatus(newProgress);

    setMilestones((prev) => prev.map((m) =>
      m.id === id ? { ...m, progress: newProgress, status: newStatus } : m
    ));

    const { error } = await supabase.from("milestones").update({
      progress: newProgress,
      status: newStatus === "done" ? "completed" : "active",
    }).eq("id", id);

    if (error) { toast.error("Kunne ikke opdatere fremgang"); return; }

    if (wasNotDone && newProgress >= 100) {
      if (conversationId && userId) {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
        postActivityMessage({ conversationId, senderId: userId, content: `🎯 Milestone gennemført: **${oldMs.title}**`, contextType: "milestone", contextMeta: { title: oldMs.title } });
      }
      toast.success("Milestone fuldført! 🎉", {
        description: "Godt gået — du er et skridt tættere på dit mål.",
        duration: 5000,
      });

      // Notify advisors (fire and forget)
      if (companyId) {
        supabase.functions.invoke("send-slack-report-notification", {
          body: {
            event: "milestone_completed",
            companyId,
            milestoneTitle: oldMs.title,
          },
        }).catch((err) => console.error("[Milestones] Completion notification failed:", err));
      }
    }
  };

  const updateCurrentValue = async (id: string, newCurrentValue: number) => {
    const ms = milestones.find(m => m.id === id);
    if (!ms || !ms.target_value) return;

    const newProgress = Math.min(100, Math.round((newCurrentValue / ms.target_value) * 100));
    const newStatus = deriveStatus(newProgress);
    const wasNotDone = ms.progress < 100;

    setMilestones(prev => prev.map(m =>
      m.id === id ? { ...m, current_value: newCurrentValue, progress: newProgress, status: newStatus } : m
    ));

    const { error } = await supabase.from("milestones").update({
      current_value: newCurrentValue,
      progress: newProgress,
      status: newStatus === "done" ? "completed" : "active",
    } as any).eq("id", id);

    if (error) { toast.error("Kunne ikke opdatere fremgang"); return; }

    if (wasNotDone && newProgress >= 100) {
      if (conversationId && userId) {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
        postActivityMessage({ conversationId, senderId: userId, content: `🎯 Milestone gennemført: **${ms.title}**`, contextType: "milestone", contextMeta: { title: ms.title } });
      }
      toast.success("Milestone fuldført! 🎉", { description: "Godt gået — du er et skridt tættere på dit mål.", duration: 5000 });

      if (companyId) {
        supabase.functions.invoke("send-slack-report-notification", {
          body: { event: "milestone_completed", companyId, milestoneTitle: ms.title },
        }).catch((err) => console.error("[Milestones] Completion notification failed:", err));
      }
    }
  };

  const toggleComplete = async (id: string) => {
    const ms = milestones.find((m) => m.id === id);
    if (!ms) return;
    const newProgress = ms.progress >= 100 ? 0 : 100;
    await quickUpdateProgress(id, newProgress);
  };

  const deleteMilestone = async (id: string, title: string) => {
    const { error } = await supabase.from("milestones").delete().eq("id", id);
    if (error) { toast.error("Kunne ikke slette milestone"); return; }
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    toast.success(`"${title}" er slettet`);
  };

  const updateField = async (id: string, fields: Record<string, any>) => {
    const dbFields: Record<string, any> = {};
    const localFields: Record<string, any> = {};
    for (const key of ["title", "category", "baseline"] as const) {
      if (key in fields) { dbFields[key] = fields[key] || null; localFields[key] = fields[key] || null; }
    }
    if ("target_value" in fields) {
      dbFields.target_value = fields.target_value;
      localFields.target_value = fields.target_value;
    }
    if ("unit" in fields) {
      dbFields.unit = fields.unit || null;
      localFields.unit = fields.unit || null;
    }
    if ("description" in fields) {
      dbFields.description = fields.description || null;
      localFields.description = fields.description || null;
    }
    if ("deadline" in fields) {
      dbFields.deadline = fields.deadline ? (fields.deadline as Date).toISOString().split("T")[0] : null;
      localFields.deadline = fields.deadline || null;
    }
    if ("status" in fields) {
      dbFields.status = fields.status;
      localFields.status = fields.status === "parked" ? "parked" : deriveStatus(
        milestones.find(m => m.id === id)?.progress ?? 0, fields.status
      );
      localFields.dbStatus = fields.status;
    }
    const { error } = await supabase.from("milestones").update(dbFields).eq("id", id);
    if (error) { toast.error("Kunne ikke gemme"); return; }
    setMilestones((prev) => prev.map((m) => m.id === id ? { ...m, ...localFields } : m));
    toast.success("Gemt");
  };

  const totalProgress = milestones.length > 0 ? Math.round(milestones.reduce((sum, m) => sum + m.progress, 0) / milestones.length) : 0;

  const renderList = (items: Milestone[]) =>
    items.map((ms) => {
      const config = statusConfig[ms.status];
      return (
        <MilestoneCard
          key={ms.id} ms={ms} config={config}
          onDelete={() => deleteMilestone(ms.id, ms.title)}
          onQuickProgress={(p) => quickUpdateProgress(ms.id, p)}
          onToggleComplete={() => toggleComplete(ms.id)}
          onUpdateField={updateField}
          onUpdateCurrentValue={updateCurrentValue}
        />
      );
    });

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-8 text-center">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-xl p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-foreground">Aktive milestones</h3>
          <span className="text-xs text-muted-foreground">Samlet: {totalProgress}%</span>
        </div>
        <div className="space-y-3">
          {activeMilestones.length > 0 ? renderList(activeMilestones) : (
            <p className="text-sm text-muted-foreground text-center py-4">Ingen aktive milestones</p>
          )}
        </div>
      </div>

      {doneMilestones.length > 0 && (
        <div className="glass-card rounded-xl p-5 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h3 className="font-display font-semibold text-foreground">Gennemført</h3>
            <span className="text-xs text-muted-foreground ml-auto">{doneMilestones.length} milestone{doneMilestones.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-3">{renderList(doneMilestones)}</div>
        </div>
      )}

      {parkedMilestones.length > 0 && (
        <div className="glass-card rounded-xl p-5 animate-fade-in mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Archive className="h-3.5 w-3.5 text-muted-foreground/60" />
            <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
              Køleskab · {parkedMilestones.length}
            </p>
          </div>
          <div className="space-y-2 opacity-60">
            {renderList(parkedMilestones)}
          </div>
        </div>
      )}
    </div>
  );
};

export default MilestonesList;
