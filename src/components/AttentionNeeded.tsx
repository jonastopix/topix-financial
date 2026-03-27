import { useState } from "react";
import {
  AlertTriangle, Clock, MessageSquare, FileText, Target, ChevronRight, X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { DANISH_MONTHS, getEffectiveReportPeriodKey, REPORT_OVERRIDE_SELECT, type ReportData } from "@/lib/financialUtils";

interface AttentionItem {
  id: string;
  type: "report" | "milestone" | "chat";
  title: string;
  description: string;
  urgency: "high" | "medium" | "low";
  action: string;
  link: string;
  daysLeft?: number;
}

const typeConfig = {
  report: { icon: FileText, color: "text-destructive", bg: "bg-destructive/10" },
  milestone: { icon: Target, color: "text-chart-warning", bg: "bg-chart-warning/10" },
  chat: { icon: MessageSquare, color: "text-chart-info", bg: "bg-chart-info/10" },
};

const urgencyBorder = {
  high: "border-l-destructive",
  medium: "border-l-chart-warning",
  low: "border-l-muted",
};

const AttentionNeeded = () => {
  const { user, companyId } = useAuth();
  const { meetings } = useAppConfig();

  const { data: items = [] } = useQuery({
    queryKey: ["attention-needed", companyId, user?.id, meetings.next_meeting_date],
    queryFn: async () => {
      const attentionItems: AttentionItem[] = [];
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const prevKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;

      const { data: reports } = await (supabase
        .from("financial_reports")
        .select(`report_period, ${REPORT_OVERRIDE_SELECT}`) as any)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("status", "processed");

      const reportKeys = new Set(
        (reports || [])
          .map((r: any) => getEffectiveReportPeriodKey(r as ReportData))
          .filter(Boolean)
      );

      if (!reportKeys.has(prevKey)) {
        const daysSinceMonthEnd = now.getDate();
        attentionItems.push({
          id: "missing-report",
          type: "report",
          title: `${DANISH_MONTHS[prevMonth]}-rapport mangler`,
          description: `Upload din saldobalance for ${DANISH_MONTHS[prevMonth]} ${prevYear}`,
          urgency: daysSinceMonthEnd >= 15 ? "high" : "medium",
          action: "Upload nu",
          link: "/reports",
          daysLeft: daysSinceMonthEnd,
        });
      }

      const { data: milestones } = await (supabase
        .from("milestones")
        .select("id, title, deadline, progress") as any)
        .eq("company_id", companyId!)
        .lt("progress", 100)
        .not("deadline", "is", null);

      (milestones || []).forEach(ms => {
        if (!ms.deadline) return;
        const deadlineDate = new Date(ms.deadline);
        const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 14 && daysLeft > 0) {
          attentionItems.push({
            id: `ms-${ms.id}`,
            type: "milestone",
            title: "Milestone deadline nærmer sig",
            description: `"${ms.title}" – deadline ${ms.deadline}`,
            urgency: daysLeft <= 3 ? "high" : "medium",
            action: "Se status",
            link: "/milestones",
            daysLeft,
          });
        }
      });

      let convQuery = supabase
        .from("conversations")
        .select("id");
      if (companyId) {
        convQuery = convQuery.eq("company_id", companyId);
      } else {
        convQuery = convQuery.eq("member_id", user!.id);
      }
      const { data: conv } = await convQuery.maybeSingle();

      if (conv?.id) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .neq("sender_id", user!.id)
          .is("read_at", null)
          .eq("message_type", "user");

        if (count && count > 0) {
          attentionItems.push({
            id: "unread-messages",
            type: "chat",
            title: `${count} ulæst${count > 1 ? "e" : ""} besked${count > 1 ? "er" : ""}`,
            description: "Du har ubesvaret kommunikation fra dine rådgivere",
            urgency: count >= 3 ? "high" : "medium",
            action: "Læs beskeder",
            link: "/chat",
          });
        }
      }

      // Check: Upcoming board meeting — use admin-configured date if available
      const meetingDate = meetings.next_meeting_date
        ? new Date(meetings.next_meeting_date)
        : null;
      if (meetingDate) {
        const daysUntilMeeting = Math.ceil(
          (meetingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntilMeeting <= 7 && daysUntilMeeting > 0) {
          attentionItems.push({
            id: "upcoming-meeting",
            type: "milestone",
            title: "Boardroom-session nærmer sig",
            description: `${daysUntilMeeting} dag${daysUntilMeeting > 1 ? "e" : ""} til næste møde — opdater dine milestones`,
            urgency: daysUntilMeeting <= 2 ? "high" : "medium",
            action: "Forbered mig",
            link: "/milestones",
            daysLeft: daysUntilMeeting,
          });
        }
      }


      // Check: no pulse check-in this month
      if (companyId) {
        const now2 = new Date();
        const pk = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}`;
        const dayOfMonth = now2.getDate();
        if (dayOfMonth >= 10) {
          const { data: pulse } = await (supabase
            .from("pulse_checkins" as any)
            .select("id")
            .eq("company_id", companyId)
            .eq("period_key", pk)
            .maybeSingle() as any);
          if (!pulse) {
            attentionItems.push({
              id: "pulse-checkin",
              type: "chat",
              title: "Månedlig pulse — 2 minutter",
              description: "Fortæl os hvad der gik godt og hvad der er din største udfordring",
              urgency: "low",
              action: "Udfyld nu",
              link: "/pulse",
            });
          }
        }
      }

      return attentionItems;
    },
    enabled: !!user && !!companyId,
    staleTime: 3 * 60 * 1000,
  });

  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("attention-dismissed");
      if (!raw) return new Set();
      const parsed: { id: string; until: number }[] = JSON.parse(raw);
      const now = Date.now();
      return new Set(parsed.filter(d => d.until > now).map(d => d.id));
    } catch { return new Set(); }
  });

  const dismissItem = (id: string) => {
    const now = new Date();
    const until = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const existing: { id: string; until: number }[] = (() => {
      try { return JSON.parse(localStorage.getItem("attention-dismissed") || "[]"); }
      catch { return []; }
    })();
    const updated = [
      ...existing.filter(d => d.id !== id && d.until > Date.now()),
      { id, until },
    ];
    localStorage.setItem("attention-dismissed", JSON.stringify(updated));
    setDismissed(prev => new Set([...prev, id]));
  };

  const visibleItems = items.filter(item => !dismissed.has(item.id));

  if (visibleItems.length === 0) return null;

  const highCount = visibleItems.filter((i) => i.urgency === "high").length;

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
        {visibleItems.map((item) => {
          const config = typeConfig[item.type];
          const Icon = config.icon;
          return (
            <div key={item.id} className="flex items-center gap-1">
              <Link
                to={item.link}
                className={`flex-1 flex items-start gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors border-l-[3px] ${urgencyBorder[item.urgency]} group`}
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
                      <Clock className="h-3 w-3" />{item.daysLeft}d
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
              <button
                onClick={(e) => { e.preventDefault(); dismissItem(item.id); }}
                className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary transition-colors shrink-0 ml-1"
                title="Skjul til næste måned"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AttentionNeeded;
