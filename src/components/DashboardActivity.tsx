import { MessageSquare, FileText, Target, Sparkles, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { getEffectiveReportPeriod, type ReportData } from "@/lib/financialUtils";

const typeConfig = {
  message: { icon: MessageSquare, color: "text-chart-info", bg: "bg-chart-info/10", action: "Læs besked" },
  report: { icon: FileText, color: "text-primary", bg: "bg-primary/10", action: "Se rapport" },
  milestone: { icon: Target, color: "text-chart-warning", bg: "bg-chart-warning/10", action: "Se milestone" },
  system: { icon: Sparkles, color: "text-primary", bg: "bg-primary/10", action: "Se analyse" },
};

interface ActivityEvent {
  id: string;
  type: keyof typeof typeConfig;
  description: string;
  timestamp: string;
  link?: string;
}

const DashboardActivity = () => {
  const { user, companyId } = useAuth();

  const { data: events = [] } = useQuery({
    queryKey: ["dashboard-activity", companyId],
    queryFn: async () => {
      const activity: ActivityEvent[] = [];

      const { data: reports } = await supabase
        .from("financial_reports")
        .select("id, report_period, uploaded_at, manual_report_period_label, manual_override_status")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false })
        .limit(2);

      (reports || []).forEach(r => {
        const effectivePeriod = getEffectiveReportPeriod(r as unknown as ReportData);
        activity.push({
          id: `r-${r.id}`,
          type: "report",
          description: `Rapport: ${effectivePeriod || "ukendt"}`,
          timestamp: r.uploaded_at,
          link: "/reports",
        });
      });

      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .eq("company_id", companyId!)
        .limit(1);

      const convId = convs?.[0]?.id;
      if (convId) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("id, content, created_at, message_type")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(2);

        (msgs || []).forEach(m => {
          activity.push({
            id: `m-${m.id}`,
            type: m.message_type === "system" || m.message_type === "ai" ? "system" : "message",
            description: m.content.slice(0, 60) + (m.content.length > 60 ? "…" : ""),
            timestamp: m.created_at,
            link: "/chat",
          });
        });
      }

      const { data: milestones } = await supabase
        .from("milestones")
        .select("id, title, progress, updated_at")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false })
        .limit(2);

      (milestones || []).forEach(ms => {
        activity.push({
          id: `ms-${ms.id}`,
          type: "milestone",
          description: `${ms.progress >= 100 ? "✅" : "🎯"} ${ms.title}`,
          timestamp: ms.updated_at,
          link: "/milestones",
        });
      });

      activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return activity.slice(0, 5);
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-foreground text-sm">Hvad skete der senest</h3>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Ingen aktivitet endnu</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
          {events.map(event => {
            const cfg = typeConfig[event.type];
            const Icon = cfg.icon;

            const card = (
              <div
                key={event.id}
                className="flex-shrink-0 w-44 p-3 rounded-lg bg-secondary/50 hover:bg-secondary hover:ring-1 hover:ring-primary/20 transition-all border border-border/30"
              >
                <div className={`h-7 w-7 rounded-full ${cfg.bg} flex items-center justify-center mb-2`}>
                  <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                </div>
                <p className="text-xs text-foreground leading-snug line-clamp-2 mb-1.5">{event.description}</p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(event.timestamp), "d. MMM · HH:mm", { locale: da })}
                </p>
                {event.link && (
                  <p className="text-[10px] text-primary mt-1.5 font-medium">{cfg.action} →</p>
                )}
              </div>
            );

            return event.link ? (
              <Link key={event.id} to={event.link} className="flex-shrink-0">
                {card}
              </Link>
            ) : (
              <div key={event.id} className="flex-shrink-0">{card}</div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DashboardActivity;
