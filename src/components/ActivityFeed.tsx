import {
  MessageSquare, FileText, Target, Sparkles, Bell,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { da } from "date-fns/locale";

interface ActivityEvent {
  id: string;
  type: "message" | "report" | "milestone" | "system";
  description: string;
  timestamp: string;
  link?: string;
}

const typeConfig = {
  message: { icon: MessageSquare, color: "text-chart-info" },
  report: { icon: FileText, color: "text-primary" },
  milestone: { icon: Target, color: "text-chart-warning" },
  system: { icon: Sparkles, color: "text-primary" },
};

const ActivityFeed = () => {
  const { user, companyId } = useAuth();

  const { data: events = [] } = useQuery({
    queryKey: ["activity-feed", companyId],
    queryFn: async () => {
      const activity: ActivityEvent[] = [];

      const { data: reports } = await supabase
        .from("financial_reports")
        .select("id, report_period, uploaded_at, status")
        .eq("company_id", companyId!)
        .order("uploaded_at", { ascending: false })
        .limit(3);

      (reports || []).forEach(r => {
        activity.push({
          id: `report-${r.id}`,
          type: "report",
          description: `Rapport uploadet: ${r.report_period || "ukendt periode"}`,
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
          .select("id, content, created_at, message_type, sender_id")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(3);

        (msgs || []).forEach(m => {
          const isSystem = m.message_type === "system" || m.message_type === "ai";
          activity.push({
            id: `msg-${m.id}`,
            type: isSystem ? "system" : "message",
            description: m.content.slice(0, 80) + (m.content.length > 80 ? "..." : ""),
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
          description: `${ms.progress >= 100 ? "✅ Gennemført:" : "🎯"} ${ms.title} (${ms.progress}%)`,
          timestamp: ms.updated_at,
          link: "/milestones",
        });
      });

      activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return activity.slice(0, 6);
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

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
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Ingen aktivitet endnu</p>
        ) : (
          events.map((event) => {
            const config = typeConfig[event.type];
            const Icon = config.icon;

            const content = (
              <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors group cursor-pointer">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-relaxed">{event.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(event.timestamp), "d. MMM · HH:mm", { locale: da })}
                  </p>
                </div>
              </div>
            );

            return event.link ? (
              <Link key={event.id} to={event.link}>{content}</Link>
            ) : (
              <div key={event.id}>{content}</div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
