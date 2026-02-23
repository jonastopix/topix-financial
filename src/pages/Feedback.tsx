import AppLayout from "@/components/AppLayout";
import {
  Sparkles,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  Activity,
  ArrowRight,
} from "lucide-react";

interface ProgressItem {
  id: string;
  recommendation: string;
  fromReport: string;
  severity: "positiv" | "advarsel" | "kritisk";
  status: "actioned" | "improved" | "pending" | "regressed";
  aiComment: string;
  metric?: { label: string; before: string; after: string; improved: boolean };
}

const progressItems: ProgressItem[] = [
  {
    id: "p1",
    recommendation: "Analyser ROAS pr. kanal og alloker budget til de bedst performende",
    fromReport: "Januar 2026",
    severity: "advarsel",
    status: "improved",
    aiComment: "Marketing-spend faldt 8% mens omsætningen steg 17% – ROAS er forbedret markant. Godt arbejde.",
    metric: { label: "ROAS", before: "2,1x", after: "3,4x", improved: true },
  },
  {
    id: "p2",
    recommendation: "Budgettér lønstigning på ~15% pga. nye ansættelser. Runway påvirkes.",
    fromReport: "Januar 2026",
    severity: "kritisk",
    status: "pending",
    aiComment: "Lønningerne er endnu ikke opdateret i budgettet. Runway-estimatet kan være for optimistisk. Handling anbefales.",
  },
  {
    id: "p3",
    recommendation: "Monitor churn rate de næste 2-3 måneder efter ny pricing model",
    fromReport: "Januar 2026",
    severity: "positiv",
    status: "improved",
    aiComment: "Churn er faldet fra 3,0% til 2,8% efter pricing-ændringen. Positiv trend fortsætter.",
    metric: { label: "Churn", before: "3,0%", after: "2,8%", improved: true },
  },
  {
    id: "p4",
    recommendation: "Undersøg hvad der driver stigningen i administrative omkostninger (+18%)",
    fromReport: "December 2025",
    severity: "advarsel",
    status: "regressed",
    aiComment: "Admin-omkostninger steg yderligere 5% i januar. Fortsat uafklaret – kræver opmærksomhed.",
    metric: { label: "Admin", before: "23,1k", after: "24,5k", improved: false },
  },
  {
    id: "p5",
    recommendation: "Dokumentér og skaler salgsprocessen med enterprise-fokus",
    fromReport: "November 2025",
    severity: "positiv",
    status: "actioned",
    aiComment: "Sales playbook er implementeret. Enterprise pipeline vokser – 3 nye leads i februar.",
  },
  {
    id: "p6",
    recommendation: "Formalisér organisationsstruktur og knyt hiring til revenue-mål",
    fromReport: "November 2025",
    severity: "advarsel",
    status: "actioned",
    aiComment: "Hiring plan er lavet med revenue-triggers. Næste ansættelse ved 130k MRR.",
  },
];

const statusConfig = {
  actioned: { icon: CheckCircle2, label: "Handlet på", color: "text-primary", bg: "bg-primary/10" },
  improved: { icon: TrendingUp, label: "Forbedret", color: "text-primary", bg: "bg-primary/10" },
  pending: { icon: Clock, label: "Afventer", color: "text-chart-warning", bg: "bg-chart-warning/10" },
  regressed: { icon: TrendingDown, label: "Forværret", color: "text-destructive", bg: "bg-destructive/10" },
};

const severityConfig = {
  positiv: { color: "text-primary", bg: "bg-primary/10" },
  advarsel: { color: "text-chart-warning", bg: "bg-chart-warning/10" },
  kritisk: { color: "text-destructive", bg: "bg-destructive/10" },
};

const Feedback = () => {
  const actionedCount = progressItems.filter(p => p.status === "actioned" || p.status === "improved").length;
  const pendingCount = progressItems.filter(p => p.status === "pending").length;
  const regressedCount = progressItems.filter(p => p.status === "regressed").length;
  const progressPct = Math.round((actionedCount / progressItems.length) * 100);

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          AI Progress Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Følg op på AI-anbefalinger og se om du rykker dig
        </p>
      </div>

      {/* Progress overview */}
      <div className="glass-card rounded-xl p-6 mb-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-foreground">Samlet fremgang</h3>
            <p className="text-xs text-muted-foreground">
              {actionedCount} af {progressItems.length} anbefalinger handlet på eller forbedret
            </p>
          </div>
          <span className={`text-2xl font-display font-bold ${progressPct >= 60 ? "text-primary" : "text-chart-warning"}`}>
            {progressPct}%
          </span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-center">
            <p className="text-lg font-display font-bold text-primary">{actionedCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Forbedret</p>
          </div>
          <div className="p-3 rounded-lg bg-chart-warning/5 border border-chart-warning/10 text-center">
            <p className="text-lg font-display font-bold text-chart-warning">{pendingCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Afventer</p>
          </div>
          <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 text-center">
            <p className="text-lg font-display font-bold text-destructive">{regressedCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Forværret</p>
          </div>
        </div>
      </div>

      {/* Progress items */}
      <div className="space-y-4">
        {progressItems.map((item) => {
          const status = statusConfig[item.status];
          const StatusIcon = status.icon;
          const sevConfig = severityConfig[item.severity];

          return (
            <div key={item.id} className="glass-card rounded-xl p-5 animate-fade-in hover:border-primary/20 transition-all">
              <div className="flex items-start gap-4">
                {/* Status indicator */}
                <div className={`p-2 rounded-xl ${status.bg} flex-shrink-0 mt-0.5`}>
                  <StatusIcon className={`h-4 w-4 ${status.color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Original recommendation */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-medium text-foreground leading-relaxed">
                      {item.recommendation}
                    </p>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${status.bg} ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  {/* Source report */}
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mb-3">
                    <Sparkles className="h-3 w-3" />
                    Fra rapport: {item.fromReport}
                  </span>

                  {/* AI progress comment */}
                  <div className="mt-2 p-3 rounded-lg bg-secondary/50 border border-border/30">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-muted-foreground mb-1">AI Opfølgning</p>
                        <p className="text-sm text-foreground leading-relaxed">{item.aiComment}</p>
                      </div>
                    </div>
                  </div>

                  {/* Metric change if available */}
                  {item.metric && (
                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/30">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.metric.label}</span>
                      <span className="text-xs font-display font-medium text-muted-foreground">{item.metric.before}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className={`text-xs font-display font-bold ${item.metric.improved ? "text-primary" : "text-destructive"}`}>
                        {item.metric.after}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
};

export default Feedback;
