import { useState, useEffect, useCallback, useRef } from "react";
import confetti from "canvas-confetti";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { CheckCircle2, Circle, Clock, Sparkles, Pencil, Check, X, Trash2, CalendarIcon } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { postActivityMessage } from "@/lib/chatActivity";
import { MILESTONE_CATEGORIES, CATEGORY_OPTIONS, type MilestoneCategory } from "@/lib/milestoneCategories";

export interface Milestone {
  id: string;
  title: string;
  deadline: Date | null;
  status: "done" | "in-progress" | "pending";
  description: string | null;
  source: string;
  source_report: string | null;
  progress: number;
  category: MilestoneCategory;
  baseline: string | null;
}

const statusConfig = {
  done: { icon: CheckCircle2, className: "text-primary", bg: "bg-primary/10", barColor: "bg-primary" },
  "in-progress": { icon: Clock, className: "text-chart-warning", bg: "bg-chart-warning/10", barColor: "bg-chart-warning" },
  pending: { icon: Circle, className: "text-muted-foreground", bg: "bg-muted", barColor: "bg-muted-foreground/30" },
};

function deriveStatus(progress: number): "done" | "in-progress" | "pending" {
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
  ms, config, isEditing,
  editTitle, editDeadline, editProgress, editCategory, editBaseline,
  setEditTitle, setEditDeadline, setEditProgress, setEditCategory, setEditBaseline,
  onStartEdit, onSaveEdit, onCancelEdit, onDelete, onQuickProgress, onToggleComplete,
}: {
  ms: Milestone;
  config: (typeof statusConfig)["done"];
  isEditing: boolean;
  editTitle: string;
  editDeadline: Date | undefined;
  editProgress: number;
  editCategory: MilestoneCategory;
  editBaseline: string;
  setEditTitle: (v: string) => void;
  setEditDeadline: (v: Date | undefined) => void;
  setEditProgress: (v: number) => void;
  setEditCategory: (v: MilestoneCategory) => void;
  setEditBaseline: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onQuickProgress: (p: number) => void;
  onToggleComplete: () => void;
}) => {
  const Icon = config.icon;

  if (isEditing) {
    return (
      <div className="rounded-lg bg-secondary/50 overflow-hidden">
        <div className="p-4 space-y-3">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Select value={editCategory} onValueChange={(v) => setEditCategory(v as MilestoneCategory)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Baseline / udgangspunkt</label>
            <input
              value={editBaseline}
              onChange={(e) => setEditBaseline(e.target.value)}
              placeholder="F.eks. 800.000 kr. i omsætning"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editDeadline && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {editDeadline ? format(editDeadline, "d. MMM yyyy", { locale: da }) : "Vælg deadline"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={editDeadline} onSelect={setEditDeadline} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted-foreground">Fremgang</label>
              <span className="text-xs font-semibold text-foreground">{editProgress}%</span>
            </div>
            <input type="range" min={0} max={100} value={editProgress} onChange={(e) => setEditProgress(Number(e.target.value))} className="w-full h-2 rounded-full appearance-none bg-muted cursor-pointer accent-primary" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Ikke startet</span><span>I gang</span><span>Færdig</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onSaveEdit} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
              <Check className="h-3 w-3" /> Gem
            </button>
            <button onClick={onCancelEdit} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors">
              Annuller
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-secondary/50 hover:bg-secondary transition-colors overflow-hidden">
      <div className="p-3">
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-md ${config.bg} cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all`} onClick={onToggleComplete} title={ms.status === "done" ? "Marker som aktiv" : "Marker som færdig"}>
            <Icon className={`h-4 w-4 ${config.className}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-medium truncate", ms.status === "done" ? "text-muted-foreground line-through" : "text-foreground")}>{ms.title}</p>
            <p className="text-xs text-muted-foreground">{formatDeadline(ms.deadline)}</p>
          </div>
          <div className="flex items-center gap-2">
            <CategoryBadge category={ms.category} />
            {ms.source === "ai" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-2.5 w-2.5" /> AI
              </span>
            )}
            <button onClick={onStartEdit} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Rediger">
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
                  <AlertDialogDescription>Er du sikker på, at du vil slette "{ms.title}"? Denne handling kan ikke fortrydes.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuller</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Slet</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {ms.baseline ? (
          <div className="mt-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">{ms.baseline}</span>
              <span className="text-[10px] font-medium text-foreground">{ms.title}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ClickableProgressBar progress={ms.progress} barColor={config.barColor} onProgressChange={onQuickProgress} />
              <span className={`text-[10px] font-semibold min-w-[28px] text-right ${config.className}`}>{ms.progress}%</span>
            </div>
          </div>
        ) : (
          <div className="mt-2.5 flex items-center gap-2.5">
            <ClickableProgressBar progress={ms.progress} barColor={config.barColor} onProgressChange={onQuickProgress} />
            <span className={`text-[10px] font-semibold min-w-[28px] text-right ${config.className}`}>{ms.progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

const MilestonesList = ({ userId, companyId, conversationId, refreshKey = 0, categoryFilter }: Props) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDeadline, setEditDeadline] = useState<Date | undefined>(undefined);
  const [editProgress, setEditProgress] = useState(0);
  const [editCategory, setEditCategory] = useState<MilestoneCategory>("other");
  const [editBaseline, setEditBaseline] = useState("");
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
        status: deriveStatus(m.progress),
        description: m.description,
        source: m.source,
        source_report: m.source_report,
        progress: m.progress,
        category: (m.category || "other") as MilestoneCategory,
        baseline: m.baseline || null,
      }));
      setMilestones(mapped);
      setLoading(false);
    };
    fetchMilestones();
  }, [userId, companyId, refreshKey]);

  const filtered = categoryFilter
    ? milestones.filter((m) => m.category === categoryFilter)
    : milestones;
  const activeMilestones = filtered.filter((m) => m.status !== "done");
  const doneMilestones = filtered.filter((m) => m.status === "done");

  const startEdit = (ms: Milestone) => {
    setEditingId(ms.id);
    setEditTitle(ms.title);
    setEditDeadline(ms.deadline || undefined);
    setEditProgress(ms.progress);
    setEditCategory(ms.category);
    setEditBaseline(ms.baseline || "");
  };

  const saveEdit = async (id: string) => {
    const progress = Math.min(100, Math.max(0, editProgress));
    const oldMs = milestones.find((m) => m.id === id);
    const wasNotDone = oldMs && oldMs.progress < 100;
    const newStatus = deriveStatus(progress);

    const { error } = await supabase.from("milestones").update({
      title: editTitle,
      deadline: editDeadline ? editDeadline.toISOString().split("T")[0] : null,
      progress,
      category: editCategory,
      baseline: editBaseline.trim() || null,
      status: newStatus === "done" ? "completed" : "active",
    }).eq("id", id);

    if (error) { toast.error("Kunne ikke gemme ændringer"); return; }

    setMilestones((prev) => prev.map((m) =>
      m.id === id ? { ...m, title: editTitle, deadline: editDeadline || null, progress, status: newStatus, category: editCategory, baseline: editBaseline.trim() || null } : m
    ));
    setEditingId(null);
    toast.success("Milestone opdateret");

    if (wasNotDone && progress >= 100 && conversationId && userId) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      postActivityMessage({ conversationId, senderId: userId, content: `🎯 Milestone gennemført: **${editTitle}**`, contextType: "milestone", contextMeta: { title: editTitle } });
    }
  };

  const cancelEdit = () => setEditingId(null);

  const quickUpdateProgress = async (id: string, newProgress: number) => {
    const oldMs = milestones.find((m) => m.id === id);
    if (!oldMs) return;
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

    if (wasNotDone && newProgress >= 100 && conversationId && userId) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      toast.success(`🎯 "${oldMs.title}" er gennemført!`);
      postActivityMessage({ conversationId, senderId: userId, content: `🎯 Milestone gennemført: **${oldMs.title}**`, contextType: "milestone", contextMeta: { title: oldMs.title } });
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

  const totalProgress = milestones.length > 0 ? Math.round(milestones.reduce((sum, m) => sum + m.progress, 0) / milestones.length) : 0;

  const renderList = (items: Milestone[]) =>
    items.map((ms) => {
      const config = statusConfig[ms.status];
      return (
        <MilestoneCard
          key={ms.id} ms={ms} config={config}
          isEditing={editingId === ms.id}
          editTitle={editTitle} editDeadline={editDeadline} editProgress={editProgress} editCategory={editCategory} editBaseline={editBaseline}
          setEditTitle={setEditTitle} setEditDeadline={setEditDeadline} setEditProgress={setEditProgress} setEditCategory={setEditCategory} setEditBaseline={setEditBaseline}
          onStartEdit={() => startEdit(ms)} onSaveEdit={() => saveEdit(ms.id)} onCancelEdit={cancelEdit}
          onDelete={() => deleteMilestone(ms.id, ms.title)}
          onQuickProgress={(p) => quickUpdateProgress(ms.id, p)}
          onToggleComplete={() => toggleComplete(ms.id)}
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
    </div>
  );
};

export default MilestonesList;
