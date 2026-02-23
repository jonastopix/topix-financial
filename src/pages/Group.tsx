import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import {
  Users,
  UserPlus,
  MessageSquare,
  FileText,
  Calendar,
  Clock,
  Star,
  TrendingUp,
  ChevronRight,
  Sparkles,
  Video,
  CheckCircle2,
} from "lucide-react";

interface Advisor {
  name: string;
  role: string;
  initials: string;
  expertise: string[];
  commentCount: number;
  reportsReviewed: number;
  lastActive: string;
  activeSince: string;
  rating: number;
  recentActivity: ActivityItem[];
}

interface ActivityItem {
  type: "comment" | "review" | "milestone" | "meeting";
  description: string;
  date: string;
  reportMonth?: string;
}

const advisors: Advisor[] = [
  {
    name: "Morten H.",
    role: "Lead Advisor",
    initials: "MH",
    expertise: ["Go-to-Market", "Fundraising", "SaaS Metrics"],
    commentCount: 24,
    reportsReviewed: 8,
    lastActive: "I dag",
    activeSince: "Sep 2025",
    rating: 5,
    recentActivity: [
      { type: "comment", description: "Kommenterede på januar-rapporten om marketing ROI", date: "30. jan 2026", reportMonth: "Januar 2026" },
      { type: "comment", description: "Gav feedback på V2.0 launch-strategi", date: "2. jan 2026", reportMonth: "December 2025" },
      { type: "meeting", description: "1:1 advisory session – pricing strategy", date: "22. jan 2026" },
    ],
  },
  {
    name: "Jonas K.",
    role: "Advisor",
    initials: "JK",
    expertise: ["Salg", "Enterprise", "Organisationsdesign"],
    commentCount: 16,
    reportsReviewed: 6,
    lastActive: "2 dage siden",
    activeSince: "Okt 2025",
    rating: 4,
    recentActivity: [
      { type: "comment", description: "Spørgsmål til salgsproces-dokumentation", date: "29. jan 2026", reportMonth: "Januar 2026" },
      { type: "review", description: "Gennemgik budget-scenarie for Q1", date: "15. jan 2026" },
    ],
  },
  {
    name: "Marie K.",
    role: "Board Member",
    initials: "MK",
    expertise: ["Compliance", "Governance", "Finans"],
    commentCount: 9,
    reportsReviewed: 4,
    lastActive: "5 dage siden",
    activeSince: "Nov 2025",
    rating: 4,
    recentActivity: [
      { type: "review", description: "Gennemgik årsregnskab-forberedelse", date: "20. jan 2026" },
    ],
  },
  {
    name: "Thomas R.",
    role: "Investor",
    initials: "TR",
    expertise: ["Investor Relations", "Vækststrategi", "Unit Economics"],
    commentCount: 7,
    reportsReviewed: 5,
    lastActive: "1 uge siden",
    activeSince: "Dec 2025",
    rating: 4,
    recentActivity: [
      { type: "comment", description: "Feedback på runway-beregning og burn rate", date: "25. jan 2026", reportMonth: "Januar 2026" },
    ],
  },
];

const upcomingMeeting = {
  title: "Advisory Board Meeting – Q1 Review",
  date: "5. mar 2026",
  time: "14:00 – 15:30",
  attendees: ["Morten H.", "Jonas K.", "Marie K.", "Thomas R."],
  agenda: ["Q1 financial review", "Pipeline gennemgang", "Hiring plan diskussion"],
};

const activityTypeConfig = {
  comment: { icon: MessageSquare, color: "text-chart-info", bg: "bg-chart-info/10" },
  review: { icon: FileText, color: "text-primary", bg: "bg-primary/10" },
  milestone: { icon: CheckCircle2, color: "text-chart-warning", bg: "bg-chart-warning/10" },
  meeting: { icon: Video, color: "text-accent", bg: "bg-accent/10" },
};

const roleColors: Record<string, string> = {
  "Lead Advisor": "bg-primary/10 text-primary",
  "Advisor": "bg-chart-info/10 text-chart-info",
  "Board Member": "bg-chart-warning/10 text-chart-warning",
  "Investor": "bg-accent/10 text-accent",
};

