import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import {
  Sparkles, AlertTriangle, FileText, Target, MessageSquare,
  Clock, CheckCircle2, Circle, X, Plus, ChevronRight, ChevronDown, Info,
} from "lucide-react";
import { DANISH_MONTHS, getEffectiveReportPeriodKey, REPORT_OVERRIDE_SELECT, type ReportData } from "@/lib/financialUtils";

// ── Weekly focus ISO week key ──
function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ── Dismiss logic ──
function useDismissed() {
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("attention-dismissed");
      if (!raw) return new Set();
      const parsed: { id: string; until: number }[] = JSON.parse(raw);
      const now = Date.now();
      return new Set(parsed.filter(d => d.until > now).map(d => d.id));
    } catch { return new Set(); }
  });
  const dismiss = (id: string) => {
    const until = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime();
    const existing: { id: string; until: number }[] = (() => {
      try { return JSON.parse(localStorage.getItem("attention-dismissed") || "[]"); }
      catch { return []; }
    })();
    const updated = [...existing.filter(d => d.id !== id && d.until > Date.now()), { id, until }];
    localStorage.setItem("attention-dismissed", JSON.stringify(updated));
    setDismissed(prev => new Set([...prev, id]));
  };
  return { dismissed, dismiss };
}

interface DashboardActionCenterProps {
  companyId: string;
  hasPulseThisMonth: boolean;
  hasReports: boolean;
  hasMilestoneProgressThisMonth: boolean;
}

