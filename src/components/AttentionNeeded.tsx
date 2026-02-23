import {
  AlertTriangle,
  Clock,
  MessageSquare,
  FileText,
  Target,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

interface AttentionItem {
  id: string;
  type: "report" | "feedback" | "milestone" | "advisor";
  title: string;
  description: string;
  urgency: "high" | "medium" | "low";
  action: string;
  link: string;
  daysLeft?: number;
}

const attentionItems: AttentionItem[] = [
  {
    id: "1",
    type: "report",
    title: "Februar-rapport mangler",
    description: "Upload din saldobalance og resultatopgørelse for februar 2026",
    urgency: "high",
    action: "Upload nu",
    link: "/reports",
    daysLeft: 5,
  },
  {
    id: "2",
    type: "feedback",
    title: "2 AI-anbefalinger afventer handling",
    description: "Budget-opdatering og admin-omkostninger kræver din opmærksomhed",
    urgency: "high",
    action: "Se anbefalinger",
    link: "/feedback",
  },
  {
    id: "3",
    type: "advisor",
    title: "Ubesvaret kommentar fra Jonas K.",
    description: "\"Hvem ejer salgsfunktionen pt?\" – januar-rapport",
    urgency: "medium",
    action: "Svar",
    link: "/reports",
  },
  {
    id: "4",
    type: "milestone",
    title: "Milestone deadline nærmer sig",
    description: "\"Nå 100 betalende kunder\" – deadline 1. mar 2026",
    urgency: "medium",
    action: "Se status",
    link: "/milestones",
    daysLeft: 6,
  },
];

const typeConfig = {
  report: { icon: FileText, color: "text-destructive", bg: "bg-destructive/10" },
  feedback: { icon: Sparkles, color: "text-chart-warning", bg: "bg-chart-warning/10" },
  advisor: { icon: MessageSquare, color: "text-chart-info", bg: "bg-chart-info/10" },
  milestone: { icon: Target, color: "text-chart-warning", bg: "bg-chart-warning/10" },
};

const urgencyBorder = {
  high: "border-l-destructive",
  medium: "border-l-chart-warning",
  low: "border-l-muted",
};

const AttentionNeeded = () => {
  if (attentionItems.length === 0) return null;

  const highCount = attentionItems.filter((i) => i.urgency === "high").length;

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-chart-warning" />
          <h3 className="font-display font-semibold text-foreground">Kræver opmærksomhed</h3>
        </div>
        {highCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive uppercase tracking-wider">
            {highCount} kritisk
          </span>
        )}
      </div>
      <div className="space-y-2">
        {attentionItems.map((item) => {
          const config = typeConfig[item.type];
          const Icon = config.icon;
          return (
            <Link
              key={item.id}
              to={item.link}
              className={`flex items-start gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors border-l-[3px] ${urgencyBorder[item.urgency]} group`}
            >
              <div className={`p-1.5 rounded-md ${config.bg} flex-shrink-0 mt-0.5`}>
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  {item.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.daysLeft !== undefined && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {item.daysLeft}d
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default AttentionNeeded;
