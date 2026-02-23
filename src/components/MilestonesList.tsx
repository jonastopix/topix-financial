import { CheckCircle2, Circle, Clock, Sparkles } from "lucide-react";

interface Milestone {
  id: string;
  title: string;
  deadline: string;
  status: "done" | "in-progress" | "pending";
  category: string;
  source?: "manual" | "ai";
}

const baseMilestones: Milestone[] = [
  { id: "1", title: "Launch beta version", deadline: "15. jan 2026", status: "done", category: "Produkt", source: "manual" },
  { id: "2", title: "Nå 100 betalende kunder", deadline: "1. mar 2026", status: "in-progress", category: "Vækst", source: "manual" },
  { id: "3", title: "Lukke seed-runde (3M DKK)", deadline: "1. apr 2026", status: "in-progress", category: "Funding", source: "manual" },
  { id: "4", title: "Hyre CTO", deadline: "1. maj 2026", status: "pending", category: "Team", source: "manual" },
  { id: "5", title: "Break-even på månedsbasis", deadline: "1. jun 2026", status: "pending", category: "Økonomi", source: "manual" },
];

const statusConfig = {
  done: { icon: CheckCircle2, className: "text-primary", bg: "bg-primary/10" },
  "in-progress": { icon: Clock, className: "text-chart-warning", bg: "bg-chart-warning/10" },
  pending: { icon: Circle, className: "text-muted-foreground", bg: "bg-muted" },
};

interface Props {
  acceptedFromAi?: { title: string; deadline: string }[];
}

const MilestonesList = ({ acceptedFromAi = [] }: Props) => {
  const aiMilestones: Milestone[] = acceptedFromAi.map((a, i) => ({
    id: `ai-${i}`,
    title: a.title,
    deadline: a.deadline,
    status: "pending" as const,
    category: "AI",
    source: "ai" as const,
  }));

  const allMilestones = [...baseMilestones, ...aiMilestones];

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <h3 className="font-display font-semibold text-foreground mb-4">Milestones</h3>
      <div className="space-y-3">
        {allMilestones.map((ms) => {
          const config = statusConfig[ms.status];
          const Icon = config.icon;
          return (
            <div
              key={ms.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            >
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MilestonesList;
