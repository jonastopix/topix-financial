import { useState } from "react";
import { CheckCircle2, Circle, Clock, Sparkles, Pencil, Check, X } from "lucide-react";

export interface Milestone {
  id: string;
  title: string;
  deadline: string;
  status: "done" | "in-progress" | "pending";
  category: string;
  source?: "manual" | "ai";
  progress: number; // 0-100
}

const baseMilestones: Milestone[] = [
  { id: "1", title: "Launch beta version", deadline: "15. jan 2026", status: "done", category: "Produkt", source: "manual", progress: 100 },
  { id: "2", title: "Nå 100 betalende kunder", deadline: "1. mar 2026", status: "in-progress", category: "Vækst", source: "manual", progress: 62 },
  { id: "3", title: "Lukke seed-runde (3M DKK)", deadline: "1. apr 2026", status: "in-progress", category: "Funding", source: "manual", progress: 35 },
  { id: "4", title: "Hyre CTO", deadline: "1. maj 2026", status: "pending", category: "Team", source: "manual", progress: 10 },
  { id: "5", title: "Break-even på månedsbasis", deadline: "1. jun 2026", status: "pending", category: "Økonomi", source: "manual", progress: 0 },
];

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

interface Props {
  acceptedFromAi?: { title: string; deadline: string }[];
}

const MilestonesList = ({ acceptedFromAi = [] }: Props) => {
  const [milestones, setMilestones] = useState<Milestone[]>(baseMilestones);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editProgress, setEditProgress] = useState(0);

  // Merge AI-accepted milestones (deduplicate by checking if already added)
  const aiMilestones: Milestone[] = acceptedFromAi.map((a, i) => ({
    id: `ai-${i}`,
    title: a.title,
    deadline: a.deadline,
    status: "pending" as const,
    category: "AI",
    source: "ai" as const,
    progress: 0,
  }));

  const allMilestones = [...milestones, ...aiMilestones.filter(
    (ai) => !milestones.some((m) => m.id === ai.id)
  )];

  const startEdit = (ms: Milestone) => {
    setEditingId(ms.id);
    setEditTitle(ms.title);
    setEditDeadline(ms.deadline);
    setEditProgress(ms.progress);
  };

  const saveEdit = (id: string) => {
    const progress = Math.min(100, Math.max(0, editProgress));
    setMilestones((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, title: editTitle, deadline: editDeadline, progress, status: deriveStatus(progress) }
          : m
      )
    );
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  // Overall stats
  const totalProgress = allMilestones.length > 0
    ? Math.round(allMilestones.reduce((sum, m) => sum + m.progress, 0) / allMilestones.length)
    : 0;

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground">Milestones</h3>
        <span className="text-xs text-muted-foreground">Samlet: {totalProgress}%</span>
      </div>
      <div className="space-y-3">
        {allMilestones.map((ms) => {
          const config = statusConfig[ms.status];
          const Icon = config.icon;
          const isEditing = editingId === ms.id;

          return (
            <div
              key={ms.id}
              className="rounded-lg bg-secondary/50 hover:bg-secondary transition-colors overflow-hidden"
            >
              {isEditing ? (
                <div className="p-4 space-y-3">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <input
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Deadline, f.eks. 1. apr 2026"
                  />
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-muted-foreground">Fremgang</label>
                      <span className="text-xs font-semibold text-foreground">{editProgress}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={editProgress}
                      onChange={(e) => setEditProgress(Number(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none bg-muted cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>Ikke startet</span>
                      <span>I gang</span>
                      <span>Færdig</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(ms.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Check className="h-3 w-3" /> Gem
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                    >
                      Annuller
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${config.bg}`}>
                      <Icon className={`h-4 w-4 ${config.className}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{ms.title}</p>
                      <p className="text-xs text-muted-foreground">{ms.deadline}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {ms.source === "ai" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          <Sparkles className="h-2.5 w-2.5" />
                          AI
                        </span>
                      )}
                      <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                        {ms.category}
                      </span>
                      <button
                        onClick={() => startEdit(ms)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Rediger"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${config.barColor}`}
                        style={{ width: `${ms.progress}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-semibold min-w-[28px] text-right ${config.className}`}>
                      {ms.progress}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MilestonesList;
