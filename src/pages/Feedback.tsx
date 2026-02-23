import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Sparkles,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowRight,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";

interface ProgressItem {
  id: string;
  recommendation: string;
  fromReport: string;
  reportMonth: string; // for grouping
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
    reportMonth: "Januar 2026",
    severity: "advarsel",
    status: "improved",
    aiComment: "Marketing-spend faldt 8% mens omsætningen steg 17% – ROAS er forbedret markant. Godt arbejde.",
    metric: { label: "ROAS", before: "2,1x", after: "3,4x", improved: true },
  },
  {
    id: "p2",
    recommendation: "Budgettér lønstigning på ~15% pga. nye ansættelser. Runway påvirkes.",
    fromReport: "Januar 2026",
    reportMonth: "Januar 2026",
    severity: "kritisk",
    status: "pending",
    aiComment: "Lønningerne er endnu ikke opdateret i budgettet. Runway-estimatet kan være for optimistisk. Handling anbefales.",
  },
  {
    id: "p3",
    recommendation: "Monitor churn rate de næste 2-3 måneder efter ny pricing model",
    fromReport: "Januar 2026",
    reportMonth: "Januar 2026",
    severity: "positiv",
    status: "improved",
    aiComment: "Churn er faldet fra 3,0% til 2,8% efter pricing-ændringen. Positiv trend fortsætter.",
    metric: { label: "Churn", before: "3,0%", after: "2,8%", improved: true },
  },
  {
    id: "p4",
    recommendation: "Undersøg hvad der driver stigningen i administrative omkostninger (+18%)",
    fromReport: "December 2025",
    reportMonth: "December 2025",
    severity: "advarsel",
    status: "regressed",
    aiComment: "Admin-omkostninger steg yderligere 5% i januar. Fortsat uafklaret – kræver opmærksomhed.",
    metric: { label: "Admin", before: "23,1k", after: "24,5k", improved: false },
  },
  {
    id: "p5",
    recommendation: "Dokumentér og skaler salgsprocessen med enterprise-fokus",
    fromReport: "November 2025",
    reportMonth: "November 2025",
    severity: "positiv",
    status: "actioned",
    aiComment: "Sales playbook er implementeret. Enterprise pipeline vokser – 3 nye leads i februar.",
  },
  {
    id: "p6",
    recommendation: "Formalisér organisationsstruktur og knyt hiring til revenue-mål",
    fromReport: "November 2025",
    reportMonth: "November 2025",
    severity: "advarsel",
    status: "actioned",
    aiComment: "Hiring plan er lavet med revenue-triggers. Næste ansættelse ved 130k MRR.",
  },
];

const statusConfig = {
  actioned: { icon: CheckCircle2, label: "Handlet på", color: "text-primary", bg: "bg-primary/10", border: "border-l-primary" },
  improved: { icon: TrendingUp, label: "Forbedret", color: "text-primary", bg: "bg-primary/10", border: "border-l-primary" },
  pending: { icon: Clock, label: "Afventer handling", color: "text-chart-warning", bg: "bg-chart-warning/10", border: "border-l-chart-warning" },
  regressed: { icon: TrendingDown, label: "Forværret", color: "text-destructive", bg: "bg-destructive/10", border: "border-l-destructive" },
};

type TabFilter = "all" | "action" | "improved" | "regressed";

