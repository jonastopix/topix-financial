import { Plus, Calendar, CheckCircle2, Clock, Circle, TrendingUp, Target, Users, DollarSign, BarChart3, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEMO_MILESTONES, CATEGORY_LABELS } from "./demoData";
import { toast } from "sonner";

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  finance: { color: "text-primary", bg: "bg-primary/10", icon: DollarSign },
  operations: { color: "text-chart-info", bg: "bg-chart-info/10", icon: BarChart3 },
  team: { color: "text-chart-warning", bg: "bg-chart-warning/10", icon: Users },
};

const EXTRA_MILESTONES = [
  { title: "Lancér selvbetjenings-onboarding", progress: 0, deadline: "30. sep 2026", current: "Ikke startet", target: "Live", category: "operations" },
  { title: "Nå 500.000 kr. MRR", progress: 68, deadline: "31. dec 2026", current: "342.000 kr.", target: "500.000 kr.", category: "finance" },
];

const ALL_MILESTONES = [...DEMO_MILESTONES, ...EXTRA_MILESTONES];

function deriveStatus(progress: number): "done" | "in-progress" | "pending" {
  if (progress >= 100) return "done";
  if (progress > 0) return "in-progress";
  return "pending";
}

const STATUS_CONFIG = {
  done: { icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10", bar: "bg-primary", label: "Gennemført" },
  "in-progress": { icon: Clock, color: "text-chart-warning", bg: "bg-chart-warning/10", bar: "bg-chart-warning", label: "I gang" },
  pending: { icon: Circle, color: "text-muted-foreground", bg: "bg-muted", bar: "bg-muted-foreground/30", label: "Ikke startet" },
};

function MilestoneCard({ m }: { m: (typeof ALL_MILESTONES)[0] }) {
  const status = deriveStatus(m.progress);
  const sc = STATUS_CONFIG[status];
  const cc = CATEGORY_CONFIG[m.category] || CATEGORY_CONFIG.operations;
  const StatusIcon = sc.icon;
  const CatIcon = cc.icon;

  return (
    <div className="glass-card rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-lg ${cc.bg} flex items-center justify-center shrink-0`}>
            <CatIcon className={`h-5 w-5 ${cc.color}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{m.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cc.bg} ${cc.color}`}>
                <CatIcon className="h-2.5 w-2.5 inline mr-0.5" />
                {CATEGORY_LABELS[m.category] || m.category}
              </span>
              <span className={`text-[10px] ${sc.color}`}>{sc.label}</span>
            </div>
          </div>
        </div>
        <div className={`text-right`}>
          <p className={`text-lg font-bold ${sc.color}`}>{m.progress}%</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${sc.bar}`} style={{ width: `${m.progress}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{m.current} → {m.target}</span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {m.deadline}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DemoMilestones() {
  const done = ALL_MILESTONES.filter(m => m.progress >= 100).length;
  const avgProgress = Math.round(ALL_MILESTONES.reduce((s, m) => s + m.progress, 0) / ALL_MILESTONES.length);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Milestones</h1>
          <p className="text-sm text-muted-foreground mt-1">{done} af {ALL_MILESTONES.length} gennemført · Gns. fremgang {avgProgress}%</p>
        </div>
        <Button
          onClick={() => toast.info("Opret en konto for at tilføje og tracke dine egne milestones", {
            action: { label: "Opret konto →", onClick: () => window.open("https://theboardroom.dk", "_blank") },
          })}
        >
          <Plus className="h-4 w-4 mr-1" /> Ny milestone
        </Button>
      </div>

      {/* Summary row */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "I gang", count: ALL_MILESTONES.filter(m => m.progress > 0 && m.progress < 100).length, color: "text-chart-warning", bg: "bg-chart-warning/10" },
          { label: "Gennemført", count: done, color: "text-primary", bg: "bg-primary/10" },
          { label: "Ikke startet", count: ALL_MILESTONES.filter(m => m.progress === 0).length, color: "text-muted-foreground", bg: "bg-muted" },
        ].map(s => (
          <div key={s.label} className={`glass-card rounded-xl p-4 text-center ${s.bg}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Milestone cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {ALL_MILESTONES.map((m) => (
          <MilestoneCard key={m.title} m={m} />
        ))}
      </div>
    </div>
  );
}