const Group = () => {
  const [selectedAdvisor, setSelectedAdvisor] = useState<string | null>(null);
  const totalComments = advisors.reduce((s, a) => s + a.commentCount, 0);
  const totalReviews = advisors.reduce((s, a) => s + a.reportsReviewed, 0);

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Advisory Board
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dit advisory board, aktivitet og kommende møder
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors self-start">
          <UserPlus className="h-4 w-4" />
          Invitér advisor
        </button>
      </div>

      {/* Board stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="glass-card rounded-xl p-4 text-center animate-fade-in">
          <p className="text-2xl font-display font-bold text-foreground">{advisors.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Advisors</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center animate-fade-in">
          <p className="text-2xl font-display font-bold text-primary">{totalComments}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Kommentarer</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center animate-fade-in">
          <p className="text-2xl font-display font-bold text-foreground">{totalReviews}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Reviews</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center animate-fade-in">
          <p className="text-2xl font-display font-bold text-chart-warning">4,3</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Gns. rating</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Advisors column */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-display font-semibold text-foreground text-lg">Advisors</h2>

          {advisors.map((advisor) => {
            const isExpanded = selectedAdvisor === advisor.name;
            return (
              <div
                key={advisor.name}
                className={`glass-card rounded-xl animate-fade-in transition-all ${
                  isExpanded ? "border-primary/30" : "hover:border-primary/20"
                }`}
              >
                <button
                  onClick={() => setSelectedAdvisor(isExpanded ? null : advisor.name)}
                  className="w-full p-5 text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-foreground">{advisor.initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{advisor.name}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${roleColors[advisor.role] || "bg-muted text-muted-foreground"}`}>
                          {advisor.role}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {advisor.expertise.map((e) => (
                          <span key={e} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right hidden sm:block">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          {advisor.commentCount}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <FileText className="h-3 w-3" />
                          {advisor.reportsReviewed} reviews
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-border/50 pt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <MiniStat icon={MessageSquare} label="Kommentarer" value={String(advisor.commentCount)} />
                      <MiniStat icon={FileText} label="Reviews" value={String(advisor.reportsReviewed)} />
                      <MiniStat icon={Clock} label="Aktiv siden" value={advisor.activeSince} />
                      <MiniStat icon={Star} label="Rating" value={`${advisor.rating}/5`} />
                    </div>

                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Seneste aktivitet
                    </h4>
                    <div className="space-y-2">
                      {advisor.recentActivity.map((activity, i) => {
                        const config = activityTypeConfig[activity.type];
                        const Icon = config.icon;
                        return (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                            <div className={`p-1.5 rounded-md ${config.bg} flex-shrink-0 mt-0.5`}>
                              <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground">{activity.description}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-muted-foreground">{activity.date}</span>
                                {activity.reportMonth && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    {activity.reportMonth}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Upcoming meeting */}
          <div className="glass-card rounded-xl p-5 animate-fade-in border-l-4 border-l-primary">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-foreground text-sm">Næste møde</h3>
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">{upcomingMeeting.title}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <Clock className="h-3 w-3" />
              {upcomingMeeting.date} · {upcomingMeeting.time}
            </div>
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Agenda</p>
              <div className="space-y-1">
                {upcomingMeeting.agenda.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-foreground">
                    <span className="text-[10px] font-bold text-muted-foreground">{i + 1}.</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex -space-x-2">
              {upcomingMeeting.attendees.map((name) => {
                const initials = name.split(" ").map(w => w[0]).join("");
                return (
                  <div key={name} className="h-7 w-7 rounded-full bg-secondary border-2 border-card flex items-center justify-center">
                    <span className="text-[9px] font-medium text-foreground">{initials}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Contribution leaderboard */}
          <div className="glass-card rounded-xl p-5 animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-foreground text-sm">Top Bidragydere</h3>
            </div>
            <div className="space-y-3">
              {[...advisors]
                .sort((a, b) => b.commentCount - a.commentCount)
                .map((advisor, i) => (
                  <div key={advisor.name} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 text-center ${i === 0 ? "text-chart-warning" : "text-muted-foreground"}`}>
                      {i === 0 ? "🏆" : `${i + 1}.`}
                    </span>
                    <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-medium text-foreground">{advisor.initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{advisor.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-display font-bold text-foreground">{advisor.commentCount}</span>
                      <MessageSquare className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* AI insight */}
          <div className="glass-card rounded-xl p-5 animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-foreground text-sm">AI Indsigt</h3>
            </div>
            <p className="text-sm text-foreground leading-relaxed mb-2">
              Dit advisory board har givet <span className="font-semibold text-primary">{totalComments} kommentarer</span> på tværs af {totalReviews} rapporter. Morten H. er den mest aktive advisor med fokus på go-to-market strategi.
            </p>
            <p className="text-xs text-muted-foreground">
              💡 Overvej at involvere Thomas R. mere i rapporterings-feedback – hans investor-perspektiv kan styrke jeres fundraising-narrativ.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/50 text-center">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
      <p className="text-sm font-display font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

export default Group;