const Feedback = () => {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  const actionedCount = progressItems.filter(p => p.status === "actioned" || p.status === "improved").length;
  const pendingCount = progressItems.filter(p => p.status === "pending").length;
  const regressedCount = progressItems.filter(p => p.status === "regressed").length;
  const progressPct = Math.round((actionedCount / progressItems.length) * 100);

  // SVG circle progress
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPct / 100) * circumference;

  // Filter items
  const filteredItems = progressItems.filter((item) => {
    if (activeTab === "all") return true;
    if (activeTab === "action") return item.status === "pending";
    if (activeTab === "improved") return item.status === "improved" || item.status === "actioned";
    if (activeTab === "regressed") return item.status === "regressed";
    return true;
  });

  // Group by month
  const grouped = filteredItems.reduce<Record<string, ProgressItem[]>>((acc, item) => {
    if (!acc[item.reportMonth]) acc[item.reportMonth] = [];
    acc[item.reportMonth].push(item);
    return acc;
  }, {});

  const monthOrder = ["Januar 2026", "December 2025", "November 2025"];
  const sortedMonths = monthOrder.filter((m) => grouped[m]);

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

      {/* ── Scoreboard ── */}
      <div className="glass-card rounded-xl p-6 mb-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Progress ring */}
          <div className="relative flex-shrink-0">
            <svg width="130" height="130" viewBox="0 0 120 120" className="transform -rotate-90">
              <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
              <circle
                cx="60" cy="60" r={radius} fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-display font-bold text-primary">{progressPct}%</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">fremgang</span>
            </div>
          </div>

          {/* Stat boxes */}
          <div className="flex-1 w-full">
            <p className="text-sm text-muted-foreground mb-3">
              Du har handlet på <span className="font-semibold text-foreground">{actionedCount} af {progressItems.length}</span> anbefalinger
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-center">
                <p className="text-xl font-display font-bold text-primary">{actionedCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Forbedret</p>
              </div>
              <div className="p-3 rounded-xl bg-chart-warning/5 border border-chart-warning/20 text-center">
                <p className="text-xl font-display font-bold text-chart-warning">{pendingCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Afventer</p>
              </div>
              <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/20 text-center">
                <p className="text-xl font-display font-bold text-destructive">{regressedCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Forværret</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabFilter)} className="mb-6">
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex">
          <TabsTrigger value="all">Alle ({progressItems.length})</TabsTrigger>
          <TabsTrigger value="action" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Kræver handling ({pendingCount})
          </TabsTrigger>
          <TabsTrigger value="improved">Forbedret ({actionedCount})</TabsTrigger>
          <TabsTrigger value="regressed">Forværret ({regressedCount})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Timeline grouped cards ── */}
      <div className="space-y-8">
        {sortedMonths.map((month) => (
          <div key={month}>
            {/* Month header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="h-2.5 w-2.5 rounded-full bg-primary/60" />
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{month}</h3>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Cards */}
            <div className="space-y-3 ml-1 pl-4 border-l-2 border-border/50">
              {grouped[month].map((item) => {
                const config = statusConfig[item.status];
                const StatusIcon = config.icon;
                const defaultOpen = item.status === "pending" || item.status === "regressed";

                return (
                  <div
                    key={item.id}
                    className={`glass-card rounded-xl border-l-4 ${config.border} overflow-hidden animate-fade-in hover:shadow-md transition-all`}
                  >
                    <div className="p-4">
                      {/* Header row */}
                      <div className="flex items-start gap-3">
                        <div className={`p-1.5 rounded-lg ${config.bg} flex-shrink-0 mt-0.5`}>
                          <StatusIcon className={`h-4 w-4 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-foreground leading-snug">
                              {item.recommendation}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Status pill */}
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                              {config.label}
                            </span>
                            {/* Metric pill */}
                            {item.metric && (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-card border border-border/50">
                                <span className="text-muted-foreground">{item.metric.label}:</span>
                                <span className="text-muted-foreground">{item.metric.before}</span>
                                <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                                <span className={item.metric.improved ? "text-primary font-bold" : "text-destructive font-bold"}>
                                  {item.metric.after}
                                </span>
                              </span>
                            )}
                            {/* Report source */}
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Sparkles className="h-2.5 w-2.5" />
                              {item.fromReport}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Collapsible AI comment */}
                      <Collapsible defaultOpen={defaultOpen}>
                        <CollapsibleTrigger className="flex items-center gap-1.5 mt-3 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors group">
                          <Sparkles className="h-3 w-3 text-primary" />
                          AI Opfølgning
                          <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 p-3 rounded-lg bg-secondary/50 border border-border/30">
                            <p className="text-sm text-foreground leading-relaxed">{item.aiComment}</p>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Ingen anbefalinger matcher dette filter.
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Feedback;
