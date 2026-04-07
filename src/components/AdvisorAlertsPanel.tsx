import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  TrendingDown, Wallet, AlertTriangle, ChevronRight, CheckCircle2,
  Clock, PauseCircle, Target, MessageSquare, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Alert {
  id: string;
  type: string;
  title: string;
  body: string | null;
  company_id: string;
  company_name: string;
  created_at: string;
  seen_at: string | null;
}

interface MilestoneItem {
  id: string;
  milestoneId: string;
  type: "milestone_overdue" | "milestone_stalled";
  title: string;
  company_id: string;
  company_name: string;
  created_at: string;
}

const TYPE_CONFIG = {
  alert_revenue_drop:    { icon: TrendingDown,  color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  alert_negative_cash:   { icon: Wallet,        color: "text-destructive",                   bg: "bg-destructive/10" },
  alert_result_negative: { icon: AlertTriangle, color: "text-destructive",                   bg: "bg-destructive/10" },
  milestone_overdue:     { icon: Clock,         color: "text-destructive",                   bg: "bg-destructive/10" },
  milestone_stalled:     { icon: PauseCircle,   color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
} as const;

interface AdvisorAlertsPanelProps {
  onCompanyClick: (companyId: string, companyName: string, reason?: string) => void;
}

export default function AdvisorAlertsPanel({ onCompanyClick }: AdvisorAlertsPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [snoozeDays, setSnoozeDays] = useState(14);

  const { data: financialAlerts = [], isLoading } = useQuery({
    queryKey: ["advisor-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-advisor-alerts");
      if (error) throw error;
      return data.alerts as Alert[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: snoozedIds = new Map() } = useQuery({
    queryKey: ["advisor-milestone-actions", user?.id],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data } = await (supabase as any)
        .from("advisor_milestone_actions")
        .select("milestone_id, snoozed_until, note, actioned_by_advisor_id, profiles:actioned_by_advisor_id(full_name)")
        .gt("snoozed_until", now);
      const map = new Map<string, { snoozed_until: string; note: string | null; advisor_name: string | null }>();
      for (const r of data || []) {
        map.set(r.milestone_id, {
          snoozed_until: r.snoozed_until,
          note: r.note,
          advisor_name: (r.profiles as any)?.full_name || null,
        });
      }
      return map;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: milestoneAlerts } = useQuery({
    queryKey: ["advisor-milestone-alerts"],
    queryFn: async () => {
      const now = new Date().toISOString().split("T")[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const [overdueRes, stalledRes] = await Promise.all([
        (supabase.from("milestones")
          .select("id, title, deadline, company_id, companies(name)") as any)
          .lt("deadline", now)
          .lt("progress", 100)
          .neq("status", "parked")
          .neq("status", "completed")
          .not("deadline", "is", null)
          .order("deadline", { ascending: true })
          .limit(20),
        (supabase.from("milestones")
          .select("id, title, updated_at, progress_updated_at, company_id, companies(name)") as any)
          .or(`progress_updated_at.lt.${thirtyDaysAgo},and(progress_updated_at.is.null,updated_at.lt.${thirtyDaysAgo})`)
          .lt("progress", 100)
          .neq("status", "parked")
          .neq("status", "completed")
          .not("deadline", "is", null)
          .order("updated_at", { ascending: true })
          .limit(20),
      ]);
      return {
        overdue: (overdueRes.data || []) as any[],
        stalled: (stalledRes.data || []) as any[],
      };
    },
    staleTime: 5 * 60_000,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ milestoneId }: { milestoneId: string }) => {
      const snoozedUntil = new Date(Date.now() + snoozeDays * 86400000).toISOString();
      const { error } = await (supabase as any)
        .from("advisor_milestone_actions")
        .upsert({
          milestone_id: milestoneId,
          advisor_id: user!.id,
          actioned_by_advisor_id: user!.id,
          actioned_at: new Date().toISOString(),
          snoozed_until: snoozedUntil,
          note: note.trim() || null,
        }, { onConflict: "milestone_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advisor-milestone-actions"] });
      setActioningId(null);
      setNote("");
      setSnoozeDays(14);
    },
  });

  const milestoneItems: MilestoneItem[] = [];
  const seenIds = new Set<string>();

  for (const m of milestoneAlerts?.overdue || []) {
    if (seenIds.has(m.id) || snoozedIds.has(m.id)) continue;
    seenIds.add(m.id);
    milestoneItems.push({
      id: `ms-${m.id}`,
      milestoneId: m.id,
      type: "milestone_overdue",
      title: `Overskredet deadline: ${m.title}`,
      company_id: m.company_id,
      company_name: m.companies?.name || "Ukendt",
      created_at: m.deadline,
    });
  }

  for (const m of milestoneAlerts?.stalled || []) {
    if (seenIds.has(m.id) || snoozedIds.has(m.id)) continue;
    seenIds.add(m.id);
    milestoneItems.push({
      id: `ms-${m.id}`,
      milestoneId: m.id,
      type: "milestone_stalled",
      title: `Ingen aktivitet i 30+ dage: ${m.title}`,
      company_id: m.company_id,
      company_name: m.companies?.name || "Ukendt",
      created_at: m.updated_at,
    });
  }

  if (isLoading) return <div className="h-20 rounded-xl bg-secondary/30 animate-pulse" />;

  return (
    <>
      {/* Finansielle alerts */}
      {financialAlerts.length === 0 ? (
        <div className="rounded-xl border bg-card p-5 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Ingen finansielle alerts</p>
            <p className="text-xs text-muted-foreground">
              Ingen omsætningsfald ≥15%, negativt cash eller negativt resultat de seneste 60 dage.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h2 className="text-sm font-semibold text-foreground">Finansielle alerts</h2>
            </div>
            <span className="text-xs text-muted-foreground">Seneste 60 dage</span>
          </div>

          <div className="space-y-1">
            {financialAlerts.map(alert => {
              const cfg = TYPE_CONFIG[alert.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.alert_result_negative;
              const Icon = cfg.icon;
              return (
                <button
                  key={alert.id}
                  onClick={() => onCompanyClick(alert.company_id, alert.company_name, alert.type)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/60 transition-colors text-left group"
                >
                  <div className={`shrink-0 h-8 w-8 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{alert.company_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{alert.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(alert.created_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}
                      </span>
                      {alert.seen_at ? (
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                          <CheckCircle2 className="h-3 w-3" /> Set
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-500 font-medium">Ikke set</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestone-alerts */}
      {milestoneItems.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-chart-warning" />
              <h2 className="text-sm font-semibold text-foreground">Milestone-alerts</h2>
            </div>
            <span className="text-xs text-muted-foreground">{milestoneItems.length} aktive</span>
          </div>

          <div className="space-y-1">
            {milestoneItems.map(alert => {
              const cfg = TYPE_CONFIG[alert.type];
              const Icon = cfg.icon;
              const isActioning = actioningId === alert.id;

              return (
                <div key={alert.id} className="rounded-lg">
                  <div className="flex items-center gap-3 p-3 hover:bg-secondary/60 transition-colors">
                    <div className={`shrink-0 h-8 w-8 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{alert.company_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{alert.title}</p>
                      <span className="text-[10px] text-muted-foreground mt-1 block">
                        {new Date(alert.created_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onCompanyClick(alert.company_id, alert.company_name, alert.type)}
                        className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-secondary/60 transition-colors"
                        title="Åbn virksomhed"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => {
                          setActioningId(isActioning ? null : alert.id);
                          setNote("");
                          setSnoozeDays(14);
                        }}
                        className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${isActioning ? "bg-primary/10 text-primary" : "hover:bg-secondary/60 text-muted-foreground"}`}
                        title="Kvittér og snooze"
                      >
                        {isActioning ? <X className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {snoozedIds.has(alert.milestoneId) && (() => {
                    const info = snoozedIds.get(alert.milestoneId);
                    return (
                      <div className="px-3 pb-2 flex items-start gap-2 bg-secondary/20 rounded-b-lg">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{info?.advisor_name || "En advisor"}</span>
                          {" kvitterede · snoozer til "}
                          {info?.snoozed_until ? new Date(info.snoozed_until).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : ""}
                          {info?.note && <span className="block mt-0.5 italic">"{info.note}"</span>}
                        </div>
                      </div>
                    );
                  })()}

                  {isActioning && (
                    <div className="px-3 pb-3 space-y-2">
                      <Textarea
                        placeholder="Tilføj en note (valgfrit)..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="text-xs min-h-[60px] resize-none"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">Snooze i</span>
                        {[7, 14, 30].map(d => (
                          <button
                            key={d}
                            onClick={() => setSnoozeDays(d)}
                            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${snoozeDays === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                          >
                            {d} dage
                          </button>
                        ))}
                        <p className="text-[10px] text-muted-foreground">Gælder for alle advisors</p>
                        <Button
                          size="sm"
                          className="ml-auto h-7 text-xs"
                          onClick={() => actionMutation.mutate({ milestoneId: alert.milestoneId })}
                          disabled={actionMutation.isPending}
                        >
                          {actionMutation.isPending ? "Gemmer..." : "Kvittér"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
