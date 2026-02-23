import {
  MessageSquare,
  FileText,
  Target,
  Sparkles,
  TrendingUp,
  Users,
  Bell,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";

interface ActivityEvent {
  id: string;
  type: "comment" | "report" | "milestone" | "ai" | "member" | "kpi";
  actor: string;
  actorInitials: string;
  description: string;
  timestamp: string;
  link?: string;
}

const events: ActivityEvent[] = [
  {
    id: "1",
    type: "comment",
    actor: "Morten H.",
    actorInitials: "MH",
    description: "kommenterede på januar-rapporten",
    timestamp: "30. jan · 14:22",
    link: "/reports",
  },
  {
    id: "2",
    type: "ai",
    actor: "AI Analyse",
    actorInitials: "AI",
    description: "genererede ny analyse for januar 2026",
    timestamp: "28. jan · 09:15",
    link: "/reports",
  },
  {
    id: "3",
    type: "comment",
    actor: "Jonas K.",
    actorInitials: "JK",
    description: "spurgte om salgsproces-dokumentation",
    timestamp: "29. jan · 11:45",
    link: "/reports",
  },
  {
    id: "4",
    type: "kpi",
    actor: "System",
    actorInitials: "📊",
    description: "MRR nåede 115.000 DKK – ny rekord!",
    timestamp: "25. feb · 08:00",
    link: "/kpis",
  },
  {
    id: "5",
    type: "milestone",
    actor: "System",
    actorInitials: "🎯",
    description: "87 af 100 kunder nået (87%)",
    timestamp: "22. feb · 10:30",
    link: "/milestones",
  },
  {
    id: "6",
    type: "report",
    actor: "Jonas Doe",
    actorInitials: "JD",
    description: "uploadede saldobalance for januar",
    timestamp: "28. jan · 09:00",
    link: "/reports",
  },
  {
    id: "7",
    type: "member",
    actor: "Thomas R.",
    actorInitials: "TR",
    description: "tilsluttede sig advisory boardet",
    timestamp: "15. dec · 16:00",
    link: "/group",
  },
];

const typeConfig = {
  comment: { icon: MessageSquare, color: "text-chart-info" },
  report: { icon: FileText, color: "text-primary" },
  milestone: { icon: Target, color: "text-chart-warning" },
  ai: { icon: Sparkles, color: "text-primary" },
  member: { icon: Users, color: "text-accent" },
  kpi: { icon: TrendingUp, color: "text-primary" },
};

const ActivityFeed = () => {
  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-foreground">Aktivitet</h3>
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Seneste</span>
      </div>
      <div className="space-y-1">
        {events.slice(0, 6).map((event, i) => {
          const config = typeConfig[event.type];
          const Icon = config.icon;
          const isSystem = event.actor === "System" || event.type === "ai";

          const content = (
            <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors group cursor-pointer">
              <div className="flex-shrink-0 mt-0.5">
                {isSystem ? (
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                  </div>
                ) : (
                  <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center">
                    <span className="text-[9px] font-medium text-foreground">{event.actorInitials}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground leading-relaxed">
                  {!isSystem && <span className="font-semibold">{event.actor} </span>}
                  {event.description}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{event.timestamp}</p>
              </div>
            </div>
          );

          return event.link ? (
            <Link key={event.id} to={event.link}>{content}</Link>
          ) : (
            <div key={event.id}>{content}</div>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityFeed;
