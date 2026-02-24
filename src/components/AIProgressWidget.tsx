import { useState, useEffect } from "react";
import { CheckCircle2, Clock, TrendingDown, TrendingUp, Sparkles, Loader2, Activity } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ProgressItem {
  id: string;
  recommendation: string;
  fromReport: string;
  severity: "positiv" | "advarsel" | "kritisk";
  status: "actioned" | "improved" | "pending" | "regressed";
  aiComment: string;
}

const statusConfig = {
  actioned: { icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10" },
  improved: { icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
  pending: { icon: Clock, color: "text-chart-warning", bg: "bg-chart-warning/10" },
  regressed: { icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" },
};

const AIProgressWidget = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogTab, setDialogTab] = useState<"pending" | "improved" | "regressed">("pending");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      const [{ data: reports }, { data: milestones }] = await Promise.all([
        supabase
          .from("financial_reports")
          .select("id, report_period, ai_analysis")
          .eq("user_id", user.id)
          .not("ai_analysis", "is", null)
          .order("uploaded_at", { ascending: false }),
        supabase
          .from("milestones")
          .select("title, progress, status, source_report")
          .eq("user_id", user.id),
      ]);

      const result: ProgressItem[] = [];
      (reports || []).forEach((report) => {
        const analysis = report.ai_analysis as any;
        if (!analysis?.key_findings) return;
        const label = report.report_period || "Ukendt";

        analysis.key_findings.forEach((finding: any, idx: number) => {
          const matched = (milestones || []).find(
            (m) =>
              m.source_report === report.id &&
              (m.title === finding.recommendation?.slice(0, 200) || m.title === finding.title)
          );

          let status: ProgressItem["status"] = "pending";
          if (matched) {
            if (matched.progress >= 100 || matched.status === "completed") status = "actioned";
            else if (matched.progress > 0) status = "improved";
          } else if (finding.severity === "positiv") {
            status = "improved";
          }

          result.push({
            id: `${report.id}-${idx}`,
            recommendation: finding.recommendation || finding.title,
            fromReport: label,
            severity: finding.severity || "advarsel",
            status,
            aiComment: finding.analysis || "",
          });
        });
      });

      setItems(result);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const actionedCount = items.filter((p) => p.status === "actioned" || p.status === "improved").length;
  const pendingCount = items.filter((p) => p.status === "pending").length;
  const regressedCount = items.filter((p) => p.status === "regressed").length;
  const pct = items.length > 0 ? Math.round((actionedCount / items.length) * 100) : 0;

  const r = 32;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  const topPending = items.filter((i) => i.status === "pending" || i.status === "regressed").slice(0, 4);

  const dialogItems =
    dialogTab === "pending"
      ? items.filter((i) => i.status === "pending")
      : dialogTab === "improved"
        ? items.filter((i) => i.status === "actioned" || i.status === "improved")
        : items.filter((i) => i.status === "regressed");

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Progress</h3>
        </div>
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Progress</h3>
        </div>
        <div className="text-center py-4">
          <Sparkles className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Ingen AI-anbefalinger endnu</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">AI Progress</h3>
      </div>

      {/* Ring + stats row */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-shrink-0">
          <svg width="80" height="80" viewBox="0 0 80 80" className="transform -rotate-90">
            <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
            <circle
              cx="40" cy="40" r={r} fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-display font-bold text-primary">{pct}%</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 flex-1">
          <div className="text-center p-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-base font-display font-bold text-primary">{actionedCount}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Forbedret</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-chart-warning/5 border border-chart-warning/20">
            <p className="text-base font-display font-bold text-chart-warning">{pendingCount}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Afventer</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-destructive/5 border border-destructive/20">
            <p className="text-base font-display font-bold text-destructive">{regressedCount}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Forværret</p>
          </div>
        </div>
      </div>

      {/* Top pending/regressed items */}
      {topPending.length > 0 && (
        <div className="space-y-2 mb-3">
          {topPending.map((item) => {
            const cfg = statusConfig[item.status];
            const Icon = cfg.icon;
            return (
              <div key={item.id} className="flex items-start gap-2">
                <div className={`p-1 rounded ${cfg.bg} flex-shrink-0 mt-0.5`}>
                  <Icon className={`h-3 w-3 ${cfg.color}`} />
                </div>
                <p className="text-xs text-foreground leading-snug line-clamp-2">{item.recommendation}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* See all dialog */}
      <Dialog>
        <DialogTrigger asChild>
          <button className="w-full text-xs font-medium text-primary hover:text-primary/80 transition-colors py-1.5">
            Se alle {items.length} anbefalinger →
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              AI Progress — alle anbefalinger
            </DialogTitle>
          </DialogHeader>

          <Tabs value={dialogTab} onValueChange={(v) => setDialogTab(v as any)} className="mt-2">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="pending">Afventer ({pendingCount})</TabsTrigger>
              <TabsTrigger value="improved">Forbedret ({actionedCount})</TabsTrigger>
              <TabsTrigger value="regressed">Forværret ({regressedCount})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-3 mt-4">
            {dialogItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Ingen anbefalinger i denne kategori.</p>
            ) : (
              dialogItems.map((item) => {
                const cfg = statusConfig[item.status];
                const Icon = cfg.icon;
                return (
                  <div key={item.id} className="p-3 rounded-lg border border-border/50 bg-card">
                    <div className="flex items-start gap-2.5">
                      <div className={`p-1.5 rounded-lg ${cfg.bg} flex-shrink-0 mt-0.5`}>
                        <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug">{item.recommendation}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">{item.fromReport}</span>
                        </div>
                        {item.aiComment && (
                          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{item.aiComment}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AIProgressWidget;
