import { CheckCircle2, Circle, Clock } from "lucide-react";

interface Milestone {
  id: string;
  title: string;
  deadline: string;
  status: "done" | "in-progress" | "pending";
  category: string;
}

const milestones: Milestone[] = [
  { id: "1", title: "Launch beta version", deadline: "15. jan 2026", status: "done", category: "Produkt" },
  { id: "2", title: "Nå 100 betalende kunder", deadline: "1. mar 2026", status: "in-progress", category: "Vækst" },
  { id: "3", title: "Lukke seed-runde (3M DKK)", deadline: "1. apr 2026", status: "in-progress", category: "Funding" },
  { id: "4", title: "Hyre CTO", deadline: "1. maj 2026", status: "pending", category: "Team" },
  { id: "5", title: "Break-even på månedsbasis", deadline: "1. jun 2026", status: "pending", category: "Økonomi" },
];

const statusConfig = {
  done: { icon: CheckCircle2, className: "text-primary", bg: "bg-primary/10" },
  "in-progress": { icon: Clock, className: "text-chart-warning", bg: "bg-chart-warning/10" },
  pending: { icon: Circle, className: "text-muted-foreground", bg: "bg-muted" },
};

const MilestonesList = () => {
  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <h3 className="font-display font-semibold text-foreground mb-4">Milestones</h3>
      <div className="space-y-3">
        {milestones.map((ms) => {
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
              <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                {ms.category}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MilestonesList;