export default function DashboardActionCenter({
  companyId,
  hasPulseThisMonth,
  hasReports,
  hasMilestoneProgressThisMonth,
}: DashboardActionCenterProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { dismissed, dismiss } = useDismissed();
  const weekKey = getISOWeekKey(new Date());
  const seenMarked = useRef(false);
  const [showAllActions, setShowAllActions] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // ── Weekly focus ──
  const { data: weeklyFocus } = useQuery({
    queryKey: ["weekly-focus", companyId, weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_focus")
        .select("*")
        .eq("company_id", companyId)
        .eq("week_key", weekKey)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const markSeen = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("weekly_focus").update({ seen_at: new Date().toISOString() } as any).eq("id", id);
    },
  });

  useEffect(() => {
    if (weeklyFocus && !weeklyFocus.seen_at && !seenMarked.current) {
      seenMarked.current = true;
      markSeen.mutate(weeklyFocus.id);
    }
  }, [weeklyFocus]);

  // ── Attention items ──
  const { data: attentionItems = [] } = useQuery({
    queryKey: ["attention-needed", companyId, user?.id],
    queryFn: async () => {
      const items: { id: string; type: "report" | "milestone" | "chat" | "pulse" | "info"; title: string; description: string; urgency: "high" | "medium" | "low"; link: string; daysLeft?: number }[] = [];
      const now = new Date();
      const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const prevKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;

      const { data: reports } = await (supabase.from("financial_reports").select(`report_period, ${REPORT_OVERRIDE_SELECT}`) as any)
        .eq("company_id", companyId).is("deleted_at", null).eq("status", "processed");

      const reportKeys = new Set((reports || []).map((r: any) => getEffectiveReportPeriodKey(r as ReportData)).filter(Boolean));
      if (!reportKeys.has(prevKey)) {
        const daysSince = now.getDate();
        items.push({ id: "missing-report", type: "report", title: `${DANISH_MONTHS[prevMonth]}-rapport mangler`, description: `Upload din saldobalance for ${DANISH_MONTHS[prevMonth]} ${prevYear}`, urgency: daysSince >= 15 ? "high" : "medium", link: "/reports", daysLeft: daysSince });
      }

      const { data: milestones } = await (supabase.from("milestones").select("id, title, deadline, progress") as any)
        .eq("company_id", companyId).lt("progress", 100).not("deadline", "is", null);
      (milestones || []).forEach((ms: any) => {
        const daysLeft = Math.ceil((new Date(ms.deadline).getTime() - now.getTime()) / 86400000);
        if (daysLeft <= 14 && daysLeft > 0) {
          items.push({ id: `ms-${ms.id}`, type: "milestone", title: "Milestone deadline nærmer sig", description: `"${ms.title}" – ${new Date(ms.deadline).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}`, urgency: daysLeft <= 3 ? "high" : "medium", link: "/milestones", daysLeft });
        }
      });

      const { data: conv } = await supabase.from("conversations").select("id").eq("company_id", companyId).maybeSingle();
      if (conv?.id) {
        const { count } = await supabase.from("messages").select("*", { count: "exact", head: true })
          .eq("conversation_id", conv.id).neq("sender_id", user!.id).is("read_at", null).eq("message_type", "user");
        if (count && count > 0) {
          items.push({ id: "unread-messages", type: "chat", title: `${count} ulæst${count > 1 ? "e" : ""} besked${count > 1 ? "er" : ""}`, description: "Du har ubesvaret kommunikation fra dine rådgivere", urgency: count >= 3 ? "high" : "medium", link: "/chat" });
        }
      }

      if (!hasPulseThisMonth) {
        items.push({ id: "pulse-checkin", type: "pulse", title: "Månedlig pulse — 2 minutter", description: "Fortæl os hvad der gik godt og hvad der er din største udfordring", urgency: "low", link: "/pulse" });
      }

      if (hasPulseThisMonth) {
        items.push({ id: "pulse-done", type: "pulse", title: "Pulse check-in er sendt ✓", description: "Vil du opdatere dit check-in for denne måned?", urgency: "low", link: "/pulse" });
      }

      // Platform update announcement
      items.push({
        id: "v2026-04-platform-update",
        type: "info",
        title: "Platform opdateret — hvad er nyt",
        description: "Pulse check-in viser nu automatisk dine milestone-fremskridt. Klik på en virksomhed i koncernoverblikket for at dykke direkte ned i dens data. AI-chefen genererer nyt ugesfokus hver mandag.",
        urgency: "low",
        link: "/guide",
      });

      return items;
    },
    enabled: !!user && !!companyId,
    staleTime: 3 * 60_000,
  });

  // ── Company actions ──
  const { data: actions = [] } = useQuery({
    queryKey: ["company-actions", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("company_actions").select("id, title, context, priority, status, created_at")
        .eq("company_id", companyId).eq("status", "open").order("created_at", { ascending: false }).limit(10) as any;
      return ((data || []) as any[]).sort((a: any, b: any) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] ?? 1) - (order[b.priority] ?? 1) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    },
    enabled: !!companyId,
  });

  const updateAction = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      await supabase.from("company_actions").update(updates as any).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-actions", companyId] }),
  });

  const addAction = useMutation({
    mutationFn: async (title: string) => {
      await supabase.from("company_actions").insert({ company_id: companyId, user_id: user!.id, title, source_type: "manual", status: "open", priority: "medium" } as any);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["company-actions", companyId] }); setInputValue(""); setShowInput(false); },
  });

  const visibleAttention = attentionItems.filter(i => !dismissed.has(i.id));
  const visibleActions = showAllActions ? actions : actions.slice(0, 3);
  const weekNumber = weekKey.split("-W")[1]?.replace(/^0/, "") || "";

  const typeIcon: Record<string, typeof FileText> = { report: FileText, milestone: Target, chat: MessageSquare, pulse: Sparkles, info: Info };
  const typeColor: Record<string, string> = { report: "text-destructive", milestone: "text-chart-warning", chat: "text-chart-info", pulse: "text-primary", info: "text-chart-info" };
  const typeBg: Record<string, string> = { report: "bg-destructive/10", milestone: "bg-chart-warning/10", chat: "bg-chart-info/10", pulse: "bg-primary/10", info: "bg-chart-info/10" };
  const urgencyBorder: Record<string, string> = { high: "border-l-destructive", medium: "border-l-chart-warning", low: "border-l-muted" };

  const hasAnything = weeklyFocus || visibleAttention.length > 0 || actions.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="glass-card rounded-xl p-5 mb-6">
      {/* ── Weekly focus header ── */}
      {weeklyFocus && (
        <div className={`${visibleAttention.length > 0 || actions.length > 0 ? "mb-4 pb-4 border-b border-border/40" : ""}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Din AI-chef</p>
                <p className="text-[10px] text-muted-foreground">Uge {weekNumber} · baseret på dine tal</p>
              </div>
            </div>
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug">{weeklyFocus.headline}</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{weeklyFocus.summary}</p>
        </div>
      )}

      {!weeklyFocus && hasReports && (
        <div className="mb-4 pb-4 border-b border-border/40">
          <Link
            to="/chat?tab=ai&q=Hvad+skal+jeg+fokusere+p%C3%A5+denne+uge%3F"
            className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors group"
          >
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Hvad skal jeg fokusere på denne uge?</p>
              <p className="text-xs text-muted-foreground">Spørg din AI-chef om prioriteter</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
          </Link>
        </div>
      )}

      {/* ── Attention items ── */}
      {visibleAttention.length > 0 && (
        <div className={`space-y-2 ${actions.length > 0 ? "mb-4 pb-4 border-b border-border/40" : ""}`}>
          {visibleAttention.map(item => {
            const Icon = typeIcon[item.type] || AlertTriangle;
            return (
              <div key={item.id} className={`flex items-center gap-2 border-l-2 ${urgencyBorder[item.urgency]} pl-3 py-1.5`}>
                <Link to={item.link} className="flex items-center gap-2 flex-1 min-w-0 group">
                  <div className={`p-1.5 rounded-md shrink-0 ${typeBg[item.type]}`}>
                    <Icon className={`h-3.5 w-3.5 ${typeColor[item.type]}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                  </div>
                  {item.daysLeft !== undefined && (
                    <span className="text-[10px] font-semibold text-muted-foreground shrink-0">
                      {item.daysLeft}d
                    </span>
                  )}
                </Link>
                <button onClick={() => dismiss(item.id)} className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary transition-colors shrink-0 ml-1" title="Skjul til næste måned">
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Company actions ── */}
      {actions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {actions.some((a: any) => a.source_type === "ai_weekly") ? "Din AI-chef anbefaler" : "Handlinger"}
          </p>
          <div className="space-y-1.5">
            {visibleActions.map((action: any) => (
              <div key={action.id} className="flex items-start gap-2 group py-1">
                <button onClick={() => updateAction.mutate({ id: action.id, updates: { status: "done", completed_at: new Date().toISOString() } })} className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors">
                  <Circle className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground flex items-center gap-1.5">
                    {action.source_type === "ai_weekly" && (
                      <Sparkles className="h-3 w-3 text-primary/60 shrink-0" />
                    )}
                    {action.priority === "high" && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                    {action.priority === "medium" && action.source_type !== "ai_weekly" && <Clock className="h-3 w-3 text-chart-warning shrink-0" />}
                    {action.title}
                  </p>
                  {action.context && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{action.context}</p>}
                </div>
                <button onClick={() => updateAction.mutate({ id: action.id, updates: { status: "dismissed", dismissed_at: new Date().toISOString() } })} className="p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all" title="Afvis">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {actions.length > 3 && (
            <button onClick={() => setShowAllActions(v => !v)} className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`h-3 w-3 transition-transform ${showAllActions ? "rotate-180" : ""}`} />
              {showAllActions ? "Vis færre" : `${actions.length - 3} flere handlinger`}
            </button>
          )}
        </div>
      )}

      {/* ── Add action ── */}
      {showInput ? (
        <div className="flex items-center gap-2 mt-3">
          <input
            autoFocus
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && inputValue.trim()) { addAction.mutate(inputValue.trim()); } if (e.key === "Escape") { setShowInput(false); setInputValue(""); } }}
            placeholder="Beskriv handling..."
            className="flex-1 text-sm bg-transparent border-b border-border focus:border-primary outline-none py-1 text-foreground placeholder:text-muted-foreground"
          />
          <button onClick={() => { if (inputValue.trim()) addAction.mutate(inputValue.trim()); }} disabled={!inputValue.trim()} className="text-primary hover:text-primary/80 disabled:text-muted-foreground transition-colors">
            <CheckCircle2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button onClick={() => setShowInput(true)} className="flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Plus className="h-3 w-3" /> Tilføj handling
        </button>
      )}
    </div>
  );
}
